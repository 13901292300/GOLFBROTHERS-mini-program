/**
 * 入队申请详情 — 消息中心跳转目标。
 * 审批状态由 service.actionView 驱动，不在 WXML 写业务分支。
 */
const { createHeaderStyle } = require('../../../../../utils/headerEngine.js');
const teamClub = require('../../../../../utils/teamClub/service.js');
const openPlayerProfileUtil = require('../../../../../utils/openPlayerProfile.js');
const pageErrors = require('../../../../../utils/teamClub/pageErrors.js');

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    applicationId: '',
    noticeId: '',
    pageState: 'loading',
    errorTitle: '',
    errorDesc: '',
    detail: null
  },

  onLoad(options) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    const applicationId =
      options && options.applicationId != null ? String(options.applicationId).trim() : '';
    const noticeId = options && options.noticeId != null ? String(options.noticeId).trim() : '';
    this.setData({ applicationId: applicationId, noticeId: noticeId });
    this.loadDetail();
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
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.redirectTo({ url: '/pages/home/index' });
    }
  },

  loadDetail() {
    const applicationId = this.data.applicationId;
    if (!applicationId) {
      this.setData({ pageState: 'error', detail: null });
      return;
    }
    this.setData({ pageState: 'loading' });
    teamClub
      .getJoinApplicationDetail(applicationId, { noticeId: this.data.noticeId })
      .then((res) => {
        if (!res || !res.ok || !res.detail) {
          const err = pageErrors.fromResult(res);
          this.setData({ pageState: err.pageState, errorTitle: err.errorTitle, errorDesc: err.errorDesc, detail: null });
          return;
        }
        this.setData({ pageState: 'ready', detail: res.detail });
      })
      .catch(() => {
        this.setData({ pageState: 'error', detail: null });
      });
  },

  onRetry() {
    this.loadDetail();
  },

  onTapApplicant() {
    const applicant = this.data.detail && this.data.detail.applicant;
    if (!applicant) return;
    const userId = String(applicant.userId || '').trim();
    const targetUserId = openPlayerProfileUtil.resolveOpenableUserId({
      userId: userId,
      playerId: userId
    });
    if (!targetUserId) {
      wx.showToast({ title: '该球员暂无主页', icon: 'none' });
      return;
    }
    const opened = openPlayerProfileUtil.openPlayerProfile({
      userId: targetUserId,
      playerId: targetUserId,
      publicName: applicant.displayName,
      nickname: applicant.nickname || applicant.displayName,
      avatar: applicant.avatar,
      identitySource: 'contacts'
    });
    if (!opened) wx.showToast({ title: '该球员暂无主页', icon: 'none' });
  },

  onApprove() {
    this._review('approve', '同意加入', '同意后申请人将以普通成员身份入队，不会获得管理员权限或队长标签。');
  },

  onReject() {
    this._review('reject', '拒绝申请', '确定拒绝该入队申请？');
  },

  _review(decision, title, content) {
    const view = (this.data.detail && this.data.detail.actionView) || {};
    if (decision === 'approve' && !view.showApprove) return;
    if (decision === 'reject' && !view.showReject) return;
    const self = this;
    wx.showModal({
      title: title,
      content: content,
      success: function (res) {
        if (!res.confirm) return;
        teamClub
          .reviewJoinApplication(self.data.applicationId, decision)
          .then(function (result) {
            if (result && result.detail) {
              self.setData({ detail: result.detail, pageState: 'ready' });
            }
            if (!result || !result.ok) {
              wx.showToast({
                title: result && result.reason === 'already_processed' ? '已由其他管理员处理' : '操作失败',
                icon: 'none'
              });
              return;
            }
            wx.showToast({ title: decision === 'approve' ? '已同意' : '已拒绝', icon: 'none' });
          })
          .catch(function () {
            wx.showToast({ title: '操作失败', icon: 'none' });
          });
      }
    });
  }
});
