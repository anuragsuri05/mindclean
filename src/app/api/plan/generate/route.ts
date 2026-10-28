import { z } from "zod";
import { apiUser, handler, HttpError } from "@/lib/auth";
import { listAccounts } from "@/lib/accounts";
import { generateFocusPlan } from "@/lib/ai/goal";

export const FocusBody = z.object({
  reduceHabits: z.array(z.string().max(40)).max(10),
  buildHabits: z.array(z.string().max(40)).min(1, "Pick at least one habit to build").max(10),
  interests: z.array(z.string().max(60)).max(20).default([]),
  note: z.string().max(1000).default(""),
});

/** Turns Focus Setup choices into a personalised plan proposal (not saved yet). */
export const POST = handler(async (req: Request) => {
  const user = await apiUser();
  const parsed = FocusBody.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const accounts = listAccounts(user.id);
  const plan = await generateFocusPlan(user.id, parsed.data, accounts);
  if (plan.toAccountIds.length === 0) {
    throw new HttpError(400, "None of your connected sources match the habits you want to build. Connect LinkedIn, a news source, or a learning source first.");
  }
  return Response.json({ plan });
});
