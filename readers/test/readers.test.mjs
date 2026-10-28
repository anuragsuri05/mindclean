// Regression test for the extension's feed readers: run with `npm run test:readers`.
// Serves logged-in-style page copies at each platform's real URL (request interception)
// and runs the extension's readers against them. Verifies the logged-in code paths run,
// map fields correctly and skip ads. It can't prove the real sites still use this markup.
import puppeteer from "puppeteer-core";
import { extractFeed, looksLoggedIn } from "../readers.js";

const img = (n) => `https://cdn.example-cdn.com/${n}.jpg`;
const F = {
  "https://www.instagram.com/": `<nav><svg aria-label="Home"></svg><a href="/direct/inbox/">DM</a></nav>
    <article><header><img src="${img("av1")}" alt="natgeo's profile picture"><a href="/natgeo/">natgeo</a></header>
      <img srcset="${img("p1s")} 320w, ${img("p1l")} 1080w" width="400"><a href="/p/POST1/">link</a><time datetime="2026-10-21T08:00:00Z"></time>
      <h1>A glacier at sunrise in Patagonia</h1><span dir="auto">1,204 likes</span></article>
    <article><header><img src="${img("av2")}"><a href="/comedy/">comedy</a></header>
      <video poster="${img("reel")}"></video><a href="/reel/REEL1/">r</a><span dir="auto">When the wifi drops mid-meeting 😂</span></article>
    <article><header><a href="/brand/">brand</a><span>Sponsored</span></header><img src="${img("ad")}" width="400"><a href="/p/AD1/">ad</a><h1>Buy now</h1></article>`,
  "https://www.linkedin.com/feed/": `<div id="global-nav"></div>
    <div data-urn="urn:li:activity:111" class="feed-shared-update-v2"><div class="update-components-actor"><img src="${img("li-av")}">
      <span class="update-components-actor__title"><span aria-hidden="true">Priya Raman</span></span>
      <span class="update-components-actor__description"><span aria-hidden="true">Product Lead at Fintech</span></span></div>
      <div class="update-components-text">How we cut onboarding time by 40% with three small changes.\n…see more</div>
      <div class="update-components-image"><img src="${img("li-img")}"></div></div>
    <div data-urn="urn:li:activity:222" class="feed-shared-update-v2"><div class="update-components-actor"><span class="update-components-actor__title"><span aria-hidden="true">Acme Ads</span></span>
      <span class="update-components-actor__description"><span aria-hidden="true">Promoted</span></span></div><div class="update-components-text">Try Acme</div></div>
    <div data-urn="urn:li:activity:333"><div class="update-components-actor"><span class="update-components-actor__title"><span aria-hidden="true">Daniel Okafor</span></span></div>
      <div class="update-components-article"><img src="${img("li-art")}"><span class="update-components-article__title">System design: rate limiters explained</span></div>
      <div class="update-components-text">Worth a read.</div></div>`,
  "https://x.com/home": `<a data-testid="AppTabBar_Home_Link"></a>
    <article data-testid="tweet"><div data-testid="Tweet-User-Avatar"><img src="${img("x-av")}"></div><div data-testid="User-Name">Ada Lovelace\n@ada</div>
      <a href="/ada/status/123"><time datetime="2026-10-21T09:00:00Z">2h</time></a><div data-testid="tweetText">New paper on analytical engines 🧵</div>
      <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/abc?format=jpg&name=small"></div></article>
    <article data-testid="tweet"><div data-testid="User-Name">Promo\n@promo</div><div data-testid="placementTracking"></div><div data-testid="tweetText">Ad</div></article>`,
  "https://www.facebook.com/": `<div aria-label="Your profile"></div>
    <div aria-posinset="1"><svg><image xlink:href="${img("fb-av")}"></image></svg><h3><a href="/mom">Mom</a></h3>
      <div data-ad-preview="message">Happy birthday to my amazing sister!</div><a href="https://www.facebook.com/mom/posts/999">x</a><img src="${img("fb-img")}" width="500"></div>
    <div aria-posinset="2"><h3><a>Shop</a></h3><span>Sponsored</span><div data-ad-preview="message">Sale!</div></div>`,
  "https://www.threads.com/": `<a href="/activity"></a>
    <div data-pressable-container="true"><a href="/@kaya.writes"><img alt="kaya.writes's profile picture" src="${img("th-av")}"></a><a href="/@kaya.writes">kaya.writes</a>
      <a href="/@kaya.writes/post/ABC"><time datetime="2026-10-21T07:00:00Z">3h</time></a><span dir="auto">Finished Thinking in Systems today.</span></div>`,
  "https://www.pinterest.com/": `<div data-test-id="homefeed-feed"></div>
    <div data-test-id="pin"><a href="/pin/12345/"><img src="https://i.pinimg.com/236x/aa/bb.jpg" alt="Small balcony garden ideas"></a></div>
    <div data-test-id="pin"><a href="/pin/999/"><img src="https://i.pinimg.com/236x/cc.jpg" alt="Promoted"></a><span>Promoted by Brand</span><span>Promoted</span></div>`,
  "https://www.tiktok.com/foryou": `<div data-e2e="profile-icon"></div><div data-e2e="recommend-list-item-container"><a href="/@chef/video/7001"><img src="${img("tt")}" width="300"></a>
      <div data-e2e="video-desc">3-ingredient pasta in 5 minutes</div></div>`,
  "https://www.youtube.com/": `<button id="avatar-btn"></button>
    <ytd-rich-item-renderer><a id="video-title-link" href="/watch?v=dQw4w9WgXcQ"><span id="video-title">How batteries work</span></a><ytd-channel-name><a>Veritasium</a></ytd-channel-name></ytd-rich-item-renderer>
    <ytd-rich-item-renderer><a href="/shorts/abcdefghijk"><h3>Funny cat #shorts</h3></a></ytd-rich-item-renderer>
    <ytd-rich-item-renderer><ytd-ad-slot-renderer></ytd-ad-slot-renderer><a href="/watch?v=AAAAAAAAAAA">ad</a></ytd-rich-item-renderer>`,
};
const EXPECT = { instagram: 2, linkedin: 2, x: 1, facebook: 1, threads: 1, pinterest: 1, tiktok: 1, youtube: 2 };
const PLATFORM_URL = { instagram: "https://www.instagram.com/", linkedin: "https://www.linkedin.com/feed/", x: "https://x.com/home", facebook: "https://www.facebook.com/", threads: "https://www.threads.com/", pinterest: "https://www.pinterest.com/", tiktok: "https://www.tiktok.com/foryou", youtube: "https://www.youtube.com/" };

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage();
await page.setRequestInterception(true);
page.on("request", (r) => {
  const html = F[r.url()];
  if (html) return r.respond({ status: 200, contentType: "text/html; charset=utf-8", body: `<!doctype html><html><head><title>t</title></head><body>${html}</body></html>` });
  if (r.resourceType() === "image" || r.resourceType() === "media") return r.respond({ status: 204 });
  r.abort();
});
let failures = 0;
for (const [platform, url] of Object.entries(PLATFORM_URL)) {
  await page.goto(url, { waitUntil: "load" });
  const loggedIn = await page.evaluate(`(${looksLoggedIn.toString()})(${JSON.stringify(platform)})`);
  const out = await page.evaluate(`(${extractFeed.toString()})(${JSON.stringify(platform)})`);
  const ok = out.items.length === EXPECT[platform] && loggedIn && !out.needsLogin;
  if (!ok) failures++;
  console.log(`${ok ? "✔" : "✖"} ${platform.padEnd(9)} loggedIn=${loggedIn} items=${out.items.length}/${EXPECT[platform]}`);
  for (const it of out.items) console.log(`     ${it.authorName}${it.authorHandle ? ` (${it.authorHandle})` : ""} | ${(it.title || it.text).slice(0, 48)} | ${it.url ?? "-"} | ${it.media.map((m) => m.kind + ":" + (m.url || m.thumbnail || m.embedUrl || "").slice(-22)).join(",")}`);
}
// Logged-out page copy: Instagram login form must be detected.
F["https://www.instagram.com/"] = `<form><input name="username"><input type="password"></form><a href="/accounts/login/">Log in</a>`;
await page.goto("https://www.instagram.com/", { waitUntil: "load" });
const lo = await page.evaluate(`(${extractFeed.toString()})("instagram")`);
const loLogged = await page.evaluate(`(${looksLoggedIn.toString()})("instagram")`);
console.log(`${lo.needsLogin && !loLogged ? "✔" : "✖"} logged-out instagram → needsLogin=${lo.needsLogin}, looksLoggedIn=${loLogged}`);
if (!lo.needsLogin || loLogged) failures++;
// Regression: current Instagram markup (no <header>, avatar labelled "…'s profile picture",
// song credit as a link, caption ending in "… more"). Real-device testing found images were dropped.
F["https://www.instagram.com/"] = `<nav><svg aria-label="Home"></svg></nav>
  <article><div><div><a href="/vijay.travels/"><img alt="vijay.travels's profile picture" src="https://cdn.example-cdn.com/av.jpg" width="32"></a>
    <a href="/vijay.travels/"><span dir="auto">vijay.travels</span></a><a href="/reels/audio/123/"><span dir="auto">Anu Malik, Alisha Chinai • Bebo (Original Motion Picture Soundtrack)</span></a></div>
    <div><img alt="Photo by Vijay on October 21, 2026. May be an image of mountain." src="https://cdn.example-cdn.com/photo.jpg" width="1440"></div>
    <a href="/p/REALPOST1/">2h</a><span dir="auto">Sunrise over Spiti valley, worth every hairpin bend… more</span></div></article>
  <article><div><img alt="memes.daily's profile picture" src="https://cdn.example-cdn.com/av2.jpg" width="32"><a href="/memes.daily/"><span dir="auto">memes.daily</span></a>
    <span>Sponsored</span></div><img src="https://cdn.example-cdn.com/ad.jpg" width="1080"><a href="/p/ADX/">ad</a></article>`;
await page.goto("https://www.instagram.com/", { waitUntil: "load" });
const igNow = await page.evaluate(`(${extractFeed.toString()})("instagram")`);
const p0 = igNow.items[0] ?? {};
const igOk = igNow.items.length === 1 && p0.authorName === "vijay.travels" && p0.media.length === 1 && /photo\.jpg/.test(p0.media[0].url) && p0.text === "Sunrise over Spiti valley, worth every hairpin bend" && /av\.jpg/.test(p0.authorAvatar || "");
console.log(`${igOk ? "✔" : "✖"} current Instagram markup → ${igNow.items.length} post(s); author=${p0.authorName}; media=${p0.media?.length}; text="${p0.text}"`);
if (!igOk) failures++;

// Regression: a logged-out landing page with lots of text and no password field must not count as logged in.
F["https://x.com/home"] = `<main><h1>Happening now</h1><p>${"Join today. ".repeat(80)}</p><div role="button"><span>Create account</span></div><a href="/login"><span><span>Sign in</span></span></a></main>`;
await page.goto("https://x.com/home", { waitUntil: "load" });
const xLoggedOut = await page.evaluate(`(${looksLoggedIn.toString()})("x")`);
console.log(`${!xLoggedOut ? "✔" : "✖"} logged-out X landing page → looksLoggedIn=${xLoggedOut}`);
if (xLoggedOut) failures++;
console.log(failures ? `\n${failures} FAILED` : "\nall reader checks passed");
await browser.close();
process.exit(failures ? 1 : 0);
