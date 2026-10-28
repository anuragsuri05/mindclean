import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/AuthScreen";
import { currentUser } from "@/lib/auth";
import { nextStep } from "@/lib/onboarding";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await currentUser();
  if (user) redirect(nextStep(user.id));
  return <AuthScreen chatgptError={(await searchParams).chatgpt_error} />;
}
