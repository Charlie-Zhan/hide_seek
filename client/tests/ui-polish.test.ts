import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PublicRoomState } from '@prop-hide-seek/shared';
import { sessionState } from '../assets/scripts/core/SessionState';
import { NetworkConnectionState } from '../assets/scripts/network/NetworkClient';
import { GameHUD } from '../assets/scripts/ui/GameHUD';
import { LobbyUI } from '../assets/scripts/ui/LobbyUI';
import { PreviewOverlay } from '../assets/scripts/ui/PreviewOverlay';
import { ResultPanel } from '../assets/scripts/ui/ResultPanel';
import { RoomUI } from '../assets/scripts/ui/RoomUI';
import { SeekerBlindOverlay } from '../assets/scripts/ui/SeekerBlindOverlay';

describe('Phase 06 UI display state polish', () => {
  it('exposes Lobby title, room entry, player name, and gameplay help state', () => {
    const lobby = new LobbyUI();

    lobby.setPlayerName('  Mia  ');
    lobby.setJoinRoomId('ab12');
    lobby.setConnectionStatus(NetworkConnectionState.Connected);

    const display = lobby.getDisplayState();

    assert.equal(display.titleText, 'Prop Hide & Seek');
    assert.equal(display.playerNameText, 'Mia');
    assert.equal(display.joinRoomIdText, 'AB12');
    assert.equal(display.gameplayEntryText, 'How to Play');
    assert.ok(display.gameplaySummaryLines.some((line) => line.includes('limited cone attacks')));
    assert.equal(display.connectionStatusText, 'Connected');
  });

  it('exposes Room code, player list, share, ready, start, and network state', () => {
    const room = createRoomState();
    sessionState.setRoom(room, 'p1');

    const roomUI = new RoomUI();
    roomUI.updateRoom(room);
    roomUI.setConnectionStatus(NetworkConnectionState.Connected);

    const display = roomUI.getDisplayState();

    assert.equal(display.roomCodeLabelText, 'Room Code');
    assert.equal(display.roomCodeText, 'ROOM42');
    assert.equal(display.playerCountText, '3/4 Players');
    assert.equal(display.readinessSummaryText, '3/3 Ready');
    assert.equal(display.shareButtonText, 'Share');
    assert.equal(display.canShare, true);
    assert.equal(display.canStart, true);
    assert.equal(display.networkStatusText, 'Network: Connected');
    assert.deepEqual(display.playerList.map((player) => player.nameText), ['Owner', 'Hider A', 'Hider B']);
  });

  it('separates seeker and hider HUD state and emphasizes the final 5 seconds', () => {
    const hud = new GameHUD();

    hud.updateViewModel({
      phase: 'seek',
      countdownMs: 5000,
      role: 'seeker',
      attackCountRemaining: 2,
      remainingAttacks: 2,
      currentPropId: null,
      currentScore: 3,
      capturedCount: 1,
      totalHiders: 2,
      scores: []
    });

    const seekerDisplay = hud.getDisplayState();
    assert.equal(seekerDisplay.hudVariant, 'seeker');
    assert.equal(seekerDisplay.phaseText, 'Seek');
    assert.equal(seekerDisplay.countdownWarning, true);
    assert.equal(seekerDisplay.countdownEmphasisText, 'Final 5 Seconds');
    assert.equal(seekerDisplay.remainingAttacksVisible, true);
    assert.equal(seekerDisplay.remainingAttacksText, '2');
    assert.equal(seekerDisplay.currentPropVisible, false);
    assert.equal(seekerDisplay.primaryActionText, 'Cone Attack');
    assert.equal(seekerDisplay.currentScoreText, '3');

    hud.updateViewModel({
      phase: 'seek',
      countdownMs: 12000,
      role: 'hider',
      attackCountRemaining: 2,
      remainingAttacks: 2,
      currentPropId: 'wooden_crate',
      isCaptured: true,
      currentScore: 1,
      capturedCount: 1,
      totalHiders: 2,
      scores: []
    });

    const hiderDisplay = hud.getDisplayState();
    assert.equal(hiderDisplay.hudVariant, 'hider');
    assert.equal(hiderDisplay.remainingAttacksVisible, false);
    assert.equal(hiderDisplay.currentPropVisible, true);
    assert.equal(hiderDisplay.currentPropText, 'Wooden Crate');
    assert.equal(hiderDisplay.capturedWarningVisible, true);
    assert.equal(hiderDisplay.capturedStatusText, 'Captured - spectating only');
    assert.equal(hiderDisplay.primaryActionText, 'Spectate');
  });

  it('expresses Preview and Hide seeker blind overlay visibility rules', () => {
    const preview = new PreviewOverlay();
    preview.show(undefined, 4000);

    const previewDisplay = preview.getDisplayState();
    assert.equal(previewDisplay.messageText, 'Observe the map and memorize prop positions');
    assert.equal(previewDisplay.countdownText, '0:04');
    assert.equal(previewDisplay.countdownWarning, true);
    assert.equal(previewDisplay.mapVisible, true);
    assert.equal(previewDisplay.playersVisible, false);
    assert.equal(previewDisplay.controlsEnabled, false);

    const blind = new SeekerBlindOverlay();
    blind.show(undefined, 9000);

    const blindDisplay = blind.getDisplayState();
    assert.equal(blindDisplay.messageText, 'Hiders are arranging the scene');
    assert.equal(blindDisplay.mapVisible, false);
    assert.equal(blindDisplay.controlsEnabled, false);
    assert.equal(blindDisplay.countdownText, '0:09');
  });

  it('exposes Result ranking, survivors, score deltas, and next seeker', () => {
    const result = new ResultPanel();

    result.show({
      roundIndex: 2,
      seekerId: 'p1',
      capturedCount: 1,
      totalHiders: 2,
      nextSeekerId: 'p2',
      scoreDeltas: [
        {
          playerId: 'p1',
          displayName: 'Owner',
          role: 'seeker',
          delta: 1,
          totalScore: 4,
          captured: false
        },
        {
          playerId: 'p2',
          displayName: 'Hider A',
          role: 'hider',
          delta: 0,
          totalScore: 2,
          captured: true
        },
        {
          playerId: 'p3',
          displayName: 'Hider B',
          role: 'hider',
          delta: 1,
          totalScore: 3,
          captured: false
        }
      ]
    });

    const display = result.getDisplayState();

    assert.equal(display.titleText, 'Round 2 Result');
    assert.equal(display.capturedText, 'Owner caught 1/2');
    assert.deepEqual(display.survivorLines, ['Hider B survived']);
    assert.deepEqual(display.scoreLines, ['Owner +1 (4)', 'Hider A +0 (2)', 'Hider B +1 (3)']);
    assert.deepEqual(display.rankingLines, ['1. Owner 4', '2. Hider B 3', '3. Hider A 2']);
    assert.equal(display.nextSeekerText, 'Next Seeker: Hider A');
  });
});

function createRoomState(): PublicRoomState {
  return {
    roomId: 'ROOM42',
    status: 'waiting',
    mapId: 'kitchen_01',
    maxPlayers: 4,
    minPlayers: 2,
    ownerPlayerId: 'p1',
    createdAtMs: 1000,
    updatedAtMs: 2000,
    players: [
      {
        playerId: 'p1',
        playerName: 'owner',
        displayName: 'Owner',
        ready: true,
        connected: true,
        isOwner: true
      },
      {
        playerId: 'p2',
        playerName: 'hider_a',
        displayName: 'Hider A',
        ready: true,
        connected: true,
        isOwner: false
      },
      {
        playerId: 'p3',
        playerName: 'hider_b',
        displayName: 'Hider B',
        ready: true,
        connected: true,
        isOwner: false
      }
    ]
  };
}
