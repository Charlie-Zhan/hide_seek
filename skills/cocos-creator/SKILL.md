# SKILL: Cocos Creator 客户端实现

## 使用场景

当任务涉及 Cocos Creator 场景、Prefab、TypeScript 组件、输入、动画、资源加载、碰撞、UI 或性能优化时，先阅读本文件。

---

## 1. 客户端基本原则

- 使用 Cocos Creator 3.x + TypeScript。
- 游戏为 2D 俯视角。
- 所有核心玩法逻辑优先做成可测试的 TypeScript 类，Cocos Component 负责表现和输入桥接。
- 不要把复杂规则散落在 UI 脚本里。
- 地图、道具、阶段时间、速度、拍击参数都应尽量配置化。

---

## 2. 推荐目录

```text
client/assets/scripts/
  core/
    App.ts
    GameConstants.ts
    EventBus.ts
    TimeUtil.ts
  input/
    VirtualJoystick.ts
    ActionButton.ts
    InputController.ts
  gameplay/
    RoundManager.ts
    RoleManager.ts
    ScoreManager.ts
    DisguiseController.ts
    SeekerAttackController.ts
    HiderMovementController.ts
  map/
    MapManager.ts
    MapConfig.ts
    PropInstance.ts
    Occluder.ts
  network/
    NetworkClient.ts
    MessageRouter.ts
    StateInterpolator.ts
  ui/
    LobbyUI.ts
    RoomUI.ts
    GameHUD.ts
    PreviewOverlay.ts
    SeekerBlindOverlay.ts
    ResultPanel.ts
  util/
    Geometry2D.ts
    Logger.ts
```

---

## 3. 场景结构

推荐 `Game.scene`：

```text
GameScene
  Managers
    GameBootstrap
    RoundManager
    MapManager
    NetworkClient
  MapRoot
    GroundLayer
    ObjectBackLayer
    PlayerLayer
    ObjectFrontLayer
  EffectLayer
  UILayer
    HUD
    PreviewOverlay
    SeekerBlindOverlay
    ResultPanel
```

### 层级规则

- `GroundLayer`：地面。
- `ObjectBackLayer`：不会遮挡玩家的背景物。
- `PlayerLayer`：玩家和伪装道具形态。
- `ObjectFrontLayer`：草丛、柱子、树冠等前景遮挡物。
- `EffectLayer`：拍击、碎片、提示效果。
- `UILayer`：所有 UI。

---

## 4. 输入实现

### 躲藏者

```text
左虚拟轮盘：移动
右侧按钮：切换道具
```

### 找人者

```text
左虚拟轮盘：移动
右侧按钮：前方扇形拍击
```

### 面朝方向

- 由最近一次非零移动输入决定。
- 停止移动后保持最后朝向。
- 拍击方向使用该朝向。

---

## 5. 伪装表现

躲藏阶段：

- 移动中显示角色。
- 停止超过短暂阈值后显示当前道具 Sprite。
- 阈值推荐 `0.2s ~ 0.3s`。

搜索阶段：

- 躲藏者始终显示为当前道具。
- 移动时也是道具慢速滑动。
- 切换道具不加冷却。
- 不要加夸张烟雾特效，避免系统过度惩罚切换。

---

## 6. 扇形拍击本地表现

即使最终命中由服务端判定，客户端也应立即播放：

- 挥击动画；
- 扇形短暂高亮；
- 挥空或命中音效；
- 普通道具破碎效果由服务端状态确认后播放或回滚。

扇形判定工具建议放在：

```text
client/assets/scripts/util/Geometry2D.ts
```

核心函数：

```ts
isPointInSector(
  point: Vec2,
  origin: Vec2,
  facing: Vec2,
  radius: number,
  angleDeg: number,
): boolean
```

---

## 7. 性能注意

- 避免在 `update()` 中频繁创建临时对象。
- 常用 Vec2 可复用。
- 道具碎片效果使用对象池。
- 小地图内玩家数少，但道具可能较多；拍击检测应先做距离粗筛，再做角度判断。
- 使用图集降低 draw call。
- 微信小游戏首包资源要控制体积。

---

## 8. 禁止事项

- 不要在客户端直接最终判定得分。
- 不要在 UI 组件中写核心玩法规则。
- 不要把找人者扫描、冲刺、复杂技能加回来。
- 不要实现“进入容器”的躲藏交互。
- 不要让切换道具有冷却。
