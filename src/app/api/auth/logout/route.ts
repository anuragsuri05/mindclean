import { destroySession, handler } from "@/lib/auth";

export const POST = handler(async () => {
  await destroySession();
  return Response.json({ ok: true });
});
