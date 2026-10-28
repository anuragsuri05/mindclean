import { z } from "zod";
import { apiUser, handler, HttpError } from "@/lib/auth";
import { itemOwner, savedItems } from "@/lib/feed";
import { run } from "@/lib/db";

export const GET = handler(async () => {
  const user = await apiUser();
  return Response.json({ items: savedItems(user.id) });
});

/** Save or unsave a post (the bookmark icon). */
export const POST = handler(async (req: Request) => {
  const user = await apiUser();
  const parsed = z.object({ itemId: z.string().min(1).max(500), saved: z.boolean() }).safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, "Invalid request");
  if (!itemOwner(user.id, parsed.data.itemId)) throw new HttpError(404, "Post not found");
  if (parsed.data.saved) {
    run("INSERT OR IGNORE INTO saved_items (user_id, item_id, saved_at) VALUES (?, ?, ?)", user.id, parsed.data.itemId, new Date().toISOString());
  } else {
    run("DELETE FROM saved_items WHERE user_id = ? AND item_id = ?", user.id, parsed.data.itemId);
  }
  return Response.json({ ok: true });
});
