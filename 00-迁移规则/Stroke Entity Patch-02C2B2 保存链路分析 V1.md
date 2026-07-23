## 1. confirmScoreInput 调用链

| 项      | 内容                                                            |
| ------ | ------------------------------------------------------------- |
| **位置** | `miniprogram/pages/score/index.js` ≈ L5760–5852               |
| **入口** | WXML 共用确认键：`bindtap="confirmScoreInput"`（≈ `index.wxml` L500） |

**内部分支（实际代码，非按 mode 全枚举）：**

```
confirmScoreInput()
  → _scoreEditBlocked()? return
  → mode === 'fourball_best'
        → confirmTeamScore()  // 写 _engineGroups，再 persist 团队成绩
  → scorePanelMode === 'quick'   // ⚠ 不看 mode，G1/game/entity 都会进
        → quickScoreClearDraft?
              → _clearHoleScoresInPlayersSource → refreshPlayers → persistSession → 关面板
        → else → confirmQuickScore()  // 写 _playersSource
  → 技术面板（默认路径）
        → scoreClearDraft? → 清 _playersSource 本洞 → persist → 关面板
        → !activePlayerIdx / 无 _playersSource[idx]? → return
        → 写 _playersSource[activePlayerIdx] 本洞
        → refreshPlayers → persistSession
        → 本洞还有未填人? _focusSheetPlayer : 关面板
```

**各 mode 如何处理：**

| mode                        | 行为                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **`fourball_best`**         | 第一分支 → `confirmTeamScore` → `_engineGroups`，不碰 `_playersSource`                                                |
| **`individual_stroke`（G1）** | 非 fourball → quick 或 tech → 写 `_playersSource` → `persistSession` → `_persistTeamMatchIndividualScores`        |
| **`game`（普通个人）**            | **无独立 mode 分支**；与 G1 同走 quick/tech + `_playersSource`；`persistSession` 走 `_isGameStoreContext()` → `gameStore` |
| **`stroke_entity`（现状）**     | **无分支**；点确认会落入 quick→`confirmQuickScore`（危险）或 tech→依赖 `activePlayerIdx`/`_playersSource`（多数 no-op 或误写）         |

---

## 2. Entity 保存入口建议

**最合适位置：`confirmScoreInput` 顶部、`_scoreEditBlocked` 之后、`fourball_best` 之前：**

```js
if (this.data.mode === 'stroke_entity') {
  this.confirmEntityScoreInput(); // 或 return this.confirmEntityScoreInput()
  return;
}
```

**为什么放这里：**

1. 与现有 `fourball_best` 分流同构，入口仍是 WXML 一个确认键。  
2. **必须在 `scorePanelMode === 'quick'` 之前**：否则 Entity 快捷确认会先进 `confirmQuickScore` 写 `_playersSource`。  
3. 早 return，后续 G1/Game/fourball 代码一行不执行。

**为何不影响 G1 / Game / fourball_best：**  
仅当 `mode === 'stroke_entity'` 进入；其它 mode 条件为假，原分支顺序不变。

---

## 3. Entity 数据来源

打开面板后（`openEntityScoreInput` 已灌入）可直接用：

| 字段                                                                           | 用途                      |
| ---------------------------------------------------------------------------- | ----------------------- |
| `activeEntityIndex`                                                          | 定位 `_entitiesSource[i]` |
| `sheetHoleIndex`                                                             | 洞下标 0–17                |
| `panelScore` / `panelPutt` / `panelFairway` / `panelPenalty` / `panelBunker` | 本洞写入值                   |
| `sheetPar`                                                                   | 空洞默认杆（与 G1 一致）          |

需从 `_entitiesSource[activeEntityIndex]` 取/改：

- 目标对象本体（`entityId`、既有 `scores`/`putts` 数组）  
- 写入：`scores[hi]`、`putts[hi]`；若要与 hydrate 对称，还可写 `fairways`/`penalties`/`sands`  
- **不要**用 `activePlayerIdx` / `_playersSource`

快捷面板若支持：另用 `quickPanelScores` + 遍历 `_entitiesSource`（对标 `confirmQuickScore`，但写 Entity）。

---

## 4. `_entitiesSource` 结构

由 `_hydrateTeamMatchEntityFromSession`（≈ L1566–1621）构建，元素形如：

```js
{
  entityId,          // 来自 scoreEntities，主键
  entityType,        // 'group' | 'pair' 等
  members,           // userId[]
  compositionMode,
  teamGroupId,
  scores,            // 18 洞
  putts,
  fairways,          // hydrate 有；persist 目前未回写
  penalties,
  sands
}
```

**含：** `entityId` / `entityType` / `members` / `scores` / `putts`（以及 fairways/penalties/sands）。

---

## 5. `teamScoresByEntity` 保存链

```
_entitiesSource
  → persistSession()（mode === 'stroke_entity' 已有分支，≈ L2103）
  → _persistTeamMatchEntityScores(match, groupId)（≈ L1628）
  → match.scoreData[groupId].teamScoresByEntity
  → teamMatchStore.saveMatch(match)
```

转换（≈ L1642–1648）：

```js
{ teamId: String(entity.entityId), scores: [...], putts: [...] }
```

| 问题                | 结论                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| 是否还要改 persist 形状？ | **最小保存可不改**：继续 `teamId`(=entityId) + `scores` + `putts`                                               |
| 缺口                | hydrate 读了 fairways/penalties/sands，persist **未写出**；若面板写了这三项，下一轮 hydrate 会丢，除非扩展 persist（属增强，非必须改字段名） |

下一阶段核心缺口是：**把面板值写入 `_entitiesSource` 再调已有 `persistSession`**，不是重写 persist 模型。

---

## 6. 清洞处理建议

| 现状                                | 说明                                                                         |
| --------------------------------- | -------------------------------------------------------------------------- |
| `_clearHoleScoresInPlayersSource` | 只清 `_playersSource`（≈ L5592）                                               |
| `clearScoreInput`                 | fourball→关面板；quick→UI 草稿；tech→清 UI 且 **`activePlayerIdx: -1`**（Entity 未分流） |
| 确认清洞                              | tech/quick 确认清洞都调 `_clearHoleScoresInPlayersSource`                        |

**建议：新增 `_clearHoleScoresInEntitiesSource(holeIndex)`**（镜像 players 版，改 `_entitiesSource`），在 `confirmEntityScoreInput` 的清除路径调用。  
**不要复用** `_clearHoleScoresInPlayersSource`（数据源错误）。  
`clearScoreInput` 后续也应加 `stroke_entity` 分支（用 `activeEntityIndex`，勿写 `activePlayerIdx: -1` 当 Entity 焦点）。

---

## 7. 风险列表

| 方案                                       | 最大风险                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| **直接改 `confirmScoreInput`（无早分流 / 插错位置）** | 插在 quick **之后** → Entity 快捷仍写 `_playersSource`；改动 G1 公共路径易回归；误用 `activePlayerIdx` |
| **仅新增 `confirmEntityScoreInput` 但不改入口**  | WXML 仍绑 `confirmScoreInput` → **新函数永远不调**；或用户点确认仍误走 G1                            |
| **现状不分流**                                | tech 可能 silent return；quick 可能污染 `_playersSource`                                 |
| **persist 只写 scores/putts**              | 技术统计字段二次进入丢失（次要）                                                                  |

---

## 8. 推荐实现方案

**推荐 A：`confirmScoreInput` 顶部 mode 分流 → `confirmEntityScoreInput()`**

原因：

1. 与 `fourball_best → confirmTeamScore` 一致，无需改确认按钮结构。  
2. 一处入口，避免 WXML 漏绑 / 双按钮状态不一致。  
3. 早 return 隔离 G1/Game/fourball；写入只碰 `_entitiesSource` + 已有 `persistSession` Entity 分支。  
4. 方案 B（WXML 双 bindtap）可行，但要同步改清除/快捷等交互，分裂面更大。

**建议实现骨架（概念，不落地）：**

`confirmEntityScoreInput`：读 `activeEntityIndex` + panel* → 写 `_entitiesSource[i]` → `refreshEntities()` → `persistSession()` → 关面板 / 切下一未填 Entity（可选，对标 G1）。

---

### 最终输出汇总

1. **confirmScoreInput 调用链**：WXML → `confirmScoreInput` → fourball / quick+players / tech+players；无 Entity。  
2. **Entity 保存入口**：顶部 `stroke_entity` 分流，且在 quick 分支之前。  
3. **数据来源**：panel* + `activeEntityIndex` + `sheetHoleIndex` 足够；写回 `_entitiesSource`。  
4. **`_entitiesSource`**：含 entityId/type/members/scores/putts（+ fairways/penalties/sands）。  
5. **teamScoresByEntity**：已有 `_persistTeamMatchEntityScores`；`teamId/scores/putts` 可不改字段名。  
6. **清洞**：新建 `_clearHoleScoresInEntitiesSource`，勿复用 players 版。  
7. **风险**：分流位置错误、误写 `_playersSource`、新函数未接线。  
8. **推荐**：**方案 A**（`confirmScoreInput` 顶部分流）。

（本次只读，未改代码。）
