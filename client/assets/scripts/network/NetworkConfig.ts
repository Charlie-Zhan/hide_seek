export const DEFAULT_ROOM_SERVER_URL = 'ws://localhost:8787';
export const ROOM_SERVER_URL_STORAGE_KEY = 'prop_hide_seek_room_server_url';
export const ROOM_SERVER_URL_GLOBAL_KEY = '__PROP_HIDE_SEEK_ROOM_SERVER_URL__';

export interface RoomServerUrlStorage {
  getStorageSync(key: string): unknown;
}

export interface RoomServerUrlConfigSource {
  explicitUrl?: unknown;
  globalConfig?: { roomServerUrl?: unknown } | null;
  storage?: RoomServerUrlStorage | null;
  storageKey?: string;
}

interface RuntimeRoomServerConfig {
  __PROP_HIDE_SEEK_ROOM_SERVER_URL__?: unknown;
  __PROP_HIDE_SEEK_CONFIG__?: { roomServerUrl?: unknown };
  wx?: Partial<RoomServerUrlStorage>;
}

export function normalizeRoomServerUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  if (/^wss?:\/\/\S+$/i.test(trimmedValue)) {
    return trimmedValue;
  }

  return null;
}

export function resolveRoomServerUrl(source: RoomServerUrlConfigSource = {}): string {
  const runtime = globalThis as RuntimeRoomServerConfig;
  const storageKey = source.storageKey ?? ROOM_SERVER_URL_STORAGE_KEY;
  const storage = source.storage ?? runtime.wx;

  return normalizeRoomServerUrl(source.explicitUrl) ??
    normalizeRoomServerUrl(source.globalConfig?.roomServerUrl) ??
    normalizeRoomServerUrl(runtime.__PROP_HIDE_SEEK_ROOM_SERVER_URL__) ??
    normalizeRoomServerUrl(runtime.__PROP_HIDE_SEEK_CONFIG__?.roomServerUrl) ??
    normalizeRoomServerUrl(readStoredRoomServerUrl(storage, storageKey)) ??
    DEFAULT_ROOM_SERVER_URL;
}

export const NetworkConfig = {
  defaultRoomServerUrl: DEFAULT_ROOM_SERVER_URL,
  roomServerUrlStorageKey: ROOM_SERVER_URL_STORAGE_KEY,
  roomServerUrlGlobalKey: ROOM_SERVER_URL_GLOBAL_KEY,
  resolveRoomServerUrl,
  reconnectDelayMs: 1000,
  reconnectMaxAttempts: 3,
  reconnectMaxElapsedMs: 10_000
} as const;

function readStoredRoomServerUrl(storage: Partial<RoomServerUrlStorage> | null | undefined, storageKey: string): unknown {
  if (typeof storage?.getStorageSync !== 'function') {
    return null;
  }

  try {
    return storage.getStorageSync(storageKey);
  } catch {
    return null;
  }
}
