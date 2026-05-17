(function () {
  if (globalThis.__PROP_HIDE_SEEK_NATIVE_FALLBACK__) {
    return;
  }

  globalThis.__PROP_HIDE_SEEK_NATIVE_FALLBACK__ = true;

  globalThis.__PROP_HIDE_SEEK_START_NATIVE_FALLBACK__ = function startNativeFallback(options) {
    if (globalThis.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STARTED__) {
      return;
    }
    globalThis.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STARTED__ = true;

    const wxApi = globalThis.wx;
    const canvas = globalThis.canvas || wxApi?.createCanvas?.();
    if (!wxApi || !canvas || typeof canvas.getContext !== 'function') {
      console.warn('[PropHideSeekFallback] wx canvas is unavailable.');
      return;
    }

    const ctx = canvas.getContext('2d');
    const systemInfo = wxApi.getSystemInfoSync?.() || {};
    const pixelRatio = systemInfo.pixelRatio || 1;
    const targetWidth = Math.max(480, Math.floor((systemInfo.windowWidth || canvas.width || 960) * pixelRatio));
    const targetHeight = Math.max(320, Math.floor((systemInfo.windowHeight || canvas.height || 640) * pixelRatio));
    if (!canvas.width || canvas.width < targetWidth) {
      canvas.width = targetWidth;
    }
    if (!canvas.height || canvas.height < targetHeight) {
      canvas.height = targetHeight;
    }

    const state = {
      serverUrl: normalizeServerUrl(options?.serverUrl) ||
        normalizeServerUrl(globalThis.__PROP_HIDE_SEEK_ROOM_SERVER_URL__) ||
        'ws://127.0.0.1:8787',
      screen: 'lobby',
      socket: null,
      connected: false,
      pending: null,
      playerName: 'Player',
      joinRoomId: normalizeRoomId(options?.roomId) || '',
      room: null,
      playerId: '',
      gameState: null,
      error: '',
      info: 'Native WeChat debug fallback',
      seq: 0,
      moveX: 0,
      moveY: 0,
      remoteEffects: {},
      solo: null,
      buttons: []
    };
    globalThis.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__ = state;

    const kenneySpritePaths = {
      wooden_crate: 'kenney/props/prop_wooden_crate.png',
      trash_bin: 'kenney/props/prop_trash_bin.png',
      plant_pot: 'kenney/props/prop_plant_pot.png',
      chair: 'kenney/props/prop_chair.png',
      water_bucket: 'kenney/props/prop_water_bucket.png',
      food_basket: 'kenney/props/prop_food_basket.png',
      map_stove: 'kenney/props/map_stove.png',
      map_sink: 'kenney/props/map_sink.png',
      map_counter: 'kenney/props/map_counter.png'
    };
    const generatedPropSpritePaths = {
      wooden_crate: 'generated/props/prop_wooden_crate.png',
      trash_bin: 'generated/props/prop_trash_bin.png',
      plant_pot: 'generated/props/prop_plant_pot.png',
      chair: 'generated/props/prop_chair.png',
      water_bucket: 'generated/props/prop_water_bucket.png',
      food_basket: 'generated/props/prop_food_basket.png',
      map_stove: 'generated/props/map_stove.png',
      map_sink: 'generated/props/map_sink.png',
      map_counter: 'generated/props/map_counter.png'
    };
    const catSpritePaths = {
      cat_orange_tabby: 'cats/cat_orange_tabby.png',
      cat_gray_tuxedo: 'cats/cat_gray_tuxedo.png',
      cat_calico: 'cats/cat_calico.png',
      cat_black: 'cats/cat_black.png',
      cat_siamese: 'cats/cat_siamese.png'
    };
    const catSkins = Object.keys(catSpritePaths);
    const catAnimationFrames = [
      'idle', 'walk_1', 'walk_2',
      'front_idle', 'front_walk_1', 'front_walk_2',
      'back_idle', 'back_walk_1', 'back_walk_2',
      'diag_front_idle', 'diag_front_walk_1', 'diag_front_walk_2',
      'diag_back_idle', 'diag_back_walk_1', 'diag_back_walk_2',
      'side_crouch', 'front_crouch', 'back_crouch', 'diag_front_crouch', 'diag_back_crouch',
      'side_attack_1', 'side_attack_2',
      'front_attack_1', 'front_attack_2',
      'back_attack_1', 'back_attack_2',
      'diag_front_attack_1', 'diag_front_attack_2',
      'diag_back_attack_1', 'diag_back_attack_2',
      'attack_1', 'attack_2', 'reveal', 'dizzy'
    ];
    const catAnimationSpritePaths = createCatAnimationSpritePaths(catSkins, catAnimationFrames);
    const fallbackGameRulesConfig = {
      previewDurationMs: 5000,
      hideDurationMs: 12000,
      seekDurationMs: 45000,
      resultDurationMs: 5000,
      attackSectorDeg: 90,
      attackRadiusPx: 120,
      attackCountMultiplier: 2,
      hiderHideSpeed: 220,
      hiderSeekSpeed: 90,
      seekerSpeed: 220
    };
    const gameRulesConfig = normalizeGameRulesConfig(
      options?.gameConfig || globalThis.__PROP_HIDE_SEEK_GAME_CONFIG__,
      fallbackGameRulesConfig
    );
    const attackConeDotThreshold = Math.cos((gameRulesConfig.attackSectorDeg / 2) * Math.PI / 180);
    const generatedPropImages = loadSpriteImages(generatedPropSpritePaths, 'generated prop sprite');
    const kenneyImages = loadSpriteImages(kenneySpritePaths, 'Kenney sprite');
    const catImages = loadSpriteImages(catSpritePaths, 'cat sprite');
    const catAnimationImages = loadSpriteImages(catAnimationSpritePaths, 'cat animation sprite');

    function connectThen(message) {
      state.pending = message;
      state.error = '';
      if (state.connected && state.socket) {
        send(message);
        state.pending = null;
        return;
      }

      state.info = `Connecting ${state.serverUrl}`;
      const task = wxApi.connectSocket({ url: state.serverUrl });
      state.socket = task;
      task.onOpen(function () {
        state.connected = true;
        state.info = 'Connected';
        if (state.pending) {
          send(state.pending);
          state.pending = null;
        }
      });
      task.onMessage(function (event) {
        let message = null;
        try {
          message = JSON.parse(event.data);
        } catch (error) {
          state.error = 'Bad server message';
          return;
        }
        handleMessage(message);
        draw();
      });
      task.onError(function (event) {
        state.connected = false;
        state.error = event?.errMsg || 'WebSocket error';
      });
      task.onClose(function () {
        state.connected = false;
      });
    }

    function send(message) {
      if (!state.socket || !state.connected) {
        state.error = 'Not connected';
        return;
      }
      state.socket.send({
        data: JSON.stringify(message),
        fail(error) {
          state.error = error?.errMsg || 'Send failed';
        }
      });
    }

    function createRoom() {
      connectThen({ type: 'create_room', playerName: getPlayerName() });
    }

    function joinRoom(roomId) {
      const normalizedRoomId = normalizeRoomId(roomId || state.joinRoomId);
      if (!normalizedRoomId) {
        state.error = 'Room code is required.';
        return;
      }

      state.joinRoomId = normalizedRoomId;
      connectThen({
        type: 'join_room',
        roomId: normalizedRoomId,
        playerName: getPlayerName()
      });
    }

    function shareRoom() {
      if (!state.room?.roomId) {
        state.error = 'Create or join a room before sharing.';
        return false;
      }

      const payload = createSharePayload(state.room.roomId);
      if (typeof wxApi.shareAppMessage === 'function') {
        wxApi.shareAppMessage(payload);
        state.info = 'Share requested.';
        return true;
      }

      state.error = 'Share is available in WeChat.';
      return false;
    }

    function registerShare(roomId) {
      if (!roomId || typeof wxApi.onShareAppMessage !== 'function') {
        return;
      }
      wxApi.onShareAppMessage(function () {
        return createSharePayload(roomId);
      });
    }

    function createSharePayload(roomId) {
      const query = `roomId=${encodeURIComponent(roomId)}&serverUrl=${encodeURIComponent(state.serverUrl)}`;
      return {
        title: 'Join my Prop Hide & Seek room',
        query
      };
    }

    function handleMessage(message) {
      if (message.type === 'welcome') {
        state.playerId = message.playerId || state.playerId;
        return;
      }
      if (message.type === 'room_joined' || message.type === 'room_updated' || message.type === 'match_starting') {
        state.room = message.room;
        state.playerId = message.playerId || state.playerId;
        state.joinRoomId = normalizeRoomId(message.room?.roomId) || state.joinRoomId;
        state.screen = message.type === 'match_starting' ? 'game' : 'room';
        state.error = '';
        registerShare(message.room?.roomId);
        return;
      }
      if (message.type === 'state') {
        state.gameState = message;
        applyRemoteVisualEvents(message.events || []);
        state.screen = 'game';
        state.error = '';
        return;
      }
      if (message.type === 'game_event') {
        applyRemoteVisualEvent(message.event);
        state.screen = 'game';
        state.error = '';
        return;
      }
      if (message.type === 'error') {
        state.error = message.message || message.code || 'Server error';
      }
    }

    function applyLaunchOptions(launchOptions, autoJoin) {
      const query = launchOptions?.query || {};
      const nextServerUrl = normalizeServerUrl(query.serverUrl);
      if (nextServerUrl) {
        state.serverUrl = nextServerUrl;
      }

      const nextRoomId = normalizeRoomId(query.roomId);
      if (nextRoomId) {
        state.joinRoomId = nextRoomId;
        state.info = `Launch room ${nextRoomId}`;
        if (autoJoin) {
          joinRoom(nextRoomId);
        }
        return true;
      }

      return Boolean(nextServerUrl);
    }

    function button(label, x, y, w, h, action) {
      state.buttons.push({ label, x, y, w, h, action });
      ctx.fillStyle = '#2563eb';
      roundRect(x, y, w, h, 8);
      ctx.fillStyle = '#ffffff';
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + w / 2, y + h / 2);
    }

    function draw() {
      const width = canvas.width || 960;
      const height = canvas.height || 640;
      state.buttons = [];
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(width * 0.06, height * 0.08, width * 0.88, height * 0.84);

      if (state.screen === 'lobby') {
        drawLobby(width, height);
      } else if (state.screen === 'room') {
        drawRoom(width, height);
      } else if (state.screen === 'game') {
        drawGame(width, height);
      } else {
        drawSolo(width, height);
      }

      if (state.error) {
        ctx.fillStyle = '#f87171';
        ctx.font = '17px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(state.error.slice(0, 90), width / 2, height - 34);
      }
    }

    function drawLobby(width, height) {
      title('Prop Hide & Seek', width / 2, height * 0.18, 34);
      line(`Server: ${state.serverUrl}`, width / 2, height * 0.28, '#cbd5e1', 18);
      line(state.joinRoomId ? `Launch room: ${state.joinRoomId}` : state.info, width / 2, height * 0.34, '#93c5fd', 16);
      button('Create Room', width / 2 - 300, height * 0.44, 220, 54, createRoom);
      button('Join Room', width / 2 - 40, height * 0.44, 220, 54, function () {
        joinRoom(state.joinRoomId);
      });
      button('Solo Match', width / 2 - 170, height * 0.55, 340, 54, startSoloPractice);
      line('Native fallback is opt-in debug mode; default DevTools runs Cocos.', width / 2, height * 0.66, '#94a3b8', 15);
    }

    function drawRoom(width, height) {
      const room = state.room;
      title(`Room ${room?.roomId || state.joinRoomId || ''}`, width / 2, height * 0.16, 32);
      const players = room?.players || [];
      players.forEach(function (player, index) {
        line(`${player.displayName || player.playerName}: ${player.ready ? 'Ready' : 'Not ready'}${player.isOwner ? ' | Owner' : ''}`, width / 2, height * 0.27 + index * 28, '#e2e8f0', 18);
      });
      button('Ready', width / 2 - 330, height * 0.66, 135, 50, function () {
        send({ type: 'set_ready', ready: true });
      });
      button('Test Player', width / 2 - 175, height * 0.66, 160, 50, addTestPlayer);
      button('Start', width / 2 + 5, height * 0.66, 120, 50, function () {
        send({ type: 'start_match' });
      });
      button('Share', width / 2 + 145, height * 0.66, 130, 50, shareRoom);
    }

    function drawGame(width, height) {
      const game = state.gameState;
      if (!game) {
        drawWaitingMatchView(width, height);
        return;
      }

      drawMatchView(createRemoteMatchView(game), width, height);
    }

    function drawWaitingMatchView(width, height) {
      title('Prop Hide & Seek', width / 2, 52, 28);
      line('Waiting for state...', width / 2, 88, '#cbd5e1', 17);
      const frame = getGameplayMapFrame(width, height);
      drawMapViewport(createMapViewport(frame.x, frame.y, frame.width, frame.height, null), function (worldX, worldY, worldW, worldH) {
        drawKitchenMap(worldX, worldY, worldW, worldH);
      });
    }

    function drawMatchView(view, width, height) {
      title('Prop Hide & Seek', width / 2, 52, 28);
      line(view.summaryLine, width / 2, 88, '#cbd5e1', 17);
      line(view.scoreLine, width / 2, 118, '#93c5fd', 16);

      const frame = getGameplayMapFrame(width, height);
      const mapX = frame.x;
      const mapY = frame.y;
      const mapW = frame.width;
      const mapH = frame.height;
      const mapView = createMapViewport(mapX, mapY, mapW, mapH, view.focus);
      drawMapViewport(mapView, function (worldX, worldY, worldW, worldH) {
        drawKitchenMap(worldX, worldY, worldW, worldH);
        drawMatchWorld(view, worldX, worldY, worldW, worldH);
      });

      if (view.blindOverlay) {
        ctx.fillStyle = '#020617';
        ctx.fillRect(mapX, mapY, mapW, mapH);
        line('Hiders are arranging the room', mapX + mapW / 2, mapY + mapH / 2 - 18, '#e2e8f0', 22);
        line('Memorize from Preview, then search in Seek', mapX + mapW / 2, mapY + mapH / 2 + 18, '#94a3b8', 16);
      }

      if (view.result) {
        drawMatchResult(view, width, height);
        return;
      }

      line(view.hint, width / 2, height * 0.745, '#e2e8f0', 16);
      drawGameplayControls(width, height, view.actionLabel, view.onMove, view.onAction, view.onBackLobby);
    }

    function drawMatchWorld(view, mapX, mapY, mapW, mapH) {
      view.props.forEach(function (prop) {
        drawSoloProp(mapX, mapY, mapW, mapH, prop.kind, prop.x, prop.y, prop.scale || 1, Boolean(prop.selected), Boolean(prop.destroyed), prop.radius);
      });

      view.actors.forEach(function (actor) {
        if (actor.disguisePropId) {
          drawSoloProp(
            mapX,
            mapY,
            mapW,
            mapH,
            actor.disguisePropId,
            actor.x,
            actor.y,
            actor.scale || 1,
            Boolean(actor.selected),
            false,
            actor.radius
          );
          return;
        }

        drawCatActor(mapX, mapY, mapW, mapH, actor, Boolean(actor.showFacing));
      });

      drawKitchenForeground(mapX, mapY, mapW, mapH);
    }

    function drawMatchResult(view, width, height) {
      line(view.result.title, width / 2, height * 0.755, '#f8fafc', 20);
      line(view.result.lines.join('   '), width / 2, height * 0.805, '#cbd5e1', 16);

      if (view.result.primaryAction) {
        button(view.result.primaryAction.label, width / 2 - 225, height * 0.875, 190, 48, view.result.primaryAction.action);
      }
      if (view.result.secondaryAction) {
        button(view.result.secondaryAction.label, width / 2 + 55, height * 0.875, 170, 48, view.result.secondaryAction.action);
      }
      if (!view.result.primaryAction && !view.result.secondaryAction) {
        button('Back Lobby', width / 2 - 85, height * 0.875, 170, 48, view.onBackLobby);
      }
    }

    function createRemoteMatchView(game) {
      const local = getLocalPlayer();
      const seeker = getRemoteSeeker(game);
      return {
        phase: game.phase,
        summaryLine: `Round ${(game.roundIndex || 0) + 1} | ${game.phase} | ${Math.ceil((game.timeLeftMs || 0) / 1000)}s | You: ${local?.role || 'spectator'}`,
        scoreLine: getRemoteScoreLine(game),
        focus: getRemoteMapFocus(game),
        blindOverlay: game.phase === 'hide' && local?.role === 'seeker',
        props: getRemoteViewProps(game),
        actors: getRemoteViewActors(game, local),
        hint: getRemoteHintText(game, local, seeker),
        actionLabel: getRemoteActionLabel(game, local),
        onMove: function (moveX, moveY) { input(moveX, moveY); },
        onAction: function () {
          const action = getRemoteAction(game, local);
          triggerRemoteLocalActionVisual(local, action);
          input(0, 0, action);
        },
        onBackLobby: goBackToLobby,
        result: isResultPhase(game.phase) ? getRemoteResultView(game) : null
      };
    }

    function getRemoteViewProps(game) {
      return (game.props || []).map(function (prop) {
        return {
          kind: prop.propConfigId,
          x: prop.position.x,
          y: prop.position.y,
          radius: prop.radius,
          blocksMovement: prop.blocksMovement !== false,
          destroyed: Boolean(prop.isDestroyed)
        };
      });
    }

    function getRemoteViewActors(game, local) {
      if (game.phase === 'preview') {
        return [];
      }

      return (game.players || []).map(function (player) {
        if (player.state === 'invisible_in_preview' || player.state === 'seeker_locked') {
          return null;
        }

        const captured = player.captured || player.state === 'captured';
        const hiderRevealed = isResultPhase(game.phase);
        const hiderMovingAsCharacter = game.phase === 'hide' && player.state === 'hider_moving_as_character';
        const disguisedAsProp = player.role === 'hider' && player.currentPropId && !captured && !hiderRevealed && !hiderMovingAsCharacter;
        if (disguisedAsProp) {
          return {
            id: player.playerId || player.displayName,
            x: player.position.x,
            y: player.position.y,
            disguisePropId: player.currentPropId,
            radius: getSoloPropRadius(player.currentPropId),
            selected: player.playerId === local?.playerId
          };
        }

        const effect = getRemotePlayerEffect(player.playerId || player.displayName, false);
        const attackMs = getRemainingEffectMs(effect?.attackUntil);
        const revealMs = getRemainingEffectMs(effect?.revealUntil);
        const dizzyMs = getRemainingEffectMs(effect?.dizzyUntil);
        const remoteMoving = Boolean(player.isMoving || (player.role === 'hider' && String(player.state || '').includes('moving')));
        return {
          id: player.playerId || player.displayName,
          displayName: player.displayName,
          x: player.position.x,
          y: player.position.y,
          facingX: player.facing?.x,
          facingY: player.facing?.y,
          facingDeg: player.facingDeg,
          captured,
          moving: attackMs > 0 ? false : remoteMoving,
          attackMs,
          attackFacingX: effect?.attackFacingX,
          attackFacingY: effect?.attackFacingY,
          revealMs,
          dizzyMs,
          taunting: hiderRevealed && player.role === 'hider' && !captured,
          showFacing: player.role === 'seeker'
        };
      }).filter(Boolean);
    }

    function getRemoteResultView(game) {
      const players = [...(game.players || [])].sort(function (a, b) {
        return (b.score || 0) - (a.score || 0);
      });
      return {
        title: game.phase === 'match_end' ? 'Match complete' : 'Round result',
        lines: players.map(function (player, index) {
          return `${index + 1}. ${player.displayName || player.playerId} ${player.score || 0}`;
        }),
        secondaryAction: {
          label: 'Back Lobby',
          action: goBackToLobby
        }
      };
    }

    function createSoloMatchView(solo) {
      const human = getSoloHuman(solo);
      const seeker = getSoloSeeker(solo);
      return {
        phase: solo.phase,
        summaryLine: `Round ${Math.min(solo.roundIndex + 1, solo.players.length)}/${solo.players.length} | ${solo.phase} | ${Math.ceil(solo.timeLeftMs / 1000)}s | You: ${human.role}`,
        scoreLine: solo.players.map(function (player) { return `${player.displayName} ${player.score}`; }).join('   '),
        focus: getSoloMapFocus(solo, human, seeker),
        blindOverlay: solo.phase === 'hide' && human.role === 'seeker',
        props: getSoloViewProps(solo),
        actors: getSoloViewActors(solo, human),
        hint: getSoloHintText(solo, human, seeker),
        actionLabel: getSoloActionLabel(solo, human),
        onMove: soloInput,
        onAction: function () {
          soloInput(0, 0);
          soloAction();
        },
        onBackLobby: function () {
          state.screen = 'lobby';
          state.solo = null;
          state.moveX = 0;
          state.moveY = 0;
        },
        result: isResultPhase(solo.phase) ? getSoloResultView(solo) : null
      };
    }

    function getSoloViewProps(solo) {
      return solo.props.map(function (prop) {
        return {
          kind: prop.kind,
          x: prop.x,
          y: prop.y,
          radius: prop.radius,
          blocksMovement: prop.blocksMovement !== false,
          destroyed: Boolean(prop.destroyed)
        };
      });
    }

    function getSoloViewActors(solo, human) {
      if (solo.phase === 'preview') {
        return [];
      }

      return solo.players.map(function (player) {
        if (player.role === 'seeker' && solo.phase === 'hide') {
          return null;
        }

        if (player.role === 'hider' && !player.captured && !isResultPhase(solo.phase) && !(solo.phase === 'hide' && (player.moving || player.hideCharacterMs > 0))) {
          return {
            id: player.id,
            x: player.x,
            y: player.y,
            disguisePropId: getSoloPlayerPropId(solo, player),
            selected: player.id === human.id && player.role === 'hider',
            radius: getSoloPropRadius(getSoloPlayerPropId(solo, player))
          };
        }

        return {
          ...player,
          taunting: isResultPhase(solo.phase) && player.role === 'hider' && !player.captured ? true : player.taunting,
          showFacing: player.role === 'seeker'
        };
      }).filter(Boolean);
    }

    function getSoloResultView(solo) {
      const matchEnded = solo.phase === 'match_end' || solo.matchEnded;
      return {
        title: solo.phase === 'match_end' ? 'Match complete' : solo.resultText,
        lines: matchEnded ? getSoloRankingLines(solo) : solo.resultLines,
        primaryAction: matchEnded
          ? {
              label: 'Restart Match',
              action: startSoloPractice
            }
          : {
              label: 'Next Round',
              action: function () { enterSoloRound(solo, solo.roundIndex + 1); }
            },
        secondaryAction: {
          label: 'Back Lobby',
          action: function () {
            state.screen = 'lobby';
            state.solo = null;
          }
        }
      };
    }

    function isResultPhase(phase) {
      return phase === 'result' || phase === 'match_end';
    }

    function goBackToLobby() {
      state.screen = 'lobby';
      state.moveX = 0;
      state.moveY = 0;
    }

    function input(moveX, moveY, action) {
      state.moveX = moveX;
      state.moveY = moveY;
      state.seq += 1;
      send({ type: 'player_input', seq: state.seq, moveX, moveY, action });
    }

    function applyRemoteVisualEvents(events) {
      events.forEach(function (event) {
        applyRemoteVisualEvent(event);
      });
    }

    function applyRemoteVisualEvent(event) {
      if (!event || typeof event !== 'object') {
        return;
      }

      if (event.type === 'attack') {
        const attackerId = event.attackerId || event.seekerPlayerId || event.playerId;
        if (!attackerId) {
          return;
        }
        const effect = getRemotePlayerEffect(attackerId, true);
        effect.attackUntil = Date.now() + 480;
        effect.attackFacingX = Number.isFinite(event.facingX) ? event.facingX : effect.attackFacingX;
        effect.attackFacingY = Number.isFinite(event.facingY) ? event.facingY : effect.attackFacingY;
        return;
      }

      if (event.type === 'hider_captured') {
        const hiderId = event.hiderId || event.hiderPlayerId;
        if (!hiderId) {
          return;
        }
        const effect = getRemotePlayerEffect(hiderId, true);
        effect.revealUntil = Date.now() + 700;
        effect.dizzyUntil = Date.now() + 2600;
      }
    }

    function triggerRemoteLocalActionVisual(local, action) {
      if (!local || action !== 'attack') {
        return;
      }

      const effect = getRemotePlayerEffect(local.playerId || local.displayName, true);
      const facing = normalizeFacingForVisuals(getPlayerFacing(local));
      effect.attackUntil = Date.now() + 480;
      effect.attackFacingX = facing.x;
      effect.attackFacingY = facing.y;
    }

    function getRemotePlayerEffect(playerId, create) {
      if (!playerId) {
        return null;
      }
      let effect = state.remoteEffects[playerId];
      if (!effect && create) {
        effect = {
          attackUntil: 0,
          attackFacingX: null,
          attackFacingY: null,
          revealUntil: 0,
          dizzyUntil: 0
        };
        state.remoteEffects[playerId] = effect;
      }
      return effect || null;
    }

    function getRemainingEffectMs(until) {
      return Math.max(0, Number(until || 0) - Date.now());
    }

    function getRemoteAction(game, local) {
      if (!local || game.phase === 'preview' || game.phase === 'result' || game.phase === 'match_end') {
        return undefined;
      }
      if (local.role === 'seeker') {
        return game.phase === 'seek' ? 'attack' : undefined;
      }
      return 'switch_prop';
    }

    function getRemoteActionLabel(game, local) {
      if (!local) {
        return 'Locked';
      }
      if (local.role === 'seeker') {
        return game.phase === 'seek' ? `Cone Attack (${game.attackCountRemaining || 0})` : 'Locked';
      }
      return game.phase === 'preview' || game.phase === 'result' || game.phase === 'match_end' ? 'Locked' : 'Switch Prop';
    }

    function getRemoteHintText(game, local, seeker) {
      if (game.phase === 'preview') return 'Preview: study the original prop layout.';
      if (game.phase === 'hide' && local?.role === 'seeker') return 'Hide: you are blind while hiders pick positions.';
      if (game.phase === 'hide') return 'Hide: choose a believable spot and switch disguise freely.';
      if (local?.role === 'seeker') return `Seek: ${game.attackCountRemaining || 0} attacks left. Hit suspicious props.`;
      return `Seek: ${seeker?.displayName || 'Seeker'} is searching. Keep your prop believable.`;
    }

    function getRemoteScoreLine(game) {
      const players = game.players || [];
      if (players.length === 0) {
        return 'Scores pending';
      }
      return players.map(function (player) {
        const score = Number.isFinite(player.score) ? player.score : game.scores?.[player.playerId] || 0;
        return `${player.displayName || player.playerId} ${score}`;
      }).join('   ');
    }

    function getRemoteSeeker(game) {
      return (game.players || []).find(function (player) {
        return player.playerId === game.seekerPlayerId || player.role === 'seeker';
      }) || null;
    }

    function getLocalPlayer() {
      const players = state.gameState?.players || [];
      if (state.playerId) {
        const byId = players.find(function (player) {
          return player.playerId === state.playerId;
        });
        if (byId) return byId;
      }
      return players.find(function (player) {
        return player.displayName === state.playerName || player.playerName === state.playerName;
      }) || null;
    }

    function getRemoteMapFocus(game) {
      if (!game || game.phase === 'preview') {
        return null;
      }
      const local = getLocalPlayer();
      if (local && local.state !== 'invisible_in_preview' && local.state !== 'seeker_locked') {
        return local.position || null;
      }
      const seeker = (game.players || []).find(function (player) {
        return player.playerId === game.seekerPlayerId || player.role === 'seeker';
      });
      return seeker?.position || null;
    }

    function drawGameplayControls(width, height, actionLabel, onMove, onAction, onBackLobby) {
      button('UL', width * 0.10, height * 0.78, 68, 40, function () { onMove(-1, -1); });
      button('Up', width * 0.19, height * 0.78, 80, 40, function () { onMove(0, -1); });
      button('UR', width * 0.28, height * 0.78, 68, 40, function () { onMove(1, -1); });
      button('Left', width * 0.10, height * 0.86, 80, 40, function () { onMove(-1, 0); });
      button('Stop', width * 0.19, height * 0.86, 80, 40, function () { onMove(0, 0); });
      button('Right', width * 0.28, height * 0.86, 80, 40, function () { onMove(1, 0); });
      button('DL', width * 0.10, height * 0.94, 68, 40, function () { onMove(-1, 1); });
      button('Down', width * 0.19, height * 0.94, 80, 40, function () { onMove(0, 1); });
      button('DR', width * 0.28, height * 0.94, 68, 40, function () { onMove(1, 1); });
      button(actionLabel, width * 0.68, height * 0.82, 175, 50, onAction);
      button('Back Lobby', width * 0.68, height * 0.91, 175, 44, onBackLobby);
    }

    function getSoloMapFocus(solo, human, seeker) {
      if (!solo || solo.phase === 'preview') {
        return null;
      }
      if (solo.phase === 'hide' && human?.role === 'seeker') {
        return null;
      }
      if (human && !human.captured && solo.phase !== 'result' && solo.phase !== 'match_end') {
        return human;
      }
      return seeker || human || null;
    }

    function createMapViewport(mapX, mapY, mapW, mapH, focus) {
      void focus;
      const fullScale = Math.min(mapW / soloMapWidth, mapH / soloMapHeight);
      const worldW = soloMapWidth * fullScale;
      const worldH = soloMapHeight * fullScale;
      return {
        mapX,
        mapY,
        mapW,
        mapH,
        worldX: mapX + (mapW - worldW) / 2,
        worldY: mapY + (mapH - worldH) / 2,
        worldW,
        worldH
      };
    }

    function getGameplayMapFrame(width, height) {
      const mapW = width * 0.92;
      const mapH = Math.min(height * 0.76, mapW * 9 / 16);
      return {
        x: (width - mapW) / 2,
        y: height * 0.08,
        width: mapW,
        height: mapH
      };
    }

    function drawMapViewport(view, drawWorld) {
      ctx.save?.();
      ctx.beginPath();
      ctx.rect?.(view.mapX, view.mapY, view.mapW, view.mapH);
      ctx.clip?.();
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(view.mapX, view.mapY, view.mapW, view.mapH);
      drawWorld(view.worldX, view.worldY, view.worldW, view.worldH);
      ctx.restore?.();
      ctx.strokeStyle = '#475569';
      ctx.strokeRect(view.mapX, view.mapY, view.mapW, view.mapH);
    }

    function drawKitchenMap(mapX, mapY, mapW, mapH) {
      function wx(x) { return mapX + mapW * x / soloMapWidth; }
      function wy(y) { return mapY + mapH * y / soloMapHeight; }
      function ww(width) { return mapW * width / soloMapWidth; }
      function wh(height) { return mapH * height / soloMapHeight; }

      ctx.fillStyle = '#c9a66b';
      ctx.fillRect(mapX, mapY, mapW, mapH);

      ctx.fillStyle = '#6b7280';
      ctx.fillRect(mapX, mapY, mapW, Math.max(2, wh(18)));
      ctx.fillRect(mapX, mapY, Math.max(2, ww(18)), mapH);
      ctx.fillRect(mapX + mapW - Math.max(2, ww(18)), mapY, Math.max(2, ww(18)), mapH);
      ctx.fillRect(mapX, mapY + mapH - Math.max(2, wh(18)), mapW, Math.max(2, wh(18)));

      for (const obstacle of soloObstacles) {
        const x = wx(obstacle.x);
        const y = wy(obstacle.y);
        const w = ww(obstacle.width);
        const h = wh(obstacle.height);
        if (drawKitchenObstacleFixture(obstacle.id, x, y, w, h)) {
          continue;
        }
        ctx.fillStyle = obstacle.id.includes('fridge') || obstacle.id.includes('freezer') ? '#dbeafe' : '#475569';
        if (obstacle.id.includes('counter')) {
          ctx.fillStyle = '#8b5a2b';
        }
        if (obstacle.id.includes('plant')) {
          ctx.fillStyle = '#14532d';
        }
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#334155';
        ctx.strokeRect(x, y, w, h);
        if (obstacle.id.includes('sink')) {
          drawPropImage('map_sink', x + w / 2, y + h / 2, w, h);
        } else if (obstacle.id.includes('stove')) {
          drawPropImage('map_stove', x + w / 2, y + h / 2, w, h);
        } else if (obstacle.id.includes('counter')) {
          drawPropImage('map_counter', x + w / 2, y + h / 2, w, h);
        }
      }
      ctx.strokeStyle = '#334155';
      ctx.strokeRect(mapX, mapY, mapW, mapH);
    }

    function drawKitchenObstacleFixture(id, x, y, w, h) {
      if (id.includes('center_table')) {
        drawKitchenTableObstacle(x, y, w, h);
        return true;
      }
      if (id.includes('fridge') || id.includes('freezer')) {
        const visual = getKitchenStandingVisualRect(id, x, y, w, h);
        drawKitchenFridgeObstacle(visual.x, visual.y, visual.width, visual.height);
        return true;
      }
      if (id.includes('sink')) {
        drawKitchenSinkCounterObstacle(x, y, w, h);
        return true;
      }
      if (id.includes('stove')) {
        drawKitchenStoveObstacle(x, y, w, h);
        return true;
      }
      if (id.includes('pantry')) {
        const visual = getKitchenStandingVisualRect(id, x, y, w, h);
        drawKitchenPantryObstacle(visual.x, visual.y, visual.width, visual.height);
        return true;
      }
      if (id.includes('crate_shelf')) {
        const visual = getKitchenStandingVisualRect(id, x, y, w, h);
        drawKitchenCrateShelfObstacle(visual.x, visual.y, visual.width, visual.height);
        return true;
      }
      return false;
    }

    function getKitchenStandingVisualRect(id, x, y, w, h) {
      const scale = getKitchenStandingVisualScale(id);
      const width = w * scale.width;
      const height = h * scale.height;
      const anchorY = y + h * 0.88;
      return {
        x: x + w / 2 - width / 2,
        y: anchorY - height * 0.88,
        width,
        height
      };
    }

    function getKitchenStandingVisualScale(id) {
      if (id.includes('crate_shelf')) {
        return { width: 2.35, height: 2.05 };
      }
      if (id.includes('pantry')) {
        return { width: 2.0, height: 1.6 };
      }
      return { width: 1.8, height: 1.6 };
    }

    function fillKitchenQuad(points, fillStyle, strokeStyle) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) {
        ctx.lineTo(points[index].x, points[index].y);
      }
      ctx.closePath();
      ctx.fillStyle = fillStyle;
      ctx.fill();
      if (strokeStyle) {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = Math.max(1, Math.min(3, Math.abs(points[0].y - points[2].y) * 0.025));
        ctx.stroke();
      }
    }

    function strokeKitchenLine(fromX, fromY, toX, toY, strokeStyle, lineWidth) {
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth || 1;
      ctx.stroke();
    }

    function drawKitchenFridgeObstacle(x, y, w, h) {
      drawSoftShadow(x + w / 2, y + h * 0.88, w * 1.04, h * 0.22, 0.24);
      fillKitchenQuad([
        { x: x + w * 0.18, y: y + h * 0.14 },
        { x: x + w * 0.72, y: y + h * 0.20 },
        { x: x + w * 0.88, y: y + h * 0.30 },
        { x: x + w * 0.34, y: y + h * 0.24 }
      ], '#f0f9ff', '#475569');
      fillKitchenQuad([
        { x: x + w * 0.72, y: y + h * 0.20 },
        { x: x + w * 0.88, y: y + h * 0.30 },
        { x: x + w * 0.88, y: y + h * 0.83 },
        { x: x + w * 0.72, y: y + h * 0.76 }
      ], '#93c5fd', '#475569');
      fillKitchenQuad([
        { x: x + w * 0.18, y: y + h * 0.14 },
        { x: x + w * 0.72, y: y + h * 0.20 },
        { x: x + w * 0.72, y: y + h * 0.76 },
        { x: x + w * 0.18, y: y + h * 0.84 }
      ], '#dbeafe', '#475569');
      fillKitchenQuad([
        { x: x + w * 0.22, y: y + h * 0.19 },
        { x: x + w * 0.67, y: y + h * 0.24 },
        { x: x + w * 0.67, y: y + h * 0.40 },
        { x: x + w * 0.22, y: y + h * 0.45 }
      ], '#bfdbfe', '#60a5fa');
      strokeKitchenLine(x + w * 0.22, y + h * 0.49, x + w * 0.67, y + h * 0.45, '#60a5fa', Math.max(1, h * 0.018));
      fillKitchenQuad([
        { x: x + w * 0.62, y: y + h * 0.30 },
        { x: x + w * 0.67, y: y + h * 0.31 },
        { x: x + w * 0.67, y: y + h * 0.39 },
        { x: x + w * 0.62, y: y + h * 0.40 }
      ], '#64748b');
      fillKitchenQuad([
        { x: x + w * 0.62, y: y + h * 0.55 },
        { x: x + w * 0.67, y: y + h * 0.54 },
        { x: x + w * 0.67, y: y + h * 0.70 },
        { x: x + w * 0.62, y: y + h * 0.72 }
      ], '#64748b');
      fillKitchenQuad([
        { x: x + w * 0.28, y: y + h * 0.20 },
        { x: x + w * 0.40, y: y + h * 0.21 },
        { x: x + w * 0.40, y: y + h * 0.72 },
        { x: x + w * 0.28, y: y + h * 0.76 }
      ], 'rgba(255,255,255,0.34)');
    }

    function drawKitchenCounterBlock(x, y, w, h, colors) {
      drawSoftShadow(x + w / 2, y + h * 0.88, w * 1.04, h * 0.34, 0.22);
      ctx.fillStyle = colors.side;
      ctx.fillRect(x + w * 0.08, y + h * 0.34, w * 0.84, h * 0.58);
      ctx.fillStyle = colors.front;
      ctx.fillRect(x + w * 0.10, y + h * 0.48, w * 0.80, h * 0.42);
      ctx.fillStyle = colors.door;
      ctx.fillRect(x + w * 0.16, y + h * 0.55, w * 0.26, h * 0.26);
      ctx.fillRect(x + w * 0.58, y + h * 0.55, w * 0.26, h * 0.26);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.02, y + h * 0.26);
      ctx.lineTo(x + w * 0.98, y + h * 0.26);
      ctx.lineTo(x + w * 0.90, y + h * 0.48);
      ctx.lineTo(x + w * 0.10, y + h * 0.48);
      ctx.closePath();
      ctx.fillStyle = colors.top;
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = Math.max(1, h * 0.04);
      ctx.stroke();
      ctx.fillStyle = colors.highlight;
      ctx.fillRect(x + w * 0.10, y + h * 0.30, w * 0.70, Math.max(1, h * 0.06));
    }

    function drawKitchenSinkCounterObstacle(x, y, w, h) {
      drawKitchenCounterBlock(x, y, w, h, {
        side: '#854d0e',
        front: '#a16207',
        door: '#b45309',
        top: '#e7e5e4',
        highlight: '#f8fafc'
      });
      drawPropImage('map_sink', x + w * 0.50, y + h * 0.44, w * 0.48, h * 0.72);
      ctx.strokeStyle = '#64748b';
      ctx.strokeRect(x + w * 0.40, y + h * 0.33, w * 0.22, h * 0.15);
      ctx.fillStyle = '#0ea5e9';
      ctx.fillRect(x + w * 0.64, y + h * 0.28, Math.max(2, w * 0.025), h * 0.20);
    }

    function drawKitchenStoveObstacle(x, y, w, h) {
      drawKitchenCounterBlock(x, y, w, h, {
        side: '#3f3f46',
        front: '#52525b',
        door: '#71717a',
        top: '#1f2937',
        highlight: '#94a3b8'
      });
      drawPropImage('map_stove', x + w * 0.50, y + h * 0.43, w * 0.52, h * 0.72);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = Math.max(1, h * 0.035);
      for (const bx of [0.40, 0.55]) {
        ctx.beginPath();
        ctx.ellipse(x + w * bx, y + h * 0.38, w * 0.045, h * 0.09, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    function drawKitchenPantryObstacle(x, y, w, h) {
      drawSoftShadow(x + w / 2, y + h * 0.89, w * 0.98, h * 0.22, 0.22);
      fillKitchenQuad([
        { x: x + w * 0.14, y: y + h * 0.12 },
        { x: x + w * 0.72, y: y + h * 0.18 },
        { x: x + w * 0.90, y: y + h * 0.29 },
        { x: x + w * 0.32, y: y + h * 0.23 }
      ], '#d97706', '#451a03');
      fillKitchenQuad([
        { x: x + w * 0.72, y: y + h * 0.18 },
        { x: x + w * 0.90, y: y + h * 0.29 },
        { x: x + w * 0.90, y: y + h * 0.84 },
        { x: x + w * 0.72, y: y + h * 0.76 }
      ], '#713f12', '#451a03');
      fillKitchenQuad([
        { x: x + w * 0.14, y: y + h * 0.12 },
        { x: x + w * 0.72, y: y + h * 0.18 },
        { x: x + w * 0.72, y: y + h * 0.76 },
        { x: x + w * 0.14, y: y + h * 0.84 }
      ], '#a16207', '#451a03');
      fillKitchenQuad([
        { x: x + w * 0.22, y: y + h * 0.20 },
        { x: x + w * 0.43, y: y + h * 0.22 },
        { x: x + w * 0.43, y: y + h * 0.72 },
        { x: x + w * 0.22, y: y + h * 0.76 }
      ], '#ca8a04', '#92400e');
      fillKitchenQuad([
        { x: x + w * 0.50, y: y + h * 0.23 },
        { x: x + w * 0.68, y: y + h * 0.25 },
        { x: x + w * 0.68, y: y + h * 0.70 },
        { x: x + w * 0.50, y: y + h * 0.73 }
      ], '#ca8a04', '#92400e');
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(x + w * 0.45, y + h * 0.47, Math.max(2, w * 0.06), Math.max(2, h * 0.06));
    }

    function drawKitchenCrateShelfObstacle(x, y, w, h) {
      drawSoftShadow(x + w / 2, y + h * 0.88, w * 1.08, h * 0.30, 0.23);
      fillKitchenQuad([
        { x: x + w * 0.12, y: y + h * 0.16 },
        { x: x + w * 0.72, y: y + h * 0.22 },
        { x: x + w * 0.90, y: y + h * 0.32 },
        { x: x + w * 0.30, y: y + h * 0.25 }
      ], '#f59e0b', '#451a03');
      fillKitchenQuad([
        { x: x + w * 0.72, y: y + h * 0.22 },
        { x: x + w * 0.90, y: y + h * 0.32 },
        { x: x + w * 0.90, y: y + h * 0.78 },
        { x: x + w * 0.72, y: y + h * 0.70 }
      ], '#78350f', '#451a03');
      fillKitchenQuad([
        { x: x + w * 0.12, y: y + h * 0.16 },
        { x: x + w * 0.72, y: y + h * 0.22 },
        { x: x + w * 0.72, y: y + h * 0.70 },
        { x: x + w * 0.12, y: y + h * 0.82 }
      ], '#92400e', '#451a03');
      strokeKitchenLine(x + w * 0.16, y + h * 0.36, x + w * 0.68, y + h * 0.40, '#f59e0b', Math.max(2, h * 0.06));
      strokeKitchenLine(x + w * 0.16, y + h * 0.58, x + w * 0.68, y + h * 0.57, '#f59e0b', Math.max(2, h * 0.06));
      fillKitchenQuad([
        { x: x + w * 0.20, y: y + h * 0.22 },
        { x: x + w * 0.40, y: y + h * 0.24 },
        { x: x + w * 0.40, y: y + h * 0.34 },
        { x: x + w * 0.20, y: y + h * 0.36 }
      ], '#b45309', '#451a03');
      fillKitchenQuad([
        { x: x + w * 0.48, y: y + h * 0.44 },
        { x: x + w * 0.66, y: y + h * 0.45 },
        { x: x + w * 0.66, y: y + h * 0.54 },
        { x: x + w * 0.48, y: y + h * 0.56 }
      ], '#b45309', '#451a03');
    }

    function drawKitchenTableObstacle(x, y, w, h) {
      const centerX = x + w / 2;
      const shadowY = y + h * 0.86;
      drawSoftShadow(centerX, shadowY, w * 1.18, h * 0.46, 0.26);

      ctx.fillStyle = '#6f3f1e';
      ctx.fillRect(x + w * 0.15, y + h * 0.58, w * 0.10, h * 0.34);
      ctx.fillRect(x + w * 0.75, y + h * 0.58, w * 0.10, h * 0.34);
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(x + w * 0.18, y + h * 0.56, w * 0.64, h * 0.16);

      ctx.beginPath();
      ctx.moveTo(x + w * 0.08, y + h * 0.52);
      ctx.lineTo(x + w * 0.92, y + h * 0.52);
      ctx.lineTo(x + w * 0.82, y + h * 0.78);
      ctx.lineTo(x + w * 0.18, y + h * 0.78);
      ctx.closePath();
      ctx.fillStyle = '#7c461f';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(x + w * 0.05, y + h * 0.12);
      ctx.lineTo(x + w * 0.95, y + h * 0.12);
      ctx.lineTo(x + w * 0.92, y + h * 0.54);
      ctx.lineTo(x + w * 0.08, y + h * 0.54);
      ctx.closePath();
      ctx.fillStyle = '#c27a34';
      ctx.fill();
      ctx.strokeStyle = '#4b2a17';
      ctx.lineWidth = Math.max(1, h * 0.035);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x + w * 0.10, y + h * 0.20);
      ctx.lineTo(x + w * 0.90, y + h * 0.20);
      ctx.strokeStyle = '#e2a761';
      ctx.lineWidth = Math.max(1, h * 0.025);
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.ellipse(x + w * 0.35, y + h * 0.34, w * 0.095, h * 0.095, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#d97706';
      ctx.fillRect(x + w * 0.60, y + h * 0.28, w * 0.18, h * 0.10);
      ctx.fillStyle = '#92400e';
      ctx.fillRect(x + w * 0.63, y + h * 0.38, w * 0.12, h * 0.06);
    }

    function drawKitchenForeground(mapX, mapY, mapW, mapH) {
      function wx(x) { return mapX + mapW * x / soloMapWidth; }
      function wy(y) { return mapY + mapH * y / soloMapHeight; }
      function ww(width) { return mapW * width / soloMapWidth; }
      function wh(height) { return mapH * height / soloMapHeight; }

      for (const obstacle of soloObstacles) {
        if (!isKitchenStandingFixture(obstacle.id)) {
          continue;
        }
        drawKitchenStandingForegroundFixture(
          obstacle.id,
          wx(obstacle.x),
          wy(obstacle.y),
          ww(obstacle.width),
          wh(obstacle.height)
        );
      }
    }

    function isKitchenStandingFixture(id) {
      return id.includes('fridge') || id.includes('pantry') || id.includes('crate_shelf');
    }

    function drawKitchenStandingForegroundFixture(id, x, y, w, h) {
      const visual = getKitchenStandingVisualRect(id, x, y, w, h);
      if (id.includes('fridge')) {
        drawKitchenFridgeForeground(visual.x, visual.y, visual.width, visual.height);
      } else if (id.includes('pantry')) {
        drawKitchenPantryForeground(visual.x, visual.y, visual.width, visual.height);
      } else if (id.includes('crate_shelf')) {
        drawKitchenCrateShelfForeground(visual.x, visual.y, visual.width, visual.height);
      }
    }

    function drawKitchenFridgeForeground(x, y, w, h) {
      fillKitchenQuad([
        { x: x + w * 0.18, y: y + h * 0.14 },
        { x: x + w * 0.72, y: y + h * 0.20 },
        { x: x + w * 0.88, y: y + h * 0.30 },
        { x: x + w * 0.34, y: y + h * 0.24 }
      ], '#f0f9ff', '#475569');
      fillKitchenQuad([
        { x: x + w * 0.72, y: y + h * 0.20 },
        { x: x + w * 0.88, y: y + h * 0.30 },
        { x: x + w * 0.88, y: y + h * 0.83 },
        { x: x + w * 0.72, y: y + h * 0.76 }
      ], '#93c5fd', '#475569');
      fillKitchenQuad([
        { x: x + w * 0.18, y: y + h * 0.14 },
        { x: x + w * 0.72, y: y + h * 0.20 },
        { x: x + w * 0.72, y: y + h * 0.76 },
        { x: x + w * 0.18, y: y + h * 0.84 }
      ], '#dbeafe', '#475569');
      fillKitchenQuad([
        { x: x + w * 0.22, y: y + h * 0.19 },
        { x: x + w * 0.67, y: y + h * 0.24 },
        { x: x + w * 0.67, y: y + h * 0.40 },
        { x: x + w * 0.22, y: y + h * 0.45 }
      ], '#bfdbfe', '#60a5fa');
      strokeKitchenLine(x + w * 0.22, y + h * 0.49, x + w * 0.67, y + h * 0.45, '#60a5fa', Math.max(1, h * 0.018));
      fillKitchenQuad([
        { x: x + w * 0.62, y: y + h * 0.30 },
        { x: x + w * 0.67, y: y + h * 0.31 },
        { x: x + w * 0.67, y: y + h * 0.39 },
        { x: x + w * 0.62, y: y + h * 0.40 }
      ], '#64748b');
      fillKitchenQuad([
        { x: x + w * 0.62, y: y + h * 0.55 },
        { x: x + w * 0.67, y: y + h * 0.54 },
        { x: x + w * 0.67, y: y + h * 0.70 },
        { x: x + w * 0.62, y: y + h * 0.72 }
      ], '#64748b');
      fillKitchenQuad([
        { x: x + w * 0.28, y: y + h * 0.20 },
        { x: x + w * 0.40, y: y + h * 0.21 },
        { x: x + w * 0.40, y: y + h * 0.72 },
        { x: x + w * 0.28, y: y + h * 0.76 }
      ], 'rgba(255,255,255,0.34)');
    }

    function drawKitchenPantryForeground(x, y, w, h) {
      fillKitchenQuad([
        { x: x + w * 0.14, y: y + h * 0.12 },
        { x: x + w * 0.72, y: y + h * 0.18 },
        { x: x + w * 0.90, y: y + h * 0.29 },
        { x: x + w * 0.32, y: y + h * 0.23 }
      ], '#d97706', '#451a03');
      fillKitchenQuad([
        { x: x + w * 0.72, y: y + h * 0.18 },
        { x: x + w * 0.90, y: y + h * 0.29 },
        { x: x + w * 0.90, y: y + h * 0.84 },
        { x: x + w * 0.72, y: y + h * 0.76 }
      ], '#713f12', '#451a03');
      fillKitchenQuad([
        { x: x + w * 0.14, y: y + h * 0.12 },
        { x: x + w * 0.72, y: y + h * 0.18 },
        { x: x + w * 0.72, y: y + h * 0.76 },
        { x: x + w * 0.14, y: y + h * 0.84 }
      ], '#a16207', '#451a03');
      fillKitchenQuad([
        { x: x + w * 0.22, y: y + h * 0.20 },
        { x: x + w * 0.43, y: y + h * 0.22 },
        { x: x + w * 0.43, y: y + h * 0.72 },
        { x: x + w * 0.22, y: y + h * 0.76 }
      ], '#ca8a04', '#92400e');
      fillKitchenQuad([
        { x: x + w * 0.50, y: y + h * 0.23 },
        { x: x + w * 0.68, y: y + h * 0.25 },
        { x: x + w * 0.68, y: y + h * 0.70 },
        { x: x + w * 0.50, y: y + h * 0.73 }
      ], '#ca8a04', '#92400e');
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(x + w * 0.45, y + h * 0.47, Math.max(2, w * 0.06), Math.max(2, h * 0.06));
    }

    function drawKitchenCrateShelfForeground(x, y, w, h) {
      fillKitchenQuad([
        { x: x + w * 0.12, y: y + h * 0.16 },
        { x: x + w * 0.72, y: y + h * 0.22 },
        { x: x + w * 0.90, y: y + h * 0.32 },
        { x: x + w * 0.30, y: y + h * 0.25 }
      ], '#f59e0b', '#451a03');
      fillKitchenQuad([
        { x: x + w * 0.72, y: y + h * 0.22 },
        { x: x + w * 0.90, y: y + h * 0.32 },
        { x: x + w * 0.90, y: y + h * 0.78 },
        { x: x + w * 0.72, y: y + h * 0.70 }
      ], '#78350f', '#451a03');
      fillKitchenQuad([
        { x: x + w * 0.12, y: y + h * 0.16 },
        { x: x + w * 0.72, y: y + h * 0.22 },
        { x: x + w * 0.72, y: y + h * 0.70 },
        { x: x + w * 0.12, y: y + h * 0.82 }
      ], '#92400e', '#451a03');
      strokeKitchenLine(x + w * 0.16, y + h * 0.36, x + w * 0.68, y + h * 0.40, '#f59e0b', Math.max(2, h * 0.06));
      strokeKitchenLine(x + w * 0.16, y + h * 0.58, x + w * 0.68, y + h * 0.57, '#f59e0b', Math.max(2, h * 0.06));
      fillKitchenQuad([
        { x: x + w * 0.20, y: y + h * 0.22 },
        { x: x + w * 0.40, y: y + h * 0.24 },
        { x: x + w * 0.40, y: y + h * 0.34 },
        { x: x + w * 0.20, y: y + h * 0.36 }
      ], '#b45309', '#451a03');
      fillKitchenQuad([
        { x: x + w * 0.48, y: y + h * 0.44 },
        { x: x + w * 0.66, y: y + h * 0.45 },
        { x: x + w * 0.66, y: y + h * 0.54 },
        { x: x + w * 0.48, y: y + h * 0.56 }
      ], '#b45309', '#451a03');
    }

    function drawSoloProp(mapX, mapY, mapW, mapH, kind, x, y, scale, selected, destroyed, radius) {
      const px = mapX + mapW * x / soloMapWidth;
      const py = mapY + mapH * y / soloMapHeight;
      const worldScale = Math.min(mapW / soloMapWidth, mapH / soloMapHeight);
      const size = Math.max(8, getSoloPropRadius(kind, radius) * worldScale * 1.28 * scale);
      if (destroyed) {
        drawDebris(px, py, size);
        return;
      }
      if (selected) {
        ctx.strokeStyle = '#38bdf8';
        ctx.strokeRect(px - size * 0.82, py - size * 0.82, size * 1.64, size * 1.64);
      }
      drawSoftShadow(px, py + size * 0.46, size * 1.34, size * 0.34, selected ? 0.24 : 0.16);
      if (drawPropImage(kind, px, py, size * 2.1, size * 2.1)) {
        return;
      }

      if (kind === 'wooden_crate') {
        ctx.fillStyle = '#92400e';
        ctx.fillRect(px - size * 0.65, py - size * 0.65, size * 1.3, size * 1.3);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(px - size * 0.52, py - size * 0.08, size * 1.04, size * 0.16);
        ctx.fillRect(px - size * 0.08, py - size * 0.52, size * 0.16, size * 1.04);
      } else if (kind === 'water_bucket') {
        ctx.fillStyle = '#075985';
        ctx.fillRect(px - size * 0.48, py - size * 0.38, size * 0.96, size * 0.86);
        ctx.fillStyle = '#7dd3fc';
        ctx.fillRect(px - size * 0.36, py - size * 0.25, size * 0.72, size * 0.18);
      } else if (kind === 'plant_pot') {
        ctx.fillStyle = '#166534';
        ctx.beginPath();
        ctx.arc(px - size * 0.22, py - size * 0.35, size * 0.34, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px + size * 0.22, py - size * 0.35, size * 0.34, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7c2d12';
        ctx.fillRect(px - size * 0.43, py - size * 0.08, size * 0.86, size * 0.60);
      } else if (kind === 'chair') {
        ctx.fillStyle = '#78350f';
        ctx.fillRect(px - size * 0.48, py - size * 0.40, size * 0.96, size * 0.70);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(px - size * 0.58, py + size * 0.24, size * 0.22, size * 0.50);
        ctx.fillRect(px + size * 0.36, py + size * 0.24, size * 0.22, size * 0.50);
      } else if (kind === 'trash_bin') {
        ctx.fillStyle = '#334155';
        ctx.fillRect(px - size * 0.50, py - size * 0.50, size, size * 1.05);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(px - size * 0.60, py - size * 0.62, size * 1.2, size * 0.20);
      } else {
        ctx.fillStyle = '#b45309';
        ctx.fillRect(px - size * 0.62, py - size * 0.35, size * 1.24, size * 0.72);
        ctx.fillStyle = '#fde68a';
        ctx.fillRect(px - size * 0.45, py - size * 0.58, size * 0.26, size * 0.32);
        ctx.fillRect(px - size * 0.08, py - size * 0.58, size * 0.26, size * 0.32);
        ctx.fillRect(px + size * 0.28, py - size * 0.58, size * 0.26, size * 0.32);
      }
    }

    function drawDebris(px, py, size) {
      ctx.fillStyle = '#78716c';
      ctx.fillRect(px - size * 0.42, py - size * 0.18, size * 0.30, size * 0.18);
      ctx.fillRect(px + size * 0.12, py - size * 0.05, size * 0.34, size * 0.18);
      ctx.fillRect(px - size * 0.05, py + size * 0.22, size * 0.28, size * 0.15);
    }

    function drawCatActor(mapX, mapY, mapW, mapH, player, showFacing) {
      const px = mapX + mapW * player.x / soloMapWidth;
      const py = mapY + mapH * player.y / soloMapHeight;
      const size = Math.max(18, Math.min(mapW, mapH) * 0.075);
      const skinId = player.catSkin || getCatSkinId(player.id || player.playerId || player.displayName || 'cat');
      const facing = normalizeFacingForVisuals(getPlayerVisualFacing(player));
      const frame = getCatAnimationFrame(player, facing);
      const orientation = getCatVisualOrientation(facing);
      drawSoftShadow(px, py + size * 0.40, size * 0.95, size * 0.26, player.captured ? 0.10 : 0.18);
      if (!drawCatAnimationImage(skinId, frame, px, py, size * 1.80, size * 1.80, orientation) &&
        !drawCatImage(skinId, px, py, size * 1.45, size * 1.45, orientation)) {
        drawOrientedFallback(px, py, orientation, function () {
          drawCatFallback(0, 0, size, skinId);
        }, function () {
          drawCatFallback(px, py, size, skinId);
        });
      }
      if (!showFacing) {
        return;
      }
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(px + facing.x * size * 0.58, py + facing.y * size * 0.58, Math.max(3, size * 0.08), 0, Math.PI * 2);
      ctx.fill();
    }

    function getCatAnimationFrame(player, facing) {
      if (player.revealMs > 0) {
        return 'reveal';
      }
      if (player.captured || player.dizzyMs > 0) {
        return 'dizzy';
      }
      if (player.attackMs > 0) {
        return getDirectionalAttackFrame(facing, player.attackMs > 220 ? 1 : 2);
      }
      if (player.taunting || player.tauntMs > 0) {
        return getDirectionalTauntFrame(facing, Date.now());
      }
      return getDirectionalCatFrame(facing, player.moving, Date.now());
    }

    function getDirectionalCatFrame(facing, moving, now) {
      const bucket = getDirectionalCatBucket(facing);
      if (!moving) {
        return bucket === 'side' ? 'side_crouch' : `${bucket}_crouch`;
      }
      const step = Math.floor(now / 180) % 2 === 0 ? 'walk_1' : 'walk_2';
      if (bucket === 'side') {
        return step;
      }
      return `${bucket}_${step}`;
    }

    function getDirectionalAttackFrame(facing, frameIndex) {
      const bucket = getDirectionalCatBucket(facing);
      return bucket === 'side' ? `side_attack_${frameIndex}` : `${bucket}_attack_${frameIndex}`;
    }

    function getDirectionalTauntFrame(facing, now) {
      return getDirectionalAttackFrame(facing, Math.floor(now / 240) % 2 === 0 ? 1 : 2);
    }

    function getDirectionalCatBucket(facing) {
      const absX = Math.abs(facing.x);
      const absY = Math.abs(facing.y);
      if (absY < 0.35 || absX > absY * 1.45) {
        return 'side';
      }
      if (absX >= 0.28) {
        return facing.y > 0 ? 'diag_front' : 'diag_back';
      }
      return facing.y > 0 ? 'front' : 'back';
    }

    function drawCatFallback(px, py, size, skinId) {
      const palette = getCatPalette(skinId);
      ctx.fillStyle = palette.body;
      ctx.beginPath();
      ctx.moveTo(px - size * 0.33, py - size * 0.30);
      ctx.lineTo(px - size * 0.18, py - size * 0.58);
      ctx.lineTo(px - size * 0.04, py - size * 0.30);
      ctx.lineTo(px + size * 0.05, py - size * 0.30);
      ctx.lineTo(px + size * 0.20, py - size * 0.58);
      ctx.lineTo(px + size * 0.34, py - size * 0.30);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(px, py - size * 0.10, size * 0.38, size * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = palette.patch;
      ctx.beginPath();
      ctx.ellipse(px - size * 0.10, py - size * 0.14, size * 0.14, size * 0.12, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = palette.body;
      ctx.lineWidth = Math.max(2, size * 0.08);
      ctx.beginPath();
      ctx.arc(px + size * 0.18, py + size * 0.28, size * 0.38, -0.4, 1.2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    function getCatPalette(skinId) {
      if (skinId === 'cat_gray_tuxedo') {
        return { body: '#64748b', patch: '#f8fafc' };
      }
      if (skinId === 'cat_calico') {
        return { body: '#f8fafc', patch: '#d97706' };
      }
      if (skinId === 'cat_black') {
        return { body: '#1f2937', patch: '#94a3b8' };
      }
      if (skinId === 'cat_siamese') {
        return { body: '#fde68a', patch: '#6b4f3a' };
      }
      return { body: '#f59e0b', patch: '#7c2d12' };
    }

    function getPlayerFacing(player) {
      if (Number.isFinite(player.facingX) && Number.isFinite(player.facingY)) {
        return { x: player.facingX, y: player.facingY };
      }
      const deg = Number.isFinite(player.facingDeg) ? player.facingDeg : 0;
      const radians = deg * Math.PI / 180;
      return { x: Math.cos(radians), y: Math.sin(radians) };
    }

    function getPlayerVisualFacing(player) {
      if (player.attackMs > 0 && Number.isFinite(player.attackFacingX) && Number.isFinite(player.attackFacingY)) {
        return { x: player.attackFacingX, y: player.attackFacingY };
      }
      return getPlayerFacing(player);
    }

    function normalizeFacingForVisuals(facing) {
      const x = Number.isFinite(facing?.x) ? facing.x : 1;
      const y = Number.isFinite(facing?.y) ? facing.y : 0;
      const length = Math.hypot(x, y);
      if (length <= 0.01) {
        return { x: 1, y: 0 };
      }
      return { x: x / length, y: y / length };
    }

    function getCatVisualOrientation(facing) {
      const bucket = getDirectionalCatBucket(facing);
      return {
        angle: 0,
        scaleX: (bucket === 'side' || bucket === 'diag_front' || bucket === 'diag_back') && facing.x < 0 ? -1 : 1
      };
    }

    function distanceBetween(a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function loadSpriteImages(spritePaths, label) {
      const images = {};
      const ImageConstructor = typeof Image === 'function' ? Image : null;
      Object.keys(spritePaths).forEach(function (id) {
        const image = typeof wxApi.createImage === 'function'
          ? wxApi.createImage()
          : ImageConstructor
            ? new ImageConstructor()
            : null;
        if (!image) return;
        image.onload = draw;
        image.onerror = function () {
          console.warn(`[PropHideSeekFallback] Failed to load ${label}: ${spritePaths[id]}`);
        };
        image.src = spritePaths[id];
        images[id] = image;
      });
      return images;
    }

    function createCatAnimationSpritePaths(skins, frames) {
      const paths = {};
      skins.forEach(function (skin) {
        frames.forEach(function (frame) {
          paths[`${skin}_${frame}`] = `cats/anim/${skin}_${frame}.png`;
        });
      });
      return paths;
    }

    function drawKenneyImage(id, centerX, centerY, maxW, maxH) {
      return drawLoadedImage(kenneyImages, id, centerX, centerY, maxW, maxH);
    }

    function drawPropImage(id, centerX, centerY, maxW, maxH) {
      return drawLoadedImage(generatedPropImages, id, centerX, centerY, maxW, maxH) ||
        drawKenneyImage(id, centerX, centerY, maxW, maxH);
    }

    function drawCatImage(id, centerX, centerY, maxW, maxH, orientation) {
      return drawLoadedImage(catImages, id, centerX, centerY, maxW, maxH, orientation);
    }

    function drawCatAnimationImage(skinId, frame, centerX, centerY, maxW, maxH, orientation) {
      return drawLoadedImage(catAnimationImages, `${skinId}_${frame}`, centerX, centerY, maxW, maxH, orientation);
    }

    function drawLoadedImage(images, id, centerX, centerY, maxW, maxH, orientation) {
      const image = images[id];
      if (!image || typeof ctx.drawImage !== 'function') {
        return false;
      }
      const imageWidth = Number(image.width) || 0;
      const imageHeight = Number(image.height) || 0;
      if (imageWidth <= 0 || imageHeight <= 0) {
        return false;
      }
      const scale = Math.min(maxW / imageWidth, maxH / imageHeight);
      const drawW = imageWidth * scale;
      const drawH = imageHeight * scale;
      if (orientation && canTransformCanvas()) {
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(orientation.angle || 0);
        ctx.scale(orientation.scaleX || 1, 1);
        ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
        return true;
      }
      ctx.drawImage(image, centerX - drawW / 2, centerY - drawH / 2, drawW, drawH);
      return true;
    }

    function drawOrientedFallback(centerX, centerY, orientation, drawTransformed, drawPlain) {
      if (!canTransformCanvas()) {
        drawPlain();
        return;
      }
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(orientation.angle || 0);
      ctx.scale(orientation.scaleX || 1, 1);
      drawTransformed();
      ctx.restore();
    }

    function canTransformCanvas() {
      return typeof ctx.save === 'function' &&
        typeof ctx.restore === 'function' &&
        typeof ctx.translate === 'function' &&
        typeof ctx.rotate === 'function' &&
        typeof ctx.scale === 'function';
    }

    function drawSoftShadow(centerX, centerY, width, height, alpha) {
      if (typeof ctx.ellipse !== 'function') {
        return;
      }
      ctx.save?.();
      ctx.fillStyle = `rgba(15, 23, 42, ${alpha})`;
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, width / 2, height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore?.();
    }

    function getCatSkinId(seed) {
      const text = String(seed || 'cat');
      let hash = 0;
      for (let index = 0; index < text.length; index += 1) {
        hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
      }
      return catSkins[hash % catSkins.length] || catSkins[0];
    }

    const soloPhaseMs = {
      preview: gameRulesConfig.previewDurationMs,
      hide: gameRulesConfig.hideDurationMs,
      seek: gameRulesConfig.seekDurationMs,
      result: gameRulesConfig.resultDurationMs
    };
    const soloMapWidth = 1440;
    const soloMapHeight = 810;
    const soloSeekerSpawn = { x: 720, y: 704 };
    const soloHiderSpawns = [
      { x: 189, y: 398 },
      { x: 1190, y: 394 },
      { x: 630, y: 704 },
      { x: 1044, y: 704 },
    ];
    const soloMapBounds = { minX: 80, minY: 80, maxX: soloMapWidth - 80, maxY: soloMapHeight - 80 };
    const soloPlayerMovementRadius = 12;
    const soloMinHiderMovementRadius = 10;
    const soloMaxHiderMovementRadius = 14;
    const soloPropMovementRadiusScale = 1;
    const soloRectCollisionInset = 0;
    const soloCollisionEscapeEpsilon = 0.001;
    const soloHideCharacterVisibleMs = 650;
    const soloPropRadii = {
      wooden_crate: 18,
      trash_bin: 17,
      plant_pot: 16,
      chair: 16,
      water_bucket: 14,
      food_basket: 16,
    };
    const soloObstacles = [
      { id: 'obstacle_fridge', x: 120, y: 130, width: 72, height: 100 },
      { id: 'obstacle_sink_counter', x: 292, y: 110, width: 170, height: 44 },
      { id: 'obstacle_stove', x: 1088, y: 108, width: 198, height: 48 },
      { id: 'obstacle_pantry', x: 1300, y: 120, width: 58, height: 98 },
      { id: 'obstacle_center_table', x: 655, y: 410, width: 138, height: 66 },
      { id: 'obstacle_crate_shelf', x: 152, y: 610, width: 48, height: 60 },
    ];
    const soloOccluders = [
      { id: 'occluder_table_front_edge', x: 612, y: 479, width: 257, height: 43 },
      { id: 'occluder_island_front_edge', x: 772, y: 520, width: 230, height: 47 },
      { id: 'occluder_upper_left_pillar', x: 446, y: 140, width: 63, height: 149 },
      { id: 'occluder_right_counter_foreground', x: 1179, y: 329, width: 257, height: 50 },
      { id: 'occluder_tall_plant_corner', x: 1325, y: 650, width: 86, height: 133 },
      { id: 'occluder_crate_stack_front', x: 281, y: 736, width: 293, height: 54 },
    ];
    const soloSeekerPatrolPoints = [
      { x: 1170, y: 225 },
      { x: 1215, y: 585 },
      { x: 810, y: 641 },
      { x: 731, y: 394 },
      { x: 293, y: 248 },
      { x: 383, y: 686 },
      { x: 1148, y: 686 },
      { x: 1350, y: 390 },
      { x: 760, y: 730 },
    ];

    function startSoloPractice() {
      state.screen = 'solo';
      state.moveX = 0;
      state.moveY = 0;
      state.solo = createSoloMatchState();
      enterSoloRound(state.solo, 0);
      state.info = 'Solo match started.';
    }

    function createSoloMatchState() {
      return {
        phase: 'preview',
        timeLeftMs: 0,
        roundIndex: 0,
        attacks: 0,
        rulesConfig: gameRulesConfig,
        propPool: ['wooden_crate', 'trash_bin', 'plant_pot', 'chair', 'water_bucket', 'food_basket'],
        props: [],
        players: [
          createSoloPlayer('human', 'You', true),
          createSoloPlayer('bot_a', 'Bot A', false),
          createSoloPlayer('bot_b', 'Bot B', false),
          createSoloPlayer('bot_c', 'Bot C', false)
        ],
        seekerAi: {
          patrolIndex: 0,
          attackCooldownMs: 1400,
          suspicionCooldownMs: 0,
          stuckMs: 0,
          recoveryMs: 0,
          recoveryX: 0,
          recoveryY: 0
        },
        resultText: '',
        resultLines: [],
        matchEnded: false,
        lastTickMs: Date.now()
      };
    }

    function createSoloPlayer(id, displayName, human) {
      return {
        id,
        displayName,
        catSkin: getCatSkinId(id),
        human,
        role: 'hider',
        score: 0,
        x: 0,
        y: 0,
        facingX: 1,
        facingY: 0,
        currentPropIndex: 0,
        captured: false,
        moving: false,
        hideTarget: null,
        noiseMs: 0,
        switchNoiseMs: 0,
        attackMs: 0,
        attackFacingX: 1,
        attackFacingY: 0,
        revealMs: 0,
        dizzyMs: 0,
        tauntMs: 0,
        hideCharacterMs: 0,
        lastKnownX: 0,
        lastKnownY: 0
      };
    }

    function createSoloProps() {
      return [
        { id: 'crate_01', kind: 'wooden_crate', x: 241, y: 268, destroyed: false, blocksMovement: true },
        { id: 'basket_01', kind: 'food_basket', x: 302, y: 221, destroyed: false, blocksMovement: true },
        { id: 'bucket_01', kind: 'water_bucket', x: 369, y: 239, destroyed: false, blocksMovement: true },
        { id: 'chair_01', kind: 'chair', x: 342, y: 322, destroyed: false, blocksMovement: true },
        { id: 'trash_bin_01', kind: 'trash_bin', x: 1226, y: 243, destroyed: false, blocksMovement: true },
        { id: 'bucket_02', kind: 'water_bucket', x: 1134, y: 252, destroyed: false, blocksMovement: true },
        { id: 'basket_02', kind: 'food_basket', x: 1247, y: 338, destroyed: false, blocksMovement: true },
        { id: 'chair_02', kind: 'chair', x: 1004, y: 241, destroyed: false, blocksMovement: true },
        { id: 'chair_03', kind: 'chair', x: 581, y: 358, destroyed: false, blocksMovement: true },
        { id: 'chair_04', kind: 'chair', x: 860, y: 358, destroyed: false, blocksMovement: true },
        { id: 'chair_05', kind: 'chair', x: 585, y: 511, destroyed: false, blocksMovement: true },
        { id: 'basket_03', kind: 'food_basket', x: 722, y: 329, destroyed: false, blocksMovement: true },
        { id: 'plant_01', kind: 'plant_pot', x: 1017, y: 430, destroyed: false, blocksMovement: true },
        { id: 'crate_02', kind: 'wooden_crate', x: 493, y: 477, destroyed: false, blocksMovement: true },
        { id: 'crate_03', kind: 'wooden_crate', x: 92, y: 608, destroyed: false, blocksMovement: true },
        { id: 'crate_04', kind: 'wooden_crate', x: 266, y: 657, destroyed: false, blocksMovement: true },
        { id: 'crate_05', kind: 'wooden_crate', x: 358, y: 592, destroyed: false, blocksMovement: true },
        { id: 'basket_04', kind: 'food_basket', x: 428, y: 673, destroyed: false, blocksMovement: true },
        { id: 'bucket_03', kind: 'water_bucket', x: 527, y: 621, destroyed: false, blocksMovement: true },
        { id: 'chair_06', kind: 'chair', x: 338, y: 722, destroyed: false, blocksMovement: true },
        { id: 'trash_bin_02', kind: 'trash_bin', x: 1143, y: 596, destroyed: false, blocksMovement: true },
        { id: 'trash_bin_03', kind: 'trash_bin', x: 1258, y: 664, destroyed: false, blocksMovement: true },
        { id: 'plant_02', kind: 'plant_pot', x: 1058, y: 664, destroyed: false, blocksMovement: true },
        { id: 'plant_03', kind: 'plant_pot', x: 1244, y: 569, destroyed: false, blocksMovement: true },
        { id: 'bucket_04', kind: 'water_bucket', x: 988, y: 731, destroyed: false, blocksMovement: true },
        { id: 'basket_05', kind: 'food_basket', x: 1184, y: 736, destroyed: false, blocksMovement: true },
        { id: 'crate_06', kind: 'wooden_crate', x: 878, y: 646, destroyed: false, blocksMovement: true },
        { id: 'chair_07', kind: 'chair', x: 1010, y: 569, destroyed: false, blocksMovement: true },
        { id: 'trash_bin_04', kind: 'trash_bin', x: 97, y: 414, destroyed: false, blocksMovement: true },
        { id: 'plant_04', kind: 'plant_pot', x: 1314, y: 387, destroyed: false, blocksMovement: true },
        { id: 'bucket_05', kind: 'water_bucket', x: 1376, y: 266, destroyed: false, blocksMovement: true },
        { id: 'basket_06', kind: 'food_basket', x: 1316, y: 474, destroyed: false, blocksMovement: true },
        { id: 'chair_08', kind: 'chair', x: 690, y: 650, destroyed: false, blocksMovement: true },
        { id: 'crate_07', kind: 'wooden_crate', x: 760, y: 724, destroyed: false, blocksMovement: true },
        { id: 'basket_07', kind: 'food_basket', x: 1380, y: 690, destroyed: false, blocksMovement: true },
      ];
    }

    function enterSoloRound(solo, roundIndex) {
      if (roundIndex >= solo.players.length) {
        solo.phase = 'match_end';
        solo.timeLeftMs = 0;
        solo.matchEnded = true;
        solo.resultText = 'Match complete.';
        solo.resultLines = getSoloRankingLines(solo);
        state.moveX = 0;
        state.moveY = 0;
        state.info = solo.resultText;
        return;
      }

      solo.roundIndex = roundIndex;
      solo.phase = 'preview';
      solo.timeLeftMs = soloPhaseMs.preview;
      solo.attacks = 0;
      solo.props = createSoloProps();
      solo.resultText = '';
      solo.resultLines = [];
      solo.matchEnded = false;
      solo.seekerAi.patrolIndex = 0;
      solo.seekerAi.attackCooldownMs = 1400;
      solo.seekerAi.suspicionCooldownMs = 0;
      solo.seekerAi.stuckMs = 0;
      solo.seekerAi.recoveryMs = 0;
      solo.seekerAi.recoveryX = 0;
      solo.seekerAi.recoveryY = 0;
      state.moveX = 0;
      state.moveY = 0;

      const seeker = solo.players[roundIndex];
      let hiderSpawnIndex = 0;
      solo.players.forEach(function (player, index) {
        const isSeeker = player === seeker;
        player.role = isSeeker ? 'seeker' : 'hider';
        player.captured = false;
        player.moving = false;
        player.noiseMs = 0;
        player.switchNoiseMs = 0;
        player.attackMs = 0;
        player.revealMs = 0;
        player.dizzyMs = 0;
        player.tauntMs = 0;
        player.hideCharacterMs = 0;
        if (isSeeker) {
          player.x = soloSeekerSpawn.x;
          player.y = soloSeekerSpawn.y;
          player.facingX = -1;
          player.facingY = 0;
          player.hideTarget = null;
        } else {
          const hiderSpawn = chooseSoloSafeSpawn(
            solo,
            player,
            soloHiderSpawns[hiderSpawnIndex % soloHiderSpawns.length] || soloSeekerSpawn,
            hiderSpawnIndex
          );
          hiderSpawnIndex += 1;
          player.x = hiderSpawn.x;
          player.y = hiderSpawn.y;
          player.facingX = 0;
          player.facingY = -1;
          player.currentPropIndex = (roundIndex + index) % solo.propPool.length;
          player.hideTarget = chooseSoloHideTarget(solo, player, index);
          player.lastKnownX = player.x;
          player.lastKnownY = player.y;
        }
      });

      state.info = seeker.human
        ? `Round ${roundIndex + 1}: you are the seeker.`
        : `Round ${roundIndex + 1}: ${seeker.displayName} is the seeker.`;
    }

    function updateSolo() {
      const solo = state.solo;
      if (!solo) return;

      const now = Date.now();
      const deltaMs = Math.min(120, Math.max(0, now - solo.lastTickMs));
      solo.lastTickMs = now;

      if (solo.phase === 'match_end') {
        return;
      }

      updateSoloVisualTimers(solo, deltaMs);

      if (solo.phase === 'result') {
        solo.timeLeftMs -= deltaMs;
        if (solo.timeLeftMs <= 0) {
          enterSoloRound(solo, solo.roundIndex + 1);
        }
        return;
      }

      solo.timeLeftMs -= deltaMs;
      if (solo.phase === 'preview' && solo.timeLeftMs <= 0) {
        enterSoloHide(solo);
        return;
      }

      if (solo.phase === 'hide') {
        updateSoloHumanMovement(solo, deltaMs);
        updateSoloComputerHiders(solo, deltaMs);
        if (solo.timeLeftMs <= 0) {
          enterSoloSeek(solo);
        }
        return;
      }

      if (solo.phase === 'seek') {
        updateSoloHumanMovement(solo, deltaMs);
        updateSoloComputerHiders(solo, deltaMs);
        updateSoloComputerSeeker(solo, deltaMs);
        if (solo.timeLeftMs <= 0) {
          finishSoloRound(solo, 'time_up');
        }
      }
    }

    function updateSoloVisualTimers(solo, deltaMs) {
      solo.players.forEach(function (player) {
        player.attackMs = Math.max(0, (player.attackMs || 0) - deltaMs);
        player.revealMs = Math.max(0, (player.revealMs || 0) - deltaMs);
        player.dizzyMs = Math.max(0, (player.dizzyMs || 0) - deltaMs);
        player.tauntMs = Math.max(0, (player.tauntMs || 0) - deltaMs);
        player.hideCharacterMs = Math.max(0, (player.hideCharacterMs || 0) - deltaMs);
      });
      solo.seekerAi.suspicionCooldownMs = Math.max(0, (solo.seekerAi.suspicionCooldownMs || 0) - deltaMs);
    }

    function enterSoloHide(solo) {
      solo.phase = 'hide';
      solo.timeLeftMs = soloPhaseMs.hide;
      state.moveX = 0;
      state.moveY = 0;
      getSoloHiders(solo).forEach(function (hider) {
        hider.hideCharacterMs = soloHideCharacterVisibleMs;
        hider.moving = false;
      });
      const human = getSoloHuman(solo);
      state.info = human.role === 'seeker'
        ? 'Hide: you are blind while hiders set up.'
        : 'Hide: move into a believable prop spot.';
    }

    function enterSoloSeek(solo) {
      solo.phase = 'seek';
      solo.timeLeftMs = soloPhaseMs.seek;
      solo.attacks = getSoloHiders(solo).length * gameRulesConfig.attackCountMultiplier;
      solo.seekerAi.attackCooldownMs = 1200;
      solo.seekerAi.suspicionCooldownMs = 1200;
      solo.seekerAi.stuckMs = 0;
      solo.seekerAi.recoveryMs = 0;
      solo.seekerAi.recoveryX = 0;
      solo.seekerAi.recoveryY = 0;
      state.moveX = 0;
      state.moveY = 0;
      const human = getSoloHuman(solo);
      state.info = human.role === 'seeker'
        ? 'Seek: move and use cone attacks.'
        : 'Seek: survive while disguised.';
    }

    function updateSoloHumanMovement(solo, deltaMs) {
      const human = getSoloHuman(solo);
      const speed = getSoloHumanSpeed(solo, human);
      moveSoloActor(solo, human, state.moveX, state.moveY, speed, deltaMs);
    }

    function getSoloHumanSpeed(solo, human) {
      if (solo.phase === 'hide' && human.role === 'hider') {
        return gameRulesConfig.hiderHideSpeed;
      }
      if (solo.phase === 'seek' && human.role === 'seeker') {
        return gameRulesConfig.seekerSpeed;
      }
      if (solo.phase === 'seek' && human.role === 'hider') {
        return gameRulesConfig.hiderSeekSpeed;
      }
      return 0;
    }

    function updateSoloComputerHiders(solo, deltaMs) {
      getSoloHiders(solo).forEach(function (hider) {
        if (hider.human || hider.captured || !hider.hideTarget) return;
        if (solo.phase !== 'hide') {
          hider.moving = false;
          return;
        }
        const dx = hider.hideTarget.x - hider.x;
        const dy = hider.hideTarget.y - hider.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 8) {
          hider.moving = false;
          return;
        }
        moveSoloActor(solo, hider, dx / distance, dy / distance, gameRulesConfig.hiderHideSpeed, deltaMs);
      });
    }

    function updateSoloComputerSeeker(solo, deltaMs) {
      const seeker = getSoloSeeker(solo);
      if (!seeker || seeker.human || solo.phase !== 'seek' || solo.attacks <= 0) return;

      solo.seekerAi.attackCooldownMs = Math.max(0, solo.seekerAi.attackCooldownMs - deltaMs);
      const target = getSoloComputerSeekerTarget(solo, seeker);
      if (!target) return;

      const dx = target.x - seeker.x;
      const dy = target.y - seeker.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const speed = gameRulesConfig.seekerSpeed * (target.suspicious ? 0.36 : 0.24);
      const directX = dx / distance;
      const directY = dy / distance;
      let moveX = directX;
      let moveY = directY;
      if (solo.seekerAi.recoveryMs > 0 && distance > 36) {
        solo.seekerAi.recoveryMs = Math.max(0, solo.seekerAi.recoveryMs - deltaMs);
        moveX = solo.seekerAi.recoveryX || -directY;
        moveY = solo.seekerAi.recoveryY || directX;
      }
      const previousX = seeker.x;
      const previousY = seeker.y;
      seeker.facingX = moveX;
      seeker.facingY = moveY;
      moveSoloActor(solo, seeker, moveX, moveY, speed, deltaMs);
      updateSoloComputerSeekerStuckRecovery(
        solo,
        target,
        distance,
        Math.hypot(seeker.x - previousX, seeker.y - previousY),
        directX,
        directY,
        deltaMs
      );

      if (!target.suspicious && distance < 28) {
        solo.seekerAi.patrolIndex += 1;
      }

      if (solo.seekerAi.attackCooldownMs <= 0 && shouldSoloComputerAttack(solo, seeker, target)) {
        solo.seekerAi.attackCooldownMs = 2600;
        performSoloAttack(solo, seeker);
      }
    }

    function updateSoloComputerSeekerStuckRecovery(solo, target, targetDistance, movedDistance, directX, directY, deltaMs) {
      if (targetDistance <= 36 || movedDistance > 0.6) {
        solo.seekerAi.stuckMs = 0;
        return;
      }

      solo.seekerAi.stuckMs += deltaMs;
      if (solo.seekerAi.stuckMs < 480) {
        return;
      }

      const turnSign = solo.seekerAi.patrolIndex % 2 === 0 ? 1 : -1;
      solo.seekerAi.stuckMs = 0;
      solo.seekerAi.recoveryMs = 720;
      solo.seekerAi.recoveryX = -directY * turnSign;
      solo.seekerAi.recoveryY = directX * turnSign;
      if (!target.suspicious) {
        solo.seekerAi.patrolIndex += 1;
      } else {
        solo.seekerAi.suspicionCooldownMs = Math.max(solo.seekerAi.suspicionCooldownMs, 600);
      }
    }

    function getSoloComputerSeekerTarget(solo, seeker) {
      const suspicious = getSoloSuspiciousHumanTarget(solo, seeker);
      if (suspicious) return suspicious;

      const patrolPoint = soloSeekerPatrolPoints[solo.seekerAi.patrolIndex % soloSeekerPatrolPoints.length];
      if (patrolPoint) {
        return { x: patrolPoint.x, y: patrolPoint.y, suspicious: false, kind: 'patrol' };
      }

      return null;
    }

    function getSoloSuspiciousHumanTarget(solo, seeker) {
      const human = getSoloHuman(solo);
      if (human.role !== 'hider' || human.captured) return null;
      if (solo.seekerAi.suspicionCooldownMs > 0) return null;

      const distanceToHuman = distanceBetween(seeker, human);
      const heardNoise = human.noiseMs > 0 || human.switchNoiseMs > 0;
      if (heardNoise && distanceToHuman < 300) {
        return { x: human.lastKnownX, y: human.lastKnownY, suspicious: true, kind: 'noise' };
      }
      if (!isSoloHiderBlended(solo, human) && distanceToHuman < 120 && isSoloPointInCone(seeker, human, 150)) {
        return { x: human.x, y: human.y, suspicious: true, kind: 'visible_mismatch' };
      }
      return null;
    }

    function shouldSoloComputerAttack(solo, seeker, target) {
      if (!target) {
        return false;
      }
      if (!target.suspicious) {
        return solo.seekerAi.patrolIndex % 2 === 1 && solo.props.some(function (prop) {
          return !prop.destroyed && isSoloPointInCone(seeker, prop, gameRulesConfig.attackRadiusPx * 0.82);
        });
      }
      return getSoloHiders(solo).some(function (hider) {
        return !hider.captured && isSoloPointInCone(seeker, hider, gameRulesConfig.attackRadiusPx);
      });
    }

    function moveSoloActor(solo, actor, moveX, moveY, speed, deltaMs) {
      actor.moving = false;
      if (speed <= 0 || actor.captured) return;

      const length = Math.hypot(moveX, moveY);
      if (length <= 0.01) return;

      const nx = moveX / length;
      const ny = moveY / length;
      actor.facingX = nx;
      actor.facingY = ny;
      const previousPosition = { x: actor.x, y: actor.y };
      const intendedPosition = {
        x: actor.x + nx * speed * deltaMs / 1000,
        y: actor.y + ny * speed * deltaMs / 1000
      };
      const nextPosition = resolveSoloMovement(solo, actor, intendedPosition);
      actor.x = nextPosition.x;
      actor.y = nextPosition.y;
      actor.moving = Math.hypot(actor.x - previousPosition.x, actor.y - previousPosition.y) > 0.01;

      if (actor.moving && solo.phase === 'hide' && actor.role === 'hider') {
        actor.hideCharacterMs = soloHideCharacterVisibleMs;
      }
      if (actor.moving && solo.phase === 'seek' && actor.role === 'hider') {
        actor.noiseMs = Math.max(actor.noiseMs, 950);
        actor.lastKnownX = actor.x;
        actor.lastKnownY = actor.y;
      }
      actor.noiseMs = Math.max(0, actor.noiseMs - deltaMs);
      actor.switchNoiseMs = Math.max(0, actor.switchNoiseMs - deltaMs);
    }

    function resolveSoloMovement(solo, actor, intendedPosition) {
      const radius = getSoloActorRadius(solo, actor);
      const startPosition = { x: actor.x, y: actor.y };
      const dx = intendedPosition.x - startPosition.x;
      const dy = intendedPosition.y - startPosition.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 0.01) {
        return clampSoloPosition(startPosition, radius);
      }

      const stepCount = Math.max(1, Math.ceil(distance / Math.max(4, radius * 0.5)));
      let currentPosition = startPosition;
      for (let step = 0; step < stepCount; step += 1) {
        const nextTarget = {
          x: currentPosition.x + dx / stepCount,
          y: currentPosition.y + dy / stepCount
        };
        const nextPosition = resolveSoloMovementStep(solo, actor, currentPosition, nextTarget, radius);
        if (Math.hypot(nextPosition.x - currentPosition.x, nextPosition.y - currentPosition.y) <= 0.01) {
          break;
        }
        currentPosition = nextPosition;
      }
      return currentPosition;
    }

    function resolveSoloMovementStep(solo, actor, startPosition, intendedPosition, radius) {
      const desiredPosition = clampSoloPosition(intendedPosition, radius);
      if (!isSoloMovementBlocked(solo, actor, desiredPosition, radius, startPosition)) {
        return desiredPosition;
      }

      const xOnlyPosition = clampSoloPosition({ x: desiredPosition.x, y: startPosition.y }, radius);
      if (!isSoloMovementBlocked(solo, actor, xOnlyPosition, radius, startPosition)) {
        return xOnlyPosition;
      }

      const yOnlyPosition = clampSoloPosition({ x: startPosition.x, y: desiredPosition.y }, radius);
      if (!isSoloMovementBlocked(solo, actor, yOnlyPosition, radius, startPosition)) {
        return yOnlyPosition;
      }

      return startPosition;
    }

    function isSoloMovementBlocked(solo, actor, position, radius, startPosition) {
      for (const prop of solo.props) {
        const propCollisionRadius = getSoloPropCollisionRadius(prop);
        if (prop.destroyed || prop.blocksMovement === false) {
          continue;
        }
        if (isSoloCircleMovementBlocked(position, radius, prop, propCollisionRadius, startPosition)) {
          return true;
        }
      }

      for (const obstacle of soloObstacles) {
        const collisionRect = getSoloCollisionRect(obstacle);
        if (obstacle.blocksMovement === false || obstacle.allowsOverlap === true) {
          continue;
        }
        if (isSoloRectMovementBlocked(position, radius, collisionRect, startPosition)) {
          return true;
        }
      }

      if (!doesSoloPhaseBlockPlayerBodies(solo.phase)) {
        return false;
      }

      for (const other of solo.players) {
        if (other.id === actor.id || other.captured) {
          continue;
        }
        const otherRadius = getSoloActorRadius(solo, other);
        if (isSoloCircleMovementBlocked(position, radius, other, otherRadius, startPosition)) {
          return true;
        }
      }

      return false;
    }

    function getSoloActorRadius(solo, actor) {
      if (actor.captured) {
        return 0;
      }

      if (actor.role !== 'hider') {
        return soloPlayerMovementRadius;
      }

      return Math.max(
        soloMinHiderMovementRadius,
        Math.min(soloMaxHiderMovementRadius, getSoloPropRadius(getSoloPlayerPropId(solo, actor)) * 0.6)
      );
    }

    function doesSoloPhaseBlockPlayerBodies(phase) {
      return phase === 'hide' || phase === 'seek';
    }

    function getSoloPropRadius(kind, radius) {
      return typeof radius === 'number' && Number.isFinite(radius) ? radius : soloPropRadii[kind] || 18;
    }

    function getSoloPropCollisionRadius(prop) {
      return Math.max(8, getSoloPropRadius(prop.kind, prop.radius) * soloPropMovementRadiusScale);
    }

    function clampSoloPosition(position, radius) {
      return {
        x: clamp(position.x, soloMapBounds.minX + radius, soloMapBounds.maxX - radius),
        y: clamp(position.y, soloMapBounds.minY + radius, soloMapBounds.maxY - radius)
      };
    }

    function isSoloCircleCircleBlocked(position, radius, blocker, blockerRadius) {
      const collisionDistance = Math.max(0, radius) + Math.max(0, blockerRadius);
      return Math.hypot(position.x - blocker.x, position.y - blocker.y) < collisionDistance;
    }

    function getSoloCircleSeparation(position, radius, blocker, blockerRadius) {
      return Math.hypot(position.x - blocker.x, position.y - blocker.y) - (Math.max(0, radius) + Math.max(0, blockerRadius));
    }

    function isSoloCircleMovementBlocked(position, radius, blocker, blockerRadius, startPosition) {
      const candidateSeparation = getSoloCircleSeparation(position, radius, blocker, blockerRadius);
      if (candidateSeparation >= 0) {
        return false;
      }

      const startSeparation = getSoloCircleSeparation(startPosition, radius, blocker, blockerRadius);
      if (startSeparation < 0 && candidateSeparation >= startSeparation - soloCollisionEscapeEpsilon) {
        return false;
      }

      return true;
    }

    function isSoloCircleRectBlocked(position, radius, rect) {
      return distanceSquaredToSoloRect(position, rect) < radius * radius;
    }

    function getSoloCircleRectSeparation(position, radius, rect) {
      const safeRadius = Math.max(0, radius);
      if (isSoloPointInsideRect(position, rect)) {
        const nearestEdgeDistance = Math.min(
          position.x - rect.x,
          rect.x + rect.width - position.x,
          position.y - rect.y,
          rect.y + rect.height - position.y
        );
        return -(safeRadius + Math.max(0, nearestEdgeDistance));
      }

      return Math.sqrt(distanceSquaredToSoloRect(position, rect)) - safeRadius;
    }

    function isSoloRectMovementBlocked(position, radius, rect, startPosition) {
      const candidateSeparation = getSoloCircleRectSeparation(position, radius, rect);
      if (candidateSeparation >= 0) {
        return false;
      }

      const startSeparation = getSoloCircleRectSeparation(startPosition, radius, rect);
      if (startSeparation < 0) {
        if (isSoloPointInsideRect(startPosition, rect) && isSoloPointInsideRect(position, rect)) {
          return candidateSeparation <= startSeparation + soloCollisionEscapeEpsilon;
        }

        return candidateSeparation < startSeparation - soloCollisionEscapeEpsilon;
      }

      return true;
    }

    function isSoloPointInsideRect(position, rect) {
      return (
        position.x >= rect.x &&
        position.x <= rect.x + rect.width &&
        position.y >= rect.y &&
        position.y <= rect.y + rect.height
      );
    }

    function getSoloCollisionRect(rect) {
      const movementRect = getSoloStandingObstacleCollisionRect(rect);
      const insetX = Math.min(soloRectCollisionInset, Math.max(0, (movementRect.width - 4) / 2));
      const insetY = Math.min(soloRectCollisionInset, Math.max(0, (movementRect.height - 4) / 2));
      return {
        ...movementRect,
        x: movementRect.x + insetX,
        y: movementRect.y + insetY,
        width: movementRect.width - insetX * 2,
        height: movementRect.height - insetY * 2
      };
    }

    function getSoloStandingObstacleCollisionRect(rect) {
      if (!isKitchenStandingFixture(rect.id)) {
        return rect;
      }
      return {
        ...rect,
        x: rect.x + rect.width * 0.18,
        y: rect.y + rect.height * 0.72,
        width: rect.width * 0.64,
        height: rect.height * 0.24
      };
    }

    function distanceSquaredToSoloRect(position, rect) {
      const clampedX = clamp(position.x, rect.x, rect.x + rect.width);
      const clampedY = clamp(position.y, rect.y, rect.y + rect.height);
      const dx = position.x - clampedX;
      const dy = position.y - clampedY;
      return dx * dx + dy * dy;
    }

    function soloAction() {
      const solo = state.solo;
      if (!solo || solo.phase === 'preview' || solo.phase === 'result' || solo.phase === 'match_end') return;

      const human = getSoloHuman(solo);
      if (human.role === 'seeker') {
        if (solo.phase !== 'seek') {
          state.info = 'Wait for Seek before attacking.';
          return;
        }
        const result = performSoloAttack(solo, human);
        state.info = `Attack: ${result.destroyed} props, ${result.captured} hiders.`;
        return;
      }

      if (human.role === 'hider') {
        human.currentPropIndex = (human.currentPropIndex + 1) % solo.propPool.length;
        if (solo.phase === 'seek') {
          human.switchNoiseMs = 900;
          human.lastKnownX = human.x;
          human.lastKnownY = human.y;
        }
        state.info = `Disguised as ${getSoloPlayerPropId(solo, human)}.`;
      }
    }

    function performSoloAttack(solo, seeker) {
      if (solo.phase !== 'seek' || seeker.role !== 'seeker' || solo.attacks <= 0) {
        return { destroyed: 0, captured: 0 };
      }

      solo.attacks -= 1;
      seeker.attackMs = 480;
      seeker.attackFacingX = seeker.facingX;
      seeker.attackFacingY = seeker.facingY;
      let destroyed = 0;
      let captured = 0;
      solo.props.forEach(function (prop) {
        if (prop.destroyed || !isSoloPointInCone(seeker, prop, gameRulesConfig.attackRadiusPx, getSoloPropRadius(prop.kind, prop.radius))) return;
        prop.destroyed = true;
        destroyed += 1;
      });
      getSoloHiders(solo).forEach(function (hider) {
        if (hider.captured || !isSoloPointInCone(seeker, hider, gameRulesConfig.attackRadiusPx, getSoloPropRadius(getSoloPlayerPropId(solo, hider)))) return;
        hider.captured = true;
        hider.revealMs = 700;
        hider.dizzyMs = 2600;
        captured += 1;
      });

      if (areSoloAllHidersCaptured(solo)) {
        finishSoloRound(solo, 'all_captured');
      } else if (solo.attacks <= 0) {
        finishSoloRound(solo, 'attacks_used');
      }
      return { destroyed, captured };
    }

    function finishSoloRound(solo, reason) {
      if (solo.phase === 'result' || solo.phase === 'match_end') return;

      const seeker = getSoloSeeker(solo);
      const hiders = getSoloHiders(solo);
      const capturedHiders = hiders.filter(function (hider) { return hider.captured; });
      const survivingHiders = hiders.filter(function (hider) { return !hider.captured; });
      const deltas = new Map();

      if (seeker) {
        const seekerDelta = capturedHiders.length + (capturedHiders.length === hiders.length ? 1 : 0);
        if (seekerDelta > 0) {
          deltas.set(seeker.id, seekerDelta);
          seeker.score += seekerDelta;
        }
      }
      survivingHiders.forEach(function (hider) {
        deltas.set(hider.id, (deltas.get(hider.id) || 0) + 1);
        hider.score += 1;
        hider.moving = false;
        hider.revealMs = Math.max(hider.revealMs || 0, 500);
        hider.tauntMs = Math.max(hider.tauntMs || 0, soloPhaseMs.result);
      });

      solo.phase = 'result';
      solo.timeLeftMs = soloPhaseMs.result;
      solo.matchEnded = solo.roundIndex >= solo.players.length - 1;
      solo.resultText = `${seeker?.displayName || 'Seeker'} caught ${capturedHiders.length}/${hiders.length}`;
      if (reason === 'attacks_used') {
        solo.resultText += ' - attacks depleted';
      } else if (reason === 'time_up') {
        solo.resultText += ' - time up';
      }
      solo.resultLines = solo.players.map(function (player) {
        const delta = deltas.get(player.id) || 0;
        return `${player.displayName}: ${player.score}${delta > 0 ? ` (+${delta})` : ''}`;
      });
      state.moveX = 0;
      state.moveY = 0;
      state.info = solo.resultText;
    }

    function drawSolo(width, height) {
      updateSolo();

      const solo = state.solo;
      if (!solo) {
        startSoloPractice();
      }
      const currentSolo = state.solo;
      if (!currentSolo) return;

      drawMatchView(createSoloMatchView(currentSolo), width, height);
    }

    function getSoloActionLabel(solo, human) {
      if (human.role === 'seeker') {
        return solo.phase === 'seek' ? `Cone Attack (${solo.attacks})` : 'Locked';
      }
      return solo.phase === 'preview' ? 'Locked' : 'Switch Prop';
    }

    function getSoloHintText(solo, human, seeker) {
      if (solo.phase === 'preview') return 'Preview: study the original prop layout.';
      if (solo.phase === 'hide' && human.role === 'seeker') return 'Hide: you are blind while hiders pick positions.';
      if (solo.phase === 'hide') return `Hide: choose a spot and disguise as ${getSoloPlayerPropId(solo, human)}.`;
      if (human.role === 'seeker') return `Seek: ${solo.attacks} attacks left. Hit suspicious props.`;
      return `Seek: ${seeker?.displayName || 'Seeker'} is searching. Keep your prop believable.`;
    }

    function chooseSoloHideTarget(solo, player, index) {
      const kind = getSoloPlayerPropId(solo, player);
      const candidates = solo.props.filter(function (prop) {
        return prop.kind === kind;
      });
      const target = candidates[index % Math.max(1, candidates.length)] || solo.props[index % solo.props.length];
      if (!target) {
        return { x: player.x, y: player.y };
      }

      return chooseSoloOpenPointNearProp(solo, player, target, index);
    }

    function chooseSoloSafeSpawn(solo, player, preferredSpawn, index) {
      const radius = getSoloActorRadius(solo, player);
      const preferred = clampSoloPosition(preferredSpawn, radius);
      if (!isSoloPositionBlocked(solo, player, preferred, radius)) {
        return preferred;
      }

      const directions = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
        { x: 0.7, y: 0.7 },
        { x: -0.7, y: 0.7 },
        { x: 0.7, y: -0.7 },
        { x: -0.7, y: -0.7 }
      ];
      const distances = [56, 92, 128, 164];
      for (let distanceIndex = 0; distanceIndex < distances.length; distanceIndex += 1) {
        const spacing = distances[distanceIndex];
        for (let attempt = 0; attempt < directions.length; attempt += 1) {
          const direction = directions[(attempt + index + distanceIndex) % directions.length];
          const candidate = clampSoloPosition({
            x: preferred.x + direction.x * spacing,
            y: preferred.y + direction.y * spacing
          }, radius);
          if (!isSoloPositionBlocked(solo, player, candidate, radius)) {
            return candidate;
          }
        }
      }

      return preferred;
    }

    function chooseSoloOpenPointNearProp(solo, player, prop, index) {
        const spacing = getSoloActorRadius(solo, player) + getSoloPropRadius(prop.kind, prop.radius) + 10;
      const directions = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
        { x: 0.7, y: 0.7 },
        { x: -0.7, y: 0.7 },
        { x: 0.7, y: -0.7 },
        { x: -0.7, y: -0.7 }
      ];

      for (let attempt = 0; attempt < directions.length; attempt += 1) {
        const direction = directions[(attempt + index) % directions.length];
        const candidate = clampSoloPosition(
          {
            x: prop.x + direction.x * spacing,
            y: prop.y + direction.y * spacing
          },
          getSoloActorRadius(solo, player)
        );
        if (!isSoloPositionBlocked(solo, player, candidate, getSoloActorRadius(solo, player))) {
          return candidate;
        }
      }

      return clampSoloPosition({ x: prop.x + spacing, y: prop.y }, getSoloActorRadius(solo, player));
    }

    function isSoloPositionBlocked(solo, actor, position, radius) {
      for (const prop of solo.props) {
        if (
          prop.destroyed ||
          prop.blocksMovement === false ||
          !isSoloCircleCircleBlocked(position, radius, prop, getSoloPropCollisionRadius(prop))
        ) {
          continue;
        }
        return true;
      }

      for (const obstacle of soloObstacles) {
        if (
          obstacle.blocksMovement !== false &&
          obstacle.allowsOverlap !== true &&
          isSoloCircleRectBlocked(position, radius, getSoloCollisionRect(obstacle))
        ) {
          return true;
        }
      }

      if (solo.phase !== 'seek') {
        return false;
      }

      for (const other of solo.players) {
        if (other.id === actor.id || other.captured) {
          continue;
        }
        if (isSoloCircleCircleBlocked(position, radius, other, getSoloActorRadius(solo, other))) {
          return true;
        }
      }
      return false;
    }

    function getSoloHuman(solo) {
      return solo.players.find(function (player) { return player.human; }) || solo.players[0];
    }

    function getSoloSeeker(solo) {
      return solo.players.find(function (player) { return player.role === 'seeker'; }) || null;
    }

    function getSoloHiders(solo) {
      return solo.players.filter(function (player) { return player.role === 'hider'; });
    }

    function getSoloPlayerPropId(solo, player) {
      return solo.propPool[player.currentPropIndex % solo.propPool.length];
    }

    function isSoloHiderBlended(solo, hider) {
      const currentPropId = getSoloPlayerPropId(solo, hider);
      return solo.props.some(function (prop) {
        return !prop.destroyed && prop.kind === currentPropId && distanceBetween(prop, hider) < 95;
      });
    }

    function isSoloPointInCone(seeker, point, radius, targetRadius) {
      const dx = point.x - seeker.x;
      const dy = point.y - seeker.y;
      const distance = Math.hypot(dx, dy);
      const safeTargetRadius = Math.max(0, targetRadius || 0);
      if (distance > radius + safeTargetRadius) return false;
      if (distance <= safeTargetRadius || distance <= 0.00001) return true;

      const facing = normalizeFacingForVisuals({ x: seeker.facingX, y: seeker.facingY });
      const toPoint = { x: dx / distance, y: dy / distance };
      const dot = clamp(toPoint.x * facing.x + toPoint.y * facing.y, -1, 1);
      if (dot >= attackConeDotThreshold) return true;
      if (safeTargetRadius <= 0.00001) return false;

      const halfAngleRad = (gameRulesConfig.attackSectorDeg / 2) * Math.PI / 180;
      const angleToCenter = Math.acos(dot);
      const angularPadding = Math.asin(Math.min(1, safeTargetRadius / distance));
      if (
        distance >= radius - safeTargetRadius &&
        distance <= radius + safeTargetRadius &&
        angleToCenter <= halfAngleRad + angularPadding
      ) {
        return true;
      }

      const leftRay = rotateSoloVector(facing, halfAngleRad);
      const rightRay = rotateSoloVector(facing, -halfAngleRad);
      return (
        distanceSquaredToSoloSegment(point, { x: seeker.x, y: seeker.y }, { x: seeker.x + leftRay.x * radius, y: seeker.y + leftRay.y * radius }) <= safeTargetRadius * safeTargetRadius ||
        distanceSquaredToSoloSegment(point, { x: seeker.x, y: seeker.y }, { x: seeker.x + rightRay.x * radius, y: seeker.y + rightRay.y * radius }) <= safeTargetRadius * safeTargetRadius
      );
    }

    function rotateSoloVector(value, radians) {
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      return {
        x: value.x * cos - value.y * sin,
        y: value.x * sin + value.y * cos
      };
    }

    function distanceSquaredToSoloSegment(point, start, end) {
      const sx = end.x - start.x;
      const sy = end.y - start.y;
      const lengthSq = sx * sx + sy * sy;
      if (lengthSq <= 0.00001) {
        const dx = point.x - start.x;
        const dy = point.y - start.y;
        return dx * dx + dy * dy;
      }
      const t = clamp(((point.x - start.x) * sx + (point.y - start.y) * sy) / lengthSq, 0, 1);
      const closest = {
        x: start.x + sx * t,
        y: start.y + sy * t
      };
      const dx = point.x - closest.x;
      const dy = point.y - closest.y;
      return dx * dx + dy * dy;
    }

    function areSoloAllHidersCaptured(solo) {
      const hiders = getSoloHiders(solo);
      return hiders.length > 0 && hiders.every(function (hider) { return hider.captured; });
    }

    function getSoloRankingLines(solo) {
      return [...solo.players]
        .sort(function (a, b) { return b.score - a.score; })
        .map(function (player, index) { return `${index + 1}. ${player.displayName} ${player.score}`; });
    }

    function soloInput(moveX, moveY) {
      state.moveX = moveX;
      state.moveY = moveY;
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function addTestPlayer() {
      if (!state.room?.roomId) {
        state.error = 'Create a room first';
        return;
      }
      const task = wxApi.connectSocket({ url: state.serverUrl });
      task.onOpen(function () {
        task.send({ data: JSON.stringify({ type: 'join_room', roomId: state.room.roomId, playerName: 'DevBot' }) });
      });
      task.onMessage(function (event) {
        const message = JSON.parse(event.data);
        if (message.type === 'room_joined') {
          task.send({ data: JSON.stringify({ type: 'set_ready', ready: true }) });
        }
      });
      task.onError(function (event) {
        state.error = event?.errMsg || 'Test player failed';
      });
    }

    function getPlayerName() {
      return state.playerName.trim() || 'Player';
    }

    function title(text, x, y, size) {
      line(text, x, y, '#f8fafc', size);
    }

    function line(text, x, y, color, size) {
      ctx.fillStyle = color;
      ctx.font = `${size}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.fill();
    }

    function handleTouch(event) {
      const touch = event.changedTouches?.[0] || event.touches?.[0];
      if (!touch) return;
      const liveInfo = wxApi.getSystemInfoSync?.() || {};
      const x = touch.clientX * (canvas.width / (liveInfo.windowWidth || canvas.width));
      const y = touch.clientY * (canvas.height / (liveInfo.windowHeight || canvas.height));
      const hit = state.buttons.find(function (item) {
        return x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + item.h;
      });
      hit?.action();
      draw();
    }

    wxApi.onTouchEnd(handleTouch);
    if (typeof wxApi.onShow === 'function') {
      wxApi.onShow(function (launchOptions) {
        applyLaunchOptions(launchOptions, true);
        draw();
      });
    }
    applyLaunchOptions(wxApi.getLaunchOptionsSync?.(), true);
    setInterval(draw, 33);
    draw();
    console.log('[PropHideSeekFallback] Native WeChat fallback started.', state.serverUrl);
  };

  function normalizeGameRulesConfig(candidate, fallback) {
    const next = { ...fallback };
    if (!candidate || typeof candidate !== 'object') {
      return next;
    }

    Object.keys(fallback).forEach(function (key) {
      const value = Number(candidate[key]);
      if (Number.isFinite(value) && value > 0) {
        next[key] = value;
      }
    });
    return next;
  }

  function normalizeRoomId(value) {
    if (value === null || value === undefined) {
      return null;
    }
    const roomId = String(value).trim().toUpperCase();
    return /^[A-Z0-9_-]{1,32}$/.test(roomId) ? roomId : null;
  }

  function normalizeServerUrl(value) {
    if (typeof value !== 'string') {
      return null;
    }
    const url = value.trim();
    return /^wss?:\/\/[^\s]+$/i.test(url) ? url : null;
  }
})();
