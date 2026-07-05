# 🏆 GOLFBROTHERS 状态绑定规范 V1

## （UI 只能绑定 Preview + Commit）

---

```
# 🚨 GOLFBROTHERS 状态绑定规范 V1> 生效范围：所有创建类页面（普通创建 / 队内赛 / 队际赛 / 系列赛）  > 核心目标：彻底禁止 UI 直接绑定 Draft 状态---# 🧠 一、核心原则（最重要）## ❗ UI 只能绑定两种状态：### ✔ 1. Commit（最终态）- 唯一真实数据源- 用于提交、保存、广场展示### ✔ 2. Preview（展示态）- 用于页面实时展示- 可以由 Draft 派生- 用于 UI 渲染---## ❌ 严禁 UI 绑定：- Draft（编辑态）- 临时变量- scroll 状态- 生命周期状态（onShow / onReady）- hidden 状态- DOM 状态---# 🔁 二、标准状态流（强制）
```

Draft → Preview → Commit

```
---## ✔ 各层职责### 🟡 Draft（编辑态）- 仅用于弹窗 / 表单- 允许频繁修改- 不影响 UI 主页面---### 🔵 Preview（UI展示态）- UI 唯一绑定对象- 由 Draft 派生- 可以实时更新，但不提交---### 🟢 Commit（最终态）- confirm 后写入- 用于保存 / 广场 / 分享---# 🚨 三、UI绑定强制规则## ✔ 主页面 UI 必须绑定：
```

✔ Preview  
✔ Commit

```
---## ❌ 禁止绑定：
```

✘ Draft

```
---# 📌 四、各模块绑定规范---## 💰 费用模块
```

Draft: feeDraftList  
Preview: feePreview  
Commit: feeList

```
---## 👥 分队模块
```

Draft: teamGroupDraft  
Preview: teamGroupPreview  
Commit: teamGroups

```
---## 📅 赛事信息
```

Draft: eventDraft  
Preview: eventPreview  
Commit: eventInfoList

```
---## 🏌️ 赛制
```

Draft: modeDraft  
Preview: modePreview  
Commit: gameMode

```
---# 🧨 五、禁止行为（重点）## ❌ UI禁止直接依赖：- draftFeeList- draftTeamGroups- draftEventInfo- draftGameMode---## ❌ 禁止：- draft → setData 直接影响 UI- draft 作为 wx:if 条件- draft 作为 tag 渲染源- draft 控制按钮显示---# 🔥 六、正确 UI 模式（必须遵守）## ✔ 页面渲染必须：
```

UI = Preview + Commit

```
---## ✔ 弹窗编辑必须：
```

UI → Draft  
Draft → Preview（可选）  
confirm → Commit

```
---# 🚨 七、典型错误模式（必须避免）## ❌ 错误1：UI直接绑定Draft```js<view>{{draftFeeList}}</view>
```

---

## ❌ 错误2：Draft直接写入Commit

```
this.setData({  feeList: draftFeeList})
```

（未 confirm）

---

## ❌ 错误3：Draft控制UI显示

```
wx:if="{{draftFeeList.length}}"
```

---

# 🧪 八、验收标准

## ✔ UI行为必须满足：

1. UI 不依赖 draft
2. scroll 不影响 UI
3. 弹窗未确认不影响主页面
4. confirm 才更新 commit
5. preview 始终稳定

---

## ✔ 系统稳定性：

6. 不再出现“文案消失”
7. 不再出现“按钮消失”
8. 不再出现“scroll恢复UI”
9. 不再出现“弹窗污染主页面”

---

# 🚀 九、系统目标

本规范的最终目标是：

> 📌 UI稳定性 = 只依赖 Preview + Commit

---

# 🧠 十、核心一句话总结

## ❗ UI不能看“正在编辑的东西（Draft）”

## ✔ UI只能看：

- 已确认的（Commit）
- 或可展示的（Preview）

```
---# 💡 我帮你点一下这个规范的本质（非常关键）你现在已经在做一个真正系统级升级：> ❗ 从“页面状态管理” → “UI绑定协议设计”---## 🚀 这个规范解决的不是 bug，而是：- draft污染UI- scroll触发UI变化- 弹窗影响主页面- Cursor随机写错setData- 状态不可控
```
