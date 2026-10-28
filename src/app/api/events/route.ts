import { apiUser, handler, HttpError } from "@/lib/auth";
import { EventsBody, recordEvents } from "@/lib/events";

export const POST = handler(async (req: Request) => {
  const user = await apiUser();
  // sendBeacon posts text/plain, so parse the body manually.
  const parsed = EventsBody.safeParse(JSON.parse(await req.text()));
  if (!parsed.success) throw new HttpError(400, "Invalid events");
  recordEvents(user.id, parsed.data);
  return Response.json({ ok: true });
});
