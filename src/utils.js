import chalk from "chalk";
import Table from "cli-table3";
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { resolve } from "path";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function createSpinner(text) {
  let i = 0;
  let interval = null;
  return {
    start() {
      process.stdout.write(`  ${chalk.cyan(SPINNER_FRAMES[0])} ${text}`);
      interval = setInterval(() => {
        i = (i + 1) % SPINNER_FRAMES.length;
        process.stdout.clearLine?.(0);
        process.stdout.cursorTo?.(0);
        process.stdout.write(`  ${chalk.cyan(SPINNER_FRAMES[i])} ${text}`);
      }, 80);
      return this;
    },
    succeed(msg) {
      clearInterval(interval);
      process.stdout.clearLine?.(0);
      process.stdout.cursorTo?.(0);
      console.log(`  ${chalk.green("✓")} ${msg || text}`);
    },
    fail(msg) {
      clearInterval(interval);
      process.stdout.clearLine?.(0);
      process.stdout.cursorTo?.(0);
      console.log(`  ${chalk.red("✗")} ${msg || text}`);
    },
  };
}

function formatDate(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const BORDER_STYLE = {
  top: "─",
  "top-mid": "┬",
  "top-left": "┌",
  "top-right": "┐",
  bottom: "─",
  "bottom-mid": "┴",
  "bottom-left": "└",
  "bottom-right": "┘",
  left: "│",
  "left-mid": "├",
  mid: "─",
  "mid-mid": "┼",
  right: "│",
  "right-mid": "┤",
  middle: "│",
};

export function banner() {
  console.log();
  console.log(chalk.cyan.bold("  ┌─────────────────────────────────────┐"));
  console.log(chalk.cyan.bold("  │   iCloud Hide My Email Manager      │"));
  console.log(
    chalk.cyan.bold("  │   ") +
      chalk.dim("Manage your private emails") +
      chalk.cyan.bold("        │"),
  );
  console.log(chalk.cyan.bold("  └─────────────────────────────────────┘"));
  console.log();
}

export function separator() {
  console.log(chalk.dim("\n  ─────────────────────────────────────\n"));
}

export function success(msg) {
  console.log(chalk.green("  ✓ ") + msg);
}

export function warn(msg) {
  console.log(chalk.yellow("  ! ") + msg);
}

export function info(msg) {
  console.log(chalk.cyan("  i ") + msg);
}

export function formatEmailTable(emails) {
  const table = new Table({
    head: [
      chalk.cyan.bold("#"),
      chalk.cyan.bold("Email"),
      chalk.cyan.bold("Label"),
      chalk.cyan.bold("Status"),
      chalk.cyan.bold("Created"),
    ],
    colWidths: [5, 40, 25, 12, 22],
    chars: BORDER_STYLE,
    style: { head: [], border: ["dim"] },
  });

  emails.forEach((email, i) => {
    const status = email.isActive
      ? chalk.green.bold("Active")
      : chalk.red("Inactive");

    const created = formatDate(email.createTimestamp);

    table.push([
      chalk.dim(i + 1),
      chalk.white(email.hme),
      email.label || chalk.dim("-"),
      status,
      chalk.dim(created),
    ]);
  });

  return table.toString();
}

export function formatEmailDetail(email) {
  const status = email.isActive
    ? chalk.green.bold("Active")
    : chalk.red("Inactive");

  const created = formatDate(email.createTimestamp);

  const table = new Table({
    chars: BORDER_STYLE,
    style: { head: [], border: ["dim"] },
    colWidths: [18, 45],
  });

  table.push(
    { [chalk.cyan.bold("Email")]: chalk.white.bold(email.hme) },
    { [chalk.cyan.bold("ID")]: chalk.dim(email.anonymousId) },
    { [chalk.cyan.bold("Label")]: email.label || chalk.dim("-") },
    { [chalk.cyan.bold("Note")]: email.note || chalk.dim("-") },
    { [chalk.cyan.bold("Status")]: status },
    { [chalk.cyan.bold("Forward To")]: email.forwardToEmail || chalk.dim("-") },
    { [chalk.cyan.bold("Origin")]: chalk.dim(email.origin || "-") },
    { [chalk.cyan.bold("Created")]: chalk.dim(created) },
  );

  return table.toString();
}

export async function copyToClipboard(text) {
  try {
    const clipboardy = await import("clipboardy");
    await clipboardy.default.write(text);
    return true;
  } catch {
    try {
      if (process.platform === "linux") {
        execSync(`echo -n "${text}" | xclip -selection clipboard 2>/dev/null || echo -n "${text}" | xsel --clipboard --input 2>/dev/null`);
        return true;
      }
    } catch {}
    return false;
  }
}

export async function promptCopyToClipboard(text) {
  process.stdout.write(chalk.dim(`  Press C to copy address, any other key to continue...`));

  await new Promise((resolve) => {
    const onData = async (key) => {
      cleanup();
      process.stdout.clearLine?.(0);
      process.stdout.cursorTo?.(0);

      if (key.toString().toLowerCase() === "c") {
        const ok = await copyToClipboard(text);
        if (ok) {
          console.log(chalk.green("  ✓ ") + "Copied to clipboard.");
        } else {
          console.log(chalk.yellow("  ! ") + "Clipboard not available.");
        }
      }
      resolve();
    };

    const cleanup = () => {
      try { process.stdin.setRawMode(false); } catch {}
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
    };

    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.once("data", onData);
    } catch {
      cleanup();
      resolve();
    }
  });
}

export function sortEmails(emails, sortBy) {
  const copy = [...emails];
  switch (sortBy) {
    case "date_desc":
      return copy.sort((a, b) => (b.createTimestamp || 0) - (a.createTimestamp || 0));
    case "date_asc":
      return copy.sort((a, b) => (a.createTimestamp || 0) - (b.createTimestamp || 0));
    case "name_asc":
      return copy.sort((a, b) => a.hme.localeCompare(b.hme));
    case "label_asc":
      return copy.sort((a, b) => (a.label || "").localeCompare(b.label || ""));
    case "status":
      return copy.sort((a, b) => Number(b.isActive) - Number(a.isActive));
    default:
      return copy;
  }
}

export function filterEmails(emails, filter, searchTerm) {
  let result = emails;
  if (filter === "active") result = emails.filter((e) => e.isActive);
  if (filter === "inactive") result = emails.filter((e) => !e.isActive);
  if (filter === "search" && searchTerm) {
    const term = searchTerm.toLowerCase();
    result = emails.filter(
      (e) =>
        e.hme.toLowerCase().includes(term) ||
        (e.label || "").toLowerCase().includes(term) ||
        (e.note || "").toLowerCase().includes(term),
    );
  }
  return result;
}

export function showStats(emails) {
  const total = emails.length;
  const active = emails.filter((e) => e.isActive).length;
  const inactive = total - active;

  console.log();
  const table = new Table({
    chars: BORDER_STYLE,
    style: { head: [], border: ["dim"] },
    colWidths: [22, 12],
  });

  table.push(
    { [chalk.cyan.bold("Total aliases")]: chalk.white.bold(total) },
    { [chalk.cyan.bold("Active")]: chalk.green.bold(active) },
    { [chalk.cyan.bold("Inactive")]: chalk.red(inactive) },
  );

  console.log(table.toString());
}

export function exportToFile(emails, format) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `hme-export-${timestamp}.${format}`;
  const filepath = resolve(process.cwd(), filename);

  if (format === "json") {
    const data = emails.map((e) => ({
      email: e.hme,
      label: e.label || "",
      note: e.note || "",
      status: e.isActive ? "active" : "inactive",
      forwardTo: e.forwardToEmail || "",
      created: e.createTimestamp ? new Date(e.createTimestamp).toISOString() : "",
      id: e.anonymousId,
    }));
    writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
  } else {
    const rows = [
      ["email", "label", "note", "status", "forwardTo", "created", "id"].join(","),
      ...emails.map((e) =>
        [
          e.hme,
          `"${(e.label || "").replace(/"/g, '""')}"`,
          `"${(e.note || "").replace(/"/g, '""')}"`,
          e.isActive ? "active" : "inactive",
          e.forwardToEmail || "",
          e.createTimestamp ? new Date(e.createTimestamp).toISOString() : "",
          e.anonymousId,
        ].join(","),
      ),
    ];
    writeFileSync(filepath, rows.join("\n"), "utf-8");
  }

  return filename;
}
