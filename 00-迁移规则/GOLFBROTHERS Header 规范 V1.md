# GOLFBROTHERS Header 规范 V1.0

> 适用范围：主产品中所有 `navigationStyle: custom` 的页面（不含海报工作室独立视觉）
> 版本：V1.0
> 更新：2026-09-07（对照 `headerEngine.js` 与 `.gb-header*` 现行实现核对）
> 几何唯一来源：[02-微信小程序工程/miniprogram/utils/headerEngine.js](../02-微信小程序工程/miniprogram/utils/headerEngine.js) → `createHeaderStyle()`
> 内页视觉母版：[02-微信小程序工程/miniprogram/styles/tournament-common.wxss](../02-微信小程序工程/miniprogram/styles/tournament-common.wxss) 的 `.gb-header*`
> 上级文档：[GOLFBROTHERS 视觉规范 V3.0](./GOLFBROTHERS%20视觉规范%20V3.md)

Header **不是**全局组件。各页复制同一套 DOM，但**高度、内边距、胶囊避让必须全部来自 Header Engine**。禁止页面用 rpx 或写死 px 重算安全区。

本文与视觉规范 V3.0 的 Header 章节应对齐：Tour 蓝底、冠军金 2px 底边、Engine 用 px、字形/热区用 rpx。

---

## 目录

- [1. 原则](#1-原则)
- [2. 页面配置](#2-页面配置)
- [3. 高度与胶囊避让（Header Engine）](#3-高度与胶囊避让header-engine)
- [4. 结构（两种合法模板）](#4-结构两种合法模板)
- [5. 页面标题](#5-页面标题)
- [6. 返回按钮](#6-返回按钮)
- [7. 胶囊（系统控件）](#7-胶囊系统控件)
- [8. 颜色与层级（Header 内）](#8-颜色与层级header-内)
- [9. 接入清单（新页必做）](#9-接入清单新页必做)
- [10. 已知偏差（不作为新标准）](#10-已知偏差不作为新标准)
- [11. 代码索引](#11-代码索引)

---

## 1. 原则

1. 产品页隐藏系统导航栏，自绘深蓝 Header + 金色底边。
2. **真实微信胶囊必须露出来**，Header 只给它留空，不画假胶囊。
3. 内容区（返回 + 标题）垂直对齐系统胶囊中线。
4. 单位：Engine 输出全部是 **px**；字形 / 热区尺寸用 **rpx**。
5. Dark / Bright **不改** Header 底色、底边、标题色。Header 永远在 Tour 蓝上。

---

## 2. 页面配置

```json
{
  "navigationStyle": "custom"
}
```

写在**该页** `index.json`。`app.json` 的 `window` 不设 custom，仅给未迁移页兜底：

| 字段 | 值 |
| --- | --- |
| `navigationBarBackgroundColor` | `#F6F6F6` |
| `navigationBarTextStyle` | `black` |
| `navigationBarTitleText` | `GOLFBROTHERS` |

仍走系统栏、不要当成产品 Header 的例外：启动兼容页 `pages/index`（仅 `reLaunch` 到首页）、扫码加入、海报页等。

---

## 3. 高度与胶囊避让（Header Engine）

常量（只允许改 `headerEngine.js`；下表为当前实现，不是可随意微调的设计旋钮）：

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `PADDING_LEFT` | **16px** | 内容区左内边距 |
| `PADDING_BOTTOM` | **16px** | 内容行底到 Header 底（含金色描边所占盒模型） |
| `MIN_CONTENT_HEIGHT` | **32px** | 内容行最小高度（对齐常见胶囊高） |
| `FALLBACK_STATUS_BAR` | 24px | 读不到窗口信息时 |
| `FALLBACK_PADDING_RIGHT` | **96px** | 读不到胶囊时右侧预留 |
| `HEADER_BG` | `#002D62` | 与 `--tour-blue` 同值，Engine 内联写出 |

运行时读取（当前实现）：

1. 优先 `wx.getWindowInfo()` → `statusBarHeight`、`windowWidth`（失败或宽度不可用时回退 `wx.getSystemInfoSync()`）
2. `wx.getMenuButtonBoundingClientRect()` → 胶囊 `top` / `height` / `bottom` / `left`

主路径公式（有可用胶囊矩形时）：

```
headerPaddingTop     = capsule.top
headerContentHeight  = max(capsule.height, 32px)
headerBarMinHeight   = headerPaddingTop + headerContentHeight + 16px
headerTotalHeight    = max(
                         capsule.bottom + 16px,
                         headerBarMinHeight
                       )
headerPaddingRight   = max(windowWidth - capsule.left + 8px, 96px)
```

几何含义：

```
┌─────────────────────────────────────────────┐
│  padding-top = 胶囊 top（含状态栏空隙）        │
│  ┌──────────┐              ┌──────────────┐ │
│  │ 返回+标题 │  ← 同行垂直居中 → │  系统胶囊  │ │
│  └──────────┘              └──────────────┘ │
│  padding-bottom = 16px                       │
│  ████████ 2px 冠军金底边 ████████████████████│
└─────────────────────────────────────────────┘
  左 16px                          右 ≥ 胶囊左缘+8px
  根节点总高 = headerTotalHeight（px，随设备变，禁止写死）
```

输出绑到 WXML：

| 字段 | 作用 |
| --- | --- |
| `headerRootStyle` | 根：`height` 与 `min-height` = **headerTotalHeight**；底 `#002D62`；`border-bottom: 2px solid var(--champion-gold)`；`flex-shrink:0` |
| `headerBarStyle` | 内条：四向 padding；`height` / `min-height` = **headerBarMinHeight**（不是盲目等于总高）；`display:flex; align-items:center` |
| `metrics.headerTotalHeight` | 可选；吸顶 TAB 可贴根节点下沿 |

胶囊矩形正常时，`headerTotalHeight` 与 `headerBarMinHeight` 通常相等。若 `capsule.bottom` 大于 `top + content`，根节点取较大值，内条仍按 content 行高。这是引擎实现细节，**不要当成单独的产品高度规范**。

**无胶囊 / 无窗口信息时的 fallback（仅兜底，不是设计公式）：** 当前代码使用 `paddingTop = statusBarHeight + 8`，再加 32px 内容与 16px 底边。`+ 8` 是实现兜底，**不得提升为产品几何**。新页不得手写该公式。

页面接入（路径按页面深度调整；引擎文件固定在 `miniprogram/utils/headerEngine.js`）：

```js
const { createHeaderStyle } = require('../../utils/headerEngine.js');

initHeaderNav() {
  const header = createHeaderStyle();
  this.setData({
    headerRootStyle: header.headerRootStyle,
    headerBarStyle: header.headerBarStyle
  });
}
```

在 `onLoad` 调一次。禁止：

- 用 `statusBarHeight + 44` 一类经验公式，或把 fallback 的 `+ 8` 抄进页面
- 用 rpx 写 Header 高度
- 覆盖 `padding-right`（会撞胶囊）
- 把 `height` 改成 `auto`

---

## 4. 结构（两种合法模板）

### 4.1 内页（默认）

```
.gb-header[style=headerRootStyle]
  .gb-header__inner[style=headerBarStyle]
    .gb-header__left
      .gb-header__back     → 返回
      view
        .gb-header__eyebrow  → 英文眉题
        .gb-header__title    → 中文页名
    （右侧默认空；避让靠 padding-right）
```

赛事详情注释即标准：**右侧不绘制假胶囊**。

### 4.2 首页（根页，无返回）

```
.ds-app-header[style=headerRootStyle]
  .ds-app-header-bar[style=headerBarStyle]
    .ds-header-bar__brand    → 旗标 + GOLF BROTHERS
    .ds-app-header-actions   → 主题开关等（必须落在 padding-right 左侧）
```

首页根 Header **没有**返回。Wordmark 代替 eyebrow + title。

---

## 5. 页面标题

双行固定，不可改成单行系统标题，也不可把中文放进 eyebrow。

| 元素 | 规格 | 内容规则 |
| --- | --- | --- |
| Eyebrow | 17rpx / 900 / tracking **0.24em** / 白 **50%** / line-height 1 / 下间距 **6rpx** | 英文大写模块名：`TOURNAMENT` `SERIES` `SCORECARD` `CREATE` `FEEDBACK` `HISTORY` … |
| Title | **32rpx** / **900** / **italic** / 白 / line-height 1 | 中文页名，短、不换行。动态名用数据绑定，仍走此 class |

首页 Wordmark（仅首页，对照 `pages/home/index.wxss`）：

| 元素 | 规格 |
| --- | --- |
| `GOLF` | 18px / 900 / italic / uppercase / 白 / tracking -0.8px / line-height 0.85 |
| `BROTHERS` | 同规格，色冠军金 |
| 旗标 | 15×22px；杆 3px（`currentColor`，即白）；布面冠军金 |

Eyebrow 不是 SEO 标题，是模块锚点。同一模块多页共用一个 eyebrow（如动态列表 / 详情都是 `MOMENT`），用 title 区分。

---

## 6. 返回按钮

以内页母版 `tournament-common.wxss` 为准：

| 项 | 规范 |
| --- | --- |
| 热区 | **56×56 rpx**，flex 居中，无底无边 |
| 字形 | 字符 `‹`（单角引号），**52rpx**，白，line-height 1 |
| 与标题间距 | **20rpx**（`.gb-header__left` 的 `gap`） |
| 无障碍 | `aria-label="返回"` |
| 行为 | 栈深 > 1 → `wx.navigateBack({ delta: 1 })`；否则回到首页（`redirectTo` / `reLaunch` `/pages/home/index`） |
| 首页 | **不渲染**返回 |

禁止换成系统 `navigator` 默认样式、汉堡菜单、或把热区缩到字形大小。记分页允许有更复杂的返回路由，**视觉仍必须符合上表**（现状偏差见第 10 节，不改代码、不把记分页数字升格为规范）。

---

## 7. 胶囊（系统控件）

微信右上角 **胶囊是系统原生控件**，自定义导航无法改其大小、位置、颜色。产品侧只做三件事：

1. `navigationStyle: custom` 后胶囊仍在，必须给它对齐。
2. `padding-right = windowWidth - capsule.left + 8px`（且 ≥ 96px），保证标题 / 主题钮不伸进胶囊。
3. **禁止绘制假胶囊**（三点 + 竖线 + 圆圈）。首页 `.status-pill` 已 `display:none`；赛事详情已不画。记分页 `.mini-program-pill` 属于历史 residual，**新页禁止复制**。是否从旧页删除 DOM 待后续产品/工程决策，本文不要求立即改主体代码。

右侧若要放控件（主题 D/B 等）：

| 项 | 规范 |
| --- | --- |
| 位置 | 内容行内、`padding-right` **内侧**，与胶囊垂直居中 |
| 主题钮 | 72rpx 圆；白 10% 底 + 白 20% 边；图标 28rpx |
| 间距 | 控件之间 **12px**（首页 `.ds-app-header-actions` 现行值） |
| 假胶囊占位 | 禁止 |

---

## 8. 颜色与层级（Header 内）

| Token | 值 | 用途 |
| --- | --- | --- |
| 背景 | `#002D62`（`--tour-blue`） | 根背景，Engine 内联写出 |
| 底边 | `2px solid var(--champion-gold)` | `#CE9224`，全站识别条 |
| 标题 / 返回 / Wordmark 主色 | `#FFFFFF` | 深蓝上的字 |
| Eyebrow | `rgba(255,255,255,0.5)` | 模块名 |
| `BROTHERS` / 旗布 | `--champion-gold` | 仅首页 Wordmark |

`z-index`：Header 高于滚动内容（首页 `z-index: 50`）。吸顶 TAB 贴在 Header **下沿**，不要盖住胶囊。

---

## 9. 接入清单（新页必做）

1. `index.json` → `"navigationStyle": "custom"`
2. `require` `headerEngine.js`，`onLoad` 调 `initHeaderNav`
3. 根 / 内条绑定 `headerRootStyle` / `headerBarStyle`
4. 复制 `.gb-header*` 样式（`@import` tournament-common 或 create-team-common，不要改数字）
5. 内页：返回 + eyebrow + title；首页才用 Wordmark
6. 右侧不画胶囊；需要动作时放在 padding-right 内侧
7. `onBack` 按第 6 节

---

## 10. 已知偏差（不作为新标准）

| 页面 | 偏差 | 规范值 |
| --- | --- | --- |
| 记分页 `.gb-header__back` | 72rpx 热区、chevron 40rpx、gap 24rpx、eyebrow 18rpx | 56×56 / 52 / 20 / 17 |
| 记分页 `.mini-program-pill` | 假胶囊样式仍在 | 新页禁止复制；旧页删除待决策 |
| 首页 WXML `.status-pill` | 仍存在，靠 CSS 隐藏 | 从 DOM 删除待决策 |
| 记分页 / 部分页 | Header CSS 本地拷贝且数字漂移 | 收敛到 tournament-common（工程债） |

---

## 11. 代码索引

路径相对仓库根目录。权威实现仅在主工程；不要对照海报/游戏沙盒。

| 内容 | 文件 |
| --- | --- |
| 高度 / 胶囊公式 | `02-微信小程序工程/miniprogram/utils/headerEngine.js` |
| 内页 Header 视觉母版 | `02-微信小程序工程/miniprogram/styles/tournament-common.wxss`（`.gb-header`） |
| 创建页 Header | `02-微信小程序工程/miniprogram/subpackages/create/styles/create-team-common.wxss` |
| 首页 Header | `02-微信小程序工程/miniprogram/pages/home/index.wxss`（`.ds-app-header`） |
| 内页结构范例 | `02-微信小程序工程/miniprogram/subpackages/tournament/pages/detail/index.wxml` |
| 首页结构范例 | `02-微信小程序工程/miniprogram/pages/home/index.wxml` |
| 窗体默认色 | `02-微信小程序工程/miniprogram/app.json` → `window` |
