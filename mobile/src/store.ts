import AsyncStorage from "@react-native-async-storage/async-storage";

export interface PlatformStatus {
  state?: "syncing" | "ok" | "empty" | "needs_login" | "error";
  count?: number;
  error?: string | null;
  at?: number;
}

export interface DeviceState {
  enabled: Record<string, boolean>;
  status: Record<string, PlatformStatus>;
  lastSyncAt: number | null;
}

/** Connected platforms are stored per Mindclean account: a phone can be shared. */
const keyFor = (user: string) => `mindclean.device.v2.${user}`;
export const EMPTY_STATE: DeviceState = { enabled: {}, status: {}, lastSyncAt: null };

export async function loadState(user: string): Promise<DeviceState> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(user));
    return raw ? { ...EMPTY_STATE, ...(JSON.parse(raw) as Partial<DeviceState>) } : EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}

export async function saveState(user: string, state: DeviceState) {
  await AsyncStorage.setItem(keyFor(user), JSON.stringify(state)).catch(() => {});
}
