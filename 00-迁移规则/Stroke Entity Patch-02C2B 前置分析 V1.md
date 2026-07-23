## 1. 当前点击链路（G1 个人比杆）

| 项           | 内容                                                 |
| ----------- | -------------------------------------------------- |
| **函数名**     | `onScoreCellTap(e)`                                |
| **文件位置**    | `miniprogram/pages/score/index.js` ≈ L5292–5370    |
| **WXML 绑定** | 个人行洞格 `bindtap="onScoreCellTap"`（`playersView` 分支） |

**调用顺序（G1 / `individual_stroke`）：**

```
成绩格点击
  → onScoreCellTap
  → _scoreEditBlocked()（结束赛则 return）
  → 跳过 SPECIAL 列（OUT/IN/TOT）
  → mode≠fourball_best → 走个人分支
  → 从 playersView[pIdx] 读本洞 score/putts/fairway/penalty/sand
  → setData(openPatch)  // 含 showScoreSheet: true
  → 回调 syncSheetPlayers()
  → setTimeout → setData({ scoreSheetOpen: true })  // 动画打开
```

**关键状态字段（打开时写入）：**

- `activePlayerIdx`
- `sheetHoleLabel` / `sheetHoleIndex` / `sheetPar`
- `panelScore` / `panelPutt` / `panelPuttTouched`
- `panelFairway` / `panelPenalty` / `panelBunker`
- `quickPanelScores`
- `showScoreSheet` → 再 `scoreSheetOpen`
- 草稿标志清零：`scoreClearDraft` 等
- 运行时快照：`this._scoreSheetEntrySnapshot`（遮罩关闭回滚用）

**对照：Entity 现状（已完成，未开面板）**

```
onEntityScoreCellTap → activeEntityIndex + sheetHoleIndex + console.log
（不设 showScoreSheet / scoreSheetOpen）
```

---

## 2. 面板打开链路

**结论：没有独立的 `openScorePanel()`。**  
技术面板与快捷面板共用同一张 `score-input-sheet`，靠 `scorePanelMode` 切换。

| 函数                         | 调用者                               | 作用                       | 主要改写字段                                                                            |
| -------------------------- | --------------------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| **`onScoreCellTap`**       | WXML 个人/标准行                       | **G1 打开入口**（内联开面板）       | 见上表 + `showScoreSheet` / `scoreSheetOpen`                                         |
| **`openTeamScoreInput`**   | `onScoreCellTap`（`fourball_best`） | Game 组记分开面板              | `activePlayerIdx`(组索引)、洞/面板值、`quickPanelScores`、`showScoreSheet`、`scoreSheetOpen` |
| **`syncSheetPlayers`**     | 打开后回调、步进、切人等                      | **面板列表/显示初始化**（非“打开”本身）  | `sheetPlayers`、`panelMainDisplay`、`quickPanelDisplay`                             |
| **`switchScorePanelMode`** | WXML「技术面板/快捷面板」按钮                 | 切 tech/quick，**不负责首次打开** | `scorePanelMode`；切到 quick 时重算 `quickPanelScores`                                  |
| **`_hideScoreSheet`**      | 确认成功后                             | 收起（不回滚）                  | `scoreSheetOpen` → `showScoreSheet: false`                                        |
| **`closeScoreInput`**      | 遮罩点击                              | 关闭并尽量回滚快照                | 同上 + 恢复 panel 草稿字段                                                                |

打开可见性两段式：

1. `showScoreSheet: true` → 节点进 DOM  
2. `scoreSheetOpen: true` → CSS 滑入  

---

## 3. 确认保存链路

WXML **技术 / 快捷共用一个确认按钮**：

`bindtap="confirmScoreInput"`（≈ `index.wxml` L500）

```
确认按钮
  → confirmScoreInput()
       ├─ fourball_best → confirmTeamScore() → 写 _engineGroups → _finalizeTeamHole / persist…
       ├─ scorePanelMode === 'quick'
       │     ├─ quickScoreClearDraft → _clearHoleScoresInPlayersSource → refreshPlayers → persistSession → _hideScoreSheet
       │     └─ else → confirmQuickScore()
       │              → 遍历写 _playersSource → refreshPlayers → persistSession → _hideScoreSheet
       └─ tech（G1）
             ├─ scoreClearDraft → 清洞写 _playersSource → persistSession → 关面板
             └─ 否则写 _playersSource[activePlayerIdx] 本洞
                   → refreshPlayers → persistSession
                   → 有未填人则 _focusSheetPlayer；否则 _hideScoreSheet
```

| 问题                         | 结论                                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 是否最终进 `confirmScoreInput`？ | **是**（技术/快捷同一入口）                                                                                                                                                        |
| 是否改 `_playersSource`？      | **G1 tech / quick：是**；`fourball_best`：否（写 `_engineGroups`）                                                                                                              |
| Entity 若直接点确认会怎样？          | 仍进 `confirmScoreInput` → quick 会走 `confirmQuickScore` 写 `_playersSource`；tech 依赖 `activePlayerIdx` + `_playersSource[…]`，Entity 未设球员时多数会 early return，**无 Entity 写入分支** |

`persistSession` 里已有 `stroke_entity` → `_persistTeamMatchEntityScores`（写 `teamScoresByEntity`），但 **确认链路目前不会把面板值写进 `_entitiesSource` 再 persist**。

---

## 4. 状态字段列表（面板相关 `data`）

| 用途                   | 字段                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| 当前球员索引（G1 / Game 复用） | `activePlayerIdx`                                                                                             |
| 当前 Entity 索引（已有）     | `activeEntityIndex`                                                                                           |
| 当前洞号                 | `sheetHoleIndex`（辅：`sheetHoleLabel`、`sheetPar`、`sheetYards`）                                                  |
| 当前成绩（技术）             | `panelScore`（显示：`panelMainDisplay`）                                                                           |
| 推杆                   | `panelPutt`、`panelPuttTouched`                                                                                |
| 罚杆 / 沙坑 / 球道         | `panelPenalty`、`panelBunker`、`panelFairway`                                                                   |
| 快捷成绩数组               | `quickPanelScores`、`quickPanelDisplay`                                                                        |
| 面板左侧列表               | `sheetPlayers`                                                                                                |
| 面板显示                 | `showScoreSheet`、`scoreSheetOpen`、`scorePanelMode`（`'tech'`\|`'quick'`）                                       |
| 草稿/清除 UI             | `scoreClearDraft`、`scoreHoleClearPending`、`quickScoreClearDraft`、`quickScoreFreshDraft`、`techPanelFocusPulse` |

运行时（非 data）：`_scoreSheetEntrySnapshot`、`_playersSource`、`_entitiesSource`、`_engineGroups`。

---

## 5. Entity 接入建议（只分析）

**推荐方案 A：复用现有面板状态字段 + 独立主体索引 `activeEntityIndex`。**

原因：

1. UI 已是一张共用 sheet；`fourball_best` 已证明「同一面板、不同数据源」可行。  
2. `panelScore` / `sheetHoleIndex` / `showScoreSheet` 等与赛制无关，Entity 可直接灌入。  
3. 主体用已有 `activeEntityIndex`，**不要用 `activePlayerIdx` 顶 Entity**，避免污染 G1。  
4. 方案 B（整套 Entity 专用 panel 状态）重复 UI、难保视觉一致，且更容易误改 G1。

**下一阶段打开建议（概念，不实现）：**

- 在 `onEntityScoreCellTap`（或新建 `openEntityScoreInput`，由它调用）里：读 `_entitiesSource[activeEntityIndex]` → 填 `panel*` / `sheetHoleLabel` → `showScoreSheet` + `scoreSheetOpen`。  
- `syncSheetPlayers` 增加 `stroke_entity` 分支（只展示 Entity 名，不碰 `_playersSource`）。  
- **确认写入**必须落到 `_entitiesSource` + 已有 `persistSession` Entity 分支；**不能**复用 `confirmQuickScore` / tech 写 `_playersSource` 的路径。

**与「禁止改 `confirmScoreInput`」的张力：**  
当前确认按钮只绑 `confirmScoreInput`。若严格零改该函数，需另建 `confirmEntityScore` 并改 WXML 按 mode 分流，或接受对 `confirmScoreInput` 做最小 mode 分支（与禁改列表冲突，需产品拍板）。

---

## 6. 禁止修改列表（确认）

下一阶段实现时应视为**硬边界**：

| 禁止项                                             | 分析确认                                              |
| ----------------------------------------------- | ------------------------------------------------- |
| `initIndividualStrokeMode`                      | G1 入口，Entity 不得改                                  |
| `_buildTeamMatchIndividualPlayersFromScoreData` | G1 球员构建                                           |
| `_persistTeamMatchIndividualScores`             | G1 持久化；Entity 用已有 `_persistTeamMatchEntityScores` |
| `confirmScoreInput`                             | G1/Game 确认总入口；改则易伤 G1（见上张力）                       |
| `_playersSource`                                | G1 成绩主体；Entity 只用 `_entitiesSource`               |
| `activePlayerIdx`                               | G1/Game 焦点；Entity 用 `activeEntityIndex`           |

另建议一并避免改：`confirmQuickScore`、`_clearHoleScoresInPlayersSource`、`onScoreCellTap` 主体逻辑。

---

### 最终输出汇总

1. **当前点击链路**：`onScoreCellTap` → 填 panel 状态 → `showScoreSheet` → `syncSheetPlayers` → `scoreSheetOpen`；Entity 现停在 `activeEntityIndex` + `sheetHoleIndex`。  
2. **面板打开链路**：无 `openScorePanel`；G1=`onScoreCellTap`，Game=`openTeamScoreInput`；tech/quick 靠 `switchScorePanelMode`。  
3. **确认保存链路**：统一 `confirmScoreInput` → G1 写 `_playersSource`（tech/quick）或 Game 写 `_engineGroups`；Entity 尚无确认写入。  
4. **状态字段**：见第 4 节清单。  
5. **Entity 建议**：**方案 A** 复用面板字段 + `activeEntityIndex`；写入走 `_entitiesSource`，与 G1 隔离。  
6. **禁止修改**：上述 6 项成立；确认入口与禁改 `confirmScoreInput` 需在实现前先定分流策略。

（本次只读，未改任何代码。）
