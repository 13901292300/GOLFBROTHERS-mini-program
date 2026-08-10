/**
 * 完整点赞用户 Bottom Sheet（头像网格，公开全集）。
 */
Component({
  properties: {
    visible: { type: Boolean, value: false },
    themeClass: { type: String, value: 'bright-mode' },
    likeCount: { type: Number, value: 0 },
    likeAvatars: { type: Array, value: [] }
  },

  methods: {
    onMaskTap() {
      this.triggerEvent('close');
    },

    onTapUser(e) {
      const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      if (String(ds.open) !== '1') return;
      this.triggerEvent('tapuser', {
        userId: ds.uid || '',
        avatar: ds.avatar || ''
      });
    },

    noop() {}
  }
});
