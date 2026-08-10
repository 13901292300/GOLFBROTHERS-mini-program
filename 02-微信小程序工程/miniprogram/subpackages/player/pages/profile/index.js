/**
 * 球员主页（P1A-1 资料壳 + P1A-2 关注/计数/私人备注）
 */
const { createHeaderStyle } = require('../../../../utils/headerEngine.js');
const publicPlayerProfile = require('../../../../utils/publicPlayerProfile.js');
const genderNormalize = require('../../../../utils/genderNormalize.js');
const playerActionModal = require('../../../../utils/playerActionModal.js');
const contactFollowAction = require('../../../../utils/contactFollowAction.js');
const socialRelationStore = require('../../../../utils/socialRelationStore.js');
const contactStore = require('../../../../utils/contactStore.js');
const playerDisplayName = require('../../../../utils/playerDisplayName.js');
const openPlayerProfileUtil = require('../../../../utils/openPlayerProfile.js');
const playerIdentityGuard = require('../../../../utils/playerIdentityGuard.js');
const reactionPopularityLedger = require('../../../../utils/reactionPopularityLedger.js');
const teamDirectory = require('../../../../utils/teamDirectory.js');
const playerMatchHistory = require('../../../../utils/playerMatchHistory.js');
const playerMomentStore = require('../../../../utils/playerMomentStore.js');
const playerMomentInteractionStore = require('../../../../utils/playerMomentInteractionStore.js');
const playerMomentMedia = require('../../../../utils/playerMomentMedia.js');
const playerMomentImageLayout = require('../../../../utils/playerMomentImageLayout.js');
const playerContentReportStore = require('../../../../utils/playerContentReportStore.js');
const publicScorecardView = require('../../../../utils/publicScorecardView.js');

const REMARK_NAME_MAX = contactStore.REMARK_NAME_MAX || 12;
const MOMENT_PAGE_SIZE = playerMomentStore.PAGE_SIZE || 20;
const REMARK_NOTE_MAX = contactStore.REMARK_NOTE_MAX || 200;
const PROFILE_TEAMS_PREVIEW = 3;
const PROFILE_AUX_DEBUG = false;
const HISTORY_FILTERS = playerMatchHistory.HISTORY_FILTERS;
const HISTORY_PAGE_SIZE = playerMatchHistory.PAGE_SIZE || 20;

function profileAuxDebug() {
  if (!PROFILE_AUX_DEBUG) return;
  try {
    console['warn'].apply(console, arguments);
  } catch (e) { /* ignore */ }
}

/** 微信 onLoad query 可能已解码；二次 decode 遇裸 % 会抛 URIError */
function safeDecodeQueryValue(raw) {
  if (raw == null) return '';
  const s = String(raw);
  try {
    return decodeURIComponent(s);
  } catch (e) {
    return s;
  }
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    pageState: 'loading',
    userId: '',
    profile: null,
    view: {
      nickname: '',
      genderSymbol: '',
      genderClass: '',
      signature: '',
      nationalityName: '',
      regionDisplayName: '',
      handicapText: '--',
      floatCoefText: '--',
      popularityText: '0',
      avatar: '',
      isCurrentUser: false,
      showSignature: false,
      showGeo: false,
      heroName: '',
      showOriginalNickname: false,
      originalNickname: ''
    },
    popularityValue: 0,
    teams: {
      list: [],
      previewList: [],
      total: 0,
      expanded: false,
      empty: true,
      loadFailed: false,
      showToggle: false,
      toggleLabel: ''
    },
    social: {
      relationStatus: 'none',
      followingCount: 0,
      followerCount: 0,
      relationLoading: false,
      relationLabel: '加关注',
      showFollowBtn: false
    },
    showBattlePkBtn: false,
    viewerPrivate: {
      remarkName: '',
      remarkNote: '',
      canEditRemark: false,
      hasRemarkNote: false,
      remarkPlaceholder: '添加备注，记录你们的球友信息'
    },
    relationSheetVisible: false,
    relationSheetTitle: '已关注该球员',
    remarkSheetVisible: false,
    remarkDraftName: '',
    remarkDraftNote: '',
    remarkNameCount: 0,
    remarkNoteCount: 0,
    remarkNameMax: REMARK_NAME_MAX,
    remarkNoteMax: REMARK_NOTE_MAX,
    activeTab: 'home',
    historyFilter: HISTORY_FILTERS.ALL,
    historyFilters: [
      { key: HISTORY_FILTERS.ALL, label: '全部' },
      { key: HISTORY_FILTERS.PERSONAL_STROKE, label: '个人比杆' },
      { key: HISTORY_FILTERS.TEAM_STROKE, label: '团队比杆' },
      { key: HISTORY_FILTERS.MATCH_PLAY, label: '比洞' }
    ],
    historyState: 'idle',
    historyCards: [],
    historyHasMore: false,
    historyPage: 1,
    historySummary: {
      playedCount: 0,
      completedCount: 0,
      bestGrossText: '--',
      recentCards: [],
      empty: true
    },
    momentState: 'idle',
    momentCards: [],
    momentHasMore: false,
    momentCursor: 0,
    momentRefreshing: false,
    feedScrollTop: 0,
    reportSheetVisible: false,
    reportSheetTitle: '举报动态',
    reportSubmitting: false,
    ixActionMomentId: '',
    likeBusyMap: {},
    likeSheetVisible: false,
    likeSheetCount: 0,
    likeSheetAvatars: []
  },

  onLoad(query) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    const q = query || {};
    const userId = safeDecodeQueryValue(q.userId);
    const contextToken = safeDecodeQueryValue(q.contextToken);
    const initialTab = safeDecodeQueryValue(q.tab);
    let fallback = {
      name: safeDecodeQueryValue(q.name),
      nickname: '',
      avatar: safeDecodeQueryValue(q.avatar),
      identitySource: safeDecodeQueryValue(q.identitySource)
    };
    if (contextToken && userId) {
      try {
        const fromCtx = openPlayerProfileUtil.takePlayerProfileNavigationContext(
          contextToken,
          userId
        );
        if (fromCtx) {
          fallback = Object.assign({}, fallback, fromCtx);
        }
      } catch (e) {
        console.warn('[player-profile] context take failed', e && e.message);
      }
    }
    this._fallbackSnapshot = fallback;
    this._profileLoaded = false;
    this._historyRecords = null;
    this._historyRevision = '';
    this._historyAccess = null;
    this._momentRevision = '';
    this._scoreStoreRevision = '';
    this._reportRevision = '';
    this._reportTarget = null;
    this._momentNavLock = false;
    this._feedScrollTop = 0;
    this._interactionRevisions = {};
    this._likeBusy = {};
    const tab =
      initialTab === 'feed' || initialTab === 'history' || initialTab === 'home'
        ? initialTab
        : 'home';
    this.setData({ userId: userId, activeTab: tab });
    // 诊断：不输出完整用户对象 / 备注
    let idKind = 'empty';
    if (userId) {
      if (playerIdentityGuard.isGuestPlayerId(userId)) idKind = 'guest';
      else if (playerIdentityGuard.isMaskedPlayerId(userId)) idKind = 'masked';
      else if (playerIdentityGuard.isScorecardOnlyKey(userId)) idKind = 'scorecard_or_compound';
      else if (playerIdentityGuard.isStablePublicUserId(userId)) idKind = 'stable_candidate';
      else idKind = 'rejected';
    }
    console.warn('[player-profile] load', {
      hasUserId: !!userId,
      idKind: idKind,
      hasContextToken: !!contextToken,
      hasFallbackName: !!fallback.name,
      identitySource: fallback.identitySource || ''
    });
    this.loadProfile(userId, fallback);
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
    if (this.data.userId && this.data.pageState === 'ready' && this._profileLoaded) {
      // 面板打开时不刷关系，避免打断取消关注交互
      if (!this.data.relationSheetVisible && !this.data.remarkSheetVisible) {
        this.refreshSocialAndRemark();
        this.refreshPopularityLight();
        this.refreshTeamsIfNeeded();
        // 历史：仅 revision 变化时重建，不无条件扫 Store
        this.refreshHistoryIfRevisionChanged();
        this.refreshMomentsIfRevisionChanged();
        this.refreshMomentInteractionsIfNeeded();
        this.refreshMomentReportsIfNeeded();
      }
    }
  },

  onHide() {
    this.onCloseIxAction();
    this.onCloseLikeSheet();
    this._clearSheetDrafts();
  },

  onUnload() {
    this.onCloseIxAction();
    this._clearSheetDrafts();
  },

  onCloseIxAction() {
    if (!this.data.ixActionMomentId) return;
    this.setData({ ixActionMomentId: '' });
  },

  initHeaderNav() {
    const styles = createHeaderStyle();
    this.setData({
      headerRootStyle: styles.headerRootStyle,
      headerBarStyle: styles.headerBarStyle
    });
  },

  applyTheme(theme) {
    this.setData({ themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode' });
  },

  _clearSheetDrafts() {
    this._reportTarget = null;
    this.setData({
      relationSheetVisible: false,
      relationSheetTitle: '已关注该球员',
      remarkSheetVisible: false,
      remarkDraftName: '',
      remarkDraftNote: '',
      remarkNameCount: 0,
      remarkNoteCount: 0,
      'social.relationLoading': false,
      reportSheetVisible: false,
      reportSubmitting: false
    });
  },

  _buildView(profile, remarkName, popularityText) {
    const gender = profile.gender || 'unknown';
    const symbol = genderNormalize.genderSymbol(gender);
    const nationalityName = String(profile.nationalityName || '').trim();
    const regionDisplayName = String(profile.regionDisplayName || '').trim();
    const signature = String(profile.signature || '').trim();
    const publicName = profile.nickname || profile.displayName || '未设置昵称';
    const me = socialRelationStore.resolveCurrentUserId();
    const remarkMap = {};
    const noteName = String(remarkName || '').trim();
    if (noteName && profile.userId) remarkMap[profile.userId] = noteName;
    const named = playerDisplayName.resolvePlayerDisplayNameForViewer({
      viewerUserId: me,
      targetUserId: profile.userId,
      publicName: publicName,
      snapshotName: '',
      remarkNameMap: remarkMap,
      defaultName: '未设置昵称'
    });
    const popText =
      popularityText != null
        ? String(popularityText)
        : (this.data.view && this.data.view.popularityText) || '0';
    return {
      nickname: publicName,
      genderSymbol: symbol,
      genderClass: gender === 'male' ? 'gender-male' : gender === 'female' ? 'gender-female' : '',
      signature: signature,
      nationalityName: nationalityName,
      regionDisplayName: regionDisplayName,
      handicapText: playerActionModal.formatPlayerActionMetric(profile.handicap),
      floatCoefText: playerActionModal.formatPlayerActionMetric(profile.floatCoef),
      popularityText: popText,
      avatar: profile.avatar || '',
      isCurrentUser: !!profile.isCurrentUser,
      showSignature: !!signature,
      showGeo: !!(nationalityName || regionDisplayName),
      heroName: named.displayName,
      showOriginalNickname: named.hasRemark,
      originalNickname: named.originalName
    };
  },

  _mapTeamRows(rawList) {
    const list = Array.isArray(rawList) ? rawList : [];
    return list.map((t) => {
      const role = t && t.role ? t.role : 'member';
      return {
        teamId: String((t && t.teamId) || '').trim(),
        name: String((t && t.name) || '').trim() || '未命名球队',
        shortName: String((t && t.shortName) || '').trim(),
        logo: (t && t.logo) || '',
        role: role,
        roleLabel: teamDirectory.getTeamRoleLabel(role),
        memberStatus: 'active',
        organizationType: 'team'
      };
    });
  },

  _buildTeamsState(rawList, expanded, loadFailed) {
    const list = this._mapTeamRows(rawList);
    const total = list.length;
    const isExpanded = !!expanded && total > PROFILE_TEAMS_PREVIEW;
    const previewList =
      isExpanded || total <= PROFILE_TEAMS_PREVIEW
        ? list
        : list.slice(0, PROFILE_TEAMS_PREVIEW);
    const showToggle = total > PROFILE_TEAMS_PREVIEW;
    return {
      list: list,
      previewList: previewList,
      total: total,
      expanded: isExpanded,
      empty: !loadFailed && total === 0,
      loadFailed: !!loadFailed,
      showToggle: showToggle,
      toggleLabel: isExpanded
        ? '收起'
        : showToggle
          ? '查看全部（' + total + '）'
          : ''
    };
  },

  /** 并行辅助：人气聚合 + 所属球队；失败不拖垮主页 */
  loadAuxiliaryProfileData(userId) {
    const uid = String(userId || '').trim();
    if (!uid) return;
    let popularityValue = 0;
    let popularityText = '0';
    try {
      popularityValue = reactionPopularityLedger.getPopularityValue(uid) || 0;
      popularityText = reactionPopularityLedger.formatPopularityDisplay(popularityValue);
    } catch (e) {
      profileAuxDebug('[player-profile] popularity failed', e && e.message);
      popularityValue = this.data.popularityValue || 0;
      popularityText =
        (this.data.view && this.data.view.popularityText) ||
        reactionPopularityLedger.formatPopularityDisplay(popularityValue);
    }

    let teamsState;
    try {
      const raw = teamDirectory.getTeamsByUserId(uid) || [];
      teamsState = this._buildTeamsState(raw, false, false);
    } catch (e2) {
      profileAuxDebug('[player-profile] teams failed', e2 && e2.message);
      teamsState = this._buildTeamsState([], false, true);
    }

    this.setData({
      popularityValue: popularityValue,
      'view.popularityText': popularityText,
      teams: teamsState
    });
  },

  refreshPopularityLight() {
    const uid = this.data.profile && this.data.profile.userId;
    if (!uid) return;
    try {
      const popularityValue = reactionPopularityLedger.getPopularityValue(uid) || 0;
      const popularityText = reactionPopularityLedger.formatPopularityDisplay(
        popularityValue
      );
      this.setData({
        popularityValue: popularityValue,
        'view.popularityText': popularityText
      });
    } catch (e) {
      profileAuxDebug('[player-profile] popularity refresh failed', e && e.message);
    }
  },

  refreshTeamsIfNeeded() {
    const uid = this.data.profile && this.data.profile.userId;
    if (!uid) return;
    try {
      const raw = teamDirectory.getTeamsByUserId(uid) || [];
      const expanded = !!(this.data.teams && this.data.teams.expanded);
      this.setData({ teams: this._buildTeamsState(raw, expanded, false) });
    } catch (e) {
      profileAuxDebug('[player-profile] teams refresh failed', e && e.message);
    }
  },

  onToggleTeamsExpand() {
    const teams = this.data.teams || {};
    if (!teams.showToggle) return;
    const nextExpanded = !teams.expanded;
    this.setData({
      teams: this._buildTeamsState(teams.list || [], nextExpanded, !!teams.loadFailed)
    });
  },

  onTapTeamRow() {
    wx.showToast({ title: '球队主页即将开放', icon: 'none' });
  },

  _readViewerBundle(profileUserId, isCurrentUser) {
    contactFollowAction.ensureStore();
    const me = socialRelationStore.resolveCurrentUserId();
    const counts = contactFollowAction.getSocialCounts(profileUserId);
    let relationStatus = 'none';
    let showFollowBtn = false;
    let showBattlePkBtn = false;
    if (!isCurrentUser && publicPlayerProfile.isStablePublicUserId(profileUserId)) {
      relationStatus = contactFollowAction.getRelationStatus(me, profileUserId);
      showFollowBtn = true;
      // 他人正式用户显示入口；共同比赛为 0 仍显示；不在主页预计算 PK
      showBattlePkBtn = !(
        playerIdentityGuard.isGuestPlayerId(profileUserId) ||
        playerIdentityGuard.isMaskedPlayerId(profileUserId)
      );
    }
    let relationLabel = '加关注';
    if (relationStatus === 'following') relationLabel = '已关注';
    if (relationStatus === 'friend') relationLabel = '好友';

    let viewerPrivate = {
      remarkName: '',
      remarkNote: '',
      canEditRemark: false,
      hasRemarkNote: false,
      remarkPlaceholder: '添加备注，记录你们的球友信息'
    };
    if (!isCurrentUser && contactStore.canEditPrivateRemark(me, profileUserId)) {
      const remark = contactStore.getPrivateRemark(me, profileUserId);
      const note = String(remark.remarkNote || '');
      viewerPrivate = {
        remarkName: String(remark.remarkName || '').trim(),
        remarkNote: note,
        canEditRemark: true,
        hasRemarkNote: !!String(note).trim(),
        remarkPlaceholder: '添加备注，记录你们的球友信息'
      };
    }

    return {
      social: {
        relationStatus: relationStatus,
        followingCount: counts.followingCount,
        followerCount: counts.followerCount,
        relationLoading: false,
        relationLabel: relationLabel,
        showFollowBtn: showFollowBtn
      },
      showBattlePkBtn: !!showBattlePkBtn,
      viewerPrivate: viewerPrivate
    };
  },

  loadProfile(userId, fallback) {
    this.setData({ pageState: 'loading' });
    let stage = 'start';
    try {
      stage = 'validate_userId';
      if (!publicPlayerProfile.isStablePublicUserId(userId)) {
        this.setData({ pageState: 'notFound', profile: null });
        this._profileLoaded = false;
        return;
      }
      stage = 'resolve_public_profile';
      const profile = publicPlayerProfile.resolvePublicPlayerProfile(userId, fallback || {});
      if (!profile || !profile.canOpenProfile) {
        this.setData({ pageState: 'notFound', profile: null });
        this._profileLoaded = false;
        return;
      }
      // 目录未命中且无任何可信展示身份 → notFound（缺国籍/签名不算失败）
      const hasIdentity =
        !!(profile.isCurrentUser ||
          profile.isRegistered ||
          (profile.nickname && String(profile.nickname).trim()) ||
          (profile.displayName && String(profile.displayName).trim()) ||
          (fallback && (fallback.name || fallback.nickname || fallback.avatar)));
      if (!hasIdentity) {
        this.setData({ pageState: 'notFound', profile: null });
        this._profileLoaded = false;
        return;
      }
      stage = 'read_viewer_bundle';
      const bundle = this._readViewerBundle(profile.userId, !!profile.isCurrentUser);
      stage = 'build_view';
      const view = this._buildView(profile, bundle.viewerPrivate.remarkName);
      stage = 'set_ready';
      this.setData({
        pageState: 'ready',
        profile: profile,
        view: view,
        social: bundle.social,
        showBattlePkBtn: !!bundle.showBattlePkBtn,
        viewerPrivate: bundle.viewerPrivate
      });
      this._profileLoaded = true;
      this._historyRecords = null;
      this._historyRevision = '';
      // 人气 / 所属球队 / 主页战绩摘要：失败不进入 pageState error
      this.loadAuxiliaryProfileData(profile.userId);
      this.ensureHistoryLoaded({ forTab: false });
      // 动态仅首次进入动态 TAB 时读取；发布入口已迁至记分页
      if (this.data.activeTab === 'feed') {
        this.ensureMomentsLoaded({ forTab: true });
      }
      console.warn('[player-profile] ready', {
        identitySource: profile.identitySource || '',
        isCurrentUser: !!profile.isCurrentUser,
        isRegistered: !!profile.isRegistered
      });
    } catch (e) {
      console.warn('[player-profile] error', {
        stage: stage,
        message: e && e.message ? String(e.message) : 'unknown'
      });
      this.setData({ pageState: 'error', profile: null });
      this._profileLoaded = false;
    }
  },

  /** onShow：只刷关系计数与私人备注，不重建公开目录 */
  refreshSocialAndRemark() {
    const profile = this.data.profile;
    if (!profile || !profile.userId) return;
    const bundle = this._readViewerBundle(profile.userId, !!profile.isCurrentUser);
    const popularityText =
      (this.data.view && this.data.view.popularityText) ||
      reactionPopularityLedger.formatPopularityDisplay(this.data.popularityValue || 0);
    this.setData({
      social: bundle.social,
      showBattlePkBtn: !!bundle.showBattlePkBtn,
      viewerPrivate: bundle.viewerPrivate,
      view: this._buildView(
        profile,
        bundle.viewerPrivate.remarkName,
        popularityText
      )
    });
  },

  onTapBattlePk() {
    if (!this.data.showBattlePkBtn) return;
    const profile = this.data.profile;
    if (!profile || profile.isCurrentUser) return;
    const uid = profile.userId;
    if (!publicPlayerProfile.isStablePublicUserId(uid)) return;
    if (this._pkNavigating) return;
    this._pkNavigating = true;
    const self = this;
    wx.navigateTo({
      url:
        '/subpackages/player/pages/battle-pk/index?userId=' +
        encodeURIComponent(uid),
      complete: function () {
        self._pkNavigating = false;
      }
    });
  },

  onTapFollowAction() {
    if (!this.data.social.showFollowBtn || this.data.social.relationLoading) return;
    const status = this.data.social.relationStatus || 'none';
    if (status === 'none') {
      this._doFollow();
      return;
    }
    // following / friend → 打开取消关注面板（不可因 muted 样式而禁用）
    this.setData({
      relationSheetVisible: true,
      relationSheetTitle:
        status === 'friend' ? '你们已互相关注' : '已关注该球员'
    });
  },

  onCloseRelationSheet() {
    if (this.data.social.relationLoading) return;
    this.setData({ relationSheetVisible: false });
  },

  onConfirmUnfollow() {
    if (this.data.social.relationLoading) return;
    this._doUnfollow();
  },

  _doFollow() {
    const profile = this.data.profile;
    if (!profile || profile.isCurrentUser || this.data.social.relationLoading) return;
    const targetId = profile.userId;
    if (!publicPlayerProfile.isStablePublicUserId(targetId)) return;

    this.setData({ 'social.relationLoading': true });
    try {
      contactFollowAction.ensureStore();
      const status = contactFollowAction.followUser({
        id: targetId,
        userId: targetId,
        playerId: targetId,
        nickname: profile.nickname,
        name: profile.nickname,
        avatar: profile.avatar,
        gender: profile.gender,
        handicap: profile.handicap,
        floatCoef: profile.floatCoef,
        signature: profile.signature
      });
      if (!status) {
        this.setData({ 'social.relationLoading': false });
        wx.showToast({ title: '关注失败', icon: 'none' });
        return;
      }
      this.refreshSocialAndRemark();
      this.setData({ 'social.relationLoading': false });
      wx.showToast({
        title: status === 'friend' ? '已成为好友' : '已关注',
        icon: 'none',
        duration: 900
      });
    } catch (e) {
      this.setData({ 'social.relationLoading': false });
      wx.showToast({ title: '关注失败', icon: 'none' });
    }
  },

  _doUnfollow() {
    const profile = this.data.profile;
    if (!profile || profile.isCurrentUser || this.data.social.relationLoading) return;
    const targetId = profile.userId;
    this.setData({ 'social.relationLoading': true });
    try {
      const ok = contactFollowAction.unfollowUser(targetId);
      if (!ok) {
        // 失败：保留原关系与面板，允许重试
        this.setData({ 'social.relationLoading': false });
        wx.showToast({ title: '取消关注失败', icon: 'none' });
        return;
      }
      // 仅取消当前→目标；反向关注保留。展示为 none（加关注），不是 following
      this.refreshSocialAndRemark();
      this.setData({
        'social.relationLoading': false,
        relationSheetVisible: false
      });
      wx.showToast({ title: '已取消关注', icon: 'none', duration: 900 });
    } catch (e) {
      this.setData({ 'social.relationLoading': false });
      wx.showToast({ title: '取消关注失败', icon: 'none' });
    }
  },

  onTapEditRemark() {
    if (!this.data.viewerPrivate.canEditRemark) return;
    const name = String(this.data.viewerPrivate.remarkName || '');
    const note = String(this.data.viewerPrivate.remarkNote || '');
    this.setData({
      remarkSheetVisible: true,
      remarkDraftName: name,
      remarkDraftNote: note,
      remarkNameCount: contactStore.countChars(name),
      remarkNoteCount: contactStore.countChars(note)
    });
  },

  onCloseRemarkSheet() {
    this.setData({
      remarkSheetVisible: false,
      remarkDraftName: '',
      remarkDraftNote: '',
      remarkNameCount: 0,
      remarkNoteCount: 0
    });
  },

  onRemarkNameInput(e) {
    let value = (e.detail && e.detail.value) || '';
    const chars = Array.from(value);
    if (chars.length > REMARK_NAME_MAX) {
      value = chars.slice(0, REMARK_NAME_MAX).join('');
    }
    this.setData({
      remarkDraftName: value,
      remarkNameCount: contactStore.countChars(value)
    });
  },

  onRemarkNoteInput(e) {
    let value = (e.detail && e.detail.value) || '';
    const chars = Array.from(value);
    if (chars.length > REMARK_NOTE_MAX) {
      value = chars.slice(0, REMARK_NOTE_MAX).join('');
    }
    this.setData({
      remarkDraftNote: value,
      remarkNoteCount: contactStore.countChars(value)
    });
  },

  onSaveRemark() {
    const profile = this.data.profile;
    if (!profile || !this.data.viewerPrivate.canEditRemark) return;
    const me = socialRelationStore.resolveCurrentUserId();
    const name = String(this.data.remarkDraftName || '').trim();
    const note = String(this.data.remarkDraftNote || '');
    if (contactStore.countChars(name) > REMARK_NAME_MAX) {
      wx.showToast({ title: '备注名最多' + REMARK_NAME_MAX + '字', icon: 'none' });
      return;
    }
    if (contactStore.countChars(note) > REMARK_NOTE_MAX) {
      wx.showToast({ title: '备注最多' + REMARK_NOTE_MAX + '字', icon: 'none' });
      return;
    }
    const saved = contactStore.upsertPrivateRemark(me, profile.userId, {
      remarkName: name,
      remarkNote: note
    });
    if (!saved) {
      wx.showToast({ title: '保存失败', icon: 'none' });
      return;
    }
    this.onCloseRemarkSheet();
    this.refreshSocialAndRemark();
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  onBack() {
    this._clearSheetDrafts();
    wx.navigateBack({
      fail: () => wx.redirectTo({ url: '/pages/home/index' })
    });
  },

  onRetry() {
    this.loadProfile(this.data.userId, this._fallbackSnapshot || {});
  },

  onSwitchTab(e) {
    const tab =
      (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) ||
      '';
    if (tab !== 'home' && tab !== 'history' && tab !== 'feed') return;
    if (tab === this.data.activeTab) return;
    this.onCloseIxAction();
    this.setData({ activeTab: tab });
    if (tab === 'history') {
      this.ensureHistoryLoaded({ forTab: true });
    }
    if (tab === 'feed') {
      this.ensureMomentsLoaded({ forTab: true });
      if (this._feedScrollTop > 0) {
        this.setData({ feedScrollTop: this._feedScrollTop });
      }
    }
  },

  onSelectHistoryFilter(e) {
    const key =
      (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key) ||
      HISTORY_FILTERS.ALL;
    if (key === this.data.historyFilter) return;
    this.setData({ historyFilter: key, historyPage: 1 });
    this._applyHistoryFilterToView();
  },

  onTapViewAllHistory() {
    this.setData({ activeTab: 'history' });
    this.ensureHistoryLoaded({ forTab: true });
  },

  onHistoryLoadMore() {
    if (this.data.activeTab === 'feed') {
      this.onMomentLoadMore();
      return;
    }
    if (!this.data.historyHasMore || this.data.historyState !== 'ready') return;
    const next = (this.data.historyPage || 1) + 1;
    this.setData({ historyPage: next });
    this._applyHistoryFilterToView(true);
  },

  onFeedScroll(e) {
    if (this.data.activeTab !== 'feed') return;
    this.onCloseIxAction();
    const top = e && e.detail && e.detail.scrollTop;
    if (Number.isFinite(top)) this._feedScrollTop = top;
  },

  refreshMomentsIfRevisionChanged() {
    // 未进过动态 TAB：不读 Storage，避免主页 onShow 预取
    if (this.data.momentState === 'idle') return;
    let rev = '';
    try {
      rev = playerMomentStore.getMomentRevision();
    } catch (e) {
      return;
    }
    if (this._momentRevision && rev === this._momentRevision) {
      this.refreshScorecardsOnPage({ force: true });
      return;
    }
    this.ensureMomentsLoaded({ forTab: true, force: true });
  },

  /** 仅刷新当前页成绩卡轻量投影（LIVE / 改分权威成绩） */
  refreshScorecardsOnPage(options) {
    const opts = options || {};
    const cards = this.data.momentCards || [];
    if (!cards.length) return;
    let storeRev = '0';
    try {
      storeRev = publicScorecardView.getScoreStoreRevision();
    } catch (e) {
      storeRev = '0';
    }
    if (
      !opts.force &&
      this._scoreStoreRevision &&
      storeRev === this._scoreStoreRevision
    ) {
      return;
    }
    const me = socialRelationStore.resolveCurrentUserId();
    try {
      this._scoreStoreRevision = storeRev;
      this.setData({
        momentCards: publicScorecardView.attachPublicScorecardsToMoments(cards, me)
      });
    } catch (e2) { /* ignore */ }
  },

  _rememberInteractionRevisions(cards) {
    const map = this._interactionRevisions || {};
    (cards || []).forEach(function (c) {
      if (c && c.momentId) {
        map[c.momentId] = String(c.interactionRevision || '0');
      }
    });
    this._interactionRevisions = map;
  },

  _attachInteractionSummaries(cards) {
    try {
      const me = socialRelationStore.resolveCurrentUserId();
      const withIx = playerMomentInteractionStore.attachSummariesToMomentCards(cards, me);
      this._rememberInteractionRevisions(withIx);
      return this._attachReportStates(withIx);
    } catch (e) {
      profileAuxDebug('[player-profile] interaction summary failed', e && e.message);
      return cards || [];
    }
  },

  _attachReportStates(cards) {
    try {
      const me = socialRelationStore.resolveCurrentUserId();
      const next = playerContentReportStore.attachMomentReportStates(cards, me);
      this._reportRevision = playerContentReportStore.getReportRevision();
      return next;
    } catch (e) {
      return cards || [];
    }
  },

  refreshMomentReportsIfNeeded() {
    if (this.data.momentState === 'idle') return;
    const cards = this.data.momentCards || [];
    if (!cards.length) return;
    let rev = '';
    try {
      rev = playerContentReportStore.getReportRevision();
    } catch (e) {
      return;
    }
    if (this._reportRevision && rev === this._reportRevision) return;
    this.setData({ momentCards: this._attachReportStates(cards) });
  },

  _patchMomentReportLocal(momentId, reported) {
    const mid = momentId != null ? String(momentId) : '';
    if (!mid) return;
    const next = (this.data.momentCards || []).map(function (card) {
      if (!card || card.momentId !== mid) return card;
      return Object.assign({}, card, {
        reportedByCurrentUser: !!reported,
        canReport: reported ? false : !!card.canReport
      });
    });
    try {
      this._reportRevision = playerContentReportStore.getReportRevision();
    } catch (e) { /* ignore */ }
    this.setData({ momentCards: next });
  },

  /**
   * 仅按 momentRevisions 局部刷新 feed 摘要，不重读动态正文 Store。
   */
  refreshMomentInteractionsIfNeeded() {
    if (this.data.momentState === 'idle') return;
    const cards = this.data.momentCards || [];
    if (!cards.length) return;
    const ids = cards.map(function (c) {
      return c && c.momentId;
    }).filter(Boolean);
    let pack;
    try {
      pack = playerMomentInteractionStore.getMomentInteractionRevisions(ids);
    } catch (e) {
      return;
    }
    const prev = this._interactionRevisions || {};
    const changed = ids.filter(function (id) {
      return String((pack.momentRevisions && pack.momentRevisions[id]) || '0') !==
        String(prev[id] || '0');
    });
    if (!changed.length) return;
    this.patchMomentInteractionSummaries(changed);
  },

  patchMomentInteractionSummaries(momentIds) {
    const ids = Array.isArray(momentIds) ? momentIds.filter(Boolean) : [];
    if (!ids.length) return;
    const me = socialRelationStore.resolveCurrentUserId();
    let map = {};
    try {
      map = playerMomentInteractionStore.getMomentInteractionSummaryMap(ids, me) || {};
    } catch (e) {
      return;
    }
    const idSet = {};
    ids.forEach(function (id) {
      idSet[id] = true;
    });
    const canInteract =
      playerIdentityGuard.isStablePublicUserId(me) &&
      !playerIdentityGuard.isGuestPlayerId(me) &&
      !playerIdentityGuard.isMaskedPlayerId(me);
    const nextCards = (this.data.momentCards || []).map(function (card) {
      if (!card || !idSet[card.momentId]) return card;
      const s = map[card.momentId] || {};
      return Object.assign({}, card, {
        likeCount: s.likeCount || 0,
        likedByCurrentUser: canInteract ? !!s.likedByCurrentUser : false,
        likeAvatars: s.likeAvatars || [],
        likeAvatarPreview: s.likeAvatarPreview || [],
        hiddenLikeCount: s.hiddenLikeCount || 0,
        commentCount: s.commentCount || 0,
        commentPreview: s.commentPreview || [],
        hasInteraction: !!s.hasInteraction,
        interactionRevision: s.momentRevision || '0',
        canInteract: canInteract
      });
    });
    this._rememberInteractionRevisions(nextCards);
    this.setData({ momentCards: nextCards });
  },

  ensureMomentsLoaded(options) {
    const opts = options || {};
    const profile = this.data.profile;
    if (!profile || !profile.userId) return;
    if (
      !opts.force &&
      (this.data.momentState === 'ready' || this.data.momentState === 'empty')
    ) {
      return;
    }
    if (opts.forTab && this.data.momentState !== 'ready' && this.data.momentState !== 'empty') {
      this.setData({ momentState: 'loading' });
    }
    try {
      const me = socialRelationStore.resolveCurrentUserId();
      const page = playerMomentStore.listMomentsByAuthor(profile.userId, {
        viewerUserId: me,
        cursor: 0,
        limit: MOMENT_PAGE_SIZE
      });
      const cards = publicScorecardView.attachPublicScorecardsToMoments(
        this._attachInteractionSummaries(
          playerMomentStore.projectMomentsForViewer(page.items || [], me, {
            omitFullContent: true
          })
        ),
        me
      );
      this._momentRevision = page.revision || playerMomentStore.getMomentRevision();
      try {
        this._scoreStoreRevision = publicScorecardView.getScoreStoreRevision();
      } catch (eRev) {
        this._scoreStoreRevision = '';
      }
      this.setData({
        momentState: cards.length ? 'ready' : 'empty',
        momentCards: cards,
        momentCursor: page.nextCursor || 0,
        momentHasMore: !!page.hasMore,
        momentRefreshing: false
      });
      this._enrichMissingImageDims(cards);
    } catch (e) {
      profileAuxDebug('[player-profile] moments failed', e && e.message);
      this.setData({
        momentState: 'error',
        momentCards: [],
        momentHasMore: false,
        momentRefreshing: false
      });
    }
  },

  _enrichMissingImageDims(cards) {
    const list = Array.isArray(cards) ? cards : [];
    list.forEach(function (card) {
      if (!card || !card.momentId || !card.images || !card.images.length) return;
      playerMomentImageLayout.enrichMissingDimensionsInBackground(
        card.images,
        function (patch) {
          if (!patch || !patch.mediaId) return;
          try {
            playerMomentStore.patchMomentImageDimensions(
              card.momentId,
              patch.mediaId,
              patch.width,
              patch.height
            );
          } catch (err) { /* ignore */ }
        }
      );
    });
  },

  onMomentLoadMore() {
    if (!this.data.momentHasMore || this.data.momentState !== 'ready') return;
    const profile = this.data.profile;
    if (!profile || !profile.userId) return;
    try {
      const me = socialRelationStore.resolveCurrentUserId();
      const page = playerMomentStore.listMomentsByAuthor(profile.userId, {
        viewerUserId: me,
        cursor: this.data.momentCursor || 0,
        limit: MOMENT_PAGE_SIZE
      });
      const more = publicScorecardView.attachPublicScorecardsToMoments(
        this._attachInteractionSummaries(
          playerMomentStore.projectMomentsForViewer(page.items || [], me, {
            omitFullContent: true
          })
        ),
        me
      );
      this.setData({
        momentCards: (this.data.momentCards || []).concat(more),
        momentCursor: page.nextCursor || 0,
        momentHasMore: !!page.hasMore
      });
      this._enrichMissingImageDims(more);
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onMomentRefresh() {
    this.setData({ momentRefreshing: true });
    this.ensureMomentsLoaded({ forTab: true, force: true });
  },

  onTapScorecard(e) {
    const detail = (e && e.detail) || {};
    const url = detail.viewUrl || '';
    if (!url) {
      if (detail.ok === false) {
        wx.showToast({ title: '成绩卡暂不可用', icon: 'none' });
      }
      return;
    }
    wx.navigateTo({
      url: url,
      fail: function () {
        wx.showToast({ title: '无法打开比赛', icon: 'none' });
      }
    });
  },

  _openMomentDetail(momentId, extraQuery) {
    const id = momentId != null ? String(momentId) : '';
    if (!id) return;
    if (this._momentNavLock) return;
    this._momentNavLock = true;
    const self = this;
    let url =
      '/subpackages/player/pages/moment-detail/index?momentId=' +
      encodeURIComponent(id);
    if (extraQuery) url += '&' + extraQuery;
    wx.navigateTo({
      url: url,
      events: {
        momentDeleted: function (payload) {
          const mid = payload && payload.momentId;
          if (payload && payload.revision) {
            self._momentRevision = String(payload.revision);
          }
          if (mid) {
            const nextCards = (self.data.momentCards || []).filter(function (c) {
              return c.momentId !== mid;
            });
            self.setData({
              momentCards: nextCards,
              momentState: nextCards.length ? 'ready' : 'empty'
            });
          } else {
            self.ensureMomentsLoaded({ forTab: true, force: true });
          }
        },
        momentInteractionChanged: function (payload) {
          const mid = payload && payload.momentId;
          if (mid) self.patchMomentInteractionSummaries([mid]);
        },
        momentReportChanged: function (payload) {
          const mid = payload && payload.momentId;
          if (mid) self._patchMomentReportLocal(mid, !!payload.reportedByCurrentUser);
        }
      },
      complete: function () {
        self._momentNavLock = false;
      }
    });
  },

  onToggleIxAction(e) {
    const mid = (e && e.detail && e.detail.momentId) || '';
    if (!mid) return;
    this.setData({
      ixActionMomentId: this.data.ixActionMomentId === mid ? '' : mid
    });
  },

  onTapMomentCard(e) {
    if (this.data.ixActionMomentId) {
      this.onCloseIxAction();
      return;
    }
    const id =
      (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) ||
      '';
    this._openMomentDetail(id);
  },

  onTapMomentExpand(e) {
    if (this.data.ixActionMomentId) {
      this.onCloseIxAction();
      return;
    }
    this.onTapMomentCard(e);
  },

  onIxComment(e) {
    const mid = (e && e.detail && e.detail.momentId) || '';
    this.setData({ ixActionMomentId: '' });
    if (mid) this._openMomentDetail(mid, 'focusComment=1');
  },

  onIxTapBox(e) {
    const mid = (e && e.detail && e.detail.momentId) || '';
    this.setData({ ixActionMomentId: '' });
    if (mid) this._openMomentDetail(mid, 'focusComments=1');
  },

  onIxTapComment(e) {
    const d = (e && e.detail) || {};
    const mid = d.momentId || '';
    this.setData({ ixActionMomentId: '' });
    if (!mid) return;
    let q = 'focusComments=1';
    if (d.rootCommentId) {
      q += '&rootCommentId=' + encodeURIComponent(d.rootCommentId);
    }
    this._openMomentDetail(mid, q);
  },

  onIxTapReplyMore(e) {
    const d = (e && e.detail) || {};
    const mid = d.momentId || '';
    this.setData({ ixActionMomentId: '' });
    if (!mid) return;
    let q = 'focusComments=1';
    if (d.rootCommentId) {
      q += '&rootCommentId=' + encodeURIComponent(d.rootCommentId);
    }
    this._openMomentDetail(mid, q);
  },

  onIxTapUser(e) {
    const d = (e && e.detail) || {};
    if (!d.userId) return;
    this.setData({ ixActionMomentId: '', likeSheetVisible: false });
    openPlayerProfileUtil.openPlayerProfile({
      userId: d.userId,
      name: d.publicName || '',
      avatar: d.avatar || ''
    });
  },

  onIxTapLikeMore(e) {
    const mid = (e && e.detail && e.detail.momentId) || '';
    this.setData({ ixActionMomentId: '' });
    if (!mid) return;
    const cards = this.data.momentCards || [];
    let card = null;
    for (let i = 0; i < cards.length; i++) {
      if (cards[i] && cards[i].momentId === mid) {
        card = cards[i];
        break;
      }
    }
    if (!card) return;
    this.setData({
      likeSheetVisible: true,
      likeSheetCount: card.likeCount || 0,
      likeSheetAvatars: card.likeAvatars || card.likeAvatarPreview || []
    });
  },

  onCloseLikeSheet() {
    this.setData({ likeSheetVisible: false });
  },

  onLikeSheetTapUser(e) {
    const d = (e && e.detail) || {};
    if (!d.userId) return;
    this.setData({ likeSheetVisible: false });
    openPlayerProfileUtil.openPlayerProfile({
      userId: d.userId,
      name: '',
      avatar: d.avatar || ''
    });
  },

  onIxLike(e) {
    const mid = (e && e.detail && e.detail.momentId) || '';
    if (!mid) return;
    if (this._likeBusy && this._likeBusy[mid]) return;
    const cards = this.data.momentCards || [];
    let idx = -1;
    let card = null;
    for (let i = 0; i < cards.length; i++) {
      if (cards[i] && cards[i].momentId === mid) {
        idx = i;
        card = cards[i];
        break;
      }
    }
    if (!card || idx < 0) return;
    const me = socialRelationStore.resolveCurrentUserId();
    if (!playerIdentityGuard.isStablePublicUserId(me)) {
      wx.showToast({ title: '当前身份无法点赞', icon: 'none' });
      return;
    }
    const prevLiked = !!card.likedByCurrentUser;
    const prevPreview = (card.likeAvatarPreview || []).slice();
    const prevAvatars = (card.likeAvatars || []).slice();
    const prevHidden = card.hiddenLikeCount || 0;
    const prevCount = card.likeCount || 0;
    const prevHas = !!card.hasInteraction;
    const nextLiked = !prevLiked;
    const optimistic = playerMomentInteractionStore.projectOptimisticLikeAvatars({
      userId: me,
      liked: nextLiked,
      likeAvatars: prevAvatars,
      likeCount: prevCount,
      hasComments: (card.commentCount || 0) > 0 || (card.commentPreview || []).length > 0
    });
    this._likeBusy[mid] = true;
    const busy = Object.assign({}, this.data.likeBusyMap || {});
    busy[mid] = true;
    this.setData({
      ixActionMomentId: '',
      likeBusyMap: busy,
      ['momentCards[' + idx + '].likedByCurrentUser']: optimistic.likedByCurrentUser,
      ['momentCards[' + idx + '].likeAvatarPreview']: optimistic.likeAvatarPreview,
      ['momentCards[' + idx + '].likeAvatars']: optimistic.likeAvatars,
      ['momentCards[' + idx + '].hiddenLikeCount']: optimistic.hiddenLikeCount,
      ['momentCards[' + idx + '].likeCount']: optimistic.likeCount,
      ['momentCards[' + idx + '].hasInteraction']: optimistic.hasInteraction
    });
    const result = nextLiked
      ? playerMomentInteractionStore.likeMoment(mid, me)
      : playerMomentInteractionStore.unlikeMoment(mid, me);
    this._likeBusy[mid] = false;
    const busy2 = Object.assign({}, this.data.likeBusyMap || {});
    busy2[mid] = false;
    if (!result || !result.ok) {
      this.setData({
        likeBusyMap: busy2,
        ['momentCards[' + idx + '].likedByCurrentUser']: prevLiked,
        ['momentCards[' + idx + '].likeAvatarPreview']: prevPreview,
        ['momentCards[' + idx + '].likeAvatars']: prevAvatars,
        ['momentCards[' + idx + '].hiddenLikeCount']: prevHidden,
        ['momentCards[' + idx + '].likeCount']: prevCount,
        ['momentCards[' + idx + '].hasInteraction']: prevHas
      });
      wx.showToast({
        title:
          result && result.error === 'deleted'
            ? '动态已删除'
            : result && result.error === 'invisible'
              ? '动态不可见'
              : '操作失败',
        icon: 'none'
      });
      return;
    }
    if (result.momentRevision) {
      this._interactionRevisions[mid] = String(result.momentRevision);
    }
    this.setData({ likeBusyMap: busy2 });
    this.patchMomentInteractionSummaries([mid]);
  },


  onTapMomentReport(e) {
    const mid =
      (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) ||
      '';
    if (!mid) return;
    const cards = this.data.momentCards || [];
    let card = null;
    for (let i = 0; i < cards.length; i++) {
      if (cards[i] && cards[i].momentId === mid) {
        card = cards[i];
        break;
      }
    }
    if (!card) return;
    if (card.reportedByCurrentUser) {
      wx.showToast({ title: '已举报', icon: 'none' });
      return;
    }
    if (!card.canReport) return;
    this._openReportSheet({
      targetType: 'moment',
      targetId: mid,
      momentId: mid,
      title: '举报动态'
    });
  },

  _openReportSheet(target) {
    this._reportTarget = target || null;
    const sheet = this.selectComponent('#momentReportSheet');
    if (sheet && typeof sheet.resetForm === 'function') sheet.resetForm();
    this.setData({
      reportSheetVisible: true,
      reportSheetTitle: (target && target.title) || '举报',
      reportSubmitting: false
    });
  },

  onCloseReportSheet() {
    if (this.data.reportSubmitting) return;
    this._reportTarget = null;
    this.setData({ reportSheetVisible: false, reportSubmitting: false });
  },

  onSubmitReport(e) {
    if (this.data.reportSubmitting) return;
    const detail = (e && e.detail) || {};
    const target = this._reportTarget;
    if (!target || !target.targetType || !target.targetId) return;
    if (!detail.reasonCode) {
      wx.showToast({ title: '请选择举报原因', icon: 'none' });
      return;
    }
    const me = socialRelationStore.resolveCurrentUserId();
    this.setData({ reportSubmitting: true });
    const result = playerContentReportStore.createContentReport(
      {
        targetType: target.targetType,
        targetId: target.targetId,
        momentId: target.momentId,
        reasonCode: detail.reasonCode,
        description: detail.description || ''
      },
      me
    );
    if (!result || !result.ok) {
      this.setData({ reportSubmitting: false });
      const err = (result && result.error) || '';
      wx.showToast({
        title:
          err === 'cannot_report_self'
            ? '不能举报自己'
            : err === 'invalid_reporter'
              ? '当前身份无法举报'
              : err === 'reason_required'
                ? '请选择举报原因'
                : '举报失败，请重试',
        icon: 'none'
      });
      return;
    }
    this._reportTarget = null;
    this.setData({ reportSheetVisible: false, reportSubmitting: false });
    if (target.targetType === 'moment') {
      this._patchMomentReportLocal(target.targetId, true);
    }
    wx.showToast({ title: '举报已提交', icon: 'success' });
  },


  onTapMomentCommentPreview(e) {
    const id =
      (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) ||
      '';
    this._openMomentDetail(id, 'focusComments=1');
  },

  onPreviewMomentImage(e) {
    const d = (e && e.detail) || {};
    const mid = d.momentId || '';
    const idx = Number(d.index);
    const cards = this.data.momentCards || [];
    let card = null;
    for (let i = 0; i < cards.length; i++) {
      if (cards[i] && cards[i].momentId === mid) {
        card = cards[i];
        break;
      }
    }
    if (!card || !card.images || !card.images.length) return;
    const urls = playerMomentMedia.collectPreviewUrls(card.images);
    if (!urls.length) return;
    const currentImg = card.images[idx];
    const current =
      (currentImg && !currentImg.unavailable && (currentImg.renderPath || currentImg.path)) ||
      urls[0];
    wx.previewImage({
      current: current,
      urls: urls
    });
  },

  onMomentImageError(e) {
    const d = (e && e.detail) || {};
    const mid = d.momentId || '';
    const idx = Number(d.index);
    if (!mid || !(idx >= 0)) return;
    const cards = this.data.momentCards || [];
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      if (!card || card.momentId !== mid || !card.images || !card.images[idx]) continue;
      if (card.images[idx].unavailable) return;
      const images = card.images.slice();
      images[idx] = Object.assign({}, images[idx], {
        unavailable: true,
        renderPath: ''
      });
      this.setData({ ['momentCards[' + i + '].images']: images });
      return;
    }
  },

  onRetryMoments() {
    this.ensureMomentsLoaded({ forTab: true, force: true });
  },

  onTapHistoryCard(e) {
    const url =
      (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.url) ||
      '';
    if (!url) {
      wx.showToast({ title: '暂无赛事详情', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: url,
      fail: function () {
        wx.showToast({ title: '无法打开赛事详情', icon: 'none' });
      }
    });
  },

  refreshHistoryIfRevisionChanged() {
    if (this._historyRecords == null && this.data.historyState === 'idle') return;
    let rev = '';
    try {
      rev = playerMatchHistory.getStoreRevision();
    } catch (e) {
      return;
    }
    if (rev && rev === this._historyRevision) return;
    this.ensureHistoryLoaded({ forTab: this.data.activeTab === 'history', force: true });
  },

  /**
   * 统一历史加载：主页摘要与战绩 TAB 共用内存缓存。
   * forTab=true 时驱动 historyState loading/ready/empty/private/error。
   */
  ensureHistoryLoaded(options) {
    const opts = options || {};
    const profile = this.data.profile;
    if (!profile || !profile.userId) return;
    if (this._historyRecords && !opts.force) {
      this._publishHistoryViews();
      if (opts.forTab && this.data.historyState === 'idle') {
        this._applyHistoryFilterToView();
      }
      return;
    }
    if (opts.forTab) {
      this.setData({ historyState: 'loading' });
    }
    try {
      const me = socialRelationStore.resolveCurrentUserId();
      const bundle = playerMatchHistory.listPlayerMatchHistory(
        me,
        profile.userId,
        profile
      );
      this._historyAccess = bundle.access || null;
      this._historyRevision = bundle.revision || '';
      if (bundle.access && bundle.access.canViewHistory === false) {
        this._historyRecords = [];
        this.setData({
          historyState: 'private',
          historyCards: [],
          historyHasMore: false,
          historySummary: {
            playedCount: 0,
            completedCount: 0,
            bestGrossText: '--',
            recentCards: [],
            empty: true
          }
        });
        return;
      }
      this._historyRecords = Array.isArray(bundle.records) ? bundle.records : [];
      this._publishHistoryViews();
      if (opts.forTab || this.data.activeTab === 'history') {
        this._applyHistoryFilterToView();
      } else if (!this._historyRecords.length) {
        this.setData({ historyState: 'empty' });
      } else {
        this.setData({ historyState: 'ready' });
      }
    } catch (err) {
      profileAuxDebug('[player-profile] history failed', err && err.message);
      this._historyRecords = null;
      if (opts.forTab) {
        this.setData({ historyState: 'error', historyCards: [], historyHasMore: false });
      }
    }
  },

  _publishHistoryViews() {
    const records = Array.isArray(this._historyRecords) ? this._historyRecords : [];
    const summary = playerMatchHistory.buildHistorySummary(records);
    const recentCards = (summary.recent || []).map((r) =>
      playerMatchHistory.toHistoryCardView(r)
    );
    this.setData({
      historySummary: {
        playedCount: summary.playedCount || 0,
        completedCount: summary.completedCount || 0,
        bestGrossText:
          summary.bestGrossScore != null ? String(summary.bestGrossScore) : '--',
        recentCards: recentCards,
        empty: !records.length
      }
    });
  },

  _applyHistoryFilterToView(append) {
    const records = Array.isArray(this._historyRecords) ? this._historyRecords : [];
    if (this._historyAccess && this._historyAccess.canViewHistory === false) {
      this.setData({ historyState: 'private', historyCards: [], historyHasMore: false });
      return;
    }
    const filtered = playerMatchHistory.filterHistoryRecords(
      records,
      this.data.historyFilter
    );
    const page = append ? this.data.historyPage || 1 : 1;
    if (!append) this.setData({ historyPage: 1 });
    const paged = playerMatchHistory.paginateHistoryRecords(
      filtered,
      page,
      HISTORY_PAGE_SIZE
    );
    const cards = (paged.items || []).map((r) =>
      playerMatchHistory.toHistoryCardView(r)
    );
    let nextCards = cards;
    if (append && page > 1) {
      nextCards = (this.data.historyCards || []).concat(cards);
    }
    this.setData({
      historyState: filtered.length ? 'ready' : 'empty',
      historyCards: nextCards,
      historyHasMore: !!paged.hasMore,
      historyPage: page
    });
  },

  onRetryHistory() {
    this.ensureHistoryLoaded({ forTab: true, force: true });
  },

  noop() {}
});
