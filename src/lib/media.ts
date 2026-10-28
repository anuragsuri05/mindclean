/**
 * Social CDNs (notably Instagram/Facebook) block their images from loading on
 * other sites. Images from these hosts go through /api/media instead.
 */
export const PROXY_HOSTS = ["cdninstagram.com", "fbcdn.net", "licdn.com", "twimg.com", "tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com", "pinimg.com"];

export function needsProxy(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && PROXY_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** The URL to put in <img src>. */
export const mediaSrc = (url: string | undefined) => (url && needsProxy(url) ? `/api/media?u=${encodeURIComponent(url)}` : url);
