# AGENTS.md

## 0. 项目名称

暂定名：**道具捉迷藏 / Prop Hide & Seek**

目标：使用 **Cocos Creator** 开发一款适合微信小游戏的多人线上联机 2D 俯视角捉迷藏游戏。玩家轮流扮演找人者和躲藏者，躲藏者伪装成地图环境道具，找人者通过观察和有限次数的扇形拍击找出躲藏者。

---

## 1. 所有 Agent 的最高优先级规则

任何编码 Agent、策划 Agent、美术整合 Agent、测试 Agent 在开始任务前，必须按顺序阅读：

1. 本文件 `AGENTS.md`；
2. 与任务相关的 `skills/*/SKILL.md`；
3. 当前阶段的 `specs/SPEC_PHASE_XX_*.md`；
4. 已完成阶段的交付记录或代码。

如果 SPEC 与本文件冲突，以本文件的核心玩法约束为准。  
如果技能文件与具体阶段 SPEC 冲突，以阶段 SPEC 为准。  
如果实现时发现需求不明确，优先选择最小可玩、低复杂度、可测试的方案，不要擅自扩大范围。

---

## 2. 当前核心玩法，不得擅自改回旧方案

### 2.1 回合阶段

每一轮包含四个阶段：

```text
Preview 准备阶段 -> Hide 躲藏阶段 -> Seek 搜索阶段 -> Result 结算阶段
```

### 2.2 准备阶段 Preview

- 所有人只看到原始地图。
- 玩家角色不出现。
- 躲藏者、找人者都不能操作。
- 目的：让所有玩家观察地图初始道具布局。

### 2.3 躲藏阶段 Hide

- 找人者黑屏，或显示一张美观的静态屏保。
- 找人者不能移动、不能拍击、不能观察地图。
- 躲藏者正常速度移动。
- 躲藏者停止移动后自动变成当前选中的道具。
- 躲藏者右键可以随时切换伪装道具。
- 切换道具不需要冷却。

### 2.4 搜索阶段 Seek

- 找人者出现，可以移动和拍击。
- 找人者操作：左轮盘移动，右键拍击前方扇形区域。
- 躲藏者始终保持道具形态。
- 躲藏者只能缓慢移动。
- 躲藏者操作：左轮盘移动，右键切换道具。
- 躲藏者切换道具无冷却。

### 2.5 找人者拍击

- 拍击不是单体点选。
- 拍击会命中找人者面前一个扇形范围。
- 扇形范围内的多个可破坏道具都会被打碎。
- 如果扇形范围内包含伪装成道具的躲藏者，则该躲藏者被抓获。
- 每次拍击消耗 1 次拍击次数。
- 拍击次数用完，本轮立即结束。

推荐 MVP 参数：

```text
拍击扇形角度：90 度
拍击半径：100 px 至 140 px，按地图尺寸微调
拍击次数：躲藏者人数 × 2
```

### 2.6 得分

- 找人者每抓到 1 名躲藏者，+1 分。
- 找人者抓到全部躲藏者，额外 +1 分。
- 躲藏者存活到本轮结束，+1 分。
- 被抓到的躲藏者本轮 +0 分。
- 每名玩家轮流当一次找人者，整场结束按总分排名。

---

## 3. MVP 明确不做的内容

以下内容不得在 MVP 阶段擅自加入：

- 找人者扫描技能；
- 找人者冲刺技能；
- 躲藏者翻滚、冲刺、攻击；
- 躲进柜子、箱子等容器的交互式躲藏；
- 躲藏者小任务；
- 随机地图事件；
- 复杂角色数值差异；
- 排位、赛季、付费数值成长；
- P2P 联机；
- 未经授权的素材。

小任务和随机事件只允许在 `SPEC_PHASE_08_V2_TASKS_EVENTS.md` 中作为后续版本设计。

---

## 4. 技术栈约定

### 4.1 客户端

- 引擎：Cocos Creator 3.x。
- 语言：TypeScript。
- 平台：微信小游戏，开发期允许在浏览器或模拟器中运行。
- 画面：2D 俯视角。
- 操作：移动端虚拟轮盘 + 单个右侧动作按钮。

### 4.2 服务端

MVP 推荐：

- Node.js；
- WebSocket；
- 房间制多人联机；
- 服务端权威状态；
- Redis 或内存房间状态均可，MVP 可先内存实现。

### 4.3 素材

- 使用 Kenney.nl 相关 2D 素材包。
- 素材导入前必须保留来源记录和授权文件。
- 不要把原始素材压进首包；应使用图集、压缩、分包或远程资源策略。

---

## 5. 推荐仓库结构

```text
project-root/
  AGENTS.md
  skills/
  specs/

  client/
    assets/
      scenes/
        Boot.scene
        Lobby.scene
        Room.scene
        Game.scene
        Result.scene
      scripts/
        core/
        input/
        gameplay/
        map/
        network/
        ui/
        util/
      prefabs/
        player/
        map/
        ui/
        effects/
      resources/
        configs/
      art/
        kenney/
      audio/
    settings/
    package.json

  server/
    src/
      index.ts
      rooms/
      game/
      net/
      config/
      util/
    package.json
    tsconfig.json

  shared/
    src/
      protocol/
      config/
      types/
    package.json

  tools/
    build/
    asset-pipeline/

  docs/
    decisions/
    playtest/
```

---

## 6. 命名规范

### 6.1 TypeScript

- 类名：`PascalCase`，例如 `RoundManager`。
- 文件名：与主类一致，例如 `RoundManager.ts`。
- 枚举名：`PascalCase`，枚举值使用字符串。
- 网络消息类型：`snake_case` 字符串，例如 `player_input`。
- 配置 ID：`snake_case`，例如 `kitchen_01`、`wooden_crate`。

### 6.2 Cocos 节点

```text
SceneRoot
  Managers
  MapRoot
    GroundLayer
    ObjectBackLayer
    PlayerLayer
    ObjectFrontLayer
  EffectLayer
  UILayer
```

### 6.3 资源命名

```text
map_kitchen_01
prop_wooden_crate
prop_bucket_blue
char_default
ui_btn_attack
sfx_prop_break_01
```

---

## 7. 核心数据模型

### 7.1 回合阶段

```ts
export enum RoundPhase {
  Preview = 'preview',
  Hide = 'hide',
  Seek = 'seek',
  Result = 'result',
  MatchEnd = 'match_end',
}
```

### 7.2 玩家身份

```ts
export enum PlayerRole {
  Seeker = 'seeker',
  Hider = 'hider',
}
```

### 7.3 玩家状态

```ts
export enum PlayerState {
  InvisibleInPreview = 'invisible_in_preview',
  SeekerLocked = 'seeker_locked',
  HiderMovingAsCharacter = 'hider_moving_as_character',
  HiderDisguisedIdle = 'hider_disguised_idle',
  HiderDisguisedMoving = 'hider_disguised_moving',
  Captured = 'captured',
}
```

---

## 8. 网络权威规则

当进入多人联机阶段后，以下内容必须由服务端判定：

- 当前阶段；
- 阶段倒计时；
- 玩家位置；
- 玩家身份；
- 道具切换结果；
- 拍击次数；
- 拍击命中范围；
- 普通道具是否被破坏；
- 躲藏者是否被抓；
- 回合是否结束；
- 得分。

客户端可以做预测和表现，但不能最终决定“命中”“得分”“回合结束”。

---

## 9. Agent 工作流

每个任务必须遵循：

1. 阅读相关文件。
2. 明确当前阶段范围。
3. 只实现当前 SPEC 的功能。
4. 提交前自检：是否引入 MVP 禁止内容。
5. 给出完成报告：
   - 实现了什么；
   - 改了哪些文件；
   - 如何测试；
   - 哪些问题未完成；
   - 是否影响后续阶段。

---

## 10. Definition of Done

任一阶段完成必须满足：

- 可运行；
- 不阻塞下一阶段；
- 有最小测试或手动验证步骤；
- 核心状态有日志可查；
- 没有明显 TypeScript 编译错误；
- 没有把后续版本功能提前混入 MVP；
- 新增配置或素材有命名和路径说明。

---

## 11. 相关 SKILL 路由

根据任务类型读取对应 SKILL：

| 任务类型 | 必读文件 |
|---|---|
| Cocos 场景、组件、输入、资源 | `skills/cocos-creator/SKILL.md` |
| 微信小游戏构建、分享、登录、首包 | `skills/wechat-minigame/SKILL.md` |
| 房间、WebSocket、同步、服务端判定 | `skills/multiplayer-netcode/SKILL.md` |
| 回合、伪装、拍击、得分 | `skills/gameplay-systems/SKILL.md` |
| Kenney 素材导入、图集、碰撞、遮挡 | `skills/asset-pipeline-kenney/SKILL.md` |
| 测试、平衡、上线检查 | `skills/qa-playtest/SKILL.md` |

---

## 12. 关键产品判断标准

当实现或调整玩法时，优先保护这三件事：

1. **观察与记忆**：找人者要靠准备阶段记住地图。
2. **伪装合理性**：躲藏者要把自己摆在“像本来就在这里”的位置。
3. **有限拍击压力**：找人者每次拍击都应该有成本和犹豫。

如果一个功能削弱了这三件事，默认不要加入。
