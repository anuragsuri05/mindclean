import { z } from "zod";
import { apiUser, handler, HttpError } from "@/lib/auth";
import { listAccounts } from "@/lib/accounts";
import { createPlan, currentPlan, setPlanStatus } from "@/lib/plans";
import { DURATIONS } from "@/lib/engine/schedule";

export const GET = handler(async () => {
  const user = await apiUser();
  return Response.json({ plan: currentPlan(user.id) });
});

const tenths = z.number().min(0).max(1).refine((n) => Number.isInteger(Math.round(n * 1000) / 100), "Use steps of 0.1");

const Create = z
  .object({
    reduceHabits: z.array(z.string().max(40)).max(10),
    buildHabits: z.array(z.string().max(40)).min(1).max(10),
    note: z.string().max(1000).default(""),
    goalProfile: z.object({
      summary: z.string().max(500),
      targetTopics: z.array(z.string().max(80)).max(20),
      avoidTopics: z.array(z.string().max(80)).max(12),
    }),
    fromAccountIds: z.array(z.string()).max(30),
    toAccountIds: z.array(z.string()).min(1, "Pick at least one source to shift toward").max(30),
    startRatio: tenths,
    endRatio: tenths,
    durationDays: z.number().int().refine((d) => (DURATIONS as readonly number[]).includes(d), "Unsupported duration"),
    dailyBudget: z.number().int().min(10).max(1000),
    adaptive: z.boolean(),
  })
  .refine((p) => p.endRatio > p.startRatio, "The end mix must have more meaningful content than the start");

export const POST = handler(async (req: Request) => {
  const user = await apiUser();
  const parsed = Create.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const input = parsed.data;
  const owned = new Set(listAccounts(user.id).map((a) => a.id));
  if (![...input.fromAccountIds, ...input.toAccountIds].every((id) => owned.has(id))) throw new HttpError(400, "Unknown account");
  if (input.fromAccountIds.some((id) => input.toAccountIds.includes(id))) throw new HttpError(400, "A source can't be in both lists");
  const plan = createPlan(user.id, { ...input, goalText: input.note || input.goalProfile.summary });
  return Response.json({ plan });
});

const Patch = z.object({ status: z.enum(["active", "paused", "ended"]) });

export const PATCH = handler(async (req: Request) => {
  const user = await apiUser();
  const plan = currentPlan(user.id);
  if (!plan) throw new HttpError(404, "No plan");
  const parsed = Patch.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, "Invalid status");
  setPlanStatus(user.id, plan.id, parsed.data.status);
  return Response.json({ plan: currentPlan(user.id) });
});
