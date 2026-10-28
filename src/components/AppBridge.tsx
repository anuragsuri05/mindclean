"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { announceToApp, installAppBridge } from "@/lib/appBridge";

/** Lets the Mindclean mobile app talk to whichever page is open. Renders nothing. */
export function AppBridge() {
  const path = usePathname();
  useEffect(() => {
    installAppBridge();
    announceToApp();
  }, [path]);
  return null;
}
