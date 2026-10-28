import { requireUser } from "@/lib/auth";
import { listAccounts } from "@/lib/accounts";
import { currentPlan, planDays } from "@/lib/plans";
import { savedItems } from "@/lib/feed";
import { streak } from "@/lib/engine/schedule";
import { ProfileView } from "@/components/ProfileView";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const params = await searchParams;
  const plan = currentPlan(user.id);
  const days = plan ? planDays(plan.id) : [];
  const active = days.filter((d) => d.shownFrom + d.shownTo > 0).map((d) => d.day);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ProfileView
      user={user}
      sources={listAccounts(user.id).length}
      activeDays={active.length}
      streak={streak(active, today)}
      saved={savedItems(user.id)}
      planSummary={plan?.goalProfile.summary ?? null}
      chatgptFlash={{ connected: params.chatgpt === "connected", error: params.chatgpt_error }}
    />
  );
}
