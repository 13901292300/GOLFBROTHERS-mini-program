# 球队域：仅测试环境部署（禁止生产）

本仓库**不能**代替微信开发者工具上传云函数和建集合。下列步骤必须在已登录该小程序的开发者工具 / 云开发控制台中由人工完成。

## 部署前必须打印并人工核对

在开发者工具「云开发」面板抄录后与下表比对。**任何一项无法确认「不是生产」则立即停止。**

| 项 | 仓库记录 | 人工核对 |
|---|---|---|
| 云环境 ID | `cloud1-d5gluh1ode0ef8738`（见 `app.js` / `project.config.json` `cloudbaseEnv`） | 控制台完整 ID 是否一致 |
| 环境名称 | **仓库无法得知**，必须看控制台显示名 | 须含测试 / test / 开发 等标识 |
| 是否生产 | 未知 | 名称或标签若像正式/生产/prod/live，**停止** |
| 云函数名 | `teamClub` | 仅上传此函数 |
| 集合 | 见下文完整清单 | 全部新建或确认已存在 |

脱敏标识建议：`cloud1-****ef8738`（保留前缀与末 6 位）。

## 完整集合（此前均未部署，按最终 schema 一次建齐）

空集合即可，客户端**禁止**直写；只允许云函数 `teamClub` 读写。

- `team_clubs`
- `team_members`
- `team_applications`
- `team_invites`
- `team_notices`
- `team_audits`
- `team_club_migrations`
- `team_club_idempotency`
- `team_application_locks`
- `user_profiles`
- `team_matches`
- `team_match_refs`
- `team_match_scores`

确定性 `_id`（无声明式唯一约束时用事务保证）：

- 球队 `_id` = `teamId`
- 成员 `_id` = `teamId__userId`
- pending 锁 `_id` = `pending__teamId__userId`
- 比赛 `_id` = `matchId`
- 成绩分片 `_id` = `matchId__roundId__hole__entityKind__entityId`

## 索引

按同目录 `indexes.json` 在控制台添加。缺索引时查询可能变慢或全表扫描告警。

## 上传云函数（测试环境）

1. 确认当前云环境就是上表核过的测试环境。
2. 打开 `cloudfunctions/teamClub`。
3. 右键 **上传并部署：云端安装依赖**（不要用本地 node_modules 冒充）。
4. 依赖须含 `wx-server-sdk`；超时 60s（`config.json`）。
5. 确认云函数能读到可信 `OPENID`（`cloud.getWXContext()`，客户端 userId 不可信）。
6. **不要**上传真实 token、测试用户 OPENID、密钥；日志已脱敏 token/openid/phone。

## 权限

集合对小程序端关闭任意写。客户端只 `wx.cloud.callFunction({ name: 'teamClub' })`。

## 部署后 A/B 冒烟（缺一则停止后续操作）

1. A、B 建立正式 profile  
2. A 创建球队  
3. A 生成邀请，B 申请加入  
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

失败时：不回落本地 repository；不改生产数据；保留日志 requestId 与脱敏错误码；不输出 OPENID / 邀请明文 / 敏感资料。

## 回滚

- 云函数：控制台回退上一版本  
- 数据：不要用删集合作为常规回滚  

## 本机测试（不连真实云）

```
ELECTRON_RUN_AS_NODE=1 <Cursor.exe> scripts/teamClub.cloud.selftest.js
ELECTRON_RUN_AS_NODE=1 <Cursor.exe> scripts/teamClub.phase3.selftest.js
ELECTRON_RUN_AS_NODE=1 <Cursor.exe> scripts/teamClub.phase4.selftest.js
ELECTRON_RUN_AS_NODE=1 <Cursor.exe> scripts/teamClub.phase5.selftest.js
ELECTRON_RUN_AS_NODE=1 <Cursor.exe> scripts/teamClub.outbox.selftest.js
ELECTRON_RUN_AS_NODE=1 <Cursor.exe> scripts/myTeams.selftest.js
```
