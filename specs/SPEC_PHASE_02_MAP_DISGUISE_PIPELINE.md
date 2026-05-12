# SPEC PHASE 02: 地图、道具伪装与素材管线

## 阶段目标

把本地核心玩法放进一张可玩的 MVP 地图中，完成道具池、可破坏道具、遮挡物、地图层级和素材导入流程。此阶段重点是“地图是否可观察、可记忆、可伪装”。

---

## 必读文件

- `AGENTS.md`
- `skills/cocos-creator/SKILL.md`
- `skills/asset-pipeline-kenney/SKILL.md`
- `skills/gameplay-systems/SKILL.md`

---

## 功能范围

### 1. MVP 地图：小厨房 `kitchen_01`

地图区域：

```text
左上：冰箱区
右上：灶台区
中央：餐桌区
左下：箱子堆
右下：垃圾桶和盆栽区
```

至少包含：

- 3 个明显视觉地标；
- 20~35 个可破坏小道具；
- 6~10 个不可破坏大障碍物；
- 5~8 个遮挡物；
- 4 个出生/测试位置；
- 找人者搜索阶段出现位置。

### 2. 道具池

实现地图级道具池：

```json
{
  "mapId": "kitchen_01",
  "disguiseProps": [
    "wooden_crate",
    "trash_bin",
    "plant_pot",
    "chair",
    "water_bucket",
    "food_basket"
  ]
}
```

躲藏者切换道具时只在该地图池中循环。

### 3. 可破坏道具

每个普通小道具拥有：

```ts
PropInstance {
  id: string;
  configId: string;
  position: Vec2;
  destroyed: boolean;
  isBreakable: boolean;
  isDisguiseCandidate: boolean;
}
```

拍击命中后：

- 标记 destroyed；
- 视觉上消失或变成碎片；
- 不再被后续拍击命中。

### 4. 遮挡物

实现前景遮挡层：

- 草丛；
- 柱子；
- 大桌子前缘；
- 半高柜台或植物。

遮挡物不需要交互按钮。

### 5. 地图配置化

`map_kitchen_01.json` 至少包含：

```json
{
  "mapId": "kitchen_01",
  "displayName": "小厨房",
  "width": 1280,
  "height": 720,
  "spawnPoints": [],
  "seekerSpawnPoint": {},
  "props": [],
  "occluders": [],
  "obstacles": []
}
```

### 6. 素材导入

- 使用 Kenney 风格素材或占位素材。
- 所有 Sprite 命名规范化。
- 记录素材来源和授权文件位置。
- 生成至少一个 gameplay props 图集。

---

## 地图设计验收

地图必须满足：

- 不是纯空地；
- 不是杂物堆满全屏；
- 找人者在 Preview 阶段有机会记住关键布局；
- 躲藏者能找到合理伪装位置；
- 拍击一次不会清掉半张地图；
- 伪装道具与普通道具视觉一致，不明显特殊。

---

## 验收标准

- [ ] `kitchen_01` 可加载。
- [ ] 地图层级正确。
- [ ] 遮挡物能遮住玩家或伪装道具。
- [ ] 至少 6 种可伪装道具。
- [ ] 右键切换只在地图道具池内循环。
- [ ] 扇形拍击能破坏多个普通道具。
- [ ] 被破坏道具不会再次被命中。
- [ ] 地图可完成一整轮本地游戏。

---

## 非本阶段内容

- 不做第二张地图。
- 不做地图随机事件。
- 不做躲藏者小任务。
- 不做正式商业化皮肤。
