import { requireUser } from "@/lib/auth";
import { listAccounts } from "@/lib/accounts";
import { oauthConnectors } from "@/lib/connectors";
import { connectFlash } from "@/lib/flash";
import { ConnectSources } from "@/components/ConnectSources";

export default async function SourcesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  return (
    <ConnectSources
      mode="manage"
      accounts={listAccounts(user.id)}
      oauthReady={Object.fromEntries(Object.entries(oauthConnectors).map(([id, c]) => [id, c!.configured()]))}
      flash={connectFlash(await searchParams)}
    />
  );
}
