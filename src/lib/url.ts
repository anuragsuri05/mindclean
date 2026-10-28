import "server-only";

/** Absolute URL on this app. Prefers APP_URL so OAuth redirect URIs match what's registered with the provider. */
export function appUrl(req: Request, path: string): string {
  const base = process.env.APP_URL ?? new URL(req.url).origin;
  return new URL(path, base).toString();
}
