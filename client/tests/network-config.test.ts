import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { NetworkClient } from '../assets/scripts/network/NetworkClient';
import {
  DEFAULT_ROOM_SERVER_URL,
  ROOM_SERVER_URL_GLOBAL_KEY,
  ROOM_SERVER_URL_STORAGE_KEY,
  normalizeRoomServerUrl,
  resolveRoomServerUrl
} from '../assets/scripts/network/NetworkConfig';

interface RuntimeRoomServerConfig {
  __PROP_HIDE_SEEK_ROOM_SERVER_URL__?: unknown;
  __PROP_HIDE_SEEK_CONFIG__?: { roomServerUrl?: unknown };
  wx?: { getStorageSync?: (key: string) => unknown };
}

const runtime = globalThis as RuntimeRoomServerConfig;
const originalGlobalUrl = runtime.__PROP_HIDE_SEEK_ROOM_SERVER_URL__;
const originalGlobalConfig = runtime.__PROP_HIDE_SEEK_CONFIG__;
const originalWx = runtime.wx;

describe('NetworkConfig', () => {
  afterEach(() => {
    restoreRuntimeOverrides();
  });

  it('normalizes only ws and wss room server URLs', () => {
    assert.equal(normalizeRoomServerUrl(' wss://playtest.example.com/room '), 'wss://playtest.example.com/room');
    assert.equal(normalizeRoomServerUrl('ws://192.168.1.20:8787'), 'ws://192.168.1.20:8787');
    assert.equal(normalizeRoomServerUrl('https://example.com/socket'), null);
    assert.equal(normalizeRoomServerUrl(''), null);
    assert.equal(normalizeRoomServerUrl(8787), null);
  });

  it('falls back to the local development endpoint', () => {
    assert.equal(resolveRoomServerUrl(), DEFAULT_ROOM_SERVER_URL);
  });

  it('prefers explicit and global endpoints before storage', () => {
    runtime.__PROP_HIDE_SEEK_ROOM_SERVER_URL__ = 'wss://global.example.com';
    runtime.wx = {
      getStorageSync: () => 'wss://storage.example.com'
    };

    assert.equal(
      resolveRoomServerUrl({ explicitUrl: 'wss://explicit.example.com' }),
      'wss://explicit.example.com'
    );

    assert.equal(resolveRoomServerUrl(), 'wss://global.example.com');
  });

  it('reads room server URL from global config and WeChat storage', () => {
    runtime.__PROP_HIDE_SEEK_CONFIG__ = { roomServerUrl: 'wss://config.example.com' };
    assert.equal(resolveRoomServerUrl(), 'wss://config.example.com');

    runtime.__PROP_HIDE_SEEK_CONFIG__ = undefined;
    runtime.wx = {
      getStorageSync: (key) => key === ROOM_SERVER_URL_STORAGE_KEY ? 'ws://10.0.0.8:8787' : null
    };

    assert.equal(resolveRoomServerUrl(), 'ws://10.0.0.8:8787');
  });

  it('ignores invalid override values', () => {
    runtime.__PROP_HIDE_SEEK_ROOM_SERVER_URL__ = 'https://wrong-scheme.example.com';
    runtime.__PROP_HIDE_SEEK_CONFIG__ = { roomServerUrl: 'not a url' };
    runtime.wx = {
      getStorageSync: () => 'ftp://wrong-scheme.example.com'
    };

    assert.equal(resolveRoomServerUrl(), DEFAULT_ROOM_SERVER_URL);
  });

  it('constructs NetworkClient with the resolved runtime URL', () => {
    runtime[ROOM_SERVER_URL_GLOBAL_KEY] = 'wss://runtime.example.com';

    const client = new NetworkClient();

    assert.equal(client.getServerUrl(), 'wss://runtime.example.com');
  });
});

function restoreRuntimeOverrides(): void {
  if (originalGlobalUrl === undefined) {
    delete runtime.__PROP_HIDE_SEEK_ROOM_SERVER_URL__;
  } else {
    runtime.__PROP_HIDE_SEEK_ROOM_SERVER_URL__ = originalGlobalUrl;
  }

  if (originalGlobalConfig === undefined) {
    delete runtime.__PROP_HIDE_SEEK_CONFIG__;
  } else {
    runtime.__PROP_HIDE_SEEK_CONFIG__ = originalGlobalConfig;
  }

  if (originalWx === undefined) {
    delete runtime.wx;
  } else {
    runtime.wx = originalWx;
  }
}
