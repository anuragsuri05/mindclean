// Real-platform end-to-end test of the Mindclean app on an Android emulator (no mocks).
// Without anyone's accounts it verifies, against the real sites:
//  - each platform's real login screen opens inside the app with a login form, and backing out is handled;
//  - the hidden reader correctly reports "needs login" (or public posts / region errors) on each real feed;
//  - Inshorts (no login needed) delivers real stories end to end.
//   node testenv/real-platforms-e2e.mjs [screenshot-dir]
import fs from "node:fs";
import { execSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const OUT = process.argv[2] ?? "testenv/screenshots";
fs.mkdirSync(OUT, { recursive: true });
const ADB = `${process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`}/platform-tools/adb`;
const SITE = process.env.SITE_FROM_DEVICE ?? "http://192.168.1.28:3200";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "✔" : "✖"} ${name}${detail ? " — " + detail : ""}`);
};
const screenshot = (label) => execSync(`${ADB} exec-out screencap -p > "${OUT}/real-${label}.png"`);

const browser = await puppeteer.connect({ browserURL: "http://localhost:9222", defaultViewport: null, protocolTimeout: 240_000 });
const pageFor = async (pred, timeout = 90_000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const t of browser.targets()) if (t.type() === "page" && pred(t.url())) return t.page();
    await wait(1000);
  }
  return null;
};
const main = await pageFor((u) => u.startsWith(SITE));
main.setDefaultNavigationTimeout(180_000); // emulators can be slow
main.setDefaultTimeout(180_000);
const waitText = (re, timeout = 120_000) => main.waitForFunction((src) => new RegExp(src).test(document.body.innerText), { timeout, polling: 1000 }, re.source);
// DOM clicks: on a phone screen fixed bars (e.g. "Continue") can cover a button.
const clickX = async (xp) => {
  const [el] = await main.$$(`xpath/${xp}`);
  if (!el) throw new Error("missing " + xp);
  await el.evaluate((b) => (b.scrollIntoView({ block: "center" }), b.click()));
};
const rowBtn = (name) => `//li[.//div[contains(@class,'font-semibold') and normalize-space(text())='${name}']]//button[contains(.,'Connect') or contains(.,'Use my feed')]`;
const appRequest = (payload, timeout = 200_000) =>
  main.evaluate(
    (payload, timeout) =>
      new Promise((res) => {
        const id = `t${Math.random().toString(36).slice(2)}`;
        const prev = window.__mindcleanWeb.reply;
        window.__mindcleanWeb.reply = (m) => (m.id === id ? ((window.__mindcleanWeb.reply = prev), res(m.reply)) : prev(m));
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "request", id, payload }));
        setTimeout(() => res({ error: "timeout" }), timeout);
      }),
    payload,
    timeout,
  );

// Sign up
await main.evaluate(() => fetch("/api/auth/logout", { method: "POST" }));
await main.goto(`${SITE}/`, { waitUntil: "load" });
await main.waitForSelector("input[name=name]", { timeout: 60_000 });
await main.type("input[name=name]", "Real Platforms Test");
await main.type("input[name=email]", `real${Date.now()}@example.com`);
await main.type("input[name=password]", "password123");
await clickX("//button[normalize-space()='Sign up']");
await waitText(/Your feeds sync from this phone/);
check("Signed up in the app", true);

// 1. Real login screens open in-app
const LOGINS = [
  ["Instagram", /instagram\.com\/accounts\/login/],
  ["LinkedIn", /linkedin\.com\/(login|uas|checkpoint)/],
  ["X", /x\.com\/i\/flow\/login/],
  ["Facebook", /facebook\.com\//],
  ["Threads", /threads\.(com|net)\/login/],
  ["Pinterest", /pinterest\.com\/login/],
  ["TikTok", /tiktok\.com\//], // banned in some regions (e.g. India): the app should say so
  ["YouTube", /accounts\.google\.com/],
];
for (const [name, re] of LOGINS) {
  await clickX(rowBtn(name));
  const sheet = await pageFor((u) => re.test(u), 90_000);
  let detail = sheet ? sheet.url().slice(0, 70) : "no login screen";
  let hasForm = false;
  if (sheet) {
    for (let i = 0; i < 30 && !hasForm; i++) {
      await wait(2000);
      hasForm = await sheet
        .evaluate(() => Boolean(document.querySelector('input[type="password"], input[type="email"], input[name="username"], input[name="session_key"], input[autocomplete*="username"], input[type="text"]')))
        .catch(() => false);
    }
    const blocked = await sheet.evaluate(() => /may not be secure|isn't supported|not supported/i.test(document.body.innerText)).catch(() => false);
    if (blocked) detail += " — the platform blocks sign-in inside apps";
  }
  screenshot(`login-${name.toLowerCase()}`);
  const regionBlocked = sheet && /\/about/.test(sheet.url()) && name === "TikTok";
  if (regionBlocked) {
    const said = await waitText(/TikTok isn't available in your region/, 60_000).then(() => true, () => false);
    check("TikTok: blocked in this region; the app says so and closes the login", said, sheet.url());
    continue;
  }
  // Back closes the login screen; only press it when one is open (on the main screen it would leave the app).
  if (sheet) execSync(`${ADB} shell input keyevent 4`);
  await waitText(new RegExp(`You closed the ${name} login`), 60_000).catch(() => {});
  const connectedByMistake = (await main.evaluate(async () => (await fetch("/api/device/status")).json())).accounts.some((a) => a.platform === name.toLowerCase());
  check(`${name}: real login screen opened in the app${hasForm ? " with a login form" : ""}, nothing connected without logging in`, Boolean(sheet) && hasForm && !connectedByMistake, detail);
}

// 2. Hidden reader on the real sites (logged out)
const EXPECT = {
  instagram: (r) => r.needsLogin,
  linkedin: (r) => r.needsLogin,
  x: (r) => r.needsLogin || r.count === 0,
  facebook: (r) => r.needsLogin,
  pinterest: (r) => r.needsLogin,
  youtube: (r) => r.needsLogin,
  threads: (r) => r.count > 0 || r.needsLogin,
  tiktok: (r) => r.needsLogin || /region/.test(r.error ?? "") || r.count > 0,
  inshorts: (r) => r.count > 0,
};
for (const p of Object.keys(EXPECT)) {
  const r = await appRequest({ type: "probe", platform: p });
  const summary = r.error === "timeout" ? "timed out" : `needsLogin=${r.needsLogin} posts=${r.count}${r.error ? ` error=${r.error}` : ""}`;
  check(`${p}: hidden reader on the real site handled correctly`, !r.error?.includes("not available") && EXPECT[p](r), summary);
}

// 3. Inshorts end to end with real data
await clickX(rowBtn("Inshorts"));
await main.waitForFunction(() => { const li = [...document.querySelectorAll("li")].find((l) => l.textContent.includes("Inshorts")); return li && /Your real feed/.test(li.textContent) && !/Syncing|Logging/.test(li.textContent); }, { timeout: 240_000, polling: 2000 });
const st = await main.evaluate(async () => (await fetch("/api/device/status")).json());
const ins = st.accounts.find((a) => a.platform === "inshorts");
const d = new Date();
const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const feed = ins ? await main.evaluate(async (u) => (await fetch(u)).json(), `/api/feed?view=${ins.id}&day=${day}`) : { items: [] };
check("Inshorts: real stories read on the device and saved", feed.items.length > 0, feed.items.slice(0, 2).map((i) => i.title).join(" | "));
screenshot("inshorts-connected");

console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
await browser.disconnect();
