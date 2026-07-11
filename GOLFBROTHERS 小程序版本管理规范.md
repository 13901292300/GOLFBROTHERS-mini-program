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

# 版本记录

## v0.2-team-match-detail

日期：
2026-07-07

分支：
feature-team-match-enhancement

Commit:
1953cf7

### 版本定位

队内赛赛事详情页业务化版本。

### 完成功能

#### 创建队内赛数据链路

完成：

创建队内赛
↓
teamMatchStore
↓
赛事详情页

的数据闭环。

新增支持：

- eventInfoList 保存
- 赛事信息内容持久化

---

#### 赛事详情顶部信息动态化

顶部区域由静态演示数据改为读取赛事数据。

支持：

- LOGO
- 比赛时间
- 比赛名称
- 赛制标签
- 赛事类型标签
- 主办方
- 球场
- 价格标签

---

#### 赛事信息 TAB 数据化

原静态演示内容改为：

match.eventInfoList

支持：

- 图片类型
- 文本类型
- 创建顺序继承

图片规范：

- 固定宽度
- 高度自适应
- 不裁剪

---

#### TAB 生命周期基础

完成：

- registering
- ongoing
- completed

状态驱动 TAB 配置。

---

### 已知未完成

以下功能不属于 v0.2：

- 报名 TAB
- 报名人员管理
- 分队逻辑
- 分组展示
- 比赛状态流转
- 进行中实时记分关联

---

### 下一版本目标

v0.3-team-match-register

目标：

完成报名中状态赛事详情页。

包括：

- 报名 TAB
- 报名人员展示
- 报名/取消报名
- 分队报名逻辑

# v0.3-group-management-v1

版本号：
v0.3-group-management-v1

Git Commit：
01ee519

Commit Message：
feat: complete group management UI and player selection workflow

发布时间：
2026-07-08

## 版本定位

本版本完成赛事详情页「分组 TAB」第一阶段功能建设。

该版本主要目标：
建立队内赛赛事分组管理的基础交互框架，实现从赛事详情 → 分组管理 → 球员选择 → 分组展示的完整页面流程。

当前版本仍属于页面交互阶段，分组数据尚未正式写入赛事数据模型。

---

# 已完成功能

## 一、赛事详情页「分组 TAB」基础能力

完成分组 TAB 页面结构：

- 支持进入赛事详情页分组 TAB；
- 页面高度结构适配赛事详情页吸顶逻辑；
- 保证内容不足时仍可正常触发主 TAB 吸顶。

---

## 二、管理权限下的分组创建入口

增加分组管理态能力：

仅以下用户可看到管理操作：

- 赛事创建者；
- 拥有赛事管理权限用户。

实现：

- 轻量「添加分组」按钮；
- 点击后生成新的空分组卡片；
- 分组编号自动生成：

例如：

第1组  
第2组  
第3组

分组卡片复用赛事出发表视觉结构。

---

## 三、分组卡片展示模型

完成分组卡片基础展示：

每组固定4个球员位置。

初始状态：

- 空头像；
- 空昵称；
- 空 T 台。

卡片结构复用：

- 出发表卡片布局；
- 球员头像位置；
- 球员名称位置；
- T 台展示区域。

---

## 四、分组球员选择页面

新增页面：

pages/tournament/group-pick/index

实现：

点击分组卡片进入球员选择页面。

页面结构：

HEADER：

- 遵循全局 HEADER 规范。

固定区域：

- 当前组名称；
- 四个球员位置展示。

滚动区域：

- 球员选择列表；
- 分队子 TAB；
- 报名人员展示。

---

## 五、球员选择交互

完成页面态球员选择逻辑：

- 复选框选择模式；
- 单组最多4名球员；
- 已选择球员实时显示在顶部固定区域；
- 支持取消选择。

选择规则：

位置顺序：

位置1 → 位置2 → 位置3 → 位置4

---

## 六、赛事内球员显示名称统一

本版本明确赛事内部显示名称规范：

赛事内不使用用户社区昵称。

统一使用：

displayName / competitionName

应用范围：

- 报名列表；
- 分组卡片；
- 球员选择页面。

---

## 七、T 台默认规则

完成球员进入分组时的默认 T 台逻辑：

男性：

默认蓝 T

女性：

默认红 T

说明：

T 台属于本赛事球员配置字段。

默认值可被后续：

- 修改 T 台功能；
- 赛事管理功能

覆盖。

---

# 当前版本数据状态

## 已实现

页面态分组数据：

detail 页面 data.groups

group-pick 页面：

页面态选择结果回传。

## 尚未实现

以下功能不包含在 v0.3：

- 分组数据写入 teamMatchStore；
- 分组跨页面持久化；
- 多用户同步查看；
- 出发表自动生成；
- 分组拖拽调整；
- 球员交换；
- M 按钮完整权限体系。

---

# 回滚说明

如果后续开发出现分组管理相关问题，可回滚至：

Git Tag：

v0.3-group-management-v1

该版本状态：

- 报名 TAB 已完成；
- 分组 TAB 页面框架完成；
- 分组选择流程完成；
- 分组数据仍为页面态。

回滚后可继续从：

「分组数据模型正式接入 teamMatchStore」

阶段重新开发。

---

# 下一版本规划方向

v0.4-group-data-model

计划：

- 将 groups 数据写入 teamMatchStore；
- 建立正式赛事分组数据结构；
- 支持赛事重新打开后恢复分组；
- 为出发表生成和记分系统接入提供数据基础。

## v0.4-theme-resource-bright-dark

Git Commit:
b290e64

Commit:
feat: add bright dark theme resources and enhance group management

完成内容：

1. 赛事视觉资源 B/D 双模式能力
- 广告图片支持 BRIGHT/DARK 独立上传；
- PARTNER图片支持 BRIGHT/DARK 独立上传；
- 建立主题图片数据结构；
- 增加旧数据兼容和fallback逻辑。
2. 分组管理能力增强
- 分组选择页面完善；
- 复选框选择球员；
- 单组最多4人；
- 已分配球员跨组锁定；
- 男蓝T/女红T默认T台规则；
- 确认按钮回传页面态。

当前未完成：

- 主题图片展示端全面接入；
- PARTNER展示效果优化；
- groups正式写入teamMatchStore；
- 出发表自动生成。

回滚节点：
v0.4-theme-resource-bright-dark

# v0.4-player-source-sheet

日期：
2026-07-xx

## 本版本目标

完成 GOLFBROTHERS 人员来源选择弹窗组件化改造第一阶段。

## 完成功能

### 1. 新增公共组件 player-source-sheet

新增：

components/player-source-sheet

负责：

- 人员来源选择底部弹窗；
- BRIGHT/DARK主题适配；
- 来源选项渲染；
- 点击事件返回。

支持：

- 好友列表
- 老牌组合
- 手工添加

---

## 2. 普通创建球局接入

原：

页面内联人员来源弹窗。

现：

统一调用：

player-source-sheet。

保持原流程：

点击空位
→ 选择来源
→ 好友/组合/手工
→ 原逻辑处理。

---

## 3. 记分页添加/删除接入

原：

score页面独立 add-sheet 弹窗。

现：

统一调用：

player-source-sheet。

保持：

- 好友选择逻辑；
- 老牌组合逻辑；
- 手工添加逻辑；
- slot绑定逻辑。

---

## 4. 本版本未修改内容

未修改：

- playerSlots 数据结构；
- groupsStore；
- 记分计算；
- 成绩继承逻辑；
- 添加/删除提交机制；
- 替他人报名流程。

---

## 架构意义

建立统一人员来源选择入口。

后续页面：

- 替他人报名；
- 分组管理；
- 出发管理；
- 选手管理；

可复用该组件。

## 下一阶段计划

第二阶段：

接入赛事详情页“替他人报名”。

注意：

替他人报名来源配置不同：

好友列表
+
球队成员列表
+
手工添加

不使用老牌组合。

## v0.4.2-group-manage-source-sheet-fix

修复记分页“添加/删除”人员来源弹窗显示错误问题。

完成：

- player-source-sheet移动至group-manage流程内部；
- 修复弹窗被管理层遮挡；
- 修复关闭管理页面后弹窗状态残留。

未修改：

- 人员选择逻辑；
- 成绩逻辑；
- playerSlots；
- groupsStore。

测试：

- 普通创建3人进入记分；
- 添加/删除补人；
- 弹窗关闭；
- 返回页面。

v0.5.5-sponsor-cos-images

赛事广告默认图已从本地 partners 图拆分出来
广告位使用独立 COS sponsor 图片
广告位支持 BRIGHT / DARK
带版本号缓存刷新机制
PARTNERS 配置未受影响

v0.5.8-team-match-management-flow

队内赛修改比赛入口与编辑模式
创建队内赛照片直播配置
分组 TAB 正式展示 + 独立分组编辑页
分组编辑草稿流程：取消不保存，确定后保存
允许清空所有分组并恢复无分组状态
开始分组 / 修改分组复用底部操作区
TAB 到底时隐藏底部操作按钮
M 面板增加导出分组表入口

v0.5.12-group-management-display-flow

分组管理与展示流程增强

- 支持四人四球比杆赛 / 最佳球位比杆赛组合分配
- 两个赛制在系统层面统一为组合比杆赛
- 支持自动组合、添加组合、删除组合、手工修改组合
- 修复分组与组合编辑中的勾选态问题
- 支持部分球员分组，不再要求报名球员全部进入分组
- 分组 TAB 通过报名名单 hydrate 昵称、头像、T台
- 正式 groups 仅保存 position + userId，展示字段不写入正式分组数据
- 未满 4 人分组展示时隐藏空位，但保留正式 position
- 统一多组 GAME 分组卡片球员展示标准：头像左，昵称/T台右
- 修复赛事信息 TAB 中参赛须知、赛事规则说明文字字号异常

v0.5.13-half-editor-register-sticky-fixes

- 普通创建多组「修改半场」弹窗对齐标准半场选择视觉
- 选中半场对应标准 PAR 行同步高亮
- 球队比赛「修改半场」对齐普通创建多组
- 普通创建多组 Game Hub 逐洞广告替换为广告图片1 B/D
- 交杯鲜啤演示赛事复用广告图片1与默认赛事信息
- 报名 TAB 改为：TAB 先吸顶，再按内容是否溢出决定是否锁定
- 移除报名 TAB 固定 7 人阈值逻辑
