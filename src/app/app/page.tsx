import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listAccounts } from "@/lib/accounts";
import { currentPlan } from "@/lib/plans";
import { nextStep } from "@/lib/onboarding";
import { Feed } from "@/components/Feed";

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const step = nextStep(user.id);
  if (step !== "/app") redirect(step);
  return (
    <Feed
      accounts={listAccounts(user.id)}
      plan={currentPlan(user.id)}
      userName={user.name}
      started={(await searchParams).started === "1"}
    />
  );
}
