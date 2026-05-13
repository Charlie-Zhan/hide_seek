import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  DEFAULT_PLAYER_NICKNAME,
  WeChatPlatform,
  readRoomIdFromLaunchOptions,
  type KeyValueStorage,
  type WeChatMiniGameApi,
  type WeChatSharePayload
} from '../assets/scripts/wechat/WeChatPlatform';

describe('Phase 05 WeChat platform profile cache', () => {
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    delete (globalThis as { wx?: unknown }).wx;
  });

  it('creates and persists a local player profile with a stable default nickname', () => {
    const storage = new FakeStorage();
    const platform = new WeChatPlatform({
      storage,
      nowMs: () => 1000,
      random: () => 0.5
    });

    const created = platform.getOrCreatePlayerProfile();
    assert.match(created.playerId, /^local_rs_/);
    assert.equal(created.nickname, DEFAULT_PLAYER_NICKNAME);
    assert.equal(created.avatarUrl, null);

    const reloaded = platform.getOrCreatePlayerProfile('Ignored Name');
    assert.deepEqual(reloaded, created);
  });

  it('uses a nickname hint for first-run browser profiles and trims unsafe blank values', () => {
    const browserStorage = new FakeStorage();
    (globalThis as { localStorage?: KeyValueStorage }).localStorage = browserStorage;

    const platform = new WeChatPlatform({
      wx: null,
      nowMs: () => 2000,
      random: () => 0.25
    });

    const profile = platform.getOrCreatePlayerProfile('  Hider A  ');
    assert.equal(profile.nickname, 'Hider A');
    assert.equal(platform.loadPlayerProfile()?.nickname, 'Hider A');

    platform.clearPlayerProfile();
    assert.equal(platform.getOrCreatePlayerProfile('   ').nickname, DEFAULT_PLAYER_NICKNAME);
  });

  it('loads profile data from WeChat storage when wx APIs are available', () => {
    const wx = new FakeWeChatApi();
    wx.storage.set(
      'prop_hide_seek_player_profile_v1',
      JSON.stringify({
        playerId: 'openid_test_1',
        nickname: 'WX Player',
        avatarUrl: 'https://example.test/avatar.png'
      })
    );

    const profile = new WeChatPlatform({ wx }).getOrCreatePlayerProfile();
    assert.deepEqual(profile, {
      playerId: 'openid_test_1',
      nickname: 'WX Player',
      avatarUrl: 'https://example.test/avatar.png'
    });
  });

  it('ignores malformed cached profiles and replaces them with a valid temporary identity', () => {
    const storage = new FakeStorage();
    storage.setItem('prop_hide_seek_player_profile_v1', '{"playerId":"","nickname":""}');

    const profile = new WeChatPlatform({
      storage,
      nowMs: () => 3000,
      random: () => 0.75
    }).getOrCreatePlayerProfile('Recovered');

    assert.match(profile.playerId, /^local_2bc_/);
    assert.equal(profile.nickname, 'Recovered');
  });
});

describe('Phase 05 WeChat launch room query', () => {
  it('reads valid roomId values from launch options', () => {
    assert.equal(readRoomIdFromLaunchOptions({ query: { roomId: 'ABC123' } }), 'ABC123');
    assert.equal(readRoomIdFromLaunchOptions({ query: { roomId: ' room_01 ' } }), 'room_01');
    assert.equal(readRoomIdFromLaunchOptions({ query: { roomId: 123456 } }), '123456');
  });

  it('rejects missing or malformed roomId values', () => {
    assert.equal(readRoomIdFromLaunchOptions({ query: {} }), null);
    assert.equal(readRoomIdFromLaunchOptions({ query: { roomId: '' } }), null);
    assert.equal(readRoomIdFromLaunchOptions({ query: { roomId: 'room with spaces' } }), null);
    assert.equal(readRoomIdFromLaunchOptions({ query: { roomId: '../room' } }), null);
  });

  it('can read launch roomId from the active wx runtime', () => {
    const wx = new FakeWeChatApi();
    wx.launchOptions = { query: { roomId: 'ROOM_9' } };

    assert.equal(new WeChatPlatform({ wx }).getLaunchRoomId(), 'ROOM_9');
  });
});

describe('Phase 05 WeChat room share payloads', () => {
  it('generates a room share payload with encoded roomId query', () => {
    const payload = new WeChatPlatform({
      wx: null,
      shareTitle: 'Join Room'
    }).createShareRoomPayload('room_01');

    assert.deepEqual(payload, {
      title: 'Join Room',
      query: 'roomId=room_01'
    });
  });

  it('registers the share callback and supports direct share calls when wx APIs exist', () => {
    const wx = new FakeWeChatApi();
    const platform = new WeChatPlatform({ wx, shareImageUrl: 'share.png' });

    assert.equal(platform.registerRoomShare('ROOM42', { title: 'Play now' }), true);
    assert.deepEqual(wx.shareFactory?.(), {
      title: 'Play now',
      query: 'roomId=ROOM42',
      imageUrl: 'share.png'
    });

    assert.equal(platform.shareRoom('ROOM42'), true);
    assert.deepEqual(wx.lastSharedPayload, {
      title: 'Join my Prop Hide & Seek room',
      query: 'roomId=ROOM42',
      imageUrl: 'share.png'
    });
  });

  it('returns false for share registration in browser fallback mode', () => {
    const platform = new WeChatPlatform({ wx: null });
    assert.equal(platform.registerRoomShare('ROOM42'), false);
    assert.equal(platform.shareRoom('ROOM42'), false);
  });

  it('throws when creating a share payload without a valid roomId', () => {
    assert.throws(() => new WeChatPlatform({ wx: null }).createShareRoomPayload('bad room'));
  });
});

class FakeStorage implements KeyValueStorage {
  public readonly values = new Map<string, string>();

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

class FakeWeChatApi implements WeChatMiniGameApi {
  public readonly storage = new Map<string, string>();
  public launchOptions = {};
  public shareFactory: (() => WeChatSharePayload) | null = null;
  public lastSharedPayload: WeChatSharePayload | null = null;

  public getLaunchOptionsSync() {
    return this.launchOptions;
  }

  public getStorageSync(key: string): unknown {
    return this.storage.get(key);
  }

  public setStorageSync(key: string, value: string): void {
    this.storage.set(key, value);
  }

  public removeStorageSync(key: string): void {
    this.storage.delete(key);
  }

  public onShareAppMessage(factory: () => WeChatSharePayload): void {
    this.shareFactory = factory;
  }

  public shareAppMessage(payload: WeChatSharePayload): void {
    this.lastSharedPayload = payload;
  }
}
