/**
 * Feed/主页/详情共用：视频与图片互斥媒体块（player 分包）。
 */
Component({
  properties: {
    mediaType: { type: String, value: 'none' },
    momentId: { type: String, value: '' },
    themeClass: { type: String, value: 'bright-mode' },
    video: { type: Object, value: null },
    active: { type: Boolean, value: false },
    variant: { type: String, value: 'feed' },
    imageCount: { type: Number, value: 0 },
    imageLayout: { type: String, value: '' },
    singleImageClass: { type: String, value: '' },
    singleImageStyle: { type: String, value: '' },
    images: { type: Array, value: [] }
  },

  methods: {
    onPlayRequest(e) {
      this.triggerEvent('playrequest', (e && e.detail) || {});
    },
    onPlay(e) {
      this.triggerEvent('play', (e && e.detail) || {});
    },
    onPause(e) {
      this.triggerEvent('pause', (e && e.detail) || {});
    },
    onEnded(e) {
      this.triggerEvent('ended', (e && e.detail) || {});
    },
    onError(e) {
      this.triggerEvent('error', (e && e.detail) || {});
    },
    onPreview(e) {
      this.triggerEvent('preview', (e && e.detail) || {});
    },
    onImageError(e) {
      this.triggerEvent('imageerror', (e && e.detail) || {});
    }
  }
});
