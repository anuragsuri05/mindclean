import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewHandle, type WebViewMessageEvent } from "./WebView";
import type { WebViewNavigationEvent } from "react-native-webview/lib/WebViewTypes";
import { DESKTOP_UA, READER_TIMEOUT_MS } from "./config";
import { PLATFORM_META, READERS_SCRIPT, type PlatformId } from "./readers.generated";

export interface ReaderResult {
  items: unknown[];
  needsLogin?: boolean;
  error?: string;
}

/**
 * An invisible in-app browser that opens one platform's feed with the user's
 * own logged-in session (cookies live on the phone), runs the shared feed
 * reader, and reports the posts. One job at a time; unmounted when done.
 */
export function HiddenReader({ platform, onDone }: { platform: PlatformId; onDone: (r: ReaderResult) => void }) {
  const ref = useRef<WebViewHandle>(null);
  const injected = useRef(false);
  const finished = useRef(false);
  const meta = PLATFORM_META[platform];

  const finish = (r: ReaderResult) => {
    if (finished.current) return;
    finished.current = true;
    onDone(r);
  };

  useEffect(() => {
    const t = setTimeout(() => finish({ items: [], error: "timed out" }), READER_TIMEOUT_MS);
    // Heavy pages (YouTube, Threads) on slow phones may never fire "loaded": read anyway.
    const fallback = setTimeout(() => inject(), 25_000);
    return () => {
      clearTimeout(t);
      clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLoadEnd = (e: WebViewNavigationEvent | { nativeEvent: { url: string } }) => {
    if (injected.current) return;
    let path = "";
    try {
      path = new URL(e.nativeEvent.url).pathname;
    } catch {
      /* ignore */
    }
    if (meta.login && new RegExp(meta.login).test(path)) return finish({ items: [], needsLogin: true });
    // Give the feed a moment to render before reading it.
    setTimeout(inject, 4000);
  };

  function inject() {
    if (injected.current || finished.current) return;
    injected.current = true;
    ref.current?.injectJavaScript(
      `${READERS_SCRIPT};window.__mindcleanReaders.extractFeed(${JSON.stringify(platform)})` +
        `.then(function(r){window.ReactNativeWebView.postMessage(JSON.stringify({type:"feed",result:r}))})` +
        `.catch(function(e){window.ReactNativeWebView.postMessage(JSON.stringify({type:"feed",result:{items:[],error:String(e)}}))});true;`,
    );
  }

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as { type: string; result?: ReaderResult };
      if (msg.type === "feed" && msg.result) finish(msg.result);
    } catch {
      /* ignore */
    }
  };

  return (
    <View pointerEvents="none" style={styles.host} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <WebView
        ref={ref}
        source={{ uri: meta.url }}
        userAgent={DESKTOP_UA}
        webviewDebuggingEnabled={__DEV__}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        javaScriptEnabled
        domStorageEnabled
        mediaPlaybackRequiresUserAction
        allowsInlineMediaPlayback={false}
        onLoadEnd={onLoadEnd}
        onMessage={onMessage}
        onError={() => finish({ items: [], error: "couldn't load the page" })}
        // A crashed page renderer kills the whole app on Android unless it's handled.
        onRenderProcessGone={() => finish({ items: [], error: "the page crashed" })}
        onContentProcessDidTerminate={() => finish({ items: [], error: "the page crashed" })}
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Desktop-sized and fully transparent, behind the app's own screen.
  host: { position: "absolute", left: 0, top: 0, width: 1280, height: 900, opacity: 0, zIndex: -1 },
  web: { width: 1280, height: 900 },
});
