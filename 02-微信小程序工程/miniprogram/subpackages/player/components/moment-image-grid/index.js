/**
 * 朋友圈式 1～9 图宫格。布局字段由页面/Store 注入，组件只渲染与事件。
 */
Component({
  properties: {
    momentId: { type: String, value: '' },
    themeClass: { type: String, value: 'bright-mode' },
    imageLayout: { type: String, value: '' },
    singleImageClass: { type: String, value: '' },
    singleImageStyle: { type: String, value: '' },
    images: { type: Array, value: [] }
  },

  methods: {
    onPreview(e) {
      const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      if (String(ds.unavailable) === '1') return;
      const index = Number(ds.index);
      if (!(index >= 0)) return;
      this.triggerEvent(
        'preview',
        {
          momentId: this.data.momentId,
          index: index
        },
        { bubbles: false, composed: false }
      );
    },

    onImageError(e) {
      const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      const index = Number(ds.index);
      if (!(index >= 0)) return;
      this.triggerEvent('imageerror', {
        momentId: this.data.momentId,
        index: index
      });
    },

    noop() {}
  }
});
