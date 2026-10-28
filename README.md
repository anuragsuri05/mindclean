# Mindclean

**Change *what* you scroll, not whether you scroll.**

An Instagram-style app that puts your social and news feeds in one place, then gradually changes what you consume. Nothing is blocked. Pick the habits you want to change ("fewer Reels, more LinkedIn and news"), and Mindclean builds a day-by-day transition plan. With the defaults, every 10 posts go from **8 Reels + 2 meaningful posts on day 1**, to 7 + 3 on day 2, 6 + 4 on day 3, 5 + 5 on day 4, and on until the end of the program.

## Quick start

```bash
npm install
cp .env.example .env.local   # optional: add ANTHROPIC_API_KEY, Reddit/Google OAuth keys
npm run dev                  # http://localhost:3000
```

Requires **Node 22.13+** (it uses the built-in `node:sqlite`, so there are no native database dependencies).

### The user journey
1. **One login/sign-up screen** (`/`): email, or **Continue with ChatGPT** (which also powers the AI with the user's ChatGPT plan).
2. **Connect platforms** (`/welcome/connect`): Instagram, TikTok, YouTube, LinkedIn, Reddit, **Google News** (any section or search, any edition), **top publications** (BBC, The Guardian, TechCrunch, The Hindu, Economic Times, Mint and more), **Inshorts**, newsletters, Bluesky, Mastodon and more.
3. **Focus setup** (`/welcome/focus`): four quick steps.
   - What to scroll less (Reels, memes, gossip, mindless browsing).
   - What to build (LinkedIn and professional posts, news, industry updates, learning).
   - Your interests.
   - Your program: 7/14/21/30 days, where you want to end up, how much you scroll, and a starting mix.
4. **Your plan**: an AI-personalised summary, which sources are "less of" and "more of", the topics it will prioritise, and the full day-by-day timeline.
5. **Home** (`/app`), Instagram-style:
   - A stories row: your daily goal ring, "For you", and one story per source (tap one to see that source's feed on its own).
   - Today's mix bar.
   - Posts with double-tap to like, save and share.
   - Readable cards for news and LinkedIn posts.
   - A "You're all caught up" end state.
6. **Progress** (`/app/progress`):
   - Program day, streak, daily goal, and the change in your meaningful share.
   - Planned vs. actual chart for the whole program, and daily consumption.
   - Breakdowns by source and by content type.
7. **Focus** (`/app/focus`) to see the timeline and pause, change or end the plan; **Sources**; and **Profile** (stats, ChatGPT connection, saved posts).

## How it works

```
Sources (connectors) ──► items cache (SQLite) ──► Mixer ──► Mindful mix feed
                                     ▲               ▲             │
                         Claude scoring         Plan + today's     │ view / dwell / engage / skip
                         (goal alignment)       ratio (engine)     ▼
                                                     ▲         events ──► plan_days counters
                                                     └──── adaptive pacing ◄──┘
```

### The habit-shift engine (`src/lib/engine/`)
- **Schedule:** the meaningful share rises linearly from the starting mix (e.g. 2 in 10) to the end goal (e.g. 8 in 10) over the program length, snapped to whole posts per 10. Each *active day* (a day you open your feed) advances one step; days you skip don't count.
- **Daily goal:** today's meaningful share times how much you usually scroll (e.g. 20% × 100 posts = read 20 meaningful posts today).
- **Adaptive pacing:** if you skipped most of yesterday's new-habit content (engaged with under 25% of at least 3 items), today holds the same mix instead of pushing harder.
- **Mixer:** new-habit posts are spread evenly through each page of 10, and counts carry across pages so a 25% ratio averages exactly 25%. When new-habit content runs out, the feed **ends** instead of backfilling with old-habit content. That honest "you're all caught up" is the stopping cue.
- **Completion:** the program completes on its final day, and the feed then stays at your end mix.
- Unit-tested with `npm test`, including the 8+2 → 7+3 → 6+4 → 5+5 progression and streaks.

### AI, powered by the user's own ChatGPT plan (`src/lib/chatgpt/`, `src/lib/ai/`)
Mindclean needs **no API key**. Users click **Sign in with ChatGPT**, approve plan usage, and the AI features run on their ChatGPT Plus/Pro plan. This uses OpenAI's official [Sign in with ChatGPT plan usage](https://developers.openai.com/siwc/token-sharing-open-source) flow (launched at DevDay 2026).

What the AI does:
- **Plan design:** turns your Focus Setup choices into a personal summary, topics to prioritise, and a line of coaching. Which accounts are "less of" or "more of" is decided deterministically from the chosen habits (`src/lib/habits.ts`), so it's predictable.
- **Content scoring:** scores each new-habit post from 0 to 1 for how well it serves your goal, so the best LinkedIn posts lead the mix.

How a request is routed (`src/lib/ai/llm.ts`):
1. **The user's ChatGPT plan**, if connected with plan usage granted and not over their limit.
2. **Claude** (`claude-opus-5-5`, structured outputs, server-side refusal fallbacks), if the server has `ANTHROPIC_API_KEY`.
3. **Keyword heuristics.** The app never stops working.

The OAuth details follow OpenAI's spec:
- **Registration:** first sign-in registers Mindclean under the user's ChatGPT account (`client_id=dynamic_agent_client`, `agent_name_hint=Mindclean`, plus a stable per-install `ext_agent_host_id`). The issued `client_id` is stored and reused, even after disconnecting.
- **Authorization:** PKCE (S256), scopes `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`, and `resource=https://api.openai.com/v1`. The redirect is a **127.0.0.1 loopback** callback, which then hands off to the app's own origin with a one-time ticket.
- **Validation:** the ID token's signature (JWKS, refetched once on rotation), issuer, audience, expiry and nonce are checked.
- **Plan usage:** only used when the granted scopes include `chatgpt.tokens.use.direct`. If the user declines, they stay signed in and can enable it later.
- **Tokens:** access tokens refresh near expiry, refreshes are serialized, and refresh tokens rotate. Terminal refresh errors sign the user out of ChatGPT; temporary ones keep credentials.
- **Inference:** `POST /v1/responses` with `store:false`, `stream:true`, `instructions`, and no system messages or sampling fields. The JSON is validated with Zod, with one retry.
- **Errors:** usage-limit errors pause plan usage for 30 minutes and show a **Manage usage** link (chatgpt.com/settings/usage). Ineligible accounts (not Plus/Pro) are explained; disconnecting revokes the refresh token.
- **Login:** "Continue with ChatGPT" also works as login: it finds the account by ChatGPT identity or verified email, or creates one.

**Eligibility (OpenAI's rules, Oct 2026):** plan usage is available to *open-source projects and locally run personal projects*. That covers Mindclean running on your own computer. **Paid or remotely hosted apps must join OpenAI's waitlist**; after approval, set `CHATGPT_REDIRECT_URI`. On a hosted deployment without it, the ChatGPT card explains this and the app falls back to Claude or heuristics.

### Engagement signals (`src/components/useTracker.ts`)
- **view:** the card was at least 60% on screen for 0.8s.
- **engage:** 3s of cumulative dwell, opening the post, playing a video, or tapping "Useful".
- **skip:** "Not for me".
- **dwell:** time on screen, summed per item and batched every 4s (sent with `sendBeacon` when the page is hidden).

## Real feeds from Instagram, TikTok, LinkedIn, X & more: the Mindclean app (`mobile/`)

Users log in to their accounts **inside the Mindclean mobile app**, and the app fetches their Reels and feed posts. Nothing gets installed in a browser and nothing needs pairing.

**How it works:**
- **One app, same Mindclean:** the app (Expo / React Native, iOS + Android) shows the Mindclean website full-screen, so it's the same Instagram-style experience, and adds what only an app can do.
- **Logging in:** tapping **Connect** on Instagram, TikTok, LinkedIn, X, Facebook, Threads or Pinterest opens that platform's **real login page inside the app** (`mobile/src/LoginSheet.tsx`). The password goes to the platform, never to Mindclean. The screen closes by itself once the user is signed in.
- **Reading feeds:** an invisible in-app browser (`mobile/src/HiddenReader.tsx`) opens each connected feed with the user's own session (the login stays on the phone), runs the shared reader (`readers/readers.js`), and hands the posts to the website. The website uploads them to `/api/device/ingest` with the user's normal Mindclean session.
- **When it syncs:** when the app opens and every 30 minutes while it's open, one platform at a time.
- **Sample feeds upgrade in place:** a platform's sample feed becomes the real one without breaking plans. Status such as "Log in to Instagram in the Mindclean app…" or "TikTok isn't available in your region" shows on Sources.
- **On the plain website:** these platforms show sample feeds, plus a note that real feeds come from the app. Feeds synced from the phone appear on the website too.

**Run it (development):**
1. Start the website so phones on your Wi-Fi can reach it: `npm run dev -- -H 0.0.0.0`.
2. Run `cd mobile && npm start`. The app finds Mindclean on the computer it was loaded from (port 3000, or set `EXPO_PUBLIC_MINDCLEAN_PORT`).
3. Scan the QR code with **Expo Go** (iOS or Android). The phone and computer must be on the same Wi-Fi.

**Production:** point `EXPO_PUBLIC_MINDCLEAN_URL` at your https site, then build with EAS (`npx eas-cli@latest build`).

**Limits:**
- **Background sync:** phones don't let apps run in-app browsers in the background, so feeds refresh while the app is open, not overnight.
- **Google sign-in:** Google blocks signing in from in-app browsers, so YouTube is best connected through Google OAuth on the website (see below).
- **Sign in with ChatGPT:** this uses a loopback redirect, so it works on the computer running Mindclean, not inside the phone app.
- **Maintenance:** platforms change their page markup often, so the readers need maintenance. Empty results show as "no posts found".
- **Terms of service:** reading feeds automatically goes against these platforms' terms. Mindclean keeps it gentle (the user's own session on their own phone, infrequent, one platform at a time), but some risk of rate limits on users' accounts remains.

**Testing:**
- **Device end-to-end, mock platforms** (`testenv/device-e2e.mjs`, 21 checks): the real app in an Android emulator against mock Instagram, LinkedIn and X with real login forms, sessions and feeds. It covers logging in, fetching feeds, the plan, the feed mix, expired sessions and shared-phone privacy.
- **Device end-to-end, real platforms** (`testenv/real-platforms-e2e.mjs`, 19 checks):
  - The real Instagram, LinkedIn, X, Facebook, Threads, Pinterest and YouTube login screens open inside the app, and nothing connects without a login.
  - Each real feed is handled correctly while logged out.
  - TikTok shows a region notice where it's banned.
  - Threads and Inshorts deliver real posts.
- **Your own accounts** (`testenv/check-real-feeds.mjs`): after logging in to your accounts in the app, this reports what each platform delivered.
- See `testenv/README.md` for how to run all of these.
- `npm run test:readers` runs every reader against logged-in and logged-out page copies served at the real platform URLs.
- `cd mobile && npm run typecheck` checks the app, and `npx expo export` bundles it.
- The readers are packaged into the app by `scripts/build-readers.mjs`, which runs automatically with the app's scripts.

## Platform support, honestly

| Platform | Status | How |
|---|---|---|
| Reddit | **Live** | OAuth (read-only), your home feed (`/best`) |
| YouTube | **Live** | Google OAuth; your subscriptions, with videos read from each channel's RSS feed (no quota cost) |
| Bluesky | **Live** | AT Protocol app password, your Following timeline |
| Mastodon | **Live** | Access token (read scope), your home timeline |
| RSS / Newsletters | **Live** | Any RSS/Atom feed (Substack, Medium, blogs, podcasts, YouTube channels) |
| Google News | **Live** | Public RSS: any section (Top, Business, Technology…), any search, 6 editions (India, US, UK…) |
| Top publications | **Live** | Verified public feeds: BBC, The Guardian, NPR, TechCrunch, The Verge, Wired, Hacker News, Bloomberg Markets, The Hindu, Economic Times, Mint, Indian Express |
| Instagram, TikTok, LinkedIn, Threads, X, Facebook, Pinterest, Inshorts | **Live in the Mindclean app** (sample feed on the website) | No official API for reading a user's feed, so the app reads it on the user's own phone after they log in in-app |
| Snapchat, WeChat | Sample feed | No web feed exists |
| YouTube / Reddit without OAuth keys | Sample feed | Add the keys below to switch them to live |

Mindclean deliberately **does not** ask for users' Instagram, TikTok or LinkedIn passwords or run logins on its servers. Doing so gets accounts banned and would mean holding users' most sensitive credentials. The app reads feeds on the user's own phone instead, after they log in on the platform's own page. Longer-term paths:
1. **Official APIs** as they open up. Threads keyword search and X's paid home-timeline API are closest; each slots in as a new connector.
2. **On-device reading** (what the Mindclean app does today), extended with share-sheet capture on iOS/Android.
3. **The EU Digital Markets Act / data-portability exports** for gatekeeper platforms.

Adding a platform means implementing one `Connector` (`src/lib/connectors/types.ts`) with `fetchPage(credentials, cursor)`.

### Setting up OAuth
- **Reddit:** go to https://www.reddit.com/prefs/apps, choose "web app", and set the redirect URI to `{APP_URL}/api/oauth/reddit/callback`.
- **YouTube:** in Google Cloud Console, enable *YouTube Data API v3*, create a Web OAuth client, and set the redirect URI to `{APP_URL}/api/oauth/youtube/callback`.

## Project layout

```
mobile/                  Expo app: in-app logins, hidden feed reader, Mindclean in a WebView
readers/                 feed readers shared by the app and tests
scripts/build-readers.mjs  packages the readers into the app
src/
  app/
    page.tsx             single login / sign-up screen
    welcome/connect      onboarding step 1: connect platforms
    welcome/focus        onboarding step 2: focus setup → plan
    app/                 Home feed · focus · progress · sources · profile
    api/feed             personalised mix + per-source feeds
    api/plan             generate (AI) · create · pause/end
    api/progress         dashboard data
    api/events, saved    engagement tracking, bookmarks
    api/chatgpt, oauth   Sign in with ChatGPT; Reddit/YouTube OAuth
    api/device           feeds uploaded by the mobile app (session-authenticated)
  components/            AppShell, AuthScreen, ConnectSources, FocusSetup, PlanTimeline,
                         Feed, PostCard, ProgressDashboard, Charts, ProfileView, useTracker
  lib/
    appBridge.ts         website ↔ mobile app messaging
    engine/              schedule + mixer (pure, unit-tested)
    habits.ts            habits ↔ platforms, interests, program options
    connectors/          reddit, youtube, bluesky, mastodon, rss, news (Google News + publications), demo
    ai/                  routing (ChatGPT → Claude → heuristics), plan generation, scoring
    chatgpt/             Sign in with ChatGPT OAuth + Responses API
    feed.ts · plans.ts · insights.ts · db.ts
```

## Security notes
- Platform tokens are encrypted at rest (AES-256-GCM) with `APP_SECRET`, which is **required in production**.
- Passwords are hashed with scrypt; sessions use random tokens stored hashed in an httpOnly cookie.
- User-supplied URLs (RSS, Mastodon) are checked against private and loopback addresses to block SSRF.
- OAuth `state` is single-use, bound to the user, and expires after 15 minutes.
- ChatGPT tokens are stored encrypted and never sent to the browser. The loopback hand-off ticket is single-use, hashed, and expires after 2 minutes. Post-login redirects only go to in-app `/app…` paths.

## Production checklist
- Set `APP_SECRET`, `APP_URL`, and the OAuth credentials.
- SQLite is fine for a single server. For multiple instances, move `src/lib/db.ts` to Postgres (the SQL is portable).
- Put feed syncing on a background job if you want warm caches before users open the app.
