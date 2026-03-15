import { select, input, confirm, checkbox } from "@inquirer/prompts";
import chalk from "chalk";
import { ensureSession, login, saveSession } from "./auth.js";
import * as api from "./api.js";
import {
  banner,
  separator,
  success,
  warn,
  info,
  createSpinner,
  promptCopyToClipboard,
  showStats,
  exportToFile,
} from "./utils.js";
import { runEmailManager } from "./tui.js";

process.on("unhandledRejection", (err) => {
  console.error(chalk.red("\n  Unhandled error:"), err.message || err);
});

process.on("uncaughtException", (err) => {
  console.error(chalk.red("\n  Uncaught error:"), err.message || err);
});

let session = null;
let passphrase = null;

async function withSpinner(text, fn) {
  const spinner = createSpinner(text).start();
  try {
    const result = await fn();
    spinner.succeed(text);
    return result;
  } catch (err) {
    spinner.fail(text);
    throw err;
  }
}

async function createEmail() {
  separator();

  const result = await withSpinner("Generating random address...", () =>
    api.generate(session),
  );
  info(`Generated: ${chalk.white.bold(result.hme)}`);

  const label = await input({
    message: "Label:",
    validate: (v) => v.trim().length > 0 || "Label is required",
  });
  const note = await input({ message: "Note (optional):", default: "" });

  const reserved = await withSpinner("Reserving email...", () =>
    api.reserve(session, result.hme, label, note),
  );

  const hme = reserved.hme.hme;
  console.log();
  success(`Email reserved: ${chalk.white.bold(hme)}`);
  console.log(chalk.dim(`  ID: ${reserved.hme.anonymousId}`));
  console.log();
  await promptCopyToClipboard(hme);
}

async function deactivateEmail() {
  const result = await withSpinner("Fetching emails...", () =>
    api.list(session),
  );
  const emails = (result.hmeEmails || []).filter((e) => e.isActive);

  if (emails.length === 0) {
    warn("No active emails to deactivate.");
    return;
  }

  const choices = emails.map((e) => ({
    name: `${e.hme}  ${chalk.dim(e.label || "no label")}`,
    value: e.anonymousId,
  }));

  const anonymousId = await select({
    message: "Select email to deactivate:",
    choices,
  });
  await withSpinner("Deactivating...", () =>
    api.deactivate(session, anonymousId),
  );
  success("Email deactivated.");
}

async function reactivateEmail() {
  const result = await withSpinner("Fetching emails...", () =>
    api.list(session),
  );
  const emails = (result.hmeEmails || []).filter((e) => !e.isActive);

  if (emails.length === 0) {
    warn("No inactive emails to reactivate.");
    return;
  }

  const choices = emails.map((e) => ({
    name: `${e.hme}  ${chalk.dim(e.label || "no label")}`,
    value: e.anonymousId,
  }));

  const anonymousId = await select({
    message: "Select email to reactivate:",
    choices,
  });
  await withSpinner("Reactivating...", () =>
    api.reactivate(session, anonymousId),
  );
  success("Email reactivated.");
}

async function deleteEmailAction() {
  const result = await withSpinner("Fetching emails...", () =>
    api.list(session),
  );
  const emails = result.hmeEmails || [];

  if (emails.length === 0) {
    warn("No emails to delete.");
    return;
  }

  const choices = emails.map((e) => ({
    name: `${e.hme}  ${chalk.dim(e.label || "no label")}  ${e.isActive ? chalk.green("active") : chalk.red("inactive")}`,
    value: e.anonymousId,
  }));

  const anonymousId = await select({
    message: "Select email to delete:",
    choices,
  });

  const ok = await confirm({
    message: chalk.red.bold("Permanently delete this email?"),
    default: false,
  });

  if (!ok) {
    info("Cancelled.");
    return;
  }

  const selected = emails.find((e) => e.anonymousId === anonymousId);
  if (selected && selected.isActive) {
    await withSpinner("Deactivating first...", () =>
      api.deactivate(session, anonymousId),
    );
  }

  await withSpinner("Deleting...", () => api.deleteEmail(session, anonymousId));
  success("Email permanently deleted.");
}

async function updateForwardTo() {
  separator();
  const result = await withSpinner("Fetching current settings...", () =>
    api.list(session),
  );

  const current = result.selectedForwardTo || "-";
  const available = result.forwardToEmails || [];

  info(`Current forward-to: ${chalk.white.bold(current)}`);
  console.log();

  if (available.length === 0) {
    warn("No forward-to emails found on your account.");
    return;
  }

  const choices = available.map((e) => ({
    name: e === current ? `${e}  ${chalk.green("(current)")}` : e,
    value: e,
  }));

  const email = await select({
    message: "Select forward-to email:",
    choices,
  });

  if (email === current) {
    info("Already set to this email.");
    return;
  }

  await withSpinner("Updating forward-to address...", () =>
    api.updateForwardTo(session, email),
  );
  success(`Forward-to updated to: ${chalk.white.bold(email)}`);
}

async function editEmail() {
  const result = await withSpinner("Fetching emails...", () =>
    api.list(session),
  );
  const emails = result.hmeEmails || [];

  if (emails.length === 0) {
    warn("No emails found.");
    return;
  }

  const choices = emails.map((e) => ({
    name: `${e.hme}  ${chalk.dim(e.label || "no label")}  ${e.isActive ? chalk.green("active") : chalk.red("inactive")}`,
    value: e.anonymousId,
  }));

  const anonymousId = await select({
    message: "Select email to edit:",
    choices,
  });
  const selected = emails.find((e) => e.anonymousId === anonymousId);

  info(`Current label: ${chalk.white.bold(selected.label || "-")}`);
  info(`Current note:  ${chalk.white.bold(selected.note || "-")}`);
  console.log();

  const editChoices = [
    { name: "Edit label", value: "label" },
    { name: "Edit note", value: "note" },
  ];
  if (selected.note) {
    editChoices.push({ name: chalk.red("Clear note"), value: "clear_note" });
  }
  editChoices.push({ name: chalk.dim("Back"), value: "back" });

  const action = await select({
    message: "What to edit?",
    choices: editChoices,
  });

  if (action === "back") return;

  let label = selected.label || "";
  let note = selected.note || "";

  if (action === "label") {
    label = await input({
      message: "New label:",
      default: selected.label || "",
      validate: (v) => v.trim().length > 0 || "Label cannot be empty",
    });
  } else if (action === "note") {
    note = await input({
      message: "New note:",
      default: selected.note || "",
    });
  } else if (action === "clear_note") {
    note = "";
  }

  await withSpinner("Updating metadata...", () =>
    api.updateMetaData(session, anonymousId, label, note),
  );
  success(
    action === "clear_note" ? "Note cleared." : "Email metadata updated.",
  );
}

async function bulkDeactivate() {
  separator();
  const result = await withSpinner("Fetching emails...", () =>
    api.list(session),
  );
  const emails = (result.hmeEmails || []).filter((e) => e.isActive);

  if (emails.length === 0) {
    warn("No active emails to deactivate.");
    return;
  }

  const choices = emails.map((e) => ({
    name: `${e.hme}  ${chalk.dim(e.label || "no label")}`,
    value: e.anonymousId,
  }));

  const selected = await checkbox({
    message: "Select emails to deactivate (Space to select, Enter to confirm):",
    choices,
  });

  if (selected.length === 0) {
    info("No emails selected.");
    return;
  }

  const ok = await confirm({
    message: chalk.yellow(`Deactivate ${selected.length} email(s)?`),
    default: false,
  });

  if (!ok) {
    info("Cancelled.");
    return;
  }

  let done = 0;
  for (const id of selected) {
    await withSpinner(
      `Deactivating ${done + 1}/${selected.length}...`,
      () => api.deactivate(session, id),
    );
    done++;
  }

  success(`${done} email(s) deactivated.`);
}

async function bulkDelete() {
  separator();
  const result = await withSpinner("Fetching emails...", () =>
    api.list(session),
  );
  const emails = result.hmeEmails || [];

  if (emails.length === 0) {
    warn("No emails to delete.");
    return;
  }

  const choices = emails.map((e) => ({
    name: `${e.hme}  ${chalk.dim(e.label || "no label")}  ${e.isActive ? chalk.green("active") : chalk.red("inactive")}`,
    value: e.anonymousId,
  }));

  const selected = await checkbox({
    message: "Select emails to delete (Space to select, Enter to confirm):",
    choices,
  });

  if (selected.length === 0) {
    info("No emails selected.");
    return;
  }

  const ok = await confirm({
    message: chalk.red.bold(`Permanently delete ${selected.length} email(s)?`),
    default: false,
  });

  if (!ok) {
    info("Cancelled.");
    return;
  }

  let done = 0;
  for (const id of selected) {
    const email = emails.find((e) => e.anonymousId === id);
    if (email && email.isActive) {
      await withSpinner(
        `Deactivating ${email.hme}...`,
        () => api.deactivate(session, id),
      );
    }
    await withSpinner(
      `Deleting ${done + 1}/${selected.length}...`,
      () => api.deleteEmail(session, id),
    );
    done++;
  }

  success(`${done} email(s) permanently deleted.`);
}

async function exportEmails() {
  separator();
  const result = await withSpinner("Fetching emails...", () =>
    api.list(session),
  );
  const emails = result.hmeEmails || [];

  if (emails.length === 0) {
    warn("No emails to export.");
    return;
  }

  const format = await select({
    message: "Export format:",
    choices: [
      { name: "JSON", value: "json" },
      { name: "CSV", value: "csv" },
    ],
  });

  const filename = exportToFile(emails, format);
  console.log();
  success(`Exported ${emails.length} email(s) to ${chalk.white.bold(filename)}`);
  info(`Saved in: ${chalk.dim(process.cwd())}`);
}

async function mainMenu() {
  while (true) {
    separator();

    try {
      const result = await api.list(session);
      const emails = result.hmeEmails || [];
      showStats(emails);
    } catch {
    }

    const action = await select({
      message: chalk.bold("What would you like to do?"),
      choices: [
        { name: chalk.cyan("+ Create new email"), value: "create" },
        { name: chalk.white("  List all emails"), value: "list" },
        { name: chalk.red("  Delete email"), value: "delete" },
        { name: chalk.yellow("  Bulk deactivate"), value: "bulk_deactivate" },
        { name: chalk.red("  Bulk delete"), value: "bulk_delete" },
        { name: chalk.magenta("  Update forward-to"), value: "forward" },
        { name: chalk.blue("  Export emails"), value: "export" },
        { name: chalk.dim("  Re-login"), value: "relogin" },
        { name: chalk.dim("  Exit"), value: "exit" },
      ],
    });

    try {
      switch (action) {
        case "create":
          await createEmail();
          break;
        case "list":
          await runEmailManager(session);
          break;
        case "delete":
          await deleteEmailAction();
          break;
        case "bulk_deactivate":
          await bulkDeactivate();
          break;
        case "bulk_delete":
          await bulkDelete();
          break;
        case "forward":
          await updateForwardTo();
          break;
        case "export":
          await exportEmails();
          break;
        case "relogin":
          session = await login();
          saveSession(session, passphrase);
          break;
        case "exit":
          console.log(chalk.dim("\nGoodbye.\n"));
          process.exit(0);
      }
    } catch (err) {
      console.error(chalk.red(`\n  Error: ${err.message}\n`));
    }
  }
}

async function main() {
  banner();

  while (!session) {
    try {
      const result = await ensureSession();
      session = result.session;
      passphrase = result.passphrase;
    } catch (err) {
      console.error(chalk.red(`\n  Login failed: ${err.message}\n`));
      const action = await select({
        message: "What would you like to do?",
        choices: [
          { name: "Try again", value: "retry" },
          { name: "Exit", value: "exit" },
        ],
      });
      if (action === "exit") {
        console.log(chalk.dim("\nGoodbye.\n"));
        process.exit(0);
      }
    }
  }

  await mainMenu();
}

main();
