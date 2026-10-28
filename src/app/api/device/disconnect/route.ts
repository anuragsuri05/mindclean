import { z } from "zod";
import { apiUser, handler, HttpError } from "@/lib/auth";
import { isDevicePlatform, removeDeviceAccount } from "@/lib/device";

export const POST = handler(async (req: Request) => {
  const user = await apiUser();
  const parsed = z.object({ platform: z.string() }).safeParse(await req.json());
  if (!parsed.success || !isDevicePlatform(parsed.data.platform)) throw new HttpError(400, "Unknown platform");
  removeDeviceAccount(user.id, parsed.data.platform);
  return Response.json({ ok: true });
});
