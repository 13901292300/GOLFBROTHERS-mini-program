# Cursor 安全开发规则（强制）

## 1. 禁止修改范围（LOCKED）

以下内容禁止修改：

- 所有已稳定 TAB 结构
- Sticky Header / Tab Bar
- 记分页面布局结构
- gameStore.js / gameProgress.js
- design-system.css

---

## 2. 修改必须限制在：

✔ 当前功能模块内部
✔ 不得跨页面重构
✔ 不得改 layout 层级

---

## 3. UI原则

- 不允许改结构
- 不允许改 DOM 层级
- 不允许删除节点
- 不允许移动 sticky 元素

---

## 4. Cursor工作原则

Cursor只能：

✔ 修改局部逻辑
✔ 新增功能
✔ 调整样式

禁止：

❌ 重写页面
❌ 重构TAB
❌ 改布局结构

---

## 5. 强制流程

每次修改：

1. git commit backup
2. Cursor 修改
3. 人工验证
4. 决定是否保留
