# GOLFBROTHERS Stroke Entity Phase1 JSON结构冻结 V1

版本：V1.0

范围：

- G2 最好成绩比杆赛
- G3 最佳球位比杆赛
- G4 四人两球比杆赛

不包含：

- G1个人比杆Entity化
- G5-G8比洞赛

性质：

数据结构冻结文档。

用于：

- strokeEntityBuilder.js
- strokeEntityValidator.js
- 后续score页面
- leaderboard Entity化

---

# 1. 设计原则

## 1.1 scoreEntities是比赛事实

scoreEntities不是：

- 排名结果
- 成绩结果
- UI缓存

它表示：

> 本场比赛中，谁作为一个成绩主体进行比赛。

---

## 1.2 Entity提前生成

生成时机：

管理员保存正式分组。

流程：

groups

↓

validate

↓

build scoreEntities

↓

saveMatch

---

## 1.3 Entity ID稳定

Entity ID：

不能依赖成员姓名或playerId组合。

错误：

```javascript

```

原因：

换人后ID失效。

---

正确：

由比赛结构生成。

---

# 2. 顶层结构

match新增：

```
scoreEntities
```

结构：

```
scoreEntities:{    [groupId]:[]}
```

说明：

key必须是：

出发组groupId。

不是：

报名分队groupId。

---

示例：

```
scoreEntities:{        "group001":[        ...    ],    "group002":[        ...    ]}
```

---

# 3. Entity基础结构

统一：

```
{    entityId:"",    entityType:"",    members:[]}
```

---

字段说明：

| 字段         | 类型     | 说明         |
| ---------- | ------ | ---------- |
| entityId   | string | 稳定成绩主体ID   |
| entityType | string | Entity类型   |
| members    | array  | 成员userId列表 |

---

# 4. entityType定义

Phase1固定：

| 值     | 用途    |
| ----- | ----- |
| group | G2/G3 |
| pair  | G4    |

---

暂不使用：

```
player
```

原因：

G1保持原scoresByPlayer。

---

# 5. members规则

members保存：

userId。

例如：

```
{
entityId:"entity001",

entityType:"group",

members:[ "u001", "u002"
]}
```

---

不保存：

- nickname
- avatar
- gender
- teamName

原因：

这些属于展示数据。

统一通过：

registerInfo.users

查询。

---

# 6. G2/G3结构

## 示例：2+2

比赛组：

红队：

R1

R2

蓝队：

B1

B2

生成：

```
scoreEntities:{
"group001":[{ entityId:"group001_entity_1", entityType:"group", members:[   "R1",   "R2"
 ]},{ entityId:"group001_entity_2", entityType:"group", members:[   "B1",   "B2"
 ]}]}
```

---

# 7. G2/G3模式字段

是否保存组合模式：

建议：

保存。

增加：

```
compositionMode
```

---

原因：

LIVE换人校验需要。

---

结构：

```
{
entityId:"",

entityType:"group",

compositionMode:"2+2",

members:[]}
```

---

固定值：

| 值   | 含义      |
| --- | ------- |
| 4+0 | 单分队四人   |
| 2+2 | 双分队双方两人 |
| 2+1 | 双分队不满员  |
| 1+2 | 双分队不满员  |
| 1+1 | 双方单人    |

---

# 8. G4结构

来源：

pairings。

例如：

```
pairings:{
"group001":[{id:"pair001",playerIds:[
"R1",
"R2"
]}]}
```

---

生成：

```
scoreEntities:{
"group001":[{entityId:"pair001",entityType:"pair",members:[
"R1",
"R2"
]}]}
```

---

# 9. 是否保存teamGroupId

Phase1：

建议保存。

原因：

换人和校验需要快速判断分队。

增加：

```
teamGroupId
```

---

例如：

```
{
entityId:"entity001",

entityType:"group",

teamGroupId:"red",

members:[
"R1",
"R2"
]}
```

---

注意：

它是生成时快照。

不是替代：

registerInfo.users.groupId。

---

# 10. LIVE换人规则

Entity：

不重新创建。

例如：

原：

```
{
entityId:"entity001",

members:[
"R1",
"R2"
]}
```

换人：

R2→B1

变：

```
{
entityId:"entity001",

members:[
"R1",
"B1"
]}
```

entityId保持。

---

# 11. Phase1不处理内容

以下暂不实现：

## 成绩

不增加：

```
scoreEntities.score
```

---

## 排名

不增加：

```
rank
```

---

## 展示

不增加：

```
name
avatar
```

---

## 历史

不处理。

---

# 12. 与scoreData关系

scoreEntities：

定义：

谁产生成绩。

scoreData：

保存：

成绩。

未来：

G2/G3/G4：

```
scoreData[groupId]    |
    teamScoresByEntity
    |
    entityId
```

---

# 13. Phase1 Validator输入输出

输入：

```
match
```

输出：

成功：

```
{
valid:true
}
```

失败：

```
{
valid:false,

reason:""
}
```

---

提示统一：

不要暴露复杂原因。

统一：

> 当前分组不符合该比赛赛制要求，请重新分组。

---

# 14. Phase1 Builder输入输出

输入：

```
match
```

读取：

- gameMode
- groups
- pairings
- registerInfo

输出：

```
scoreEntities
```

---

# 15. Phase1最终冻结结构

完整：

```
match:{

groups:[],

pairings:{},

scoreEntities:{

"group001":[{entityId:"",entityType:"group",compositionMode:"2+2",teamGroupId:"red",members:[
"user001",
"user002"
]}]}}
```

---

# 16. 禁止事项

Phase1开发禁止：

1. 修改scoresByPlayer
2. 修改scoreData结构
3. 改leaderboard
4. 改score页面
5. LIVE重新生成Entity
6. 用playerId拼entityId

---

# 最终结论

Stroke Entity Phase1采用：

```
groups +pairings +registerInfo↓scoreEntities↓未来成绩:teamScoresByEntity
```

Entity是比赛事实主体。

Phase1只建立主体定义，不处理成绩。

```
---完成这份后，我们就可以进入 **Cursor Patch-01**。Patch-01 的范围会非常小：只做：1. 新增 `strokeEntityValidator.js`2. 新增 `strokeEntityBuilder.js`3. 在 `group-editor` 保存分组时接入生成4. 不碰 score / leaderboard这是第一刀。这个时候才适合让 Cursor 改代码。
```
