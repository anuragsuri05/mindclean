import { PLATFORM_BY_ID } from "./platforms";

const ERRORS: Record<string, string> = {
  invalid_state: "That sign-in link expired. Please try again.",
  exchange_failed: "The platform didn't complete the connection. Please try again.",
  not_configured: "That platform isn't configured on this server yet.",
  access_denied: "You cancelled the connection.",
  denied: "You cancelled the connection.",
};

/** Turns ?connected= / ?error= from an OAuth round trip into a banner. */
export function connectFlash(params: Record<string, string | undefined>): { kind: "ok" | "error"; text: string } | null {
  if (params.error) return { kind: "error", text: ERRORS[params.error] ?? `Connection failed (${params.error}).` };
  if (params.connected && params.connected in PLATFORM_BY_ID) {
    return { kind: "ok", text: `${PLATFORM_BY_ID[params.connected as keyof typeof PLATFORM_BY_ID].name} connected.` };
  }
  return null;
}
