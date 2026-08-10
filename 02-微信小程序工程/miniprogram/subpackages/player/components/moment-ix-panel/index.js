/**
 * 朋友圈式互动：·· 浮层 + 点赞头像组 + 评论区（feed/detail 共用视觉）。
 * 数据由页面注入；不写入 Store。
 */
Component({
  properties: {
    momentId: { type: String, value: '' },
    themeClass: { type: String, value: 'bright-mode' },
    /** feed | detail */
    mode: { type: String, value: 'feed' },
    actionOpen: { type: Boolean, value: false },
    likedByCurrentUser: { type: Boolean, value: false },
    likeBusy: { type: Boolean, value: false },
    likeCount: { type: Number, value: 0 },
    /** feed：预览头像；detail：完整头像集合 */
    likeAvatarPreview: { type: Array, value: [] },
    hiddenLikeCount: { type: Number, value: 0 },
    comments: { type: Array, value: [] },
    hasInteraction: { type: Boolean, value: false },
    canReport: { type: Boolean, value: false },
    reportedByCurrentUser: { type: Boolean, value: false },
    showReport: { type: Boolean, value: false },
    /** 正式用户可赞评；guest/masked 不展示误导性入口 */
    canInteract: { type: Boolean, value: true }
  },

  methods: {
    onPanelTap() {
      // 点面板空白处：关闭浮层；feed 点互动区另由 onTapInteractionBox 处理
      if (this.data.actionOpen) {
        this.triggerEvent('closeaction', { momentId: this.data.momentId });
      }
    },

    onToggleAction() {
      if (!this.data.canInteract || this.data.likeBusy) return;
      this.triggerEvent('toggleaction', { momentId: this.data.momentId });
    },

    onLike() {
      if (!this.data.canInteract || this.data.likeBusy) return;
      this.triggerEvent('like', { momentId: this.data.momentId });
    },

    onComment() {
      if (!this.data.canInteract) return;
      this.triggerEvent('comment', { momentId: this.data.momentId });
    },

    onReport() {
      this.triggerEvent('report', { momentId: this.data.momentId });
    },

    onTapLikeAvatar(e) {
      const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      if (String(ds.open) !== '1') return;
      this.triggerEvent('tapuser', {
        userId: ds.uid || '',
        publicName: '',
        avatar: ds.avatar || ''
      });
    },

    onTapLikeMore() {
      this.triggerEvent('taplikemore', {
        momentId: this.data.momentId,
        likeCount: this.data.likeCount || 0,
        hiddenLikeCount: this.data.hiddenLikeCount || 0
      });
    },

    onTapCommentAuthor(e) {
      const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      if (String(ds.open) !== '1') return;
      this.triggerEvent('tapuser', {
        userId: ds.uid || '',
        publicName: ds.name || '',
        avatar: ds.avatar || ''
      });
    },

    onTapReplyTo(e) {
      const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      if (String(ds.open) !== '1') return;
      this.triggerEvent('tapuser', {
        userId: ds.uid || '',
        publicName: ds.name || '',
        avatar: ''
      });
    },

    onTapCommentRow(e) {
      const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      if (String(ds.deleted) === '1') {
        // 已删除父评：仍可进入回复线程
        this.triggerEvent('tapcomment', {
          momentId: this.data.momentId,
          commentId: ds.id || '',
          rootCommentId: ds.root || '',
          authorDisplayName: '原评论',
          isCommentAuthor: false,
          canDelete: false,
          canReport: false,
          reported: false,
          isDeleted: true
        });
        return;
      }
      this.triggerEvent('tapcomment', {
        momentId: this.data.momentId,
        commentId: ds.id || '',
        rootCommentId: ds.root || '',
        authorDisplayName: ds.name || '',
        isCommentAuthor: String(ds.isauthor) === '1',
        canDelete: String(ds.candelete) === '1',
        canReport: String(ds.canreport) === '1',
        reported: String(ds.reported) === '1',
        isDeleted: false
      });
    },

    onLongPressComment(e) {
      const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      if (String(ds.deleted) === '1') return;
      this.triggerEvent('longpresscomment', {
        momentId: this.data.momentId,
        commentId: ds.id || '',
        isCommentAuthor: String(ds.isauthor) === '1',
        canDelete: String(ds.candelete) === '1',
        canReport: String(ds.canreport) === '1',
        reported: String(ds.reported) === '1'
      });
    },

    onTapCommentMore(e) {
      this.onLongPressComment(e);
    },

    onToggleThread(e) {
      const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      this.triggerEvent('togglethread', {
        momentId: this.data.momentId,
        rootCommentId: ds.root || '',
        expanded: String(ds.expanded) === '1'
      });
    },

    onTapReplyMore(e) {
      const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      this.triggerEvent('tapreplymore', {
        momentId: this.data.momentId,
        commentId: ds.id || '',
        rootCommentId: ds.root || ''
      });
    },

    onTapInteractionBox() {
      if (this.data.actionOpen) {
        this.triggerEvent('closeaction', { momentId: this.data.momentId });
        return;
      }
      // feed：点击互动区进详情评论区；阻止冒泡到卡片
      if (this.data.mode === 'feed') {
        this.triggerEvent('tapbox', { momentId: this.data.momentId });
      }
    },

    noop() {}
  }
});
