import { z } from "zod";
import { get } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto";
import { createSession, handler, HttpError } from "@/lib/auth";

const Body = z.object({ email: z.string().trim().toLowerCase(), password: z.string() });

export const POST = handler(async (req: Request) => {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, "Email and password are required");
  const user = get<{ id: string; password_hash: string }>("SELECT id, password_hash FROM users WHERE email = ?", parsed.data.email);
  if (!user || !verifyPassword(parsed.data.password, user.password_hash)) throw new HttpError(401, "Incorrect email or password");
  await createSession(user.id);
  return Response.json({ ok: true });
});
