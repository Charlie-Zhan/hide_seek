export const DEFAULT_ROOM_SERVER_URL = 'ws://127.0.0.1:8787';
export const ROOM_SERVER_URL_STORAGE_KEY = 'prop_hide_seek_room_server_url';
export const ROOM_SERVER_URL_GLOBAL_KEY = '__PROP_HIDE_SEEK_ROOM_SERVER_URL__';

export interface RoomServerUrlStorage {
  getStorageSync(key: string): unknown;
  setStorageSync?(key: string, value: string): void;
}

export interface BrowserRoomServerUrlStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
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
  localStorage?: Partial<BrowserRoomServerUrlStorage>;
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
    normalizeRoomServerUrl(readBrowserRoomServerUrl(runtime.localStorage, storageKey)) ??
    DEFAULT_ROOM_SERVER_URL;
}

export function saveRoomServerUrl(value: unknown, storageKey = ROOM_SERVER_URL_STORAGE_KEY): string | null {
  const normalizedUrl = normalizeRoomServerUrl(value);
  if (!normalizedUrl) {
    return null;
  }

  const runtime = globalThis as RuntimeRoomServerConfig;
  writeStoredRoomServerUrl(runtime.wx, storageKey, normalizedUrl);
  writeBrowserRoomServerUrl(runtime.localStorage, storageKey, normalizedUrl);
  runtime.__PROP_HIDE_SEEK_ROOM_SERVER_URL__ = normalizedUrl;
  return normalizedUrl;
}

export const NetworkConfig = {
  defaultRoomServerUrl: DEFAULT_ROOM_SERVER_URL,
  roomServerUrlStorageKey: ROOM_SERVER_URL_STORAGE_KEY,
  roomServerUrlGlobalKey: ROOM_SERVER_URL_GLOBAL_KEY,
  resolveRoomServerUrl,
  saveRoomServerUrl,
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

function writeStoredRoomServerUrl(
  storage: Partial<RoomServerUrlStorage> | null | undefined,
  storageKey: string,
  value: string
): void {
  if (typeof storage?.setStorageSync !== 'function') {
    return;
  }

  try {
    storage.setStorageSync(storageKey, value);
  } catch {
    // Runtime storage is a convenience for local testing; the in-memory override above still applies.
  }
}

function readBrowserRoomServerUrl(
  storage: Partial<BrowserRoomServerUrlStorage> | null | undefined,
  storageKey: string
): unknown {
  if (typeof storage?.getItem !== 'function') {
    return null;
  }

  try {
    return storage.getItem(storageKey);
  } catch {
    return null;
  }
}

function writeBrowserRoomServerUrl(
  storage: Partial<BrowserRoomServerUrlStorage> | null | undefined,
  storageKey: string,
  value: string
): void {
  if (typeof storage?.setItem !== 'function') {
    return;
  }

  try {
    storage.setItem(storageKey, value);
  } catch {
    // Ignore storage failures; the runtime global override is enough for the current session.
  }
}
