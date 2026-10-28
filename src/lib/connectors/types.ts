import type { FeedItem } from "../types";

/** An item as produced by a connector, before it is tied to an account. */
export type RawItem = Omit<FeedItem, "id" | "accountId" | "topic" | "category" | "alignment">;

export interface FetchResult<C> {
  items: RawItem[];
  nextCursor: string | null;
  /** Set when the connector refreshed tokens and they must be persisted. */
  credentials?: C;
}

export interface Profile {
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
}

export interface Connected<C> {
  credentials: C;
  profile: Profile;
}

export interface Connector<C = unknown> {
  fetchPage(credentials: C, cursor: string | null): Promise<FetchResult<C>>;
}

export interface FormConnector<C> extends Connector<C> {
  connect(fields: Record<string, string>): Promise<Connected<C>>;
}

export interface OAuthConnector<C> extends Connector<C> {
  configured(): boolean;
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<Connected<C>>;
}
