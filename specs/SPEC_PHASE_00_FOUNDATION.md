# SPEC PHASE 00: 项目基础与工程骨架

## 阶段目标

建立可持续迭代的工程结构，让后续 Agent 可以在明确目录、规范和配置下开发。此阶段不追求完整玩法，只要求项目能启动、能进入空场景、能加载基础配置。

---

## 必读文件

- `AGENTS.md`
- `skills/cocos-creator/SKILL.md`
- `skills/asset-pipeline-kenney/SKILL.md`

---

## 功能范围

### 1. 仓库结构

创建或整理：

```text
client/
server/
shared/
docs/
tools/
```

如果当前只先开发客户端，也必须保留 `server/` 和 `shared/` 占位目录。

### 2. Cocos 客户端基础

创建场景：

- `Boot.scene`
- `Lobby.scene`
- `Room.scene`
- `Game.scene`
- `Result.scene`

创建基础脚本：

- `App.ts`
- `GameConstants.ts`
- `EventBus.ts`
- `Logger.ts`
- `SceneLoader.ts`

### 3. Shared 类型

在 `shared/src/` 中定义：

- `RoundPhase`
- `PlayerRole`
- `PlayerState`
- 基础网络消息类型占位
- 地图配置类型占位

### 4. 基础配置

创建：

```text
client/assets/resources/configs/game_config.json
client/assets/resources/configs/map_kitchen_01.json
client/assets/resources/configs/disguise_props.json
```

只需要占位数据，但字段要为后续阶段准备。

### 5. 素材目录

建立：

```text
client/assets/art/kenney/
client/assets/art/kenney/licenses/
client/assets/audio/sfx/
client/assets/audio/music/
```

此阶段可使用纯色占位图，不要求正式素材。

---

## 配置示例

`game_config.json`：

```json
{
  "previewDurationMs": 5000,
  "hideDurationMs": 12000,
  "seekDurationMs": 45000,
  "resultDurationMs": 5000,
  "attackSectorDeg": 90,
  "attackRadiusPx": 120,
  "attackCountMultiplier": 2,
  "hiderHideSpeed": 220,
  "hiderSeekSpeed": 90,
  "seekerSpeed": 220
}
```

---

## 交付物

- Cocos 项目能打开。
- 能从 Boot 进入 Lobby。
- 基础目录存在。
- 基础配置能被读取并打印日志。
- Shared 类型可被客户端引用，或至少文件结构已准备。

---

## 验收标准

- [ ] 项目启动无报错。
- [ ] Boot 场景能自动进入 Lobby。
- [ ] 控制台输出已加载的 `game_config.json`。
- [ ] 没有实现任何超出本阶段范围的复杂玩法。
- [ ] 文档和目录命名与 `AGENTS.md` 一致。

---

## 非本阶段内容

- 不做完整玩家移动。
- 不做回合逻辑。
- 不做联机。
- 不做微信平台构建。
- 不做正式 UI。
