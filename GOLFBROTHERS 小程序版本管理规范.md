# GOLFBROTHERS 小程序版本管理规范

## 1. 文档目的

本文档用于记录 GOLFBROTHERS（高尔夫江湖）微信小程序开发过程中的：

- 稳定版本节点

- Git Tag

- Commit 信息

- 功能完成情况

- 开发分支关系

- 回滚方式

目的：

1. 确保每个重要开发阶段都有可恢复版本。

2. 避免 Cursor 修改过程中造成不可恢复的问题。

3. 明确每个版本对应的产品能力。

4. 方便后续多人协作和长期维护。

---

# 2. Git版本管理原则

## 2.1 稳定版本必须打 Tag

每完成一个重要功能阶段：

必须：

1. 提交 Git Commit

2. 创建 Git Tag

3. 在本文件记录

示例：

```bash
git add .

git commit -m "创建队内赛V1稳定版本：初始化配置与球队赛事卡片完成"

git tag -a v0.1-team-match -m "创建队内赛MVP稳定版本"
```

---

## 2.2 开发必须使用分支

禁止直接在稳定分支修改。

标准：

稳定版本：

```
stable-mvp-v1
```

开发分支：

```
feature-功能名称
```

示例：

```
v0.1-team-match
        |
        |
        └── feature-team-match-enhancement
```

---

## 2.3 版本恢复方式

恢复稳定版本：

```bash
git checkout 标签名称
```

例如：

```bash
git checkout v0.1-team-match
```

如果需要基于旧版本继续开发：

```bash
git checkout -b 新分支名称
```

例如：

```bash
git checkout -b feature-team-registration
```

---

# 3. 版本命名规范

## 格式

```
v阶段号-功能名称
```

例如：

```
v0.1-team-match
v0.2-team-registration
v0.3-team-grouping
v0.4-scorecard
v1.0-mvp-release
```

---

# 4. 版本等级定义

## Major版本

格式：

```
v1.0
```

代表：

产品级里程碑。

例如：

```
v1.0-mvp-release
```

含义：

MVP正式发布版本。

---

## Feature版本

格式：

```
v0.x-feature
```

代表：

一个完整功能模块完成。

例如：

```
v0.1-team-match
```

表示：

创建队内赛完整基础闭环完成。

---

## Fix版本

格式：

```
v0.x.x
```

代表：

针对已有版本的问题修复。

例如：

```
v0.1.1-team-match-fix
```

---

# 5. 每个版本记录模板

复制以下模板新增版本记录。

---

# 版本：vX.X-功能名称

## 基本信息

发布日期：

```
YYYY-MM-DD
```

Git Tag：

```
vX.X-xxxx
```

Git Commit：

```
commit id
```

基于版本：

```
上一版本Tag
```

开发分支：

```
feature-xxxx
```

状态：

```
稳定 / 开发中 / 废弃
```

---

# 功能说明

## 完成功能

## 涉及页面

例如：

```
pages/create/team-internal

pages/home

pages/tournament/detail
```

## 涉及数据结构

例如：

```
teamMatchStore

partnerConfig
```

---

# 测试状态

## 微信开发者工具

状态：

```
通过 / 未通过
```

## 真机测试

状态：

```
通过 / 未测试
```

## 体验版测试

状态：

```
通过 / 未测试
```

---

# 已知问题

记录：

---

# 回滚方式

恢复命令：

```bash
git checkout vX.X-xxxx
```

---

# 6. 当前版本记录

# v0.1-team-match

## 基本信息

发布日期：

```
2026-07-07
```

Git Tag：

```
v0.1-team-match
```

Git Commit：

```
4c11f13
```

基于版本：

```
stable-mvp-v1-final
```

开发分支：

```
stable-mvp-v1
```

状态：

```
稳定版本
```

---

# 功能说明

## 创建队内赛 MVP闭环完成

完成内容：

- 创建队内赛页面稳定

- 球队选择流程

- 比赛名称自动生成

- 分队设置默认值

- 费用设置默认值

- 赛事信息默认配置

- 创建成功流程

- 创建后跳转赛事菜单

- 我的球队赛卡片生成

- 球队赛事LOGO链路

- 报名中状态标签

---

# 涉及页面

```
pages/create/team-internal

pages/home

pages/tournament/detail
```

---

# 涉及数据结构

```
utils/teamMatchStore.js

utils/partnerConfig.js
```

---

# 测试状态

微信开发者工具：

```
通过
```

真机：

```
待持续验证
```

体验版：

```
待验证
```

---

# 回滚方式

```bash
git checkout v0.1-team-match
```

---

# 7. 后续版本记录区域

（以后新增版本均复制第5章模板）

---

# 版本记录列表

| Tag             | 日期         | 功能         | 状态  |
| --------------- | ---------- | ---------- | --- |
| v0.1-team-match | 2026-07-07 | 创建队内赛MVP闭环 | 稳定  |
|                 |            |            |     |
|                 |            |            |     |
