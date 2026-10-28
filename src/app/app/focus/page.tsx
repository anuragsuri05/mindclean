import { requireUser } from "@/lib/auth";
import { listAccounts } from "@/lib/accounts";
import { currentPlan, planDays } from "@/lib/plans";
import { FocusSetup } from "@/components/FocusSetup";
import { FocusOverview } from "@/components/FocusOverview";

export default async function FocusPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const accounts = listAccounts(user.id);
  const plan = currentPlan(user.id);
  if (!plan || (await searchParams).new === "1") return <FocusSetup accounts={accounts} mode="new" />;
  return <FocusOverview plan={plan} accounts={accounts} currentLevel={planDays(plan.id).at(-1)?.level ?? 0} />;
}
