import { apiUser, handler, HttpError } from "@/lib/auth";
import { needsProxy } from "@/lib/media";

const MAX_BYTES = 10 * 1024 * 1024;

/** Streams an image from an allow-listed social CDN (signed-in users only). */
export const GET = handler(async (req: Request) => {
  await apiUser();
  const target = new URL(req.url).searchParams.get("u") ?? "";
  if (!needsProxy(target)) throw new HttpError(400, "Host not allowed");
  const upstream = await fetch(target, {
    headers: { "User-Agent": "Mozilla/5.0 (Mindclean media proxy)", Accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  const type = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !upstream.body) throw new HttpError(502, "Upstream image unavailable");
  if (!type.startsWith("image/")) throw new HttpError(415, "Not an image");
  if (Number(upstream.headers.get("content-length") ?? 0) > MAX_BYTES) throw new HttpError(413, "Image too large");
  return new Response(upstream.body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
});
