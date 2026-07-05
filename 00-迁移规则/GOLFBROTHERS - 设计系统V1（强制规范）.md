# 

```
# GOLFBROTHERS 设计系统 V1（强制规范）> 适用于：创建队内赛 / 普通创建 / 队际赛 / 系列赛等所有页面  > 版本：V1  > 生效范围：整个小程序 UI 开发（Cursor 必须遵守）---# 🚨 一、设计系统目标本设计系统用于统一 GOLFBROTHERS 全部 UI 结构与视觉规范，确保：- 相同信息 = 相同视觉表达- 相同组件 = 相同结构- 禁止页面级自由设计- 禁止局部样式发明---# 🎯 二、Typography（字体系统）## 🟢 Title（标题）用于：页面标题 / 卡片标题```cssfont-size: 32rpx;font-weight: 600;line-height: 44rpx;color: var(--text-primary);
```

---

## 🟡 Description（说明文字）

用于：设置项说明 / 辅助说明

```
font-size: 24rpx;font-weight: 400;line-height: 36rpx;color: var(--text-secondary);
```

---

## 🔵 Hint（辅助提示）

用于：输入提示 / 弱提示 / placeholder替代说明

```
font-size: 22rpx;font-weight: 400;line-height: 32rpx;color: var(--text-tertiary);
```

---

## ❌ 禁止行为

- 页面单独定义 font-size
- 使用 #999 / rgba 替代 token
- 同级文字多套标准
- 随意调整 line-height

---

# 🎨 三、Color System（颜色系统）

## ✔ 强制 Token

仅允许使用：

- var(--text-primary)
- var(--text-secondary)
- var(--text-tertiary)
- var(--bg-card)
- var(--border)
- var(--champion-gold)
- var(--danger)

---

## ❌ 禁止

- #000 / #333 / #666 / #999
- rgba 自定义灰阶
- 页面临时颜色

---

# 🧩 四、Component System（组件系统）

---

## 🟦 Tag / Chip（费用 / 分队 / 状态展示）

统一用于：

- 费用设置
- 分队设置
- 赛制结果

```
display: inline-flex;align-items: center;justify-content: center;padding: 6rpx 12rpx;font-size: 26rpx;border-radius: 12rpx;background: var(--bg-chip);color: var(--text-primary);
```

---

## 🟩 Card（设置项容器）

统一结构必须为：

```
TitleDescriptionContentAction
```

---

## 🟨 Action Button（轻量按钮）

用于：

- 添加费用项
- 添加分队
- 添加赛事信息

规范：

- 小尺寸
- 灰色边框
- icon + text
- 不可抢视觉权重

---

# 📐 五、Layout System（布局系统）

---

## ✔ 页面结构

所有页面必须遵循：

```
HeaderScroll ContentBottom Sheet（弹窗）
```

---

## ✔ 卡片内部结构

必须遵循：

```
TitleDescriptionValue / ContentAction
```

---

## ❌ 禁止

- title 与 value 混排
- description 与 tag 混层
- flex 嵌套无结构控制

---

# 🧠 六、State System（状态系统）

---

## ✔ UI状态来源

必须来自：

- data
- form
- computed（明确函数）

---

## ❌ 禁止依赖

- scroll
- lifecycle（onShow/onReady副作用）
- hidden 状态作为逻辑依据
- DOM状态

---

# 🧨 七、强制约束（非常重要）

---

## 🚨 Rule 1：禁止页面级 UI 发明

所有 UI 必须来源于设计系统，不允许临时样式。

---

## 🚨 Rule 2：禁止双体系 UI

同类组件必须统一，例如：

- 普通创建 ≠ 队内赛不同样式
- Tag / Card / Text 必须统一

---

## 🚨 Rule 3：禁止视觉修补开发

禁止：

- 用 margin 修对齐
- 用 font-size hack 视觉
- 用 padding 修布局
- 用 scroll trick 修 UI

---

## 🚨 Rule 4：禁止状态污染 UI

UI 不允许依赖：

- scroll 状态
- 弹窗状态残留
- hidden 切换副作用

---

# 📊 八、验收标准

所有页面必须满足：

- 同类文字视觉一致
- Tag 风格统一
- Card 结构统一
- 不存在页面级 UI 差异
- UI 不依赖 scroll / lifecycle
- 不存在局部 CSS 标准

---

# 🚀 九、系统目标

本设计系统的目标是：

> GOLFBROTHERS 所有页面 = 同一视觉语言系统

---

# 📌 十、强制使用声明

Cursor 必须遵守本设计系统，不得局部偏离或自定义 UI 标准。

> 适用于：创建队内赛 / 普通创建 / 队际赛 / 系列赛等所有页面  
> 版本：V1  
> 生效范围：整个小程序 UI 开发（Cursor 必须遵守）

---

# 🚨 一、设计系统目标

本设计系统用于统一 GOLFBROTHERS 全部 UI 结构与视觉规范，确保：

- 相同信息 = 相同视觉表达
- 相同组件 = 相同结构
- 禁止页面级自由设计
- 禁止局部样式发明

---

# 🎯 二、Typography（字体系统）

## 🟢 Title（标题）

用于：页面标题 / 卡片标题

```css
font-size: 32rpx;
font-weight: 600;
line-height: 44rpx;
color: var(--text-primary);

font-size: 24rpx;
font-weight: 400;
line-height: 36rpx;
color: var(--text-secondary);
