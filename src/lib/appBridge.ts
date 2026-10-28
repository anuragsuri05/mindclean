"use client";

/**
 * Bridge between the Mindclean website and the Mindclean mobile app, which
 * shows this website in its main WebView. The app injects `__MINDCLEAN_APP__`
 * before the page loads; messages go to the app through
 * `window.ReactNativeWebView.postMessage` and come back through `__mindcleanWeb`.
 *
 * The app reads feeds on the phone, then asks this page to upload them
 * (`ingest`), so uploads use the user's normal Mindclean session cookie.
 */

export const DEVICE_PLATFORMS = ["instagram", "tiktok", "linkedin", "x", "facebook", "threads", "pinterest", "youtube", "inshorts"] as const;

export interface AppHello {
  version: string;
  os: string;
  enabled: Record<string, boolean>;
  status: Record<string, { state?: string; count?: number; error?: string | null; at?: number }>;
  lastSyncAt: number | null;
}

interface NativeWindow {
  ReactNativeWebView?: { postMessage(data: string): void };
  __MINDCLEAN_APP__?: { version: string; os: string };
  __mindcleanWeb?: {
    reply(msg: { id: string; reply: unknown }): void;
    ingest(req: { id: string; payload: unknown }): void;
  };
}

const w = () => (typeof window === "undefined" ? null : (window as unknown as NativeWindow));

export function inApp(): boolean {
  const win = w();
  return Boolean(win?.ReactNativeWebView && win.__MINDCLEAN_APP__);
}

const pending = new Map<string, (value: unknown) => void>();

/** crypto.randomUUID only exists on secure (https/localhost) pages; the app may load Mindclean over http on a LAN. */
const requestId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");

/** Installed once per page load (from the root layout) so the app can reach the page at any time. */
export function installAppBridge() {
  const win = w();
  if (!win || win.__mindcleanWeb || !inApp()) return;
  win.__mindcleanWeb = {
    reply({ id, reply }) {
      pending.get(id)?.(reply);
      pending.delete(id);
    },
    async ingest({ id, payload }) {
      let result: unknown;
      try {
        const res = await fetch("/api/device/ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        result = res.ok ? await res.json() : { error: res.status === 401 ? "signed_out" : `http_${res.status}` };
      } catch (err) {
        result = { error: String(err) };
      }
      win.ReactNativeWebView?.postMessage(JSON.stringify({ type: "ingestResult", id, result }));
    },
  };
}

/**
 * Tells the app which Mindclean account is signed in (or none), so it only
 * syncs that account's platforms. Called on every navigation, since signing
 * in or out doesn't reload the page.
 */
export function announceToApp() {
  const win = w();
  if (!win?.ReactNativeWebView || !inApp()) return;
  fetch("/api/device/whoami", { cache: "no-store" })
    .then((r) => r.json() as Promise<{ key: string | null }>)
    .catch(() => ({ key: null }))
    .then(({ key }) => win.ReactNativeWebView?.postMessage(JSON.stringify({ type: "webReady", path: location.pathname, user: key })));
}

export function callApp<T>(payload: Record<string, unknown>, timeoutMs = 8000): Promise<T | null> {
  return new Promise((resolve) => {
    const win = w();
    if (!win?.ReactNativeWebView || !inApp()) return resolve(null);
    installAppBridge();
    const id = requestId();
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(null);
    }, timeoutMs);
    pending.set(id, (value) => {
      clearTimeout(timer);
      resolve(value as T);
    });
    win.ReactNativeWebView.postMessage(JSON.stringify({ type: "request", id, payload }));
  });
}
