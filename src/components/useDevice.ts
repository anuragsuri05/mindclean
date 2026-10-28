"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { callApp, inApp, type AppHello } from "@/lib/appBridge";

/** "app": this page is open inside the Mindclean mobile app; "web": a normal browser. */
export function useDevice() {
  const [where, setWhere] = useState<"checking" | "app" | "web">("checking");
  const [hello, setHello] = useState<AppHello | null>(null);

  const refresh = useCallback(async () => {
    if (!inApp()) {
      setWhere("web");
      return;
    }
    setHello(await callApp<AppHello>({ type: "hello" }));
    setWhere("app");
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Opens the platform's own login screen inside the app; resolves once signed in (or cancelled). */
  const connect = useCallback(
    async (platform: string) => {
      const res = await callApp<{ connected?: boolean; reason?: string; error?: string }>({ type: "connect", platform }, 6 * 60_000);
      await refresh();
      return res ?? { connected: false, reason: "no_response" };
    },
    [refresh],
  );

  const disconnect = useCallback(
    async (platform: string) => {
      await callApp({ type: "disconnect", platform });
      await api("/api/device/disconnect", { method: "POST", body: JSON.stringify({ platform }) }).catch(() => {});
      await refresh();
    },
    [refresh],
  );

  const syncNow = useCallback(async () => {
    await callApp({ type: "syncNow" });
    await refresh();
  }, [refresh]);

  return { where, hello, refresh, connect, disconnect, syncNow };
}
