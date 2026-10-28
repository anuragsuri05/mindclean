import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewHandle, type WebViewMessageEvent } from "./WebView";
import { DESKTOP_UA } from "./config";
import { PLATFORM_META, READERS_SCRIPT, type PlatformId } from "./readers.generated";

/**
 * The platform's real login page, inside the app. The user signs in there;
 * the password goes straight to the platform. As soon as the page shows a
 * signed-in view, the sheet closes and reports success.
 */
export type LoginOutcome = { connected: boolean; reason?: "closed" | "unavailable" };

export function LoginSheet({ platform, onClose }: { platform: PlatformId; onClose: (outcome: LoginOutcome) => void }) {
  const ref = useRef<WebViewHandle>(null);
  const done = useRef(false);
  /** Saw a login form during this sheet: the user actually signed in here. */
  const sawForm = useRef(false);
  const [alreadySignedIn, setAlreadySignedIn] = useState(false);
  const meta = PLATFORM_META[platform];
  const dark = useColorScheme() === "dark";

  const close = (connected: boolean, reason?: LoginOutcome["reason"]) => {
    if (done.current) return;
    done.current = true;
    onClose({ connected, reason: connected ? undefined : (reason ?? "closed") });
  };

  const check = () =>
    ref.current?.injectJavaScript(
      `${READERS_SCRIPT};window.ReactNativeWebView.postMessage(JSON.stringify({type:"login",` +
        `ok:window.__mindcleanReaders.looksLoggedIn(${JSON.stringify(platform)}),pw:!!document.querySelector('input[type="password"]'),` +
        `host:location.hostname,path:location.pathname}));true;`,
    );

  // Re-check every couple of seconds: many logins finish without a full page load.
  useEffect(() => {
    const t = setInterval(check, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as { type: string; ok: boolean; pw: boolean; host: string; path: string };
      if (msg.type !== "login") return;
      // TikTok sends people to an info page where it's banned (e.g. India).
      if (platform === "tiktok" && /^\/(\w{2}\/)?about/.test(msg.path)) return close(false, "unavailable");
      if (msg.pw) sawForm.current = true;
      if (!msg.ok) return;
      if (!new RegExp(meta.host).test(msg.host)) return; // e.g. still on accounts.google.com
      if (meta.login && new RegExp(meta.login).test(msg.path)) return;
      // Signed in without ever seeing a login form: someone is already logged in on this
      // phone (logins are shared by the app's browsers). Let the user confirm whose account it is.
      if (!sawForm.current) setAlreadySignedIn(true);
      else close(true);
    } catch {
      /* ignore */
    }
  };

  const bg = dark ? "#000" : "#fff";
  const ink = dark ? "#f5f5f5" : "#0a0a0a";
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => close(false)}>
      <SafeAreaView style={[styles.sheet, { backgroundColor: bg }]} edges={["top", "bottom"]}>
        <View style={[styles.header, { borderColor: dark ? "#262626" : "#efefef" }]}>
          <Pressable onPress={() => close(false)} hitSlop={12} accessibilityRole="button">
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={[styles.title, { color: ink }]}>Log in to {meta.name}</Text>
          <View style={styles.spacer} />
        </View>
        {alreadySignedIn ? (
          <View style={styles.banner}>
            <Text style={[styles.bannerText, { color: ink }]}>
              Already signed in to {meta.name} on this phone. Check the account below, then continue, or log out of it first.
            </Text>
            <Pressable style={styles.useBtn} onPress={() => close(true)} accessibilityRole="button">
              <Text style={styles.useBtnText}>Use this account</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.note}>Your password goes to {meta.name}, never to Mindclean.</Text>
        )}
        {meta.loginUrl && (
          <WebView
            ref={ref}
            source={{ uri: meta.loginUrl }}
            userAgent={DESKTOP_UA}
            webviewDebuggingEnabled={__DEV__}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            javaScriptEnabled
            domStorageEnabled
            onLoadEnd={check}
            onMessage={onMessage}
            // A crashed page renderer kills the whole app on Android unless it's handled.
            onRenderProcessGone={() => close(false)}
            onContentProcessDidTerminate={() => ref.current?.reload()}
            style={styles.web}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  cancel: { color: "#0095f6", fontSize: 16, fontWeight: "600", width: 64 },
  title: { fontSize: 16, fontWeight: "700" },
  spacer: { width: 64 },
  note: { textAlign: "center", color: "#737373", fontSize: 12, paddingVertical: 8 },
  banner: { padding: 12, gap: 10, backgroundColor: "rgba(0,149,246,0.08)" },
  bannerText: { fontSize: 13, textAlign: "center" },
  useBtn: { backgroundColor: "#0095f6", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  useBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  web: { flex: 1 },
});
