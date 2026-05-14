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
      buttons: []
    };
    globalThis.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__ = state;

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
      } else {
        drawGame(width, height);
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
      line('Native fallback is opt-in debug mode; default DevTools runs Cocos.', width / 2, height * 0.61, '#94a3b8', 15);
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
      title(game ? `${game.phase} | ${Math.ceil(game.timeLeftMs / 1000)}s` : 'Waiting for state...', width / 2, 54, 24);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(width * 0.14, height * 0.14, width * 0.72, height * 0.55);
      ctx.strokeStyle = '#475569';
      ctx.strokeRect(width * 0.14, height * 0.14, width * 0.72, height * 0.55);
      if (game) {
        drawTokens(game, width, height);
      }
      button('Left', width * 0.10, height * 0.78, 90, 46, function () { input(-1, 0); });
      button('Stop', width * 0.215, height * 0.78, 90, 46, function () { input(0, 0); });
      button('Right', width * 0.33, height * 0.78, 90, 46, function () { input(1, 0); });
      button(getActionLabel(), width * 0.72, height * 0.78, 150, 52, function () {
        input(state.moveX, state.moveY, getLocalAction());
      });
    }

    function drawTokens(game, width, height) {
      const mapX = width * 0.14;
      const mapY = height * 0.14;
      const mapW = width * 0.72;
      const mapH = height * 0.55;
      (game.props || []).forEach(function (prop) {
        if (prop.isDestroyed) return;
        drawToken(mapX + mapW * prop.position.x / 1280, mapY + mapH * prop.position.y / 720, '#92400e', prop.propConfigId.slice(0, 2));
      });
      (game.players || []).forEach(function (player) {
        if (player.state === 'invisible_in_preview' || player.state === 'seeker_locked') return;
        drawToken(mapX + mapW * player.position.x / 1280, mapY + mapH * player.position.y / 720, player.role === 'seeker' ? '#2563eb' : '#ea580c', player.displayName.slice(0, 2));
      });
    }

    function drawToken(x, y, color, label) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y);
    }

    function input(moveX, moveY, action) {
      state.moveX = moveX;
      state.moveY = moveY;
      state.seq += 1;
      send({ type: 'player_input', seq: state.seq, moveX, moveY, action });
    }

    function getLocalAction() {
      return getLocalPlayer()?.role === 'seeker' ? 'attack' : 'switch_prop';
    }

    function getActionLabel() {
      return getLocalAction() === 'attack' ? 'Attack' : 'Switch Prop';
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
