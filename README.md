# 微信小游戏捉迷藏项目：AGENTS + SKILL + SPEC 文档包

这套文档用于把项目拆成可交给编码 Agent 逐阶段推进的任务体系。

## 文件结构

```text
AGENTS.md                         # 总控规则：所有 Agent 必须先读
skills/                           # 可复用技能说明
  cocos-creator/SKILL.md
  wechat-minigame/SKILL.md
  multiplayer-netcode/SKILL.md
  gameplay-systems/SKILL.md
  asset-pipeline-kenney/SKILL.md
  qa-playtest/SKILL.md
specs/                            # 每个阶段的功能规格
  SPEC_PHASE_00_FOUNDATION.md
  SPEC_PHASE_01_LOCAL_CORE_GAMEPLAY.md
  SPEC_PHASE_02_MAP_DISGUISE_PIPELINE.md
  SPEC_PHASE_03_ROOM_AND_LOBBY_MULTIPLAYER.md
  SPEC_PHASE_04_SERVER_AUTHORITY_SYNC.md
  SPEC_PHASE_05_WECHAT_MINIGAME_INTEGRATION.md
  SPEC_PHASE_06_UI_UX_AUDIO_POLISH.md
  SPEC_PHASE_07_QA_BALANCE_RELEASE.md
  SPEC_PHASE_08_V2_TASKS_EVENTS.md
```

## 推荐执行方式

每次让 Agent 开始一个阶段时，附上：

```text
请先阅读 AGENTS.md、相关 skills/*/SKILL.md、以及 specs/SPEC_PHASE_XX_*.md。
只实现当前阶段的范围，不要提前实现后续阶段内容。
完成后给出变更列表、测试结果、未解决问题。
```

## 当前核心玩法定稿

- 准备阶段：所有人只看没有角色的原始地图，不能操作。
- 躲藏阶段：找人者黑屏或静态屏保，不能操作；躲藏者正常速度移动，停下自动变成道具，右键可无冷却切换道具。
- 搜索阶段：找人者左轮盘移动，右键拍击前方扇形区域；躲藏者保持道具形态，只能慢速移动，右键无冷却切换道具。
- 拍击：一次拍击打碎前方扇形范围内多个可破坏道具；如果打中躲藏者，则抓获。
- 找人者拍击次数有限，用完本轮直接结束。
- 得分：找人者每抓到 1 人 +1，抓到全部额外 +1；躲藏者存活到最后 +1。
- 每名玩家轮流当一次找人者。
