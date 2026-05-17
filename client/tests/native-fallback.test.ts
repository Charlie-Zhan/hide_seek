import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const fallbackScript = readFileSync(new URL('../../tools/wechat/native-fallback.js', import.meta.url), 'utf8');
const gameConfig = JSON.parse(readFileSync(new URL('../assets/resources/configs/game_config.json', import.meta.url), 'utf8'));

describe('WeChat native fallback debug runtime', () => {
  it('starts against a mocked wx canvas and sends create_room after socket open', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://10.0.0.8:8787' });
    assert.equal(runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.serverUrl, 'ws://10.0.0.8:8787');

    runtime.click('Create Room');
    const socket = runtime.wx.sockets[0];
    assert.equal(socket.url, 'ws://10.0.0.8:8787');
    assert.deepEqual(socket.sentMessages(), []);

    socket.open();

    assert.deepEqual(socket.sentMessages(), [
      { type: 'create_room', playerName: 'Player' }
    ]);
  });

  it('auto-joins launch rooms and applies launch serverUrl overrides', () => {
    const runtime = createRuntime({
      launchOptions: {
        query: {
          roomId: 'room_9',
          serverUrl: 'ws://192.168.1.50:8787'
        }
      }
    });

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    const socket = runtime.wx.sockets[0];
    assert.equal(socket.url, 'ws://192.168.1.50:8787');

    socket.open();

    assert.deepEqual(socket.sentMessages(), [
      { type: 'join_room', roomId: 'ROOM_9', playerName: 'Player' }
    ]);
  });

  it('handles onShow room re-entry and exposes a Join Room button for pending launch room ids', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.wx.emitShow({ query: { roomId: 'room_show', serverUrl: 'ws://10.0.0.9:8787' } });
    const autoJoinSocket = runtime.wx.sockets[0];
    autoJoinSocket.open();

    assert.equal(runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.joinRoomId, 'ROOM_SHOW');
    assert.deepEqual(autoJoinSocket.sentMessages(), [
      { type: 'join_room', roomId: 'ROOM_SHOW', playerName: 'Player' }
    ]);

    runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.connected = false;
    runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.socket = null;
    runtime.click('Join Room');
    const buttonSocket = runtime.wx.sockets[1];
    buttonSocket.open();

    assert.deepEqual(buttonSocket.sentMessages(), [
      { type: 'join_room', roomId: 'ROOM_SHOW', playerName: 'Player' }
    ]);
  });

  it('exposes a local Solo Match path without opening a room socket', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Solo Match');

    const state = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__;
    assert.equal(state.screen, 'solo');
    assert.equal(state.solo.phase, 'preview');
    assertAlignedDuration(state.solo.timeLeftMs, gameConfig.previewDurationMs);
    assert.equal(state.solo.rulesConfig.attackRadiusPx, gameConfig.attackRadiusPx);
    assert.equal(state.solo.rulesConfig.attackCountMultiplier, gameConfig.attackCountMultiplier);
    assert.equal(state.solo.players.length, 4);
    assert.equal(state.solo.props.length, 35);
    assert.equal(state.solo.players[0].role, 'seeker');
    assert.equal(runtime.wx.sockets.length, 0);
  });

  it('spreads solo hider spawns and shows hider characters at Hide start', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Solo Match');

    const solo = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo;
    const hiders = solo.players.filter((player: { role: string }) => player.role === 'hider');
    const roundedSpawnKeys = new Set(hiders.map((player: { x: number; y: number }) => `${Math.round(player.x)},${Math.round(player.y)}`));
    assert.equal(roundedSpawnKeys.size, hiders.length);
    for (let index = 0; index < hiders.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < hiders.length; otherIndex += 1) {
        assert.ok(distanceBetween(hiders[index], hiders[otherIndex]) > 80);
      }
    }

    solo.timeLeftMs = 0;
    runtime.click('Stop');

    assert.equal(solo.phase, 'hide');
    for (const hider of hiders as Array<{ hideCharacterMs: number }>) {
      assert.ok(hider.hideCharacterMs > 0);
    }
  });

  it('keeps solo phase timing and attack counts aligned with the shared game config', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Solo Match');

    const solo = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo;
    assertAlignedDuration(solo.timeLeftMs, gameConfig.previewDurationMs);

    solo.timeLeftMs = 0;
    runtime.click('Stop');
    assert.equal(solo.phase, 'hide');
    assert.equal(solo.timeLeftMs, gameConfig.hideDurationMs);

    solo.timeLeftMs = 0;
    runtime.click('Stop');
    assert.equal(solo.phase, 'seek');
    assert.equal(solo.timeLeftMs, gameConfig.seekDurationMs);
    assert.equal(solo.attacks, 3 * gameConfig.attackCountMultiplier);
  });

  it('accepts an injected gameplay config so DevTools uses the shared rules source', () => {
    const runtime = createRuntime();
    const injectedConfig = {
      ...gameConfig,
      previewDurationMs: 4321,
      hideDurationMs: 6789,
      seekDurationMs: 9876,
      attackCountMultiplier: 3,
      attackRadiusPx: 80
    };

    runtime.start({
      serverUrl: 'ws://127.0.0.1:8787',
      gameConfig: injectedConfig
    });
    runtime.click('Solo Match');

    const solo = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo;
    assertAlignedDuration(solo.timeLeftMs, injectedConfig.previewDurationMs);
    assert.equal(solo.rulesConfig.attackRadiusPx, injectedConfig.attackRadiusPx);

    solo.timeLeftMs = 0;
    runtime.click('Stop');
    assert.equal(solo.timeLeftMs, injectedConfig.hideDurationMs);

    solo.timeLeftMs = 0;
    runtime.click('Stop');
    assert.equal(solo.timeLeftMs, injectedConfig.seekDurationMs);
    assert.equal(solo.attacks, 3 * injectedConfig.attackCountMultiplier);
  });

  it('keeps only one solo match implementation in the native fallback', () => {
    assert.equal(fallbackScript.match(/function startSoloPractice\(/g)?.length, 1);
    assert.equal(fallbackScript.match(/function updateSolo\(/g)?.length, 1);
    assert.equal(fallbackScript.match(/function drawSolo\(/g)?.length, 1);
    assert.doesNotMatch(fallbackScript, /score: \{ player: 0, seeker: 0 \}/);
    assert.doesNotMatch(fallbackScript, /solo\.player\b|solo\.bot\b/);
  });

  it('uses online round-end reason strings in solo fallback results', () => {
    assert.ok(fallbackScript.includes("finishSoloRound(solo, 'time_up')"));
    assert.ok(fallbackScript.includes("finishSoloRound(solo, 'all_captured')"));
    assert.ok(fallbackScript.includes("finishSoloRound(solo, 'attacks_used')"));
    assert.doesNotMatch(
      fallbackScript,
      /finishSoloRound\(solo,\s*'(timer_expired|attacks_depleted|all_hiders_captured)'/
    );
    assert.doesNotMatch(
      fallbackScript,
      /reason === '(timer_expired|attacks_depleted|all_hiders_captured)'/
    );
  });

  it('keeps the solo computer seeker on patrol when the hider is blended and idle', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Solo Match');

    const state = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__;
    const solo = state.solo;
    const human = solo.players.find((player: { human: boolean }) => player.human);
    const seeker = solo.players[1];
    assert.ok(human);
    solo.roundIndex = 1;
    solo.phase = 'seek';
    solo.timeLeftMs = gameConfig.seekDurationMs;
    solo.attacks = 3 * gameConfig.attackCountMultiplier;
    solo.players.forEach((player: { role: string; captured: boolean }) => {
      player.role = 'hider';
      player.captured = false;
    });
    seeker.role = 'seeker';
    seeker.x = 1080;
    seeker.y = 125;
    human.role = 'hider';
    human.x = 170;
    human.y = 560;
    human.currentPropIndex = solo.propPool.indexOf('wooden_crate');

    for (let tick = 0; tick < 40; tick += 1) {
      solo.lastTickMs -= 120;
      runtime.click('Stop');
    }

    assert.equal(solo.phase, 'seek');
    assert.equal(human.captured, false);
    assert.ok(solo.attacks >= 3 * gameConfig.attackCountMultiplier - 1);
  });

  it('lets the human seeker capture hiders with cone attacks in solo match', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Solo Match');

    const solo = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo;
    const human = solo.players[0];
    const target = solo.players[1];
    solo.phase = 'seek';
    solo.timeLeftMs = gameConfig.seekDurationMs;
    solo.attacks = 3 * gameConfig.attackCountMultiplier;
    human.role = 'seeker';
    human.x = 500;
    human.y = 360;
    human.facingX = 1;
    human.facingY = 0;
    target.role = 'hider';
    target.x = 590;
    target.y = 360;
    solo.players.slice(2).forEach((player: { role: string; captured: boolean }) => {
      player.role = 'hider';
      player.captured = true;
    });

    runtime.click('Stop');
    runtime.click(`Cone Attack (${3 * gameConfig.attackCountMultiplier})`);

    assert.equal(target.captured, true);
    assert.ok(human.attackMs > 0);
    assert.ok(target.revealMs > 0);
    assert.ok(target.dizzyMs > 0);
    assert.equal(solo.phase, 'result');
  });

  it('lets solo cone attacks hit props whose circle overlaps the cone edge', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Solo Match');

    const solo = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo;
    const human = solo.players[0];
    solo.phase = 'seek';
    solo.timeLeftMs = gameConfig.seekDurationMs;
    solo.attacks = 3 * gameConfig.attackCountMultiplier;
    solo.props = [
      {
        id: 'edge_crate',
        kind: 'wooden_crate',
        x: 575,
        y: 450,
        destroyed: false
      }
    ];
    human.role = 'seeker';
    human.x = 500;
    human.y = 360;
    human.facingX = 1;
    human.facingY = 0;
    solo.players.slice(1).forEach((player: { role: string; captured: boolean }) => {
      player.role = 'hider';
      player.captured = true;
    });

    runtime.click('Stop');
    runtime.click(`Cone Attack (${3 * gameConfig.attackCountMultiplier})`);

    assert.equal(solo.props[0]?.destroyed, true);
  });

  it('does not give the solo computer seeker direct knowledge of an idle blended human hider', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Solo Match');

    const solo = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo;
    const human = solo.players[0];
    const seeker = solo.players[1];
    solo.roundIndex = 1;
    solo.phase = 'seek';
    solo.timeLeftMs = gameConfig.seekDurationMs;
    solo.attacks = 3 * gameConfig.attackCountMultiplier;
    solo.seekerAi.suspicionCooldownMs = 0;
    solo.players.forEach((player: { role: string; captured: boolean; noiseMs: number; switchNoiseMs: number }) => {
      player.role = 'hider';
      player.captured = false;
      player.noiseMs = 0;
      player.switchNoiseMs = 0;
    });
    seeker.role = 'seeker';
    seeker.x = 640;
    seeker.y = 626;
    human.role = 'hider';
    human.x = 214;
    human.y = 388;
    human.currentPropIndex = solo.propPool.indexOf('wooden_crate');
    human.lastKnownX = human.x;
    human.lastKnownY = human.y;
    solo.props = [
      { id: 'blend_crate', kind: 'wooden_crate', x: 214, y: 388, destroyed: false }
    ];

    const beforeDistance = distanceBetween(seeker, human);
    for (let tick = 0; tick < 18; tick += 1) {
      solo.lastTickMs -= 120;
      runtime.click('Stop');
    }

    assert.equal(human.captured, false);
    assert.ok(distanceBetween(seeker, human) >= beforeDistance - 8);
  });

  it('blocks solo movement against hidden hiders in Seek', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Solo Match');

    const solo = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo;
    const human = solo.players[0];
    const target = solo.players[1];
    solo.phase = 'seek';
    solo.timeLeftMs = gameConfig.seekDurationMs;
    solo.attacks = 3 * gameConfig.attackCountMultiplier;
    solo.props = [];
    human.role = 'seeker';
    human.x = 500;
    human.y = 300;
    human.facingX = 1;
    human.facingY = 0;
    target.role = 'hider';
    target.captured = false;
    target.x = 545;
    target.y = 300;
    target.currentPropIndex = solo.propPool.indexOf('wooden_crate');
    solo.players.slice(2).forEach((player: { role: string; captured: boolean }) => {
      player.role = 'hider';
      player.captured = true;
    });

    solo.lastTickMs -= 120;
    runtime.click('Right');

    assert.ok(human.x > 500);
    assert.ok(human.x < 522);
  });

  it('blocks solo movement against active hiders during Hide', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Solo Match');

    const solo = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo;
    const human = solo.players[0];
    const target = solo.players[1];
    solo.phase = 'hide';
    solo.timeLeftMs = gameConfig.hideDurationMs;
    solo.props = [];
    human.role = 'hider';
    human.captured = false;
    human.x = 500;
    human.y = 300;
    human.facingX = 1;
    human.facingY = 0;
    target.role = 'hider';
    target.captured = false;
    target.x = 545;
    target.y = 300;
    target.currentPropIndex = solo.propPool.indexOf('wooden_crate');
    solo.players.slice(2).forEach((player: { role: string; captured: boolean }) => {
      player.role = 'hider';
      player.captured = true;
    });

    solo.lastTickMs -= 120;
    runtime.click('Right');

    assert.ok(human.x > 500);
    assert.ok(human.x < 522);
  });

  it('does not block solo movement against captured hiders after their reveal finishes', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Solo Match');

    const solo = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo;
    const human = solo.players[0];
    const target = solo.players[1];
    solo.phase = 'seek';
    solo.timeLeftMs = gameConfig.seekDurationMs;
    solo.attacks = 3 * gameConfig.attackCountMultiplier;
    solo.props = [];
    human.role = 'seeker';
    human.x = 500;
    human.y = 300;
    human.facingX = 1;
    human.facingY = 0;
    target.role = 'hider';
    target.captured = true;
    target.revealMs = 0;
    target.dizzyMs = 0;
    target.x = 526;
    target.y = 300;
    target.currentPropIndex = solo.propPool.indexOf('wooden_crate');
    solo.players.slice(2).forEach((player: { role: string; captured: boolean }) => {
      player.role = 'hider';
      player.captured = true;
    });

    for (let tick = 0; tick < 4; tick += 1) {
      solo.lastTickMs -= 120;
      runtime.click('Right');
    }

    assert.ok(human.x > 570);
  });

  it('keeps nearby props solid after a captured hider stops blocking', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Solo Match');

    const solo = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo;
    const human = solo.players[0];
    const target = solo.players[1];
    solo.phase = 'seek';
    solo.timeLeftMs = gameConfig.seekDurationMs;
    solo.attacks = 3 * gameConfig.attackCountMultiplier;
    solo.props = [
      {
        id: 'still_solid_crate',
        kind: 'wooden_crate',
        x: 580,
        y: 300,
        destroyed: false
      }
    ];
    human.role = 'seeker';
    human.captured = false;
    human.x = 500;
    human.y = 300;
    human.facingX = 1;
    human.facingY = 0;
    target.role = 'hider';
    target.captured = true;
    target.revealMs = 0;
    target.dizzyMs = 0;
    target.x = 526;
    target.y = 300;
    target.currentPropIndex = solo.propPool.indexOf('wooden_crate');
    solo.players.slice(2).forEach((player: { role: string; captured: boolean }) => {
      player.role = 'hider';
      player.captured = true;
    });

    for (let tick = 0; tick < 6; tick += 1) {
      solo.lastTickMs -= 120;
      runtime.click('Right');
    }

    assert.ok(human.x > 526);
    assert.ok(human.x < 560);
  });

  it('lets solo actors turn but stop walking while blocked by the map edge', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Solo Match');

    const solo = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo;
    const human = solo.players[0];
    solo.phase = 'seek';
    solo.timeLeftMs = gameConfig.seekDurationMs;
    solo.attacks = 3 * gameConfig.attackCountMultiplier;
    human.role = 'seeker';
    human.x = 92;
    human.y = 300;
    human.facingX = 1;
    human.facingY = 0;

    solo.lastTickMs -= 120;
    runtime.click('Left');

    assert.ok(human.x >= 92);
    assert.equal(human.facingX, -1);
    assert.equal(human.facingY, 0);
    assert.equal(human.moving, false);
  });

  it('exposes diagonal debug movement buttons without replacing joystick movement', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Solo Match');

    const solo = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo;
    const human = solo.players[0];
    solo.phase = 'seek';
    solo.timeLeftMs = gameConfig.seekDurationMs;
    solo.attacks = 3 * gameConfig.attackCountMultiplier;
    human.role = 'seeker';
    human.x = 500;
    human.y = 300;
    solo.players.slice(1).forEach((player: { role: string; captured: boolean }) => {
      player.role = 'hider';
      player.captured = true;
    });

    solo.lastTickMs -= 120;
    runtime.click('UR');

    assert.equal(runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.moveX, 1);
    assert.equal(runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.moveY, -1);
    assert.ok(human.x > 500);
    assert.ok(human.y < 300);
    assert.ok(Math.abs(Math.hypot(human.facingX, human.facingY) - 1) < 0.001);
    assert.ok(human.facingX > 0);
    assert.ok(human.facingY < 0);
  });

  it('clears stale solo debug movement when the action button is pressed', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Solo Match');

    const solo = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo;
    const state = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__;
    const human = solo.players[0];
    const target = solo.players[1];
    solo.phase = 'seek';
    solo.timeLeftMs = gameConfig.seekDurationMs;
    solo.attacks = 3 * gameConfig.attackCountMultiplier;
    solo.props = [];
    human.role = 'seeker';
    human.x = 500;
    human.y = 300;
    human.facingX = 1;
    human.facingY = 0;
    target.role = 'hider';
    target.captured = false;
    target.x = 900;
    target.y = 300;
    solo.players.slice(2).forEach((player: { role: string; captured: boolean }) => {
      player.role = 'hider';
      player.captured = true;
    });

    solo.lastTickMs -= 120;
    runtime.click('Right');
    const xAfterRight = human.x;
    assert.equal(state.moveX, 1);

    solo.lastTickMs -= 120;
    runtime.click(`Cone Attack (${3 * gameConfig.attackCountMultiplier})`);

    assert.equal(state.moveX, 0);
    assert.equal(state.moveY, 0);
    assert.ok(human.x <= xAfterRight + 2);
  });

  it('does not block solo movement on floor decor props', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Solo Match');

    const solo = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo;
    const human = solo.players[0];
    solo.phase = 'seek';
    solo.timeLeftMs = gameConfig.seekDurationMs;
    solo.attacks = 3 * gameConfig.attackCountMultiplier;
    solo.props = [
      {
        id: 'floor_mat',
        kind: 'floor_mat',
        x: 526,
        y: 300,
        destroyed: false,
        blocksMovement: false
      }
    ];
    human.role = 'seeker';
    human.captured = false;
    human.x = 500;
    human.y = 300;
    human.facingX = 1;
    human.facingY = 0;
    solo.players.slice(1).forEach((player: { role: string; captured: boolean }) => {
      player.role = 'hider';
      player.captured = true;
    });

    solo.lastTickMs -= 120;
    runtime.click('Right');

    assert.ok(human.x > 520);
  });

  it('does not block solo movement on destroyed props', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Solo Match');

    const solo = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo;
    const human = solo.players[0];
    solo.phase = 'seek';
    solo.timeLeftMs = gameConfig.seekDurationMs;
    solo.attacks = 3 * gameConfig.attackCountMultiplier;
    solo.props = [
      {
        id: 'broken_crate',
        kind: 'wooden_crate',
        x: 526,
        y: 300,
        destroyed: true
      }
    ];
    human.role = 'seeker';
    human.captured = false;
    human.x = 500;
    human.y = 300;
    human.facingX = 1;
    human.facingY = 0;
    solo.players.slice(1).forEach((player: { role: string; captured: boolean }) => {
      player.role = 'hider';
      player.captured = true;
    });

    solo.lastTickMs -= 120;
    runtime.click('Right');

    assert.ok(human.x > 520);
  });

  it('blocks solo movement against solid map fixtures without tunneling through them', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Solo Match');

    const solo = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo;
    const human = solo.players[0];
    solo.phase = 'seek';
    solo.timeLeftMs = gameConfig.seekDurationMs;
    solo.attacks = 3 * gameConfig.attackCountMultiplier;
    solo.props = [];
    human.role = 'seeker';
    human.captured = false;
    human.x = 252;
    human.y = 132;
    human.facingX = 1;
    human.facingY = 0;
    solo.players.slice(1).forEach((player: { role: string; captured: boolean }) => {
      player.role = 'hider';
      player.captured = true;
    });

    for (let tick = 0; tick < 8; tick += 1) {
      solo.lastTickMs -= 120;
      runtime.click('Right');
    }

    assert.ok(human.x <= 280.001, `expected seeker to stop before the sink counter; x=${human.x}`);
  });

  it('lets solo actors escape overlap without walking deeper through a solid prop', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Solo Match');

    const solo = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo;
    const human = solo.players[0];
    solo.phase = 'seek';
    solo.timeLeftMs = gameConfig.seekDurationMs;
    solo.attacks = 3 * gameConfig.attackCountMultiplier;
    solo.props = [
      {
        id: 'overlapped_crate',
        kind: 'wooden_crate',
        x: 520,
        y: 300,
        destroyed: false
      }
    ];
    human.role = 'seeker';
    human.captured = false;
    human.x = 500;
    human.y = 300;
    human.facingX = 1;
    human.facingY = 0;
    solo.players.slice(1).forEach((player: { role: string; captured: boolean }) => {
      player.role = 'hider';
      player.captured = true;
    });

    solo.lastTickMs -= 120;
    runtime.click('Right');

    assert.ok(human.x <= 500.001);

    solo.lastTickMs -= 120;
    runtime.click('Left');

    assert.ok(human.x < 500);
  });

  it('starts the solo seeker outside blocking fixtures and lets them move', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Solo Match');

    const solo = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo;
    const human = solo.players[0];
    solo.phase = 'seek';
    solo.timeLeftMs = gameConfig.seekDurationMs;
    solo.attacks = 3 * gameConfig.attackCountMultiplier;
    human.role = 'seeker';
    human.captured = false;
    const beforeX = human.x;

    solo.lastTickMs -= 120;
    runtime.click('Left');

    assert.ok(human.x < beforeX);
  });

  it('keeps solo hider round starts out of the crate stack choke', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Solo Match');

    const solo = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo;
    const crateStackBounds = { x: 120, y: 488, width: 390, height: 180 };

    for (let roundIndex = 0; roundIndex < solo.players.length; roundIndex += 1) {
      runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo.phase = 'result';
      runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo.timeLeftMs = 0;
      if (roundIndex > 0) {
        runtime.click('Stop');
      }

      const activeSolo = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo;
      assert.equal(activeSolo.roundIndex, roundIndex);
      for (const player of activeSolo.players as Array<{ role: string; x: number; y: number; id: string }>) {
        if (player.role !== 'hider') {
          continue;
        }
        assert.equal(
          isPointInRect({ x: player.x, y: player.y }, crateStackBounds),
          false,
          `${player.id} should not spawn inside the crate stack choke on round ${roundIndex + 1}`
        );
      }
    }
  });

  it('reveals and taunts surviving solo hiders when time expires', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Solo Match');

    const solo = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo;
    const survivor = solo.players[1];
    solo.phase = 'seek';
    solo.timeLeftMs = 0;
    solo.attacks = 3 * gameConfig.attackCountMultiplier;
    solo.players[0].role = 'seeker';
    solo.players.slice(1).forEach((player: { role: string; captured: boolean; revealMs: number; tauntMs: number }) => {
      player.role = 'hider';
      player.captured = false;
      player.revealMs = 0;
      player.tauntMs = 0;
    });

    solo.lastTickMs -= 120;
    runtime.click('Stop');

    assert.equal(solo.phase, 'result');
    assert.equal(survivor.captured, false);
    assert.ok(survivor.revealMs > 0);
    assert.ok(survivor.tauntMs > 0);
  });

  it('references selected Kenney runtime sprites for solo prop drawing', () => {
    const requiredSprites = [
      'prop_wooden_crate.png',
      'prop_trash_bin.png',
      'prop_plant_pot.png',
      'prop_chair.png',
      'prop_water_bucket.png',
      'prop_food_basket.png',
      'map_stove.png',
      'map_sink.png',
      'map_counter.png'
    ];

    for (const sprite of requiredSprites) {
      assert.ok(fallbackScript.includes(`kenney/props/${sprite}`), `fallback should reference ${sprite}`);
      assert.ok(
        existsSync(new URL(`../../client/assets/art/kenney/props/${sprite}`, import.meta.url)),
        `expected selected Kenney sprite ${sprite}`
      );
    }
  });

  it('references selected generated kitchen runtime sprites for upgraded prop drawing', () => {
    const requiredSprites = [
      'prop_wooden_crate.png',
      'prop_trash_bin.png',
      'prop_plant_pot.png',
      'prop_chair.png',
      'prop_water_bucket.png',
      'prop_food_basket.png',
      'map_stove.png',
      'map_sink.png',
      'map_counter.png'
    ];

    assert.ok(fallbackScript.includes('generatedPropSpritePaths'));
    for (const sprite of requiredSprites) {
      assert.ok(fallbackScript.includes(`generated/props/${sprite}`), `fallback should reference generated prop ${sprite}`);
      assert.ok(
        existsSync(new URL(`../assets/resources/art/props/generated/kitchen_v2/${sprite}`, import.meta.url)),
        `expected generated prop sprite ${sprite}`
      );
    }
  });

  it('references selected generated cat runtime sprites for player drawing', () => {
    const requiredSprites = [
      'cat_orange_tabby.png',
      'cat_gray_tuxedo.png',
      'cat_calico.png',
      'cat_black.png',
      'cat_siamese.png'
    ];

    assert.ok(fallbackScript.includes('function drawCatActor('));
    assert.ok(fallbackScript.includes('function getCatAnimationFrame('));
    assert.ok(fallbackScript.includes('function getCatVisualOrientation('));
    assert.ok(fallbackScript.includes('function getDirectionalCatBucket('));
    assert.ok(fallbackScript.includes('function getDirectionalAttackFrame('));
    assert.ok(fallbackScript.includes('function getDirectionalTauntFrame('));
    assert.ok(fallbackScript.includes('player.taunting || player.tauntMs > 0'));
    assert.ok(fallbackScript.includes('side_crouch'));
    assert.ok(fallbackScript.includes('back_attack_2'));
    assert.ok(fallbackScript.includes('function drawOrientedFallback('));
    assert.ok(fallbackScript.includes("button('UL'"));
    assert.ok(fallbackScript.includes("button('DR'"));
    assert.ok(
      existsSync(new URL('../assets/art/generated/cats/PROMPT.md', import.meta.url)),
      'expected generated cat prompt record'
    );
    assert.ok(
      existsSync(new URL('../assets/art/generated/cat_animations/PROMPT.md', import.meta.url)),
      'expected generated cat animation prompt record'
    );
    assert.ok(
      existsSync(new URL('../assets/art/generated/cat_directions/PROMPT.md', import.meta.url)),
      'expected generated cat direction prompt record'
    );
    assert.ok(
      existsSync(new URL('../assets/art/generated/cat_diagonals/PROMPT.md', import.meta.url)),
      'expected generated cat diagonal prompt record'
    );
    assert.ok(
      existsSync(new URL('../assets/art/generated/cat_crouches/PROMPT.md', import.meta.url)),
      'expected generated cat crouch prompt record'
    );
    assert.ok(
      existsSync(new URL('../assets/art/generated/cat_directional_attacks/PROMPT.md', import.meta.url)),
      'expected generated cat directional attack prompt record'
    );
    assert.ok(
      existsSync(new URL('../assets/art/generated/cat_back_attacks/PROMPT.md', import.meta.url)),
      'expected generated cat back attack prompt record'
    );
    assert.ok(
      fallbackScript.includes('cats/anim/${skin}_${frame}.png'),
      'fallback should derive cat animation frame paths from skin and frame ids'
    );
    assert.ok(fallbackScript.includes("const catAnimationSkin = 'cat_orange_tabby';"));
    assert.ok(fallbackScript.includes('createCatAnimationSpritePaths([catAnimationSkin], catAnimationFrames)'));
    assert.doesNotMatch(fallbackScript, /createCatAnimationSpritePaths\(catSkins/);
    for (const sprite of requiredSprites) {
      assert.ok(fallbackScript.includes(`cats/${sprite}`), `fallback should reference ${sprite}`);
      assert.ok(
        existsSync(new URL(`../assets/resources/art/characters/cats/${sprite}`, import.meta.url)),
        `expected selected cat sprite ${sprite}`
      );
    }
    for (const frame of [
      'idle', 'walk_1', 'walk_2',
      'front_idle', 'front_walk_1', 'front_walk_2',
      'back_idle', 'back_walk_1', 'back_walk_2',
      'diag_front_idle', 'diag_front_walk_1', 'diag_front_walk_2',
      'diag_back_idle', 'diag_back_walk_1', 'diag_back_walk_2',
      'side_crouch', 'front_crouch', 'back_crouch',
      'diag_front_crouch', 'diag_back_crouch',
      'side_attack_1', 'side_attack_2',
      'front_attack_1', 'front_attack_2',
      'back_attack_1', 'back_attack_2',
      'diag_front_attack_1', 'diag_front_attack_2',
      'diag_back_attack_1', 'diag_back_attack_2',
      'attack_1', 'attack_2', 'reveal', 'dizzy'
    ]) {
      assert.ok(
        existsSync(new URL(`../assets/resources/art/characters/cat_animations/cat_orange_tabby_${frame}.png`, import.meta.url)),
        `expected MVP cat animation frame cat_orange_tabby_${frame}`
      );
    }
  });

  it('validates solo AI patrol targets as absolute open positions', () => {
    assert.ok(fallbackScript.includes('function isSoloPositionBlocked('));
    assert.doesNotMatch(
      fallbackScript,
      /isSoloMovementBlocked\(solo,\s*player,\s*candidate,\s*getSoloActorRadius\(solo,\s*player\),\s*candidate\)/
    );
  });

  it('retargets the solo computer seeker after repeated blocked patrol movement', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Solo Match');

    const solo = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.solo;
    const human = solo.players[0];
    const seeker = solo.players[1];
    solo.roundIndex = 1;
    solo.phase = 'seek';
    solo.timeLeftMs = gameConfig.seekDurationMs;
    solo.attacks = 3 * gameConfig.attackCountMultiplier;
    solo.seekerAi.patrolIndex = 0;
    solo.seekerAi.attackCooldownMs = 9999;
    solo.seekerAi.suspicionCooldownMs = 9999;
    solo.seekerAi.stuckMs = 0;
    solo.seekerAi.recoveryMs = 0;
    solo.players.forEach((player: { role: string; captured: boolean; noiseMs: number; switchNoiseMs: number }) => {
      player.role = 'hider';
      player.captured = false;
      player.noiseMs = 0;
      player.switchNoiseMs = 0;
    });
    seeker.role = 'seeker';
    seeker.x = 500;
    seeker.y = 300;
    human.role = 'hider';
    human.x = 170;
    human.y = 560;
    human.currentPropIndex = solo.propPool.indexOf('wooden_crate');
    solo.props = [
      {
        id: 'ai_blocking_crate',
        kind: 'wooden_crate',
        x: 528,
        y: 300,
        destroyed: false,
        blocksMovement: true
      },
      {
        id: 'ai_blocking_bucket',
        kind: 'wooden_crate',
        x: 500,
        y: 272,
        destroyed: false,
        blocksMovement: true
      }
    ];

    for (let tick = 0; tick < 14; tick += 1) {
      solo.lastTickMs -= 120;
      runtime.click('Stop');
    }

    assert.ok(solo.seekerAi.patrolIndex > 0);
    assert.ok(distanceBetween(seeker, { x: 500, y: 300 }) > 1);
  });

  it('renders the native fallback map through a fixed full-map viewport', () => {
    assert.ok(fallbackScript.includes('function createMapViewport('));
    assert.ok(fallbackScript.includes('function drawMapViewport('));
    assert.ok(fallbackScript.includes('function getGameplayMapFrame('));
    assert.ok(fallbackScript.includes('getSoloMapFocus(solo, human, seeker)'));
    assert.ok(fallbackScript.includes('getRemoteMapFocus(game)'));
    assert.ok(fallbackScript.includes('function drawMatchView('));
    assert.ok(fallbackScript.includes('function drawMatchWorld('));
    assert.ok(fallbackScript.includes('function drawGameplayControls('));
    assert.ok(fallbackScript.includes('drawMatchView(createRemoteMatchView(game), width, height)'));
    assert.ok(fallbackScript.includes('drawMatchView(createSoloMatchView(currentSolo), width, height)'));
    assert.doesNotMatch(fallbackScript, /function drawRemote(World|Map|Result|Player)\(/);
    assert.doesNotMatch(fallbackScript, /function drawSolo(World|Result)\(/);
    assert.doesNotMatch(fallbackScript, /function draw(HiderCharacter|Seeker)\(/);
    assert.doesNotMatch(fallbackScript, /soloFollowViewWorldWidth/);
    assert.doesNotMatch(fallbackScript, /cameraX/);
    assert.ok(fallbackScript.includes('ctx.clip?.()'));
  });

  it('renders the shared online and solo fallback kitchen fixtures as layered furniture instead of color blocks', () => {
    assert.ok(fallbackScript.includes('if (drawKitchenObstacleFixture(obstacle.id, x, y, w, h))'));
    assert.ok(fallbackScript.includes('function drawKitchenObstacleFixture('));
    assert.ok(fallbackScript.includes('drawKitchenTableObstacle(x, y, w, h);'));
    assert.ok(fallbackScript.includes('function drawKitchenTableObstacle('));
    assert.ok(fallbackScript.includes('function drawKitchenFridgeObstacle('));
    assert.ok(fallbackScript.includes('function drawKitchenSinkCounterObstacle('));
    assert.ok(fallbackScript.includes('function drawKitchenStoveObstacle('));
    assert.ok(fallbackScript.includes('function drawKitchenPantryObstacle('));
    assert.ok(fallbackScript.includes('function drawKitchenCrateShelfObstacle('));
    assert.ok(fallbackScript.includes('function fillKitchenQuad('));
    assert.ok(fallbackScript.includes('function getKitchenStandingVisualRect('));
    assert.ok(fallbackScript.includes('return { width: 2.35, height: 2.05 };'));
    assert.ok(fallbackScript.includes("{ x: x + w * 0.88, y: y + h * 0.83 }"));
    assert.ok(fallbackScript.includes('drawSoftShadow(centerX, shadowY'));
    assert.ok(fallbackScript.includes("ctx.ellipse(x + w * 0.35"));
    assert.doesNotMatch(fallbackScript, /obstacle\.id\.includes\('table'\) \|\| obstacle\.id\.includes\('counter'\)/);
  });

  it('keeps online and solo fallback prop rendering and blocking radii aligned with gameplay config', () => {
    assert.ok(fallbackScript.includes('radius: prop.radius'));
    assert.ok(fallbackScript.includes('blocksMovement: prop.blocksMovement !== false'));
    assert.ok(fallbackScript.includes('const soloPropMovementRadiusScale = 1;'));
    assert.ok(fallbackScript.includes('function getSoloPropCollisionRadius(prop)'));
    assert.ok(fallbackScript.includes('getSoloPropRadius(prop.kind, prop.radius) * soloPropMovementRadiusScale'));
    assert.doesNotMatch(fallbackScript, /const soloPropMovementRadiusScale = 0\.85/);
  });

  it('uses standing fixture foregrounds and base collision footprints in the native fallback', () => {
    assert.ok(fallbackScript.includes('function drawKitchenForeground('));
    assert.ok(fallbackScript.includes('drawKitchenStandingForegroundFixture('));
    assert.ok(fallbackScript.includes('function drawKitchenFridgeForeground('));
    assert.ok(fallbackScript.includes('const visual = getKitchenStandingVisualRect(id, x, y, w, h);'));
    assert.ok(fallbackScript.includes('fillKitchenQuad(['));
    assert.ok(fallbackScript.includes('function getSoloStandingObstacleCollisionRect('));
    assert.ok(fallbackScript.includes('rect.y + rect.height * 0.72'));
    assert.ok(fallbackScript.includes('rect.height * 0.24'));
  });

  it('renders foreground occluders as semantic fixtures instead of rug-like blocks', () => {
    assert.ok(fallbackScript.includes('for (const occluder of soloOccluders)'));
    assert.ok(fallbackScript.includes('function drawKitchenOccluder('));
    assert.ok(fallbackScript.includes('function drawKitchenTableFrontOccluder('));
    assert.ok(fallbackScript.includes('function drawKitchenCounterFrontOccluder('));
    assert.ok(fallbackScript.includes('function drawKitchenPillarOccluder('));
    assert.ok(fallbackScript.includes('function drawKitchenTallPlantOccluder('));
    assert.ok(fallbackScript.includes('function drawKitchenCrateStackFrontOccluder('));
    assert.ok(fallbackScript.includes("id === 'occluder_table_front_edge'"));
    assert.ok(fallbackScript.includes("id === 'occluder_tall_plant_corner'"));
    assert.ok(fallbackScript.includes("id.includes('pillar_base') || id.includes('plant_corner_base')"));
    assert.doesNotMatch(fallbackScript, /#b88f56|#d5b780/);
    assert.doesNotMatch(fallbackScript, /for \(let x = 120; x < soloMapWidth/);
    assert.doesNotMatch(fallbackScript, /for \(let y = 90; y < soloMapHeight/);
  });

  it('sizes solo prop visuals from configured gameplay radii instead of viewport shortcuts', () => {
    assert.ok(fallbackScript.includes('getSoloPropRadius(kind, radius) * worldScale'));
    assert.doesNotMatch(fallbackScript, /Math\.min\(mapW, mapH\) \* 0\.06/);
  });

  it('keeps captured solo hider dizzy visuals in place after feedback timers expire', () => {
    assert.doesNotMatch(
      fallbackScript,
      /player\.captured && solo\.phase !== 'result' && player\.revealMs <= 0 && player\.dizzyMs <= 0/
    );
    assert.ok(fallbackScript.includes('function getSoloViewActors('));
    assert.ok(fallbackScript.includes('drawCatActor(mapX, mapY, mapW, mapH, actor, Boolean(actor.showFacing))'));
    assert.ok(fallbackScript.includes('if (player.captured || player.dizzyMs > 0)'));
  });

  it('registers and invokes share payloads that include roomId and serverUrl', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://192.168.1.50:8787' });
    runtime.click('Create Room');
    const socket = runtime.wx.sockets[0];
    socket.open();
    socket.message({
      type: 'room_joined',
      playerId: 'p1',
      room: roomState('ROOM42')
    });

    assert.deepEqual(toPlainObject(runtime.wx.shareFactory?.()), {
      title: 'Join my Prop Hide & Seek room',
      query: 'roomId=ROOM42&serverUrl=ws%3A%2F%2F192.168.1.50%3A8787'
    });

    runtime.click('Share');

    assert.deepEqual(toPlainObject(runtime.wx.lastSharedPayload), {
      title: 'Join my Prop Hide & Seek room',
      query: 'roomId=ROOM42&serverUrl=ws%3A%2F%2F192.168.1.50%3A8787'
    });
  });

  it('uses the shared gameplay controls for online fallback movement and actions', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Create Room');
    const socket = runtime.wx.sockets[0];
    socket.open();
    socket.message({ type: 'welcome', playerId: 'p1' });
    socket.message(gameState({ playerId: 'p1', role: 'seeker' }));

    assert.deepEqual(
      toPlainObject(runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.buttons
        .map((button: { label: string }) => button.label)
        .filter((label: string) => ['UL', 'Up', 'UR', 'Left', 'Stop', 'Right', 'DL', 'Down', 'DR'].includes(label))),
      ['UL', 'Up', 'UR', 'Left', 'Stop', 'Right', 'DL', 'Down', 'DR']
    );

    runtime.click('UR');
    assert.equal(socket.sentMessages().at(-1)?.type, 'player_input');
    assert.equal(socket.sentMessages().at(-1)?.moveX, 1);
    assert.equal(socket.sentMessages().at(-1)?.moveY, -1);
    assert.equal(socket.sentMessages().at(-1)?.action, undefined);

    runtime.click('Cone Attack (2)');
    assert.equal(socket.sentMessages().at(-1)?.type, 'player_input');
    assert.equal(socket.sentMessages().at(-1)?.moveX, 0);
    assert.equal(socket.sentMessages().at(-1)?.moveY, 0);
    assert.equal(socket.sentMessages().at(-1)?.action, 'attack');
    assert.ok(runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.remoteEffects.p1.attackUntil > Date.now());
    assert.equal(runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.remoteEffects.p1.attackFacingX, 1);

    socket.message(gameState({ playerId: 'p1', role: 'hider' }));
    runtime.click('DR');
    assert.equal(socket.sentMessages().at(-1)?.moveX, 1);
    assert.equal(socket.sentMessages().at(-1)?.moveY, 1);
    assert.equal(socket.sentMessages().at(-1)?.action, undefined);
  });

  it('dispatches attack for seekers and switch_prop for hiders', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Create Room');
    const socket = runtime.wx.sockets[0];
    socket.open();
    socket.message({ type: 'welcome', playerId: 'p1' });
    socket.message(gameState({ playerId: 'p1', role: 'seeker' }));

    runtime.click('Cone Attack (2)');

    assert.equal(socket.sentMessages().at(-1)?.type, 'player_input');
    assert.equal(socket.sentMessages().at(-1)?.action, 'attack');

    socket.message(gameState({ playerId: 'p1', role: 'hider' }));
    runtime.click('Switch Prop');

    assert.equal(socket.sentMessages().at(-1)?.type, 'player_input');
    assert.equal(socket.sentMessages().at(-1)?.action, 'switch_prop');
  });

  it('keeps online fallback seeker movement and attack animation state aligned with solo fallback', () => {
    assert.ok(fallbackScript.includes('state.remoteEffects'));
    assert.ok(fallbackScript.includes('function applyRemoteVisualEvent('));
    assert.ok(fallbackScript.includes('function triggerRemoteLocalActionVisual('));
    assert.ok(fallbackScript.includes("player.role === 'hider' && String(player.state || '').includes('moving')"));
    assert.doesNotMatch(fallbackScript, /player\.isMoving \|\| String\(player\.state \|\| ''\)\.includes\('moving'\)/);
  });

  it('applies standalone online attack game events in the native fallback', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Create Room');
    const socket = runtime.wx.sockets[0];
    socket.open();
    socket.message({ type: 'welcome', playerId: 'p1' });
    socket.message(gameState({ playerId: 'p1', role: 'seeker' }));
    socket.message({
      type: 'game_event',
      event: {
        type: 'attack',
        attackerId: 'p1',
        facingX: 0,
        facingY: 1
      }
    });

    const effect = runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.remoteEffects.p1;
    assert.ok(effect.attackUntil > Date.now());
    assert.equal(effect.attackFacingX, 0);
    assert.equal(effect.attackFacingY, 1);
  });
});

function assertAlignedDuration(actual: number, expected: number) {
  assert.ok(actual <= expected, `expected ${actual} to be at most ${expected}`);
  assert.ok(actual >= expected - 120, `expected ${actual} to stay within one fallback tick of ${expected}`);
}

function createRuntime(options: { launchOptions?: { query?: Record<string, unknown> } } = {}) {
  const wx = new FakeWx(options.launchOptions ?? {});
  const canvas = new FakeCanvas();
  const context: Record<string, any> = {
    console,
    encodeURIComponent,
    setInterval: () => 1,
    clearInterval: () => undefined,
    Math,
    JSON,
    Promise,
    wx,
    canvas
  };
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(fallbackScript, context, { filename: 'tools/wechat/native-fallback.js' });

  return {
    context,
    wx,
    canvas,
    start(startOptions: Record<string, unknown> = {}) {
      context.__PROP_HIDE_SEEK_START_NATIVE_FALLBACK__(startOptions);
    },
    click(label: string) {
      const button = context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.buttons.find(
        (candidate: { label: string }) => candidate.label === label
      );
      assert.ok(button, `Expected button ${label}`);
      wx.emitTouchEnd({
        changedTouches: [
          {
            clientX: button.x + button.w / 2,
            clientY: button.y + button.h / 2
          }
        ]
      });
    }
  };
}

function roomState(roomId: string) {
  return {
    roomId,
    status: 'waiting',
    minPlayers: 2,
    maxPlayers: 4,
    players: [
      {
        playerId: 'p1',
        playerName: 'Player',
        displayName: 'Player',
        ready: false,
        connected: true,
        isOwner: true
      }
    ]
  };
}

function gameState(localPlayer: { playerId: string; role: 'seeker' | 'hider' }) {
  return {
    type: 'state',
    serverTick: 1,
    serverTimeMs: 1000,
    roomId: 'ROOM42',
    phase: 'seek',
    roundIndex: 0,
    seekerPlayerId: localPlayer.role === 'seeker' ? localPlayer.playerId : 'seeker_2',
    timeLeftMs: 30000,
    attackCountRemaining: 2,
    players: [
      {
        playerId: localPlayer.playerId,
        displayName: 'Player',
        role: localPlayer.role,
        state: localPlayer.role === 'seeker' ? 'hider_moving_as_character' : 'hider_disguised_moving',
        position: { x: 640, y: 360 },
        facingDeg: 0,
        score: 0
      }
    ],
    props: [],
    events: [],
    scores: { [localPlayer.playerId]: 0 }
  };
}

function toPlainObject(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isPointInRect(point: { x: number; y: number }, rect: { x: number; y: number; width: number; height: number }) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

class FakeWx {
  public readonly sockets: FakeSocketTask[] = [];
  public shareFactory: (() => unknown) | null = null;
  public lastSharedPayload: unknown = null;
  private touchEndHandler: ((event: unknown) => void) | null = null;
  private showHandler: ((options: unknown) => void) | null = null;

  public constructor(private readonly launchOptions: { query?: Record<string, unknown> }) {}

  public createCanvas() {
    return new FakeCanvas();
  }

  public getSystemInfoSync() {
    return {
      windowWidth: 960,
      windowHeight: 640,
      screenWidth: 960,
      screenHeight: 640,
      pixelRatio: 1,
      platform: 'devtools'
    };
  }

  public getLaunchOptionsSync() {
    return this.launchOptions;
  }

  public connectSocket(options: { url: string }) {
    const socket = new FakeSocketTask(options.url);
    this.sockets.push(socket);
    return socket;
  }

  public onTouchEnd(handler: (event: unknown) => void) {
    this.touchEndHandler = handler;
  }

  public emitTouchEnd(event: unknown) {
    this.touchEndHandler?.(event);
  }

  public onShow(handler: (options: unknown) => void) {
    this.showHandler = handler;
  }

  public emitShow(options: unknown) {
    this.showHandler?.(options);
  }

  public onShareAppMessage(factory: () => unknown) {
    this.shareFactory = factory;
  }

  public shareAppMessage(payload: unknown) {
    this.lastSharedPayload = payload;
  }
}

class FakeSocketTask {
  private openHandler: (() => void) | null = null;
  private messageHandler: ((event: { data: string }) => void) | null = null;
  private errorHandler: ((event: { errMsg?: string }) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private readonly sent: string[] = [];

  public constructor(public readonly url: string) {}

  public onOpen(handler: () => void) {
    this.openHandler = handler;
  }

  public onMessage(handler: (event: { data: string }) => void) {
    this.messageHandler = handler;
  }

  public onError(handler: (event: { errMsg?: string }) => void) {
    this.errorHandler = handler;
  }

  public onClose(handler: () => void) {
    this.closeHandler = handler;
  }

  public send(options: { data: string; fail?: (error: { errMsg?: string }) => void }) {
    this.sent.push(options.data);
  }

  public close() {
    this.closeHandler?.();
  }

  public open() {
    this.openHandler?.();
  }

  public message(message: unknown) {
    this.messageHandler?.({ data: JSON.stringify(message) });
  }

  public error(errMsg = 'socket error') {
    this.errorHandler?.({ errMsg });
  }

  public sentMessages() {
    return this.sent.map((data) => JSON.parse(data));
  }
}

class FakeCanvas {
  public width = 960;
  public height = 640;
  private readonly context = new FakeCanvasContext();

  public getContext() {
    return this.context;
  }
}

class FakeCanvasContext {
  public fillStyle = '';
  public strokeStyle = '';
  public font = '';
  public textAlign = '';
  public textBaseline = '';

  public clearRect() {}
  public fillRect() {}
  public strokeRect() {}
  public fillText() {}
  public beginPath() {}
  public arc() {}
  public ellipse() {}
  public fill() {}
  public moveTo() {}
  public lineTo() {}
  public arcTo() {}
  public stroke() {}
  public closePath() {}
}
