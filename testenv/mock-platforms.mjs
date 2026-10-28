// Mock social platforms for end-to-end testing of the Mindclean app.
//
// Real Instagram/LinkedIn/X logins can't be automated in tests, so this serves
// look-alike login pages and logged-in feeds (same markup the readers expect)
// with real cookie sessions. Test builds of the app point at it via
// MINDCLEAN_TEST_PLATFORMS (see scripts/build-readers.mjs).
//
//   node testenv/mock-platforms.mjs [port]      (default 4100)
//   Test login for every platform: tester / mindclean123
//   POST /_test/expire?platform=instagram ends that platform's sessions.
import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.argv[2] ?? 4100);
const USER = "tester";
const PASS = "mindclean123";
const sessions = new Map(); // token -> platform
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const pic = (seed, w = 800, h = 800) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

const page = (title, body, color = "#111") => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>body{font-family:system-ui,sans-serif;margin:0;background:#fafafa;color:#111}
.bar{background:${color};color:#fff;padding:14px 20px;font-weight:700}.wrap{max-width:560px;margin:0 auto;padding:16px}
form{background:#fff;border:1px solid #ddd;border-radius:12px;padding:24px;margin-top:40px}input{display:block;width:100%;box-sizing:border-box;margin:8px 0;padding:12px;border:1px solid #ccc;border-radius:8px;font-size:16px}
button{width:100%;padding:12px;border:0;border-radius:8px;background:${color};color:#fff;font-weight:700;font-size:16px}.err{color:#c00;margin:8px 0}
article,.post{background:#fff;border:1px solid #ddd;border-radius:12px;margin:16px 0;padding:12px}img{max-width:100%;border-radius:8px}.mock{font-size:12px;opacity:.7}</style></head>
<body><div class="bar">${title} <span class="mock">(test environment)</span></div><div class="wrap">${body}</div></body></html>`;

const loginForm = (platform, name, color, error) =>
  page(
    `${name}`,
    `<form method="post" action="/${platform}/session">
      <h2>Log in to ${name}</h2>${error ? `<p class="err">${error}</p>` : ""}
      <input name="username" placeholder="Username" autocomplete="username">
      <input name="password" type="password" placeholder="Password" autocomplete="current-password">
      <button type="submit">Log in</button>
    </form>`,
    color,
  );

// Logged-in feeds, using the markup each Mindclean reader understands.
const FEEDS = {
  instagram: {
    name: "Instagram",
    color: "#d62976",
    home: "/instagram/",
    login: "/instagram/accounts/login/",
    feed: () => `<nav><svg aria-label="Home" width="1" height="1"></svg><a href="/direct/inbox/">Inbox</a></nav>
      ${[
        ["travelwithmira", "Sunrise over the Dolomites, worth the 4am alarm 🏔️", "reel", "dolomites"],
        ["dance.trend.hub", "New dance trend 🔥 tag someone who can do this", "reel", "dance"],
        ["streetfoodking", "Trying the viral 7-layer burger in Bangkok 🤯", "image", "burger"],
        ["memequeen.co", "POV: you said 'just one more reel' 45 minutes ago", "reel", "meme"],
        ["petsofinsta", "He heard the treat bag from three rooms away 😭", "image", "dog"],
      ]
        .map(
          ([user, caption, kind, seed], i) => `<article><header><img src="${pic(`av-${user}`, 64, 64)}" alt="${user}'s profile picture" width="32"><a href="/${user}/">${user}</a></header>
          ${kind === "reel" ? `<video poster="${pic(seed, 720, 1280)}"></video><a href="/reel/MOCKREEL${i}/">reel</a>` : `<img srcset="${pic(seed, 400, 400)} 400w, ${pic(seed, 1080, 1080)} 1080w" width="400"><a href="/p/MOCKPOST${i}/">post</a>`}
          <time datetime="${new Date(Date.now() - (i + 1) * 3_600_000).toISOString()}"></time><h1>${caption}</h1></article>`,
        )
        .join("")}
      <article><header><a href="/brandco/">brandco</a><span>Sponsored</span></header><img src="${pic("ad")}" width="400"><a href="/p/ADPOST/">ad</a><h1>Buy now</h1></article>`,
  },
  linkedin: {
    name: "LinkedIn",
    color: "#0a66c2",
    home: "/linkedin/feed/",
    login: "/linkedin/login",
    feed: () => `<div id="global-nav"></div>
      ${[
        ["Priya Raman", "Product Lead at Fintech", "I've interviewed 300+ PMs. The best answers to 'tell me about a failure' name the decision, not the outcome. Here's the framework I use.", "pm"],
        ["Aisha Khan", "AI Researcher", "A practical guide to evaluating LLM features before you ship them: build a golden set, grade with a rubric, track regressions per release.", "ai"],
        ["Daniel Okafor", "Staff Engineer", "System design interview: how I'd design a rate limiter. Token bucket vs sliding window, with trade-offs.", "sysdesign"],
        ["Grace Liu", "VP Talent", "Your résumé isn't a job description. Replace 'responsible for' with 'reduced / grew / shipped' plus a number.", "resume"],
      ]
        .map(
          ([n, d, t, seed], i) => `<div data-urn="urn:li:activity:7${i}00" class="feed-shared-update-v2"><div class="update-components-actor"><img src="${pic(`li-${seed}`, 64, 64)}">
          <span class="update-components-actor__title"><span aria-hidden="true">${n}</span></span><span class="update-components-actor__description"><span aria-hidden="true">${d}</span></span></div>
          <div class="update-components-text">${t}</div>${i % 2 === 0 ? `<div class="update-components-image"><img src="${pic(seed, 1200, 630)}" width="600"></div>` : ""}</div>`,
        )
        .join("")}
      <div data-urn="urn:li:activity:999" class="feed-shared-update-v2"><div class="update-components-actor"><span class="update-components-actor__title"><span aria-hidden="true">Acme Ads</span></span><span class="update-components-actor__description"><span aria-hidden="true">Promoted</span></span></div><div class="update-components-text">Try Acme</div></div>`,
  },
  x: {
    name: "X",
    color: "#000",
    home: "/x/home",
    login: "/x/i/flow/login",
    feed: () => `<a data-testid="AppTabBar_Home_Link" href="/x/home">Home</a>
      ${[
        ["Ada Lovelace", "@ada", "New paper: smaller models trained on curated data beat models 10x their size. Key takeaways 🧵", "paper"],
        ["Econ Explained", "@econ_explained", "Inflation explained in 5 charts (no jargon)", "charts"],
      ]
        .map(
          ([n, h, t, seed], i) => `<article data-testid="tweet"><div data-testid="Tweet-User-Avatar"><img src="${pic(`x-${seed}`, 64, 64)}"></div><div data-testid="User-Name">${n}\n${h}</div>
          <a href="/${h.slice(1)}/status/10${i}"><time datetime="${new Date(Date.now() - (i + 2) * 3_600_000).toISOString()}">${i + 2}h</time></a><div data-testid="tweetText">${t}</div>
          <div data-testid="tweetPhoto"><img src="${pic(seed, 1200, 675)}"></div></article>`,
        )
        .join("")}`,
  },
};

const cookieFor = (platform) => `mock_${platform}`;
const parseCookies = (req) => Object.fromEntries((req.headers.cookie ?? "").split(/;\s*/).filter(Boolean).map((c) => c.split("=").map(decodeURIComponent)));
const body = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(new URLSearchParams(d))); });
const send = (res, code, html, headers = {}) => { res.writeHead(code, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...headers }); res.end(html); };
const redirect = (res, to, headers = {}) => { res.writeHead(302, { Location: to, ...headers }); res.end(); };

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const [, platform] = url.pathname.split("/");
    const P = FEEDS[platform];

    if (url.pathname === "/_test/expire" && req.method === "POST") {
      const which = url.searchParams.get("platform");
      for (const [t, p] of sessions) if (!which || p === which) sessions.delete(t);
      log("expired sessions for", which ?? "all");
      return send(res, 200, "ok");
    }
    if (url.pathname === "/_test/state") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ sessions: [...sessions.values()] }));
    }
    if (!P) return send(res, 404, page("Not found", "<p>Unknown mock platform</p>"));

    const token = parseCookies(req)[cookieFor(platform)];
    const signedIn = token && sessions.get(token) === platform;

    if (url.pathname === `/${platform}/session` && req.method === "POST") {
      const form = await body(req);
      if (form.get("username") === USER && form.get("password") === PASS) {
        const t = crypto.randomBytes(16).toString("hex");
        sessions.set(t, platform);
        log(`${P.name}: login ok (${req.headers["user-agent"]?.slice(0, 40)})`);
        return redirect(res, P.home, { "Set-Cookie": `${cookieFor(platform)}=${t}; Path=/; HttpOnly; SameSite=Lax` });
      }
      log(`${P.name}: wrong password`);
      return send(res, 401, loginForm(platform, P.name, P.color, "Sorry, your password was incorrect."));
    }
    if (url.pathname === P.login) {
      return signedIn ? redirect(res, P.home) : send(res, 200, loginForm(platform, P.name, P.color));
    }
    if (url.pathname === P.home) {
      if (!signedIn) {
        log(`${P.name}: feed requested without a session → login`);
        return redirect(res, P.login);
      }
      log(`${P.name}: feed served`);
      return send(res, 200, page(P.name, P.feed(), P.color));
    }
    return redirect(res, P.home);
  })
  .listen(PORT, "0.0.0.0", () => log(`mock platforms on :${PORT} (login ${USER} / ${PASS})`));
