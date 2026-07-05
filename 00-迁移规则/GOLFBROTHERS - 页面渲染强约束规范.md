

--

# 🚨 GOLFBROTHERS - 页面渲染强约束规范（必须遵守）

## 1. 弹窗生命周期规则

- 所有弹窗必须使用 `wx:if` 控制

- 弹窗关闭时必须销毁 DOM

- 禁止使用 `hidden` 仅隐藏弹窗

- 弹窗内所有动态列表必须随弹窗销毁

---

## 2. 列表渲染规范

- 所有 `wx:for` 必须显式声明：
  
  - `wx:for-item`
  
  - `wx:for-index`

- 禁止使用默认 `item / index` 作用域

---

## 3. key 规范（强制 namespace）

- 所有列表必须使用唯一 namespace key

- 禁止跨列表重复 id

- 推荐格式：
  
  - team-group-xxx
  
  - fee-item-xxx
  
  - event-info-xxx
  
  - draft-team-group-xxx

---

## 4. UI 状态依赖原则

- 所有 UI 显示逻辑不得依赖：
  
  - scroll 状态
  
  - 生命周期临时状态（onShow / onReady副作用）
  
  - 非持久化 UI flag

- UI 必须仅依赖：
  
  - data 状态
  
  - 明确业务字段

---

## 5. setData 更新规范

- 禁止重建整个 page state（如 form/pageData/sections整体替换）

- 必须使用 patch 更新：
  
  - teamGroups
  
  - feeList
  
  - eventInfoList
  
  - 局部字段更新

- 禁止如下模式：

```js
this.setData({
  pageData: newPageData
})
```

---

## 6. 目标原则

所有页面必须满足：

- 状态稳定（scroll 不影响 UI）

- 弹窗隔离（不污染主页面 diff）

- 列表独立（不跨组件复用）

- 更新局部化（不重建页面状态）

---

## ⚠️ 强制要求

此规范适用于：

- 创建队内赛

- 创建普通赛事

- 创建系列赛

- 后续所有类似创建页

必须作为统一标准执行，不得局部偏离。
