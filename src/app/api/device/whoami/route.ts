import { currentUser, handler } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";

/**
 * Lets the mobile app keep connected platforms per Mindclean account (a phone
 * can be shared), without exposing the user id itself.
 */
export const GET = handler(async () => {
  const user = await currentUser();
  return Response.json({ key: user ? sha256(`device:${user.id}`).slice(0, 24) : null });
});
