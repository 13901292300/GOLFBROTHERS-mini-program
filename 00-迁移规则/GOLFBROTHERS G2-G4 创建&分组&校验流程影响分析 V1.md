# 《GOLFBROTHERS G2-G4 创建/分组/校验流程影响分析 V1》

版本：V1.0

范围：

- G2 最好成绩比杆赛
- G3 最佳球位比杆赛
- G4 四人两球比杆赛

不包含：

- G5-G8 比洞赛

---

# 1. 总体流程变化

当前球队赛：

```
创建比赛↓报名↓管理员分组↓开始比赛↓记分
```

---

增加 Stroke Entity 后：

```
创建比赛↓报名↓管理员分组        ↓   赛制校验        ↓ Entity生成        ↓保存↓开始比赛↓LIVE
```

---

核心变化：

> 分组保存不再只是保存 groups，而是同时产生比赛成绩主体。

---

# 2. 创建队内赛页面影响

文件：

```
subpackages/create/pages/team-internal/index
```

---

## 2.1 G1

保持：

无变化。

---

## 2.2 G2/G3

当前：

用户选择：

- 最好成绩比杆赛
- 最佳球位比杆赛

未来：

增加说明。

不增加复杂配置。

---

页面提示：

建议：

> 组合方式由报名分队及比赛分组自动生成，管理员无需单独配置。

---

不要增加：

- 组合选择器
- 4+0/2+2选择
- 手工配对

原因：

组合由分组结果决定。

---

## 2.3 G4

保持：

需要组合配置。

但是：

组合配置应该发生在哪里？

不是创建页。

仍然：

分组管理阶段。

---

原因：

创建时不知道：

谁报名。

---

# 3. 管理员分组页面影响

文件：

```
pages/tournament/group-editor
```

这是最大变化点。

---

# 3.1 当前职责

现在：

负责：

```
groups+pairings
```

---

未来：

增加：

```
groups+pairings+scoreEntities
```

---

# 3.2 保存按钮行为变化

当前：

点击保存：

```
保存groups
```

---

未来：

点击保存：

```
保存groups↓根据赛制校验↓生成scoreEntities↓保存match
```

---

# 4. G2/G3校验流程

输入：

```
groups+registerInfo.users.groupId
```

---

步骤：

## Step1

读取每组球员。

例如：

```
第一组:R1R2B1B2
```

---

## Step2

统计分队：

结果：

```
{ 红:2, 蓝:2
}
```

---

## Step3

判断模式：

合法：

- 4+0
- 2+2
- 2+1
- 1+2
- 1+1

非法：

- 3+1
- 1+1+1
- 三个分队

---

## Step4

检查整场一致性。

例如：

第一组：

```
4+0
```

第二组：

```
2+2
```

失败。

---

提示：

> 当前比赛包含不同组合方式，请统一分组模式。

---

# 5. G4校验流程

输入：

```
groups+pairings
```

---

检查：

## 每组人数

允许：

```
24
```

禁止：

```
13
```

---

## Pair数量

2人：

必须：

```
1 Pair
```

---

4人：

必须：

```
2 Pair
```

---

## 双分队限制

双分队：

2人Pair：

必须：

同分队。

---

4人：

必须：

两个Pair来自两个分队。

---

# 6. Entity生成位置

建议：

新增：

```
Entity Builder
```

---

调用位置：

group-editor 保存成功之前。

流程：

```
onConfirm()↓validateStrokeGroups()↓buildScoreEntities()↓saveMatch()
```

---

不要放：

- startTournamentMatch
- score页面
- leaderboard

---

# 7. M面板“开始比赛”影响

文件：

```
pages/tournament/detail/index
```

---

当前：

```
status registering↓ongoing
```

---

未来：

保持。

---

禁止：

开始比赛时：

- 重新校验
- 创建Entity
- 修改组合

---

原因：

现场风险。

---

# 8. LIVE换人影响

涉及：

- playerManage
- group-editor live模式

---

原则：

已有：

```
scoreEntities
```

存在。

---

换人：

更新：

```
members
```

---

不更新：

```
entityId
```

---

禁止：

重新生成全部Entity。

---

# 9. 赛制切换影响

场景：

保存分组后修改赛制。

---

规则：

如果：

旧Entity存在。

---

重新校验：

通过：

```
删除旧Entity生成新Entity
```

---

失败：

提示：

> 当前分组不符合新的比赛赛制要求，需要重新分组。

---

不自动修复。

---

# 10. 页面影响总结

| 模块     | G2/G3          | G4            |
| ------ | -------------- | ------------- |
| 创建页    | 增加说明           | 无             |
| 报名     | 无              | 无             |
| 分组页    | 增加自动校验         | 增加Pair校验      |
| 保存分组   | 生成Group Entity | 生成Pair Entity |
| 开始比赛   | 无变化            | 无变化           |
| LIVE换人 | 更新成员           | 更新成员          |
| 记分页    | 读取Entity       | 读取Pair        |
| 排行榜    | Entity Row     | Entity Row    |

---

# 11. 第一阶段开发范围建议

不要一次做全部。

推荐：

## Phase 1

只做：

- Entity Builder
- G2/G3校验
- 保存scoreEntities

不接：

- 记分
- leaderboard

---

## Phase 2

接：

- G2/G3 score page
- leaderboard

---

## Phase 3

接：

- G4

---

# 最终结论

G2-G4改造最大变化点：

不是创建页。

不是开始比赛。

而是：

> 管理员分组保存这一刻。

这里是整个Stroke Entity体系的生成入口。

---

下一步建议：

进入：

**《G2/G3/G4 数据结构最终草案 V1》**

把最终 match 对象形态画出来。

因为到目前为止，我们知道：

- 有 groups
- 有 pairings
- 有 scoreEntities
- 有 scoreData

但还没有冻结它们在 match 中的最终位置。

这一步完成后，就可以开始给 Cursor 下第一个真正开发 Patch。
