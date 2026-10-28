import { z } from "zod";
import { get, run } from "@/lib/db";
import { hashPassword, newId } from "@/lib/crypto";
import { createSession, handler, HttpError } from "@/lib/auth";

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const POST = handler(async (req: Request) => {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const { name, email, password } = parsed.data;
  if (get("SELECT 1 FROM users WHERE email = ?", email)) throw new HttpError(409, "An account with that email already exists");
  const id = newId();
  run("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)", id, email, name, hashPassword(password), new Date().toISOString());
  await createSession(id);
  return Response.json({ ok: true });
});
