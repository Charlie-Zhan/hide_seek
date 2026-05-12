# SKILL: 多人联机与服务端权威

## 使用场景

当任务涉及 WebSocket、房间、同步、服务端 Tick、输入协议、命中判定、断线重连或反作弊时，阅读本文件。

---

## 1. 总体架构

推荐 MVP 架构：

```text
Cocos 微信小游戏客户端
  <-> WebSocket
Node.js Game Server
  -> 内存房间状态，后续可接 Redis
```

客户端负责：

- 采集输入；
- 播放表现；
- 插值显示服务端状态；
- 发送切换道具、拍击等意图。

服务端负责：

- 房间生命周期；
- 阶段流转；
- 玩家位置；
- 拍击次数；
- 扇形命中；
- 道具破坏；
- 抓获；
- 计分。

---

## 2. 房间模型

```ts
interface RoomState {
  roomId: string;
  status: 'waiting' | 'playing' | 'finished';
  players: PlayerState[];
  mapId: string;
  roundIndex: number;
  seekerPlayerId: string;
  phase: RoundPhase;
  phaseEndAt: number;
  props: PropState[];
  scores: Record<string, number>;
}
```

---

## 3. 输入消息

客户端到服务端：

```ts
interface ClientInputMessage {
  type: 'player_input';
  seq: number;
  moveX: number;
  moveY: number;
  action?: 'switch_prop' | 'attack';
  clientTime?: number;
}
```

服务端必须忽略与当前身份不匹配的 action：

- 找人者：只接受 `attack`。
- 躲藏者：只接受 `switch_prop`。
- Preview 阶段：不接受移动和 action。
- Hide 阶段：找人者输入全部忽略。
- Seek 阶段：双方按身份处理。

---

## 4. 服务端状态广播

```ts
interface ServerStateMessage {
  type: 'state';
  serverTick: number;
  roomId: string;
  phase: RoundPhase;
  timeLeftMs: number;
  players: PublicPlayerState[];
  props: PublicPropState[];
  events: GameEvent[];
  scores: Record<string, number>;
}
```

广播频率：

- MVP 推荐 10~15 tick/s。
- 搜索阶段可 15~20 tick/s。
- 不需要 60 tick/s。

---

## 5. 权威移动

服务端每 tick 根据最近输入更新位置。

速度推荐：

```text
hider_hide_phase_speed = 1.0x
hider_seek_phase_prop_speed = 0.35x ~ 0.5x
seeker_speed = 1.0x
```

边界和碰撞：

- 地图边界服务端判定。
- 大障碍物服务端判定。
- 可破坏小道具是否阻挡，按地图配置决定；MVP 推荐不阻挡移动，只参与拍击破坏。

---

## 6. 扇形拍击判定

输入：

- 找人者位置；
- 找人者朝向；
- 半径；
- 角度；
- 当前可破坏道具列表；
- 当前未被抓的躲藏者列表。

处理：

1. 如果不在 Seek 阶段，忽略。
2. 如果玩家不是找人者，忽略。
3. 如果剩余拍击次数 <= 0，忽略。
4. 扣除 1 次拍击次数。
5. 找出扇形内所有可破坏普通道具，标记 destroyed。
6. 找出扇形内所有未被抓躲藏者，标记 captured。
7. 如果全部躲藏者被抓，本轮结束并给全抓奖励。
8. 如果拍击次数归零，本轮结束。

---

## 7. 断线处理

MVP 规则：

- 等待房间中断线：移出房间。
- 游戏中躲藏者断线：保留 10 秒重连窗口；超过后视为被抓或本轮无存活分。
- 游戏中找人者断线：暂停最多 10 秒；无法重连则本轮提前结束，按已抓人数结算。
- 房主断线：房间继续存在，服务端不依赖房主。

---

## 8. 反作弊基本线

- 客户端不能上传位置，只上传输入。
- 客户端不能上传“我打中了谁”。
- 客户端不能上传“我得分”。
- 服务端限制输入频率。
- 服务端限制移动速度。
- 服务端限制 action 合法阶段。

---

## 9. 禁止事项

- 不要 P2P。
- 不要让客户端决定命中。
- 不要让客户端决定拍击次数。
- 不要在网络协议里暴露找人者不该看到的信息。
- 不要为了调试把全部隐藏玩家位置永久显示给普通客户端。
