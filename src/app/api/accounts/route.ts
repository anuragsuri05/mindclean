import { z } from "zod";
import { apiUser, handler, HttpError } from "@/lib/auth";
import { createAccount, listAccounts } from "@/lib/accounts";
import { demoProfile, formConnectors, ConnectorError } from "@/lib/connectors";
import { isPlatform, PLATFORM_BY_ID } from "@/lib/platforms";
import { randomToken } from "@/lib/crypto";

export const GET = handler(async () => {
  const user = await apiUser();
  return Response.json({ accounts: listAccounts(user.id) });
});

const Body = z.object({
  platform: z.string(),
  mode: z.enum(["live", "demo"]),
  fields: z.record(z.string(), z.string().max(2000)).default({}),
});

/** Connect a form-based platform (Bluesky, Mastodon, RSS) or add a demo feed. OAuth platforms use /api/oauth. */
export const POST = handler(async (req: Request) => {
  const user = await apiUser();
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success || !isPlatform(parsed.data.platform)) throw new HttpError(400, "Unknown platform");
  const { platform, mode, fields } = parsed.data as { platform: keyof typeof PLATFORM_BY_ID; mode: "live" | "demo"; fields: Record<string, string> };

  if (mode === "demo") {
    const account = createAccount(user.id, platform, "demo", demoProfile(platform), { platform, seed: randomToken(6) });
    return Response.json({ account });
  }

  const connector = formConnectors[platform];
  if (!connector) throw new HttpError(400, `${PLATFORM_BY_ID[platform].name} doesn't support form connection`);
  try {
    const { credentials, profile } = await connector.connect(fields);
    return Response.json({ account: createAccount(user.id, platform, "live", profile, credentials) });
  } catch (err) {
    if (err instanceof ConnectorError) throw new HttpError(400, err.message);
    throw err;
  }
});
