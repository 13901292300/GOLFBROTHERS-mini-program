/**
 * 编辑球队资料。version 乐观并发；无权限由云端拒绝。
 */
const { createHeaderStyle } = require('../../../../../utils/headerEngine.js');
const teamClub = require('../../../../../utils/teamClub/service.js');
const bootstrap = require('../../../../../utils/teamClub/bootstrap.js');
const pageErrors = require('../../../../../utils/teamClub/pageErrors.js');

function isTempPath(url) {
  const s = String(url || '').trim();
  return /^wxfile:\/\//i.test(s) || /^http:\/\/tmp\//i.test(s);
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    pageState: 'loading',
    errorTitle: '',
    errorDesc: '',
    teamId: '',
    version: 1,
    submitting: false,
    form: { name: '', shortName: '', city: '', slogan: '', intro: '', logo: '', acceptingMembers: true }
  },

  onLoad(options) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    const teamId = options && options.teamId ? String(options.teamId).trim() : '';
    this.setData({ teamId: teamId });
    bootstrap.ensureCloudIdentity().then(() => this.load());
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
  },

  initHeaderNav() {
    const header = createHeaderStyle();
    this.setData({ headerRootStyle: header.headerRootStyle, headerBarStyle: header.headerBarStyle });
  },

  applyTheme(theme) {
    this.setData({ themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode' });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  load() {
    const teamId = this.data.teamId;
    if (!teamId) {
      this.setData({ pageState: 'error', errorTitle: '缺少球队', errorDesc: '链接无效' });
      return;
    }
    this.setData({ pageState: 'loading' });
    teamClub.getTeamDetail(teamId).then((res) => {
      if (!res || !res.ok || !res.team) {
        const err = pageErrors.fromResult(res);
        this.setData({ pageState: err.pageState, errorTitle: err.errorTitle, errorDesc: err.errorDesc });
        return;
      }
      const team = res.team;
      if (!team.permissions || !team.permissions.canEditTeamProfile) {
        this.setData({
          pageState: 'forbidden',
          errorTitle: '没有权限',
          errorDesc: '你无权编辑该球队资料。'
        });
        return;
      }
      this.setData({
        pageState: 'ready',
        version: team.version,
        form: {
          name: team.fullName || team.name || '',
          shortName: team.shortName || '',
          city: team.city || team.regionText || '',
          slogan: team.slogan || '',
          intro: team.description || '',
          logo: team.logo || '',
          acceptingMembers: team.acceptingMembers !== false
        }
      });
    });
  },

  onRetry() {
    this.load();
  },

  _patch(patch) {
    this.setData({ form: Object.assign({}, this.data.form, patch) });
  },
  onName(e) { this._patch({ name: e.detail.value }); },
  onShort(e) { this._patch({ shortName: e.detail.value }); },
  onCity(e) { this._patch({ city: e.detail.value }); },
  onSlogan(e) { this._patch({ slogan: e.detail.value }); },
  onIntro(e) { this._patch({ intro: e.detail.value }); },
  onAccept(e) { this._patch({ acceptingMembers: !!e.detail.value }); },

  onSubmit() {
    if (this.data.submitting) return;
    const form = this.data.form;
    const name = String(form.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请填写球队名称', icon: 'none' });
      return;
    }
    if (isTempPath(form.logo)) {
      wx.showToast({ title: 'LOGO 未上传成功', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    const self = this;
    teamClub
      .updateTeam(this.data.teamId, {
        name: name,
        shortName: form.shortName,
        city: form.city,
        slogan: form.slogan,
        intro: form.intro,
        logo: form.logo,
        acceptingMembers: form.acceptingMembers
      }, { expectedVersion: this.data.version })
      .then((res) => {
        self.setData({ submitting: false });
        if (!res || !res.ok) {
          const err = pageErrors.fromResult(res);
          if (err.code === 'conflict') {
            wx.showModal({
              title: err.errorTitle,
              content: err.errorDesc,
              confirmText: '刷新',
              success(r) {
                if (r.confirm) self.load();
              }
            });
            return;
          }
          wx.showToast({ title: err.errorTitle, icon: 'none' });
          return;
        }
        wx.showToast({ title: '已保存', icon: 'none' });
        wx.navigateBack({ delta: 1 });
      })
      .catch(() => {
        self.setData({ submitting: false });
        wx.showToast({ title: '保存失败，表单已保留', icon: 'none' });
      });
  }
});
