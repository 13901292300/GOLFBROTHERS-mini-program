# 《GOLFBROTHERS G4 Entity生成规则 V1》

版本：V1.0

适用：

- G4：四人两球比杆赛

不适用：

- G1个人比杆
- G2最好成绩比杆
- G3最佳球位比杆

---

# 1. 基本原则

## 1.1 G4成绩主体

G4不是：

个人成绩。

也不是：

整组成绩。

而是：

> Pair Entity（两人组合成绩）

---

结构：

```
{ entityType:"pair", members:[   playerA,   playerB
 ]}
```

---

# 2. Pair来源

G4组合来源：

```
match.pairings
```

---

不是：

自动根据分队生成。

原因：

G4要求：

两个人形成固定搭档。

---

例如：

比赛组：

```
R1R2B1B2
```

必须明确：

```
Pair A:R1 + R2Pair B:B1 + B2
```

---

# 3. G4分组基本规则

## 每个出发组：

必须：

- 2人
- 或4人

禁止：

- 1人
- 3人

---

## 情况A：2人组

例如：

```
R1R2
```

合法。

生成：

```
Pair Entity:

R1,R2
```

---

## 情况B：4人组

例如：

```
R1R2B1B2
```

必须拆成：

两个Pair。

例如：

```
Pair1:R1,R2Pair2:B1,B2
```

---

# 4. 分队约束

## 双分队模式

当比赛存在两个及以上分队：

### 2人Pair

要求：

两人必须属于同一个分队。

例如：

合法：

```
红:R1,R2
```

---

非法：

```
红:R1蓝:B1
```

不能组成2人Pair。

---

原因：

G4球队赛强调：

一个组合代表一个分队成绩。

---

## 4人Group

要求：

必须拆成两个Pair。

并且：

两个Pair分别来自两个分队。

例如：

```
红:R1,R2蓝:B1,B2
```

合法。

---

禁止：

```
红:R1,R2,R3,R4
```

直接形成两个Pair。

---

# 5. 单分队模式

如果比赛只有一个分队：

例如：

球队内部比赛：

```
正式队员
```

所有人同属一个分队。

---

允许：

4人：

```
A1A2A3A4
```

拆：

```
Pair1:A1,A2Pair2:A3,A4
```

---

允许：

2人：

```
A1A2
```

形成：

一个Pair。

---

# 6. 禁止情况

## 6.1 单人

禁止：

```
A1
```

原因：

无法形成Pair。

---

## 6.2 三人

禁止：

```
A1A2A3
```

原因：

无法拆Pair。

---

## 6.3 1+1+2

禁止。

例如：

```
红:R1蓝:B1白:W1,W2
```

---

原因：

超过两个成绩实体。

---

## 6.4 3+1

禁止。

例如：

```
红:R1,R2,R3蓝:B1
```

---

# 7. 比赛级组合一致性

G4整场比赛：

必须统一Pair规则。

---

允许：

所有组：

```
4人 → 2 Pair
```

---

允许：

所有组：

```
2人 → 1 Pair
```

---

禁止：

第一组：

```
4人
```

第二组：

```
2+1+1
```

---

保存失败。

提示：

> 当前分组不符合四人两球比杆赛要求，请重新分组。

---

# 8. Entity生成

生成时机：

管理员保存分组。

---

输入：

```
groups+pairings
```

---

输出：

```
scoreEntities
```

---

例如：

match.groups:

```
group001
[
R1,
R2,
B1,
B2
]
```

pairings:

```
[ { id:"pair001", players:[ R1,R2
 ] }, { id:"pair002", players:[ B1,B2
 ] }]
```

---

生成：

```
scoreEntities:{
group001:[{ entityId:"pair001", entityType:"pair", members:[ R1,R2
 ]},{ entityId:"pair002", entityType:"pair", members:[ B1,B2
 ]}]}
```

---

# 9. Entity ID规则

Pair Entity：

必须稳定。

推荐：

```
matchId+groupId+pairing.id
```

---

禁止：

使用：

```
R1_R2
```

作为ID。

原因：

换人导致ID变化。

---

# 10. LIVE换人规则

原则：

## Entity存在，不删除。

---

例如：

开始：

```
Pair001:R1R2
```

---

换人：

R2 → B5

更新：

```
Pair001:R1B5
```

---

Entity：

仍然：

```
pair001
```

---

成绩：

继续。

---

# 11. LIVE扫码加入

## 情况1：

替换已有球员

进入对应Pair。

---

## 情况2：

空缺Pair位置

加入Pair。

---

## 情况3：

2人Pair缺人

允许：

等待补齐。

---

## 情况4：

无法判断Pair归属

要求管理员处理。

禁止：

系统自动创建新Pair。

---

# 12. 与pairings关系

pairings：

保存：

```
组合关系
```

---

scoreEntities：

保存：

```
成绩主体
```

---

关系：

```
pairings↓Pair Entity Builder↓scoreEntities↓teamScoresByEntity
```

---

# 13. 与G2/G3区别

| 项目      | G2/G3 | G4       |
| ------- | ----- | -------- |
| Entity  | Group | Pair     |
| 组合来源    | 分队属性  | pairings |
| 管理员配置组合 | 否     | 是        |
| 单人组合    | 允许    | 禁止       |
| 核心校验    | 分队分布  | 人数+Pair  |
| 换人难度    | 中     | 高        |

---

# 14. G4最终流程

```
管理员分组↓确认pairings↓校验:每组2/4人↓生成Pair Entity↓保存scoreEntities↓LIVE↓维护Pair成员↓teamScoresByEntity成绩
```

---

# 结论

G4采用：

> “显式Pair配置模型”。

系统不自动猜组合。

管理员负责确定Pair。

系统负责：

- 校验合法性；
- 固定Entity；
- 维护LIVE稳定。

---

至此：

## Stroke阶段规则冻结：

| 赛制  | Entity        |
| --- | ------------- |
| G1  | Player Entity |
| G2  | Group Entity  |
| G3  | Group Entity  |
| G4  | Pair Entity   |

下一步可以进入：

**《G2-G4 创建/分组/校验流程影响分析 V1》**

因为现在规则已经明确，需要映射到现有页面：

- 创建队内赛
- 分组管理
- M面板开始比赛
- LIVE换人

然后才进入 Cursor Patch。你现在已经把最容易返工的规则层全部冻结了。
