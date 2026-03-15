import chalk from "chalk";
import { input, select, confirm } from "@inquirer/prompts";
import * as api from "./api.js";
import { copyToClipboard } from "./utils.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const COL_IDX    = 3;
const COL_EMAIL  = 36;
const COL_LABEL  = 22;
const COL_STATUS = 10;
const COL_DATE   = 12;
const TOTAL_W    = COL_IDX + COL_EMAIL + COL_LABEL + COL_STATUS + COL_DATE + 10;

// ── Helpers ───────────────────────────────────────────────────────────────────

function trunc(str, len) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len - 1) + "…" : str;
}

function formatDate(ts) {
  if (!ts) return "─";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function formatDateFull(ts) {
  if (!ts) return "─";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function dim(s) { return chalk.dim(s); }
function hr() { return "  " + dim("─".repeat(TOTAL_W)); }

// ── Raw mode ──────────────────────────────────────────────────────────────────

function startRaw(handler) {
  try {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", handler);
  } catch {}
}

function stopRaw(handler) {
  try {
    process.stdin.setRawMode(false);
  } catch {}
  process.stdin.pause();
  process.stdin.removeListener("data", handler);
}

const SHOW_CURSOR = "\x1b[?25h";
const HIDE_CURSOR = "\x1b[?25l";
const CLEAR       = "\x1b[2J\x1b[H";

function write(s) { process.stdout.write(s); }
function clear()  { write(CLEAR); }

// ── List row renderer ─────────────────────────────────────────────────────────

function renderRow(email, idx, selected) {
  const n      = String(idx + 1).padEnd(COL_IDX);
  const addr   = trunc(email.hme, COL_EMAIL).padEnd(COL_EMAIL);
  const label  = trunc(email.label || "─", COL_LABEL).padEnd(COL_LABEL);
  const status = (email.isActive ? "active" : "inactive").padEnd(COL_STATUS);
  const date   = formatDate(email.createTimestamp).padEnd(COL_DATE);

  if (selected) {
    const bg = (s) => chalk.bgBlue.bold.white(s);
    const st = email.isActive ? chalk.bgBlue.green(status) : chalk.bgBlue.red(status);
    write("  " + bg(n) + "  " + bg(addr) + "  " + bg(label) + "  " + st + "  " + chalk.bgBlue.dim(date) + "\n");
  } else {
    const st = email.isActive ? chalk.green(status) : chalk.red(status);
    write("  " + dim(n) + "  " + chalk.white(addr) + "  " + dim(label) + "  " + st + "  " + dim(date) + "\n");
  }
}

// ── List view ─────────────────────────────────────────────────────────────────

function renderList(emails, filtered, selectedIdx, searchTerm, forwardTo) {
  clear();
  write(HIDE_CURSOR);
  write("\n");
  write("  " + dim("Search: ") + chalk.white(searchTerm) + dim("█") + "\n");
  write(hr() + "\n\n");

  // Header
  const h = [
    dim("#".padEnd(COL_IDX)),
    chalk.cyan.bold("Email".padEnd(COL_EMAIL)),
    chalk.cyan.bold("Label".padEnd(COL_LABEL)),
    chalk.cyan.bold("Status".padEnd(COL_STATUS)),
    chalk.cyan.bold("Created".padEnd(COL_DATE)),
  ].join("  ");
  write("  " + h + "\n");
  write(hr() + "\n\n");

  if (filtered.length === 0) {
    write(dim("  No emails match.\n"));
  } else {
    filtered.forEach((e, i) => renderRow(e, i, i === selectedIdx));
  }

  write("\n");
  write(dim(`  ${filtered.length}/${emails.length} email(s)  •  Forward to: ${forwardTo}`) + "\n");
  write("\n");
  write(dim("  ↑↓ Navigate  •  Enter: View detail  •  Esc: Back to menu") + "\n");
}

async function listView(emails, forwardTo) {
  let searchTerm = "";
  let selectedIdx = 0;

  const filter = () => {
    if (!searchTerm) return emails;
    const t = searchTerm.toLowerCase();
    return emails.filter(
      (e) =>
        e.hme.toLowerCase().includes(t) ||
        (e.label || "").toLowerCase().includes(t),
    );
  };

  let filtered = filter();
  renderList(emails, filtered, selectedIdx, searchTerm, forwardTo);

  return new Promise((resolve) => {
    const onKey = (buf) => {
      const k = buf.toString();

      if (k === "\x03") {
        stopRaw(onKey);
        write(SHOW_CURSOR);
        process.exit(0);
      }

      // ESC (alone)
      if (buf.length === 1 && k === "\x1b") {
        stopRaw(onKey);
        write(SHOW_CURSOR + CLEAR);
        resolve(null);
        return;
      }

      // Arrow up
      if (k === "\x1b[A") {
        selectedIdx = Math.max(0, selectedIdx - 1);
        renderList(emails, filtered, selectedIdx, searchTerm, forwardTo);
        return;
      }

      // Arrow down
      if (k === "\x1b[B") {
        selectedIdx = Math.min(filtered.length - 1, selectedIdx + 1);
        renderList(emails, filtered, selectedIdx, searchTerm, forwardTo);
        return;
      }

      // Enter
      if (k === "\r" || k === "\n") {
        if (filtered.length > 0) {
          stopRaw(onKey);
          write(SHOW_CURSOR + CLEAR);
          resolve(filtered[selectedIdx]);
        }
        return;
      }

      // Backspace
      if (k === "\x7f" || k === "\b") {
        searchTerm = searchTerm.slice(0, -1);
        filtered = filter();
        selectedIdx = Math.min(selectedIdx, Math.max(0, filtered.length - 1));
        renderList(emails, filtered, selectedIdx, searchTerm, forwardTo);
        return;
      }

      // Printable char → append to search
      if (k.length === 1 && k >= " ") {
        searchTerm += k;
        filtered = filter();
        selectedIdx = 0;
        renderList(emails, filtered, selectedIdx, searchTerm, forwardTo);
      }
    };

    startRaw(onKey);
  });
}

// ── Detail view ───────────────────────────────────────────────────────────────

function renderDetail(email) {
  clear();
  write(HIDE_CURSOR);
  write("\n");
  write("  " + chalk.cyan.bold("Email Detail") + "\n");
  write(hr() + "\n\n");

  const field = (label, value) =>
    write("  " + chalk.cyan(label.padEnd(14)) + value + "\n");

  const status = email.isActive
    ? chalk.green.bold("Active")
    : chalk.red("Inactive");

  field("Email",      chalk.white.bold(email.hme));
  field("Label",      email.label || dim("─"));
  field("Note",       email.note  || dim("─"));
  field("Status",     status);
  field("Forward To", email.forwardToEmail || dim("─"));
  field("Created",    dim(formatDateFull(email.createTimestamp)));
  field("ID",         dim(email.anonymousId));

  write("\n" + hr() + "\n\n");

  const shortcuts = [
    chalk.cyan("[C]")  + " Copy",
    chalk.white("[E]") + " Edit",
    email.isActive
      ? chalk.yellow("[I]") + " Deactivate"
      : chalk.green("[A]")  + " Activate",
    chalk.red("[D]")   + " Delete",
    dim("[Esc]")       + " Back",
  ].join(dim("  •  "));

  write("  " + shortcuts + "\n");
}

async function detailView(email) {
  renderDetail(email);

  return new Promise((resolve) => {
    const onKey = (buf) => {
      const k = buf.toString();
      const kl = k.toLowerCase();

      if (k === "\x03") {
        stopRaw(onKey);
        write(SHOW_CURSOR);
        process.exit(0);
      }

      if (buf.length === 1 && k === "\x1b") {
        stopRaw(onKey);
        write(SHOW_CURSOR + CLEAR);
        resolve("back");
        return;
      }

      if (kl === "c") {
        copyToClipboard(email.hme).then((ok) => {
          const msg = ok
            ? chalk.green("  ✓ Copied to clipboard")
            : chalk.yellow("  ! Clipboard not available");
          write("\n" + msg + "\n");
          setTimeout(() => renderDetail(email), 900);
        });
        return;
      }

      if (kl === "e") {
        stopRaw(onKey);
        write(SHOW_CURSOR + CLEAR);
        resolve("edit");
        return;
      }

      if (kl === "i" || kl === "a") {
        stopRaw(onKey);
        write(SHOW_CURSOR + CLEAR);
        resolve(email.isActive ? "deactivate" : "activate");
        return;
      }

      if (kl === "d") {
        stopRaw(onKey);
        write(SHOW_CURSOR + CLEAR);
        resolve("delete");
        return;
      }
    };

    startRaw(onKey);
  });
}

// ── Action helpers ────────────────────────────────────────────────────────────

async function doEdit(session, email) {
  write(dim("  Editing: ") + chalk.white(email.hme) + "\n\n");

  const choices = [
    { name: "Label", value: "label" },
    { name: "Note",  value: "note"  },
  ];
  if (email.note) {
    choices.push({ name: chalk.red("Clear note"), value: "clear_note" });
  }
  choices.push({ name: chalk.dim("Cancel"), value: "cancel" });

  const field = await select({ message: "What to edit?", choices });

  if (field === "cancel") return email;

  if (field === "clear_note") {
    await api.updateMetaData(session, email.anonymousId, email.label || "", "");
    return { ...email, note: "" };
  }

  const newVal = await input({
    message: field === "label" ? "New label:" : "New note:",
    default: field === "label" ? (email.label || "") : (email.note || ""),
    validate:
      field === "label"
        ? (v) => v.trim().length > 0 || "Label cannot be empty"
        : undefined,
  });

  await api.updateMetaData(
    session,
    email.anonymousId,
    field === "label" ? newVal : (email.label || ""),
    field === "note"  ? newVal : (email.note  || ""),
  );

  return { ...email, [field]: newVal };
}

async function briefMsg(text) {
  write(text + "\n");
  await new Promise((r) => setTimeout(r, 700));
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runEmailManager(session) {
  write(dim("  Loading emails...\n"));

  let listResult;
  try {
    listResult = await api.list(session);
  } catch (err) {
    write(chalk.red(`\n  Error: ${err.message}\n`));
    await new Promise((r) => setTimeout(r, 1500));
    return;
  }

  let emails = listResult.hmeEmails || [];
  emails.sort((a, b) => Number(b.isActive) - Number(a.isActive));
  const forwardTo = listResult.selectedForwardTo || "─";

  const updateLocal = (updated) => {
    const i = emails.findIndex((e) => e.anonymousId === updated.anonymousId);
    if (i !== -1) emails[i] = updated;
  };

  while (true) {
    const selected = await listView(emails, forwardTo);
    if (!selected) break;

    let current = selected;

    // Detail loop (stay in detail until user presses Esc)
    while (true) {
      const action = await detailView(current);

      if (action === "back") break;

      if (action === "edit") {
        try {
          current = await doEdit(session, current);
          updateLocal(current);
        } catch (err) {
          write(chalk.red(`\n  Error: ${err.message}\n`));
          await new Promise((r) => setTimeout(r, 1500));
        }
        continue;
      }

      if (action === "deactivate") {
        try {
          write(dim("  Deactivating...\n"));
          await api.deactivate(session, current.anonymousId);
          current = { ...current, isActive: false };
          updateLocal(current);
          await briefMsg(chalk.green("  ✓ Deactivated"));
        } catch (err) {
          write(chalk.red(`\n  Error: ${err.message}\n`));
          await new Promise((r) => setTimeout(r, 1500));
        }
        continue;
      }

      if (action === "activate") {
        try {
          write(dim("  Reactivating...\n"));
          await api.reactivate(session, current.anonymousId);
          current = { ...current, isActive: true };
          updateLocal(current);
          await briefMsg(chalk.green("  ✓ Reactivated"));
        } catch (err) {
          write(chalk.red(`\n  Error: ${err.message}\n`));
          await new Promise((r) => setTimeout(r, 1500));
        }
        continue;
      }

      if (action === "delete") {
        try {
          const ok = await confirm({
            message: chalk.red.bold("Permanently delete this email?"),
            default: false,
          });
          if (ok) {
            if (current.isActive) {
              write(dim("  Deactivating first...\n"));
              await api.deactivate(session, current.anonymousId);
            }
            write(dim("  Deleting...\n"));
            await api.deleteEmail(session, current.anonymousId);
            emails = emails.filter((e) => e.anonymousId !== current.anonymousId);
            await briefMsg(chalk.green("  ✓ Deleted"));
            break;
          }
        } catch (err) {
          write(chalk.red(`\n  Error: ${err.message}\n`));
          await new Promise((r) => setTimeout(r, 1500));
        }
        continue;
      }
    }
  }

  write(CLEAR);
}
