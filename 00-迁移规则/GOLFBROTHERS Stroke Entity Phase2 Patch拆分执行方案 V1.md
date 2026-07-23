# GOLFBROTHERS Stroke Entity Phase2 Patch拆分执行方案 V1

版本：V1.0

范围：

- pages/score/index.js

目标：

在不影响G1个人比杆和普通Game组合模式的前提下，逐步接入：

- G2 最好成绩比杆赛
- G3 最佳球位比杆赛
- G4 四人两球比杆赛

---

# 1. 总体原则

Phase2不采用一次性大Patch。

原因：

当前score页面已经存在三套不同运行模型：

## G1

_playersSource

↓

scoresByPlayer

```
## 普通Game组合
```

_engineGroups

↓

gameStore.teamScoresByEntity

```
## 球队赛Stroke Entity新增：
```

_entitiesSource

↓

teamScoresByEntity

```
三者必须隔离。---# 2. Patch拆分总览Phase2拆分：
```

Patch-02A

模式入口接入

↓

Patch-02B

Entity成绩读写

↓

Patch-02C

Entity UI与录入

↓

Patch-02D

G2/G3/G4真实赛事验证

```
---# Patch-02A：Stroke Entity模式入口## 目标让score页面能够识别：
```

mode = stroke_entity

```
并进入独立初始化流程。---## 修改范围文件：
```

miniprogram/pages/score/index.js

```
---## 修改内容增加：
```

stroke_entity

```
模式判断。增加：
```

initStrokeEntityMode()

```
---## 本Patch不允许修改禁止：- confirmScoreInput- confirmQuickScore- persistSession- hydrateFromSession- refreshPlayers禁止：修改G1逻辑。---## 验收标准满足：1.G1进入：
```

individual_stroke

```
仍正常。2.普通Game：
```

fourball_best

```
仍正常。3.球队赛：
```

stroke_entity

```
可以进入。4.控制台能够看到：
```

_entitiesSource

```
初始化。---# Patch-02B：Entity成绩读写闭环## 目标完成：
```

scoreEntities

teamScoresByEntity

↓

_entitiesSource

↓

保存

```
---## 修改范围文件：
```

miniprogram/pages/score/index.js

```
---## 新增能力读取：
```

match.scoreEntities[groupId]

```
读取：
```

scoreData[groupId].teamScoresByEntity

```
生成：
```

_entitiesSource

```
---## 保存增加：
```

_persistTeamMatchEntityScores()

```
职责：输入：
```

_entitiesSource

```
输出：
```

scoreData[groupId].teamScoresByEntity

```
---## 修改位置主要：
```

persistSession()

```
增加：
```

mode === stroke_entity

```
分支。---## 恢复增加：
```

hydrateStrokeEntityMode()

```
或者：
```

_hydrateTeamMatchEntityFromSession()

```
---## 本Patch不允许修改禁止：- 成绩格UI- 记分面板- 点击录入逻辑---## 验收标准完成后：可以：1.进入比赛。2.读取已有Entity成绩。3.保存Entity成绩。4.退出。5.重新进入。6.成绩仍存在。---# Patch-02C：Entity UI和录入## 目标让用户真正可以给Entity记分。---## 修改范围文件：
```

miniprogram/pages/score/index.js

```
---## 新增运行状态增加：
```

activeEntityIdx

```
---## UI数据增加：
```

entitiesView

```
或者：Entity适配后的展示数据。---## 录入流程新增：
```

onEntityScoreCellTap()

```
或者在：
```

onScoreCellTap()

```
增加：stroke_entity分支。流程：
```

点击成绩格

↓

activeEntityIdx

↓

打开面板

↓

修改_entitiesSource

↓

刷新

↓

保存

```
---## 可复用内容复用：- 成绩输入面板- 推杆输入- 技术面板- 快捷面板- 洞状态不重新设计。---## 禁止事项禁止：把Entity拆成球员成绩。禁止：写：
```

scoresByPlayer

```
---## 验收标准G2：一个Entity一行。G3：一个Entity一行。G4：Pair Entity一行。成绩保存：
```

teamScoresByEntity

```
---# Patch-02D：真实赛事验证## 目标验证完整生命周期。---测试：## G2单分队4人。验证：生成：group Entity。---## G2双分队2+2。验证：两个Entity。---## G3最佳球位。验证：记分、保存、恢复。---## G4验证：pair Entity。---# 3. Patch之间禁止跨越## Patch-02A期间禁止：碰成绩保存。---## Patch-02B期间禁止：碰UI。---## Patch-02C期间禁止：修改存储模型。---# 4. 文件控制Phase2允许修改：
```

pages/score/index.js

```
暂不修改：
```

utils/teamMatchStore.js

pages/tournament/detail/index.js

leaderboard

groupsStore

```
---# 5. 最终目标完成后：
```

G1

_playersSource

↓

scoresByPlayer

G2/G3/G4

_entitiesSource

↓

teamScoresByEntity

```
两条链路并存。---# 6. 第一执行任务下一步只执行：Patch-02A。不要提前实现：Patch-02BPatch-02C原因：先确认：stroke_entity模式入口不会破坏现有score页面。
```
