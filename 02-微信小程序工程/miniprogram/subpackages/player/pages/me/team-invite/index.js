/**
 * 球队邀请 / 申请加入（分享落地页）
 */
const { createHeaderStyle } = require('../../../../../utils/headerEngine.js');
const teamClub = require('../../../../../utils/teamClub/service.js');
const identity = require('../../../../../utils/teamClub/identity.js');
const bootstrap = require('../../../../../utils/teamClub/bootstrap.js');
const pageErrors = require('../../../../../utils/teamClub/pageErrors.js');

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    teamId: '',
    pageState: 'loading',
    errorTitle: '加载失败',
    errorDesc: '无法获取球队公开资料，请稍后重试。',
    team: null,
    joinView: null,
    submitting: false,
    needLogin: false,
    lastApplicationId: '',
    lastNoticeCount: 0,
    lastJumpUrl: ''
  },

  onLoad(options) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    const teamId = options && options.teamId != null ? String(options.teamId).trim() : '';
    const inviteToken = options && (options.inviteToken || options.token) ? String(options.inviteToken || options.token).trim() : '';
    this.setData({ teamId: teamId });
    bootstrap.restoreShareContext({ teamId: teamId, inviteToken: inviteToken }).then((ctx) => {
      if (ctx && ctx.identity && ctx.identity.ok === false) {
        const err = pageErrors.fromResult(ctx.identity);
        this.setData({
          pageState: err.pageState,
          errorTitle: err.errorTitle,
          errorDesc: err.errorDesc
        });
        if (err.code === 'need_login' || err.code === 'profile_required' || err.code === 'service_unavailable') {
          return;
        }
      }
      if (ctx && ctx.invite && ctx.invite.ok === false) {
        const err = pageErrors.fromResult(ctx.invite);
        this.setData({
          pageState: err.pageState,
          errorTitle: err.errorTitle,
          errorDesc: err.errorDesc
        });
        if (err.code === 'invite_expired' || err.code === 'invite_revoked') return;
      }
      this.loadPage();
    });
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
  },

  onShareAppMessage() {
    return teamClub.buildTeamShareMessage(this.data.team);
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

  loadPage() {
    const teamId = this.data.teamId;
    if (!teamId) {
      this.setData({
        pageState: 'error',
        team: null,
        joinView: null,
        errorTitle: '链接已失效',
        errorDesc: '这个邀请链接缺少球队信息，请向分享者重新索取。'
      });
      return;
    }
    this.setData({ pageState: 'loading' });
    teamClub
      .getTeamInvitePage(teamId)
      .then((res) => {
        if (!res || !res.ok || !res.team) {
          const err = pageErrors.fromResult(res);
          const gone = err.code === 'not_found' || err.code === 'team_dissolved' || err.code === 'invite_expired';
          this.setData({
            pageState: gone ? err.pageState : err.pageState,
            team: null,
            joinView: null,
            errorTitle: err.errorTitle,
            errorDesc: err.errorDesc
          });
          return;
        }
        this.setData({
          pageState: 'ready',
          team: res.team,
          joinView: res.joinView
        });
      })
      .catch(() => {
        this.setData({
          pageState: 'error',
          team: null,
          joinView: null,
          errorTitle: '加载失败',
          errorDesc: '无法获取球队公开资料，请稍后重试。'
        });
      });
  },

  onRetry() {
    this.loadPage();
  },

  _ensureIdentity() {
    const auth = identity.requireUser();
    if (auth.ok) return true;
    this.setData({ needLogin: true });
    wx.showModal({
      title: '需要登录',
      content: '请先登录后再申请加入球队。',
      showCancel: false
    });
    return false;
  },

  onTapJoinCta() {
    const view = this.data.joinView || {};
    if (this.data.submitting) {
      wx.showToast({ title: '正在提交，请稍候', icon: 'none' });
      return;
    }
    if (view.ctaDisabled) {
      // 待审核、暂停接收等状态给出原因，不做无反馈的 return
      wx.showToast({ title: view.hint || '当前状态不可操作', icon: 'none' });
      return;
    }
    if (!view.ctaAction) {
      wx.showToast({ title: '当前状态不可操作', icon: 'none' });
      return;
    }
    if (view.ctaAction === 'enter') {
      wx.navigateTo({
        url: teamClub.buildTeamDetailUrl(this.data.teamId),
        fail: () => wx.showToast({ title: '球队详情页跳转失败', icon: 'none' })
      });
      return;
    }
    if (view.ctaAction !== 'apply') return;
    if (!this._ensureIdentity()) return;
    this._submitApply();
  },

  onCancelPending() {
    if (this.data.submitting) return;
    const pendingId =
      (this.data.joinView && this.data.joinView.applicationId) ||
      this.data.lastApplicationId ||
      '';
    if (!pendingId) {
      wx.showToast({ title: '没有待取消的申请', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    const self = this;
    teamClub.cancelJoinApplication(pendingId).then((res) => {
      self.setData({ submitting: false });
      if (!res || !res.ok) {
        const err = pageErrors.fromResult(res);
        wx.showToast({ title: err.errorTitle, icon: 'none' });
        return;
      }
      self.loadPage();
      wx.showToast({ title: '已取消申请', icon: 'none' });
    });
  },

  _submitApply() {
    this.setData({ submitting: true });
    const self = this;
    teamClub
      .applyToJoinTeam(this.data.teamId)
      .then((res) => {
        self.setData({ submitting: false });
        if (!res || !res.ok) {
          const reason = (res && res.reason) || 'unknown';
          // 服务端状态优先，保证按钮立刻反映真实状态
          if (res && res.joinView) self.setData({ joinView: res.joinView });
          const map = {
            already_pending: '你已有一条待审核的申请',
            already_member: '你已经是该球队成员',
            paused: '该球队暂时不接受新成员申请',
            not_found: '球队不存在或已解散',
            need_login: '请先登录后再申请'
          };
          wx.showToast({ title: map[reason] || '申请失败，请重试', icon: 'none' });
          return;
        }
        const noticeCount = (res.notices || []).length;
        self.setData({
          joinView: res.joinView || self.data.joinView,
          lastApplicationId: String(res.applicationId || ''),
          lastNoticeCount: noticeCount,
          lastJumpUrl: (res.messageJump && res.messageJump.url) || ''
        });
        wx.showToast({ title: '申请已提交', icon: 'none' });
      })
      .catch(() => {
        self.setData({ submitting: false });
        wx.showToast({ title: '申请失败，请重试', icon: 'none' });
      });
  },

  /** 消息中心未实现，这里保留到独立申请详情页的跳转，不伪造消息中心入口 */
  onOpenApplicationDetail() {
    const url = String(this.data.lastJumpUrl || '').trim();
    if (!url) {
      wx.showToast({ title: '没有可跳转的申请记录', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: url,
      fail: () => wx.showToast({ title: '申请详情页跳转失败', icon: 'none' })
    });
  }
});
