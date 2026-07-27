# GOLFBROTHERS 后端开发交接文档 V1.0

## 文档目的

本文档用于指导 GOLFBROTHERS 微信小程序后端服务建设。

目标：

将当前小程序本地数据模型逐步迁移至服务端，实现：

- 用户体系
- 球队体系
- 球队赛事
- 报名管理
- 分组管理
- 记分系统
- 日程系统

的服务化。

---

# 1. 产品核心定位

## 产品名称

GOLFBROTHERS（高尔夫江湖）

## 产品定位

陪伴高尔夫用户长期成长的社区型产品。

核心对象：

- 球友
- 球队
- 球队赛事
- 日常球局
- 成绩沉淀

---

# 2. 系统总体架构

业务关系：

```
User（用户） | | +----------------+ |                |Team           Schedule | |Team Match（球队赛事） | +----------------+ |Register（报名） |Group（分组） |Score（成绩）
```

---

# 3. 用户体系 User

## 3.1 用户唯一标识

所有业务必须使用：

```
userId
```

作为唯一业务 ID。

禁止使用：

- nickname
- 手机号
- avatar
- 微信昵称
- openid

作为业务关联键。

---

## 3.2 用户基础模型

```
{  "userId": "u_10001",  "nickname": "Tiger",  "avatar": "",  "gender": "male",  "phone": "",  "createdAt": 0,  "updatedAt": 0
}
```

---

# 4. 球队 Team

## 4.1 Team 基础模型

```
{  "teamId": "team_001",  "name": "XX球队",  "avatar": "",  "creatorId": "u_10001",  "createdAt": 0,  "updatedAt": 0
}
```

---

## 4.2 球队成员

建议独立表：

TeamMember

结构：

```
{ "teamId":"team_001", "userId":"u_10001", "role":"member", "joinedAt":0
}
```

---

# 5. 球队赛事 Team Match

## 5.1 核心模型

球队赛事是当前重点业务。

```
{ "matchId":"tm_001", "teamId":"team_001", "title":"周末队内赛", "courseName":"XXX球场", "teeTime":"2026-08-10 08:30", "status":"registering", "createdBy":"u_10001", "createdAt":0, "updatedAt":0
}
```

---

## 5.2 比赛状态

当前：

```
registering
```

报名中

```
ongoing
```

比赛进行中

```
finished
```

比赛结束

---

# 6. 比赛赛制模型

当前支持 G1-G8。

## 6.1 比杆赛

| 编号  | 名称      |
| --- | ------- |
| G1  | 个人比杆赛   |
| G2  | 最好成绩比杆赛 |
| G3  | 最佳球位比杆赛 |
| G4  | 四人两球比杆赛 |

---

## 6.2 比洞赛

| 编号  | 名称      |
| --- | ------- |
| G5  | 个人比洞赛   |
| G6  | 最好成绩比洞赛 |
| G7  | 最佳球位比洞赛 |
| G8  | 四人两球比洞赛 |

---

建议数据库不要把赛制写死。

推荐：

```
{ "scoringMode":"stroke", "format":"best_ball"
}
```

例如：

比杆：

```
scoringMode = stroke
```

比洞：

```
scoringMode = match
```

---

# 7. 报名 Register

## 7.1 原则

报名和出场分组不是同一个概念。

报名：

表示：

> 用户参加该赛事。

分组：

表示：

> 用户实际进入哪一组。

---

## 7.2 报名结构

```
{ "matchId":"tm_001", "userId":"u_10001", "registeredAt":0
}
```

---

## 7.3 报名用户来源

权威来源：

```
registerInfo.users
```

不是：

```
groups.players
```

---

# 8. 分组 Group

## 8.1 分组模型

```
{"groupId":"g_001","matchId":"tm_001","players":[ {   "userId":"u_10001",   "tPosition":"BLUE_T"
 }]}
```

---

## 8.2 T台规则

统一字段：

```
tPosition
```

取值：

```
BLUE_TRED_T
```

优先级：

```
player.tPosition↓player.tee↓gender默认
```

---

# 9. 成绩 Score

## 9.1 当前成绩模型

采用：

Gross First

用户录入：

总杆。

不是：

差点。

---

## 9.2 Score结构

```
{"scoreId":"s001","matchId":"tm001","groupId":"g001","userId":"u001","holes":[ {  "hole":1,  "score":5,  "putts":2
 }]}
```

---

# 10. 比洞赛成绩

增加：

```
{"holeResults":[ {  "hole":1,  "winner":"u001"

 }]}
```

---

结果：

支持：

- UP
- DN
- TIED
- 7&5
- FINAL

等状态。

---

# 11. 日程 Schedule（重点）

## 11.1 产品理念

日程不是任务管理。

不是共享日历。

规则：

> 每个人拥有自己的日历记录。

---

# 11.2 Schedule模型

```
{"scheduleId":"sch001","ownerId":"u001","type":"manual","sourceType":"self","sourceId":"","date":"2026-07-30","content":"下午练球","members":[ { "userId":"u002", "name":"", "avatar":""
 }],"createdAt":0,"updatedAt":0
}
```

---

# 12. 日程来源类型

## self

用户自己创建。

---

## friend_reminder

提醒好友。

例如：

A 创建：

```
打球
```

提醒：

B、C

后台生成：

A：

```
sourceType=selfownerId=A
```

B：

```
sourceType=friend_reminderownerId=BsourceUserId=A
```

C：

同理。

---

## team_match

球队赛事自动生成。

---

# 13. 球队赛事进入日程规则

只有：

```
team_match
```

进入日程。

普通球局：

不进入。

---

报名成功：

生成：

```
{"ownerId":"报名用户","sourceType":"team_match","sourceId":"matchId"
}
```

---

取消报名：

删除：

```
ownerId + sourceId
```

---

取消比赛：

删除：

```
sourceId=matchId
```

全部赛事日程。

---

# 14. API建议

## 用户

```
GET /users/{id}POST /users
```

---

## 球队

```
GET /teamsPOST /teamsGET /teams/{id}
```

---

## 赛事

```
POST /matchesGET /matches/{id}PUT /matches/{id}DELETE /matches/{id}
```

---

## 报名

```
POST /matches/{id}/registerDELETE /matches/{id}/register/{userId}
```

---

## 日程

```
GET /schedulesGET /schedules?date=2026-07-30POST /schedulesPUT /schedules/{id}DELETE /schedules/{id}
```

---

# 15. 后端开发注意事项

## 必须：

1. 所有业务关联使用 userId。
2. 报名和分组分离。
3. 成绩不可覆盖历史。
4. 日程 reminder 为独立记录。
5. 不要删除用户历史数据。

---

# 16. 当前前端待迁移模块

| 模块  | 状态  |
| --- | --- |
| 用户  | 本地  |
| 球队  | 本地  |
| 赛事  | 本地  |
| 报名  | 本地  |
| 分组  | 本地  |
| 成绩  | 本地  |
| 日程  | 本地  |

---

# 下一步建议

后端开发顺序：

## Phase 1（基础）

1. 用户表
2. 球队表
3. 球队成员表

## Phase 2（赛事）

4. Team Match
5. Register
6. Group

## Phase 3（核心体验）

7. Score
8. Schedule

---

这版可以作为第一份交接底稿。

下一步我建议继续补两份附件：

1. **《GOLFBROTHERS 数据库 ER 图说明》**  
   （方便后端建表）
2. **《前端 Storage → 后端 API 字段映射表》**  
   （迁移时最有价值，避免接口设计偏离现有小程序）

这两份比继续扩充文字更适合给工程师执行。



# 附件一：《GOLFBROTHERS 数据库 ER 关系说明 V1.0》

## 1. 总体 ER 关系

核心实体：

```
User（用户） | |1:N |TeamMember（球队成员） | |N:1 |Team（球队） | |1:N |TeamMatch（球队赛事） | +----------------+ |                | |                |Register        Group报名表           分组表                  |                  |                Score                成绩User | |1:N |Schedule日程
```

---

# 2. User 用户表

## 表名建议

```
users
```

---

## 字段

| 字段         | 类型       | 说明       |
| ---------- | -------- | -------- |
| id         | bigint   | 数据库主键    |
| user_id    | varchar  | 业务ID     |
| nickname   | varchar  | 昵称       |
| avatar     | varchar  | 头像       |
| gender     | varchar  | 性别       |
| phone      | varchar  | 手机号      |
| openid     | varchar  | 微信openid |
| created_at | datetime | 创建时间     |
| updated_at | datetime | 更新时间     |

---

## 索引

必须：

```
unique(user_id)
```

建议：

```
index(phone)index(openid)
```

---

# 3. Team 球队表

## 表名

```
teams
```

---

字段：

| 字段         | 说明   |
| ---------- | ---- |
| team_id    | 业务ID |
| name       | 球队名称 |
| avatar     | 球队头像 |
| creator_id | 创建人  |
| created_at |      |
| updated_at |      |

---

关系：

```
User |creator_id |Team
```

---

# 4. TeamMember 球队成员表

## 表名

```
team_members
```

---

字段：

| 字段        | 说明   |
| --------- | ---- |
| team_id   | 球队   |
| user_id   | 成员   |
| role      | 角色   |
| joined_at | 加入时间 |

---

关系：

```
Team 1:N TeamMember N:1 User
```

---

角色：

初期：

```
memberadmin
```

未来：

```
captaincoachmanager
```

---

# 5. TeamMatch 球队赛事表

## 表名

```
team_matches
```

---

字段：

| 字段           | 说明   |
| ------------ | ---- |
| match_id     | 赛事ID |
| team_id      | 所属球队 |
| title        | 赛事名称 |
| course_name  | 球场   |
| tee_time     | 开球时间 |
| status       | 状态   |
| scoring_mode | 计分模式 |
| format       | 赛制格式 |
| created_by   | 创建人  |
| created_at   |      |
| updated_at   |      |

---

## status

枚举：

```
registeringongoingfinishedcancelled
```

说明：

虽然当前前端取消赛事是删除，但后端建议保留：

```
cancelled
```

原因：

历史数据、统计、审计需要。

---

# 6. Match Register 报名表

## 表名

```
match_registers
```

---

字段：

| 字段            | 说明   |
| ------------- | ---- |
| id            | 主键   |
| match_id      | 赛事   |
| user_id       | 报名人  |
| registered_at | 报名时间 |

---

唯一约束：

```
(match_id,user_id)
```

防止重复报名。

---

关系：

```
User | |Register | |TeamMatch
```

---

# 7. Match Group 分组表

## 表名

```
match_groups
```

---

字段：

| 字段         | 说明   |
| ---------- | ---- |
| group_id   | 组ID  |
| match_id   | 赛事   |
| group_name | 组名   |
| tee_time   | 开球时间 |
| start_hole | 起始洞  |
| created_at |      |

---

# 8. Group Player 分组球员表

## 表名

```
match_group_players
```

---

字段：

| 字段         | 说明  |
| ---------- | --- |
| group_id   | 组   |
| user_id    | 球员  |
| position   | 位置  |
| t_position | T台  |

---

例如：

```
{"user_id":"u001","t_position":"BLUE_T"
}
```

---

# 9. Score 成绩表

## 表名

```
scores
```

---

字段：

| 字段         | 说明     |
| ---------- | ------ |
| score_id   | 成绩ID   |
| match_id   | 赛事     |
| group_id   | 组      |
| user_id    | 球员     |
| hole_data  | 逐洞JSON |
| created_at |        |
| updated_at |        |

---

## hole_data

建议 JSON：

```
[ {  "hole":1,  "score":5,  "putts":2
 }, {  "hole":2,  "score":4,  "putts":1
 }]
```

---

# 10. Match Play 比洞结果表

## 表名

```
match_hole_results
```

---

字段：

| 字段        | 说明  |
| --------- | --- |
| match_id  | 赛事  |
| group_id  | 组   |
| hole      | 洞号  |
| winner_id | 胜者  |
| result    | 结果  |

---

result：

```
WINTIED
```

---

# 11. Schedule 日程表

## 表名

```
schedules
```

---

字段：

| 字段             | 说明    |
| -------------- | ----- |
| schedule_id    | 日程ID  |
| owner_id       | 拥有者   |
| type           | 类型    |
| source_type    | 来源    |
| source_id      | 来源ID  |
| source_user_id | 提醒来源人 |
| date           | 日期    |
| content        | 内容    |
| created_at     |       |
| updated_at     |       |

---

## source_type

枚举：

```
selffriend_reminderteam_match
```

---

# 12. Schedule Member（可选）

目前前端：

members:

```
[ { "userId":"", "name":"", "avatar":""
 }]
```

后端建议拆表。

## 表：

```
schedule_members
```

字段：

| 字段          | 说明   |
| ----------- | ---- |
| schedule_id | 日程   |
| user_id     | 提醒对象 |

---

原因：

未来：

- 好友关系
- 通知状态
- 已读状态

都会扩展。

---

# 13. 推荐数据库最终关系图

```
              User                |       +--------+---------+       |                  |     Team            Schedule       | TeamMember       |       |   TeamMatch       | +-----+------+ |            |Register    Group              |          GroupPlayer              |            Score
```

---

---

# 附件二：《前端 Storage → 后端 API 字段迁移映射表 V1.0》

## 1. 用户模块

当前：

```
gameStore
```

未来：

```
users API
```

---

映射：

| 前端       | 后端       |
| -------- | -------- |
| userId   | user_id  |
| nickname | nickname |
| avatar   | avatar   |
| gender   | gender   |

---

# 2. 球队赛事

当前：

```
gb_team_matches_v1
```

未来：

```
team_matches
```

---

映射：

| 前端         | 后端          |
| ---------- | ----------- |
| matchId    | match_id    |
| teamId     | team_id     |
| roundName  | title       |
| courseName | course_name |
| teeTime    | tee_time    |
| status     | status      |
| createdBy  | created_by  |

---

# 3. 报名

当前：

```
registerInfo.users
```

迁移：

```
match_registers
```

---

当前：

```
{"userId":"10001"
}
```

转换：

```
match_registers.user_id
```

---

# 4. 分组

当前：

```
groups:[ { players:[] }]
```

迁移：

拆成：

```
match_groups+match_group_players
```

---

# 5. 成绩

当前：

```
scoreData
```

迁移：

```
scores
```

---

字段：

| 前端             | 后端        |
| -------------- | --------- |
| scoresByPlayer | user_id   |
| scores[]       | hole_data |
| putts[]        | hole_data |

---

# 6. 日程

当前：

```
gb_schedule_v1
```

迁移：

```
schedules
```

---

映射：

| 前端         | 后端               |
| ---------- | ---------------- |
| id         | schedule_id      |
| ownerId    | owner_id         |
| sourceType | source_type      |
| sourceId   | source_id        |
| date       | date             |
| content    | content          |
| members    | schedule_members |

---

# 7. 当前暂不迁移数据

以下暂不作为后端一期：

## 普通球局 Game

原因：

目前定位：

即时创建。

流程：

```
创建↓打球↓结束
```

不需要赛事级生命周期。

---

## 临时 UI 状态

例如：

- 当前 TAB
- 弹窗状态
- 页面滚动位置

不进入数据库。

---

# 8. 后端开发优先级建议

## 第一阶段（必须）

### 用户

```
users
```

### 球队

```
teamsteam_members
```

---

## 第二阶段

### 球队赛事

```
team_matchesmatch_registersmatch_groupsmatch_group_players
```

---

## 第三阶段

### 成绩

```
scoresmatch_hole_results
```

---

## 第四阶段

### 日程

```
schedulesschedule_members
```

---

# 9. 前后端联调建议

不要一次替换所有 storage。

建议：

阶段性：

```
前端↓API Adapter↓后端
```

例如：

现在：

```
teamMatchStore.getMatch()
```

未来：

```
teamMatchApi.getMatch()
```

中间保留 adapter。

这样不会影响已经完成的 G1-G8。

---

这两份附件补完后，你的同事基本可以开始：

1. 建数据库；
2. 设计 API；
3. 开接口文档；
4. 和小程序逐模块替换。

下一步我建议再补一份更实用的：

**《GOLFBROTHERS API 接口详细定义（请求/响应 JSON 示例）》**

这个会直接给后端写接口用，也方便以后你自己验收接口。



# 附件三：《GOLFBROTHERS API 接口详细定义 V1.0》

（请求 / 响应 JSON 示例）

> 说明：  
> 本文不是最终 Swagger 文档，而是前后端第一版联调约定。
> 
> 原则：
> 
> 1. 所有业务对象返回业务 ID（userId、matchId 等）。
> 2. 不直接暴露数据库自增 ID。
> 3. 时间统一 ISO 或 `YYYY-MM-DD HH:mm:ss`。
> 4. 列表接口统一分页能力预留。
> 5. 保留未来微信小程序实时同步能力。

---

# 一、通用规范

## 1. API 基础路径

示例：

```
/api/v1
```

---

## 2. 通用响应结构

成功：

```
{  "code":0,  "message":"success",  "data":{}}
```

失败：

```
{  "code":10001,  "message":"参数错误",  "data":null
}
```

---

# 二、用户 API

---

# 2.1 获取当前用户

## GET

```
/users/me
```

---

## Response

```
{  "code":0,  "data":{    "userId":"u_10001",    "nickname":"Tiger",    "avatar":"https://xxx",    "gender":"male",    "phone":"138xxxx",    "createdAt":"2026-01-01 10:00:00"

  }}
```

---

# 2.2 查询用户

## GET

```
/users/{userId}
```

---

用途：

- 好友展示
- 球队成员展示
- 报名名单

---

# 三、球队 API

---

# 3.1 创建球队

## POST

```
/teams
```

---

Request：

```
{ "name":"深圳高尔夫球队", "avatar":"", "creatorId":"u_10001"
}
```

---

Response：

```
{ "teamId":"team_001", "name":"深圳高尔夫球队", "creatorId":"u_10001"
}
```

---

# 3.2 获取球队详情

## GET

```
/teams/{teamId}
```

---

Response：

```
{ "teamId":"team_001", "name":"深圳高尔夫球队", "members":[   {    "userId":"u_10001",    "nickname":"Tiger",    "role":"admin"
   } ]}
```

---

# 四、球队赛事 API（核心）

---

# 4.1 创建球队赛事

## POST

```
/matches
```

---

Request：

```
{ "teamId":"team_001", "title":"2026夏季队内赛", "courseName":"XX球场", "teeTime":"2026-08-10 08:30:00", "scoringMode":"stroke", "format":"individual", "createdBy":"u_10001"
}
```

---

Response：

```
{ "matchId":"tm_001", "status":"registering"
}
```

---

# 4.2 获取赛事详情

## GET

```
/matches/{matchId}
```

---

Response：

```
{"matchId":"tm_001","title":"周末队内赛","courseName":"XX球场","teeTime":"2026-08-10 08:30","status":"registering","scoringMode":"match","format":"best_ball","registerUsers":[ {  "userId":"u_10001",  "nickname":"Tiger"
 }]}
```

---

# 4.3 修改赛事

## PUT

```
/matches/{matchId}
```

---

允许修改：

- 标题
- 球场
- 时间
- 赛制（需校验）
- 分队

---

不建议允许：

比赛开始后修改核心字段。

---

# 4.4 取消赛事

## DELETE

```
/matches/{matchId}
```

---

后端建议：

不要物理删除。

改：

```
{"status":"cancelled"
}
```

---

原因：

后续：

- 成绩统计
- 历史记录
- 用户数据

需要保留。

---

# 五、报名 API

---

# 5.1 报名

## POST

```
/matches/{matchId}/register
```

---

Request：

```
{ "userId":"u_10001"
}
```

---

Response：

```
{ "success":true, "registerAt": "2026-08-01 12:00:00"
}
```

---

后台同时触发：

创建日程：

```
{ "ownerId":"u_10001", "sourceType":"team_match", "sourceId":"tm_001"
}
```

---

# 5.2 取消报名

## DELETE

```
/matches/{matchId}/register/{userId}
```

---

后台：

1. 删除报名关系
2. 删除该用户赛事日程

---

# 六、分组 API

---

# 6.1 保存分组

## POST

```
/matches/{matchId}/groups
```

---

Request：

```
{"groups":[ {  "groupName":"A组",  "teeTime":"08:30",  "players":[   {    "userId":"u001",    "tPosition":"BLUE_T"
   },   {    "userId":"u002",    "tPosition":"RED_T"
   }  ] }]}
```

---

Response：

```
{"success":true
}
```

---

# 七、成绩 API

---

# 7.1 保存成绩

## POST

```
/matches/{matchId}/scores
```

---

Request：

```
{"groupId":"g001","userId":"u001","holes":[ {  "hole":1,  "score":5,  "putts":2
 }, {  "hole":2,  "score":4,  "putts":1
 }]}
```

---

# 7.2 查询成绩

## GET

```
/matches/{matchId}/scores
```

---

Response：

```
{"leaderboard":[ { "userId":"u001", "gross":72, "toPar":0

 }]}
```

---

# 八、日程 API（重点）

---

# 8.1 获取日程

## GET

```
/schedules
```

参数：

```
date=2026-07-30
```

---

Response：

```
{"list":[ { "scheduleId":"sch001", "ownerId":"u001", "sourceType":"self", "date":"2026-07-30", "content":"下午练球"

 }]}
```

---

注意：

返回结果必须默认：

```
ownerId = 当前登录用户
```

不能返回其他用户的 friend_reminder。

---

# 8.2 创建手工日程

## POST

```
/schedules
```

---

Request：

```
{"date":"2026-07-30","content":"下午练球","members":[ {  "userId":"u002"
 }]}
```

---

后台生成：

记录1：

```
{"ownerId":"u001","sourceType":"self"
}
```

---

记录2：

```
{"ownerId":"u002","sourceType":"friend_reminder","sourceUserId":"u001"
}
```

---

# 8.3 修改日程

## PUT

```
/schedules/{scheduleId}
```

---

注意：

修改：

只修改自己的记录。

不自动同步其他人的 reminder。

符合当前产品设计。

---

# 8.4 删除日程

## DELETE

```
/schedules/{scheduleId}
```

---

规则：

删除当前 owner 的记录。

不影响其他人。

---

# 九、未来接口预留

以下当前不实现，但建议数据库预留：

---

## 通知系统

未来：

```
notifications
```

用途：

- 日程提醒
- 比赛通知
- 评论提醒

---

## 好友关系

未来：

```
friendships
```

用于：

- 添加提醒人
- 社区互动

---

## 文件资源

未来：

```
media_files
```

用于：

- 球场图片
- 用户头像
- 赛事照片

---

# 十、接口开发优先顺序建议

## Sprint 1

用户：

```
users
```

球队：

```
teamsteam_members
```

---

## Sprint 2

赛事：

```
team_matchesmatch_registersmatch_groups
```

---

## Sprint 3

成绩：

```
scoresleaderboard
```

---

## Sprint 4

日程：

```
schedulesschedule_members
```

---

# 十一、前后端联调原则

当前小程序已经有大量业务逻辑。

不建议：

直接替换 store。

推荐：

增加 API Adapter：

例如：

当前：

```
teamMatchStore.getMatchById()
```

未来：

```
teamMatchApi.getMatchById()
```

中间：

```
teamMatchAdapter.normalize()
```

保证：

前端页面无需大规模重写。

---

到这里，给后端同事的核心资料已经有三层：

1. **开发交接说明**
   - 理解产品和规则
2. **数据库 ER + 字段映射**
   - 建表
3. **API 请求响应定义**
   - 开接口

下一份建议补的是：

**附件四：《GOLFBROTHERS 前端数据模型 JSON 示例库》**

这个非常重要，因为你现在前端的 G1-G8、T台、scoreEntity、日程模型已经比较复杂，后端只看表结构仍然容易误解。这个附件相当于“真实业务数据样本”。



这份会更贴近你的项目实际，因为后端工程师最容易犯的问题不是不会建表，而是**不了解真实业务对象长什么样**。

例如：

- 报名用户 ≠ 出场用户；
- 比杆赛 ≠ 比洞赛成绩结构；
- G2/G3/G4 不是简单多人成绩；
- 日程 reminder 不是共享对象；
- T台不是球员属性，而是赛事场景属性。

所以需要提供真实 JSON 样例。

---

# 附件四：《GOLFBROTHERS 前端业务数据模型 JSON 示例库 V1.0》

---

# 1. 用户 User

## 当前前端用户对象

```
{  "userId": "u_10001",  "nickname": "Tiger",  "avatar": "https://xxx/avatar.png",  "gender": "male"
}
```

---

## 注意事项

### userId 是唯一业务 ID

以下字段不能作为关联：

错误：

```
{ "nickname":"Tiger"
}
```

正确：

```
{ "userId":"u_10001"
}
```

---

# 2. 球队 Team

示例：

```
{  "teamId":"team_001",  "name":"深圳狮子会球队",  "avatar":"",  "members":[    {      "userId":"u_10001",      "nickname":"Tiger",      "role":"captain"
    },    {      "userId":"u_10002",      "nickname":"Jack",      "role":"member"
    }  ]}
```

---

# 3. 球队赛事 TeamMatch

这是核心对象。

---

## 3.1 基础赛事

```
{ "matchId":"tm_001", "teamId":"team_001", "roundName":"夏季队内赛", "courseName":"松山湖高尔夫球会", "teeTime":"2026-08-10 08:30", "status":"registering", "gameMode":"team_internal", "scoringMode":"stroke", "format":"individual", "createdBy":"u_10001"
}
```

---

# 4. 报名数据

重点：

报名独立存在。

---

## registerInfo

```
{ "matchId":"tm_001", "registerInfo":{   "totalCount":3,   "users":[     {       "userId":"u_10001",       "registeredAt":       "2026-08-01 10:00"
     },     {       "userId":"u_10002",       "registeredAt":       "2026-08-01 11:00"
     },     {       "userId":"u_10003",       "registeredAt":       "2026-08-02 09:00"
     }   ] }}
```

---

## 后端注意

不要：

```
register.users
```

直接转换成：

```
groups.players
```

因为：

报名人数可能大于出场人数。

---

# 5. 分组数据 Group

---

## 普通四人组

```
{"groupId":"g001","matchId":"tm001","name":"第一组","teeTime":"08:30","startHole":1,"players":[ {  "userId":"u001",  "nickname":"Tiger",  "tPosition":"BLUE_T"
 }, {  "userId":"u002",  "nickname":"Jack",  "tPosition":"RED_T"
 }, {  "userId":"u003",  "nickname":"Tom",  "tPosition":"BLUE_T"
 }, {  "userId":"u004",  "nickname":"Mike",  "tPosition":"BLUE_T"
 }]}
```

---

# 6. T台数据规则

## 当前事实来源

优先级：

```
player.tPosition↓player.tee↓gender默认
```

---

示例：

```
{"userId":"u001","tPosition":"RED_T"
}
```

---

后端不要把 T台放入：

User 表。

原因：

同一个用户：

比赛A：

```
BLUE_T
```

比赛B：

```
RED_T
```

完全可能。

---

# 7. G1 个人比杆成绩

---

赛事：

```
{"scoringMode":"stroke","format":"individual"
}
```

---

成绩：

```
{"matchId":"tm001","groupId":"g001","userId":"u001","scores":[ 4,5,4,6,5,4,3,5,4, 5,4,6,4,5,3,4,5,4

],"putts":[

2,2,1,2,2,1,1,2,2,

2,2,2,1,2,1,2,2,1

]}
```

---

# 8. G2/G3 组合成绩

这是后端容易错误设计的地方。

---

## 原则：

组合成绩不是简单平均。

---

例如：

G2 四人四球：

```
A+B+C+D每洞取最好成绩
```

---

数据：

```
{"entityId":"entity001","type":"team_entity","members":[ "u001", "u002"

],"holes":[ {  "hole":1,  "score":4
 }]}
```

---

注意：

组合成绩需要保存 entity。

不能只保存个人。

---

# 9. G4 四人两球比杆

结构：

```
{"entityId":"entity001","members":[ "u001", "u002", "u003", "u004"

],"scoreMode":"four_ball"
}
```

---

# 10. G5-G8 比洞赛

---

## 比洞核心

不是累计杆数。

而是：

每洞胜负。

---

示例：

```
{"matchId":"tm001","format":"best_ball_match","holeResults":[ {  "hole":1,  "winnerEntity":"entityA"
 }, {  "hole":2,  "result":"TIED"
 }, {  "hole":3,  "winnerEntity":"entityB"
 }]}
```

---

# 11. 比洞最终状态

支持：

```
UPDNTIEDFINAL
```

例如：

```
{"status":"FINAL","result":"7&5"
}
```

含义：

7洞领先，剩5洞结束。

---

# 12. 日程数据模型

---

## 12.1 用户自己创建

A：

```
{"scheduleId":"sch001","ownerId":"u001","sourceType":"self","date":"2026-07-30","content":"下午练球","members":[ {  "userId":"u002"
 }]}
```

---

## 12.2 好友提醒

系统生成：

B：

```
{"scheduleId":"sch002","ownerId":"u002","sourceType":"friend_reminder","sourceUserId":"u001","date":"2026-07-30","content":"下午练球"

}
```

---

注意：

A 删除：

不会删除 B。

B 修改：

不会修改 A。

---

# 13. 球队赛事自动日程

报名后：

```
{"scheduleId":"sch003","ownerId":"u001","sourceType":"team_match","sourceId":"tm001","date":"2026-08-10","content":

"夏季队内赛 松山湖 08:30"

}
```

---

取消报名：

删除：

```
ownerId=u001sourceType=team_matchsourceId=tm001
```

---

取消比赛：

删除：

```
sourceId=tm001
```

所有相关日程。

---

# 14. 首页展示数据

后端不要直接返回页面结构。

例如不要返回：

```
{ "cardClass":"", "showButton":true
}
```

这些属于前端。

---

后端返回业务：

```
{"id":"tm001","title":"夏季队内赛","date":"2026-08-10","courseName":"松山湖","status":"registering"
}
```

由前端 adapter 转换。

---

# 15. 当前前端 Store 对应关系

| 前端 Store       | 未来后端          |
| -------------- | ------------- |
| gameStore      | games API（后期） |
| teamMatchStore | teamMatch API |
| scheduleStore  | schedule API  |
| playerStore    | users API     |
| scoreData      | score API     |

---

# 16. 后端设计最重要的 10 条原则

## 1.

用户身份永远 userId。

## 2.

赛事报名和比赛分组分离。

## 3.

成绩保存原始数据，不只保存排行榜。

## 4.

组合赛必须支持 entity。

## 5.

比洞必须保存逐洞胜负。

## 6.

T台属于比赛，不属于用户。

## 7.

日程 reminder 是独立副本。

## 8.

普通球局和球队赛事分开。

## 9.

历史赛事不可随意覆盖。

## 10.

API 返回业务对象，不返回页面 UI。

---

到这里，后端同事已经具备：

1. 产品理解
2. 数据库设计依据
3. API 设计依据
4. 真实 JSON 样例

下一份建议补充：

**附件五：《GOLFBROTHERS 后端开发阶段拆分与验收标准》**

这个很有价值，因为你的项目已经不是从 0 开发，而是前端已经完成大量业务，后端应该按照“替换本地 storage、不破坏现有功能”的方式推进。这个可以帮助你管理后端开发进度。



继续补充第五份附件。这份主要用于**你管理后端同事的开发节奏和验收**。

因为 GOLFBROTHERS 当前不是传统“后端先开发、前端等待”的项目，而是：

> 前端 MVP 已经跑通 → 后端逐步替换本地存储 → 保证已有功能不回退。

所以验收标准必须围绕“业务闭环”而不是单纯接口数量。

---

# 附件五：《GOLFBROTHERS 后端开发阶段拆分与验收标准 V1.0》

---

# 一、总体开发原则

## 1. 开发目标

将当前微信小程序：

```
本地 Store / Storage
```

逐步替换为：

```
API + 数据库
```

同时保持：

- 页面逻辑稳定；
- UI 不大改；
- G1-G8 业务规则不丢失；
- 历史数据可迁移。

---

## 2. 不建议一次性重构

禁止：

一次替换：

```
所有 storage        ↓全部 API
```

原因：

当前已有：

- 球队赛事；
- 比赛分组；
- 记分；
- 比洞；
- 日程；

大量业务已经验证。

一次切换风险过高。

---

# 二、阶段划分

---

# Phase 0：基础环境准备

## 目标

建立后端基础能力。

---

## 后端任务

### 1. 用户认证

包括：

- 微信登录
- token
- session

---

### 2. 数据库初始化

建立：

```
usersteamsteam_members
```

---

### 3. API 基础框架

包括：

- 统一返回结构；
- 参数校验；
- 日志；
- 错误处理。

---

## 验收标准

完成：

用户可以：

- 微信登录；
- 获取 userId；
- 查询个人信息。

---

# Phase 1：用户与球队系统

## 对应前端

替换：

```
playerStoreteamStore
```

---

## 数据表

```
usersteamsteam_members
```

---

# 接口

## 用户

```
GET /users/me
```

## 球队

```
POST /teamsGET /teams/{teamId}
```

## 成员

```
GET /teams/{teamId}/members
```

---

# 验收场景

## 场景1

用户A创建球队。

结果：

数据库：

```
teams+team_members
```

存在。

---

## 场景2

用户B加入球队。

结果：

A、B均可看到成员列表。

---

# Phase 2：球队赛事系统（最高优先级）

这是当前产品核心。

---

## 数据表

```
team_matchesmatch_registersmatch_groupsmatch_group_players
```

---

# 接口

## 创建赛事

```
POST /matches
```

## 查看赛事

```
GET /matches/{id}
```

## 报名

```
POST /matches/{id}/register
```

## 取消报名

```
DELETE /matches/{id}/register/{userId}
```

## 保存分组

```
POST /matches/{id}/groups
```

---

# 验收场景

## 场景1：创建赛事

用户A：

创建：

```
周末队内赛
```

数据库：

生成：

```
team_match
```

---

## 场景2：报名

用户B报名。

数据库：

```
match_registers
```

增加：

```
userId=B
```

---

## 场景3：取消报名

删除：

```
match_registers
```

同时：

删除：

```
team_match schedule
```

---

# Phase 3：成绩系统

---

## 数据表

```
scoresmatch_hole_results
```

---

## 目标

支持：

### 比杆

G1-G4

### 比洞

G5-G8

---

# 验收场景

---

## G1

输入：

18洞成绩。

返回：

```
总杆+排名
```

---

## G2/G3/G4

验证：

组合 entity 存储。

例如：

四人四球：

```
A+B
```

不能拆成：

```
A成绩B成绩
```

---

## G5-G8

验证：

逐洞：

```
WINTIED
```

可以计算：

```
3&2UPFINAL
```

---

# Phase 4：日程系统

---

## 数据表

```
schedulesschedule_members
```

---

## 接口

```
GET /schedulesPOST /schedulesPUT /schedules/{id}DELETE /schedules/{id}
```

---

# 验收场景

## 场景1：自己创建

A：

创建：

```
7月30日 下午练球
```

数据库：

```
scheduleowner=Asource=self
```

---

## 场景2：提醒好友

A提醒：

B/C

结果：

数据库：

A：

```
self
```

B：

```
friend_reminder
```

C：

```
friend_reminder
```

---

## 场景3：删除

A删除。

结果：

A删除。

B/C保持。

---

# Phase 5：赛事与日程联动

---

## 目标

报名球队赛事后：

自动进入日程。

---

流程：

```
报名成功↓创建 schedule↓sourceType=team_matchsourceId=matchId
```

---

验收：

A报名赛事。

A日历：

出现：

```
夏季队内赛
```

---

取消报名：

删除：

```
A对应赛事日程
```

---

取消赛事：

删除：

```
全部相关赛事日程
```

---

# 三、接口验收方式

每个接口必须提供：

## 1. 请求示例

例如：

```
{"userId":"u001"
}
```

---

## 2. 响应示例

例如：

```
{"code":0,"data":{}}
```

---

## 3. 错误情况

例如：

报名：

已经报名：

返回：

```
{"code":20001,"message":"already registered"
}
```

---

# 四、数据库验收要求

---

## 必须有：

### 唯一约束

例如：

报名：

```
match_id + user_id
```

不能重复。

---

### 创建时间

所有业务表：

必须：

```
created_atupdated_at
```

---

### 软删除

建议：

业务重要表增加：

```
deleted_at
```

例如：

- 赛事；
- 成绩；
- 日程。

---

# 五、前端迁移策略

---

## 当前：

例如：

```
teamMatchStore.getMatchById()
```

---

不要直接替换：

改为：

```
teamMatchApi.getMatchById()
```

返回格式保持：

```
match object
```

---

中间增加：

```
API Adapter
```

负责：

后端字段

↓

前端字段

---

# 六、后端开发完成定义（Definition of Done）

一个模块完成必须满足：

## 代码层面

✅ API 完成  
✅ 数据库完成  
✅ 错误处理完成  
✅ 权限校验完成

---

## 业务层面

✅ 前端真实流程跑通  
✅ 数据刷新正常  
✅ 多用户测试通过

---

## 测试账号建议

至少：

| 账号  | 用途    |
| --- | ----- |
| A   | 创建者   |
| B   | 普通成员  |
| C   | 被提醒好友 |
| D   | 管理员   |

---

# 七、推荐开发顺序（最终）

优先级：

| 优先级 | 模块   | 原因     |
| --- | ---- | ------ |
| P0  | 用户认证 | 所有业务依赖 |
| P0  | 球队   | 赛事基础   |
| P0  | 球队赛事 | 当前核心产品 |
| P1  | 报名   | 用户参与闭环 |
| P1  | 分组   | 比赛执行   |
| P1  | 成绩   | 核心价值   |
| P2  | 日程   | 增强体验   |
| P3  | 普通球局 | 后续迁移   |

---

# 八、当前明确暂不做

为了控制范围：

## 暂不实现：

### 1. 普通球局自动日程

原因：

普通球局即时性强。

---

### 2. 日程接受/拒绝机制

原因：

当前设计：

提醒即生成。

---

### 3. 日程共享编辑

原因：

每人独立记录。

---

### 4. 社交通知系统

包括：

- 评论通知；
- 点赞通知；
- 好友动态。

后续单独建设。

---

这份交给后端同事后，他应该能理解：

**先不要设计一个“通用高尔夫后台”，而是围绕现在已经验证过的 GOLFBROTHERS 业务模型建设。**

下一份如果继续补，我建议整理：

**附件六：《GOLFBROTHERS 后端权限模型与安全规则》**

这个在你开始多人使用、球队管理员、赛事管理员之后会非常重要，尤其涉及：

- 谁能创建比赛；
- 谁能修改分组；
- 谁能录入成绩；
- 谁能取消赛事；
- 谁能删除日程。



继续补充第六份附件。

这份非常重要，因为你的项目已经不是单用户工具，而是：

- 球友之间共享数据；
- 球队有组织关系；
- 赛事有创建者、管理员、参与者；
- 成绩有录入和修改权限；
- 日程有“自己的副本”逻辑。

如果后端权限模型不提前定义，后期很容易出现：

- 普通球员修改比赛；
- 非管理员删除赛事；
- A 修改 B 的日程；
- 比赛结束后成绩被随意修改。

---

# 附件六：《GOLFBROTHERS 后端权限模型与安全规则 V1.0》

---

# 一、权限设计原则

## 1. 用户数据归属原则

所有数据必须有明确 Owner。

例如：

日程：

```
ownerId = 用户本人
```

球队：

```
creatorId / admin
```

赛事：

```
createdBy
```

成绩：

```
userId + matchId
```

---

## 2. 前端权限 ≠ 后端权限

小程序 UI 可以隐藏按钮。

但是：

后端必须再次验证。

例如：

前端：

```
隐藏“取消比赛”
```

不代表：

接口：

```
DELETE /matches/{id}
```

可以不校验。

---

# 二、用户角色体系

建议基础角色：

---

## 1. 普通用户 User

默认角色。

权限：

可以：

- 创建自己的日程；
- 报名赛事；
- 查看公开赛事；
- 查看自己的成绩。

不能：

- 修改球队；
- 修改他人报名；
- 删除赛事。

---

## 2. 球队管理员 Team Admin

来源：

```
team_members.role
```

例如：

```
{ "role":"admin"
}
```

权限：

可以：

- 创建球队赛事；
- 管理球队成员；
- 编辑赛事配置；
- 设置分组。

---

## 3. 赛事管理员 Match Admin

赛事级权限。

例如：

赛事创建人：

```
{"createdBy":"u001"
}
```

权限：

可以：

- 修改赛事；
- 调整报名；
- 修改分组；
- 开始比赛；
- 结束比赛；
- 取消赛事。

---

# 三、权限关系图

```
User | | +----------------+ |                |Team Admin     Match Admin |                |Team            Match
```

---

# 四、球队权限

## Team 创建

接口：

```
POST /teams
```

权限：

任何登录用户。

创建后：

自动：

```
creatorId=userIdrole=admin
```

---

# 五、球队成员管理权限

接口：

```
POST /teams/{id}/members
```

---

允许：

```
Team Admin
```

---

禁止：

普通成员：

```
403 Forbidden
```

---

# 六、赛事权限模型

---

# 6.1 创建赛事

接口：

```
POST /matches
```

允许：

条件：

用户属于球队。

例如：

```
userId ∈ team_members
```

---

# 6.2 修改赛事

接口：

```
PUT /matches/{matchId}
```

允许：

满足：

```
createdBy == currentUserORteam admin
```

---

禁止：

普通报名用户。

---

# 6.3 取消赛事

接口：

```
DELETE /matches/{matchId}
```

允许：

```
match creatorORteam admin
```

---

建议：

后端不要直接 delete。

改：

```
{ "status":"cancelled"
}
```

---

原因：

历史数据。

---

# 七、报名权限

---

## 报名

接口：

```
POST /matches/{id}/register
```

允许：

本人。

---

例如：

当前：

```
userId=A
```

只能：

```
register(A)
```

---

不能：

```
register(B)
```

---

## 代报名

当前产品：

前端存在代报名能力。

但是后端第一阶段建议：

明确：

```
proxy_register
```

单独权限。

不要直接允许。

---

建议未来：

增加：

```
{"operatorId":"A","targetUserId":"B"
}
```

记录：

谁操作。

---

# 八、分组权限

---

## 保存分组

接口：

```
POST /matches/{id}/groups
```

允许：

- Match Admin
- Team Admin

---

普通球员：

禁止。

---

# 九、成绩权限

成绩权限需要特殊处理。

---

# 9.1 录入成绩

允许：

比赛参与者。

例如：

用户A：

只能提交：

```
A自己的成绩
```

---

不能：

修改：

B成绩。

---

# 9.2 球队管理员录入

允许：

如果赛事配置允许：

```
caddie / marker / admin
```

未来扩展。

---

# 9.3 成绩修改

建议：

比赛状态：

## ongoing

允许修改。

## finished

限制修改。

需要：

```
match admin
```

权限。

---

# 十、日程权限（重点）

日程设计与传统共享日历不同。

---

## 核心原则：

每条记录独立。

---

# 10.1 self

例如：

A创建：

```
{"ownerId":"A","sourceType":"self"
}
```

权限：

A：

可以：

- 修改；
- 删除。

其他人：

不可见。

---

# 10.2 friend_reminder

例如：

A提醒B：

数据库：

B：

```
{"ownerId":"B","sourceType":"friend_reminder","sourceUserId":"A"
}
```

---

权限：

B：

可以：

- 修改；
- 删除。

A：

不能修改B记录。

---

# 10.3 team_match

赛事自动生成。

例如：

```
{"ownerId":"A","sourceType":"team_match","sourceId":"tm001"
}
```

---

用户：

可以：

查看。

---

禁止：

手工编辑。

---

删除：

由：

- 取消报名；
- 取消赛事

触发。

---

# 十一、接口权限返回

建议统一：

成功：

```
{"code":0
}
```

---

无权限：

```
{"code":40301,"message":

"无操作权限"
}
```

---

例如：

普通用户修改赛事：

返回：

```
{"code":40301
}
```

---

# 十二、数据审计字段

重要操作建议记录：

---

## 操作日志表

建议：

```
operation_logs
```

---

字段：

```
{"logId":"","userId":"u001","action":"cancel_match","targetType":"match","targetId":"tm001","time":""
}
```

---

用于：

- 追踪问题；
- 用户纠纷；
- 数据恢复。

---

# 十三、删除策略

不要直接物理删除。

---

## 用户

禁止删除。

改：

```
status=disabled
```

---

## 赛事

推荐：

```
status=cancelled
```

---

## 日程

可以软删除：

```
deleted_at
```

---

## 成绩

禁止删除。

---

# 十四、安全检查清单

所有写接口必须检查：

| 检查项  | 必须  |
| ---- | --- |
| 登录状态 | ✓   |
| 用户身份 | ✓   |
| 资源归属 | ✓   |
| 角色权限 | ✓   |
| 状态限制 | ✓   |
| 参数合法 | ✓   |

---

# 十五、典型权限场景验收

---

## 场景1

A创建赛事。

B尝试修改。

结果：

```
403
```

---

## 场景2

A提醒B日程。

B删除。

结果：

A日程：

保留。

B日程：

删除。

---

## 场景3

比赛结束。

普通球员修改成绩。

结果：

拒绝。

---

## 场景4

球队管理员取消比赛。

结果：

允许。

同时：

相关赛事日程清理。

---

# 十六、第一阶段推荐实现范围

不要一次实现复杂 RBAC。

V1 足够：

```
UserTeam AdminMatch Creator
```

三个角色。

---

后续：

再扩展：

```
赛事裁判球童记分员俱乐部管理员
```

---

这份完成后，后端同事已经有：

1. 产品模型
2. 数据库模型
3. API模型
4. JSON样例
5. 开发阶段
6. 权限规则

下一份建议补：

**附件七：《GOLFBROTHERS 数据迁移方案（本地 Storage → 云端数据库）》**

因为你现在已经积累了大量测试数据（球队赛事、成绩、日程），后端上线时不能简单清空，需要定义迁移策略。这个会直接影响上线方式。



继续补充第七份附件。

这份非常关键，因为你现在已经有大量本地测试数据：

- 球队；
- 球队赛事；
- 报名；
- 分组；
- 成绩；
- 日程；

后端上线时不能简单“重新创建账号”，否则之前测试积累的业务数据无法延续。

但是也不能一开始就设计复杂的数据迁移系统。

建议采用：

> **双轨迁移：旧数据保留 + Adapter 逐步切换 + 分阶段导入。**

---

# 附件七：《GOLFBROTHERS 数据迁移方案（Local Storage → 云端数据库）V1.0》

---

# 一、迁移目标

## 当前状态

微信小程序：

```
页面 |Store |wx.storage
```

例如：

```
gb_team_matches_v1gb_schedule_v1scoreData
```

---

## 目标状态

迁移为：

```
页面 |Adapter |API |Database
```

---

# 二、迁移原则

---

## 原则1：不破坏已有业务

当前已经验证：

- G1-G8赛事流程；
- 比杆赛；
- 比洞赛；
- 日程系统。

不能因为接入后端重新设计业务。

---

## 原则2：数据模型优先兼容前端

后端不要要求前端大规模改造。

例如：

当前前端：

```
{"matchId":"tm001"
}
```

后端不要强制：

```
{"id":10001
}
```

然后让前端全部重写。

---

## 原则3：迁移不是一次完成

建议：

模块逐步迁移。

---

# 三、迁移阶段

---

# Phase 0：增加用户身份映射

## 目标

解决：

本地用户：

```
me
```

如何对应真实用户。

---

新增：

```
user_mapping
```

---

字段：

| 字段            | 说明   |
| ------------- | ---- |
| local_user_id | 旧ID  |
| user_id       | 云端ID |
| created_at    |      |

---

示例：

```
{"local_user_id":"me","user_id":"u_10001"
}
```

---

# Phase 1：用户迁移

---

## 当前来源

可能：

```
gameStoreplayerStore
```

---

迁移：

进入：

```
users
```

---

规则：

## 昵称

保留。

---

## 头像

保留。

---

## 手机

如果存在：

关联。

---

## 无法匹配

创建：

```
pending user
```

等待绑定。

---

# Phase 2：球队迁移

---

## 当前来源

例如：

```
teamStore
```

---

迁移顺序：

必须：

```
User↓Team↓TeamMember
```

---

不能：

先导入成员。

---

## 示例

旧：

```
{"teamId":"t001","name":"狮子队"
}
```

转换：

```
{"team_id":"team001","name":"狮子队"
}
```

---

# Phase 3：球队赛事迁移

---

## 来源

```
gb_team_matches_v1
```

---

迁移顺序：

必须：

```
TeamMatch↓Register↓Group↓Score
```

---

# 3.1 Match迁移

旧：

```
{"matchId":"tm001","roundName":"周末赛","courseName":"松山湖"
}
```

---

新：

```
{"match_id":"tm001","title":"周末赛","course_name":"松山湖"
}
```

---

# 3.2 报名迁移

旧：

```
registerInfo.users
```

---

拆：

旧：

```
[ { "userId":"u001"
 }]
```

---

新：

match_registers：

```
{"match_id":"tm001","user_id":"u001"
}
```

---

# 3.3 分组迁移

旧：

```
groups:[ { players:[] }]
```

---

拆：

match_groups：

```
{"group_id":"g001"
}
```

---

match_group_players：

```
{"group_id":"g001","user_id":"u001","t_position":"BLUE_T"
}
```

---

# Phase 4：成绩迁移

---

## 风险最高模块

原因：

历史结构复杂。

包括：

- G1个人；
- G2/G3组合；
- G4实体；
- G5-G8比洞。

---

## 建议策略

不要立即拆。

第一版：

保留 JSON。

例如：

数据库：

```
score_data JSON
```

---

保存：

```
{"groups":[],"entities":[],"holeResults":[]}
```

---

原因：

先保证历史可查。

后续再结构化。

---

# Phase 5：日程迁移

---

## 当前来源

```
gb_schedule_v1
```

---

迁移简单。

---

旧：

```
{"id":"sch001","ownerId":"u001","content":"练球"
}
```

---

新：

```
{"schedule_id":"sch001","owner_id":"u001","content":"练球"
}
```

---

# 四、本地与云端并行策略

推荐：

## 第一阶段

读：

云端优先

失败：

读取本地。

例如：

```
getMatch(){ try {  return api.getMatch() } catch {  return localStore.getMatch() }}
```

---

## 第二阶段

写：

双写。

例如：

创建赛事：

```
API写入+storage缓存
```

---

## 第三阶段

关闭本地写入。

---

# 五、历史数据版本字段

建议所有主要对象增加：

```
{"dataVersion":1
}
```

---

原因：

未来：

赛制升级。

例如：

G2数据结构变化。

可以：

按版本解析。

---

# 六、迁移校验

每个模块迁移后必须验证：

---

# 用户

数量：

```
旧用户数 = 新用户数
```

---

# 球队

验证：

成员数量。

---

# 赛事

验证：

```
比赛数量报名人数分组人数
```

---

# 成绩

验证：

随机抽查：

- 总杆；
- 排名；
- 比洞结果。

---

# 日程

验证：

```
日期数量ownerIdsourceType
```

---

# 七、失败回滚方案

任何模块迁移失败：

不要删除旧数据。

保持：

```
Local Storage+Database
```

并存。

---

回滚：

关闭 API Adapter。

恢复：

Local Store。

---

# 八、上线迁移推荐顺序

结合当前项目：

## 第一步

用户

↓

球队

---

## 第二步

球队赛事

↓

报名

↓

分组

---

## 第三步

成绩

---

## 第四步

日程

---

## 第五步

普通球局

---

# 九、暂不迁移

## 普通 GAME

原因：

当前：

```
创建↓完成
```

生命周期简单。

建议：

后续单独设计 Game API。

---

# 十、最终迁移架构

```
              Database                  ↑              API Layer                  ↑             Adapter层                  ↑        +---------+---------+        |                   |   云端数据             本地缓存
```

---

# 十一、给后端同事的执行要求

不要：

❌ 重新设计业务模型  
❌ 只按数据库最佳实践重构  
❌ 忽略前端已有规则

必须：

✅ 兼容现有字段语义  
✅ 保留历史数据  
✅ 支持渐进迁移  
✅ 与前端 Adapter 配合

---

这份完成后，后端同事已经具备完整迁移路线。

目前七份附件组合：

1. 产品与业务说明
2. ER模型
3. API定义
4. JSON样例
5. 开发阶段与验收
6. 权限模型
7. 数据迁移方案

已经接近一个正式项目的后端启动包。

下一步如果继续完善，我建议补第八份：

**《GOLFBROTHERS 后端非功能需求说明（性能、缓存、实时性、日志、安全、备份）》**

这份不是马上开发必须，但当用户量扩大、赛事数据增长后，会避免后端架构走偏。



继续补充第八份附件。

这一份不是为了让后端第一天就实现全部内容，而是为了让架构设计不要踩坑。你的产品有几个特点：

- 球队赛事数据有长期沉淀价值；
- 成绩数据会持续增长；
- 日程和通知未来可能高频触达；
- 用户未来可能从几十人扩展到大量球友。

所以需要提前定义一些非功能要求。

---

# 附件八：《GOLFBROTHERS 后端非功能需求说明 V1.0》

---

# 一、目标

本文定义 GOLFBROTHERS 后端系统在以下方面的基础要求：

- 性能
- 稳定性
- 数据安全
- 日志
- 缓存
- 扩展能力

目标：

保证系统可以从 MVP 阶段平稳扩展到正式运营阶段。

---

# 二、系统总体要求

## 1. 可用性要求

第一阶段：

目标：

```
99% 可用
```

---

成熟阶段：

目标：

```
99.9% 可用
```

---

## 2. 数据可靠性

核心数据：

必须保证不丢失。

包括：

- 用户
- 球队
- 赛事
- 报名
- 成绩
- 日程

---

# 三、性能要求

---

# 3.1 API响应时间

普通查询：

目标：

```
<500ms
```

例如：

- 获取用户信息；
- 获取球队；
- 获取赛事列表。

---

复杂查询：

允许：

```
<2s
```

例如：

- 赛事排行榜；
- 历史成绩统计。

---

# 3.2 并发设计

MVP阶段：

支持：

```
1000级用户
```

---

架构不要限制未来：

```
10000+
```

用户。

---

# 四、数据库设计要求

---

# 4.1 主键设计

禁止：

直接暴露：

```
AUTO_INCREMENT ID
```

作为业务ID。

---

推荐：

业务ID：

例如：

```
u_xxxxxtm_xxxxxsch_xxxxx
```

---

原因：

未来：

- 分库；
- 数据迁移；
- 多服务；

更容易。

---

# 4.2 时间字段统一

所有业务表：

必须：

```
created_atupdated_at
```

---

时间格式：

数据库：

UTC存储。

展示：

根据用户地区转换。

---

# 4.3 JSON字段使用原则

允许：

保存复杂业务结构。

例如：

成绩。

---

但是：

不能所有东西都 JSON。

正确：

```
scores结构化字段+hole_data JSON
```

---

错误：

整个赛事：

```
{ everything:"xxx"
}
```

---

# 五、缓存策略

---

# 5.1 用户缓存

适合：

用户基础信息。

例如：

```
nicknameavatar
```

---

缓存：

短时间。

例如：

5-30分钟。

---

# 5.2 赛事缓存

适合：

赛事详情。

例如：

```
matchId
```

---

但是：

比赛进行中：

缓存时间降低。

原因：

成绩变化频繁。

---

# 5.3 成绩缓存

排行榜属于高频读取。

建议：

增加：

```
leaderboard cache
```

例如：

Redis。

---

流程：

```
用户提交成绩↓更新score↓刷新排行榜缓存↓返回
```

---

# 六、实时性设计

---

当前 MVP：

不要求实时通讯。

---

但是架构需要预留：

## 比赛 LIVE

未来可能：

A录入成绩。

B马上看到。

---

建议预留：

WebSocket。

未来：

```
Score Update↓Push↓所有观众刷新
```

---

# 七、日志系统

必须记录：

---

## 7.1 系统日志

例如：

接口异常：

```
API error
```

---

## 7.2 业务日志

重点。

例如：

用户：

A

操作：

取消比赛

记录：

```
{"userId":"u001","action":"cancel_match","targetId":"tm001","time":""
}
```

---

## 7.3 数据变更日志

重要对象：

建议：

- Match
- Score

记录修改前后。

---

# 八、备份策略

---

# 8.1 数据库备份

MVP：

每天一次。

---

成熟：

建议：

- 每日全量；
- 定时增量。

---

# 8.2 恢复测试

不能只备份。

需要验证：

是否能恢复。

---

# 九、安全要求

---

# 9.1 身份认证

微信登录：

流程：

```
微信code↓后端验证↓生成token↓API调用
```

---

不要：

前端直接传：

```
{"userId":"u001"
}
```

作为可信身份。

---

# 9.2 接口权限

所有写操作：

必须：

检查：

```
当前登录用户+资源归属+角色权限
```

---

# 9.3 防止越权

重点测试：

---

用户A：

请求：

```
GET /schedule/B
```

结果：

拒绝。

---

用户A：

请求：

```
PUT /match/B
```

结果：

拒绝。

---

# 十、文件存储

未来涉及：

- 用户头像；
- 球队头像；
- 球场图片；
- 赛事照片。

不要：

直接存数据库。

---

推荐：

对象存储：

例如：

```
OSSCOSS3
```

数据库保存：

URL。

---

示例：

```
{"avatar":
"https://cdn.xxx/avatar.png"
}
```

---

# 十一、搜索能力

未来可能需要：

搜索：

- 球友；
- 球队；
- 球场；
- 历史赛事。

---

MVP：

数据库 LIKE。

---

增长后：

引入：

搜索服务。

---

# 十二、数据统计预留

未来产品价值：

不是只有打球。

还有：

用户成长。

---

建议保留：

统计入口：

例如：

## 用户

累计：

- 球局数；
- 比赛数；
- 总杆；
- 最佳成绩。

---

## 球队

累计：

- 比赛次数；
- 胜率；
- 成员活跃。

---

# 十三、监控要求

至少：

监控：

## API

- 请求数量；
- 错误率；
- 响应时间。

---

## 数据库

- CPU；
- 内存；
- 慢查询。

---

## 业务

- 注册人数；
- 创建赛事数；
- 报名数。

---

# 十四、慢查询要求

数据库：

开启：

slow query log。

重点关注：

---

赛事列表：

```
matches
+
team
+
register count
```

---

排行榜：

```
scores
+
users
```

---

历史成绩：

```
user
+
score
```

---

# 十五、版本管理

API：

必须版本化。

例如：

当前：

```
/api/v1
```

未来：

```
/api/v2
```

---

不要：

直接修改已有接口含义。

---

# 十六、环境要求

至少：

三个环境：

---

## 开发环境

```
dev
```

开发测试。

---

## 测试环境

```
test
```

前端联调。

---

## 生产环境

```
prod
```

正式用户。

---

# 十七、上线前检查清单

## 数据

✅ 用户数据正常  
✅ 球队数据正常  
✅ 历史赛事可查询  
✅ 成绩可恢复

---

## 权限

✅ 普通用户不能管理赛事  
✅ 管理员权限正常  
✅ 日程隔离正常

---

## 性能

✅ 首页加载正常  
✅ 赛事列表正常  
✅ 排行榜正常

---

# 十八、当前阶段不必过度建设

以下暂不需要：

## 1. 微服务

MVP：

单体服务足够。

---

## 2. 分布式数据库

数据规模未达到。

---

## 3. 复杂消息队列

通知系统成熟后再引入。

---

## 4. AI分析服务

等成绩数据积累后。

---

# 十九、推荐技术路线（不限定）

一种合理路线：

```
微信小程序↓API Server↓MySQL/PostgreSQL↓Redis（缓存）↓对象存储
```

---

# 二十、最终架构目标

```
                用户端小程序                      |                 API Gateway                      |        +-------------+-------------+        |                           |     业务服务                    文件服务        |    数据库 + 缓存        |     日志 / 监控 / 备份
```

---

这份完成后，八份附件已经覆盖：

1. 产品业务模型
2. 数据库设计
3. API定义
4. JSON样例
5. 开发拆分与验收
6. 权限体系
7. 数据迁移
8. 非功能要求

这已经是一套比较完整的后端启动资料。

下一份如果继续补，我建议做**附件九：《GOLFBROTHERS 前后端联调规范与测试用例》**。

这份会更贴近你实际管理同事开发，因为它规定：

- 后端给什么；
- 前端怎么验；
- 哪些业务场景必须通过；
- G1-G8 和日程如何验收。
