import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  PlayerRole,
  PlayerState,
  RoundPhase,
  type ServerStateMessage
} from '@prop-hide-seek/shared';
import {
  createRemoteMatchPresentation,
  createSoloMatchPresentation,
  getMatchPresentationCameraFocus
} from '../assets/scripts/gameplay/MatchPresentation';
import type { LocalGameSnapshot } from '../assets/scripts/gameplay/LocalGameTypes';

const appScript = readFileSync(new URL('../assets/scripts/core/App.ts', import.meta.url), 'utf8');

describe('shared match presentation for solo and online clients', () => {
  it('normalizes Hide moving hiders to the same visible cat state in solo and online', () => {
    const solo = createSoloMatchPresentation(localSnapshot(RoundPhase.Hide, PlayerState.HiderMovingAsCharacter), 'p2');
    const remote = createRemoteMatchPresentation(serverState(RoundPhase.Hide, PlayerState.HiderMovingAsCharacter), {
      localPlayerId: 'p2'
    });

    const soloHider = solo.players.find((player) => player.playerId === 'p2');
    const remoteHider = remote.players.find((player) => player.playerId === 'p2');

    assert.equal(soloHider?.disguisedAsProp, false);
    assert.equal(remoteHider?.disguisedAsProp, false);
    assert.equal(soloHider?.hidden, false);
    assert.equal(remoteHider?.hidden, false);
    assert.equal(solo.props[0]?.radius, 18);
    assert.equal(remote.props[0]?.radius, 18);
  });

  it('normalizes disguised and result hider visibility identically for solo and online', () => {
    const soloSeek = createSoloMatchPresentation(localSnapshot(RoundPhase.Seek, PlayerState.HiderDisguisedMoving), 'p2');
    const remoteSeek = createRemoteMatchPresentation(serverState(RoundPhase.Seek, PlayerState.HiderDisguisedMoving), {
      localPlayerId: 'p2'
    });
    assert.equal(soloSeek.players.find((player) => player.playerId === 'p2')?.disguisedAsProp, true);
    assert.equal(remoteSeek.players.find((player) => player.playerId === 'p2')?.disguisedAsProp, true);

    const soloResult = createSoloMatchPresentation(localSnapshot(RoundPhase.Result, PlayerState.HiderDisguisedIdle), 'p2');
    const remoteResult = createRemoteMatchPresentation(serverState(RoundPhase.Result, PlayerState.HiderDisguisedIdle), {
      localPlayerId: 'p2'
    });
    assert.equal(soloResult.players.find((player) => player.playerId === 'p2')?.disguisedAsProp, false);
    assert.equal(remoteResult.players.find((player) => player.playerId === 'p2')?.disguisedAsProp, false);
  });

  it('keeps blind seeker and camera focus rules shared across solo and online', () => {
    const solo = createSoloMatchPresentation(localSnapshot(RoundPhase.Hide, PlayerState.HiderDisguisedIdle), 'p1');
    const remote = createRemoteMatchPresentation(serverState(RoundPhase.Hide, PlayerState.HiderDisguisedIdle), {
      localPlayerId: 'p1'
    });

    assert.equal(solo.isBlindSeeker, true);
    assert.equal(remote.isBlindSeeker, true);
    assert.equal(getMatchPresentationCameraFocus(solo)?.x, 120);
    assert.equal(getMatchPresentationCameraFocus(remote)?.x, 120);
  });

  it('routes Cocos solo and online through the same runtime match renderer', () => {
    assert.ok(appScript.includes('createSoloMatchPresentation(snapshot, SOLO_PLAYER_ID)'));
    assert.ok(appScript.includes('createRemoteMatchPresentation(message,'));
    assert.ok(appScript.includes('function renderMatchPlayers('));
    assert.ok(appScript.includes('function renderMatchProps('));
    assert.ok(appScript.includes('function getMatchCatFrame('));
    assert.doesNotMatch(appScript, /function renderSoloPlayers|function renderPlayers\(message/);
    assert.doesNotMatch(appScript, /get(Local|Server)CatFrame|get(Local|Server)CameraFocus/);
  });

  it('keeps touch actions and online attack feedback on the shared action path', () => {
    assert.ok(appScript.includes('installWeChatGameTouchInput(setMove, stopThenSendAction)'));
    assert.ok(appScript.includes('installWeChatGameTouchInput(setMove, stopThenUseAction)'));
    assert.ok(appScript.includes('function getCurrentRemoteLocalPlayer()'));
    assert.ok(appScript.includes('function triggerLocalAttackVisual('));
    assert.ok(appScript.includes('renderLatestServerState();'));
    assert.doesNotMatch(appScript, /installWeChatGameTouchInput\(setMove, sendAction\)/);
    assert.doesNotMatch(appScript, /installWeChatGameTouchInput\(setMove, useAction\)/);
  });

  it('keeps the formal Cocos online and solo map on the same layered kitchen fixtures', () => {
    assert.ok(appScript.includes('if (addKitchenFixtureWorld(parent, obstacle))'));
    assert.ok(appScript.includes('function addKitchenFixtureWorld('));
    assert.ok(appScript.includes('function renderKitchenForeground('));
    assert.ok(appScript.includes('function addKitchenStandingFixtureForegroundWorld('));
    assert.ok(appScript.includes('attachKitchenForegroundLayer(mapWorldRoot, mapForegroundRoot'));
    assert.ok(appScript.includes('function addKitchenTableWorld('));
    assert.ok(appScript.includes('function addKitchenFridgeWorld('));
    assert.ok(appScript.includes('function addKitchenSinkCounterWorld('));
    assert.ok(appScript.includes('function addKitchenStoveWorld('));
    assert.ok(appScript.includes('function addKitchenPantryWorld('));
    assert.ok(appScript.includes('function addKitchenCrateShelfWorld('));
    assert.ok(appScript.includes('function addWorldQuad('));
    assert.ok(appScript.includes('for (const occluder of mapState.occluders)'));
    assert.ok(appScript.includes('function addKitchenOccluderWorld('));
    assert.ok(appScript.includes('KitchenPillarOccluderBase'));
    assert.ok(appScript.includes('KitchenTallPlantPot'));
    assert.ok(appScript.includes('function getKitchenStandingFixtureVisualRect('));
    assert.ok(appScript.includes('return { width: 2.35, height: 2.05 };'));
    assert.ok(appScript.includes("addWorldPanel(parent, 'KitchenTableTop'"));
    assert.ok(appScript.includes("addWorldCircle(parent, 'KitchenTablePlate'"));
    assert.ok(appScript.includes('function addKitchenFridgePerspectiveWorld('));
    assert.ok(appScript.includes('function addKitchenPantryPerspectiveWorld('));
    assert.ok(appScript.includes('function addKitchenCrateShelfPerspectiveWorld('));
    assert.ok(appScript.includes('${prefix}PerspectiveTop'));
    assert.ok(appScript.includes('${prefix}PerspectiveFront'));
    assert.ok(appScript.includes('KitchenFridgeForeground'));
    assert.ok(appScript.includes('KitchenPantryForeground'));
    assert.ok(appScript.includes('KitchenCrateShelfForeground'));
    assert.ok(appScript.includes("addKitchenCounterWorld(parent, 'KitchenSinkCounter'"));
    assert.doesNotMatch(appScript, /map_counter', 655, 410, 138, 66/);
  });
});

function localSnapshot(phase: RoundPhase, hiderState: PlayerState): LocalGameSnapshot {
  return {
    phase,
    roundIndex: 0,
    seekerIndex: 0,
    phaseElapsedMs: 0,
    phaseRemainingMs: 1000,
    attackCountRemaining: phase === RoundPhase.Seek ? 2 : 0,
    matchEnded: false,
    lastRoundResult: null,
    props: [
      {
        instanceId: 'crate_1',
        propId: 'wooden_crate',
        position: { x: 320, y: 220 },
        radius: 18,
        breakable: true,
        destroyed: false
      }
    ],
    players: [
      {
        playerId: 'p1',
        displayName: 'Seeker',
        role: PlayerRole.Seeker,
        state: phase === RoundPhase.Hide ? PlayerState.SeekerLocked : PlayerState.HiderMovingAsCharacter,
        score: 0,
        position: { x: 120, y: 100 },
        facing: { x: 1, y: 0 },
        currentPropId: 'wooden_crate',
        captured: false
      },
      {
        playerId: 'p2',
        displayName: 'Hider',
        role: PlayerRole.Hider,
        state: hiderState,
        score: 0,
        position: { x: 420, y: 240 },
        facing: { x: 0, y: 1 },
        currentPropId: 'wooden_crate',
        captured: false
      }
    ]
  };
}

function serverState(phase: RoundPhase, hiderState: PlayerState): ServerStateMessage {
  return {
    type: 'state',
    serverTimeMs: 1000,
    serverTick: 1,
    roomId: 'ROOM1',
    phase,
    timeLeftMs: 1000,
    attackCountRemaining: phase === RoundPhase.Seek ? 2 : 0,
    roundIndex: 0,
    seekerPlayerId: 'p1',
    scores: { p1: 0, p2: 0 },
    events: [],
    props: [
      {
        propInstanceId: 'crate_1',
        propConfigId: 'wooden_crate',
        position: { x: 320, y: 220 },
        radius: 18,
        rotationDeg: 0,
        isDestroyed: false,
        isBreakable: true,
        blocksMovement: true
      }
    ],
    players: [
      {
        playerId: 'p1',
        displayName: 'Seeker',
        role: PlayerRole.Seeker,
        state: phase === RoundPhase.Hide ? PlayerState.SeekerLocked : PlayerState.HiderMovingAsCharacter,
        position: { x: 120, y: 100 },
        facing: { x: 1, y: 0 },
        facingDeg: 0,
        score: 0
      },
      {
        playerId: 'p2',
        displayName: 'Hider',
        role: PlayerRole.Hider,
        state: hiderState,
        position: { x: 420, y: 240 },
        facing: { x: 0, y: 1 },
        facingDeg: 90,
        currentPropId: 'wooden_crate',
        score: 0
      }
    ]
  };
}
