import { apiUser, handler, HttpError } from "@/lib/auth";
import { getAccount } from "@/lib/accounts";
import { accountPage, mixPage, savedIds } from "@/lib/feed";
import { bucketFor, currentPlan, ensureToday } from "@/lib/plans";
import { DayParam } from "@/lib/events";
import { dailyGoal } from "@/lib/engine/schedule";

/**
 * GET /api/feed?view=mix&day=YYYY-MM-DD[&session=…]   → the personalised mix
 * GET /api/feed?view=<accountId>&day=…[&offset=n]     → one source's own feed
 */
export const GET = handler(async (req: Request) => {
  const user = await apiUser();
  const params = new URL(req.url).searchParams;
  const view = params.get("view") ?? "mix";
  const day = DayParam.safeParse(params.get("day"));
  if (!day.success) throw new HttpError(400, "day=YYYY-MM-DD is required");

  const plan = currentPlan(user.id);
  const today = plan ? ensureToday(plan, day.data) : null;
  const goal = plan && today ? dailyGoal(today.ratio, plan.dailyBudget) : null;

  const page =
    view === "mix"
      ? await mixPage(user.id, plan, today, params.get("session"))
      : await (async () => {
          const account = getAccount(user.id, view);
          if (!account) throw new HttpError(404, "Source not found");
          const offset = Math.max(0, Number(params.get("offset") ?? 0) || 0);
          return accountPage(account, offset, bucketFor(plan, account.id));
        })();

  const saved = savedIds(user.id, page.items.map((i) => i.id));
  return Response.json({
    ...page,
    items: page.items.map((i) => ({ ...i, saved: saved.has(i.id) })),
    today,
    goal,
    planStatus: plan?.status ?? null,
  });
});
