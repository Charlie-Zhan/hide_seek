# SPEC PHASE 04: 服务端权威局内同步

## 阶段目标

把本地玩法迁移到服务端权威模型，实现多人真实联机对局。客户端只上传输入，服务端判定阶段、移动、伪装、拍击、道具破坏、抓获和计分。

---

## 必读文件

- `AGENTS.md`
- `skills/multiplayer-netcode/SKILL.md`
- `skills/gameplay-systems/SKILL.md`
- `skills/cocos-creator/SKILL.md`
- `skills/qa-playtest/SKILL.md`

---

## 功能范围

### 1. 服务端整场流程

支持：

```text
WaitingRoom -> MatchStart -> Round 1..N -> MatchEnd -> Room
```

每名玩家轮流当找人者。

### 2. 服务端阶段流转

服务端权威控制：

- Preview；
- Hide；
- Seek；
- Result；
- MatchEnd。

客户端只显示服务端广播状态。

### 3. 输入协议

客户端每帧或固定频率发送：

```ts
{
  "type": "player_input",
  "seq": 123,
  "moveX": 0.2,
  "moveY": -0.6,
  "action": "attack"
}
```

`action` 可为空。躲藏者 `switch_prop`，找人者 `attack`。

### 4. 服务端移动

服务端根据阶段和身份决定速度：

| 身份 | 阶段 | 速度 |
|---|---|---:|
| 找人者 | Preview | 0 |
| 找人者 | Hide | 0 |
| 找人者 | Seek | seekerSpeed |
| 躲藏者 | Preview | 0 |
| 躲藏者 | Hide | hiderHideSpeed |
| 躲藏者 | Seek | hiderSeekSpeed |

### 5. 服务端伪装

服务端记录每个躲藏者：

- `currentPropId`；
- `isMoving`；
- `captured`。

Hide 阶段的“移动中显示角色，停下显示道具”可以由客户端根据服务端速度状态表现，但服务端要保存当前 prop。

Seek 阶段客户端必须始终显示 prop。

### 6. 服务端拍击

服务端执行：

1. 确认玩家是本轮找人者。
2. 确认当前是 Seek 阶段。
3. 确认剩余拍击次数 > 0。
4. 扣 1 次。
5. 使用找人者位置和朝向计算扇形。
6. 找出扇形内多个可破坏普通道具并标记 destroyed。
7. 找出扇形内未被抓躲藏者并标记 captured。
8. 广播 `attack_result` 或在状态中体现。
9. 检查回合结束条件。

### 7. 服务端得分

一轮结束时结算：

- 找人者抓到人数；
- 全抓奖励；
- 存活躲藏者奖励。

得分只在服务端计算。

### 8. 客户端状态插值

客户端接收 `state` 后：

- 插值玩家位置；
- 更新道具破坏状态；
- 更新 HUD；
- 播放事件效果。

允许客户端本地预测自己的移动，但必须能被服务端状态修正。

---

## 网络事件

推荐事件：

```ts
type GameEvent =
  | { type: 'phase_changed'; phase: RoundPhase }
  | { type: 'attack'; attackerId: string; x: number; y: number; facingX: number; facingY: number }
  | { type: 'props_destroyed'; propIds: string[] }
  | { type: 'hider_captured'; hiderId: string; by: string }
  | { type: 'round_ended'; reason: 'time_up' | 'attacks_used' | 'all_captured' };
```

---

## 断线规则

MVP：

- 短线 10 秒内可重连。
- 躲藏者超时未重连：本轮视为被抓或无存活分，二选一并在实现说明中固定。
- 找人者超时未重连：本轮按当前结果提前结算。
- 房间不依赖房主。

---

## 验收标准

- [ ] 2~4 名玩家可以进行完整对局。
- [ ] 每名玩家轮流当找人者。
- [ ] Preview 阶段所有客户端都看不到角色。
- [ ] Hide 阶段找人者黑屏且输入无效。
- [ ] Seek 阶段找人者拍击由服务端判定。
- [ ] 一次拍击可破坏多个道具。
- [ ] 被打中躲藏者在所有客户端显示被抓。
- [ ] 拍击次数用完由服务端结束本轮。
- [ ] 得分在所有客户端一致。
- [ ] 断线不会导致服务器崩溃。

---

## 非本阶段内容

- 不做微信分享进房。
- 不做复杂反作弊系统。
- 不做随机匹配。
- 不做排行榜。
- 不做小任务和随机事件。
