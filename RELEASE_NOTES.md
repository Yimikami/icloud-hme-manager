# iCloud Hide My Email Manager v1.1.0

## What's New

### Interactive Email List (TUI)

"List all emails" is now a full terminal UI experience:

- **Real-time search** — filter by email address or label as you type; the table updates instantly
- **Arrow key navigation** — move between rows with ↑↓, the selected row is highlighted
- **Enter to view detail** — opens the detail screen for the selected alias
- **Esc to go back** — returns to the main menu

### Email Detail Screen

All alias actions are now available directly from the detail view via keyboard shortcuts:

- **C** — copy email address to clipboard
- **E** — edit label or note (includes a "Clear note" option)
- **I / A** — deactivate or activate the alias (key changes based on current status)
- **D** — permanently delete (confirmation required)
- **Esc** — return to the list

### New Features

- **Statistics panel** — total, active, and inactive alias counts are shown at the top of the main menu on every visit
- **Bulk operations** — deactivate or delete multiple aliases at once using checkbox selection
- **Export** — save all aliases to a CSV or JSON file
- **Clipboard shortcut** — press C after creating an alias to copy it instantly

### Menu Cleanup

Actions already available in the detail view (edit, deactivate, reactivate) have been removed as standalone menu entries, keeping the main menu minimal.