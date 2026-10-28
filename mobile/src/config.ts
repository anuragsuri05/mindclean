import Constants from "expo-constants";

/**
 * Where the Mindclean website runs: EXPO_PUBLIC_MINDCLEAN_URL (your production
 * https URL), or in development the computer the app was loaded from.
 */
// In development the app was loaded from your computer (Metro), so Mindclean is on that
// same machine: use its address with Mindclean's port (EXPO_PUBLIC_MINDCLEAN_PORT, default 3000).
const devHost = __DEV__ ? Constants.expoConfig?.hostUri?.split(":")[0] : undefined;
const devUrl = devHost ? `http://${devHost}:${process.env.EXPO_PUBLIC_MINDCLEAN_PORT ?? "3000"}` : undefined;

export const BASE_URL = (process.env.EXPO_PUBLIC_MINDCLEAN_URL ?? devUrl ?? "http://localhost:3000").replace(/\/$/, "");
export const BASE_ORIGIN = new URL(BASE_URL).origin;

export const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";

/**
 * The hidden reader and the login screens use the same desktop browser
 * identity, so sessions stay consistent and the readers see the layouts they
 * were written for.
 */
export const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

/** Feeds refresh when the app opens and every 30 minutes while it's open. */
export const SYNC_EVERY_MS = 30 * 60_000;
/** Generous: real Instagram took ~11s just to render posts on a slow device. */
export const READER_TIMEOUT_MS = 150_000;
