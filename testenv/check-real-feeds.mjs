// Verifies what the Mindclean app delivered after a person logged in to their
// own accounts in the app (on an emulator or a real iPhone/Android phone).
// Reads the Mindclean database directly, so it works for any device.
//
//   node testenv/check-real-feeds.mjs [email]     (default: most recent user)
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.env.DATABASE_PATH ?? ".data/mindclean.db", { readOnly: true });
const email = process.argv[2];
const user = email
  ? db.prepare("SELECT id, email, name FROM users WHERE email = ?").get(email)
  : db.prepare("SELECT id, email, name FROM users ORDER BY created_at DESC LIMIT 1").get();
if (!user) {
  console.log("No such user. Sign up in the app first.");
  process.exit(1);
}
console.log(`Account: ${user.name} <${user.email}>\n`);

const accounts = db.prepare("SELECT * FROM accounts WHERE user_id = ? AND mode = 'device' ORDER BY platform").all(user.id);
if (accounts.length === 0) console.log("No platforms connected through the app yet. Tap Connect on Sources and log in.");

let ok = 0;
for (const a of accounts) {
  const items = db.prepare("SELECT author_name, title, text, url, media_json, created_at FROM items WHERE account_id = ? ORDER BY seq LIMIT 200").all(a.id);
  const media = items.map((i) => JSON.parse(i.media_json));
  const withMedia = media.filter((m) => m.length > 0).length;
  const reels = media.filter((m) => m[0]?.kind === "reel").length;
  const withUrl = items.filter((i) => i.url).length;
  const authors = new Set(items.map((i) => i.author_name)).size;
  const empty = items.filter((i) => !i.text && !i.title).length;
  const healthy = a.status === "ok" && items.length > 0;
  if (healthy) ok++;
  console.log(`${healthy ? "✔" : "✖"} ${a.platform.padEnd(10)} status=${a.status}${a.error ? ` (${a.error})` : ""}  synced=${a.last_synced_at ?? "never"}`);
  console.log(`    ${items.length} posts · ${authors} authors · ${withMedia} with images/video (${reels} reels) · ${withUrl} with links · ${empty} without text`);
  for (const i of items.slice(0, 3)) console.log(`    – ${i.author_name}: ${(i.title || i.text || "(media only)").replace(/\s+/g, " ").slice(0, 90)}`);
  if (items.length > 0 && withMedia === 0 && ["instagram", "tiktok", "pinterest"].includes(a.platform)) {
    console.log("    ⚠ no images captured: this platform's layout may have changed; send a screenshot of its feed");
  }
  console.log("");
}
console.log(`${ok}/${accounts.length} connected platforms delivered posts`);
