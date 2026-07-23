# 《GOLFBROTHERS 球队赛 Stroke Entity 数据结构最终草案 V1》

版本：V1.0

适用：

- G1 个人比杆
- G2 最好成绩比杆
- G3 最佳球位比杆
- G4 四人两球比杆

---

# 1. Match总体结构

未来球队赛 Match：

```
{ matchId:"", matchType:"team-internal", gameMode:"", status:"registering | ongoing | finished", // 比赛分队配置
 teamGroups:[], // 报名数据
 registerInfo:{}, // 出发组
 groups:[], // 组合关系
 pairings:{}, // Stroke成绩主体
 scoreEntities:{}, // 成绩
 scoreData:{}}
```

---

# 2. 各层职责

最终确定：

| 数据                 | 职责     | 是否成绩主体 |
| ------------------ | ------ | ------ |
| teamGroups         | 报名分队定义 | 否      |
| registerInfo.users | 球员报名属性 | 否      |
| groups             | 出发/记分组 | 否      |
| pairings           | 组合关系维护 | 否      |
| scoreEntities      | 成绩主体定义 | 是      |
| scoreData          | 成绩内容   | 是      |

---

# 3. teamGroups

职责：

定义比赛分队。

例如：

```
teamGroups:[ {  id:"red",  name:"红队"
 }, {  id:"blue",  name:"蓝队"
 }]
```

---

不保存：

- 球员
- 成绩
- Pair

---

# 4. registerInfo.users

职责：

报名事实。

结构：

```
{ userId:"u001", nickname:"张三", groupId:"red"
}
```

---

groupId：

表示：

报名所属分队。

---

注意：

不是：

出发组ID。

---

# 5. groups

职责：

出发表事实。

结构：

```
groups:[ {  groupId:"flight001",  players:[   {    userId:"u001",    position:1
   },   {    userId:"u002",    position:2
   }  ] }]
```

---

不增加：

teamId。

原因：

分队从：

```
registerInfo.users
```

查询。

---

# 6. pairings

职责：

组合关系。

主要用于：

G4。

结构：

```
pairings:{ "flight001":[  {   id:"pair001",   playerIds:[    "u001",    "u002"
   ]  } ]}
```

---

不保存：

成绩。

---

# 7. scoreEntities

核心新增。

职责：

定义：

> 谁产生一个比赛成绩。

结构：

```
scoreEntities:{ groupId:[  {   entityId:"",   entityType:"",   members:[]  } ]}
```

---

entityType：

固定：

| 值      | 用途    |
| ------ | ----- |
| player | G1    |
| group  | G2/G3 |
| pair   | G4    |

---

# 8. G1数据形态

## scoreEntities

可以生成：

```
{
flight001:[ {  entityId:"u001",  entityType:"player",  members:[    "u001"
  ] }]}
```

---

但是：

成绩仍：

```
scoreData.flight001.scoresByPlayer
```

---

原因：

G1保持稳定。

---

# 9. G2/G3数据形态

例如：

第一组：

红：

R1

R2

蓝：

B1

B2

---

scoreEntities:

```
scoreEntities:{
flight001:[{ entityId:"entity_red", entityType:"group", members:[  "R1",  "R2"
 ]},{ entityId:"entity_blue", entityType:"group", members:[  "B1",  "B2"
 ]}]}
```

---

成绩：

```
scoreData:{
flight001:{ teamScoresByEntity:[ {  entityId:"entity_red",  scores:[  ] }, {  entityId:"entity_blue",  scores:[  ] } ]}}
```

---

# 10. G4数据形态

pairings：

```
pairings:{
flight001:[{ id:"pair001", playerIds:[  "R1",  "R2"
 ]}]}
```

---

scoreEntities:

```
scoreEntities:{
flight001:[{ entityId:"pair001", entityType:"pair", members:[  "R1",  "R2"
 ]}]}
```

---

成绩：

```
teamScoresByEntity:[{ entityId:"pair001", scores:[]}]
```

---

# 11. entityId规则

核心原则：

## 稳定ID

不能依赖成员。

---

错误：

```
entityId:"R1_R2"
```

---

正确：

例如：

```
entityId:

matchId
+
groupId
+
sequence
```

---

G4：

可以关联：

```
pairing.id
```

---

# 12. scoreData最终结构

统一：

```
scoreData:{ groupId:{   scoresByPlayer:{},   teamScoresByEntity:[] }}
```

---

规则：

## G1：

使用：

```
scoresByPlayer
```

---

## G2/G3/G4：

使用：

```
teamScoresByEntity
```

---

禁止：

组合成绩写入：

```
scoresByPlayer
```

---

# 13. Leaderboard读取关系

未来：

```
scoreEntities↓teamScoresByEntity↓LeaderboardRow
```

---

LeaderboardRow:

```
{ rowId:"", entityId:"", entityType:"", members:[]}
```

---

# 14. 逐洞成绩展示

点击排行榜：

读取：

```
row.entityId
```

---

查：

```
teamScoresByEntity
```

---

展示成员：

通过：

```
members↓registerInfo.users
```

---

# 15. LIVE换人

规则：

只允许：

修改：

```
scoreEntities.members
```

---

禁止：

修改：

```
entityId
```

---

成绩：

继续：

```
teamScoresByEntity.entityId
```

---

# 16. 删除逻辑

删除比赛组：

同时删除：

```
groups[groupId]scoreEntities[groupId]scoreData[groupId]
```

---

删除球员：

不删除Entity。

进入换人。

---

# 17. 最终数据关系图

```
teamGroups    |    |registerInfo.users    |    |groups    |    |    +----------------+    |                |pairings       scoreEntities                     |                     |              teamScoresByEntity                     |                     |              Leaderboard                     |                     |               Score Page
```

---

# 18. 最终冻结结论

球队赛 Stroke 采用：

## 配置事实层

```
teamGroupsregisterInfogroupspairings
```

↓

## 成绩主体层

```
scoreEntities
```

↓

## 成绩事实层

```
scoreData
```

↓

## 展示层

```
LeaderboardRowScore UI
```

---

# 开发原则

1. G1不迁移，只兼容。
2. G2/G3/G4不污染scoresByPlayer。
3. Entity提前生成，不在LIVE生成。
4. Entity ID稳定，成员可变化。
5. pairings和scoreEntities职责分离。

---

完成后，下一步可以进入：

**《Stroke Entity 第一阶段开发拆分 V1》**

也就是正式开始规划 Cursor Patch：

Patch 1：  
Entity Builder + 校验（无UI）

Patch 2：  
保存match.scoreEntities

Patch 3：  
G2/G3记分接入

Patch 4：  
Leaderboard接入

Patch 5：  
G4接入

这一步之后就从“设计阶段”正式进入“开发阶段”。
