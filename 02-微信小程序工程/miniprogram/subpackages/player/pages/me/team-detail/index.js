/**
 * 球队详情 — 简介 / 成员 / 比赛
 * 三个 Tab 为独立组件；数据走 teamClub/service。
 */
const { createHeaderStyle } = require('../../../../../utils/headerEngine.js');
const teamClub = require('../../../../../utils/teamClub/service.js');
const shareInvite = require('../../../../../utils/teamClub/shareInvite.js');
const routes = require('../../../../../utils/teamClub/routes.js');
const bootstrap = require('../../../../../utils/teamClub/bootstrap.js');
const pageErrors = require('../../../../../utils/teamClub/pageErrors.js');
const matchRefSync = require('../../../../../utils/teamClub/matchRefSync.js');

const TABS = [
  { key: 'intro', label: '球队简介' },
  { key: 'members', label: '球队成员' },
  { key: 'matches', label: '球队比赛' }
];

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    teamId: '',
    team: null,
    tabs: TABS,
    activeTab: 'intro',
    introState: 'loading',
    membersState: 'loading',
    matchesState: 'loading',
    members: [],
    memberKeyword: '',
    matches: [],
    canCreateTeamMatch: false,
    canShareTeam: false,
    shareReady: false,
    showManageButton: false,
    manageMenuItems: [],
    manageSheetVisible: false,
    pendingApplicationCount: 0,
    introErrorTitle: '',
    introErrorDesc: '',
    membersErrorTitle: '',
    membersErrorDesc: '',
    matchesErrorTitle: '',
    matchesErrorDesc: ''
  },

  /**
   * 成员管理操作成功后由选人页回调：重新拉成员、人数与当前用户权限，
   * 让管理菜单按新权限刷新。这是定向刷新，不等于恢复 onShow 自动刷新。
   */
  refreshAfterMemberAction() {
    this._busy.members = false;
    this._busy.intro = false;
    this._attempted.members = false;
    this._loaded.members = false;
    this.loadMembers();
    this.loadIntro(true);
  },

  onLoad(options) {
    const teamId = options && options.teamId != null ? String(options.teamId).trim() : '';

    // 请求闸门：_busy 防重复并发，_seq 防旧响应覆盖新状态，_attempted 保证失败后不自动重试
    this._busy = { intro: false, members: false, matches: false };
    this._seq = { intro: 0, members: 0, matches: 0 };
    this._attempted = { intro: false, members: false, matches: false };
    this._loaded = { intro: false, members: false, matches: false };

    this.setData({ teamId: teamId });

    // 头部与主题属于布局，最小布局模式下才跳过
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());

    // 右上角菜单分享先关掉，等简介加载出 canShareTeam 后再按权限打开
    this._applyShareMenu(false);
    bootstrap.ensureCloudIdentity().then(() => {
      this.loadIntro();
      matchRefSync.flush();
    });
  },

  onShow() {
    // 主题跟随只是样式同步，不发请求；从比赛详情/创建页返回时避免配色错位
    this.applyTheme(getApp().getTheme());
    if (!this.data.teamId) return;
    this._busy.intro = false;
    this.loadIntro(true);
    if (this.data.activeTab === 'members' || this._loaded.members) {
      this._busy.members = false;
      this._attempted.members = false;
      this.loadMembers();
    }
    if (this.data.activeTab === 'matches' || this._loaded.matches) {
      this._busy.matches = false;
      this._attempted.matches = false;
      this.loadMatches();
      matchRefSync.flush();
    }
  },

  /**
   * 右上角菜单分享：仅管理员且邀请 token 已预签发后开放。
   */
  _applyShareMenu(canShare) {
    const allow = !!canShare;
    try {
      if (allow) {
        wx.showShareMenu({ menus: ['shareAppMessage'] });
      } else {
        wx.hideShareMenu();
      }
    } catch (e) {
      /* ignore */
    }
  },

  _prepareShare(teamId, silent) {
    const self = this;
    this.setData({ shareReady: false });
    this._applyShareMenu(false);
    return shareInvite.prepare(teamId).then(function (res) {
      const ready = !!(res && res.ok && res.invite && res.invite.token);
      self.setData({ shareReady: ready });
      self._applyShareMenu(ready && self.data.canShareTeam);
      if (!ready && !silent) {
        wx.showToast({ title: (res && res.message) || '邀请准备中，请稍后重试', icon: 'none' });
      }
      return ready;
    });
  },

  /** 原生分享：落地页只带服务端短期 token */
  onShareAppMessage() {
    const team = this.data.team;
    const inv = shareInvite.current(this.data.teamId);
    if (!team || !this.data.canShareTeam || !this.data.shareReady || !inv || !inv.token) {
      return { title: '邀请你加入球队', path: routes.TEAM_INVITE_PAGE };
    }
    return shareInvite.buildShareMessage(team, inv);
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
      wx.redirectTo({ url: '/subpackages/player/pages/me/teams/index' });
    }
  },

  /**
   * 请求闸门：同类请求进行中则直接丢弃本次调用（防重复），
   * 并返回本次序号；响应回来时序号不是最新的就丢弃（防旧覆盖新）。
   */
  _openRequest(type) {
    if (this._busy[type]) {
      return 0;
    }
    this._busy[type] = true;
    this._attempted[type] = true;
    this._seq[type] += 1;
    return this._seq[type];
  },

  _isLatest(type, token) {
    if (token !== this._seq[type]) {
      return false;
    }
    this._busy[type] = false;
    return true;
  },

  loadIntro(silent) {
    const teamId = this.data.teamId;
    if (!teamId) {
      this.setData({ introState: 'error', team: null, canCreateTeamMatch: false, canShareTeam: false, shareReady: false });
      return;
    }
    const token = this._openRequest('intro');
    if (!token) return;
    if (!silent) this.setData({ introState: 'loading' });
    teamClub
      .getTeamDetail(teamId)
      .then((res) => {
        if (!this._isLatest('intro', token)) return;
        if (!res || !res.ok || !res.team) {
          this._loaded.intro = false;
          const err = pageErrors.fromResult(res);
          this.setData({
            introState: err.pageState,
            introErrorTitle: err.errorTitle,
            introErrorDesc: err.errorDesc,
            team: null,
            canCreateTeamMatch: false,
            canShareTeam: false,
            shareReady: false
          });
          if (err.code === 'team_dissolved' || err.pageState === 'team_dissolved') {
            this.setData({ manageSheetVisible: false, showManageButton: false });
          }
          return;
        }
        const permissions = res.team.permissions || {};
        const dissolved = res.team.status === 'dissolved';
        this._loaded.intro = true;
        this.setData({
          team: res.team,
          introState: 'ready',
          canCreateTeamMatch: !dissolved && !!permissions.canCreateTeamMatch,
          canShareTeam: !dissolved && !!permissions.canShareTeam,
          pendingApplicationCount: Number(res.team.pendingApplicationCount || 0)
        });
        this._applyShareMenu(false);
        if (!dissolved && permissions.canShareTeam) {
          this._prepareShare(teamId, silent);
        }
        if (dissolved) {
          this.setData({ manageSheetVisible: false });
        }
      })
      .catch(() => {
        if (!this._isLatest('intro', token)) return;
        this._loaded.intro = false;
        this.setData({ introState: 'error', team: null, canCreateTeamMatch: false, canShareTeam: false, shareReady: false });
      });
  },

  loadMembers() {
    const teamId = this.data.teamId;
    if (!teamId) {
      this.setData({ membersState: 'error', members: [] });
      return;
    }
    const token = this._openRequest('members');
    if (!token) return;
    if (!this._loaded.members) this.setData({ membersState: 'loading' });
    Promise.all([
      teamClub.listTeamMembers(teamId),
      teamClub.getMemberManageMenu(teamId)
    ])
      .then((pair) => {
        if (!this._isLatest('members', token)) return;
        const res = pair[0];
        const menu = pair[1];
        if (!res || !res.ok) {
          this._loaded.members = false;
          const err = pageErrors.fromResult(res);
          this.setData({
            membersState: err.pageState,
            membersErrorTitle: err.errorTitle,
            membersErrorDesc: err.errorDesc,
            members: []
          });
          return;
        }
        const members = res.list || [];
        this._loaded.members = true;
        this.setData({
          members: members,
          membersState: 'ready',
          showManageButton: !!(menu && menu.showManageButton),
          manageMenuItems: (menu && menu.items) || []
        });
      })
      .catch(() => {
        if (!this._isLatest('members', token)) return;
        this._loaded.members = false;
        this.setData({ membersState: 'error', members: [] });
      });
  },

  loadMatches() {
    const teamId = this.data.teamId;
    if (!teamId) {
      this.setData({ matchesState: 'error', matches: [] });
      return;
    }
    const token = this._openRequest('matches');
    if (!token) return;
    if (!this._loaded.matches) this.setData({ matchesState: 'loading' });
    teamClub
      .listTeamMatches(teamId)
      .then((res) => {
        if (!this._isLatest('matches', token)) return;
        if (!res || !res.ok) {
          this._loaded.matches = false;
          const err = pageErrors.fromResult(res);
          this.setData({
            matchesState: err.pageState,
            matchesErrorTitle: err.errorTitle,
            matchesErrorDesc: err.errorDesc,
            matches: []
          });
          return;
        }
        const matches = res.list || [];
        this._loaded.matches = true;
        this.setData({
          matches: matches,
          matchesState: matches.length ? 'ready' : 'empty'
        });
      })
      .catch(() => {
        if (!this._isLatest('matches', token)) return;
        this._loaded.matches = false;
        this.setData({ matchesState: 'error', matches: [] });
      });
  },

  onTabChange(e) {
    const tab = String(((e && e.currentTarget && e.currentTarget.dataset) || {}).tab || '').trim();
    if (!tab || tab === this.data.activeTab) return;
    // 先切 Tab 再取数：切换不依赖请求结果，失败态也不会挡住切换
    this.setData({ activeTab: tab });
    if (tab === 'members' && !this._attempted.members) this.loadMembers();
    if (tab === 'matches' && !this._attempted.matches) this.loadMatches();
  },

  onRetryIntro() {
    this.loadIntro();
  },

  onRetryMembers() {
    this.loadMembers();
  },

  onRetryMatches() {
    this.loadMatches();
  },

  onMemberSearch(e) {
    // 关键词只做本地筛选，不发请求，避免逐字触发重复请求
    const keyword = (e.detail && e.detail.keyword) || '';
    this.setData({ memberKeyword: keyword });
  },

  onOpenManage() {
    if (!this.data.showManageButton) return;
    const items = this.data.manageMenuItems || [];
    if (!items.length) return;
    this.setData({ manageSheetVisible: true });
  },

  onCloseManageSheet() {
    this.setData({ manageSheetVisible: false });
  },

  onSheetNoop() {},

  onPickManageAction(e) {
    const key = String((e.currentTarget.dataset && e.currentTarget.dataset.key) || '').trim();
    this.setData({ manageSheetVisible: false });
    if (!key) return;
    // 再校验一次：菜单是按 permissions 生成的，跳转前确认该项仍然有效
    const allowed = (this.data.manageMenuItems || []).some(function (item) {
      return item && item.key === key;
    });
    if (!allowed) {
      wx.showToast({ title: '权限已变更，请重试', icon: 'none' });
      return;
    }
    const teamId = this.data.teamId;
    let url = '';
    if (key === 'invite_member') url = teamClub.buildManageInviteUrl(teamId);
    else if (key === 'review_applications') url = teamClub.buildApplicationsUrl(teamId);
    else url = teamClub.buildManageSelectUrl(teamId, key);
    if (!url) return;
    wx.navigateTo({
      url: url,
      fail: () => wx.showToast({ title: '页面尚未注册', icon: 'none' })
    });
  },

  onCreateMatch() {
    const teamId = String(this.data.teamId || '').trim();
    // 入口按 permissions 显示，点击时再校验一次；队长标签不赋予创建权限
    const permissions = (this.data.team && this.data.team.permissions) || {};
    if (!permissions.canCreateTeamMatch) {
      wx.showToast({ title: '你没有发起球队比赛的权限', icon: 'none' });
      return;
    }
    if (!teamId) {
      wx.showToast({ title: '缺少球队标识，无法发起', icon: 'none' });
      return;
    }
    const url = teamClub.buildCreateTeamMatchUrl(teamId);
    wx.navigateTo({
      url: url,
      fail: (err) => {
        wx.showToast({ title: '创建页跳转失败，路由未注册', icon: 'none' });
      }
    });
  },

  onOpenMatch(e) {
    const detail = (e && e.detail) || {};
    const matchId = String(detail.matchId || '').trim();
    const url = String(detail.navUrl || '').trim();
    if (!matchId) {
      wx.showToast({ title: '这场比赛缺少有效标识', icon: 'none' });
      return;
    }
    // 本地缓存没有比赛正文时仍可打开详情路由；由详情页处理缺失
    if (!url) {
      wx.showModal({
        title: '无法打开',
        content: '这场比赛没有关联可打开的详情。',
        showCancel: false
      });
      return;
    }
    wx.navigateTo({
      url: url,
      fail: (err) => {
        wx.showToast({ title: '比赛详情跳转失败，路由未注册', icon: 'none' });
      }
    });
  },

  onEditProfile() {
    const team = this.data.team;
    if (!team || !team.permissions || !team.permissions.canEditTeamProfile || team.status === 'dissolved') {
      wx.showToast({ title: '没有编辑权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: teamClub.buildEditTeamUrl(this.data.teamId) });
  },

  onOpenApplications() {
    wx.navigateTo({ url: teamClub.buildApplicationsUrl(this.data.teamId) });
  },

  onOpenNotices() {
    wx.navigateTo({ url: teamClub.buildNoticesUrl() });
  },

  onLeaveTeam() {
    const team = this.data.team;
    if (!team || team.currentUserRole === 'super_admin') {
      wx.showModal({
        title: '无法退出',
        content: '唯一超级管理员需先转让或解散球队。',
        showCancel: false
      });
      return;
    }
    const self = this;
    wx.showModal({
      title: '退出球队',
      content: team.currentUserRole === 'admin' ? '退出后将同时失去管理员身份。确定退出？' : '确定退出该球队？',
      confirmColor: '#ef4444',
      success(r) {
        if (!r.confirm) return;
        teamClub.leaveTeam(self.data.teamId).then((res) => {
          if (!res || !res.ok) {
            const err = pageErrors.fromResult(res);
            wx.showToast({ title: err.errorTitle, icon: 'none' });
            return;
          }
          wx.redirectTo({ url: '/subpackages/player/pages/me/teams/index' });
        });
      }
    });
  },

  onDissolveTeam() {
    const team = this.data.team;
    if (!team || team.currentUserRole !== 'super_admin') {
      wx.showToast({ title: '仅超级管理员可解散', icon: 'none' });
      return;
    }
    const name = team.fullName || team.name || '';
    const self = this;
    wx.showModal({
      title: '解散球队',
      content: '解散后禁止申请、邀请、编辑和新建比赛，历史比赛仍保留。请输入球队全称「' + name + '」确认。',
      editable: true,
      placeholderText: name,
      confirmColor: '#ef4444',
      success(r) {
        if (!r.confirm) return;
        const typed = String(r.content || '').trim();
        if (typed !== name) {
          wx.showToast({ title: '名称不匹配', icon: 'none' });
          return;
        }
        teamClub.dissolveTeam(self.data.teamId, { confirmName: typed }).then((res) => {
          if (!res || !res.ok) {
            const err = pageErrors.fromResult(res);
            wx.showToast({ title: err.errorTitle, icon: 'none' });
            return;
          }
          self.setData({ manageSheetVisible: false });
          self.loadIntro();
        });
      }
    });
  }
});
