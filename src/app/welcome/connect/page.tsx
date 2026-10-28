import { requireUser } from "@/lib/auth";
import { listAccounts } from "@/lib/accounts";
import { oauthConnectors } from "@/lib/connectors";
import { connectFlash } from "@/lib/flash";
import { ConnectSources } from "@/components/ConnectSources";

export default async function WelcomeConnect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  return (
    <ConnectSources
      mode="onboarding"
      accounts={listAccounts(user.id)}
      oauthReady={Object.fromEntries(Object.entries(oauthConnectors).map(([id, c]) => [id, c!.configured()]))}
      flash={connectFlash(await searchParams)}
    />
  );
}
