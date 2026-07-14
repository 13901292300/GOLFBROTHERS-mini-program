# User Identity Architecture

本文档定义 GOLFBROTHERS 小程序当前用户身份体系的开发规范。核心原则：

> 用户身份可以升级，比赛事实不能漂移。alias 是读兼容层，不是历史数据迁移工具。

## 1. 四层模型

### 1.1 User Identity

用户身份层描述“这个人现在是谁”。

主要模块：

- `utils/userDirectory.js`
- `utils/userStore.js`
- `utils/userIdentityAlias.js`

职责：

- 查询已有正式用户或 APP/手机号用户。
- 创建和保存 phone 用户。
- 记录 phone 用户升级 registered 用户后的 alias 关系。
- 提供当前身份展示和新业务入口的身份解析。

不得负责：

- 比赛报名写入。
- 联系人关系写入。
- Slot 绑定。
- 成绩归属迁移。

### 1.2 Contact Relation

联系人关系层描述“谁把谁保存为联系人”。

主要模块：

- `utils/contactStore.js`

职责：

- 存储 `ownerUserId -> targetUserId` 的单向联系人关系。
- 保存联系人备注 `remarkName`。
- 支持 alias 只读兼容查询。

不得负责：

- 创建用户。
- 修改用户资料。
- 报名比赛。
- 迁移联系人历史 id。

### 1.3 Match Snapshot

比赛快照层描述“这场比赛当时记录了谁”。

主要数据：

- `match.registerInfo.users`
- `match.groups[].players[]`
- `match.teamGroups`

职责：

- 保存当场报名快照。
- 保存当场分队、分组、展示名、身份来源。
- 保持历史比赛展示稳定。

不得负责：

- 跟随用户中心资料自动刷新。
- 自动把 phone userId 改成 registered userId。
- 修改成绩归属。

### 1.4 Score Fact

成绩事实层描述“成绩属于哪个历史事实对象”。

主要数据：

- `match.scoreData`
- `match.scoreData[groupId].scoresByPlayer`
- `scorePlayerId`

职责：

- 保存成绩事实。
- 支持 Slot 历史成绩继承机制。
- 保持历史成绩归属稳定。

不得负责：

- 用户身份升级。
- alias 迁移。
- 自动改写 `scoresByPlayer` key。

## 2. userId 规则

### 2.1 phone 用户

phone 用户是本地长期身份，通常来自手机号手工添加、扫码加入或 APP 导入。

推荐格式：

```text
phone_13800001111
```

字段特征：

- `userType: 'phone'`
- `phone`
- `nickname`
- `source` 或 `identitySource`: `manual_add` / `app_import` / `scan_add`
- `wechatBound: false`

### 2.2 registered 用户

registered 用户是正式小程序/微信身份。

推荐格式：

```text
wx_xxx
```

字段特征：

- `userType: 'registered'`
- `identitySource: 'mini_program'`
- `nickname`
- `competitionName`
- `avatar`
- `gender`
- `openid`
- `unionid`

### 2.3 alias 关系

phone 用户升级 registered 用户时，不删除 phone 用户，不迁移历史比赛，只创建 alias。

结构：

```js
{
  fromUserId: 'phone_13800001111',
  toUserId: 'wx_xxx',
  type: 'phone_to_registered'
}
```

读取当前身份时：

```js
userIdentityAlias.resolveCanonicalUserId(userId)
```

## 3. alias 使用规则

### 3.1 允许

alias 可用于只读兼容：

- 查询。
- 判断是否同一人。
- 去重。
- 展示补充。
- 联系人查询兼容。
- 报名/分组状态判断兼容。

典型场景：

- `phone_xxx` 历史报名，当前用 `wx_xxx` 查询，应识别已报名。
- `phone_xxx` 历史联系人，当前用 `wx_xxx` 查询，应找到联系人关系。
- `phone_xxx` 历史分组，当前用 `wx_xxx` 查询，应识别已分组。

### 3.2 禁止

alias 不得用于破坏历史事实：

- 禁止批量迁移历史报名。
- 禁止删除并替换旧 `userId`。
- 禁止迁移 `scoreData` key。
- 禁止迁移 `scorePlayerId`.
- 禁止自动改写 `groups.players[].userId`.
- 禁止自动改写 `registerInfo.users[].userId`.
- 禁止自动改写 `contactStore` 的 `ownerUserId` / `targetUserId`.

## 4. 字段职责

### 4.1 userStore 字段

`userStore` 保存长期用户身份。

核心字段：

- `userId`: 本地用户身份 id。
- `userType`: `phone` / `registered`.
- `registeredUserId`: phone 升级后的正式用户 id。
- `phone`
- `nickname`
- `competitionName`
- `avatar`
- `gender`
- `source`
- `phoneVerified`
- `wechatBound`
- `openid`
- `unionid`
- `createdAt`
- `updatedAt`

职责：

- 记录当前身份状态。
- 支持 phone 用户升级 registered 用户。
- 不处理比赛历史。

### 4.2 contactStore 字段

`contactStore` 保存联系人关系。

核心字段：

- `contactId`
- `ownerUserId`
- `targetUserId`
- `phone`
- `remarkName`
- `source`
- `createdAt`
- `updatedAt`

职责：

- 保存单向联系人关系。
- 保存备注。
- 查询时支持 alias。

注意：

- `remarkName` 是联系人关系字段，不是用户资料字段。
- A 给 B 的备注不等于 B 给 A 的备注。

### 4.3 registerInfo 字段

`registerInfo.users` 保存比赛报名快照。

核心字段：

- `userId`
- `userType`
- `identitySource`
- `phone`
- `nickname`
- `competitionName`
- `matchNickname`
- `avatar`
- `gender`
- `groupId`
- `groupName`
- `matchTeamId`
- `matchTeamName`
- `source`
- `registeredAt`
- `joinStatus`

职责：

- 表示当场比赛报名时的快照。
- 支持报名列表、选手管理、LIVE 展示。
- 保持历史展示稳定。

注意：

- `source` 表示报名行为来源。
- `identitySource` 表示身份来源。
- `userType` 表示用户身份类型。
- 三者禁止混用。

### 4.4 scoreData 字段

`scoreData` 保存成绩事实。

核心字段：

- `scoreData[groupId]`
- `scoresByPlayer[playerId]`
- `scorePlayerId`

职责：

- 表示成绩归属。
- 支持历史成绩继承。
- 不跟随用户身份升级自动变化。

禁止：

- 用 alias 自动改写 `scoresByPlayer` key。
- 因 phone 升级 registered 改写 `scorePlayerId`。

## 5. 展示规则

### 5.1 用户中心：最新资料

用户中心展示当前最新资料。

规则：

- 优先展示 registered 用户资料。
- 如果存在 alias，使用 canonical userId 展示当前身份。
- phone 用户升级后展示 registered 状态。

### 5.2 联系人：备注优先

联系人展示优先级：

1. `contact.remarkName`
2. 最新用户资料 `nickname`
3. 最新用户资料 `competitionName`
4. 历史 fallback name
5. `userId`

注意：

- 备注不能被 registered 昵称覆盖。
- alias 只用于找到联系人，不改联系人记录。

### 5.3 比赛：快照优先

比赛相关展示优先使用 `registerInfo.users` 快照。

适用页面：

- 报名列表。
- 选手管理。
- 出发表。
- LIVE 详情。
- 领先榜。
- 成绩卡。
- 支付/收费记录。

展示优先级：

1. `matchNickname`
2. `competitionName`
3. `nickname`
4. `name`
5. `userId`

### 5.4 成绩：事实优先

成绩展示以 `scoreData` 和 Slot 历史事实为准。

规则：

- `scorePlayerId` 是历史成绩归属线索。
- `scoresByPlayer` key 不因身份升级而变化。
- 如果发生 Slot 换人/继承，必须走既有成绩继承逻辑。

## 6. 新增功能开发检查清单

新增页面或功能前，必须确认以下问题：

### 6.1 读取哪个层？

- 当前身份：读取 User Identity。
- 联系人备注：读取 Contact Relation。
- 比赛名单：读取 Match Snapshot。
- 成绩归属：读取 Score Fact。

### 6.2 是否允许 alias？

允许 alias 的场景：

- 查询。
- 判断。
- 去重。
- 展示补充。

不允许 alias 的场景：

- 历史数据写入迁移。
- 成绩 key 改写。
- Slot owner 改写。

### 6.3 是否允许修改历史？

默认不允许。

仅在以下情况下考虑：

- 用户明确执行“迁移历史数据”操作。
- 有完整备份和回滚策略。
- 有明确的产品规则说明。

当前阶段禁止自动迁移历史比赛。

### 6.4 是否影响 scoreData？

任何影响 `scoreData` 的改动都必须单独评审。

必须确认：

- 是否改变 `scoresByPlayer` key。
- 是否改变 `scorePlayerId`.
- 是否影响历史成绩继承。
- 是否影响 LIVE 领先榜。
- 是否影响成绩卡。

## 7. 开发原则

- 身份升级只改变当前身份层。
- 联系人关系不迁移，只做 alias 查询兼容。
- 比赛快照不自动更新。
- 成绩事实不自动迁移。
- 所有跨层读取必须明确数据来源。
- 新功能优先使用快照，只有用户中心类页面才优先使用最新资料。
