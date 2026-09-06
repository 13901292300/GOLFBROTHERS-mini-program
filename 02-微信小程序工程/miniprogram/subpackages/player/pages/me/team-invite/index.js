/**
 * 球队邀请落地页：分享 token 入队；无 token 时保留公开申请。
 */
const { createHeaderStyle } = require('../../../../../utils/headerEngine.js');
const teamClub = require('../../../../../utils/teamClub/service.js');
const identity = require('../../../../../utils/teamClub/identity.js');
const bootstrap = require('../../../../../utils/teamClub/bootstrap.js');
const pageErrors = require('../../../../../utils/teamClub/pageErrors.js');
const shareInvite = require('../../../../../utils/teamClub/shareInvite.js');
const routes = require('../../../../../utils/teamClub/routes.js');
const profileOnboard = require('../../../../../utils/teamClub/profileOnboard.js');

function formatExpire(ms) {
  var n = Number(ms) || 0;
  if (!n) return '';
  var d = new Date(n);
  if (!d.getTime()) return '';
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    teamId: '',
    inviteToken: '',
    pageState: 'loading',
    errorTitle: '加载失败',
    errorDesc: '无法获取球队公开资料，请稍后重试。',
    team: null,
    joinView: null,
    inviterName: '',
    expiresText: '',
    submitting: false,
    needLogin: false,
    lastApplicationId: '',
    lastNoticeCount: 0,
    lastJumpUrl: ''
  },

  onLoad(options) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    try {
      wx.hideShareMenu();
    } catch (e) {
      /* ignore */
    }
    const teamId = options && options.teamId != null ? String(options.teamId).trim() : '';
    const inviteToken =
      options && (options.inviteToken || options.token)
        ? String(options.inviteToken || options.token).trim()
        : '';
    if (inviteToken) shareInvite.savePendingToken(inviteToken);
    this.setData({ teamId: teamId, inviteToken: inviteToken });
    this._restoreAndLoad();
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
    if (this.data.pageState === 'profile_required' || this.data.pageState === 'need_login') {
      this._restoreAndLoad();
    }
  },

  onShareAppMessage() {
    const team = this.data.team;
    const token = this.data.inviteToken || shareInvite.readPendingToken();
    if (token) return shareInvite.buildShareMessage(team, { token: token });
    return { title: '邀请你加入球队', path: routes.TEAM_INVITE_PAGE };
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

  _restoreAndLoad() {
    const teamId = this.data.teamId;
    const inviteToken = this.data.inviteToken || shareInvite.readPendingToken();
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
        if (
          err.code === 'invite_expired' ||
          err.code === 'invite_revoked' ||
          err.code === 'invite_used' ||
          err.code === 'team_dissolved'
        ) {
          return;
        }
      }
      this.loadPage();
    });
  },

  loadPage() {
    const token = this.data.inviteToken || shareInvite.readPendingToken();
    if (token) {
      this._loadInvite(token);
      return;
    }
    const teamId = this.data.teamId;
    if (!teamId) {
      this.setData({
        pageState: 'error',
        team: null,
        joinView: null,
        errorTitle: '链接已失效',
        errorDesc: '这个邀请链接缺少有效邀请，请向分享者重新索取。'
      });
      return;
    }
    this.setData({ pageState: 'loading' });
    teamClub
      .getTeamInvitePage(teamId)
      .then((res) => {
        if (!res || !res.ok || !res.team) {
          const err = pageErrors.fromResult(res);
          this.setData({
            pageState: err.pageState,
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
          teamId: res.team.id || teamId,
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

  _loadInvite(token) {
    this.setData({ pageState: 'loading', inviteToken: token });
    teamClub
      .getInviteByToken(token)
      .then((res) => {
        if (!res || !res.ok || !res.team) {
          const err = pageErrors.fromResult(res);
          this.setData({
            pageState: err.pageState,
            team: null,
            joinView: null,
            errorTitle: err.errorTitle,
            errorDesc: err.errorDesc
          });
          return;
        }
        const already = !!(res.alreadyMember || (res.team && res.team.isFormalMember));
        const inviterName = (res.inviter && res.inviter.displayName) || '邀请人';
        const expiresText = formatExpire(res.invite && res.invite.expiresAt);
        const hintParts = [inviterName + ' 邀请你加入'];
        if (expiresText) hintParts.push('有效期至 ' + expiresText);
        this.setData({
          pageState: 'ready',
          team: res.team,
          teamId: res.team.id || (res.invite && res.invite.teamId) || this.data.teamId,
          inviterName: inviterName,
          expiresText: expiresText,
          joinView: {
            ctaAction: already ? 'enter' : 'accept',
            ctaLabel: already ? '进入球队' : '加入球队',
            ctaDisabled: false,
            hint: hintParts.join(' · ')
          }
        });
      })
      .catch(() => {
        this.setData({
          pageState: 'error',
          team: null,
          joinView: null,
          errorTitle: '加载失败',
          errorDesc: '无法解析邀请，请稍后重试。'
        });
      });
  },

  onRetry() {
    this._restoreAndLoad();
  },

  onCompleteProfile() {
    const token = this.data.inviteToken || shareInvite.readPendingToken();
    if (token) shareInvite.savePendingToken(token);
    wx.navigateTo({
      url: profileOnboard.editProfileUrl(),
      fail: () => wx.showToast({ title: '无法打开资料页', icon: 'none' })
    });
  },

  onLogoError() {
    const team = this.data.team;
    if (!team || team.logoBroken) return;
    this.setData({ team: Object.assign({}, team, { logoBroken: true }) });
  },

  _ensureIdentity() {
    const auth = identity.requireUser();
    if (auth.ok) return true;
    this.setData({ needLogin: true });
    wx.showModal({
      title: '需要登录',
      content: '请先登录后再加入球队。',
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
      wx.showToast({ title: view.hint || '当前状态不可操作', icon: 'none' });
      return;
    }
    if (!view.ctaAction) {
      wx.showToast({ title: '当前状态不可操作', icon: 'none' });
      return;
    }
    if (view.ctaAction === 'enter') {
      this._goTeamDetail(this.data.teamId);
      return;
    }
    if (view.ctaAction === 'accept') {
      if (!this._ensureIdentity()) return;
      this._submitAccept();
      return;
    }
    if (view.ctaAction !== 'apply') return;
    if (!this._ensureIdentity()) return;
    this._submitApply();
  },

  _goTeamDetail(teamId) {
    const url = teamClub.buildTeamDetailUrl(teamId);
    wx.redirectTo({
      url: url,
      fail: () => {
        wx.navigateTo({
          url: url,
          fail: () => wx.showToast({ title: '球队详情页跳转失败', icon: 'none' })
        });
      }
    });
  },

  _submitAccept() {
    const token = this.data.inviteToken || shareInvite.readPendingToken();
    if (!token) {
      wx.showToast({ title: '邀请已失效', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    const self = this;
    teamClub.acceptInvite(token).then((res) => {
      self.setData({ submitting: false });
      if (!res || !res.ok) {
        const err = pageErrors.fromResult(res);
        wx.showToast({ title: err.errorTitle, icon: 'none' });
        self.setData({
          pageState: err.pageState,
          errorTitle: err.errorTitle,
          errorDesc: err.errorDesc
        });
        return;
      }
      shareInvite.clearPendingToken();
      const teamId = (res.team && res.team.id) || self.data.teamId;
      wx.showToast({ title: res.alreadyMember ? '你已是成员' : '已加入球队', icon: 'success' });
      self._goTeamDetail(teamId);
    }).catch(() => {
      self.setData({ submitting: false });
      wx.showToast({ title: '加入失败，请重试', icon: 'none' });
    });
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
        wx.showToast({ title: '申请已提交', icon: 'success' });
      })
      .catch(() => {
        self.setData({ submitting: false });
        wx.showToast({ title: '申请失败，请重试', icon: 'none' });
      });
  },

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
