# 《GOLFBROTHERS 球队赛 Stroke Entity 数据模型 V1》

版本：V1.0

适用：

- 队内赛
- 比杆赛
- G1/G2/G3/G4

不包含：

- G5-G8 比洞赛

---

# 1. 设计目标

当前球队赛 G1 已稳定：

```
player ↓score ↓leaderboard
```

但无法直接支持：

- 最好成绩比杆赛（G2）
- 最佳球位比杆赛（G3）
- 四人两球比杆赛（G4）

原因：

当前系统默认：

> 一个成绩主体 = 一个球员

未来需要支持：

> 一个成绩主体可以是一个人、一个组合、一个Pair。

因此引入：

## Score Entity

作为统一成绩主体。

---

# 2. 核心概念

## 2.1 Match Group

定义：

> 一起出发、一起记分的比赛组。

来源：

```
match.groups
```

职责：

- 出发表
- 记分入口
- 球员集合

不是成绩主体。

---

示例：

```
{ groupId:"group_001", players:[   "R1",   "R2",   "B1",   "B2"
 ]}
```

---

# 2.2 Score Entity

定义：

> 实际产生比赛成绩的主体。

统一结构：

```
{ entityId:"", entityType:"", members:[], scores:[], putts:[]}
```

---

entityType：

| 类型     | 对应赛制  |
| ------ | ----- |
| player | G1    |
| group  | G2/G3 |
| pair   | G4    |

---

# 3. G1模型

## 个人比杆赛

当前保持。

不改：

```
scoreData[groupId].scoresByPlayer
```

---

逻辑等价：

```
ScoreEntity

type:
player

members:[ playerId
]
```

---

示例：

```
{ entityId:"player_001", entityType:"player", members:[   "player_001"
 ]}
```

---

# 4. G2/G3模型

## 最好成绩比杆赛

## 最佳球位比杆赛

共同：

```
Group Stroke
```

---

成绩主体：

```
Group Entity
```

---

数据来源：

比赛分组：

```
match.groups
```

球员分队：

```
registerInfo.users.groupId
```

---

生成：

```
teamScoresByEntity
```

---

示例：

比赛组：

```
第一组红：R1R2蓝：B1B2
```

生成：

```
teamScoresByEntity:[ {   entityId:"group_entity_001",   entityType:"group",   members:[      "R1",      "R2"
   ] }, {   entityId:"group_entity_002",   entityType:"group",   members:[      "B1",      "B2"
   ] }]
```

---

注意：

这里：

```
R1/R2
```

不是两个个人成绩。

而是：

一个组合成绩。

---

# 5. G4模型

## 四人两球比杆赛

成绩主体：

```
Pair Entity
```

---

来源：

```
match.pairings
```

---

例如：

pairings：

```
{ group001:[   {     id:"pair001",     playerIds:[       "R1",       "R2"
     ]   } ]}
```

生成：

```
teamScoresByEntity:[ {   entityId:"pair001",   entityType:"pair",   members:[     "R1",     "R2"
   ] }]
```

---

# 6. groups 与 Entity关系

重要原则：

## groups 不保存成绩

它只保存：

```
谁一起出发
```

---

Entity保存：

```
谁形成一个成绩单位
```

---

例如：

G2：

groups：

```
R1R2B1B2
```

Entity：

```
Entity A:R1,R2Entity B:B1,B2
```

---

二者不是一回事。

---

# 7. pairings 与 Entity关系

pairings：

职责：

组合关系。

例如：

```
pairings:{ group001:[   {    id:"pair001",    playerIds:["R1","R2"]   } ]}
```

---

Entity：

职责：

成绩。

例如：

```
teamScoresByEntity:[ {  entityId:"pair001",  entityType:"pair",  members:["R1","R2"] }]
```

---

二者：

共享：

```
entityId
```

但是职责分离。

---

# 8. teamScoresByEntity定义

正式球队赛未来统一使用：

```
scoreData[groupId]{ scoresByPlayer:{}, teamScoresByEntity:[]}
```

---

G1：

使用：

```
scoresByPlayer
```

---

G2/G3/G4：

使用：

```
teamScoresByEntity
```

---

不建议：

删除 scoresByPlayer。

原因：

G1稳定。

---

# 9. Leaderboard统一模型

当前：

个人榜：

```
playerId
```

未来：

统一：

Leaderboard Row

结构：

```
{ rowId:"", entityType:"", entityId:"", members:[]}
```

---

G1：

```
{
rowId:"player001",

entityType:"player"
}
```

---

G2：

```
{
rowId:"group001",

entityType:"group"
}
```

---

G4：

```
{
rowId:"pair001",

entityType:"pair"
}
```

---

# 10. 记分页面模型

当前：

G1：

```
player ↓score panel
```

---

未来：

统一：

```
Score Entity ↓score panel
```

---

展示：

G1：

显示：

```
张三
```

---

G2：

显示：

```
红队组合R1R2
```

---

G4：

显示：

```
Pair AR1R2
```

---

# 11. LIVE换人原则

核心：

> 换人改变Entity成员，不改变Entity身份。

例如：

G4：

原：

```
pair001

members:[
R1,
R2
]
```

换人：

```
pair001

members:[
R1,
A
]
```

entityId保持。

成绩继续继承。

---

G2/G3：

同理。

---

# 12. 当前系统改造方向

不做：

❌ 重写G1

❌ 替换scoresByPlayer

❌ 删除pairings

---

新增：

```
Entity Adapter Layer
```

负责：

当前结构：

```
groupspairingsscoresByPlayer
```

转换：

```
Score Entity
```

---

# 13. 最终架构

```
                match.groups                     |                     |             Entity Resolver                     |        -------------------------        |           |           |     Player      Group       Pair      G1        G2/G3        G4        |           |           |        -------------------------                    |          teamScoresByEntity                    |              Leaderboard                    |              Score Page
```

---

# 结论

当前系统无需推翻。

已有：

- G1稳定成绩链路；
- Game组合成绩参考；
- teamMatch分组结构；
- pairings关系结构。

下一阶段开发重点：

不是开发G2/G3/G4页面。

而是：

> 在球队赛中建立 Score Entity 生成与解析层。

---

这份文档建议保存：

```
迁移规则/《球队赛 Stroke Entity 数据模型 V1.md》
```

---

下一步我建议做的不是写代码，而是再整理一份：

**《球队赛 Stroke Entity 改造影响清单 V1》**

把：

- 哪些文件改；
- 哪些函数新增；
- 哪些地方保持不动；

列出来。

这份才会直接指导 Cursor 开始 Patch。
