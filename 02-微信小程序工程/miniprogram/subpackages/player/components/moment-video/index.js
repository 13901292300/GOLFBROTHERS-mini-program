/**
 * 球友圈视频展示组件（player 分包）。
 * 不读动态 Store；默认只渲染封面，用户点击并 active=true 后才挂载 video。
 */
Component({
  properties: {
    video: { type: Object, value: null },
    momentId: { type: String, value: '' },
    themeClass: { type: String, value: 'bright-mode' },
    active: { type: Boolean, value: false },
    autoplay: { type: Boolean, value: false },
    /** feed | detail：详情区可更大 */
    variant: { type: String, value: 'feed' }
  },

  data: {
    videoId: '',
    mediaId: '',
    src: '',
    posterSrc: '',
    durationLabel: '',
    unavailable: false,
    /** 挂载真正的 <video> */
    activated: false,
    playing: false,
    playFailed: false,
    loading: false
  },

  observers: {
    'video, momentId': function (video, momentId) {
      this._syncFromVideo(video, momentId);
    },
    active: function (active) {
      if (active) {
        this._activateAndPlay();
      } else {
        this._deactivate();
      }
    }
  },

  lifetimes: {
    attached() {
      this._syncFromVideo(this.data.video, this.data.momentId);
    },
    detached() {
      this._pauseContext();
      this._videoCtx = null;
    }
  },

  methods: {
    _eventPayload(extra) {
      return Object.assign(
        {
          momentId: this.data.momentId || '',
          mediaId: this.data.mediaId || ''
        },
        extra || {}
      );
    },

    _resolveSrc(v) {
      if (!v || typeof v !== 'object') return '';
      // 仅信任投影结果 playablePath，避免绕过审核/缺失判定
      return String(v.playablePath || '').trim();
    },

    _resolvePoster(v) {
      if (!v || typeof v !== 'object') return '';
      // 仅信任投影 posterRenderPath；封面审核拒绝时为空 → 组件占位
      return String(v.posterRenderPath || '').trim();
    },

    _syncFromVideo(video, momentId) {
      const v = video && typeof video === 'object' ? video : {};
      const mediaId = String(v.mediaId || '').trim() || 'unknown';
      const unavailable = !!v.unavailable;
      const src = unavailable ? '' : this._resolveSrc(v);
      const posterSrc = this._resolvePoster(v);
      const durationLabel = String(v.durationLabel || '').trim();
      const safeId = mediaId.replace(/[^a-zA-Z0-9_-]/g, '_');
      this.setData({
        videoId: 'moment-video-' + safeId,
        mediaId: mediaId,
        src: src,
        posterSrc: posterSrc,
        durationLabel: durationLabel,
        unavailable: unavailable || !src,
        playFailed: false
      });
      if (!this.data.active) {
        this.setData({ activated: false, playing: false, loading: false });
      }
    },

    _getContext() {
      const id = this.data.videoId;
      if (!id) return null;
      try {
        this._videoCtx = wx.createVideoContext(id, this);
      } catch (e) {
        this._videoCtx = null;
      }
      return this._videoCtx;
    },

    _pauseContext() {
      try {
        const ctx = this._videoCtx || this._getContext();
        if (ctx && typeof ctx.pause === 'function') ctx.pause();
      } catch (e) { /* ignore */ }
    },

    /** 页面/父级可调用 */
    pause() {
      this._pauseContext();
      this.setData({ playing: false, loading: false });
    },

    _deactivate() {
      this._pauseContext();
      this.setData({
        activated: false,
        playing: false,
        loading: false
      });
      this._videoCtx = null;
    },

    _activateAndPlay() {
      if (this.data.unavailable || !this.data.src) return;
      const self = this;
      this.setData(
        {
          activated: true,
          loading: true,
          playFailed: false
        },
        function () {
          wx.nextTick(function () {
            const ctx = self._getContext();
            if (!ctx || typeof ctx.play !== 'function') {
              self.setData({ loading: false, playFailed: true, activated: false });
              self.triggerEvent('error', self._eventPayload({ reason: 'no_context' }));
              return;
            }
            try {
              ctx.play();
            } catch (e) {
              self.setData({ loading: false, playFailed: true, activated: false });
              self.triggerEvent('error', self._eventPayload({ reason: 'play_throw' }));
            }
          });
        }
      );
    },

    onTapPlay() {
      if (this.data.unavailable) return;
      if (!this.data.src) {
        this.setData({ playFailed: true });
        return;
      }
      // 仅请求页面授予唯一 active；真正播放由 active observer 触发
      this.triggerEvent('playrequest', this._eventPayload());
    },

    onTapRetry() {
      this.setData({ playFailed: false });
      this.onTapPlay();
    },

    onVideoPlay() {
      this.setData({ playing: true, loading: false, playFailed: false });
      this.triggerEvent('play', this._eventPayload());
    },

    onVideoPause() {
      this.setData({ playing: false, loading: false });
      this.triggerEvent('pause', this._eventPayload());
    },

    onVideoEnded() {
      this.setData({ playing: false, loading: false, activated: false });
      this._videoCtx = null;
      this.triggerEvent('ended', this._eventPayload());
    },

    onVideoError() {
      this._pauseContext();
      this.setData({
        playing: false,
        loading: false,
        activated: false,
        playFailed: true
      });
      this._videoCtx = null;
      this.triggerEvent('error', this._eventPayload({ reason: 'video_error' }));
    },

    noop() {}
  }
});
