# SPEC PHASE 03: 多人房间与大厅

## 阶段目标

实现好友房联机入口：创建房间、加入房间、玩家列表、准备状态、开始游戏。此阶段先完成房间和大厅，不要求完整权威同步玩法。

---

## 必读文件

- `AGENTS.md`
- `skills/multiplayer-netcode/SKILL.md`
- `skills/wechat-minigame/SKILL.md`
- `skills/cocos-creator/SKILL.md`

---

## 功能范围

### 1. 服务端房间基础

实现：

- 创建房间；
- 加入房间；
- 离开房间；
- 房间码；
- 玩家列表；
- 准备状态；
- 房主或任意规则下的开始游戏。

房间人数：

```text
minPlayers = 2
maxPlayers = 4 for MVP
```

### 2. 客户端 Lobby

Lobby UI：

- 输入昵称；
- 创建房间按钮；
- 加入房间输入框；
- 连接状态提示。

### 3. 客户端 Room

Room UI：

- 房间码；
- 玩家列表；
- 准备按钮；
- 开始按钮；
- 返回按钮；
- 连接/断线提示。

### 4. 网络协议

客户端 -> 服务端：

```ts
type ClientRoomMessage =
  | { type: 'create_room'; playerName: string }
  | { type: 'join_room'; roomId: string; playerName: string }
  | { type: 'leave_room' }
  | { type: 'set_ready'; ready: boolean }
  | { type: 'start_match' };
```

服务端 -> 客户端：

```ts
type ServerRoomMessage =
  | { type: 'room_joined'; room: PublicRoomState }
  | { type: 'room_updated'; room: PublicRoomState }
  | { type: 'match_starting'; room: PublicRoomState }
  | { type: 'error'; code: string; message: string };
```

### 5. 进入游戏场景

当服务端广播 `match_starting`：

- 客户端切到 `Game.scene`；
- 带上 roomId 和 playerId；
- 暂时可加载本地地图；
- 真实同步在下一阶段实现。

---

## 错误处理

至少处理：

- 房间不存在；
- 房间满员；
- 昵称为空；
- 重复加入；
- 连接断开；
- 未达到人数开始。

---

## 验收标准

- [ ] 两个客户端可以连接同一服务器。
- [ ] A 创建房间后获得房间码。
- [ ] B 输入房间码可以加入。
- [ ] 房间玩家列表同步更新。
- [ ] 玩家准备状态同步更新。
- [ ] 人数不足不能开始。
- [ ] 满足条件后可以开始并进入 Game 场景。
- [ ] 断线后房间状态有合理更新。

---

## 非本阶段内容

- 不做完整局内同步。
- 不做服务端扇形命中。
- 不做微信正式分享。
- 不做随机匹配。
- 不做账号系统。
