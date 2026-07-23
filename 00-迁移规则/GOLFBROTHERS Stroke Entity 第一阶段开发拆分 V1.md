# 《GOLFBROTHERS Stroke Entity 第一阶段开发拆分 V1》

版本：V1.0

目标：

在不影响 G1 的前提下，为 G2/G3/G4 建立基础能力。

---

# 1. 总体开发路线

采用：

五阶段拆分。

---

## Phase 1

Entity基础层

目标：

让系统能够：

> 根据比赛配置生成 Entity，并保存。

不涉及：

- 记分
- 排行榜
- UI变化

---

## Phase 2

G2/G3接入

原因：

G2/G3共享模型。

一次实现：

两个赛制。

---

## Phase 3

Leaderboard Entity化

让领先榜支持：

- player
- group
- pair

---

## Phase 4

Score页面Entity化

让记分支持：

- Group Entity
- Pair Entity

---

## Phase 5

G4接入

因为：

G4涉及：

- pairings
- Pair Entity
- 更严格换人

---

# 2. Phase 1：Entity基础层

## 目标

新增：

Entity Builder。

---

输入：

```
match.groupsmatch.pairingsregisterInfo.usersgameMode
```

---

输出：

```
match.scoreEntities
```

---

# 3. Phase 1 不做什么

禁止：

修改：

```
pages/scorepages/tournament/detailleaderboard
```

---

不改变：

```
scoreData
```

---

不改变：

```
G1流程
```

---

# 4. Phase 1 文件规划

建议新增：

---

## utils/strokeEntityBuilder.js

职责：

生成Entity。

例如：

```
buildStrokeEntities(match)
```

---

输入：

```
match
```

---

输出：

```
scoreEntities
```

---

---

## utils/strokeEntityValidator.js

职责：

校验合法性。

例如：

```
validateG2G3Groups(match)

validateG4Groups(match)
```

---

输出：

```
{ valid:true, reason:""
}
```

---

---

# 5. Phase 1 修改位置

唯一入口：

```
pages/tournament/group-editor/index.js
```

---

保存流程：

当前：

```
onConfirm()

↓

saveMatch()
```

---

未来：

```
onConfirm()

↓

validateStrokeEntities()

↓

buildStrokeEntities()

↓

saveMatch()
```

---

---

# 6. Phase 1 数据保存

增加：

```
match.scoreEntities
```

---

例如：

```
scoreEntities:{ group001:[  {   entityId,   entityType,   members:[]  } ]}
```

---

---

# 7. Phase 1 测试重点

不进入记分。

只验证：

---

## G2/G3

测试：

### 单分队

```
A1A2A3A4
```

结果：

一个Entity。

---

### 双分队

```
R1 R2B1 B2
```

结果：

两个Entity。

---

### 非法

```
R1 R2 R3B1
```

失败。

---

## G4

测试：

2人：

生成1 Pair。

4人：

生成2 Pair。

3人：

失败。

---

# 8. Phase 2：G2/G3记分接入

目标：

score页面支持：

```
Group Entity
```

---

修改：

主要：

```
pages/score/index.js
```

---

增加：

Entity模式：

```
loadStrokeEntities()
```

---

替代：

```
loadPlayers()
```

---

但是：

G1继续：

```
loadPlayers()
```

---

# 9. Phase 3：Leaderboard

目标：

当前：

```
playerId
```

扩展：

```
rowId
```

---

新增：

Leaderboard Adapter。

---

输入：

```
scoreEntities+scoreData
```

---

输出：

统一：

```
LeaderboardRow
```

---

# 10. Phase 4：Score UI

目标：

记分页显示：

组合。

---

G2：

显示：

```
红队组合R1R2
```

---

G3：

显示：

```
最佳球位组合
```

---

G4：

显示：

```
Pair A
```

---

# 11. Phase 5：G4

原因：

G4特殊：

- pairings
- pair entity
- 换人

---

单独处理。

---

# 12. Git策略

建议：

每个Phase一个Tag。

例如：

Phase1:

```
stroke-entity-phase1-complete
```

Phase2:

```
stroke-g2-g3-score-complete
```

Phase3:

```
stroke-leaderboard-entity-complete
```

---

# 13. 第一阶段完成标准

Phase1完成后：

系统应该满足：

✅ G1完全不变

✅ G2/G3/G4可以保存scoreEntities

✅ 分组非法无法保存

✅ LIVE开始不生成Entity

✅ Entity ID稳定

---

# 最终开发顺序

```
Phase 1Entity Builder       |       |Phase 2G2/G3 Score       |       |Phase 3Leaderboard       |       |Phase 4Score UI       |       |Phase 5G4
```

---

# 结论

第一阶段不是“开发G2”。

而是：

> 建立球队赛 Stroke Entity 底座。

完成后，后续所有组合赛制都会变成：

新增 Entity 类型，而不是重新设计成绩链路。

---

下一步建议：

先不要让 Cursor 写代码。

先做 **Phase 1 的只读代码定位 Patch**：

目标：

找出：

- group-editor 保存入口
- teamMatchStore 保存入口
- 最小新增文件位置

然后才开始第一个代码 Patch。你现在已经到了可以动代码的阶段，但第一刀必须非常小。
