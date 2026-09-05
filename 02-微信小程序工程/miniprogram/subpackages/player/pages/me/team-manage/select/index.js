/**
 * 成员管理 — 先选功能，再选人。
 * 交互：点行选中（有选中态）→ 点底部确认按钮 → 确认弹窗 → 执行。
 */
const { createHeaderStyle } = require('../../../../../../utils/headerEngine.js');
const teamClub = require('../../../../../../utils/teamClub/service.js');
const roles = require('../../../../../../utils/teamClub/roles.js');

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    teamId: '',
    action: '',
    title: '选择成员',
    confirmLabel: '确认',
    pageState: 'loading',
    members: [],
    emptyText: '没有符合条件的成员',
    selectedUserId: '',
    selectedName: '',
    submitting: false
  },

  onLoad(options) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    const teamId = options && options.teamId != null ? String(options.teamId).trim() : '';
    const action = options && options.action != null ? String(options.action).trim() : '';
    const meta = roles.getManageActionMeta(action) || {};
    this.setData({
      teamId: teamId,
      action: action,
      title: meta.pickTitle || meta.title || '选择成员',
      confirmLabel: meta.title ? '确认' + meta.title : '确认',
      emptyText: meta.emptyText || '没有符合条件的成员'
    });
    if (!meta.key) {
      // action 名称在某一层被改写时不要静默失败
      wx.showToast({ title: '操作参数无效：' + (action || '空'), icon: 'none' });
    }
    this.loadList();
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
  },

  onUnload() {
    this.setData({ submitting: false });
  },

  initHeaderNav() {
    const header = createHeaderStyle();
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle
    });
  },

  applyTheme(theme) {
    this.setData({ themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode' });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  onCancel() {
    // 取消不改任何数据
    wx.navigateBack({ delta: 1 });
  },

  loadList() {
    const teamId = this.data.teamId;
    const action = this.data.action;
    if (!teamId || !action) {
      this.setData({ pageState: 'error', members: [] });
      return;
    }
    this.setData({ pageState: 'loading' });
    teamClub
      .listMembersForManageAction(teamId, action)
      .then((res) => {
        if (!res || !res.ok) {
          this.setData({ pageState: 'error', members: [] });
          return;
        }
        const members = res.list || [];
        // 列表刷新后清掉不再合法的选中项
        const stillThere = members.some((m) => m.userId === this.data.selectedUserId);
        this.setData({
          members: members,
          selectedUserId: stillThere ? this.data.selectedUserId : '',
          selectedName: stillThere ? this.data.selectedName : '',
          pageState: members.length ? 'ready' : 'empty'
        });
      })
      .catch(() => {
        this.setData({ pageState: 'error', members: [] });
      });
  },

  onRetry() {
    this.loadList();
  },

  /** 点行只做单选，不直接执行；每个拒绝分支都有提示。 */
  onTapMember(e) {
    const ds = (e.currentTarget && e.currentTarget.dataset) || {};
    const userId = String(ds.userId || '').trim();
    const name = String(ds.name || '').trim() || '该成员';
    if (!userId) {
      wx.showToast({ title: '该成员标识缺失，无法操作', icon: 'none' });
      return;
    }
    if (this.data.submitting) {
      wx.showToast({ title: '正在执行，请稍候', icon: 'none' });
      return;
    }
    const same = this.data.selectedUserId === userId;
    this.setData({
      selectedUserId: same ? '' : userId,
      selectedName: same ? '' : name
    });
  },

  onConfirm() {
    if (this.data.submitting) {
      wx.showToast({ title: '正在执行，请稍候', icon: 'none' });
      return;
    }
    const userId = this.data.selectedUserId;
    const name = this.data.selectedName || '该成员';
    const action = this.data.action;
    if (!userId) {
      wx.showToast({ title: '请先选择一名成员', icon: 'none' });
      return;
    }
    // 执行前再确认目标仍在可选列表里（列表即按 permissions 过滤）
    const target = (this.data.members || []).filter(function (m) {
      return m.userId === userId;
    })[0];
    if (!target) {
      wx.showToast({ title: '该成员已不符合条件，请刷新', icon: 'none' });
      this.loadList();
      return;
    }
    const meta = roles.getManageActionMeta(action) || {};
    const self = this;
    wx.showModal({
      title: meta.confirmTitle || meta.title || '确认',
      content: roles.fillConfirmHint(action, name),
      success: function (res) {
        if (!res.confirm) {
          return;
        }
        // 转让超管不可逆且会改变自己的权限，再确认一次
        if (action === 'transfer_super') {
          wx.showModal({
            title: '再次确认转让',
            content:
              '转让后「' + name + '」成为唯一超级管理员，你降为管理员，双方队长标签不变。确定转让？',
            confirmText: '确定转让',
            confirmColor: '#ef4444',
            success: function (second) {
              if (!second.confirm) {
                return;
              }
              self._submit(action, userId);
            }
          });
          return;
        }
        self._submit(action, userId);
      },
      fail: function () {
        wx.showToast({ title: '确认弹窗异常，请重试', icon: 'none' });
      }
    });
  },

  _submit(action, userId) {
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    const self = this;
    Promise.resolve(teamClub.applyMemberAction(this.data.teamId, action, userId))
      .then(function (result) {
        if (!result || !result.ok) {
          const reason = (result && result.reason) || 'unknown';
          self.setData({ submitting: false });
          wx.showToast({
            title: reason === 'no_permission' || reason === 'forbidden' ? '无权执行该操作' : '操作失败（' + reason + '），请重试',
            icon: 'none'
          });
          self.loadList();
          return;
        }
        const pages = getCurrentPages();
        const prev = pages[pages.length - 2];
        if (prev && typeof prev.refreshAfterMemberAction === 'function') {
          prev.refreshAfterMemberAction(action);
        }
        wx.showToast({ title: '已更新', icon: 'none' });
        setTimeout(function () {
          self.setData({ submitting: false });
          wx.navigateBack({ delta: 1 });
        }, 500);
      })
      .catch(function () {
        self.setData({ submitting: false });
        wx.showToast({ title: '操作失败，请重试', icon: 'none' });
      });
  }
});
