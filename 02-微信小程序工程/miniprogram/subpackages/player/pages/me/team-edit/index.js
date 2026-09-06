/**
 * 编辑球队资料。version 乐观并发；无权限由云端拒绝。
 */
const { createHeaderStyle } = require('../../../../../utils/headerEngine.js');
const teamClub = require('../../../../../utils/teamClub/service.js');
const bootstrap = require('../../../../../utils/teamClub/bootstrap.js');
const pageErrors = require('../../../../../utils/teamClub/pageErrors.js');
const teamFields = require('../../../../../utils/teamClub/teamFields.js');
const teamLogo = require('../../../../../utils/teamClub/teamLogo.js');
const teamAssetUpload = require('../../../../../utils/teamClub/teamAssetUpload.js');

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
    logoUploading: false,
    logoPreview: '',
    logoError: '',
    logoSrc: '',
    logoBroken: false,
    logoPlaceholder: teamLogo.PLACEHOLDER,
    nameCount: 0,
    shortCount: 0,
    sloganCount: 0,
    introCount: 0,
    form: { name: '', shortName: '', city: '', slogan: '', intro: '', logo: '', acceptingMembers: true }
  },

  onLoad(options) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    const teamId = options && options.teamId ? String(options.teamId).trim() : '';
    this.setData({ teamId: teamId });
    this._savedLogo = '';
    this._pendingLogos = [];
    bootstrap.ensureCloudIdentity().then(() => this.load());
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
  },

  onUnload() {
    (this._pendingLogos || []).forEach((id) => {
      if (id !== this._savedLogo) teamAssetUpload.enqueueOrphan(id);
    });
    teamAssetUpload.flushOrphans();
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

  _syncCounts(form) {
    return {
      nameCount: String(form.name || '').length,
      shortCount: teamFields.visibleLength(form.shortName),
      sloganCount: String(form.slogan || '').length,
      introCount: String(form.intro || '').length
    };
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
      const form = {
        name: team.fullName || team.name || '',
        shortName: team.shortName || '',
        city: team.city || team.regionText || '',
        slogan: team.slogan || '',
        intro: team.description || '',
        logo: team.logo || '',
        acceptingMembers: team.acceptingMembers !== false
      };
      this._savedLogo = form.logo;
      this.setData(
        Object.assign(
          {
            pageState: 'ready',
            version: team.version,
            form: form,
            logoPreview: '',
            logoError: '',
            logoSrc: team.logoSrc || '',
            logoBroken: !!team.logoBroken,
            logoPlaceholder: team.logoPlaceholder || teamLogo.PLACEHOLDER
          },
          this._syncCounts(form)
        )
      );
    });
  },

  onRetry() {
    this.load();
  },

  _patch(patch) {
    const form = Object.assign({}, this.data.form, patch);
    this.setData(Object.assign({ form: form }, this._syncCounts(form)));
  },
  onName(e) { this._patch({ name: e.detail.value }); },
  onShort(e) {
    this._patch({
      shortName: teamFields.sliceVisible((e.detail && e.detail.value) || '', teamFields.SHORT_MAX)
    });
  },
  onCity(e) { this._patch({ city: e.detail.value }); },
  onSlogan(e) { this._patch({ slogan: e.detail.value }); },
  onIntro(e) { this._patch({ intro: e.detail.value }); },
  onAccept(e) { this._patch({ acceptingMembers: !!e.detail.value }); },

  onLogoError() {
    this.setData({ logoBroken: true });
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
            logoUploading: true
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
        self._patch({ logo: saved.logo });
        teamLogo.displaySrc(saved.logo).then((d) => {
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
      .updateTeam(this.data.teamId, {
        name: name,
        shortName: shortChecked.shortName,
        city: form.city,
        slogan: form.slogan,
        intro: form.intro,
        logo: logoChecked.logo,
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
        teamAssetUpload.markCommitted(logoChecked.logo);
        self._pendingLogos = [];
        self._savedLogo = logoChecked.logo;
        wx.showToast({ title: '已保存', icon: 'none' });
        wx.navigateBack({ delta: 1 });
      })
      .catch(() => {
        self.setData({ submitting: false });
        wx.showToast({ title: '保存失败，表单已保留', icon: 'none' });
      });
  }
});
