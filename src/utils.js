import chalk from "chalk";
import Table from "cli-table3";

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
