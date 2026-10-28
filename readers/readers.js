/**
 * Feed readers, shared by the Mindclean mobile app (injected into its hidden
 * in-app browser) and the reader tests. `extractFeed` and `looksLoggedIn` are
 * injected into the platform's page as source text, so each must be fully
 * self-contained: every helper lives inside it. The reader works with what the
 * logged-in page already shows, scrolls a little to load more, and returns
 * normalised posts. Ads and sponsored posts are skipped.
 *
 * Platforms change their markup often; each reader uses several fallbacks,
 * and an empty result is reported back so Mindclean can show it.
 */

/**
 * url: the feed to read · login: URL pattern of the login/checkpoint pages ·
 * loginUrl: where "Connect" sends the user to sign in · host: the platform's own domain.
 */
export const PLATFORMS = {
  instagram: { name: "Instagram", url: "https://www.instagram.com/", login: /\/accounts\/login|\/challenge\//, loginUrl: "https://www.instagram.com/accounts/login/", host: /(^|\.)instagram\.com$/ },
  tiktok: { name: "TikTok", url: "https://www.tiktok.com/foryou", login: /\/login/, loginUrl: "https://www.tiktok.com/login", host: /(^|\.)tiktok\.com$/ },
  linkedin: { name: "LinkedIn", url: "https://www.linkedin.com/feed/", login: /\/(login|uas\/login|authwall|checkpoint|signup)/, loginUrl: "https://www.linkedin.com/login", host: /(^|\.)linkedin\.com$/ },
  x: { name: "X", url: "https://x.com/home", login: /\/(login|i\/flow\/login|i\/flow\/signup)/, loginUrl: "https://x.com/i/flow/login", host: /(^|\.)x\.com$/ },
  facebook: { name: "Facebook", url: "https://www.facebook.com/", login: /\/(login|checkpoint)/, loginUrl: "https://www.facebook.com/login", host: /(^|\.)facebook\.com$/ },
  threads: { name: "Threads", url: "https://www.threads.com/", login: /\/login/, loginUrl: "https://www.threads.com/login", host: /(^|\.)threads\.(com|net)$/ },
  pinterest: { name: "Pinterest", url: "https://www.pinterest.com/", login: /\/login/, loginUrl: "https://www.pinterest.com/login/", host: /(^|\.)pinterest\.com$/ },
  youtube: {
    name: "YouTube",
    url: "https://www.youtube.com/",
    login: null,
    loginUrl: "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F",
    host: /(^|\.)youtube\.com$/,
  },
  inshorts: { name: "Inshorts", url: "https://inshorts.com/en/read", login: null, loginUrl: null, host: /(^|\.)inshorts\.com$/ },
};

/**
 * Injected into the in-app login screen to decide whether the user has
 * finished signing in. Self-contained, like extractFeed.
 */
export function looksLoggedIn(platform) {
  const has = (sel) => Boolean(document.querySelector(sel));
  if (has('input[type="password"]')) return false;
  const markers = {
    instagram: 'svg[aria-label="Home"], a[href="/direct/inbox/"], a[href*="/accounts/edit"]',
    tiktok: '[data-e2e="profile-icon"], [data-e2e="nav-profile"], [data-e2e="upload-icon"]',
    linkedin: "#global-nav, .global-nav__me, a[href*='/mynetwork/']",
    x: '[data-testid="SideNav_AccountSwitcher_Button"], [data-testid="AppTabBar_Home_Link"]',
    facebook: '[aria-label="Your profile"], [aria-label="Account controls and settings"], [aria-label="Your profile" i]',
    threads: 'a[href="/activity"], a[href^="/@"] img[alt*="profile picture" i]',
    pinterest: '[data-test-id="header-profile"], [data-test-id="homefeed-feed"]',
    youtube: "#avatar-btn, button#avatar-btn",
  };
  // Only the platform's own signed-in markers count. Guessing from "no sign-in
  // button visible" marked logged-out X as connected in device testing.
  return Boolean(markers[platform] && has(markers[platform]));
}

export async function extractFeed(platform) {
  const MAX = 30;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = (root, sel) => (root ? root.querySelector(sel) : null);
  const qa = (root, sel) => (root ? [...root.querySelectorAll(sel)] : []);
  const txt = (el) => (el ? (el.innerText ?? el.textContent ?? "") : "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const abs = (h) => {
    try {
      return h ? new URL(h, location.href).href : undefined;
    } catch {
      return undefined;
    }
  };
  const https = (u) => (typeof u === "string" && u.startsWith("https://") ? u : undefined);
  const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || "");
  const hash = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0).toString(36);
  };
  const best = (img) => {
    if (!img) return undefined;
    const set = img.getAttribute("srcset");
    if (set) {
      const top = set
        .split(",")
        .map((s) => s.trim().split(/\s+/))
        .map(([u, w]) => [u, parseInt(w, 10) || 0])
        .sort((a, b) => b[1] - a[1])[0];
      if (top && top[0]) return https(abs(top[0]));
    }
    return https(abs(img.currentSrc || img.getAttribute("src")));
  };
  const bg = (el) => {
    const m = el && getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
    return m ? https(abs(m[1])) : undefined;
  };
  // Hidden browsers may not have loaded images yet, so fall back to declared sizes
  // and only rule out obvious icons/emoji.
  const big = (img) => {
    // Order matters: a broken/unloaded image reports a 16px rendered width.
    const w = img.naturalWidth || parseInt(img.getAttribute("width") || "0", 10) || (img.complete ? 0 : img.width);
    if (w) return w >= 150;
    return !/emoji|rsrc\.php|static\.xx|\/s16x16|\/s32x32/.test(img.getAttribute("src") || "");
  };
  // Ad labels sit in their own element ("Sponsored", "Promoted", "Ad"); match those exactly,
  // because concatenated text ("brandSponsored") defeats word boundaries.
  const hasAdLabel = (root) =>
    qa(root, "span, a, div, p").some((el) => el.children.length === 0 && /^(sponsored|promoted|promoted by .+|ad)$/i.test((el.textContent || "").trim()));
  const longest = (list) => list.filter(Boolean).sort((a, b) => b.length - a.length)[0] || "";

  const items = new Map();
  const add = (it) => {
    if (!it || !it.externalId || items.has(it.externalId)) return;
    it.media = (it.media || []).filter((m) => m.url || m.thumbnail || m.embedUrl);
    if (!it.text && !it.title && it.media.length === 0) return;
    items.set(it.externalId, it);
  };

  const readers = {
    instagram() {
      for (const art of qa(document, "article")) {
        // Current Instagram markup has no <header>: the avatar is an <img> labelled
        // "<user>'s profile picture" and rendered small.
        const isAvatar = (i) => /profile picture/i.test(i.alt || "") || (i.width > 0 && i.width <= 64);
        const header = q(art, "header");
        if (hasAdLabel(header || art)) continue;
        const avatarImg = qa(art, "img").find(isAvatar);
        const fromAlt = avatarImg && (avatarImg.alt || "").match(/^(.+?)'s profile picture/i);
        const author =
          (fromAlt && fromAlt[1]) || txt(qa(header || art, 'a[href^="/"]').find((a) => txt(a) && !/\/(p|reel|reels|explore|stories)\//.test(a.getAttribute("href")))).split("\n")[0];
        const link = q(art, 'a[href*="/p/"], a[href*="/reel/"]');
        const url = abs(link && link.getAttribute("href"));
        const video = q(art, "video");
        const imgs = qa(art, "img").filter((i) => !isAvatar(i) && !(header && header.contains(i)) && (big(i) || i.getAttribute("srcset")));
        const poster = (video && https(abs(video.getAttribute("poster")))) || best(imgs[0]);
        const isReel = Boolean(video) || /\/reel\//.test(url || "");
        const media = isReel
          ? [{ kind: "reel", url: poster, thumbnail: poster, aspect: "portrait" }]
          : imgs.slice(0, 4).map((i) => ({ kind: "image", url: best(i), aspect: "square" }));
        // The caption is plain text; song credits, hashtags and @mentions are links.
        const caption = longest(
          qa(art, "h1, span[dir='auto'], div[dir='auto'] > span")
            .filter((el) => !el.closest("a") && !(header && header.contains(el)))
            .map((el) => txt(el).replace(/(\s*\.{3}|…)?\s*more$/i, "").trim())
            .filter((t) => t && t !== author && !/^[\d,.]+\s*(likes?|views?|comments?)$/i.test(t) && !/^\d+[smhdw]$/.test(t)),
        );
        // Fall back to Instagram's own image description ("Photo by … ") for posts without a caption.
        const altText = (imgs[0] && imgs[0].alt) || "";
        add({
          externalId: url ? url.split("?")[0] : `ig-${hash(author + caption + (poster || ""))}`,
          authorName: author || "Instagram",
          authorAvatar: best(avatarImg),
          text: clip(caption || altText, 2200),
          url,
          media,
          createdAt: (q(art, "time[datetime]") || {}).dateTime || undefined,
        });
      }
    },

    tiktok() {
      const cards = qa(document, '[data-e2e="recommend-list-item-container"], article[data-e2e], [data-e2e="feed-video"], section[id^="one-column-item"]');
      for (const c of cards) {
        const link = q(c, 'a[href*="/video/"], a[href*="/photo/"]');
        const url = abs(link && link.getAttribute("href"));
        const handle = (url && (url.match(/\/@([^/?]+)/) || [])[1]) || txt(q(c, '[data-e2e="video-author-uniqueid"], [data-e2e="browse-username"]'));
        const desc = txt(q(c, '[data-e2e="video-desc"], [data-e2e="browse-video-desc"], h1'));
        const video = q(c, "video");
        const thumb = (video && https(abs(video.getAttribute("poster")))) || best(qa(c, "img").find(big));
        add({
          externalId: url ? url.split("?")[0] : `tt-${hash(handle + desc)}`,
          authorName: handle ? `@${handle.replace(/^@/, "")}` : "TikTok",
          authorAvatar: best(q(c, '[data-e2e="video-avatar"] img, a[href^="/@"] img')),
          text: clip(desc, 2200),
          url: url || (handle ? `https://www.tiktok.com/@${handle.replace(/^@/, "")}` : undefined),
          media: thumb ? [{ kind: "reel", url: thumb, thumbnail: thumb, aspect: "portrait" }] : [],
        });
      }
    },

    linkedin() {
      for (const el of qa(document, 'div[data-urn^="urn:li:activity"], div.feed-shared-update-v2[data-urn]')) {
        const urn = el.getAttribute("data-urn");
        const actor = q(el, ".update-components-actor") || el;
        const desc = txt(q(actor, ".update-components-actor__description"));
        const sub = txt(q(actor, ".update-components-actor__sub-description"));
        if (/promoted/i.test(`${desc} ${sub}`) || hasAdLabel(actor)) continue;
        const name = txt(q(actor, ".update-components-actor__title span[aria-hidden='true'], .update-components-actor__name span[aria-hidden='true'], .update-components-actor__title")).split("\n")[0];
        const text = txt(q(el, ".update-components-text, .feed-shared-update-v2__description, .feed-shared-text")).replace(/\n?…\s*(see )?more$/i, "");
        const article = q(el, ".update-components-article, .feed-shared-article");
        const img = q(el, ".update-components-image img, .feed-shared-image img") || q(article, "img");
        const video = q(el, "video");
        const media = img
          ? [{ kind: "image", url: best(img), aspect: "landscape" }]
          : video
            ? [{ kind: "video", thumbnail: https(abs(video.getAttribute("poster"))), aspect: "landscape" }]
            : [];
        add({
          externalId: urn,
          authorName: name || "LinkedIn",
          authorHandle: clip(desc.split("\n")[0], 120) || undefined,
          authorAvatar: best(q(actor, "img")),
          title: clip(txt(q(article, ".update-components-article__title, .feed-shared-article__title")), 300) || undefined,
          text: clip(text, 3000),
          url: `https://www.linkedin.com/feed/update/${urn}/`,
          media,
        });
      }
    },

    x() {
      for (const art of qa(document, 'article[data-testid="tweet"]')) {
        if (q(art, '[data-testid="placementTracking"]')) continue; // promoted
        const parts = txt(q(art, '[data-testid="User-Name"]')).split("\n").filter(Boolean);
        const time = q(art, "time");
        const url = abs(time && time.closest("a") && time.closest("a").getAttribute("href"));
        const text = txt(q(art, '[data-testid="tweetText"]'));
        const photos = qa(art, '[data-testid="tweetPhoto"] img')
          .map(best)
          .filter(Boolean)
          .map((u) => u.replace(/name=\w+/, "name=medium"));
        const video = q(art, '[data-testid="videoPlayer"] video, video');
        const media = photos.slice(0, 4).map((u) => ({ kind: "image", url: u, aspect: photos.length > 1 ? "square" : "landscape" }));
        if (!media.length && video && video.getAttribute("poster")) media.push({ kind: "video", thumbnail: https(abs(video.getAttribute("poster"))), aspect: "landscape" });
        add({
          externalId: url ? url.split("?")[0] : `x-${hash(parts.join() + text)}`,
          authorName: parts[0] || "X",
          authorHandle: parts.find((p) => p.startsWith("@")),
          authorAvatar: best(q(art, '[data-testid="Tweet-User-Avatar"] img')),
          text: clip(text, 3000),
          url,
          media,
          createdAt: time ? time.getAttribute("datetime") || undefined : undefined,
        });
      }
    },

    facebook() {
      let posts = qa(document, "div[aria-posinset]");
      if (!posts.length) posts = qa(document, 'div[role="article"]').filter((el) => !el.parentElement.closest('[role="article"]'));
      for (const post of posts) {
        if (hasAdLabel(post)) continue;
        const name = txt(q(post, "h2 a, h3 a, h4 a, strong a, h2 span, h3 span, h4 span")).split("\n")[0];
        const message = q(post, '[data-ad-preview="message"], [data-ad-comet-preview="message"]');
        const text = txt(message) || longest(qa(post, 'div[dir="auto"]').map(txt));
        const link = q(post, 'a[href*="/posts/"], a[href*="/videos/"], a[href*="/reel/"], a[href*="story_fbid"], a[href*="/permalink/"], a[href*="/photo"]');
        const href = abs(link && link.getAttribute("href"));
        const url = href && !/story_fbid|fbid=/.test(href) ? href.split("?")[0] : href;
        const img = qa(post, "img").find((i) => big(i) && !i.closest("h2, h3, h4, svg"));
        const avatar = q(post, "svg image");
        add({
          externalId: url || `fb-${hash(name + text.slice(0, 200))}`,
          authorName: name || "Facebook",
          authorAvatar: avatar ? https(avatar.getAttribute("xlink:href") || avatar.getAttribute("href")) : undefined,
          text: clip(text, 3000),
          url,
          media: img ? [{ kind: q(post, "video") ? "video" : "image", url: best(img), thumbnail: best(img), aspect: "landscape" }] : [],
        });
      }
    },

    threads() {
      for (const c of qa(document, 'div[data-pressable-container="true"]')) {
        const link = q(c, 'a[href*="/post/"]');
        const url = abs(link && link.getAttribute("href"));
        if (!url) continue;
        const author = txt(qa(c, 'a[href^="/@"]').find((a) => txt(a))).split("\n")[0];
        const text = longest(
          qa(c, "span[dir='auto'], div[dir='auto']")
            .map(txt)
            .filter((t) => t !== author && !/^\d+[smhdw]$/.test(t)),
        );
        const imgs = qa(c, "img").filter((i) => !/profile picture/i.test(i.alt || "") && big(i));
        const video = q(c, "video");
        const media = video
          ? [{ kind: "video", thumbnail: https(abs(video.getAttribute("poster"))) || best(imgs[0]), aspect: "portrait" }]
          : imgs.slice(0, 4).map((i) => ({ kind: "image", url: best(i), aspect: imgs.length > 1 ? "square" : "portrait" }));
        add({
          externalId: url.split("?")[0],
          authorName: author || "Threads",
          authorHandle: author ? `@${author}` : undefined,
          authorAvatar: best(qa(c, "img").find((i) => /profile picture/i.test(i.alt || ""))),
          text: clip(text, 2200),
          url,
          media,
          createdAt: (q(c, "time[datetime]") || {}).dateTime || undefined,
        });
      }
    },

    pinterest() {
      for (const pin of qa(document, '[data-test-id="pin"], [data-grid-item="true"]')) {
        if (hasAdLabel(pin)) continue;
        const a = q(pin, 'a[href*="/pin/"]');
        const url = abs(a && a.getAttribute("href"));
        const img = q(pin, "img");
        const src = best(img);
        if (!url || !src) continue;
        add({
          externalId: url.split("?")[0],
          authorName: "Pinterest",
          text: clip((img && img.alt) || txt(a), 500),
          url,
          media: [{ kind: q(pin, "video") ? "video" : "image", url: src.replace(/\/\d+x\//, "/736x/"), aspect: "portrait" }],
        });
      }
    },

    youtube() {
      for (const r of qa(document, "ytd-rich-item-renderer, ytd-video-renderer, ytm-shorts-lockup-view-model, ytd-reel-item-renderer")) {
        if (q(r, "ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer")) continue;
        const a = q(r, 'a#video-title-link, a#thumbnail[href], a[href*="/watch?v="], a[href*="/shorts/"]');
        const href = abs(a && a.getAttribute("href"));
        const id = href && ((href.match(/[?&]v=([\w-]{11})/) || [])[1] || (href.match(/\/shorts\/([\w-]{11})/) || [])[1]);
        if (!id) continue;
        const short = /\/shorts\//.test(href);
        const titleEl = q(r, "#video-title, h3, [title]");
        const title = txt(titleEl) || (titleEl && titleEl.getAttribute("title")) || "";
        add({
          externalId: id,
          authorName: txt(q(r, "ytd-channel-name a, ytd-channel-name #text, #channel-name a")).split("\n")[0] || "YouTube",
          authorAvatar: best(q(r, "#avatar img, .yt-spec-avatar-shape__image")),
          title: clip(title, 300),
          text: "",
          url: short ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`,
          media: [
            {
              kind: short ? "reel" : "video",
              thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
              embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
              aspect: short ? "portrait" : "landscape",
            },
          ],
        });
      }
    },

    inshorts() {
      for (const c of qa(document, '[itemtype*="NewsArticle"], .news-card')) {
        const title = txt(q(c, '[itemprop="headline"], .news-card-title span, h2, h3'));
        if (!title) continue;
        const img = q(c, '[itemprop="image"]');
        const imgUrl = https(img && (img.getAttribute("content") || img.getAttribute("src"))) || bg(q(c, ".news-card-image")) || best(q(c, "img"));
        const main = q(c, '[itemprop="mainEntityOfPage"]');
        const link = https((main && main.getAttribute("itemid")) || abs((q(c, 'a[href*="/news/"]') || { getAttribute: () => null }).getAttribute("href")));
        const date = q(c, '[itemprop="datePublished"]');
        add({
          externalId: link || `in-${hash(title)}`,
          authorName: "Inshorts",
          authorHandle: txt(q(c, ".author, [itemprop='author']")) || undefined,
          title: clip(title, 300),
          text: clip(txt(q(c, '[itemprop="articleBody"], .news-card-content div')), 1200),
          url: link,
          media: imgUrl ? [{ kind: "image", url: imgUrl, aspect: "landscape" }] : [],
          createdAt: date ? date.getAttribute("content") || undefined : undefined,
        });
      }
      // Fallback: structured data many news sites embed.
      if (items.size === 0) {
        for (const s of qa(document, 'script[type="application/ld+json"]')) {
          try {
            const data = JSON.parse(s.textContent);
            const list = [].concat(data).flatMap((d) => (d.itemListElement ? d.itemListElement.map((e) => e.item || e) : [d]));
            for (const a of list) {
              if (!a || !/NewsArticle|Article/.test(a["@type"] || "")) continue;
              const image = [].concat(a.image || [])[0];
              add({
                externalId: a.url || `in-${hash(a.headline || "")}`,
                authorName: "Inshorts",
                title: clip(a.headline || "", 300),
                text: clip(a.description || a.articleBody || "", 1200),
                url: https(a.url),
                media: https(typeof image === "string" ? image : image && image.url) ? [{ kind: "image", url: typeof image === "string" ? image : image.url, aspect: "landscape" }] : [],
                createdAt: a.datePublished,
              });
            }
          } catch {
            /* ignore malformed JSON-LD */
          }
        }
      }
    },
  };

  const loggedOut = {
    instagram: () => Boolean(q(document, 'input[name="username"]')),
    x: () => Boolean(q(document, '[data-testid="loginButton"]')) && !q(document, 'article[data-testid="tweet"]'),
    linkedin: () => Boolean(q(document, "form.login__form, .sign-in-form, [data-test-id='sign-in-form']")),
    facebook: () => Boolean(q(document, "#login_form, form[data-testid='royal_login_form']")),
    // Logged-out YouTube with no history shows an empty home instead of recommendations.
    youtube: () => !q(document, "ytd-rich-item-renderer") && /Try searching to get started|Start watching videos to help us build a feed/i.test(document.body ? document.body.textContent : ""),
    pinterest: () => Boolean(q(document, '[data-test-id="simple-login-button"], [data-test-id="login-button"]')) && !q(document, '[data-test-id="pin"]'),
  };

  const read = readers[platform];
  if (!read) return { needsLogin: false, items: [], error: "unsupported" };
  // TikTok redirects to an info page where it's banned (e.g. India).
  if (platform === "tiktok" && /^\/(\w{2}\/)?about/.test(location.pathname)) return { needsLogin: false, items: [], error: "TikTok isn't available in your region" };
  // Feeds render after the page "loads" (real Instagram took ~11s on a slow device): wait for the
  // first posts, while watching for a logged-out page.
  const READY = {
    instagram: "article",
    tiktok: '[data-e2e="recommend-list-item-container"], article[data-e2e], [data-e2e="feed-video"]',
    linkedin: 'div[data-urn^="urn:li:activity"], div.feed-shared-update-v2',
    x: 'article[data-testid="tweet"]',
    facebook: 'div[aria-posinset], div[role="article"]',
    threads: 'div[data-pressable-container="true"]',
    pinterest: '[data-test-id="pin"], [data-grid-item="true"]',
    youtube: "ytd-rich-item-renderer, ytd-video-renderer",
    inshorts: '[itemtype*="NewsArticle"], .news-card, script[type="application/ld+json"]',
  };
  const readyBy = Date.now() + 25_000;
  while (Date.now() < readyBy) {
    if (loggedOut[platform] && loggedOut[platform]()) return { needsLogin: true, items: [] };
    if (q(document, READY[platform])) break;
    await sleep(500);
  }

  // Read, scroll a little, read again: virtualised feeds drop posts that scroll away.
  // Infinite feeds (Instagram keeps ~2 posts in the page) only load more once you reach
  // the bottom, and slow phones take a few seconds, so wait there before giving up.
  const pageHeight = () => document.documentElement.scrollHeight;
  const readBy = Date.now() + 70_000; // stays well inside the app's reader timeout
  for (let round = 0, idle = 0; round < 20 && items.size < MAX && idle < 3 && Date.now() < readBy; round++) {
    const before = items.size;
    try {
      read();
    } catch {
      /* keep going with what we have */
    }
    const height = pageHeight();
    window.scrollBy(0, Math.round(window.innerHeight * 1.4));
    await sleep(1400);
    const atBottom = window.scrollY + window.innerHeight >= pageHeight() - 50;
    if (atBottom) {
      const waitUntil = Date.now() + 6000;
      while (Date.now() < waitUntil && pageHeight() <= height + 50) await sleep(500);
    }
    idle = items.size === before && atBottom && pageHeight() <= height + 50 ? idle + 1 : 0;
  }
  try {
    read();
  } catch {
    /* ignore */
  }
  window.scrollTo(0, 0);
  // Nothing found and the page is asking the user to sign in: report that instead of "empty".
  if (items.size === 0) {
    const signIn = /^(log ?in|sign ?in|sign in to .*)$/i;
    const asksToLogin =
      Boolean(q(document, 'input[type="password"]')) ||
      // textContent, not innerText: hidden browsers may not have laid the page out.
      qa(document, "a, button, tp-yt-paper-button").some((el) => signIn.test((el.textContent || "").trim()) || signIn.test(el.getAttribute("aria-label") || ""));
    if (asksToLogin) return { needsLogin: true, items: [] };
  }
  return { needsLogin: false, items: [...items.values()].slice(0, MAX) };
}
