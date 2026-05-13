import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PlayerRole,
  PlayerState,
  RoundPhase,
  type PublicV2AmbientEventState,
  type PublicV2ObjectiveState,
  type ServerStateMessage
} from '@prop-hide-seek/shared';
import { RemoteGameState, type AuthoritativeServerState } from '../assets/scripts/gameplay/RemoteGameState';
import { GameHUD } from '../assets/scripts/ui/GameHUD';

describe('Phase 08 V2 client read-only view state', () => {
  it('keeps V2 HUD summaries disabled when server state has no V2 fields', () => {
    const remoteState = new RemoteGameState();
    remoteState.pushState(createState());

    const hud = remoteState.getHUDViewModel('p2');

    assert.equal(hud.v2Objective.enabled, false);
    assert.equal(hud.v2Objective.label, '');
    assert.equal(hud.v2AmbientEvent.enabled, false);
    assert.equal(hud.v2AmbientEvent.status, 'none');
  });

  it('projects local hider objective progress into HUD and display state', () => {
    const remoteState = new RemoteGameState();
    remoteState.pushState(createState({
      v2Objectives: {
        enabled: true,
        playerObjectives: {
          p2: {
            label: 'Steal Coin',
            progressText: '1.2/2.0s',
            completed: false,
            rewardPoints: 1,
            hintStatus: 'available'
          }
        }
      }
    }));

    const hudViewModel = remoteState.getHUDViewModel('p2');
    assert.equal(hudViewModel.v2Objective.enabled, true);
    assert.equal(hudViewModel.v2Objective.label, 'Steal Coin');
    assert.equal(hudViewModel.v2Objective.progressText, '1.2/2.0s');
    assert.equal(hudViewModel.v2Objective.completed, false);
    assert.equal(hudViewModel.v2Objective.rewardText, '+1');
    assert.equal(hudViewModel.v2Objective.hintStatus, 'available');

    const hud = new GameHUD();
    hud.updateViewModel(hudViewModel);

    const display = hud.getDisplayState();
    assert.equal(display.v2ObjectiveVisible, true);
    assert.equal(display.v2ObjectiveText, 'Steal Coin');
    assert.equal(display.v2ObjectiveProgressText, '1.2/2.0s');
    assert.equal(display.v2ObjectiveRewardText, '+1');
    assert.equal(display.v2ObjectiveHintText, 'Hint available');
  });

  it('projects server-like arrays into HUD without exposing coordinates', () => {
    const remoteState = new RemoteGameState();
    const serverObjectives = [
      {
        objectiveId: 'hold_1',
        objectiveType: 'hold_point',
        position: { x: 111, y: 222 },
        radius: 24,
        requiredHoldMs: 2000,
        progressMs: 1200,
        completed: false,
        reward: 1
      }
    ] satisfies PublicV2ObjectiveState[];
    const serverEvents = [
      {
        eventId: 'zone_1',
        eventType: 'local_disruption',
        status: 'active',
        position: { x: 333, y: 444 },
        radius: 56,
        startsAtMs: 1000,
        endsAtMs: 4200
      }
    ] satisfies PublicV2AmbientEventState[];
    const serverState = createState({
      serverTimeMs: 1200,
      v2Objectives: serverObjectives,
      v2Events: serverEvents,
      events: [
        {
          type: 'v2_objective_completed',
          hiderId: 'p2',
          objectiveId: 'hold_1',
          reward: 1
        }
      ]
    }) satisfies ServerStateMessage;
    remoteState.pushState(serverState);

    const hud = remoteState.getHUDViewModel('p2');

    assert.equal(hud.v2Objective.enabled, true);
    assert.equal(hud.v2Objective.progressText, '1.2/2.0s');
    assert.equal(hud.v2Objective.completed, true);
    assert.equal(hud.v2Objective.rewardText, '+1');
    assert.equal(hud.v2AmbientEvent.enabled, true);
    assert.equal(hud.v2AmbientEvent.status, 'active');
    assert.equal(hud.v2AmbientEvent.title, 'Map change');
    assert.equal(hud.v2AmbientEvent.timeLeftMs, 3000);
    assert.equal(hud.v2AmbientEvent.publicAreaLabel, 'Nearby area');

    const serializedHud = JSON.stringify(hud);
    assert.equal(serializedHud.includes('111'), false);
    assert.equal(serializedHud.includes('222'), false);
    assert.equal(serializedHud.includes('333'), false);
    assert.equal(serializedHud.includes('444'), false);
  });

  it('shows active ambient event public description without exposing hidden player position', () => {
    const remoteState = new RemoteGameState();
    remoteState.pushState(createState({
      v2Events: {
        enabled: true,
        active: {
          status: 'active',
          title: 'Kitchen Steam',
          timeLeftMs: 4200,
          publicAreaLabel: 'North Kitchen',
          hiderPosition: { x: 777, y: 888 },
          hiddenPlayerPosition: { x: 777, y: 888 },
          x: 777,
          y: 888
        }
      }
    }));

    const hud = remoteState.getHUDViewModel('p1');
    assert.equal(hud.v2AmbientEvent.enabled, true);
    assert.equal(hud.v2AmbientEvent.status, 'active');
    assert.equal(hud.v2AmbientEvent.title, 'Kitchen Steam');
    assert.equal(hud.v2AmbientEvent.timeLeftMs, 4200);
    assert.equal(hud.v2AmbientEvent.publicAreaLabel, 'North Kitchen');

    const serializedHud = JSON.stringify(hud);
    assert.equal(serializedHud.includes('777'), false);
    assert.equal(serializedHud.includes('888'), false);

    const gameHUD = new GameHUD();
    gameHUD.updateViewModel(hud);

    const display = gameHUD.getDisplayState();
    assert.equal(display.v2AmbientEventVisible, true);
    assert.equal(display.v2AmbientEventStatusText, 'Active');
    assert.equal(display.v2AmbientEventTitleText, 'Kitchen Steam');
    assert.equal(display.v2AmbientEventTimeText, '0:05');
    assert.equal(display.v2AmbientEventAreaText, 'North Kitchen');
  });
});

function createState(overrides: Partial<AuthoritativeServerState> = {}): AuthoritativeServerState {
  return {
    type: 'state',
    serverTimeMs: 1000,
    serverTick: 1,
    roomId: 'ROOM42',
    phase: RoundPhase.Seek,
    timeLeftMs: 30000,
    players: [
      {
        playerId: 'p1',
        displayName: 'Seeker',
        role: PlayerRole.Seeker,
        state: PlayerState.HiderDisguisedMoving,
        position: { x: 0, y: 0 },
        facingDeg: 0,
        score: 0
      },
      {
        playerId: 'p2',
        displayName: 'Hider',
        role: PlayerRole.Hider,
        state: PlayerState.HiderDisguisedIdle,
        position: { x: 80, y: 20 },
        facingDeg: 180,
        currentPropId: 'wooden_crate',
        score: 0
      }
    ],
    props: [],
    events: [],
    scores: {
      p1: 0,
      p2: 0
    },
    attackCountRemaining: 2,
    roundIndex: 0,
    seekerPlayerId: 'p1',
    ...overrides
  } as AuthoritativeServerState;
}
