# GOLFBROTHERS 小程序分包架构规范 V1

版本：V1.0  
适用项目：GOLFBROTHERS 微信小程序  
目标：在保持核心体验稳定的前提下，通过合理分包控制主包体积，并支持未来业务持续扩展。

---

# 1. 分包总体原则

## 1.1 核心原则

小程序代码按照业务访问频率和业务边界进行拆分：

```
高频、核心、启动必需能力        ↓主包低频、独立、复杂业务能力        ↓分包
```

---

## 1.2 禁止原则

任何新增功能：

禁止默认放入主包。

新增页面必须先判断：

1. 是否属于核心使用流程？
2. 是否首次进入必须加载？
3. 是否属于独立业务模块？

确认后决定：

- 主包
- 已有分包
- 新建分包

---

# 2. 主包设计规范

## 2.1 主包定位

主包只承载：

> 用户进入 GOLFBROTHERS 后最核心的使用闭环。

包括：

- 首页浏览
- 赛事入口
- 实时比赛
- 用户中心

---

## 2.2 当前主包页面

目录：

```
pages/├── index│├── tournament│   ├── list│   └── detail│├── score│   └── index│├── mine│└── login
```

---

# 3. 主包保留页面规则

以下页面固定属于主包：

## 3.1 首页

原因：

用户启动后的第一入口。

---

## 3.2 赛事列表

原因：

赛事发现入口。

---

## 3.3 赛事详情

页面：

```
pages/tournament/detail/index
```

规则：

禁止迁移至分包。

原因：

- 赛事核心入口
- 访问频率高
- 连接记分、榜单、讨论等功能

---

## 3.4 记分页面

页面：

```
pages/score/index
```

规则：

禁止迁移至分包。

原因：

- 实时比赛核心能力
- 高频交互
- 数据状态复杂

---

# 4. 创建业务分包 create

目录：

```
subpackages/create/
```

定位：

> 所有赛事创建流程。

---

## 4.1 包含功能

包括：

```
create├── quick-create├── normal-create├── team-match-create├── inter-team-create└── series-create
```

---

## 4.2 进入条件

用户主动点击：

```
创建
```

后加载。

---

## 4.3 包含内容

允许包含：

- 创建页面
- 创建流程组件
- 创建业务规则
- 创建专用工具函数

例如：

```
subpackages/create/├── pages├── components└── utils
```

---

# 5. 赛事管理分包 tournament-admin

目录：

```
subpackages/tournament-admin/
```

定位：

> 已创建赛事的管理能力。

---

## 5.1 包含功能

包括：

- 分组管理
- 出发管理
- 权限管理
- 费用管理
- 报名管理
- 赛事设置

---

## 5.2 判断标准

如果功能属于：

```
赛事创建完成后管理员调整
```

进入该分包。

---

# 6. 游戏分包 game

目录：

```
subpackages/game/
```

定位：

> 非核心计分玩法扩展。

---

## 6.1 包含功能

包括：

- 组内游戏
- 比洞玩法扩展
- 特殊比赛玩法
- 娱乐积分玩法

---

## 6.2 原则

游戏不能影响：

- 基础记分
- 比赛结果
- 核心成绩模型

---

# 7. 数据统计分包 statistics

目录：

```
subpackages/statistics/
```

定位：

> 历史数据和高级分析。

---

包括：

- 历史成绩
- 球员统计
- 年度排名
- 数据报告
- AI分析

---

# 8. 社交分包 social

目录：

```
subpackages/social/
```

定位：

> 社区互动能力。

---

包括：

- 好友
- 关注
- 动态
- 评论
- 消息

---

# 9. 公共组件规范

## 9.1 common组件

仅放真正跨业务组件：

目录：

```
components/common/
```

例如：

- HEADER
- Avatar
- Button
- Tab
- Modal

---

## 9.2 业务组件

跟随业务分包。

例如：

创建相关：

```
subpackages/create/components
```

记分相关：

```
components/score
```

禁止为了方便全部放入公共组件。

---

# 10. utils规范

## 10.1 公共utils

仅保存：

跨业务使用。

例如：

```
utils/├── request.js├── date.js├── format.js└── storage.js
```

---

## 10.2 业务utils

跟随业务：

例如：

```
subpackages/create/utilssubpackages/game/utilssubpackages/statistics/utils
```

---

# 11. 新功能开发流程

任何新增功能必须经过：

```
需求提出↓业务归属判断↓确定：主包/已有分包/新增分包↓设计目录↓Cursor开发↓检查包体积
```

---

# 12. Cursor开发要求

Cursor执行新增功能前必须确认：

输出：

```
本功能所属模块：目标目录：是否新增主包代码：是否新增分包：预计影响：
```

---

# 13. 包体积目标

## 主包目标

长期保持：

```
≤2MB
```

推荐：

```
1.3MB~1.8MB
```

---

## 分包目标

允许：

根据业务增长独立扩展。

---

# 14. 当前规划结构

最终目标：

```
miniprogrampages│├── index├── tournament│   ├── list│   └── detail├── score└── minesubpackages├── create├── tournament-admin├── game├── statistics└── social
```

---

# 15. 架构原则总结

GOLFBROTHERS 分包遵循：

```
核心体验留主包业务能力进分包公共能力严格控制新增功能先定边界禁止主包无限增长
```
