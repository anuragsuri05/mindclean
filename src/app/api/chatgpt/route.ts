import { z } from "zod";
import { apiUser, handler, HttpError } from "@/lib/auth";
import { redirectUri } from "@/lib/chatgpt/oauth";
import { connectionStatus, disconnect, setModel } from "@/lib/chatgpt/store";
import { ChatGptError, listModels } from "@/lib/chatgpt/responses";

/** Connection status, plus the models this ChatGPT plan can use. */
export const GET = handler(async (req: Request) => {
  const user = await apiUser();
  const status = connectionStatus(user.id);
  let models: { slug: string; name: string }[] = [];
  let modelsError: string | null = null;
  if (status?.sharing) {
    try {
      models = await listModels(user.id);
    } catch (err) {
      modelsError = err instanceof ChatGptError ? err.message : "Couldn't load models";
    }
  }
  return Response.json({
    available: redirectUri(req.url) !== null,
    status: connectionStatus(user.id),
    models,
    modelsError,
  });
});

export const PATCH = handler(async (req: Request) => {
  const user = await apiUser();
  const parsed = z.object({ model: z.string().min(1).max(200) }).safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, "Invalid model");
  setModel(user.id, parsed.data.model);
  return Response.json({ status: connectionStatus(user.id) });
});

export const DELETE = handler(async () => {
  const user = await apiUser();
  const { revoked } = await disconnect(user.id);
  return Response.json({ revoked, status: connectionStatus(user.id) });
});
