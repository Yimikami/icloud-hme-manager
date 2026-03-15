<div align="center">

# iCloud Hide My Email Manager

A fast, secure CLI tool to manage your iCloud+ **Hide My Email** addresses.

</div>

---

## Features

- **Full CRUD** &mdash; Create, list, view, deactivate, reactivate, and delete aliases
- **Apple SRP authentication** &mdash; Secure login with 2FA support
- **Encrypted sessions** &mdash; Session data is AES-256-GCM encrypted on disk

## Quick Start

```bash
git clone https://github.com/Yimikami/icloud-hme-manager.git
cd icloud-hme-manager
npm install
npm start
```

> **Requirements:** Node.js 18+ and an active iCloud+ subscription.

## Usage

On first launch you will be asked for:

1. **Session passphrase** &mdash; encrypts `session.json` locally (This will be your password for subsequent runs)
2. **Apple ID & password** &mdash; used once for SRP authentication
3. **2FA code** &mdash; pushed to your trusted Apple devices

After login the session is cached. Subsequent runs only need the passphrase.

### Commands

| Command              | Description                                    |
| -------------------- | ---------------------------------------------- |
| **Create new email** | Generate a random alias and reserve it         |
| **List all emails**  | Display all aliases in a formatted table       |
| **View detail**      | Inspect a specific alias                       |
| **Deactivate**       | Pause forwarding for an alias                  |
| **Reactivate**       | Resume forwarding for a paused alias           |
| **Delete**           | Permanently remove an alias (auto-deactivates) |
| **Re-login**         | Force a fresh authentication session           |

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

## Tech Stack

- **Runtime** &mdash; Node.js 18+
- **Auth** &mdash; `@foxt/js-srp` (Apple SRP)
- **CLI** &mdash; `@inquirer/prompts`, `ora`, `chalk`, `cli-table3`
- **Crypto** &mdash; Node.js built-in `crypto` (AES-256-GCM, PBKDF2)

## License

MIT
