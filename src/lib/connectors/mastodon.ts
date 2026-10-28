import "server-only";
import type { FormConnector, RawItem } from "./types";
import { assertPublicUrl, ConnectorError, fetchJson, stripHtml } from "./http";

interface MastodonCreds {
  instance: string;
  token: string;
}

interface MAccount {
  acct: string;
  display_name: string;
  avatar: string;
}

interface Status {
  id: string;
  url: string | null;
  uri: string;
  created_at: string;
  content: string;
  spoiler_text: string;
  sensitive: boolean;
  account: MAccount;
  reblog: Status | null;
  media_attachments: { type: string; url: string; preview_url: string }[];
  card: { title: string; image: string | null } | null;
}

function toItem(status: Status, instance: string): RawItem {
  const s = status.reblog ?? status;
  return {
    platform: "mastodon",
    externalId: status.id,
    authorName: s.account.display_name || s.account.acct,
    authorHandle: `@${s.account.acct}`,
    authorAvatar: s.account.avatar,
    title: s.card?.title,
    text: s.spoiler_text ? `CW: ${s.spoiler_text}` : stripHtml(s.content),
    url: s.url ?? `${instance}/@${s.account.acct}/${s.id}`,
    media: s.sensitive
      ? []
      : s.media_attachments.slice(0, 4).map((m) => ({
          kind: m.type === "image" ? ("image" as const) : ("video" as const),
          url: m.url,
          thumbnail: m.preview_url,
        })),
    createdAt: s.created_at,
  };
}

const auth = (creds: MastodonCreds) => ({ headers: { Authorization: `Bearer ${creds.token}` } });

export const mastodon: FormConnector<MastodonCreds> = {
  async connect(fields) {
    const url = await assertPublicUrl(fields.instance?.startsWith("http") ? fields.instance : `https://${fields.instance}`);
    const creds = { instance: url.origin, token: fields.token?.trim() };
    if (!creds.token) throw new ConnectorError("An access token is required.");
    const me = await fetchJson<MAccount>(`${creds.instance}/api/v1/accounts/verify_credentials`, auth(creds));
    return {
      credentials: creds,
      profile: { displayName: me.display_name || me.acct, handle: `@${me.acct}@${url.hostname}`, avatarUrl: me.avatar },
    };
  },

  async fetchPage(creds, cursor) {
    const statuses = await fetchJson<Status[]>(
      `${creds.instance}/api/v1/timelines/home?limit=40${cursor ? `&max_id=${encodeURIComponent(cursor)}` : ""}`,
      auth(creds),
    );
    return {
      items: statuses.map((s) => toItem(s, creds.instance)),
      nextCursor: statuses.length ? statuses[statuses.length - 1].id : null,
    };
  },
};
