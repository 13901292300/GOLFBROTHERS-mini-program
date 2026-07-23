# 《GOLFBROTHERS Stroke Entity 数据迁移方案 V1》

版本：V1.0

适用：

- 队内赛 Stroke
- G1/G2/G3/G4

---

# 1. 迁移目标

当前：

```
G1scoresByPlayer↓Leaderboard(player)
```

未来：

```
G1scoresByPlayerG2/G3/G4teamScoresByEntity
```

共同进入：

```
Stroke Adapter Layer↓Leaderboard Entity Row
```

---

# 2. 核心迁移原则

## 原则1：

不修改G1成绩存储。

保持：

```
scoreData[groupId].scoresByPlayer
```

原因：

已有：

- 记分
- 历史
- Peoria
- leaderboard

---

## 原则2：

不把G2/G3/G4强行塞入scoresByPlayer。

错误：

```
scoresByPlayer["pair001"]
```

原因：

playerId语义污染。

---

## 原则3：

新增：

```
teamScoresByEntity
```

作为组合成绩容器。

---

# 3. scoreData最终形态

未来：

```
scoreData:{ groupId:{    // G1
    scoresByPlayer:{},    // G2/G3/G4
    teamScoresByEntity:[] }}
```

---

示例：

## G1

```
{ scoresByPlayer:{   u001:{     scores:[]   } }, teamScoresByEntity:[]}
```

---

## G2

```
{ scoresByPlayer:{}, teamScoresByEntity:[ {  entityId:"entity001",  entityType:"group",  scores:[  ] } ]}
```

---

# 4. 历史数据兼容

## 老G1比赛

打开：

继续：

```
scoresByPlayer
```

不需要迁移。

---

## 老比赛没有：

```
scoreEntities
```

怎么办？

规则：

读取时：

不自动生成。

原因：

历史比赛已经完成。

---

只需要：

兼容读取：

```
if(entity不存在){

走旧逻辑

}
```

---

# 5. 新比赛创建流程

未来：

创建G1/G2/G3/G4：

保存：

```
match.gameMode
```

例如：

```
individual_stroke

best_score

best_position

two_ball
```

---

分组确认：

生成：

```
scoreEntities
```

---

初始化：

```
scoreData[groupId]
```

---

根据赛制：

---

G1:

```
scoresByPlayer:{}
```

---

G2/G3/G4:

```
teamScoresByEntity:[]
```

---

# 6. 记分页迁移原则

当前：

```
_playersSource
```

含义：

个人行。

未来：

改为：

逻辑抽象：

```
_scoreEntitiesSource
```

---

但是：

不要马上删除：

```
_playersSource
```

---

迁移阶段：

并存：

```
_playersSource

_scoreEntitiesSource
```

---

路由：

```
if(gameMode===G1)

loadPlayers()


else

loadEntities()
```

---

# 7. Leaderboard迁移原则

当前：

```
player row
```

未来：

统一：

```
LeaderboardRow
```

---

G1：

```
{
rowId:playerId,
entityType:"player"
}
```

---

G2/G3：

```
{
rowId:entityId,
entityType:"group"
}
```

---

G4：

```
{
rowId:entityId,
entityType:"pair"
}
```

---

排序逻辑：

保持：

```
toPar

↓

thru

↓

rank
```

不变。

---

# 8. scorecard逐洞展示迁移

当前：

```
leaderboard row↓playerId↓scoresByPlayer
```

---

未来：

```
leaderboard row↓entityId↓teamScoresByEntity
```

---

成员展示：

仍：

```
entity.members↓player lookup
```

---

# 9. LIVE换人迁移

当前G1：

继续：

```
scorePlayerId
```

---

G2/G3/G4：

不改变：

```
entityId
```

只改变：

```
members
```

---

例如：

```
entity001

before:

R1,R2


after:

R1,B2
```

---

成绩：

仍属于：

```
entity001
```

---

# 10. 赛制切换迁移

规则：

修改赛制：

重新生成：

```
scoreEntities
```

---

不要：

尝试转换：

G1成绩 → G2成绩

或：

G2 → G4

原因：

成绩主体已经改变。

---

处理：

清除：

```
scoreEntities

teamScoresByEntity
```

保留：

报名数据。

---

# 11. 第一阶段开发边界

第一阶段：

只实现：

## Entity基础能力

包括：

- Entity Builder
- Entity Resolver
- scoreEntities保存

不实现：

- G2/G3记分
- G4记分
- leaderboard改造

原因：

先建立底座。

---

# 12. 第二阶段

接入：

G2/G3：

因为：

二者Entity模型一致。

---

流程：

```
scoreEntities(group)↓teamScoresByEntity↓leaderboard
```

---

# 13. 第三阶段

接入：

G4：

增加：

pair entity builder

---

# 14. 禁止事项

开发过程中：

禁止：

1. 修改G1 scoresByPlayer结构
2. 删除pairings
3. 把组合成绩写入playerId
4. LIVE阶段重新生成Entity
5. leaderboard继续默认playerId作为唯一主体

---

# 最终迁移路线

```
Phase 0规则冻结↓Phase 1Entity底座↓Phase 2G2/G3↓Phase 3G4↓Phase 4G5-G8
```

---

# 结论

Stroke Entity迁移采用：

**新增Entity体系，不破坏G1体系。**

最终：

```
G1scoresByPlayerG2/G3/G4teamScoresByEntity统一输出LeaderboardRow
```

---

下一步：

完成这份后，我们就可以进入真正开发前最后一个设计：

**《G2/G3 Entity生成规则 V1》**

因为 G2/G3 是第一个要落地的赛制，也是整个组合赛的基础。你之前已经提出了很多约束：

- 单分队模式
- 双分队模式
- 4+0
- 2+2
- 2+1
- 不允许混合模式

需要把它们正式固化成算法规则。
