# 球队域：仅测试环境部署（禁止生产）

本文件记录**测试环境**操作步骤与验收状态。仓库提交**不能**代替开发者工具上传云函数。任何「上传 / 部署」操作前必须先确认当前云环境是测试环境。

**禁止：** 把 `teamClub` 上传到生产环境 `cloud1-d5gluh1ode0ef8738`。

**禁止：** `git push`、给生产打 tag、修改 `TEAM_CLUB_RELEASE_DEPLOYED` 为 `true`（当前代码为 `false`）。

## 环境与路由（以代码为准）

来源：`miniprogram/utils/teamClub/cloudEnv.js`、`miniprogram/app.js`。

| 项 | 值 |
|---|---|
| 测试环境名称 | `golfbrothers-test` |
| 测试环境 ID | `golfbrothers-test-d1db3k1e6dcc39` |
| 生产环境 ID | `cloud1-d5gluh1ode0ef8738`（仅用于下方禁传警告） |
| `develop` / `trial` | **只**把 `teamClub` 与球队文件传到测试环境 |
| `release` | `TEAM_CLUB_RELEASE_DEPLOYED=false` → 返回「服务暂未开放」，**不**调用测试环境，也**不**调用生产 `teamClub` |
| 全局 `wx.cloud.init` | 仍指向生产环境，供海报抠图云函数 `segmentPortrait` 使用。**不要**为了球队去改全局 init |

脱敏写法：测试 `golfbrothers-test-****6dcc39`；生产 `cloud1-****ef8738`。日志只打脱敏 envId，不打 OPENID、明文邀请 token、昵称或头像。

## 事实状态（截至本地 HEAD `7b08e91`）

必须把**历史故障**和**当前结果**分开。代码在仓库里 ≠ 云端已是该提交；Node / 模拟器通过 ≠ A/B 真机通过。

### 已通过

- **本地代码与自动测试：** 球队云函数、客户端仓储、资料闭环、LOGO 独立云实例、邀请主包中转等已提交。本机 Node 自测（不连真实云）已跑过，只证明仓库逻辑。
- **测试环境控制台：** 人工在 `golfbrothers-test` 创建了 13 个集合（小程序端不可读写）和 12 个自定义索引。`indexes.json` 的 `createNow: false` 只表示禁止用仓库脚本自动建索引。
- **测试环境真云建档闭环已通过。** 历史故障：`profile_required` 仅显示「重试」；真云写入 `_id` 曾报 `-501007`。当前：用户已在测试环境完成资料，页面正常进入「暂未加入球队」空态。
- **测试环境单账号创建 / LOGO / 简称真机或预览验证通过。** 历史故障：LOGO 曾走全局 `cloud1`，并出现 `ECONNRESET`；展示层曾把 `cloud://` 换成默认图；简称曾按 UTF-16 错误截断。当前：LOGO 上传成功；创建后的列表、详情、重新编译恢复显示、四个汉字简称均正常。**不**表示 A/B 跨设备已通过。
- **原生分享卡片能在本机生成。** 开发者工具里的「虚拟好友」是模拟器行为，不是业务里的虚拟用户。

### 待复验（本地修复完成，真机复验待完成）

- 同事打开**旧的分包入口**卡片曾显示「页面不存在」。仓库已增加主包入口 `/pages/team-invite/index`，分享 path 为 `/pages/team-invite/index?token=`。
- **新预览包、新卡片由 B 再次打开，尚未得到通过结果。** 不得把「代码已改」写成「B 已能入队」。

### 未完成

- B 通过新主包分享入口接受邀请（含 token 冷启动、完善资料后回到原邀请）。
- 成员数与权限（超管 / 管理员 / 普通成员 / 非成员）。
- 退出 / 转让 / 解散。
- 双账号逐洞记分、同洞冲突、断网 outbox、清缓存后仅凭云端恢复。
- 生产环境部署与 `git push`。

下文「部署后 A/B 冒烟」是待办，不是已勾选结果。模拟器通过不算。

### 未知：云函数与仓库版本是否一致

- 测试环境**曾**人工上传过 `teamClub`，且建档 / LOGO 等真云调用已成功，说明当时上传的函数能完成这些路径。
- 仓库**无法确认**当前云端内容是否完整对应最新云函数提交 `02a9e72`。分享相关新增 action 是否已随该版本上传，也不能凭本地代码推断。
- 状态写成：**当前版本一致性待人工确认**。不要写成「仅首次上传、之后再没传」，也不要写成「最新已部署」。
- 核对办法：打开开发者工具，对照 `golfbrothers-test` 上 `teamClub` 的版本时间与仓库 `02a9e72` 之后是否还有未上传的 `cloudfunctions/teamClub/**` 改动。

### 客户端 vs 云函数（操作区分）

| 改动类型 | 示例 | 需要做什么 |
|---|---|---|
| 仅客户端 | 主包 `pages/team-invite`、资料页文案、LOGO 独立 `wx.cloud.Cloud({ resourceEnv })`、删除无效 `enableShareAppMessage` | 开发者工具**重新编译**开发版 / 体验版。不上传云函数 |
| 云函数 / 集合契约 | `cloudfunctions/teamClub/**`、邀请 tokenHash、`createMyProfile`、资产签发、分享相关 action | 仅在确认环境为 `golfbrothers-test` 后 **上传并部署：云端安装依赖** |
| 全局抠图 | `segmentPortrait` | **不要**随球队改全局环境 |

### 从未进行

- 生产环境创建球队集合或索引。
- 向 `cloud1-d5gluh1ode0ef8738` 上传 `teamClub`。
- `git push`、设置 upstream、打 tag。
- 将 `TEAM_CLUB_RELEASE_DEPLOYED` 改为 `true`。

## 完整集合（13）

空集合即可。客户端**禁止** `wx.cloud.database` 直写；只允许 `wx.cloud.callFunction({ name: 'teamClub' })`。

职责：

| 集合 | 职责 |
|---|---|
| `team_clubs` | 球队主档 |
| `team_members` | 成员关系；确定性 `_id` = `teamId__userId` |
| `team_applications` | 入队申请 |
| `team_application_locks` | pending 防重锁；`_id` = `pending__teamId__userId` |
| `team_invites` | 邀请；库内只存 `tokenHash`，不存明文 token |
| `team_notices` | 站内通知 |
| `team_audits` | 审计 |
| `team_club_migrations` | 迁移记录 |
| `team_club_idempotency` | 幂等键 |
| `user_profiles` | 用户建档；身份 `_id` = `userId`，`openidHash` 唯一 |
| `team_matches` | **比赛权威正文**：配置、分组、参赛者、状态、从分片派生的摘要。`version` 随配置/完赛变化，不因逐洞记分上涨 |
| `team_match_scores` | **成绩权威分片**：逐洞/逐实体与推杆。`_id` = `matchId__roundId__hole__entityKind__entityId` |
| `team_match_refs` | **只读派生列表摘要**，由写入 `team_matches` 时同步，不能当写权威 |

确定性 `_id`（无声明式唯一约束时用事务保证）：

- 球队 `_id` = `teamId`
- 成员 `_id` = `teamId__userId`
- pending 锁 `_id` = `pending__teamId__userId`
- 比赛 `_id` = `matchId`
- 成绩分片 `_id` = `matchId__roundId__hole__entityKind__entityId`

## 自定义索引（12）

字段顺序必须与同目录 `indexes.json`、以及云函数真实 `where + orderBy` 一致。不要为不存在的查询再建索引。

精确成员走 `_id = teamId__userId`；pending 唯一走 `team_application_locks`；比赛 / 档案 / 成绩分片 / `team_match_refs` 主键走确定性 `_id`（故 `team_match_refs` **没有**自定义索引）。

用户搜索只支持精确 `userId` 与标准化 `searchKey` **前缀**，不支持全库 contains。

| 集合 | 索引名 | 类型 | 字段顺序 | 对应查询 |
|---|---|---|---|---|
| team_members | idx_members_team_status_joined | 普通 | teamId asc, memberStatus asc, joinedAt desc, _id desc | listMembers |
| team_members | idx_members_team_status_search | 普通 | teamId asc, memberStatus asc, searchKey asc, _id asc | listMembers 前缀搜 |
| team_members | idx_members_user_status_joined | 普通 | userId asc, memberStatus asc, joinedAt desc, _id desc | listMyTeams |
| team_applications | idx_apps_team_status_created | 普通 | teamId asc, status asc, createdAt desc, _id desc | listApplications |
| team_applications | idx_apps_team_user_created | 普通 | teamId asc, userId asc, createdAt desc, _id desc | getTeam.viewerApplication |
| team_invites | uniq_invites_tokenHash | 唯一 | tokenHash asc | 邀请 token 查找 |
| team_invites | idx_invites_team_status_created | 普通 | teamId asc, status asc, createdAt desc, _id desc | listInvites |
| team_notices | idx_notices_recipient_created | 普通 | recipientUserId asc, createdAt desc, _id desc | listNotices |
| team_matches | idx_matches_team_updated | 普通 | teamId asc, updatedAt desc, _id desc | listTeamMatches |
| team_match_scores | idx_scores_match_id | 普通 | matchId asc, _id asc | 成绩分片分页组装 |
| user_profiles | uniq_profiles_openidHash | 唯一 | openidHash asc | openidHash 唯一（身份用 `_id=userId`） |
| user_profiles | idx_profiles_searchKey | 普通 | searchKey asc, _id asc | searchUsers 前缀 |

列表均带稳定 cursor（排序字段 + `_id`），单页默认 50、最大 100；成绩分片可连续翻页直到 `hasMore=false`。

## 客户端能力（实现要点；验收见上文四类状态）

- **用户建档：** 无档案返回 `profile_required`；主按钮「完善资料」，走现有资料页后 `createMyProfile`。云端身份只认上下文 OPENID，客户端不得指定 `userId`。测试环境真云建档闭环已通过。
- **LOGO 上传：** 使用 `cloudEnv.js` 解析出的测试环境独立云实例；失败时只展示脱敏 errCode / envName / 脱敏 envId。不要改全局 init。单账号创建 / LOGO / 简称已在测试环境验证通过。
- **微信邀请：** 分享 path 为 `/pages/team-invite/index?token=`（主包中转），再 `redirectTo` 分包落地页。丢失 token 时不得改道首页。卡片能生成本地已确认；B 用新卡片打开仍待复验。

## 若需再次上传云函数（仅测试环境）

1. 打开开发者工具云开发面板，**打印**当前环境名称与完整环境 ID。
2. 必须同时满足：名称 = `golfbrothers-test`，ID = `golfbrothers-test-d1db3k1e6dcc39`。若看到 `cloud1-d5gluh1ode0ef8738` 或名称不像测试环境：**立即停止，不要点上传。**
3. 打开 `cloudfunctions/teamClub`。
4. 右键 **上传并部署：云端安装依赖**（不要用本地 `node_modules` 冒充）。
5. 依赖须含 `wx-server-sdk`；超时 60s（`config.json`）。
6. **不要**把密钥、测试账号资料、明文 token 写进云函数目录或日志。

## 权限

集合对小程序端关闭任意写。客户端只 `callFunction({ name: 'teamClub' })`。球队调用必须带 `cloudEnv.js` 给出的测试 `env`；全局生产 init 只给 `segmentPortrait`。

## 部署后 A/B 冒烟（待办；缺一则不能宣称验收完成）

需要两个真实微信账号、两台真机或至少两套登录态。模拟器通过不算。

1. A、B 建立正式 profile
2. A 创建球队  
3. A 生成邀请，B 从分享卡片打开主包中转页并申请加入
4. A 或管理员审批 B  
5. B 成为普通成员  
6. A 创建队内赛，A/B 均能看到  
7. B 记录自己或授权组合成绩  
8. A 刷新看到 B 的成绩  
9. A、B 同时记不同洞均成功  
10. 同洞冲突：后提交者明确提示并显示云端最新值  
11. 断网记分，恢复后 outbox 同步  
12. A 退出再登录未同步成绩仍在；B 登录看不到 A 的 outbox  
13. 清本地缓存后仅凭云端打开球队和完整比赛  
14. B 退出球队后只能看有权历史，看不到退出后的新比赛  
15. 转让超管、普通成员退出、解散  
16. 解散后不能新建比赛，合法历史仍可查看  

失败时：不回落本地 repository；不改生产数据；保留 requestId 与脱敏错误码；不输出 OPENID / 邀请明文 / 敏感资料。

## 回滚

- 云函数：仅在 **`golfbrothers-test`** 控制台回退上一版本。不要在生产环境执行回退。
- 数据：不要用删集合作为常规回滚。

## 本机测试（不连真实云，不能代替真机）

```
ELECTRON_RUN_AS_NODE=1 <Cursor.exe> scripts/teamClub.cloud.selftest.js
ELECTRON_RUN_AS_NODE=1 <Cursor.exe> scripts/teamClub.phase3.selftest.js
ELECTRON_RUN_AS_NODE=1 <Cursor.exe> scripts/teamClub.phase4.selftest.js
ELECTRON_RUN_AS_NODE=1 <Cursor.exe> scripts/teamClub.phase5.selftest.js
ELECTRON_RUN_AS_NODE=1 <Cursor.exe> scripts/teamClub.outbox.selftest.js
ELECTRON_RUN_AS_NODE=1 <Cursor.exe> scripts/teamClub.paging.selftest.js
ELECTRON_RUN_AS_NODE=1 <Cursor.exe> scripts/teamClub.profile.selftest.js
ELECTRON_RUN_AS_NODE=1 <Cursor.exe> scripts/teamClub.share.selftest.js
ELECTRON_RUN_AS_NODE=1 <Cursor.exe> scripts/teamInviteSharePath.selftest.js
ELECTRON_RUN_AS_NODE=1 <Cursor.exe> scripts/myTeams.selftest.js
```
