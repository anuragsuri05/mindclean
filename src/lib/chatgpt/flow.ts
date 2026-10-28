/** Remembers this browser's issued ChatGPT client_id so "Continue with ChatGPT" reuses the registration. */
export const CLIENT_COOKIE = "mc_cgpt";

/** Only allow in-app relative redirects. */
export function safeNext(next: string | null, fallback: string): string {
  return next && /^\/(app|welcome)(\/[\w-]*)*$/.test(next) ? next : fallback;
}
