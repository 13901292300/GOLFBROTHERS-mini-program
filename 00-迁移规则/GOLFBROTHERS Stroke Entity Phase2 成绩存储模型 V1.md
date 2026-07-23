# GOLFBROTHERS Stroke Entity Phase2 成绩存储模型 V1

版本：V1.0

范围：

- G2 最好成绩比杆赛
- G3 最佳球位比杆赛
- G4 四人两球比杆赛

不包含：

- G1 个人比杆赛改造
- G5-G8 比洞赛

## 1. 文档目的

本文档用于冻结 Stroke Entity 与成绩数据之间的关系。

解决以下问题：

1. G2/G3/G4 的成绩主体是谁；
2. 成绩保存到哪里；
3. 记分页面如何读取；
4. 领先榜未来如何读取；
5. 组合成绩如何进入个人历史。

---

# 2. 核心设计原则

## 2.1 Entity 是组合赛成绩主体

G2/G3/G4 比赛中：

成绩主体不是个人。

成绩主体是：

Stroke Entity。

关系：

groups

↓

scoreEntities

↓

teamScoresByEntity

↓

Leaderboard Entity Row

其中：

groups：

表示出发组。

scoreEntities：

表示谁组成一个成绩主体。

teamScoresByEntity：

表示该成绩主体打出的成绩。

---

## 2.2 G1保持独立

G1个人比杆赛继续使用：

scoreData[groupId].scoresByPlayer

结构：

```javascript
{
  scoresByPlayer:{
    playerId:{
      scores:[],
      putts:[]
    }
  }
}

不生成：

player Entity。

不迁移：

scoresByPlayer。

原因：

G1已经稳定。

---

# 3. scoreData统一结构

球队赛统一：

```
match.scoreData
```

结构：

```
{  [groupId]:{    scoresByPlayer:{},    teamScoresByEntity:[]  }}
```

说明：

两种成绩主体并存：

scoresByPlayer：

用于G1。

teamScoresByEntity：

用于G2/G3/G4。

---

# 4. G2/G3成绩模型

## 4.1 成绩主体

G2/G3：

entityType:

```
group
```

来源：

match.scoreEntities[groupId]

示例：

```
scoreEntities:{  "group001":[    {      entityId:"entity001",      entityType:"group",      members:[        "user001",        "user002"
      ]    }  ]}
```

---

## 4.2 成绩保存位置

保存：

```
match.scoreData[groupId].teamScoresByEntity
```

结构：

```
[ {   entityId:"entity001",   scores:[     4,5,4
   ],   putts:[     2,2,1
   ] }]
```

---

## 4.3 禁止双写

G2/G3：

禁止同时写：

```
scoresByPlayer
```

和：

```
teamScoresByEntity
```

原因：

两个成绩来源会产生冲突。

G2/G3唯一成绩来源：

```
teamScoresByEntity
```

---

# 5. G4成绩模型

G4：

四人两球比杆赛。

成绩主体：

Pair Entity。

entityType：

```
pair
```

来源：

match.pairings

示例：

```
pairings:{ "group001":[   {     id:"pair001",     playerIds:[       "user001",       "user002"
     ]   } ]}
```

生成：

```
scoreEntities:{ "group001":[   {     entityId:"pair001",     entityType:"pair",     members:[       "user001",       "user002"
     ]   } ]}
```

---

成绩保存：

```
teamScoresByEntity
```

结构：

```
[ {   entityId:"pair001",   scores:[],   putts:[] }]
```

---

# 6. 记分页面运行模型

当前G1：

```
_playersSource↓playersView↓scoresByPlayer
```

保持。

---

未来Entity模式：

增加：

```
_entitiesSource↓entitiesView↓teamScoresByEntity
```

不要强行修改：

_playersSource。

原因：

避免影响G1。

---

# 7. Entity运行时对象

记分页内部对象：

```
{ entityId:"", entityType:"group", members:[   {     userId:"",     nickname:"",     avatar:""
   } ], scores:[], putts:[]}
```

说明：

members：

用于展示。

scores：

属于Entity。

---

# 8. 成员个人历史成绩

## 8.1 产品要求

G2/G3组合成绩：

必须进入成员个人历史。

但是：

不能伪装为个人成绩。

例如：

错误：

```
张三个人成绩：-3
```

正确：

```
张三历史成绩：2026-07-20最好成绩比杆赛成绩：-3来源：组合成绩
```

---

## 8.2 增加成绩来源标识

增加：

scoreSourceType

定义：

```
individual
```

表示个人成绩。

```
entity
```

表示组合成绩。

---

示例：

```
{ playerId:"user001", scoreSourceType:"entity", entityId:"entity001"
}
```

---

# 9. 逐洞成绩规则

G2/G3/G4：

只记录Entity成绩。

例如：

```
scores:[ 4, 5, 4, ...]
```

不记录：

组合成员个人逐洞成绩。

原因：

产品规则：

组合赛只承认组合成绩。

---

# 10. LIVE换人规则

LIVE阶段：

Entity不能因为换人重新创建。

例如：

开始：

```
Entity001R1R2
```

换人：

R2 → B1

结果：

仍然：

```
Entity001R1B1
```

成绩继续属于：

Entity001。

---

禁止：

删除旧Entity。

重新创建新Entity。

原因：

成绩连续性。

---

# 11. Leaderboard关系

未来排行榜：

不再直接：

groups.players

flatten。

流程：

```
scoreEntities+teamScoresByEntity↓Leaderboard Entity Row
```

Entity Row：

包含：

- entityId
- entityType
- members
- score
- rank

---

G1：

继续：

```
scoresByPlayer↓Player Row
```

---

# 12. 与普通Game关系

普通Game已有：

teamScoresByEntity。

但是：

球队赛不直接复用。

原因：

普通Game：

composition模型。

球队赛：

scoreEntities模型。

二者概念接近，但生命周期不同。

---

# 13. Phase2代码范围

预计修改：

主要：

pages/score/index.js

新增：

Entity记分模式。

不修改：

G1入口。

---

# 14. Phase2完成标准

完成后：

必须满足：

1. G1继续正常；
2. G2/G3可以进入记分；
3. G2/G3成绩保存到teamScoresByEntity；
4. Entity重新进入比赛仍可读取；
5. 组合成绩不是个人成绩；
6. 后续Leaderboard可以读取Entity。

---

# 15. 最终模型

```
比赛分组groups↓Stroke EntityscoreEntities↓成绩scoreData.teamScoresByEntity↓排行榜Leaderboard Entity Row↓个人历史scoreSourceType=entity
```

结论：

Stroke Entity Phase2采用：

Entity定义比赛成绩主体；

teamScoresByEntity保存组合成绩；

scoresByPlayer继续服务个人比杆。

两套模型并存，不互相污染。
