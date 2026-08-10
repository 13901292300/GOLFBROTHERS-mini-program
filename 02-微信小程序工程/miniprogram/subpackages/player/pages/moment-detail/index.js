/**
 * 动态详情：点赞 / 评论 / 回复
 */
const { createHeaderStyle } = require('../../../../utils/headerEngine.js');
const playerMomentStore = require('../../../../utils/playerMomentStore.js');
const playerMomentInteractionStore = require('../../../../utils/playerMomentInteractionStore.js');
const playerMomentMedia = require('../../../../utils/playerMomentMedia.js');
const playerMomentImageLayout = require('../../../../utils/playerMomentImageLayout.js');
const contentReportService = require('../../../../utils/contentReportService.js');
const publicScorecardView = require('../../../../utils/publicScorecardView.js');
const socialRelationStore = require('../../../../utils/socialRelationStore.js');
const playerIdentityGuard = require('../../../../utils/playerIdentityGuard.js');
const openPlayerProfileUtil = require('../../../../utils/openPlayerProfile.js');

const COMMENT_MAX = playerMomentInteractionStore.COMMENT_MAX_CHARS || 500;
const COMMENT_PAGE = playerMomentInteractionStore.COMMENT_PAGE_SIZE || 20;

function safeDecode(raw) {
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
    momentId: '',
    view: null,
    likeCount: 0,
    likedByCurrentUser: false,
    likeBusy: false,
    likeAvatars: [],
    likeAvatarPreview: [],
    hiddenLikeCount: 0,
    hasInteraction: false,
    commentCount: 0,
    comments: [],
    commentCursor: 0,
    commentHasMore: false,
    commentLoading: false,
    expandedRootIds: {},
    focusRootCommentId: '',
    commentDraft: '',
    commentCountLabel: 0,
    commentMax: COMMENT_MAX,
    canSubmitComment: false,
    submittingComment: false,
    inputFocus: false,
    replyToCommentId: '',
    replyToDisplayName: '',
    keyboardHeight: 0,
    scrollIntoView: '',
    canReportMoment: false,
    momentReported: false,
    reportSheetVisible: false,
    reportSheetTitle: '举报',
    reportSubmitting: false,
    ixActionOpen: false,
    canInteract: false,
    /** 详情页单一主视频 active（不与 Feed 共享） */
    activeVideoMomentId: ''
  },

  onLoad(query) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    const momentId = safeDecode((query && query.momentId) || '');
    this._focusComment = String((query && query.focusComment) || '') === '1';
    this._focusComments = String((query && query.focusComments) || '') === '1';
    this._focusRootCommentId = safeDecode((query && query.rootCommentId) || '');
    this._interactionDirty = false;
    this._reportDirty = false;
    this._likeBusy = false;
    this._scoreStoreRevision = '';
    this._reportTarget = null;
    this.setData({ momentId: momentId });
    this.loadMoment(momentId);
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
    if (this.data.pageState === 'ready' && this.data.view) {
      this.refreshScorecard({ force: true });
    }
  },

  onHide() {
    this._stopActiveVideo();
    this.onCloseIxAction();
    this.setData({
      inputFocus: false,
      replyToCommentId: '',
      replyToDisplayName: '',
      keyboardHeight: 0
    });
  },

  onCloseIxAction() {
    if (!this.data.ixActionOpen) return;
    this.setData({ ixActionOpen: false });
  },

  _stopActiveVideo() {
    if (!this.data.activeVideoMomentId) return;
    this.setData({ activeVideoMomentId: '' });
  },

  onVideoPlayRequest(e) {
    const detail = (e && e.detail) || {};
    const mid =
      (detail.momentId != null ? String(detail.momentId) : '') ||
      this.data.momentId ||
      '';
    if (!mid) return;
    if (this.data.activeVideoMomentId === mid) {
      const self = this;
      this.setData({ activeVideoMomentId: '' }, function () {
        self.setData({ activeVideoMomentId: mid });
      });
      return;
    }
    this.setData({ activeVideoMomentId: mid });
  },

  onVideoPlay() {},

  /** 原生 pause / 评论键盘场景由页面主动 _stopActiveVideo；控件内 pause 保持 active */
  onVideoPause() {},

  onVideoEnded(e) {
    const mid =
      e && e.detail && e.detail.momentId != null ? String(e.detail.momentId) : '';
    if (mid && mid === this.data.activeVideoMomentId) {
      this.setData({ activeVideoMomentId: '' });
    }
  },

  onVideoError(e) {
    const mid =
      e && e.detail && e.detail.momentId != null ? String(e.detail.momentId) : '';
    if (mid && mid === this.data.activeVideoMomentId) {
      this.setData({ activeVideoMomentId: '' });
    }
  },

  noop() {},

  refreshScorecard(options) {
    const opts = options || {};
    const view = this.data.view;
    if (!view || !view.relatedGame) return;
    let storeRev = '0';
    try {
      storeRev = publicScorecardView.getScoreStoreRevision();
    } catch (e0) {
      storeRev = '0';
    }
    const prevSc = view.publicScorecard;
    if (
      !opts.force &&
      this._scoreStoreRevision &&
      storeRev === this._scoreStoreRevision &&
      prevSc &&
      prevSc.ok
    ) {
      return;
    }
    const me = socialRelationStore.resolveCurrentUserId();
    try {
      const sc = publicScorecardView.resolvePublicScorecardView(
        view.relatedGame.publicScorecardId,
        me,
        {
          relatedGame: view.relatedGame,
          authorUserId: view.authorUserId
        }
      );
      this._scoreStoreRevision = storeRev;
      this.setData({ 'view.publicScorecard': sc });
    } catch (e) {
      this._scoreStoreRevision = storeRev;
      this.setData({
        'view.publicScorecard': {
          ok: false,
          unavailable: true,
          message: '成绩卡暂不可用'
        }
      });
    }
  },

  onUnload() {
    this._stopActiveVideo();
    this.setData({
      inputFocus: false,
      replyToCommentId: '',
      replyToDisplayName: '',
      keyboardHeight: 0
    });
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

  _emitInteractionChanged() {
    try {
      const channel = this.getOpenerEventChannel && this.getOpenerEventChannel();
      if (channel && channel.emit) {
        channel.emit('momentInteractionChanged', {
          momentId: this.data.momentId,
          likeCount: this.data.likeCount,
          likedByCurrentUser: this.data.likedByCurrentUser,
          commentCount: this.data.commentCount
        });
      }
    } catch (e) { /* ignore */ }
  },

  _emitReportChanged() {
    if (!this._reportDirty) return;
    try {
      const channel = this.getOpenerEventChannel && this.getOpenerEventChannel();
      if (channel && channel.emit) {
        channel.emit('momentReportChanged', {
          momentId: this.data.momentId,
          reportedByCurrentUser: !!this.data.momentReported
        });
      }
    } catch (e) { /* ignore */ }
  },

  loadMoment(momentId) {
    this.setData({ pageState: 'loading' });
    try {
      if (!momentId) {
        this.setData({ pageState: 'notFound', view: null });
        return;
      }
      const raw = playerMomentStore.getMomentById(momentId, { includeDeleted: true });
      if (!raw) {
        this.setData({ pageState: 'notFound', view: null });
        return;
      }
      if (raw.status === 'deleted') {
        this.setData({ pageState: 'deleted', view: null });
        return;
      }
      const me = socialRelationStore.resolveCurrentUserId();
      // 公开可见：不依赖关注/好友；仅 deleted / 审核下架 / 显式拉黑等例外
      if (!playerMomentStore.canViewerSeeMoment(me, raw)) {
        this.setData({ pageState: 'notFound', view: null });
        return;
      }
      const canInteract =
        playerIdentityGuard.isStablePublicUserId(me) &&
        !playerIdentityGuard.isGuestPlayerId(me) &&
        !playerIdentityGuard.isMaskedPlayerId(me);
      const projected = playerMomentStore.projectMomentsForViewer([raw], me, {
        skipMediaInspect: false
      });
      let view = projected[0] || null;
      if (!view) {
        this.setData({ pageState: 'notFound', view: null });
        return;
      }
      try {
        const attached = publicScorecardView.attachPublicScorecardsToMoments([view], me);
        view = attached[0] || view;
        this._scoreStoreRevision = publicScorecardView.getScoreStoreRevision();
      } catch (scErr) {
        view = Object.assign({}, view, {
          publicScorecard: {
            ok: false,
            unavailable: true,
            message: '成绩卡暂不可用'
          }
        });
      }
      let likeAvatars = [];
      let likeAvatarPreview = [];
      let hiddenLikeCount = 0;
      let likedByCurrentUser = false;
      let likeCount = 0;
      try {
        const summary = playerMomentInteractionStore.getMomentLikeSummary(momentId, me);
        likeAvatars = summary.likeAvatars || [];
        likeAvatarPreview = likeAvatars;
        hiddenLikeCount = 0;
        likedByCurrentUser = canInteract ? !!summary.likedByCurrentUser : false;
        likeCount = summary.likeCount || 0;
      } catch (le) { /* ignore */ }
      let canReportMoment = false;
      let momentReported = false;
      try {
        const rs = contentReportService.getReportState('moment', momentId);
        momentReported = !!(rs && rs.reported);
        canReportMoment = !!(
          rs &&
          rs.canReport &&
          view &&
          !view.canDelete
        );
      } catch (re) { /* ignore */ }
      const self = this;
      this.setData(
        {
          pageState: 'ready',
          view: view,
          likeCount: likeCount,
          likedByCurrentUser: likedByCurrentUser,
          likeAvatars: likeAvatars,
          likeAvatarPreview: likeAvatarPreview,
          hiddenLikeCount: hiddenLikeCount,
          hasInteraction: likeAvatars.length > 0,
          canReportMoment: canReportMoment,
          momentReported: momentReported,
          ixActionOpen: false,
          canInteract: canInteract
        },
        function () {
          self.loadComments({ force: true });
          self._enrichMissingImageDims(view);
          if (self._focusComment) {
            setTimeout(function () {
              self.setData({ inputFocus: true, scrollIntoView: 'md-composer-anchor' });
            }, 220);
          } else if (self._focusComments) {
            setTimeout(function () {
              self.setData({ scrollIntoView: 'md-comments-anchor' });
            }, 220);
          }
        }
      );
    } catch (e) {
      console.warn('[moment-detail] error', e && e.message);
      this.setData({ pageState: 'error', view: null });
    }
  },

  loadComments(options) {
    const opts = options || {};
    const momentId = this.data.momentId;
    if (!momentId) return;
    if (this.data.commentLoading && !opts.force) return;
    this.setData({ commentLoading: true });
    try {
      const me = socialRelationStore.resolveCurrentUserId();
      let expanded = Object.assign({}, this.data.expandedRootIds || {});
      if (this._focusRootCommentId) {
        expanded[this._focusRootCommentId] = true;
      }
      if (opts.expandRootId) {
        expanded[opts.expandRootId] = true;
      }
      const page = playerMomentInteractionStore.listMomentComments(momentId, {
        viewerUserId: me,
        expandedRootIds: expanded
      });
      const items = page.items || [];
      let withReport = items;
      try {
        withReport = contentReportService.attachCommentReportStates(items);
      } catch (re) {
        withReport = items;
      }
      const commentCount = page.total != null ? page.total : 0;
      this.setData({
        comments: withReport,
        commentCursor: 0,
        commentHasMore: false,
        commentCount: commentCount,
        expandedRootIds: expanded,
        hasInteraction:
          (this.data.likeAvatars && this.data.likeAvatars.length > 0) ||
          commentCount > 0,
        commentLoading: false
      });
      if (opts.scrollToCommentId) {
        const self = this;
        setTimeout(function () {
          self.setData({ scrollIntoView: 'cmt-' + opts.scrollToCommentId });
        }, 80);
      } else if (this._focusRootCommentId) {
        const rid = this._focusRootCommentId;
        this._focusRootCommentId = '';
        const self2 = this;
        setTimeout(function () {
          self2.setData({ scrollIntoView: 'cmt-' + rid });
        }, 80);
      }
    } catch (e) {
      this.setData({ commentLoading: false });
      wx.showToast({ title: '评论加载失败', icon: 'none' });
    }
  },

  onCommentLoadMore() {
    /* 树结构一次加载；保留空实现兼容 WXML */
  },

  onToggleThread(e) {
    const d = (e && e.detail) || {};
    const rootId = d.rootCommentId || '';
    if (!rootId) return;
    const expanded = Object.assign({}, this.data.expandedRootIds || {});
    if (d.expanded) {
      delete expanded[rootId];
    } else {
      expanded[rootId] = true;
    }
    this.setData({ expandedRootIds: expanded });
    this.loadComments({ force: true });
  },

  onToggleIxAction() {
    this.setData({ ixActionOpen: !this.data.ixActionOpen });
  },

  onIxComment() {
    const me = socialRelationStore.resolveCurrentUserId();
    if (!playerIdentityGuard.isStablePublicUserId(me)) {
      this.setData({ ixActionOpen: false });
      wx.showToast({ title: '当前身份无法评论', icon: 'none' });
      return;
    }
    this._stopActiveVideo();
    this.setData({
      ixActionOpen: false,
      inputFocus: true,
      scrollIntoView: 'md-composer-anchor'
    });
  },

  onIxTapUser(e) {
    const d = (e && e.detail) || {};
    if (!d.userId) return;
    this._stopActiveVideo();
    this.setData({ ixActionOpen: false });
    openPlayerProfileUtil.openPlayerProfile({
      userId: d.userId,
      name: d.publicName || '',
      avatar: d.avatar || ''
    });
  },

  onIxLike() {
    if (this.data.pageState !== 'ready' || this._likeBusy || this.data.likeBusy) return;
    const me = socialRelationStore.resolveCurrentUserId();
    if (!playerIdentityGuard.isStablePublicUserId(me)) {
      wx.showToast({ title: '当前身份无法点赞', icon: 'none' });
      return;
    }
    const prevLiked = !!this.data.likedByCurrentUser;
    const prevAvatars = (this.data.likeAvatars || []).slice();
    const prevPreview = (this.data.likeAvatarPreview || []).slice();
    const prevCount = Math.max(0, Number(this.data.likeCount) || 0);
    const prevHas = !!this.data.hasInteraction;
    const nextLiked = !prevLiked;
    const optimistic = playerMomentInteractionStore.projectOptimisticLikeAvatars({
      userId: me,
      liked: nextLiked,
      likeAvatars: prevAvatars,
      likeCount: prevCount,
      hasComments: (this.data.commentCount || 0) > 0
    });
    this._likeBusy = true;
    this.setData({
      ixActionOpen: false,
      likeBusy: true,
      likedByCurrentUser: optimistic.likedByCurrentUser,
      likeAvatars: optimistic.likeAvatars,
      likeAvatarPreview: optimistic.likeAvatars,
      likeCount: optimistic.likeCount,
      hiddenLikeCount: 0,
      hasInteraction: optimistic.hasInteraction
    });
    const result = nextLiked
      ? playerMomentInteractionStore.likeMoment(this.data.momentId, me)
      : playerMomentInteractionStore.unlikeMoment(this.data.momentId, me);
    this._likeBusy = false;
    if (!result || !result.ok) {
      this.setData({
        likeBusy: false,
        likedByCurrentUser: prevLiked,
        likeAvatars: prevAvatars,
        likeAvatarPreview: prevPreview,
        likeCount: prevCount,
        hasInteraction: prevHas
      });
      wx.showToast({
        title:
          result && result.error === 'deleted'
            ? '动态已删除'
            : '操作失败',
        icon: 'none'
      });
      return;
    }
    try {
      const summary = playerMomentInteractionStore.getMomentLikeSummary(
        this.data.momentId,
        me
      );
      const avatars = summary.likeAvatars || [];
      this.setData({
        likeBusy: false,
        likedByCurrentUser: !!summary.likedByCurrentUser,
        likeCount: summary.likeCount || 0,
        likeAvatars: avatars,
        likeAvatarPreview: avatars,
        hiddenLikeCount: 0,
        hasInteraction:
          (summary.likeCount || 0) > 0 || (this.data.commentCount || 0) > 0
      });
    } catch (err) {
      this.setData({ likeBusy: false });
    }
    this._interactionDirty = true;
    this._emitInteractionChanged();
  },

  onIxTapComment(e) {
    const d = (e && e.detail) || {};
    const commentId = d.commentId || '';
    if (!commentId) return;
    this.setData({ ixActionOpen: false });
    // 自己的评论：点按打开删除面板；他人/已删父评：进入回复该节点
    if (d.isCommentAuthor && !d.isDeleted) {
      this._openCommentActionMenu({
        commentId: commentId,
        canDelete: true,
        canReport: false,
        reported: false
      });
      return;
    }
    if (!this.data.canInteract) {
      wx.showToast({ title: '当前身份无法评论', icon: 'none' });
      return;
    }
    const expanded = Object.assign({}, this.data.expandedRootIds || {});
    if (d.rootCommentId) expanded[d.rootCommentId] = true;
    this.setData({
      expandedRootIds: expanded,
      replyToCommentId: commentId,
      replyToDisplayName: d.isDeleted
        ? '原评论'
        : d.authorDisplayName || '球友',
      inputFocus: true,
      scrollIntoView: 'md-composer-anchor'
    });
  },

  onIxLongPressComment(e) {
    const d = (e && e.detail) || {};
    this._openCommentActionMenu(d);
  },

  _openCommentActionMenu(d) {
    this._stopActiveVideo();
    const src = d || {};
    const commentId = src.commentId || '';
    if (!commentId) return;
    const canDelete = !!src.canDelete;
    const canReport = !!src.canReport;
    const reported = !!src.reported;
    if (reported && !canDelete) {
      wx.showToast({ title: '已举报', icon: 'none' });
      return;
    }
    if (!canDelete && !canReport) return;
    const itemList = [];
    const actions = [];
    if (canDelete) {
      itemList.push('删除评论');
      actions.push('delete');
    }
    if (canReport) {
      itemList.push('举报评论');
      actions.push('report');
    }
    const self = this;
    const sheetOpts = {
      itemList: itemList,
      success: function (res) {
        const act = actions[res.tapIndex];
        if (act === 'delete') self._confirmDeleteComment(commentId);
        if (act === 'report') {
          self._openReportSheet({
            targetType: 'comment',
            targetId: commentId,
            momentId: self.data.momentId,
            title: '举报评论'
          });
        }
      }
    };
    if (itemList.length === 1 && actions[0] === 'delete') {
      sheetOpts.itemColor = '#dc2626';
    }
    wx.showActionSheet(sheetOpts);
  },


  onCommentFocus() {
    this._stopActiveVideo();
  },

  onCommentInput(e) {
    let value = (e.detail && e.detail.value) || '';
    const count = playerMomentInteractionStore.countChars(value);
    if (count > COMMENT_MAX) {
      value = playerMomentInteractionStore.sliceChars(value, COMMENT_MAX);
    }
    const trimmed = String(value).replace(/^\s+|\s+$/g, '');
    this.setData({
      commentDraft: value,
      commentCountLabel: playerMomentInteractionStore.countChars(value),
      canSubmitComment:
        !!trimmed &&
        playerMomentInteractionStore.countChars(value) <= COMMENT_MAX &&
        !this.data.submittingComment
    });
  },

  onKeyboardHeight(e) {
    const h = e && e.detail && e.detail.height;
    this.setData({ keyboardHeight: Number(h) > 0 ? Number(h) : 0 });
  },

  onCancelReply() {
    this.setData({
      replyToCommentId: '',
      replyToDisplayName: '',
      inputFocus: false
    });
  },

  onSubmitComment() {
    if (this.data.submittingComment || !this.data.canSubmitComment) return;
    if (this.data.pageState !== 'ready') return;
    const me = socialRelationStore.resolveCurrentUserId();
    if (!playerIdentityGuard.isStablePublicUserId(me)) {
      wx.showToast({ title: '当前身份无法评论', icon: 'none' });
      return;
    }
    const content = String(this.data.commentDraft || '').replace(/^\s+|\s+$/g, '');
    if (!content) {
      wx.showToast({ title: '请输入评论', icon: 'none' });
      return;
    }
    this.setData({ submittingComment: true, canSubmitComment: false });
    const input = {
      momentId: this.data.momentId,
      content: content
    };
    if (this.data.replyToCommentId) {
      input.parentCommentId = this.data.replyToCommentId;
    }
    const result = playerMomentInteractionStore.createMomentComment(input, me);
    if (!result || !result.ok) {
      this.setData({
        submittingComment: false,
        canSubmitComment: true
      });
      let tip = '发送失败';
      if (result) {
        if (result.error === 'deleted' || result.error === 'invisible') tip = '动态不可评论';
        else if (result.error === 'invalid_reply_target') tip = '回复对象无效';
        else if (result.error === 'content_too_long') tip = '评论过长';
        else if (result.error === 'depth_exceeded') tip = '回复层级过深';
      }
      wx.showToast({ title: tip, icon: 'none' });
      return;
    }
    const created = result.comment || {};
    const expandRoot = created.rootCommentId || created.commentId || '';
    const expanded = Object.assign({}, this.data.expandedRootIds || {});
    if (expandRoot) expanded[expandRoot] = true;
    this.setData({
      submittingComment: false,
      commentDraft: '',
      commentCountLabel: 0,
      canSubmitComment: false,
      replyToCommentId: '',
      replyToDisplayName: '',
      inputFocus: false,
      expandedRootIds: expanded
    });
    this.loadComments({
      force: true,
      expandRootId: expandRoot,
      scrollToCommentId: created.commentId || ''
    });
    this._interactionDirty = true;
    this._emitInteractionChanged();
    wx.showToast({ title: '已发送', icon: 'success', duration: 700 });
  },

  onTapReportMoment() {
    if (this.data.momentReported) {
      wx.showToast({ title: '已举报', icon: 'none' });
      return;
    }
    if (!this.data.canReportMoment) return;
    this._openReportSheet({
      targetType: 'moment',
      targetId: this.data.momentId,
      momentId: this.data.momentId,
      title: '举报动态'
    });
  },

  _openReportSheet(target) {
    this._stopActiveVideo();
    this._reportTarget = target || null;
    const sheet = this.selectComponent('#momentReportSheet');
    if (sheet && typeof sheet.resetForm === 'function') sheet.resetForm();
    this.setData({
      reportSheetVisible: true,
      reportSheetTitle: (target && target.title) || '举报',
      reportSubmitting: false,
      inputFocus: false
    });
  },

  onCloseReportSheet() {
    if (this.data.reportSubmitting) return;
    this._reportTarget = null;
    this.setData({ reportSheetVisible: false, reportSubmitting: false });
  },

  async onSubmitReport(e) {
    if (this.data.reportSubmitting) return;
    const detail = (e && e.detail) || {};
    const target = this._reportTarget;
    if (!target || !target.targetType || !target.targetId) return;
    if (!detail.reasonCode) {
      wx.showToast({ title: '请选择举报原因', icon: 'none' });
      return;
    }
    this.setData({ reportSubmitting: true });
    let result = null;
    try {
      result = await contentReportService.submitReport({
        targetType: target.targetType,
        targetId: target.targetId,
        momentId: target.momentId || this.data.momentId,
        reasonCode: detail.reasonCode,
        description: detail.description || ''
      });
    } catch (err) {
      result = { ok: false, error: 'submit_failed' };
    }
    if (!result || !result.ok) {
      this.setData({ reportSubmitting: false });
      wx.showToast({
        title: contentReportService.formatSubmitError(result && result.error),
        icon: 'none'
      });
      return;
    }
    this._reportTarget = null;
    this.setData({ reportSheetVisible: false, reportSubmitting: false });
    if (target.targetType === 'moment') {
      this._reportDirty = true;
      this.setData({
        momentReported: true,
        canReportMoment: false
      });
      this._emitReportChanged();
    } else if (target.targetType === 'comment') {
      const cid = target.targetId;
      const next = (this.data.comments || []).map(function (c) {
        if (!c || c.commentId !== cid) return c;
        return Object.assign({}, c, {
          reportedByCurrentUser: true,
          canReport: false
        });
      });
      this.setData({ comments: next });
    }
    wx.showToast({ title: '举报已提交', icon: 'success' });
  },


  _confirmDeleteComment(commentId) {
    const self = this;
    wx.showModal({
      title: '删除评论',
      content: '删除后无法恢复',
      confirmText: '删除',
      confirmColor: '#dc2626',
      success: function (res) {
        if (!res.confirm) return;
        const me = socialRelationStore.resolveCurrentUserId();
        const result = playerMomentInteractionStore.deleteMomentComment(commentId, me);
        if (!result || !result.ok) {
          wx.showToast({
            title: result && result.error === 'forbidden' ? '无权删除' : '删除失败',
            icon: 'none'
          });
          return;
        }
        self.loadComments({ force: true });
        self._interactionDirty = true;
        self._emitInteractionChanged();
        wx.showToast({ title: '已删除', icon: 'success', duration: 700 });
      }
    });
  },

  _enrichMissingImageDims(view) {
    if (!view || !view.momentId || !view.images || !view.images.length) return;
    playerMomentImageLayout.enrichMissingDimensionsInBackground(
      view.images,
      function (patch) {
        if (!patch || !patch.mediaId) return;
        try {
          playerMomentStore.patchMomentImageDimensions(
            view.momentId,
            patch.mediaId,
            patch.width,
            patch.height
          );
        } catch (err) { /* ignore */ }
      }
    );
  },

  onMomentImageError(e) {
    const d = (e && e.detail) || {};
    const idx = Number(d.index);
    const view = this.data.view;
    if (!view || !view.images || !(idx >= 0) || !view.images[idx]) return;
    if (view.images[idx].unavailable) return;
    const images = view.images.slice();
    images[idx] = Object.assign({}, images[idx], {
      unavailable: true,
      renderPath: ''
    });
    this.setData({ 'view.images': images });
  },

  onPreviewImage(e) {
    const d = (e && e.detail) || {};
    const idx = Number(d.index);
    const view = this.data.view;
    if (!view || !view.images || !view.images.length) return;
    const urls = playerMomentMedia.collectPreviewUrls(view.images);
    if (!urls.length) return;
    const currentImg = view.images[idx];
    const current =
      (currentImg && !currentImg.unavailable && (currentImg.renderPath || currentImg.path)) ||
      urls[0];
    wx.previewImage({
      current: current,
      urls: urls
    });
  },

  onTapAuthor() {
    const view = this.data.view;
    if (!view || !view.canOpenProfile) return;
    this._stopActiveVideo();
    try {
      const pages = getCurrentPages();
      const prev = pages && pages.length > 1 ? pages[pages.length - 2] : null;
      const prevRoute = (prev && prev.route) || '';
      const prevUid =
        (prev && prev.data && prev.data.userId) ||
        (prev && prev.data && prev.data.profile && prev.data.profile.userId) ||
        '';
      if (
        prevRoute.indexOf('subpackages/player/pages/profile/index') >= 0 &&
        prevUid &&
        socialRelationStore.resolveCanonicalUserId(prevUid) ===
          socialRelationStore.resolveCanonicalUserId(view.authorUserId)
      ) {
        wx.navigateBack({ fail: function () {} });
        return;
      }
    } catch (e) { /* fall through */ }
    openPlayerProfileUtil.openPlayerProfile({
      userId: view.authorUserId,
      name: view.authorPublicName,
      avatar: view.avatar,
      identitySource: 'moment'
    });
  },

  onTapCommentAuthor(e) {
    const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
    if (String(ds.open) !== '1') return;
    openPlayerProfileUtil.openPlayerProfile({
      userId: ds.uid,
      name: ds.name,
      avatar: ds.avatar,
      identitySource: 'moment_comment'
    });
  },

  onDelete() {
    const view = this.data.view;
    if (!view || !view.canDelete) return;
    const self = this;
    wx.showModal({
      title: '删除动态',
      content: '删除后无法恢复',
      confirmText: '删除',
      confirmColor: '#dc2626',
      success: function (res) {
        if (!res.confirm) return;
        self._stopActiveVideo();
        const me = socialRelationStore.resolveCurrentUserId();
        const result = playerMomentStore.deleteMoment(view.momentId, me);
        if (!result.ok) {
          wx.showToast({
            title: result.error === 'forbidden' ? '无权删除' : '删除失败',
            icon: 'none'
          });
          return;
        }
        try {
          const channel = self.getOpenerEventChannel && self.getOpenerEventChannel();
          if (channel && channel.emit) {
            channel.emit('momentDeleted', {
              momentId: view.momentId,
              revision: result.revision
            });
          }
        } catch (e) { /* ignore */ }
        wx.showToast({ title: '已删除', icon: 'success', duration: 700 });
        setTimeout(function () {
          wx.navigateBack({ fail: function () {} });
        }, 350);
      }
    });
  },

  onRetry() {
    this.loadMoment(this.data.momentId);
  },

  onBack() {
    if (this._interactionDirty) this._emitInteractionChanged();
    this._emitReportChanged();
    wx.navigateBack({ fail: function () {} });
  }
});

