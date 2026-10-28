// End-to-end test of the real Mindclean app running in an Android emulator (Expo Go).
// Drives the app's in-app browsers over WebView DevTools and the device over adb.
// See testenv/README.md for how to start the test environment first.
//   node testenv/device-e2e.mjs [screenshot-dir]
import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
import fs from "node:fs";
const OUT = process.argv[2] ?? "testenv/screenshots";
fs.mkdirSync(OUT, { recursive: true });
const ADB = `${process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`}/platform-tools/adb`;
const MOCK = process.env.MOCK_PLATFORMS ?? "http://localhost:4100";
const SITE = process.env.SITE_FROM_DEVICE ?? "http://10.0.2.2:3200"; // the site as the emulator sees it
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const t0 = Date.now();
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✔" : "✖"} [${Math.round((Date.now() - t0) / 1000)}s] ${name}${detail ? " — " + detail : ""}`);
};
let shot = 0;
const screenshot = (label) => {
  const f = `${OUT}/device-${String(++shot).padStart(2, "0")}-${label}.png`;
  execSync(`${ADB} exec-out screencap -p > "${f}"`);
  return f;
};

const browser = await puppeteer.connect({ browserURL: "http://localhost:9222", defaultViewport: null, protocolTimeout: 180_000 });
const pageFor = async (pred, timeout = 120_000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const t of browser.targets()) if (t.type() === "page" && pred(t.url())) return t.page();
    await wait(1000);
  }
  throw new Error("no in-app browser matching " + pred);
};
const gone = async (pred, timeout = 120_000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (!browser.targets().some((t) => t.type() === "page" && pred(t.url()))) return true;
    await wait(1000);
  }
  return false;
};
const main = await pageFor((u) => u.startsWith(SITE));
const text = () => main.evaluate(() => document.body.innerText);
const waitText = (re, timeout = 120_000) => main.waitForFunction((src) => new RegExp(src).test(document.body.innerText), { timeout, polling: 1000 }, re.source);
// DOM clicks: on a phone screen fixed bars (e.g. "Continue") can cover a button.
const clickX = async (xp) => {
  const [el] = await main.$$(`xpath/${xp}`);
  if (!el) throw new Error("missing " + xp);
  await el.evaluate((b) => (b.scrollIntoView({ block: "center" }), b.click()));
};
const rowBtn = (name) => `//li[.//div[contains(@class,'font-semibold') and normalize-space(text())='${name}']]//button[contains(.,'Connect') or contains(.,'Use my feed')]`;
const api = (p) => main.evaluate(async (u) => (await fetch(u)).json(), p);
const today = () => main.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });

async function loginInSheet(platform, path, { wrongFirst = false } = {}) {
  const sheet = await pageFor((u) => u.includes(path), 120_000);
  await sheet.waitForSelector("input[name=username]", { timeout: 60_000 });
  check(`${platform}: app opened ${platform}'s login screen`, true, sheet.url());
  screenshot(`${platform}-login-screen`);
  if (wrongFirst) {
    await sheet.type("input[name=username]", "tester");
    await sheet.type("input[name=password]", "wrong-password");
    await Promise.all([sheet.waitForNavigation({ timeout: 60_000 }).catch(() => {}), sheet.click("button[type=submit]")]);
    await wait(3000);
    const err = await sheet.evaluate(() => document.body.innerText.includes("password was incorrect"));
    const stillOpen = browser.targets().some((t) => t.url().includes(`/${platform.toLowerCase()}/session`) || t.url().includes(path));
    check(`${platform}: wrong password keeps the login screen open with the platform's error`, err && stillOpen);
    screenshot(`${platform}-wrong-password`);
    await sheet.evaluate(() => document.querySelectorAll("input").forEach((i) => (i.value = "")));
  }
  await sheet.type("input[name=username]", "tester");
  await sheet.type("input[name=password]", "mindclean123");
  await sheet.click("button[type=submit]");
  const closed = await gone((u) => u.includes(path) || u.includes("/session"), 90_000);
  check(`${platform}: login screen closed itself after signing in`, closed);
}

await fetch(`${MOCK}/_test/expire`, { method: "POST" }); // every platform starts logged out
const uiText = () => { execSync(`${ADB} shell uiautomator dump /sdcard/ui.xml`, { stdio: "ignore" }); return execSync(`${ADB} shell cat /sdcard/ui.xml`).toString(); };

// Start signed out of Mindclean (the app keeps its session between runs).
await main.evaluate(() => fetch("/api/auth/logout", { method: "POST" }));
await main.goto(`${SITE}/`, { waitUntil: "load" });

// 1. Sign up inside the app
await main.waitForSelector("input[name=name]", { timeout: 60_000 });
await main.type("input[name=name]", "Laksh Test");
const emailA = `device${Date.now()}@example.com`;
await main.type("input[name=email]", emailA);
await main.type("input[name=password]", "password123");
await clickX("//button[normalize-space()='Sign up']");
await waitText(/Connect your platforms/);
await waitText(/Your feeds sync from this phone/, 60_000);
check("Signed up in the app; Connect shows phone sync", true);
screenshot("connect");

// 2. Instagram: login (wrong password, then right) → hidden reader → posts uploaded
await clickX(rowBtn("Instagram"));
await loginInSheet("Instagram", "/instagram/accounts/login", { wrongFirst: true });
const reader = await pageFor((u) => u.includes("4100/instagram/") && !u.includes("login"), 60_000).catch(() => null);
check("Instagram: hidden reader opened the logged-in feed with the same session", Boolean(reader), reader ? reader.url() : "not seen");
await waitText(/Your real feed/, 180_000);
let st = await api("/api/device/status");
let ig = st.accounts.find((a) => a.platform === "instagram");
check("Instagram: feed read on the phone and saved to Mindclean", ig && ig.status === "ok" && ig.mode === "device", ig ? `${ig.mode}/${ig.status}` : "no account");
const igFeed = await api(`/api/feed?view=${ig.id}&day=${await today()}`);
check("Instagram: 5 posts fetched, sponsored post skipped", igFeed.items.length === 5 && !igFeed.items.some((i) => /Buy now/.test(i.text)), igFeed.items.map((i) => i.authorName).join(", "));
check("Instagram: Reels arrive as reels with images", igFeed.items.filter((i) => i.media[0]?.kind === "reel").length === 3);
screenshot("instagram-connected");

// 3. LinkedIn (the habit to build)
await clickX(rowBtn("LinkedIn"));
await loginInSheet("LinkedIn", "/linkedin/login");
await main.waitForFunction(() => { const li = [...document.querySelectorAll("li")].find((l) => l.textContent.includes("LinkedIn")); return li && /Your real feed/.test(li.textContent) && !/Syncing|Logging/.test(li.textContent); }, { timeout: 180_000, polling: 1000 });
st = await api("/api/device/status");
const li = st.accounts.find((a) => a.platform === "linkedin");
const liFeed = await api(`/api/feed?view=${li.id}&day=${await today()}`);
check("LinkedIn: 4 posts fetched, promoted post skipped", liFeed.items.length === 4 && !liFeed.items.some((i) => i.authorName === "Acme Ads"), liFeed.items.map((i) => i.authorName).join(", "));

// 4. X: user backs out of the login → handled
await clickX(rowBtn("X"));
await pageFor((u) => u.includes("/x/i/flow/login"), 120_000);
await wait(2000);
execSync(`${ADB} shell input keyevent 4`); // Android back button
await waitText(/You closed the X login before finishing/, 60_000);
check("X: backing out of the login is handled, nothing connected", !(await api("/api/device/status")).accounts.some((a) => a.platform === "x"));

// 5. Focus setup → plan → feed mix
await clickX("//a[normalize-space()='Continue']");
await waitText(/What do you want to scroll less/);
await clickX("//button[normalize-space()='Next']"); // Reels (default)
await clickX("//button[.//span[normalize-space()='News & current affairs']]"); // keep LinkedIn & professional only
await clickX("//button[normalize-space()='Next']");
await clickX("//button[normalize-space()='AI']");
await clickX("//button[normalize-space()='Careers']");
await clickX("//button[normalize-space()='Next']");
await clickX("//button[contains(.,'Generate my plan')]");
await waitText(/Start my plan/, 90_000);
check("Plan generated: 8 Reels + 2 meaningful on day 1", /8 Reels \+ 2 meaningful/.test(await text()));
screenshot("plan");
await clickX("//button[normalize-space()='Start my plan']");
await main.waitForSelector("article", { timeout: 120_000 });
await wait(3000);
screenshot("feed");
const shown = await main.$$eval("article", (arts) => arts.map((a) => (a.querySelector("header")?.textContent.match(/Instagram|LinkedIn/) ?? ["?"])[0]));
check("Day 1 feed on screen: 4 Reels, then a LinkedIn post (8+2 spacing)", shown.slice(0, 5).join() === "Instagram,Instagram,Instagram,Instagram,LinkedIn", shown.join(" → "));
const mix = await api(`/api/feed?view=mix&day=${await today()}`);
const fromP = [...new Set(mix.items.filter((i) => i.bucket === "from").map((i) => i.platform))];
const toP = [...new Set(mix.items.filter((i) => i.bucket === "to").map((i) => i.platform))];
check("Feed mixes the real (mock) Instagram Reels with LinkedIn posts", (await api("/api/accounts")).accounts.filter((a) => a.mode === "device").length === 2 && shown.includes("Instagram") && shown.includes("LinkedIn"));

// 6. Session expires on Instagram → next sync asks the user to log in again
await fetch(`${MOCK}/_test/expire?platform=instagram`, { method: "POST" });
await main.goto(`${SITE}/app/sources`, { waitUntil: "load" });
await waitText(/Sync now/, 60_000);
await clickX("//button[normalize-space()='Sync now']");
await main.waitForFunction(() => /Log in to Instagram in the Mindclean app/.test(document.body.innerText), { timeout: 240_000, polling: 3000 }).catch(() => {});
await main.reload({ waitUntil: "load" });
await wait(2000);
const relog = /Log in to Instagram in the Mindclean app/.test(await text());
check("Expired Instagram session: Mindclean asks the user to log in again", relog);
screenshot("relogin-needed");

// 7. Shared phone: user A signs out, user B signs up on the same app
await main.goto(`${SITE}/app/profile`, { waitUntil: "load" });
await clickX("//main//button[normalize-space()='Log out']");
await main.waitForSelector("input[name=email]", { timeout: 60_000 });
await main.type("input[name=name]", "Second Person");
await main.type("input[name=email]", `second${Date.now()}@example.com`);
await main.type("input[name=password]", "password123");
await clickX("//button[normalize-space()='Sign up']");
await waitText(/Your feeds sync from this phone/, 90_000);
const helloB = await main.evaluate(() => new Promise((res) => { const id = "hb"; const prev = window.__mindcleanWeb.reply; window.__mindcleanWeb.reply = (m) => { if (m.id === id) { window.__mindcleanWeb.reply = prev; res(m.reply); } else prev(m); }; window.ReactNativeWebView.postMessage(JSON.stringify({ type: "request", id, payload: { type: "hello" } })); setTimeout(() => res(null), 15000); }));
check("User B: the app shows none of user A's connected platforms", helloB && Object.values(helloB.enabled).every((v) => !v), JSON.stringify(helloB?.enabled));
await main.evaluate(() => window.ReactNativeWebView.postMessage(JSON.stringify({ type: "request", id: "sync-b", payload: { type: "syncNow" } })));
await wait(25_000);
check("User B: syncing never uploads user A's feeds", (await api("/api/device/status")).accounts.length === 0);
// A is still logged in to (mock) LinkedIn on this phone: B must confirm, not be connected silently
await clickX(rowBtn("LinkedIn"));
await pageFor((u) => u.includes("4100/linkedin/"), 120_000);
let banner = false;
for (let i = 0; i < 20 && !banner; i++) { await wait(3000); banner = uiText().includes("Already signed in to LinkedIn on this phone"); }
check("User B: an existing LinkedIn login on the phone asks for confirmation", banner);
screenshot("already-signed-in");
execSync(`${ADB} shell input keyevent 4`);
await waitText(/You closed the LinkedIn login before finishing/, 60_000);
check("User B: nothing connected after backing out", (await api("/api/device/status")).accounts.length === 0);
// A signs back in: their connections come back
await main.goto(`${SITE}/app/profile`, { waitUntil: "load" });
await clickX("//main//button[normalize-space()='Log out']");
await main.waitForSelector("input[name=email]", { timeout: 60_000 });
await clickX("//button[normalize-space()='Log in']");
await main.type("input[name=email]", emailA);
await main.type("input[name=password]", "password123");
await clickX("//form//button[normalize-space()='Log in']");
await main.waitForSelector("article", { timeout: 120_000 });
await main.goto(`${SITE}/app/sources`, { waitUntil: "load" });
await waitText(/2 accounts connected/, 60_000);
check("User A signs back in: their connected platforms are restored", true);

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed in ${Math.round((Date.now() - t0) / 1000)}s`);
await browser.disconnect();
