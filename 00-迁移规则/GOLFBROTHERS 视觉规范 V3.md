# GOLFBROTHERS 视觉规范 V3.0

> 适用范围：**微信小程序主产品** UI（首页 / 赛事 / 创建 / 记分 / 个人中心 / 主包与相关分包）。不含云函数契约，不含海报工作室独立视觉。
> 版本：V3.0
> 更新：2026-09-07（对照主工程 token 与组件现行实现核对）
> 品牌色单一来源：[02-微信小程序工程/miniprogram/app.wxss](../02-微信小程序工程/miniprogram/app.wxss) 的 `page` token
> 主题表面单一来源（首页）：[02-微信小程序工程/miniprogram/pages/home/index.wxss](../02-微信小程序工程/miniprogram/pages/home/index.wxss)
> 赛事 / 创建页表面：[tournament-common.wxss](../02-微信小程序工程/miniprogram/styles/tournament-common.wxss)、[create-team-common.wxss](../02-微信小程序工程/miniprogram/subpackages/create/styles/create-team-common.wxss)
> Header 几何：[GOLFBROTHERS Header 规范 V1.0](./GOLFBROTHERS%20Header%20规范%20V1.md)

本文件描述**当前主产品正在运行的视觉语言**，不是理想稿，也不是删除历史文档的许可。

**与旧规范的关系（务必读）：**

- 对**新改动与新页面**，主产品色值、Tag 现行尺寸、状态语义以本文为准。
- [设计系统 V1](./GOLFBROTHERS%20-%20设计系统V1（强制规范）.md)、[Tag V5](./GOLFBROTHERS%20V5%20Tag%20标签视觉规范.md) 中出现的 `#005BAC`、`#C89B3C` 等色值、以及 Tag V5 的 48rpx / 12rpx 圆角，**不再作为主产品新工作的标准**。
- 这些旧 Markdown **仍保留在 `00-迁移规则/`**，供追溯迁移决策。本文「替代」的是**色值与 Tag 尺寸的权威引用**，不是要求删除或作废整份历史文件。

海报工作室（`02-微信小程序工程/miniprogram/subpackages/poster`）使用独立视觉语言（Arial / Georgia、`#ffd100` 等），**不得回写到主产品**。主体代码不得依赖 `03-海报沙盒` 或 `04-游戏沙盒`。

---

## 目录

- [1. 品牌定位](#1-品牌定位)
- [2. 品牌色（与主题无关，禁止改值）](#2-品牌色与主题无关禁止改值)
- [3. 表面色与文字色](#3-表面色与文字色)
- [4. 语义色](#4-语义色)
- [5. 字体](#5-字体)
- [6. 间距 / 圆角 / 阴影](#6-间距--圆角--阴影)
- [7. 组件](#7-组件)
- [8. 状态色语义（赛事）](#8-状态色语义赛事)
- [9. 主题开关](#9-主题开关)
- [10. 强制规则](#10-强制规则)
- [11. 代码索引](#11-代码索引)
- [12. 已知偏差（还债清单，不作为新标准）](#12-已知偏差还债清单不作为新标准)

---

## 1. 品牌定位

Golf Brothers 是面向业余高尔夫赛事组织的产品。视觉关键词：

| 关键词 | 落地方式 |
| --- | --- |
| Tour / PGA 赛事感 | 深蓝 Header、斜体重字、大写 Overline |
| 冠军与荣誉 | 冠军金仅用于 CTA、身份、荣誉、TAB 指示器 |
| 实时数据 | 信息蓝用于 LIVE、比分、文字链 |
| 可信与克制 | 浅灰画布、细描边卡片、系统中文无衬线 |

Wordmark：`GOLF` 白 + `BROTHERS` 金，900 / italic / uppercase。旗标布面为冠军金。细则见 Header 规范 V1.0。

原生导航栏（未自定义时）：标题 `GOLFBROTHERS`，底 `#F6F6F6`，黑字。产品页几乎全部 `navigationStyle: custom`，改用 `gb-header` / 首页 `ds-app-header`。

---

## 2. 品牌色（与主题无关，禁止改值）

定义于 `app.wxss` → `page`。Dark / Bright **不得改这三色**。

| Token | HEX | 语义 | 允许用途 | 禁止用途 |
| --- | --- | --- | --- | --- |
| `--champion-gold` | `#CE9224` | 冠军金 | 主 CTA（创建 / 确认 / 添加）、Header 底边、TAB 指示器、底部导航选中、FAB、队长 / 冠军 / MVP | 普通分类、性别、已报名、18 洞 |
| `--tour-blue` / `--pga-blue` | `#002D62` | Tour 蓝 | Header、TAB 条、主按钮（浏览）、卡片顶条、选中态、进行中（非 LIVE） | LIVE 状态、文字链、比分高亮 |
| `--data-blue` | `#00AEEF` | 信息蓝 | LIVE、实时比分、文字按钮、Overline 数据标签、蓝 T | 主 CTA、Header 底 |

别名（**不是** `app.wxss` 全局 token，值必须仍是 `#002D62`）：

- `--primary-blue`：首页 `pages/home/index.wxss` 的 `page` 别名，`--tour-blue: var(--primary-blue)`
- `--cloud-blue`：部分页面局部声明或 `var(--cloud-blue, #002d62)` 回退。新代码应直接用 `--tour-blue`，不要再复制一份别名

Header 底色 Engine 内联 `#002D62`，与 `--tour-blue` 同值。

---

## 3. 表面色与文字色

### 3.1 Bright（默认）

首页 `page` / `.ds-app` 与赛事 `.bright-mode` 应对齐（赛事另有 `--bg-secondary: #F1F5F9`）：

| Token | HEX | 用途 |
| --- | --- | --- |
| `--bg-primary` | `#FCFCFC` | 页面底 |
| `--bg-card` | `#FFFFFF` | 卡片 / 底栏 |
| `--bg-subtle` | `#F3F4F6` | 输入填充、次级块（首页） |
| `--bg-secondary` | `#F1F5F9` | 创建/详情次级块（赛事 Bright；首页无此 token） |
| `--bg-hover` | `#F9FAFB` | 点击反馈 |
| `--border` | `#E5E7EB` | 1px 发丝线 |
| `--border-hover` | `#D1D5DB` | 控件描边强调 |
| `--text-primary` | `#002D62` | 标题（= Tour 蓝） |
| `--text-secondary` | `#374151` | 正文 |
| `--text-muted` | `#6B7280` | 辅助、Hint（首页） |
| `--text-tertiary` | Bright `#6B7280` / Dark `#888888` | 创建页 `create-team-common` 专用；**首页未定义**，不要当成全局 token |
| `--text-disabled` | `#9CA3AF` | 禁用 |
| `--text-on-dark` | `#FFFFFF` | 深蓝 / 金色底上的字 |

系统窗体默认底（`app.json`）：`#F6F6F6`。仅用于原生导航与未套设计系统的 page 底，产品内容区用 `--bg-primary`。

### 3.2 Dark（当前存在两套，迁移时向首页收敛）

| 体系 | 入口 class | `--bg-primary` | `--bg-card` | `--text-primary` | `--text-muted` |
| --- | --- | --- | --- | --- | --- |
| 首页 / 个人中心（推荐） | `.ds-app.dark-theme` | `#050816` | `#0B1220` | `#E5EEFC` | `#94A3B8` |
| 赛事详情 / 创建页（现状） | `.detail-page.dark-mode` / `.create-page.dark-mode` | `#000000` | `#111111` | `#F1F5F9` | `#888888` |

规则：

- 品牌三色不变。
- Bright 下卡片标签用 Tour 蓝；Dark 下同类标签用冠军金（如 `.info-row-label`）。
- 选中态仍用 Tour 蓝或冠军金描边，**禁止** Dark 改成「黑底黑选中」。
- 产品只有 Bright / Dark 两档。赛事纯黑是历史实现，**不是**第三套品牌色。

---

## 4. 语义色

| Token / 用法 | HEX | 场景 | 验证 |
| --- | --- | --- | --- |
| `--success` | `#16A34A` | 成功、已确认（非 LIVE） | 首页 token |
| `--warning` | `#D97706` | 警告（非荣誉金） | 首页 token |
| `--error` | `#DC2626` | 错误、删除；新代码用此值 | 首页 token |
| 部分创建/强调红 | `#EF4444` | `--accent-red` 或个别 `--error` 覆盖 | 偏差，见第 12 节 |
| LIVE / 进行中数据 | `#00AEEF` | 呼吸点 + 描边或实心底 | `--data-blue` |
| 已结束 Badge | `#6B7280` | 灰底白字斜体 | 与 muted 同色阶 |
| 性别文字男 | `#38BDF8` | `.gender-male` / `.gender-m` | `app.wxss` |
| 性别文字女 | `#F472B6` | `.gender-female` / `.gender-f` | `app.wxss` |
| T 台点 · 男 | `#3B82F6` | `.gb-group-player-tee-dot--male` | `app.wxss` |
| T 台点 · 女 | `#EF4444` | `.gb-group-player-tee-dot--female` | `app.wxss` |

统计页等处性别色可能不同（如 `#2563eb`），**不要升格为全站规范**，以 `app.wxss` 的 `.gender-male` / `.gender-female` 为准。

### 4.1 T 台色（记分页 `resolveScoreTeeStyle`）

| T 台 | Token 语义 | HEX |
| --- | --- | --- |
| 黑 T | 最前发球台 | `#111827` |
| 金 T | 金发球台 | `#CE9224` |
| 白 T | 白发球台 | `#FFFFFF` |
| 红 T | 女默认 / 红发球台 | `#DC2626` |
| 蓝 T | 男默认 | `#00AEEF` |

缺省：`gender === female` → 红 T，其余 → 蓝 T。

---

## 5. 字体

无自定义 Webfont。主产品栈（首页 `page`）：

```
-apple-system, BlinkMacSystemFont, 'Segoe UI',
'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif
```

数字成绩使用 `font-variant-numeric: tabular-nums`。品牌 / Display / CTA 使用 **900 + italic**。

### 5.1 层级（rpx 优先；首页部分 px 为历史残留）

| 角色 | 规格 | 来源 class |
| --- | --- | --- |
| Display | 2.25rem / 900 / italic / uppercase / tracking -0.05em | `.ds-display` |
| Header 眉题 | 17rpx / 900 / tracking 0.24em / 白 50% | `.gb-header__eyebrow`（tournament-common） |
| Header 标题 | 32rpx / 900 / italic / 白 | `.gb-header__title` |
| 卡片 / 页面 Title | 32rpx / 600–800 / `--text-primary` | 创建页 Title（量级，非单一 token） |
| Section H2 | 28rpx / 700 / `--text-secondary` | `.section-label__h2` |
| Overline / Meta label | 首页 `.ds-overline` 为 **10px / 900 / tracking 0.14em**；他页常见 20rpx / 0.1em | 不要合成一个未落地的统一 token |
| 正文 | 24rpx / 400 / 行高 36rpx / `--text-secondary` | `.ds-desc-text`（创建侧；待页面核对时以 class 为准） |
| 正文加粗 | 0.875rem / 700 | `.ds-body-bold` |
| Hint | 22rpx 量级 / muted 或 `--text-tertiary` | 创建页 Hint；首页用 `--text-muted` |
| 数据值 | 32rpx / 800 / italic / tabular | `.data-value` |
| TAB | 26rpx（`.font-large` 时 30rpx） | `--tab-font-size`（`app.wxss`）；字重/tracking 随页面 class，**未做成全局 token** |
| 底栏文案 | 11px / 400 / uppercase / tracking 0.1em / line-height 1 | `.bottom-tab-text` |
| Badge | 20rpx / 900 / tracking 0.04em | `.ds-badge` |
| 球员昵称（分组） | 22rpx / 700 | `.gb-group-player-name` |
| T 台文字 | 18rpx / 700 / muted | `.gb-group-player-tee-text` |

禁止：页面私自发明第四套正文号；用 `#999` 代替 `--text-muted`。

---

## 6. 间距 / 圆角 / 阴影

| Token | 值 | 用途 |
| --- | --- | --- |
| `--space-page` | 16px | 首页内容左右 |
| `--space-section` | 24px | 区块间距 |
| 创建 / 详情内容 pad | 32rpx | `.content` `.pad-card` |
| 卡片内 pad | 12px 或 32rpx | 首页 `--card-padding` vs 赛事 |
| Sheet 左右 | 40rpx | `.register-sheet` |
| `--card-padding-x` | 16px | 列表行 |
| `--radius-sm/md/lg/xl` | 4 / 6 / 8 / 12px | 按钮、Badge、小块 |
| 卡片圆角 | 16rpx | `.ds-card` |
| Overlay 面板 | `--overlay-panel-radius` 24px | 半屏弹层 |
| 输入 / 主按钮高 | 88rpx，圆角 16rpx | 报名 Sheet、底栏 CTA |
| `--tab-height` | **50px** | 全局唯一，禁止页面覆盖 |
| `--bottom-nav-height` | 56px | 底栏（首页 token） |
| `--fab-size` | 56px | 创建 FAB |
| `--team-logo-size` | 72px | 赛事 Hero 队标（固定 px，tournament-common） |
| 首页俱乐部 LOGO | 64×64 px | `.ds-card-club__avatar-col` |
| 分组成员头像 | 80rpx 圆 | `.gb-group-player-avatar` |
| `--tab-indicator-height` | 3px | 金色条，禁止改粗细 |
| `--shadow-card` | `0 4px 6px -1px` 5% 黑（Bright 首页） | 卡片 |
| `--shadow-fab` | `0 10px 25px` 金 35% | FAB 上浮 |
| Header 底边 | **2px solid 冠军金** | 全站 Header 识别 |

TAB 指示器**宽度**不是全局 token：首页 `.tab-indicator` 为 **80px**；赛事 `.tab-btn.active::after` 为 **112rpx**。新页跟随所在壳层，不要发明第三宽度；是否收敛为单一值 **待产品确认**。

布局冻结（首页）：宽度链只能 100%；禁止 `100vw`、`transform: scale()` 做布局、`margin: auto` 居中壳。

---

## 7. 组件

### 7.1 Header

与 [Header 规范 V1.0](./GOLFBROTHERS%20Header%20规范%20V1.md) 一致，此处不重复公式：

```
背景 --tour-blue（Engine 内联 #002D62）
底边 2px --champion-gold
返回热区 56×56 rpx；字形 52rpx
眉题 17rpx + 斜体标题 32rpx（白）
右侧：主题 D/B 等，不抢品牌区、不画假胶囊
```

几何由 `headerEngine.js` 用 **px** 计算（左/下 16px，右为胶囊预留），不要用 rpx 重算安全区。

### 7.2 TAB

- 条背景：Tour 蓝，高 **50px**（`--tab-height`）
- 未选：白 50%（`--tab-inactive-color`）
- 选中：白（`--tab-active-color`）
- 指示器：高 3px、冠军金、贴底居中；宽见第 6 节（80px 或 112rpx）
- Dark / Bright **颜色一致**（TAB 在深蓝条上，不随主题变）

### 7.3 底部导航

- 底：`--bg-card`，顶发丝线
- 未选：`--text-muted`；选中：冠军金
- 图标盒 24px，glyph 约 20px（首页现行；约数为实现观察，非独立品牌 token）
- 中央 FAB：冠军金圆、白「+」、3px `--bg-card` 描边环、金色投影
- safe-area；额外上浮像素以首页实现为准，**不升格为全站必须 10px**

### 7.4 按钮

| 类型 | 视觉 | 语义 |
| --- | --- | --- |
| Accent `.ds-btn-accent` | 金底白字，14px / 900 italic，pad 10×32，圆角 6px | 创建 / 修改 / 添加 / 确认 |
| Accent pill | 同上，圆角 9999 | 首页主 CTA |
| Primary `.ds-btn-primary` | 深蓝底白字，14px / 700，pad 10×24 | 浏览、次主操作 |
| Text `.ds-btn-text` | 信息蓝，11px / 700，无底 | 文字链 |
| Sheet 确认 | 金底，高 88rpx，宽 flex:2，900 | 弹层主操作 |
| Sheet 取消 | `--bg-secondary`，flex:1，800 | 次操作 |
| 轻量添加 | 灰描边 + icon + 文案，不可抢金 CTA | 添加费用 / 分队 |

金 = 行动；蓝 = 浏览。禁止把浏览按钮做成金色。

### 7.5 卡片

结构：`Title → Description → Content → Action`，禁止 title 与 value 混排。

- `.ds-card`：白底、1px `--border`、**顶条 6rpx Tour 蓝**、16rpx 圆角（赛事 tournament-common）
- `.ds-card-action--gold`：左边 4px 金（创建入口）
- `.ds-card-tour` 高 88px；赛事信息卡 pad 32rpx
- Dark 下创建入口标题用反白，禁止深底深字

### 7.6 Badge / Tag（当前实现）

结构：`Icon（可选）+ 文字`。相对 Tag V5 文档更紧（权威以本文 + `.ds-badge` 为准，不删除 Tag V5 文件）：

| 规格 | 值 |
| --- | --- |
| 高度 | 40rpx |
| 左右 pad | 16rpx |
| 圆角 | **4rpx**（不是 Tag V5 的 12rpx） |
| 字号 | 20rpx / 900 / tracking 0.04em |
| 状态类 | 斜体 |

| 变体 | 背景 / 字 | 语义 |
| --- | --- | --- |
| `.badge-gold` | 金 / 白 / italic | 报名中、荣誉、身份 |
| `.badge-live` / `.badge-info` | 信息蓝 / 白 / italic | LIVE、信息强调 |
| `.status-tag--live .ds-badge` | 透明底 + 信息蓝描边 + 呼吸点 | 首页 LIVE（描边式） |
| `.badge-finished` | `#6B7280` / 白 / italic | 已结束 |
| Selection 未选 | `--bg-secondary` | 选项 |
| Selection 选中 | 金描边 + Tour 蓝 8% 底（报名 Sheet）或 Tour 蓝实心 | 当前选择 |

金色 Tag **只**给稀缺身份与荣誉。LIVE **只用信息蓝**。

### 7.7 表单与 Sheet

- Label：22–26rpx / 700–800 / muted / 可 uppercase（量级，非单一 token）
- 输入高 88rpx（首页 overlay 可用 12px 16px pad）
- 填充 `--bg-subtle` / `--bg-secondary`，圆角 16rpx
- 性别 / 分组 chip 高 72rpx，选中：金边 + 蓝 8% 底
- Radio 点 40rpx，选中 Tour 蓝实心 + 白内点 16rpx

### 7.8 分组球员 `.gb-group-player`

头像左 80rpx，昵称 / T 台右。四列网格 `gap: 12rpx 8rpx`。带队名时改为列布局，队标在头像下。队标具体像素以 `app.wxss` 现行规则为准，不把未核对数字写成规范。

---

## 8. 状态色语义（赛事）

| 状态 | 色 | 说明 |
| --- | --- | --- |
| 报名中 | 冠军金 | 可行动、待发生 |
| LIVE / 进行中（实时） | 信息蓝 | 数据在跳 |
| 进行中（非直播条） | Tour 蓝 | 选中、当前 TAB |
| 已结束 | `#6B7280` | 中性结束 |
| 草稿 | 金半透明底 + 金字 | 具体 alpha 随页面；**18% 为常见实现观察，待确认是否收口** |
| 取消 / 关闭 | `--error` | 不可逆异常 |
| 成功 / 已确认 | `--success` | 完成闭环 |

---

## 9. 主题开关

入口：Header 圆形 72rpx，白 10% 底 + 白 20% 边。按下 `scale(0.92)`。
产品只有 **Bright / Dark** 两档。新页面优先复用 `.ds-app.dark-theme` 海军暗色；赛事纯黑是历史实现。

---

## 10. 强制规则

1. **品牌三色只在 `app.wxss` 改。** 页面不得重新定义 `--champion-gold` / `--tour-blue` / `--data-blue` 为别的 HEX。
2. **同类信息同一视觉。** 创建普通赛 / 队内 / 队际 / 系列赛共用 `create-team-common`。
3. **禁止页面级 UI 发明**（新字号、新灰、新圆角）。
4. **TAB 高度 / 指示器粗细与颜色** 只走全局 token；宽度暂按壳层。
5. **金 ≠ 强调色。** 金 = 行动与荣誉。
6. **信息蓝 ≠ 主品牌。** 信息蓝 = 实时与链接。
7. **海报 token 不进主包。** 沙盒不是权威实现。
8. **不要用 scroll / 弹窗残留驱动样式。** 状态来自 data / form / 明确 computed。
9. **Header 几何只走 Header Engine。** 细则见 Header 规范 V1.0。

---

## 11. 代码索引

路径相对仓库根目录。

| 内容 | 文件 |
| --- | --- |
| 品牌色、TAB token、分组球员标准 | `02-微信小程序工程/miniprogram/app.wxss` |
| 首页完整 Design System（含 Bright/Dark 表面） | `02-微信小程序工程/miniprogram/pages/home/index.wxss` |
| 赛事详情 / Hub 共用 | `02-微信小程序工程/miniprogram/styles/tournament-common.wxss` |
| 创建三赛种共用 | `02-微信小程序工程/miniprogram/subpackages/create/styles/create-team-common.wxss` |
| 系列赛详情差异 | `02-微信小程序工程/miniprogram/subpackages/tournament/pages/series-detail/index.wxss` |
| 窗体默认色 | `02-微信小程序工程/miniprogram/app.json` → `window` |
| T 台色逻辑 | `02-微信小程序工程/miniprogram/subpackages/scoring/pages/score/index.js` → `resolveScoreTeeStyle` |
| Header 几何 | `02-微信小程序工程/miniprogram/utils/headerEngine.js` |

---

## 12. 已知偏差（还债清单，不作为新标准）

| 偏差 | 现状 | 规范方向 |
| --- | --- | --- |
| 两套 Dark | 首页海军 vs 赛事纯黑 | 新页用海军 Dark；是否改旧页待产品确认 |
| Tag V5 文档 vs 实现 | 历史文档写 48rpx / 12rpx 圆角 / PGA `#005BAC` | 新工作以本文 40rpx / 4rpx / `#002D62` 为准；保留历史文件 |
| `--error` 双值 | `#DC2626` 与 `#EF4444` | 语义错误用 `#DC2626` |
| px / rpx 混用 | 首页大量 px | 新样式优先 rpx；Header 安全区保持 px |
| `--cloud-blue` 页面重复声明 | 多处局部 `--cloud-blue: #002d62` | 应只继承 `--tour-blue` |
| LIVE Badge 双形态 | 实心蓝 vs 描边蓝+呼吸点 | 首页列表用描边；详情芯片可用实心，色必须是信息蓝 |
| 记分页 Header 尺寸 | 热区 72rpx 等 | 见 Header 规范第 10 节，不升格 |
| TAB 指示器宽度 | 80px vs 112rpx | 待产品确认是否统一 |
