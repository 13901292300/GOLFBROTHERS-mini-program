/**
 * 创建球队 — 正式表单，提交云仓储。
 */
const { createHeaderStyle } = require('../../../../../../utils/headerEngine.js');
const teamClub = require('../../../../../../utils/teamClub/service.js');
const bootstrap = require('../../../../../../utils/teamClub/bootstrap.js');
const pageErrors = require('../../../../../../utils/teamClub/pageErrors.js');
const profileOnboard = require('../../../../../../utils/teamClub/profileOnboard.js');
const teamFields = require('../../../../../../utils/teamClub/teamFields.js');
const teamLogo = require('../../../../../../utils/teamClub/teamLogo.js');
const teamAssetUpload = require('../../../../../../utils/teamClub/teamAssetUpload.js');

const NAME_MAX = 30;
const SLOGAN_MAX = 40;
const INTRO_MAX = 200;
const CITY_MAX = 20;

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    pageState: 'ready',
    errorTitle: '',
    errorDesc: '',
    actionKind: '',
    actionLabel: '',
    submitting: false,
    logoUploading: false,
    logoPreview: '',
    logoError: '',
    logoSrc: '',
    logoBroken: false,
    logoPlaceholder: teamLogo.PLACEHOLDER,
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
    this._pendingLogos = [];
    teamAssetUpload.flushOrphans();
    bootstrap.ensureCloudIdentity().then((ident) => {
      if (!ident || !ident.ok) {
        const err = pageErrors.fromResult(ident);
        this.setData({
          pageState: err.pageState,
          errorTitle: err.errorTitle,
          errorDesc: err.errorDesc,
          actionKind: err.actionKind || '',
          actionLabel: err.actionLabel || ''
        });
      }
    });
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
    if (this.data.pageState === 'profile_required' || this.data.pageState === 'need_login') {
      bootstrap.ensureCloudIdentity().then((ident) => {
        if (ident && ident.ok) {
          this.setData({ pageState: 'ready', actionKind: '', actionLabel: '' });
          return;
        }
        const err = pageErrors.fromResult(ident);
        this.setData({
          pageState: err.pageState,
          errorTitle: err.errorTitle,
          errorDesc: err.errorDesc,
          actionKind: err.actionKind || '',
          actionLabel: err.actionLabel || ''
        });
      });
    }
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
    if (this.data.pageState === 'profile_required') return;
    this.setData({ pageState: 'ready', actionKind: '', actionLabel: '' });
    bootstrap.ensureCloudIdentity().then((ident) => {
      if (!ident || !ident.ok) {
        const err = pageErrors.fromResult(ident);
        this.setData({
          pageState: err.pageState,
          errorTitle: err.errorTitle,
          errorDesc: err.errorDesc,
          actionKind: err.actionKind || '',
          actionLabel: err.actionLabel || ''
        });
      }
    });
  },

  onCompleteProfile() {
    if (profileOnboard.isBusy()) {
      wx.showToast({ title: '正在处理，请稍候', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: profileOnboard.editProfileUrl(),
      fail: () => wx.showToast({ title: '无法打开资料页', icon: 'none' })
    });
  },

  _patchForm(patch) {
    const form = Object.assign({}, this.data.form, patch);
    this.setData({
      form: form,
      nameCount: String(form.name || '').length,
      shortCount: teamFields.visibleLength(form.shortName),
      sloganCount: String(form.slogan || '').length,
      introCount: String(form.intro || '').length
    });
  },

  onName(e) {
    this._patchForm({ name: String((e.detail && e.detail.value) || '').slice(0, NAME_MAX) });
  },
  onShort(e) {
    this._patchForm({
      shortName: teamFields.sliceVisible((e.detail && e.detail.value) || '', teamFields.SHORT_MAX)
    });
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

  onLogoError() {
    this.setData({ logoBroken: true });
  },

  onUnload() {
    const pending = this._pendingLogos || [];
    pending.forEach((id) => teamAssetUpload.enqueueOrphan(id));
    teamAssetUpload.flushOrphans();
  },

  onPickLogo() {
    if (this.data.logoUploading || this.data.submitting || teamAssetUpload.isUploading()) {
      wx.showToast({ title: '正在上传，请稍候', icon: 'none' });
      return;
    }
    if (teamAssetUpload.hasPendingUpload()) {
      this._retryLogo();
      return;
    }
    this.setData({ logoUploading: true, logoError: '' });
    const self = this;
    if (!self._logoUploadId) self._logoUploadId = teamAssetUpload.newUploadId();
    teamAssetUpload
      .pickAndUpload({
        kind: 'logo',
        uploadId: self._logoUploadId,
        onPreview: function (info) {
          self.setData({
            logoPreview: info && info.previewPath ? info.previewPath : self.data.logoPreview,
            logoUploading: true,
            logoBroken: false
          });
        }
      })
      .then((res) => self._finishLogoUpload(res));
  },

  _retryLogo() {
    this.setData({ logoUploading: true, logoError: '' });
    const self = this;
    teamAssetUpload.retryPendingUpload().then((res) => self._finishLogoUpload(res));
  },

  _finishLogoUpload(res) {
    const self = this;
    if (!res || !res.ok) {
      if (res && res.code === 'cancelled') {
        self.setData({ logoUploading: false });
        return;
      }
      const text = teamAssetUpload.displayUploadError(res);
      self.setData({ logoUploading: false, logoError: text });
      wx.showModal({
        title: res && res.code === 'upload_uncertain' ? '上传待确认' : 'LOGO 尚未上传',
        content: text,
        showCancel: true,
        confirmText: '重试',
        success(r) {
          if (!r.confirm) return;
          if (teamAssetUpload.hasPendingUpload()) self._retryLogo();
          else self.onPickLogo();
        }
      });
      return;
    }
        const saved = teamLogo.persistLogo(res.fileID);
        if (!saved.ok) {
          self.setData({ logoUploading: false, logoError: saved.message || 'LOGO 无效' });
          return;
        }
        const prev = String((self.data.form && self.data.form.logo) || '').trim();
        if (prev && prev !== saved.logo && (self._pendingLogos || []).indexOf(prev) >= 0) {
          teamAssetUpload.enqueueOrphan(prev, res.route);
        }
        self._pendingLogos = (self._pendingLogos || []).concat([saved.logo]);
        self._logoUploadId = '';
        self._patchForm({ logo: saved.logo });
        teamLogo.displaySrc(saved.logo).then((d) => {
          teamLogo.logDiag({
            stage: 'create.upload',
            upload: res.fileID,
            saved: saved.logo,
            boundField: 'logoSrc',
            route: res.route
          });
          self.setData({
            logoUploading: false,
            logoPreview: '',
            logoError: '',
            logoSrc: d.logoSrc,
            logoBroken: false,
            logoPlaceholder: d.placeholder
          });
        });
  },

  onSubmit() {
    if (this.data.submitting || this.data.logoUploading) return;
    if (this.data.pageState === 'profile_required') return;
    const form = this.data.form;
    const name = String(form.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请填写球队名称', icon: 'none' });
      return;
    }
    const shortChecked = teamFields.sanitizeShortName(form.shortName, {});
    if (!shortChecked.ok) {
      wx.showToast({ title: shortChecked.message, icon: 'none' });
      return;
    }
    const logoChecked = teamLogo.persistLogo(form.logo);
    if (!logoChecked.ok) {
      wx.showToast({ title: 'LOGO 未上传成功', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    const self = this;
    teamClub
      .createTeam({
        name: name,
        shortName: shortChecked.shortName,
        city: String(form.city || '').trim(),
        slogan: String(form.slogan || '').trim(),
        intro: String(form.intro || '').trim(),
        logo: logoChecked.logo,
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
        teamLogo.logDiag({
          stage: 'create.saved',
          upload: logoChecked.logo,
          saved: res.team.logo,
          boundField: 'logoSrc'
        });
        teamAssetUpload.markCommitted(logoChecked.logo);
        self._pendingLogos = [];
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
