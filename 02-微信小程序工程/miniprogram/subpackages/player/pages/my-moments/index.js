/**
 * 我的球友圈：仅展示当前登录用户自己的动态。
 * 不接受外部 authorUserId / userId 覆盖。
 */
const { createHeaderStyle } = require('../../../../utils/headerEngine.js');
const playerMomentStore = require('../../../../utils/playerMomentStore.js');
const playerMomentInteractionStore = require('../../../../utils/playerMomentInteractionStore.js');
const playerMomentMedia = require('../../../../utils/playerMomentMedia.js');
const playerMomentImageLayout = require('../../../../utils/playerMomentImageLayout.js');
const playerContentReportStore = require('../../../../utils/playerContentReportStore.js');
const publicScorecardView = require('../../../../utils/publicScorecardView.js');
const socialRelationStore = require('../../../../utils/socialRelationStore.js');
const playerIdentityGuard = require('../../../../utils/playerIdentityGuard.js');
const openPlayerProfileUtil = require('../../../../utils/openPlayerProfile.js');

const PAGE_SIZE = playerMomentStore.PAGE_SIZE || 20;

function _ixSummaryPatch(s) {
  const src = s || {};
  return {
    likeCount: src.likeCount || 0,
    likedByCurrentUser: !!src.likedByCurrentUser,
    likeAvatars: src.likeAvatars || [],
    likeAvatarPreview: src.likeAvatarPreview || [],
    hiddenLikeCount: src.hiddenLikeCount || 0,
    commentCount: src.commentCount || 0,
    commentPreview: src.commentPreview || [],
    hasInteraction: !!src.hasInteraction,
    interactionRevision: src.momentRevision || '0',
    canInteract: src.canInteract !== false
  };
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    pageState: 'loading',
    momentCards: [],
    momentCursor: 0,
    momentHasMore: false,
    momentRefreshing: false,
    reportSheetVisible: false,
    reportSheetTitle: '举报动态',
    reportSubmitting: false,
    ixActionMomentId: '',
    likeBusyMap: {},
    likeSheetVisible: false,
    likeSheetCount: 0,
    likeSheetAvatars: []
  },

  onLoad() {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    this._momentRevision = '';
    this._scoreStoreRevision = '';
    this._interactionRevisions = {};
    this._reportRevision = '';
    this._reportTarget = null;
    this._navLock = false;
    this._likeBusy = {};
    // 忽略 query 中的 authorUserId / userId，强制当前登录用户
    this._authorUserId = socialRelationStore.resolveCurrentUserId();
    this.loadMoments({ reset: true });
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
    // 仍只读当前登录用户，防止外部覆盖
    this._authorUserId = socialRelationStore.resolveCurrentUserId();
    this.refreshIfNeeded();
  },

  onHide() {
    this.onCloseIxAction();
    this.onCloseLikeSheet();
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

  _currentAuthorId() {
    return socialRelationStore.resolveCurrentUserId();
  },

  refreshIfNeeded() {
    let momentRev = '';
    try {
      momentRev = playerMomentStore.getMomentRevision();
    } catch (e) {
      return;
    }
    if (!this._momentRevision || momentRev !== this._momentRevision) {
      this.loadMoments({ reset: true });
      return;
    }
    this.patchInteractionSummaries();
    this.patchMomentReportStates();
    this.refreshScorecardsOnPage({ force: true });
  },

  _attachReportStates(cards) {
    try {
      const me = this._currentAuthorId();
      const next = playerContentReportStore.attachMomentReportStates(cards, me);
      this._reportRevision = playerContentReportStore.getReportRevision();
      return next;
    } catch (e) {
      return cards || [];
    }
  },

  patchMomentReportStates(forceIds) {
    const cards = this.data.momentCards || [];
    if (!cards.length) return;
    let rev = '';
    try {
      rev = playerContentReportStore.getReportRevision();
    } catch (e) {
      return;
    }
    const forced = Array.isArray(forceIds) ? forceIds : null;
    if (!forced && this._reportRevision && rev === this._reportRevision) return;
    const next = this._attachReportStates(cards);
    this.setData({ momentCards: next });
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
   * 从权威成绩重新投影当前页成绩卡。
   * 缓存失效看 publicScorecardId + scoreRevision；Store revision 变化也强制刷新。
   */
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
    const me = this._currentAuthorId();
    try {
      const next = publicScorecardView.attachPublicScorecardsToMoments(cards, me);
      this._scoreStoreRevision = storeRev;
      this.setData({ momentCards: next });
    } catch (e) { /* ignore */ }
  },

  patchInteractionSummaries() {
    const cards = this.data.momentCards || [];
    if (!cards.length) return;
    const ids = cards
      .map(function (c) {
        return c && c.momentId;
      })
      .filter(Boolean);
    let pack;
    try {
      pack = playerMomentInteractionStore.getMomentInteractionRevisions(ids);
    } catch (e) {
      return;
    }
    const prev = this._interactionRevisions || {};
    const changed = ids.filter(function (id) {
      return (
        String((pack.momentRevisions && pack.momentRevisions[id]) || '0') !==
        String(prev[id] || '0')
      );
    });
    if (!changed.length) return;
    const me = this._currentAuthorId();
    let map = {};
    try {
      map = playerMomentInteractionStore.getMomentInteractionSummaryMap(changed, me) || {};
    } catch (e) {
      return;
    }
    const idSet = {};
    changed.forEach(function (id) {
      idSet[id] = true;
    });
    const nextCards = cards.map(function (card) {
      if (!card || !idSet[card.momentId]) return card;
      return Object.assign({}, card, _ixSummaryPatch(map[card.momentId]));
    });
    this._rememberInteractionRevisions(nextCards);
    this.setData({ momentCards: nextCards });
  },

  _rememberInteractionRevisions(cards) {
    const map = this._interactionRevisions || {};
    (cards || []).forEach(function (c) {
      if (c && c.momentId) map[c.momentId] = String(c.interactionRevision || '0');
    });
    this._interactionRevisions = map;
  },

  loadMoments(options) {
    const opts = options || {};
    const authorUserId = this._currentAuthorId();
    this._authorUserId = authorUserId;
    if (!playerIdentityGuard.isStablePublicUserId(authorUserId)) {
      this.setData({
        pageState: 'empty',
        momentCards: [],
        momentHasMore: false,
        momentRefreshing: false
      });
      return;
    }
    if (opts.reset) {
      this.setData({
        pageState: this.data.momentCards.length ? this.data.pageState : 'loading',
        momentRefreshing: !!opts.refresh
      });
    }
    try {
      const page = playerMomentStore.listMomentsByAuthor(authorUserId, {
        viewerUserId: authorUserId,
        cursor: opts.reset ? 0 : this.data.momentCursor || 0,
        limit: PAGE_SIZE
      });
      const projected = playerMomentStore.projectMomentsForViewer(page.items || [], authorUserId, {
        omitFullContent: true
      });
      const withIx = playerMomentInteractionStore.attachSummariesToMomentCards(
        projected,
        authorUserId
      );
      const withReport = this._attachReportStates(withIx);
      const cards = publicScorecardView.attachPublicScorecardsToMoments(
        withReport,
        authorUserId
      );
      this._rememberInteractionRevisions(cards);
      this._momentRevision = page.revision || playerMomentStore.getMomentRevision();
      try {
        this._scoreStoreRevision = publicScorecardView.getScoreStoreRevision();
      } catch (e2) {
        this._scoreStoreRevision = '';
      }
      const nextList = opts.reset ? cards : (this.data.momentCards || []).concat(cards);
      this.setData({
        pageState: nextList.length ? 'ready' : 'empty',
        momentCards: nextList,
        momentCursor: page.nextCursor || 0,
        momentHasMore: !!page.hasMore,
        momentRefreshing: false
      });
      this._enrichMissingImageDims(cards);
    } catch (e) {
      this.setData({
        pageState: 'error',
        momentRefreshing: false
      });
    }
  },

  /** 后台补齐缺宽高元数据并写回 Store；不改当前页布局以免跳动 */
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
          } catch (e) { /* ignore */ }
        }
      );
    });
  },

  onRefresh() {
    this.setData({ momentRefreshing: true });
    this.loadMoments({ reset: true, refresh: true });
  },

  onLoadMore() {
    if (!this.data.momentHasMore || this.data.pageState !== 'ready') return;
    this.loadMoments({ reset: false });
  },

  onRetry() {
    this.loadMoments({ reset: true });
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

  _openDetail(momentId, extraQuery) {
    const id = momentId != null ? String(momentId) : '';
    if (!id || this._navLock) return;
    this._navLock = true;
    const self = this;
    let url =
      '/subpackages/player/pages/moment-detail/index?momentId=' + encodeURIComponent(id);
    if (extraQuery) url += '&' + extraQuery;
    wx.navigateTo({
      url: url,
      events: {
        momentDeleted: function (payload) {
          const mid = payload && payload.momentId;
          if (mid) {
            const next = (self.data.momentCards || []).filter(function (c) {
              return c.momentId !== mid;
            });
            self.setData({
              momentCards: next,
              pageState: next.length ? 'ready' : 'empty'
            });
          } else {
            self.loadMoments({ reset: true });
          }
        },
        momentInteractionChanged: function (payload) {
          const mid = payload && payload.momentId;
          if (!mid) return;
          const me = self._currentAuthorId();
          try {
            const map = playerMomentInteractionStore.getMomentInteractionSummaryMap([mid], me);
            const s = map[mid] || {};
            const next = (self.data.momentCards || []).map(function (card) {
              if (!card || card.momentId !== mid) return card;
              return Object.assign({}, card, _ixSummaryPatch(s));
            });
            self._rememberInteractionRevisions(next);
            self.setData({ momentCards: next, ixActionMomentId: '' });
          } catch (e) { /* ignore */ }
        },
        momentReportChanged: function (payload) {
          const mid = payload && payload.momentId;
          if (!mid) return;
          self._patchMomentReportLocal(mid, !!payload.reportedByCurrentUser);
        }
      },
      complete: function () {
        self._navLock = false;
      }
    });
  },

  onCloseIxAction() {
    if (!this.data.ixActionMomentId) return;
    this.setData({ ixActionMomentId: '' });
  },

  onToggleIxAction(e) {
    const mid = (e && e.detail && e.detail.momentId) || '';
    if (!mid) return;
    const next = this.data.ixActionMomentId === mid ? '' : mid;
    this.setData({ ixActionMomentId: next });
  },

  onTapCard(e) {
    if (this.data.ixActionMomentId) {
      this.onCloseIxAction();
      return;
    }
    const id =
      (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '';
    this._openDetail(id);
  },

  onTapExpand(e) {
    if (this.data.ixActionMomentId) {
      this.onCloseIxAction();
      return;
    }
    this.onTapCard(e);
  },

  onIxComment(e) {
    const mid = (e && e.detail && e.detail.momentId) || '';
    this.setData({ ixActionMomentId: '' });
    if (mid) this._openDetail(mid, 'focusComment=1');
  },

  onIxTapBox(e) {
    const mid = (e && e.detail && e.detail.momentId) || '';
    this.setData({ ixActionMomentId: '' });
    if (mid) this._openDetail(mid, 'focusComments=1');
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
    this._openDetail(mid, q);
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
    this._openDetail(mid, q);
  },

  onIxTapUser(e) {
    const d = (e && e.detail) || {};
    const uid = d.userId || '';
    if (!uid) return;
    this.setData({ ixActionMomentId: '', likeSheetVisible: false });
    openPlayerProfileUtil.openPlayerProfile({
      userId: uid,
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
    if (!mid || (this._likeBusy && this._likeBusy[mid])) return;
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
    const me = this._currentAuthorId();
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
      wx.showToast({ title: '操作失败', icon: 'none' });
      return;
    }
    try {
      const map = playerMomentInteractionStore.getMomentInteractionSummaryMap([mid], me);
      const s = map[mid] || {};
      const patch = _ixSummaryPatch(s);
      const sync = { likeBusyMap: busy2 };
      Object.keys(patch).forEach(function (k) {
        sync['momentCards[' + idx + '].' + k] = patch[k];
      });
      this.setData(sync);
      this._interactionRevisions[mid] = String(s.momentRevision || '0');
    } catch (err) {
      this.setData({ likeBusyMap: busy2 });
    }
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

  onTapReport(e) {
    const mid =
      (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '';
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
    const me = this._currentAuthorId();
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

  onPreviewImage(e) {
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

  onBack() {
    wx.navigateBack({ fail: function () {} });
  },

  noop() {}
});
