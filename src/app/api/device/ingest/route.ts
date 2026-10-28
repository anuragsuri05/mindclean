import { apiUser, handler, HttpError } from "@/lib/auth";
import { ingest, IngestBody, isDevicePlatform } from "@/lib/device";

/** The Mindclean app pushes the posts it read from one platform's feed on the user's phone. */
export const POST = handler(async (req: Request) => {
  const user = await apiUser();
  const parsed = IngestBody.safeParse(await req.json());
  if (!parsed.success || !isDevicePlatform(parsed.data.platform)) throw new HttpError(400, "Invalid payload");
  return Response.json(ingest(user.id, parsed.data));
});
