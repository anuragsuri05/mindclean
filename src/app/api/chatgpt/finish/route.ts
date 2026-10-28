import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, currentUser, secureCookies } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { CLIENT_COOKIE } from "@/lib/chatgpt/flow";

/** Consumes the one-time ticket from the loopback callback and signs the user in on this origin. */
export async function GET(req: Request) {
  const ticket = new URL(req.url).searchParams.get("ticket") ?? "";
  const hash = sha256(ticket);
  const row = get<{ user_id: string; next: string; client_id: string | null; expires_at: string }>(
    "SELECT * FROM login_tickets WHERE token_hash = ?",
    hash,
  );
  run("DELETE FROM login_tickets WHERE token_hash = ? OR expires_at < ?", hash, new Date().toISOString());
  if (!row || Date.parse(row.expires_at) < Date.now()) redirect("/?chatgpt_error=expired");

  const user = await currentUser();
  if (user?.id !== row.user_id) await createSession(row.user_id);
  if (row.client_id) {
    (await cookies()).set(CLIENT_COOKIE, row.client_id, {
      httpOnly: true,
      sameSite: "lax",
      secure: await secureCookies(),
      path: "/",
      maxAge: 365 * 86_400,
    });
  }
  redirect(`${row.next}${row.next.includes("?") ? "&" : "?"}chatgpt=connected`);
}
