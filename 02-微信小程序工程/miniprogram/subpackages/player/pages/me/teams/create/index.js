/**
 * 创建球队 — 正式表单，提交云仓储。
 */
const { createHeaderStyle } = require('../../../../../../utils/headerEngine.js');
const teamClub = require('../../../../../../utils/teamClub/service.js');
const bootstrap = require('../../../../../../utils/teamClub/bootstrap.js');
const pageErrors = require('../../../../../../utils/teamClub/pageErrors.js');
const mockAvatars = require('../../../../../../utils/mockAvatars.js');

const NAME_MAX = 30;
const SHORT_MAX = 4;
const SLOGAN_MAX = 40;
const INTRO_MAX = 200;
const CITY_MAX = 20;

function isTempPath(url) {
  const s = String(url || '').trim();
  if (!s) return false;
  return /^wxfile:\/\//i.test(s) || /^http:\/\/tmp\//i.test(s) || s.indexOf('tmp/') === 0;
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    pageState: 'ready',
    errorTitle: '',
    errorDesc: '',
    submitting: false,
    form: {
      name: '',
      shortName: '',
      city: '',
      slogan: '',
      intro: '',
      logo: '',
      acceptingMembers: true
    },
    nameCount: 0,
    shortCount: 0,
    sloganCount: 0,
    introCount: 0
  },

  onLoad() {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    bootstrap.ensureCloudIdentity().then((ident) => {
      if (!ident || !ident.ok) {
        const err = pageErrors.fromResult(ident);
        this.setData({ pageState: err.pageState, errorTitle: err.errorTitle, errorDesc: err.errorDesc });
      }
    });
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
    if (getCurrentPages().length > 1) wx.navigateBack({ delta: 1 });
    else wx.redirectTo({ url: '/subpackages/player/pages/me/teams/index' });
  },

  onRetry() {
    this.setData({ pageState: 'ready' });
    this.onLoad();
  },

  _patchForm(patch) {
    const form = Object.assign({}, this.data.form, patch);
    this.setData({
      form: form,
      nameCount: String(form.name || '').length,
      shortCount: String(form.shortName || '').length,
      sloganCount: String(form.slogan || '').length,
      introCount: String(form.intro || '').length
    });
  },

  onName(e) {
    this._patchForm({ name: String((e.detail && e.detail.value) || '').slice(0, NAME_MAX) });
  },
  onShort(e) {
    this._patchForm({ shortName: String((e.detail && e.detail.value) || '').slice(0, SHORT_MAX) });
  },
  onCity(e) {
    this._patchForm({ city: String((e.detail && e.detail.value) || '').slice(0, CITY_MAX) });
  },
  onSlogan(e) {
    this._patchForm({ slogan: String((e.detail && e.detail.value) || '').slice(0, SLOGAN_MAX) });
  },
  onIntro(e) {
    this._patchForm({ intro: String((e.detail && e.detail.value) || '').slice(0, INTRO_MAX) });
  },
  onAccept(e) {
    this._patchForm({ acceptingMembers: !!(e.detail && e.detail.value) });
  },

  onPickLogo() {
    const self = this;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        const temp = res.tempFilePaths && res.tempFilePaths[0];
        if (!temp) return;
        if (!wx.cloud || typeof wx.cloud.uploadFile !== 'function') {
          wx.showToast({ title: '无法上传图片，未保存临时路径', icon: 'none' });
          return;
        }
        wx.cloud.uploadFile({
          cloudPath: 'team-logos/' + Date.now() + '.jpg',
          filePath: temp,
          success(up) {
            const fileID = String((up && up.fileID) || '').trim();
            if (!fileID || isTempPath(fileID)) {
              wx.showToast({ title: 'LOGO 上传失败', icon: 'none' });
              return;
            }
            self._patchForm({ logo: fileID });
          },
          fail() {
            wx.showToast({ title: 'LOGO 上传失败', icon: 'none' });
          }
        });
      }
    });
  },

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
    const logo = String(form.logo || '').trim() || mockAvatars.pickMockAvatar(name);
    this.setData({ submitting: true });
    const self = this;
    teamClub
      .createTeam({
        name: name,
        shortName: String(form.shortName || '').trim(),
        city: String(form.city || '').trim(),
        slogan: String(form.slogan || '').trim(),
        intro: String(form.intro || '').trim(),
        logo: logo,
        acceptingMembers: form.acceptingMembers !== false,
        idempotencyKey: 'create:' + name + ':' + Date.now()
      })
      .then((res) => {
        self.setData({ submitting: false });
        if (!res || !res.ok || !res.team) {
          const err = pageErrors.fromResult(res, '创建失败');
          wx.showToast({ title: err.errorTitle, icon: 'none' });
          return;
        }
        wx.redirectTo({
          url: teamClub.buildTeamDetailUrl(res.team.id),
          fail: () => wx.navigateTo({ url: teamClub.buildTeamDetailUrl(res.team.id) })
        });
      })
      .catch(() => {
        self.setData({ submitting: false });
        wx.showToast({ title: '创建失败，表单已保留', icon: 'none' });
      });
  }
});
