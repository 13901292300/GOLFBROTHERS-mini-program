/**
 * 添加球队成员 — 搜索/邀请用户，不进入现有成员选择。
 */
const { createHeaderStyle } = require('../../../../../../utils/headerEngine.js');
const teamClub = require('../../../../../../utils/teamClub/service.js');

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    teamId: '',
    keyword: '',
    pageState: 'loading',
    users: []
  },

  onLoad(options) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    const teamId = options && options.teamId != null ? String(options.teamId).trim() : '';
    this.setData({ teamId: teamId });
    this._timer = null;
    this.search('');
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
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

  search(keyword) {
    const teamId = this.data.teamId;
    if (!teamId) {
      this.setData({ pageState: 'error', users: [] });
      return;
    }
    this.setData({ pageState: 'loading' });
    teamClub
      .searchInviteCandidates(teamId, { keyword: keyword })
      .then((res) => {
        if (!res || !res.ok) {
          this.setData({ pageState: 'error', users: [] });
          return;
        }
        const users = res.list || [];
        this.setData({
          users: users,
          pageState: users.length ? 'ready' : 'empty'
        });
      })
      .catch(() => {
        this.setData({ pageState: 'error', users: [] });
      });
  },

  onSearchInput(e) {
    const keyword = (e.detail && e.detail.value) || '';
    this.setData({ keyword: keyword });
    const self = this;
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(function () {
      self.search(keyword);
    }, 220);
  },

  onClearSearch() {
    this.setData({ keyword: '' });
    this.search('');
  },

  onRetry() {
    this.search(this.data.keyword);
  },

  onTapUser(e) {
    if (this._submitting) return; // 执行中防重复提交
    const ds = (e.currentTarget && e.currentTarget.dataset) || {};
    const userId = String(ds.userId || '').trim();
    const name = String(ds.name || '').trim() || '该用户';
    if (!userId) return;
    const self = this;
    wx.showModal({
      title: '添加球队成员',
      content: '邀请「' + name + '」加入球队？加入后为普通成员。',
      success: function (res) {
        if (!res.confirm) return;
        if (self._submitting) return;
        self._submitting = true;
        teamClub
          .addTeamMember(self.data.teamId, userId)
          .then(function (result) {
            self._submitting = false;
            if (!result || !result.ok) {
              wx.showToast({ title: '添加失败，请重试', icon: 'none' });
              return;
            }
            // 定向通知上一页刷新成员、人数与当前用户权限
            const pages = getCurrentPages();
            const prev = pages[pages.length - 2];
            if (prev && typeof prev.refreshAfterMemberAction === 'function') {
              prev.refreshAfterMemberAction('invite_member');
            }
            wx.showToast({ title: '已加入', icon: 'none' });
            self.search(self.data.keyword);
          })
          .catch(function () {
            self._submitting = false;
            wx.showToast({ title: '添加失败，请重试', icon: 'none' });
          });
      }
    });
  },

  onUnload() {
    if (this._timer) clearTimeout(this._timer);
  }
});
