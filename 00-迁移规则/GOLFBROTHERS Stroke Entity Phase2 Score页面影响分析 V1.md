# GOLFBROTHERS Stroke Entity Phase2 Score页面影响分析 V1

版本：V1.0

范围：

- pages/score/index.js

- 当前G1个人比杆记分链路

目标：

分析如何在不影响G1的情况下接入：

- G2 最好成绩比杆赛

- G3 最佳球位比杆赛

- G4 四人两球比杆赛

---

# 1. 当前Score页面总体模型

当前score页面核心模型：

```text
match状态

↓

初始化记分模式

↓

生成运行时球员数据

↓

用户录入成绩

↓

保存scoreData
```

当前主要服务：

G1个人比杆赛。

核心运行对象：

```javascript
_playersSource
```

结构：

```javascript
[
 {
   playerId:"",
   scores:[],
   putts:[]
 }
]
```

---

# 2. 当前G1初始化链路

入口：

```javascript
initIndividualStrokeMode(groupId)
```

当前流程：

```text
进入记分页面

↓

读取matchState

↓

判断mode === individual_stroke

↓

读取scoreData[groupId].scoresByPlayer

↓

生成_playersSource

↓

refreshPlayers()

↓

展示记分页面
```

---

# 3. 当前G1保存链路

当前：

```text
用户点击成绩格

↓

onScoreCellTap()

↓

confirmScoreInput()

↓

修改_playersSource[index]

↓

refreshPlayers()

↓

persistSession()

↓

_persistTeamMatchIndividualScores()

↓

scoreData[groupId].scoresByPlayer

↓

saveMatch()
```

---

# 4. Entity模式目标

未来：

G2/G3/G4：

成绩主体：

不是player。

而是：

Entity。

因此需要新增：

```javascript
_entitiesSource
```

替代关系：

G1：

```text
_playersSource

↓

scoresByPlayer
```

G2/G3/G4：

```text
_entitiesSource

↓

teamScoresByEntity
```

---

# 5. 不修改原则

Phase2禁止：

修改G1流程。

包括：

不要改变：

- initIndividualStrokeMode()

- _playersSource结构

- scoresByPlayer格式

- G1 persist逻辑

原因：

G1已经稳定。

---

# 6. 需要新增的模式分支

建议增加：

Stroke Entity模式判断。

例如：

```javascript
isStrokeEntityMode()
```

返回：

true：

G2/G3/G4

false：

G1

---

# 7. 初始化改造方向

当前：

```javascript
initIndividualStrokeMode()
```

未来：

增加：

```javascript
initStrokeEntityMode()
```

负责：

1. 读取scoreEntities；

2. 读取teamScoresByEntity；

3. 生成_entitiesSource；

4. 生成展示数据。

---

# 8. Entity运行时结构

建议：

```javascript
{
 entityId:"",

 entityType:"group",

 members:[
   {
    userId:"",
    nickname:"",
    avatar:""
   }
 ],

 scores:[],

 putts:[]
}
```

说明：

members：

只负责展示。

scores：

属于Entity。

---

# 9. 成绩录入逻辑

当前：

```javascript
activePlayerIdx
```

未来Entity模式：

增加：

```javascript
activeEntityIdx
```

流程：

```text
点击成绩格

↓

选中Entity

↓

打开记分面板

↓

修改_entitiesSource[index]

↓

保存

↓

teamScoresByEntity
```

---

# 10. persistSession改造方向

当前：

```javascript
persistSession()
```

需要增加分支。

未来：

```text
persistSession()

↓

判断赛制

↓

G1

↓

_persistTeamMatchIndividualScores()


G2/G3/G4

↓

_persistTeamMatchEntityScores()
```

---

# 11. 新增保存函数建议

新增：

```javascript
_persistTeamMatchEntityScores()
```

职责：

将：

_entitiesSource

转换：

```javascript
scoreData[groupId].teamScoresByEntity
```

不影响：

scoresByPlayer。

---

# 12. hydrate读取方向

当前：

```javascript
hydrateFromSession()
```

未来：

增加：

Entity读取分支。

流程：

```text
hydrateFromSession()

↓

判断赛制

↓

G1

↓

hydrate player


Entity模式

↓

hydrate entity
```

---

# 13. 需要重点审计的位置

Phase2代码前，需要定位：

## 初始化相关

- initIndividualStrokeMode

- hydrateFromSession

- _buildTeamMatchIndividualPlayersFromScoreData

## 保存相关

- persistSession

- _persistTeamMatchIndividualScores

## UI数据刷新

- refreshPlayers

- enrichPlayer

## 记分面板绑定

- activePlayerIdx

- activePlayer相关状态

---

# 14. 不建议的方案

禁止：

直接修改：

```javascript
_playersSource
```

让它同时支持：

player

和

entity

原因：

会导致：

- G1逻辑复杂；

- 大量if判断；

- 后续比洞赛更难扩展。

---

# 15. Phase2最小改造范围

预计：

主要：

```text
pages/score/index.js
```

新增：

Entity模式。

不修改：

```text
teamMatchStore
leaderboard
detail
G1存储结构
```

---

# 16. Phase2完成标准

完成后：

必须满足：

G1：

继续：

```text
_playersSource
↓

scoresByPlayer
```

G2/G3：

支持：

```text
_entitiesSource
↓

teamScoresByEntity
```

G4：

未来复用Entity框架。

---

# 最终结论

Phase2不是重写score页面。

正确方式：

增加Entity模式分支。

形成：

```text
G1

player模式

playersSource

↓

scoresByPlayer


G2/G3/G4

Entity模式

entitiesSource

↓

teamScoresByEntity
```

两条链路并存。

不互相污染。
