export interface PlayerProfile {
  playerId: string;
  nickname: string;
  avatarUrl: string | null;
}

export interface WeChatLaunchOptions {
  query?: Record<string, unknown>;
}

export type WeChatLaunchOptionsHandler = (options: WeChatLaunchOptions) => void;

export interface WeChatSharePayload {
  title: string;
  query: string;
  imageUrl?: string;
}

export interface WeChatShareRoomOptions extends Partial<WeChatSharePayload> {
  serverUrl?: string | null;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface WeChatMiniGameApi {
  getLaunchOptionsSync?(): WeChatLaunchOptions;
  getSystemInfoSync?(): { platform?: string; brand?: string; model?: string };
  getStorageSync?(key: string): unknown;
  setStorageSync?(key: string, value: string): void;
  removeStorageSync?(key: string): void;
  onShareAppMessage?(factory: () => WeChatSharePayload): void;
  shareAppMessage?(payload: WeChatSharePayload): void;
  onShow?(handler: WeChatLaunchOptionsHandler): void;
  offShow?(handler: WeChatLaunchOptionsHandler): void;
}

export interface WeChatPlatformOptions {
  wx?: WeChatMiniGameApi | null;
  storage?: KeyValueStorage | null;
  storageKey?: string;
  defaultNickname?: string;
  shareTitle?: string;
  shareImageUrl?: string;
  nowMs?: () => number;
  random?: () => number;
}

export const PLAYER_PROFILE_STORAGE_KEY = 'prop_hide_seek_player_profile_v1';
export const DEFAULT_PLAYER_NICKNAME = 'Player';
export const DEFAULT_SHARE_TITLE = 'Join my Prop Hide & Seek room';

export class WeChatPlatform {
  private readonly wx: WeChatMiniGameApi | null;
  private readonly storage: KeyValueStorage;
  private readonly storageKey: string;
  private readonly defaultNickname: string;
  private readonly shareTitle: string;
  private readonly shareImageUrl?: string;
  private readonly nowMs: () => number;
  private readonly random: () => number;

  public constructor(options: WeChatPlatformOptions = {}) {
    this.wx = options.wx === undefined ? getGlobalWeChatApi() : options.wx;
    this.storage = options.storage ?? createRuntimeStorage(this.wx);
    this.storageKey = options.storageKey ?? PLAYER_PROFILE_STORAGE_KEY;
    this.defaultNickname = normalizeNickname(options.defaultNickname) ?? DEFAULT_PLAYER_NICKNAME;
    this.shareTitle = normalizeNickname(options.shareTitle) ?? DEFAULT_SHARE_TITLE;
    this.shareImageUrl = normalizeOptionalText(options.shareImageUrl) ?? undefined;
    this.nowMs = options.nowMs ?? (() => Date.now());
    this.random = options.random ?? (() => Math.random());
  }

  public getOrCreatePlayerProfile(nicknameHint?: string | null): PlayerProfile {
    const cached = this.loadPlayerProfile();
    if (cached) {
      return cached;
    }

    const profile: PlayerProfile = {
      playerId: createLocalPlayerId(this.nowMs(), this.random()),
      nickname: normalizeNickname(nicknameHint) ?? this.defaultNickname,
      avatarUrl: null
    };

    this.savePlayerProfile(profile);
    return { ...profile };
  }

  public loadPlayerProfile(): PlayerProfile | null {
    const raw = this.storage.getItem(this.storageKey);
    if (!raw) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }

    return normalizePlayerProfile(parsed);
  }

  public savePlayerProfile(profile: PlayerProfile): PlayerProfile {
    const normalized = normalizePlayerProfile(profile);
    if (!normalized) {
      throw new Error('Invalid player profile.');
    }

    this.storage.setItem(this.storageKey, JSON.stringify(normalized));
    return { ...normalized };
  }

  public clearPlayerProfile(): void {
    if (this.storage.removeItem) {
      this.storage.removeItem(this.storageKey);
      return;
    }

    this.storage.setItem(this.storageKey, '');
  }

  public getLaunchRoomId(launchOptions?: WeChatLaunchOptions | null): string | null {
    const options = launchOptions ?? this.wx?.getLaunchOptionsSync?.() ?? null;
    return readRoomIdFromLaunchOptions(options);
  }

  public getLaunchServerUrl(launchOptions?: WeChatLaunchOptions | null): string | null {
    const options = launchOptions ?? this.wx?.getLaunchOptionsSync?.() ?? null;
    return readServerUrlFromLaunchOptions(options);
  }

  public onShowLaunchOptions(handler: WeChatLaunchOptionsHandler): (() => void) | null {
    if (typeof this.wx?.onShow !== 'function') {
      return null;
    }

    const onShow: WeChatLaunchOptionsHandler = (options) => handler(options ?? {});
    this.wx.onShow(onShow);
    return () => this.wx?.offShow?.(onShow);
  }

  public isDevToolsRuntime(): boolean {
    if (!this.wx) {
      return false;
    }

    try {
      const info = this.wx.getSystemInfoSync?.();
      return info?.platform === 'devtools';
    } catch {
      return false;
    }
  }

  public createShareRoomPayload(roomId: string, options: WeChatShareRoomOptions = {}): WeChatSharePayload {
    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId) {
      throw new Error('A valid roomId is required to create a share payload.');
    }

    const normalizedServerUrl = normalizeServerUrl(options.serverUrl);
    const payload: WeChatSharePayload = {
      title: normalizeNickname(options.title) ?? this.shareTitle,
      query: createShareQuery(normalizedRoomId, normalizedServerUrl)
    };

    const imageUrl = normalizeOptionalText(options.imageUrl) ?? this.shareImageUrl;
    if (imageUrl) {
      payload.imageUrl = imageUrl;
    }

    return payload;
  }

  public registerRoomShare(roomId: string, options: WeChatShareRoomOptions = {}): boolean {
    if (typeof this.wx?.onShareAppMessage !== 'function') {
      return false;
    }

    this.wx.onShareAppMessage(() => this.createShareRoomPayload(roomId, options));
    return true;
  }

  public shareRoom(roomId: string, options: WeChatShareRoomOptions = {}): boolean {
    if (typeof this.wx?.shareAppMessage !== 'function') {
      return false;
    }

    this.wx.shareAppMessage(this.createShareRoomPayload(roomId, options));
    return true;
  }
}

export function readRoomIdFromLaunchOptions(options: WeChatLaunchOptions | null | undefined): string | null {
  if (!options || !isRecord(options.query)) {
    return null;
  }

  return normalizeRoomId(options.query.roomId);
}

export function readServerUrlFromLaunchOptions(options: WeChatLaunchOptions | null | undefined): string | null {
  if (!options || !isRecord(options.query)) {
    return null;
  }

  return normalizeServerUrl(options.query.serverUrl);
}

export function normalizeRoomId(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const normalized = String(value).trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function normalizePlayerProfile(value: unknown): PlayerProfile | null {
  if (!isRecord(value)) {
    return null;
  }

  const playerId = normalizePlayerId(value.playerId);
  const nickname = normalizeNickname(value.nickname);
  if (!playerId || !nickname) {
    return null;
  }

  return {
    playerId,
    nickname,
    avatarUrl: normalizeOptionalText(value.avatarUrl)
  };
}

function createShareQuery(roomId: string, serverUrl: string | null): string {
  const parts = [`roomId=${encodeURIComponent(roomId)}`];
  if (serverUrl) {
    parts.push(`serverUrl=${encodeURIComponent(serverUrl)}`);
  }

  return parts.join('&');
}

function normalizeServerUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return /^wss?:\/\/\S+$/i.test(trimmedValue) ? trimmedValue : null;
}

function createRuntimeStorage(wx: WeChatMiniGameApi | null): KeyValueStorage {
  if (typeof wx?.getStorageSync === 'function' && typeof wx.setStorageSync === 'function') {
    return new WeChatStorageAdapter(wx);
  }

  const browserStorage = getGlobalBrowserStorage();
  if (browserStorage) {
    return browserStorage;
  }

  return new MemoryStorage();
}

function getGlobalWeChatApi(): WeChatMiniGameApi | null {
  const maybeGlobal = globalThis as { wx?: WeChatMiniGameApi };
  return maybeGlobal.wx ?? null;
}

function getGlobalBrowserStorage(): KeyValueStorage | null {
  const maybeGlobal = globalThis as { localStorage?: Partial<KeyValueStorage> };
  const storage = maybeGlobal.localStorage;
  return typeof storage?.getItem === 'function' && typeof storage.setItem === 'function'
    ? (storage as KeyValueStorage)
    : null;
}

function createLocalPlayerId(nowMs: number, randomValue: number): string {
  const timePart = Math.max(0, Math.floor(nowMs)).toString(36);
  const randomPart = Math.floor(Math.max(0, Math.min(0.999999, randomValue)) * 0x1000000)
    .toString(36)
    .padStart(5, '0');
  return `local_${timePart}_${randomPart}`;
}

function normalizePlayerId(value: unknown): string | null {
  const normalized = normalizeOptionalText(value);
  return normalized && normalized.length <= 80 ? normalized : null;
}

function normalizeNickname(value: unknown): string | null {
  const normalized = normalizeOptionalText(value);
  return normalized && normalized.length <= 24 ? normalized : null;
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

class WeChatStorageAdapter implements KeyValueStorage {
  public constructor(private readonly wx: WeChatMiniGameApi) {}

  public getItem(key: string): string | null {
    const value = this.wx.getStorageSync?.(key);
    if (typeof value === 'string') {
      return value;
    }

    return value === undefined || value === null ? null : JSON.stringify(value);
  }

  public setItem(key: string, value: string): void {
    this.wx.setStorageSync?.(key, value);
  }

  public removeItem(key: string): void {
    if (typeof this.wx.removeStorageSync === 'function') {
      this.wx.removeStorageSync(key);
      return;
    }

    this.wx.setStorageSync?.(key, '');
  }
}

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  public removeItem(key: string): void {
    this.values.delete(key);
  }
}

export const weChatPlatform = new WeChatPlatform();
