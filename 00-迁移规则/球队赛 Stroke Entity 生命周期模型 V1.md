# 《球队赛 Stroke Entity 生命周期模型 V1》

版本：V1.0

适用：

- 队内赛
- Stroke赛制
- G1/G2/G3/G4

不包含：

- 比洞赛 G5-G8

---

# 1. 设计原则

## 1.1 Entity不是计算结果

Score Entity不是排行榜生成时临时计算出来的对象。

它代表：

> 比赛正式开始前，由管理员确认后的成绩主体。

因此：

Entity属于比赛配置事实。

---

## 1.2 LIVE阶段不创建Entity

开始比赛按钮：

只负责：

```
status:registering↓ongoing
```

不负责：

- 分组计算
- 组合生成
- 赛制校验
- Entity创建

---

原因：

LIVE阶段通常接近开球时间。

任何复杂校验都会增加现场风险。

---

# 2. Entity生命周期

完整流程：

```
报名↓管理员分组↓赛制校验↓生成Entity↓保存比赛↓开始比赛↓LIVE维护↓比赛结束↓历史保存
```

---

# 3. Entity创建阶段

## 创建时机：

管理员点击：

```
保存分组
```

时。

不是：

- 创建比赛时
- 报名时
- 开始比赛时

---

原因：

只有此时：

系统同时拥有：

1. 出发组

```
match.groups
```

2. 球员

```
groups.players
```

3. 分队属性

```
registerInfo.users.groupId
```

4. 赛制

```
gameMode
```

---

# 4. Entity生成规则

---

# G1

个人比杆赛：

一个球员一个Entity。

来源：

```
groups.players
```

生成：

```
{ entityId:"player_xxx", entityType:"player", members:[   "player_xxx"
 ]}
```

---

# G2/G3

最好成绩比杆赛 / 最佳球位比杆赛

Entity类型：

```
group
```

---

生成依据：

不是pairings。

而是：

```
match.groups+teamGroup属性
```

---

例如：

第一组：

```
红队:R1R2蓝队:B1B2
```

生成：

```
Entity Amembers:R1,R2Entity Bmembers:B1,B2
```

---

如果：

```
红队:R1,R2,R3,R4
```

单分队模式：

生成：

```
Entity:R1,R2,R3,R4
```

---

# G4

四人两球比杆赛

Entity类型：

```
pair
```

---

来源：

```
match.pairings
```

例如：

```
{
id:"pair001",

playerIds:[ R1, R2
]}
```

生成：

```
{
entityId:"pair001",

entityType:"pair",

members:[ R1, R2
]}
```

---

# 5. Entity保存位置

建议：

增加：

```
match.scoreEntities
```

---

结构：

```
scoreEntities:{ groupId:[   {    entityId:"",    entityType:"",    members:[]   } ]}
```

---

例如：

```
scoreEntities:{ "group001":[ {  entityId:"entity001",  entityType:"group",  members:[    "R1",    "R2"
  ] }, {  entityId:"entity002",  entityType:"group",  members:[    "B1",    "B2"
  ] } ]}
```

---

# 6. Entity与pairings关系

两者职责不同。

---

pairings:

负责：

```
谁和谁组成组合
```

用于：

- 编辑
- 展示
- 调整

---

scoreEntities:

负责：

```
谁产生一个成绩
```

用于：

- 记分
- 排名
- 历史

---

关系：

```
pairings↓scoreEntity Builder↓scoreEntities
```

---

# 7. LIVE换人规则

核心原则：

## Entity ID保持不变。

改变：

```
members
```

不改变：

```
entityId
```

---

例：

比赛开始：

```
pair001R1R2
```

---

换人：

R2 → B1

变：

```
pair001R1B1
```

---

成绩：

继续：

```
pair001
```

---

不允许：

重新创建：

```
pair002
```

否则：

历史成绩断裂。

---

# 8. LIVE新增球员

扫码加入：

需要根据当前Entity状态判断。

---

## 情况1：

已有成员替换

直接替换member。

---

## 情况2：

空缺位置加入

加入对应Entity。

---

## 情况3：

无法确定Entity归属

要求用户选择：

- 分队
- 组合

不能自动创建新的比赛结构。

---

# 9. 赛制修改规则

## 修改前已经生成Entity

如果赛制修改：

重新生成。

---

流程：

```
修改赛制↓重新校验groups↓删除旧scoreEntities↓生成新scoreEntities
```

---

如果校验失败：

沿用之前规则：

提示：

> 当前分组不符合新赛制要求，需要重新分组。

---

不做局部修补。

---

# 10. Entity删除规则

以下情况删除：

## 删除比赛组

同时删除：

```
scoreEntities[groupId]scoreData[groupId]
```

---

## 删除比赛

全部删除。

---

## 删除球员

不直接删除Entity。

进入换人流程。

---

# 11. Entity与成绩存储关系

Entity：

定义：

```
谁的成绩
```

ScoreData：

保存：

```
成绩内容
```

---

结构：

```
scoreData:{ groupId:{      teamScoresByEntity:[    {      entityId:"",      scores:[],      putts:[]    }   ] }}
```

---

Entity和Score分离。

---

# 12. Entity与Leaderboard关系

Leaderboard不再直接读取：

```
player
```

---

而读取：

```
scoreEntity
```

生成：

Leaderboard Row：

```
{ rowId:"", entityId:"", entityType:"", members:[]}
```

---

G1：

rowId=playerId

G2/G3：

rowId=groupEntityId

G4：

rowId=pairEntityId

---

# 13. 设计收益

采用生命周期模型后：

## 优点1

现场安全：

开始比赛按钮简单。

---

## 优点2

换人安全：

成绩绑定Entity。

---

## 优点3

G2/G3/G4统一：

都是：

```
Entity+Score+Leaderboard
```

---

## 优点4

G1无需重构：

继续：

```
scoresByPlayer
```

---

# 最终架构

```
报名 ↓groups ↓Entity Builder ↓scoreEntities ↓LIVE ↓scoreData ↓Leaderboard
```

---

# 结论

GOLFBROTHERS Stroke模型采用：

**“分组确认时生成Entity，LIVE阶段维护Entity，成绩绑定Entity”的生命周期模型。**

这是球队赛稳定运行的基础。

---

下一步：

建议进入：

**《Stroke Entity 数据迁移方案 V1》**

因为现在需要回答：

如何在不破坏已有 G1 数据的情况下，让现有 `scoreData` 逐步支持：

```
scoresByPlayer+teamScoresByEntity
```

然后才进入 Cursor 开发 Patch。
