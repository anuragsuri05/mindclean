import { apiUser, handler, HttpError } from "@/lib/auth";
import { DayParam } from "@/lib/events";
import { insights } from "@/lib/insights";

export const GET = handler(async (req: Request) => {
  const user = await apiUser();
  const day = DayParam.safeParse(new URL(req.url).searchParams.get("day"));
  if (!day.success) throw new HttpError(400, "day=YYYY-MM-DD is required");
  return Response.json(insights(user.id, day.data));
});
