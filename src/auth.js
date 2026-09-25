import { Client, Hash, Mode, Srp, util } from "@foxt/js-srp";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import chalk from "chalk";
import { input, password as passwordPrompt } from "@inquirer/prompts";

function getDataDir() {
  const appName = "icloud-hme-manager";
  const platform = process.platform;
  let dir;
  if (platform === "win32") {
    dir = path.join(
      process.env.APPDATA ||
        path.join(process.env.USERPROFILE, "AppData", "Roaming"),
      appName,
    );
  } else if (platform === "darwin") {
    dir = path.join(
      process.env.HOME,
      "Library",
      "Application Support",
      appName,
    );
  } else {
    dir = path.join(
      process.env.XDG_CONFIG_HOME || path.join(process.env.HOME, ".config"),
      appName,
    );
  }
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const SESSION_FILE = path.join(getDataDir(), "session.json");
const ENCRYPTION_ALGO = "aes-256-gcm";
const KEY_ITERATIONS = 100000;
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;

const AUTH_BASE = "https://idmsa.apple.com/appleauth/auth";
const SETUP_BASE = "https://setup.icloud.com/setup/ws/1";

const AUTH_HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "X-Apple-OAuth-Client-Id":
    "d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d",
  "X-Apple-OAuth-Client-Type": "firstPartyAuth",
  "X-Apple-OAuth-Redirect-URI": "https://www.icloud.com",
  "X-Apple-OAuth-Require-Grant-Code": "true",
  "X-Apple-OAuth-Response-Mode": "web_message",
  "X-Apple-OAuth-Response-Type": "code",
  "X-Apple-OAuth-State": "",
  "X-Apple-Widget-Key":
    "d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d",
  Origin: "https://www.icloud.com",
  Referer: "https://www.icloud.com/",
};

class GSASRPAuthenticator {
  constructor(username) {
    this.username = username;
    this.srpClient = undefined;
    this.srp = new Srp(Mode.GSA, Hash.SHA256, 2048);
  }

  async derivePassword(protocol, password, salt, iterations) {
    const stringToU8 = (str) => new TextEncoder().encode(str);
    let passHash = new Uint8Array(
      await util.hash(this.srp.h, stringToU8(password)),
    );

    if (protocol === "s2k_fo") {
      passHash = stringToU8(util.toHex(passHash));
    }

    const imported = await crypto.subtle.importKey(
      "raw",
      passHash,
      { name: "PBKDF2" },
      false,
      ["deriveBits"],
    );

    const derived = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: { name: "SHA-256" }, iterations, salt },
      imported,
      256,
    );

    return new Uint8Array(derived);
  }

  async getInit() {
    const stringToU8 = (str) => new TextEncoder().encode(str);

    this.srpClient = await this.srp.newClient(
      stringToU8(this.username),
      new Uint8Array(),
    );

    const a = Buffer.from(util.bytesFromBigint(this.srpClient.A)).toString(
      "base64",
    );

    return {
      a,
      protocols: ["s2k", "s2k_fo"],
      accountName: this.username,
    };
  }

  async getComplete(password, serverData) {
    if (!this.srpClient) throw new Error("Not initialized");
    if (serverData.protocol !== "s2k" && serverData.protocol !== "s2k_fo") {
      throw new Error("Unsupported protocol: " + serverData.protocol);
    }

    const salt = Uint8Array.from(Buffer.from(serverData.salt, "base64"));
    const serverPub = Uint8Array.from(Buffer.from(serverData.b, "base64"));
    const iterations = serverData.iteration;

    const derived = await this.derivePassword(
      serverData.protocol,
      password,
      salt,
      iterations,
    );

    this.srpClient.p = derived;
    await this.srpClient.generate(salt, serverPub);

    const m1 = Buffer.from(this.srpClient._M).toString("base64");
    const M2 = await this.srpClient.generateM2();
    const m2 = Buffer.from(M2).toString("base64");

    return {
      accountName: this.username,
      m1,
      m2,
      c: serverData.c,
    };
  }
}

// Accumulate cookies across all auth requests
let authCookieJar = {};

function collectCookies(res) {
  const setCookies = res.headers.getSetCookie?.() || [];
  for (const cookie of setCookies) {
    const [nameVal] = cookie.split(";");
    const eqIdx = nameVal.indexOf("=");
    if (eqIdx > 0) {
      const name = nameVal.substring(0, eqIdx).trim();
      const value = nameVal.substring(eqIdx + 1).trim();
      authCookieJar[name] = value;
    }
  }
}

function getCookieString() {
  return Object.entries(authCookieJar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function authRequest(url, body, extraHeaders = {}) {
  const res = await fetch(AUTH_BASE + url, {
    method: "POST",
    headers: { ...AUTH_HEADERS, ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });

  collectCookies(res);
  const scnt = res.headers.get("scnt") || "";
  const sessionId = res.headers.get("X-Apple-ID-Session-Id") || "";

  const sessionToken = res.headers.get("X-Apple-Session-Token") || "";

  let data = null;
  try {
    data = await res.json();
  } catch {
    // some responses may not have a body
  }

  return { status: res.status, data, scnt, sessionId, sessionToken };
}

export async function login() {
  const appleId = await input({ message: "Apple ID:" });
  const password = await passwordPrompt({ message: "Password:", mask: "*" });

  console.log("\nLogging in...");
  authCookieJar = {};

  // Step 1: SRP Init
  const authenticator = new GSASRPAuthenticator(appleId);
  const initPayload = await authenticator.getInit();

  const initRes = await authRequest("/signin/init", initPayload);
  if (!initRes.data || !initRes.data.salt) {
    const code = initRes.data?.serviceErrors?.[0]?.code || "UNKNOWN";
    throw new Error("SRP init failed (code: " + code + ")");
  }

  const completePayload = await authenticator.getComplete(
    password,
    initRes.data,
  );
  const completeRes = await authRequest(
    "/signin/complete?isRememberMeEnabled=true",
    { ...completePayload, rememberMe: true, trustTokens: [] },
  );

  let sessionHeaders = {
    scnt: completeRes.scnt || initRes.scnt,
    "X-Apple-ID-Session-Id": completeRes.sessionId || initRes.sessionId,
  };

  // Step 3: Handle 2FA if needed (HTTP 409 or 403)
  if (completeRes.status === 409 || completeRes.status === 403) {
    console.log("  Two-factor authentication required.");
    console.log("  Sending code to your trusted devices...");
    const pushRes = await fetch(AUTH_BASE + "/verify/trusteddevice", {
      method: "GET",
      headers: { ...AUTH_HEADERS, ...sessionHeaders },
    });
    collectCookies(pushRes);

    const code = await input({ message: "Enter 2FA code (6 digits):" });

    const verifyRes = await fetch(
      AUTH_BASE + "/verify/trusteddevice/securitycode",
      {
        method: "POST",
        headers: {
          ...AUTH_HEADERS,
          ...sessionHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ securityCode: { code: code.trim() } }),
      },
    );
    collectCookies(verifyRes);

    if (verifyRes.status === 409) {
      const body = await verifyRes.text();
      let data = {};
      try { data = JSON.parse(body); } catch {}
      if (data.securityCode?.valid !== true) {
        throw new Error("2FA verification failed (HTTP 409)");
      }
    } else if (verifyRes.status !== 204 && verifyRes.status !== 200) {
      throw new Error(
        "2FA verification failed (HTTP " + verifyRes.status + ")",
      );
    }

    // Update scnt from verify response
    const newScnt = verifyRes.headers.get("scnt");
    const newSessionId = verifyRes.headers.get("X-Apple-ID-Session-Id");
    if (newScnt) sessionHeaders.scnt = newScnt;
    if (newSessionId) sessionHeaders["X-Apple-ID-Session-Id"] = newSessionId;

    const trustRes = await authRequest("/2sv/trust", null, sessionHeaders);
    // Capture session token from trust response if available
    if (trustRes.sessionToken) completeRes.sessionToken = trustRes.sessionToken;
  } else if (completeRes.status !== 200) {
    const msg =
      completeRes.data?.serviceErrors?.[0]?.message || "Unknown error";
    throw new Error(
      "Authentication failed (HTTP " + completeRes.status + "): " + msg,
    );
  }

  const dsWebAuthToken = completeRes.sessionToken || "";
  const authCookies = getCookieString();

  const accountLoginRes = await fetch(SETUP_BASE + "/accountLogin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://www.icloud.com",
      Referer: "https://www.icloud.com/",
      Cookie: authCookies,
    },
    body: JSON.stringify({
      dsWebAuthToken,
      extended_login: true,
    }),
  });

  collectCookies(accountLoginRes);
  const accountData = await accountLoginRes.json();

  if (!accountData.dsInfo) {
    const msg = accountData.error || "Invalid session";
    throw new Error("Account login failed: " + msg);
  }

  // Extract needed data
  const dsid = String(accountData.dsInfo.dsid);
  const webservices = accountData.webservices || {};
  const mailDomainUrl = webservices.premiummailsettings?.url || "";

  // Merge all cookies (auth flow + account login)
  const cookieStr = getCookieString();

  const session = {
    dsid,
    baseUrl: mailDomainUrl.replace("/v1", ""),
    cookies: cookieStr,
    webservices,
    timestamp: Date.now(),
  };

  console.log("Login successful.\n");
  return session;
}

function deriveKey(passphrase, salt) {
  return crypto.pbkdf2Sync(
    passphrase,
    salt,
    KEY_ITERATIONS,
    KEY_LENGTH,
    "sha256",
  );
}

function encryptSession(session, passphrase) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, key, iv);
  const plaintext = JSON.stringify(session);
  let encrypted = cipher.update(plaintext, "utf-8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: encrypted,
  });
}

function decryptSession(fileContent, passphrase) {
  const { salt, iv, tag, data } = JSON.parse(fileContent);
  const key = deriveKey(passphrase, Buffer.from(salt, "hex"));
  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGO,
    key,
    Buffer.from(iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  let decrypted = decipher.update(data, "hex", "utf-8");
  decrypted += decipher.final("utf-8");
  return JSON.parse(decrypted);
}

export function loadSession(passphrase) {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const content = fs.readFileSync(SESSION_FILE, "utf-8");
      return decryptSession(content, passphrase);
    }
  } catch {
    // corrupted or wrong passphrase
  }
  return null;
}

export function saveSession(session, passphrase) {
  const encrypted = encryptSession(session, passphrase);
  fs.writeFileSync(SESSION_FILE, encrypted, "utf-8");
}

export async function getPassphrase() {
  return await passwordPrompt({ message: "Session passphrase:", mask: "*" });
}

export function sessionFileExists() {
  return fs.existsSync(SESSION_FILE);
}

export async function ensureSession() {
  const passphrase = await getPassphrase();
  const fileExists = sessionFileExists();

  let session = loadSession(passphrase);
  if (session && session.cookies && session.dsid) {
    return { session, passphrase };
  }

  if (fileExists) {
    console.log(chalk.yellow("\n  ! Wrong passphrase or corrupted session.\n"));
    const { select } = await import("@inquirer/prompts");
    const action = await select({
      message: "What would you like to do?",
      choices: [
        { name: "Try another passphrase", value: "retry" },
        { name: "Login with Apple ID (new session)", value: "login" },
        { name: "Exit", value: "exit" },
      ],
    });

    if (action === "retry") {
      return await ensureSession();
    } else if (action === "exit") {
      process.exit(0);
    }
  }

  const newSession = await login();
  saveSession(newSession, passphrase);
  return { session: newSession, passphrase };
}
