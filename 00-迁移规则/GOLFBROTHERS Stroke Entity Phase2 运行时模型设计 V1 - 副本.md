# GOLFBROTHERS Stroke Entity Phase2 运行时模型设计 V1

版本：V1.0

范围：

- G2 最好成绩比杆赛
- G3 最佳球位比杆赛
- G4 四人两球比杆赛

不包含：

- G1个人比杆赛改造
- G5-G8比洞赛

---

# 1. 设计目标

本文档用于冻结 Stroke Entity 在 score 页面中的运行时模型。

解决：

1. score页面如何区分个人成绩和组合成绩；

2. Entity如何进入记分流程；

3. Entity如何映射scoreEntities；

4. Entity如何保存到teamScoresByEntity；

5. G2/G3/G4如何共享同一套记分框架。

---

# 2. 核心原则

## 2.1 不修改G1运行模型

G1继续：

_playersSource

↓

playersView

↓

scoresByPlayer

```
不引入Entity。不修改：- playerId逻辑；- scorePlayerId逻辑；- G1保存函数。---## 2.2 新增Entity运行模型G2/G3/G4：使用：
```

_entitiesSource

↓

entitiesView

↓

teamScoresByEntity

```
两套模型并存：
```

G1

Player模式

G2/G3/G4

Entity模式

```
---# 3. mode设计新增：
```

mode = stroke_entity

```
用于表示：球队赛组合比杆。覆盖：| 赛制 | mode ||---|---|| G2 最好成绩比杆赛 | stroke_entity || G3 最佳球位比杆赛 | stroke_entity || G4 四人两球比杆赛 | stroke_entity |区别：通过：
```

entityType

```
区分。---# 4. Entity数据来源运行时Entity不是自己创建。来源：match.scoreEntities结构：
```

match.scoreEntities[groupId]

```
例如：```javascript{ "group001":[   {     entityId:"entity001",     entityType:"group",     members:[       "player001",       "player002"     ]   } ]}
```

---

# 5. _entitiesSource模型

score页面新增：

```
_entitiesSource
```

结构：

```
[ {   entityId:"entity001",   entityType:"group",   members:[     {       userId:"player001",       nickname:"张三",       avatar:"xxx"
     },     {       userId:"player002",       nickname:"李四",       avatar:"xxx"
     }   ],   scores:[     null,     null,     null
   ],   putts:[     null,     null,     null
   ] }]
```

---

# 6. Entity字段说明

## entityId

唯一身份。

来源：

scoreEntities.entityId。

作用：

- 成绩保存key；
- 排名key；
- 重新进入恢复。

禁止：

使用数组下标。

---

## entityType

类型：

```
grouppair
```

含义：

group：

G2/G3。

pair：

G4。

---

## members

成员信息。

用途：

展示。

不代表成绩主体。

成绩属于：

entityId。

---

## scores

Entity逐洞成绩。

例如：

```
18洞数组
```

属于：

Entity。

不是成员个人成绩。

---

# 7. G2/G3运行模型

G2/G3：

entityType:

```
group
```

例如：

```
第1组Entity AR1/R2
```

score页面显示：

```
头像1 头像2组合名称洞1 洞2 洞3...成绩
```

录入：

直接修改：

```
_entitiesSource[index].scores[]
```

---

# 8. G4运行模型

G4：

entityType:

```
pair
```

例如：

```
第1组Pair AR1/R2Pair BR3/R4
```

score页面：

每个Pair一行。

录入：

同样：

```
_entitiesSource[index].scores[]
```

---

# 9. UI模型

当前G1：

```
playersView
```

Entity模式：

新增：

```
entitiesView
```

结构：

```
{ entityId:"", membersView:[], scoresView:[], total:"", diff:""
}
```

---

# 10. 当前选中状态

G1：

```
activePlayerIdx
```

Entity模式：

新增：

```
activeEntityIdx
```

原因：

语义明确。

不要复用：

activePlayerIdx。

---

# 11. 成绩输入流程

Entity模式：

```
点击成绩格↓onEntityScoreCellTap↓activeEntityIdx↓打开记分面板↓修改_entitiesSource↓refreshEntities()↓persistSession()
```

---

# 12. 成绩保存

保存入口：

保持：

```
persistSession()
```

增加：

判断：

```
mode
```

流程：

```
persistSession↓mode判断individual_stroke↓_persistTeamMatchIndividualScoresstroke_entity↓_persistTeamMatchEntityScores
```

---

# 13. Entity保存结构

保存：

```
scoreData[groupId].teamScoresByEntity
```

例如：

```
[ {   entityId:"entity001",   scores:[     4,5,4
   ],   putts:[     2,2,1
   ] }]
```

---

# 14. Entity恢复

进入记分页面：

```
initStrokeEntityMode()↓读取match.scoreEntities↓读取scoreData.teamScoresByEntity↓合并members信息↓生成_entitiesSource↓refreshEntities()
```

---

# 15. 成员信息来源

Entity成绩只保存：

```
entityIdscoresputts
```

成员展示：

通过：

```
scoreEntities.members↓registerInfo.users
```

解析。

不要在成绩里重复保存成员资料。

---

# 16. LIVE换人处理原则

Phase2暂不处理复杂迁移。

原则：

Entity身份优先。

如果换人：

需要未来定义：

Entity成员更新策略。

当前：

禁止score页面自行改变Entity结构。

---

# 17. G2/G3/G4统一性

三种赛制共享：

```
stroke_entity
```

共享：

- 初始化；
- 录入；
- 保存；
- 恢复。

区别：

只在：

scoreEntities生成阶段。

| 赛制  | entityType |
| --- | ---------- |
| G2  | group      |
| G3  | group      |
| G4  | pair       |

---

# 18. 禁止事项

禁止：

1. 把Entity成绩拆回个人成绩；
2. 在G2/G3/G4写scoresByPlayer；
3. 用playerId作为成绩主体；
4. 用数组index作为Entity身份；
5. 修改G1流程。

---

# 19. Phase2完成标准

完成后：

满足：

1. G1不受影响；
2. G2/G3/G4可以进入score页面；
3. 一行对应一个Entity；
4. 成绩保存到teamScoresByEntity；
5. 退出重新进入仍可恢复；
6. 后续leaderboard可以直接读取Entity。

---

# 最终模型

```
G1:player↓_playersSource↓scoresByPlayerG2/G3/G4:Entity↓_entitiesSource↓teamScoresByEntity
```

结论：

Stroke Entity采用独立运行时模型。

不改写G1。

通过新增stroke_entity模式接入组合赛制。
