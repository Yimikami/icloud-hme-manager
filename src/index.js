import { select, input, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import { ensureSession, login, saveSession, getPassphrase } from "./auth.js";
import * as api from "./api.js";
import {
  formatEmailTable,
  formatEmailDetail,
  banner,
  separator,
  success,
  warn,
  info,
  createSpinner,
} from "./utils.js";

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

  console.log();
  success(`Email reserved: ${chalk.white.bold(reserved.hme.hme)}`);
  console.log(chalk.dim(`  ID: ${reserved.hme.anonymousId}`));
}

async function listEmails() {
  separator();
  const result = await withSpinner("Fetching emails...", () =>
    api.list(session),
  );
  const emails = result.hmeEmails || [];

  if (emails.length === 0) {
    warn("No Hide My Email addresses found.");
    return;
  }

  console.log();
  info(`${emails.length} email(s) found`);
  console.log();
  console.log(formatEmailTable(emails));
  console.log(chalk.dim(`  Forward to: ${result.selectedForwardTo || "-"}`));
}

async function getEmailDetail() {
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

  const anonymousId = await select({ message: "Select email:", choices });
  const detail = await withSpinner("Loading details...", () =>
    api.get(session, anonymousId),
  );
  console.log();
  console.log(formatEmailDetail(detail.hme));
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

async function mainMenu() {
  while (true) {
    separator();
    const action = await select({
      message: chalk.bold("What would you like to do?"),
      choices: [
        { name: chalk.cyan("+ Create new email"), value: "create" },
        { name: chalk.white("  List all emails"), value: "list" },
        { name: chalk.white("  View email detail"), value: "detail" },
        { name: chalk.yellow("  Deactivate email"), value: "deactivate" },
        { name: chalk.green("  Reactivate email"), value: "reactivate" },
        { name: chalk.white("  Edit email"), value: "edit" },
        { name: chalk.red("  Delete email"), value: "delete" },
        { name: chalk.magenta("  Update forward-to"), value: "forward" },
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
          await listEmails();
          break;
        case "detail":
          await getEmailDetail();
          break;
        case "deactivate":
          await deactivateEmail();
          break;
        case "reactivate":
          await reactivateEmail();
          break;
        case "edit":
          await editEmail();
          break;
        case "delete":
          await deleteEmailAction();
          break;
        case "forward":
          await updateForwardTo();
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
