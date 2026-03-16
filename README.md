<div align="center">

# iCloud Hide My Email Manager

A fast, secure CLI tool to manage your iCloud+ **Hide My Email** addresses.

> **Want autofill in the browser?** Check out the [Browser Extension](https://github.com/Yimikami/icloud-hme-extension) to generate and autofill Hide My Email addresses into any website.

</div>

<div align="center">

![Demo](assets/demo.gif)

</div>

---

## Features

- **Interactive TUI list** &mdash; Real-time search, arrow key navigation, and inline detail view
- **Full alias management** &mdash; Create, edit, deactivate, reactivate, and delete aliases
- **Bulk operations** &mdash; Deactivate or delete multiple aliases at once
- **Export** &mdash; Save all aliases to CSV or JSON
- **Clipboard support** &mdash; Copy an alias address with a single keypress
- **Apple SRP authentication** &mdash; Secure login with 2FA support
- **Encrypted sessions** &mdash; Session data is AES-256-GCM encrypted on disk
- **Standalone executable** &mdash; No runtime required, just download and run
- **Cross-platform** &mdash; Windows, macOS, and Linux

## How to Use

### Download (Recommended)

Grab the latest executable for your platform from [**Releases**](https://github.com/Yimikami/icloud-hme-manager/releases):

| Platform | File                 |
| -------- | -------------------- |
| Windows  | `icloud-hme-win.exe` |
| macOS    | `icloud-hme-macos`   |
| Linux    | `icloud-hme-linux`   |

No Node.js or any other dependency required &mdash; just download and run.

### Run from Source (Alternative)

If you prefer to run from source:

```bash
git clone https://github.com/Yimikami/icloud-hme-manager.git
cd icloud-hme-manager
npm install
npm start
```

> **Requirements (source only):** Node.js 18+ and an active iCloud+ subscription.

### First Launch

On first run the app will ask you for three things:

1. **Session passphrase** &mdash; a password you choose to encrypt your session locally
2. **Apple ID & password** &mdash; used once for authentication
3. **2FA code** &mdash; sent as a push notification to your trusted Apple devices

After the initial login your session is cached and encrypted. You only need to enter your **session passphrase** to get back in.

### How Session Passphrase Works

The session passphrase is a password **you choose** on first run. It encrypts your iCloud session data (cookies, tokens) on disk using AES-256-GCM. Think of it as a master password for the app.

- **First run:** Pick any passphrase &rarr; login with Apple ID &rarr; session encrypted
- **Next runs:** Enter the same passphrase &rarr; session decrypted &rarr; no login needed
- **Wrong passphrase:** Session can't be decrypted &rarr; option to retry or login again
- **Session expired:** Re-authentication with Apple ID required

Session data is stored in your OS data directory:

| OS      | Path                                                            |
| ------- | --------------------------------------------------------------- |
| Windows | `%APPDATA%\icloud-hme-manager\session.json`                     |
| macOS   | `~/Library/Application Support/icloud-hme-manager/session.json` |
| Linux   | `~/.config/icloud-hme-manager/session.json`                     |

### Menu

| Option                | Description                                            |
| --------------------- | ------------------------------------------------------ |
| **Create new email**  | Generate a random alias and reserve it                 |
| **List all emails**   | Interactive TUI — search, navigate, and manage aliases |
| **Delete email**      | Permanently remove an alias                            |
| **Bulk deactivate**   | Deactivate multiple aliases at once                    |
| **Bulk delete**       | Delete multiple aliases at once                        |
| **Update forward-to** | Change which address aliases forward to                |
| **Export emails**     | Save all aliases to a CSV or JSON file                 |
| **Re-login**          | Force a fresh authentication session                   |

### List View — Keyboard Shortcuts

| Key   | Action                      |
| ----- | --------------------------- |
| Type  | Filter aliases in real time |
| ↑ / ↓ | Navigate rows               |
| Enter | Open detail view            |
| Esc   | Back to main menu           |

### Detail View — Keyboard Shortcuts

| Key | Action                               |
| --- | ------------------------------------ |
| C   | Copy email address to clipboard      |
| E   | Edit label or note                   |
| I   | Deactivate alias                     |
| A   | Activate alias                       |
| D   | Delete alias (asks for confirmation) |
| Esc | Back to list                         |

## How It Works

```
Apple ID + Password
        |
   SRP Protocol  ──>  idmsa.apple.com
        |
   2FA Push      ──>  Trusted Device
        |
   Session Token ──>  setup.icloud.com/accountLogin
        |
   HME API       ──>  maildomainws.icloud.com
```

1. **SRP handshake** via `@foxt/js-srp` &mdash; password never leaves your machine in plaintext
2. **2FA verification** pushed to your trusted Apple devices
3. **Session cookies** encrypted with AES-256-GCM using your passphrase
4. **API calls** to iCloud's `maildomainws` service for alias management

## Security

| Concern               | Mitigation                                               |
| --------------------- | -------------------------------------------------------- |
| Credential storage    | Never written to disk; entered interactively every login |
| Session persistence   | AES-256-GCM encrypted with a user-provided passphrase    |
| Error message leakage | API/auth errors are sanitized; no PII in console output  |
| OAuth client key      | Apple's own public web client key; safe to use           |

## Related Projects

- [**icloud-hme-extension**](https://github.com/Yimikami/icloud-hme-extension) &mdash; Browser extension to generate and autofill iCloud+ Hide My Email addresses into any website

## License

[MIT](LICENSE)
