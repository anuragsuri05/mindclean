import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listAccounts } from "@/lib/accounts";
import { FocusSetup } from "@/components/FocusSetup";

export default async function WelcomeFocus() {
  const user = await requireUser();
  const accounts = listAccounts(user.id);
  if (accounts.length === 0) redirect("/welcome/connect");
  return <FocusSetup accounts={accounts} mode="onboarding" />;
}
