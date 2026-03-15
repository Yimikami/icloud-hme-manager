import chalk from "chalk";
import Table from "cli-table3";

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
      chalk.cyan.bold("       │"),
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

    const created = email.createTimestamp
      ? new Date(email.createTimestamp).toLocaleString("tr-TR")
      : "-";

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

  const created = email.createTimestamp
    ? new Date(email.createTimestamp).toLocaleString("tr-TR")
    : "-";

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
