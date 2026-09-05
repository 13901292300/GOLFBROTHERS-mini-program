# teamClub 云函数

单一入口云函数，处理球队域全部读写。客户端禁止使用 `wx.cloud.database` 写下列集合。

## 身份

1. `cloud.getWXContext().OPENID` 为唯一可信身份。
2. `user_profiles.openidHash` 映射到正式 `userId`（`u_` + 摘要，不是 OPENID 原文）。
3. 无档案返回 `profile_required`。调用 `createMyProfile` 建档。
4. 请求体中的 `userId` / `role` / `ownerUserId` 一律丢弃。

## 领域拆分（`lib/`）

- identity：OPENID → 档案
- teams / members / applications / invites / notices / audit / migration / permissions：均在 `engine.js` 事务内执行

## 集合

见 `indexes.json` 与 `DEPLOY.md`。

## 邀请

云端只存 `tokenHash`。明文 token 仅在 `createInvite` 成功时返回一次。`resolveInvite` 校验 token，**不自动入队**；入队仍走申请审批。

## 客户端

`miniprogram/utils/teamClub/repoFactory.js` 默认 `cloud`。仅 `USE_LOCAL_REPOSITORY` 或 `global.__TEAM_CLUB_REPO_MODE='local'` 使用本地仓储。云失败返回 `network_error` / `service_unavailable`，不合并 `gb_team_club_v1`。
