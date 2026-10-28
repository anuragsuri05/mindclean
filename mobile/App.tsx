import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform, StyleSheet, useColorScheme, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewHandle, type WebViewMessageEvent } from "./src/WebView";
import { APP_VERSION, BASE_ORIGIN, BASE_URL, SYNC_EVERY_MS } from "./src/config";
import { PLATFORM_META, type PlatformId } from "./src/readers.generated";
import { EMPTY_STATE, loadState, saveState, type DeviceState, type PlatformStatus } from "./src/store";
import { HiddenReader, type ReaderResult } from "./src/HiddenReader";
import { LoginSheet, type LoginOutcome } from "./src/LoginSheet";

/**
 * The Mindclean app: the Mindclean website (already Instagram-style and
 * mobile-first) in a full-screen WebView, plus what only an app can do:
 * - log in to Instagram, TikTok, LinkedIn… on their own login pages, in-app;
 * - read those feeds on the phone in a hidden in-app browser;
 * - hand the posts to the website, which uploads them with the user's session.
 */

type Job = { platform: PlatformId; key: string; resolve: (r: ReaderResult) => void };
type Login = { platform: PlatformId; resolve: (outcome: LoginOutcome) => void };
type Request = { type: string; platform?: string };

const isPlatform = (p: unknown): p is PlatformId => typeof p === "string" && p in PLATFORM_META;

export default function App() {
  const dark = useColorScheme() === "dark";
  const main = useRef<WebViewHandle>(null);
  const webReady = useRef(false);
  /** The signed-in Mindclean account (opaque key), or null when signed out. */
  const user = useRef<string | null>(null);
  const state = useRef<DeviceState>(EMPTY_STATE);
  /** Resolves once the signed-in account's saved connections have been loaded. */
  const stateLoaded = useRef<Promise<void>>(Promise.resolve());
  const ingestWaiters = useRef(new Map<string, (r: unknown) => void>());
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [job, setJob] = useState<Job | null>(null);
  const [login, setLogin] = useState<Login | null>(null);

  const update = useCallback(async (patch: (s: DeviceState) => DeviceState) => {
    state.current = patch(state.current);
    if (user.current) await saveState(user.current, state.current);
  }, []);
  const setStatus = (platform: string, s: PlatformStatus) =>
    update((cur) => ({ ...cur, status: { ...cur.status, [platform]: { ...cur.status[platform], ...s, at: Date.now() } } }));

  // ---- talking to the website ------------------------------------------------
  const toWeb = (js: string) => main.current?.injectJavaScript(`${js};true;`);
  const reply = (id: string, value: unknown) => toWeb(`window.__mindcleanWeb && window.__mindcleanWeb.reply(${JSON.stringify({ id, reply: value })})`);

  /** The website uploads the posts with the user's own Mindclean session. */
  const ingestViaWeb = (payload: object) =>
    new Promise<unknown>((resolve) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timer = setTimeout(() => {
        ingestWaiters.current.delete(id);
        resolve({ error: "website not ready" });
      }, 30_000);
      ingestWaiters.current.set(id, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
      toWeb(`window.__mindcleanWeb ? window.__mindcleanWeb.ingest(${JSON.stringify({ id, payload })}) : null`);
    });

  // ---- reading feeds ---------------------------------------------------------
  const readFeed = (platform: PlatformId) =>
    new Promise<ReaderResult>((resolve) => setJob({ platform, key: `${platform}-${Date.now()}`, resolve }));

  const syncOne = async (platform: PlatformId) => {
    const owner = user.current;
    if (!owner) return;
    await setStatus(platform, { state: "syncing", error: null });
    const r = await readFeed(platform);
    setJob(null);
    // Someone else signed in while we were reading: never upload into their account.
    if (user.current !== owner) return;
    const payload = r.needsLogin
      ? { platform, status: "needs_login", items: [] }
      : r.items.length
        ? { platform, status: "ok", items: r.items }
        : { platform, status: "error", error: r.error ?? "no posts found", items: [] };
    const res = (await ingestViaWeb(payload)) as { error?: string } | null;
    await setStatus(platform, {
      state: res?.error ? "error" : r.needsLogin ? "needs_login" : r.items.length ? "ok" : "empty",
      count: r.items.length,
      error: res?.error ?? r.error ?? null,
    });
  };

  const enqueue = (fn: () => Promise<unknown>) => (queue.current = queue.current.then(fn, fn));

  const syncAll = useCallback(() => {
    return enqueue(async () => {
      const owner = user.current;
      if (!owner) return;
      const enabled = (Object.keys(state.current.enabled) as string[]).filter((p) => state.current.enabled[p] && isPlatform(p)) as PlatformId[];
      for (const p of enabled) {
        if (user.current !== owner) return;
        await syncOne(p);
        await new Promise((r) => setTimeout(r, 1500));
      }
      await update((s) => ({ ...s, lastSyncAt: Date.now() }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncIfDue = useCallback(() => {
    const last = state.current.lastSyncAt ?? 0;
    if (webReady.current && user.current && Date.now() - last > SYNC_EVERY_MS) syncAll();
  }, [syncAll]);

  useEffect(() => {
    const t = setInterval(syncIfDue, 60_000);
    const sub = AppState.addEventListener("change", (s) => s === "active" && syncIfDue());
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [syncIfDue]);

  // ---- requests from the website ---------------------------------------------
  const handle = async (req: Request): Promise<unknown> => {
    await stateLoaded.current; // never answer from a half-loaded account
    switch (req.type) {
      case "hello":
        return { version: APP_VERSION, os: Platform.OS, ...state.current };
      case "connect": {
        if (!user.current) return { connected: false, error: "sign in to Mindclean first" };
        if (!isPlatform(req.platform)) return { connected: false, error: "unknown platform" };
        const platform = req.platform;
        const meta = PLATFORM_META[platform];
        const outcome: LoginOutcome = meta.loginUrl ? await new Promise<LoginOutcome>((resolve) => setLogin({ platform, resolve })) : { connected: true };
        if (!outcome.connected) return { connected: false, reason: outcome.reason ?? "closed" };
        await update((s) => ({ ...s, enabled: { ...s.enabled, [platform]: true } }));
        enqueue(() => syncOne(platform));
        return { connected: true };
      }
      case "disconnect":
        if (isPlatform(req.platform)) {
          const p = req.platform;
          await update((s) => {
            const status = { ...s.status };
            delete status[p];
            return { ...s, enabled: { ...s.enabled, [p]: false }, status };
          });
        }
        return { ok: true };
      case "syncNow":
        syncAll();
        return { ok: true };
      case "probe": {
        // Development only: run the hidden reader on one platform and return what it saw,
        // without connecting it or uploading anything. Used by the end-to-end tests.
        if (!__DEV__ || !isPlatform(req.platform)) return { error: "not available" };
        const p = req.platform;
        const r = await new Promise<ReaderResult>((resolve) => enqueue(async () => { const out = await readFeed(p); setJob(null); resolve(out); }));
        return { needsLogin: Boolean(r.needsLogin), error: r.error ?? null, count: r.items.length, sample: r.items.slice(0, 3) };
      }
      default:
        return { error: `unknown request ${req.type}` };
    }
  };

  const onMainMessage = async (e: WebViewMessageEvent) => {
    let msg: { type: string; id?: string; payload?: Request; result?: unknown; user?: string | null };
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === "webReady") {
      webReady.current = true;
      const next = msg.user ?? null;
      if (next !== user.current) {
        // Account switched (or signed out): load that account's connections only.
        user.current = next;
        stateLoaded.current = (next ? loadState(next) : Promise.resolve(EMPTY_STATE)).then((s) => {
          if (user.current === next) state.current = s;
        });
        await stateLoaded.current;
      }
      syncIfDue();
    } else if (msg.type === "ingestResult" && msg.id) {
      ingestWaiters.current.get(msg.id)?.(msg.result);
      ingestWaiters.current.delete(msg.id);
    } else if (msg.type === "request" && msg.id && msg.payload) {
      reply(msg.id, await handle(msg.payload).catch((err) => ({ error: String(err) })));
    }
  };

  // Links to other sites (articles, posts) open in the phone's browser.
  const openExternally = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  const bg = dark ? "#000" : "#fff";
  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.root, { backgroundColor: bg }]} edges={["top", "bottom"]}>
        <StatusBar style={dark ? "light" : "dark"} />
        {job && (
          <HiddenReader
            key={job.key}
            platform={job.platform}
            onDone={(r) => {
              job.resolve(r);
            }}
          />
        )}
        <View style={styles.root}>
          <WebView
            ref={main}
            source={{ uri: BASE_URL }}
            injectedJavaScriptBeforeContentLoaded={`window.__MINDCLEAN_APP__=${JSON.stringify({ version: APP_VERSION, os: Platform.OS })};true;`}
            onMessage={onMainMessage}
            webviewDebuggingEnabled={__DEV__}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            pullToRefreshEnabled
            allowsBackForwardNavigationGestures
            allowsInlineMediaPlayback
            setSupportMultipleWindows
            onOpenWindow={(e: { nativeEvent: { targetUrl: string } }) => openExternally(e.nativeEvent.targetUrl)}
            onShouldStartLoadWithRequest={(req: { url: string; isTopFrame?: boolean }) => {
              if (req.isTopFrame === false || req.url.startsWith("about:")) return true; // embeds (e.g. YouTube player)
              try {
                if (new URL(req.url).origin === BASE_ORIGIN) return true;
              } catch {
                return false;
              }
              openExternally(req.url);
              return false;
            }}
            onContentProcessDidTerminate={() => main.current?.reload()}
            onRenderProcessGone={() => main.current?.reload()}
            style={[styles.root, { backgroundColor: bg }]}
          />
        </View>
        {login && (
          <LoginSheet
            platform={login.platform}
            onClose={(outcome) => {
              login.resolve(outcome);
              setLogin(null);
            }}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
