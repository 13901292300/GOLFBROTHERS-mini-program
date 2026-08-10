/**
 * 发布球友圈动态 —— 仅接受记分页短期 publishToken。
 * 草稿以 draftMedia 为准；images 仅作图片网格短期兼容展示。
 */
const { createHeaderStyle } = require('../../../../utils/headerEngine.js');
const playerMomentStore = require('../../../../utils/playerMomentStore.js');
const playerMomentMedia = require('../../../../utils/playerMomentMedia.js');
const playerMomentImageLayout = require('../../../../utils/playerMomentImageLayout.js');
const socialRelationStore = require('../../../../utils/socialRelationStore.js');
const playerIdentityGuard = require('../../../../utils/playerIdentityGuard.js');
const playerMomentPublishContext = require('../../../../utils/playerMomentPublishContext.js');

const CONTENT_MAX = playerMomentStore.CONTENT_MAX_CHARS || 2000;
const IMAGES_MAX = playerMomentMedia.IMAGES_MAX || playerMomentStore.IMAGES_MAX || 9;
const VIDEO_MAX_DURATION_SEC = playerMomentMedia.VIDEO_MAX_DURATION_SEC || 60;
const VIDEO_MAX_SIZE_BYTES =
  playerMomentMedia.VIDEO_MAX_SIZE_BYTES || 100 * 1024 * 1024;
const VIDEO_SIZE_LABEL =
  (playerMomentMedia.formatVideoSizeLimitLabel &&
    playerMomentMedia.formatVideoSizeLimitLabel()) ||
  '100MB';

function safeDecode(raw) {
  if (raw == null) return '';
  const s = String(raw);
  try {
    return decodeURIComponent(s);
  } catch (e) {
    return s;
  }
}

function formatSizeLabel(bytes) {
  const n = Number(bytes) || 0;
  if (!(n > 0)) return '';
  if (n < 1024 * 1024) {
    const kb = Math.max(1, Math.round(n / 1024));
    return kb + 'KB';
  }
  const mb = Math.round((n / (1024 * 1024)) * 10) / 10;
  return mb + 'MB';
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    content: '',
    contentCount: 0,
    contentMax: CONTENT_MAX,
    /** @type {array} 业务草稿唯一来源 */
    draftMedia: [],
    draftMediaType: 'none',
    /** 图片网格短期兼容展示（由 draftMedia 派生） */
    images: [],
    imagesMax: IMAGES_MAX,
    videoDraft: null,
    videoPreviewPlaying: false,
    publishing: false,
    canPublish: false,
    gateReady: false,
    gateError: '',
    relatedMatchName: '',
    relatedScorecardLabel: '',
    mediaHint:
      '最多' +
      IMAGES_MAX +
      '张图片或1个视频（最长' +
      VIDEO_MAX_DURATION_SEC +
      '秒，不超过' +
      VIDEO_SIZE_LABEL +
      '）'
  },

  onLoad(query) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    this._dirty = false;
    this._relatedGame = null;
    this._videoCtx = null;
    const token = safeDecode((query && (query.publishToken || query.contextToken)) || '');
    const ctx = playerMomentPublishContext.takeMomentPublishContext(token, {
      consume: true
    });
    if (!ctx || !ctx.relatedGame) {
      this.setData({
        gateReady: false,
        gateError: '请从记分页「发布到球友圈」进入',
        canPublish: false
      });
      return;
    }
    const me = socialRelationStore.resolveCurrentUserId();
    if (
      !playerIdentityGuard.isStablePublicUserId(me) ||
      socialRelationStore.resolveCanonicalUserId(me) !==
        socialRelationStore.resolveCanonicalUserId(ctx.currentUserId)
    ) {
      this.setData({
        gateReady: false,
        gateError: '当前身份无法发布',
        canPublish: false
      });
      return;
    }
    const assert = playerMomentPublishContext.assertRelatedGameForCreate(
      ctx.relatedGame,
      me
    );
    if (!assert.ok) {
      this.setData({
        gateReady: false,
        gateError: '本场参赛资格校验失败',
        canPublish: false
      });
      return;
    }
    this._relatedGame = assert.relatedGame;
    this.setData({
      gateReady: true,
      gateError: '',
      relatedMatchName: assert.relatedGame.matchName || '本场比赛',
      relatedScorecardLabel: assert.relatedGame.publicScorecardId || '',
      draftMedia: [],
      draftMediaType: 'none',
      images: [],
      videoDraft: null
    });
    this._syncCanPublish();
  },

  onHide() {
    this._pausePreviewVideo();
  },

  onUnload() {
    this._pausePreviewVideo();
    this._dirty = false;
    this._relatedGame = null;
    this._videoCtx = null;
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

  _getDraftMedia() {
    return Array.isArray(this.data.draftMedia) ? this.data.draftMedia : [];
  },

  _resolveDraftType(list) {
    return playerMomentMedia.resolveMediaType(
      (list || []).map(function (m) {
        return {
          type: m && m.type,
          path: (m && (m.tempFilePath || m.path)) || '',
          duration: (m && m.duration) || 0
        };
      })
    );
  },

  _buildVideoDraftView(item) {
    if (!item || item.type !== 'video') return null;
    const duration = Number(item.duration) || 0;
    return {
      type: 'video',
      tempFilePath: item.tempFilePath || '',
      thumbTempFilePath: item.thumbTempFilePath || '',
      posterSrc: item.thumbTempFilePath || '',
      hasPoster: !!item.thumbTempFilePath,
      duration: duration,
      durationLabel:
        (playerMomentMedia.formatDurationLabel &&
          playerMomentMedia.formatDurationLabel(duration)) ||
        '0:00',
      size: Number(item.size) || 0,
      sizeLabel: formatSizeLabel(item.size),
      width: Number(item.width) || 0,
      height: Number(item.height) || 0
    };
  },

  _applyDraftMedia(list) {
    const draft = Array.isArray(list) ? list.slice() : [];
    const draftMediaType = this._resolveDraftType(draft);
    const images =
      draftMediaType === 'images'
        ? draft
            .filter(function (m) {
              return m && m.type === 'image';
            })
            .map(function (m) {
              return {
                tempFilePath: m.tempFilePath,
                width: Number(m.width) || 0,
                height: Number(m.height) || 0
              };
            })
        : [];
    const videoDraft =
      draftMediaType === 'video' ? this._buildVideoDraftView(draft[0]) : null;
    this._dirty = !!(
      draft.length || String(this.data.content || '').replace(/^\s+|\s+$/g, '')
    );
    this.setData({
      draftMedia: draft,
      draftMediaType: draftMediaType,
      images: images,
      videoDraft: videoDraft,
      videoPreviewPlaying: false
    });
    this._syncCanPublish();
  },

  _clearDraftMedia() {
    this._pausePreviewVideo();
    this.setData({
      draftMedia: [],
      draftMediaType: 'none',
      images: [],
      videoDraft: null,
      videoPreviewPlaying: false
    });
  },

  _syncCanPublish() {
    if (!this.data.gateReady || !this._relatedGame) {
      this.setData({ canPublish: false });
      return;
    }
    const content = String(this.data.content || '').replace(/^\s+|\s+$/g, '');
    const hasText = !!content;
    const hasMedia = this._getDraftMedia().length > 0;
    const tooLong = playerMomentStore.countChars(this.data.content || '') > CONTENT_MAX;
    this.setData({
      canPublish: (hasText || hasMedia) && !tooLong && !this.data.publishing
    });
  },

  _pausePreviewVideo() {
    try {
      if (!this._videoCtx && typeof wx.createVideoContext === 'function') {
        this._videoCtx = wx.createVideoContext('mpDraftVideo', this);
      }
      if (this._videoCtx && typeof this._videoCtx.pause === 'function') {
        this._videoCtx.pause();
      }
    } catch (e) { /* ignore */ }
    if (this.data.videoPreviewPlaying) {
      this.setData({ videoPreviewPlaying: false });
    }
  },

  onContentInput(e) {
    let value = (e.detail && e.detail.value) || '';
    const count = playerMomentStore.countChars(value);
    if (count > CONTENT_MAX) {
      value = playerMomentStore.sliceChars(value, CONTENT_MAX);
    }
    this._dirty = !!(value || this._getDraftMedia().length);
    this.setData({
      content: value,
      contentCount: playerMomentStore.countChars(value)
    });
    this._syncCanPublish();
  },

  onChooseMedia() {
    if (!this.data.gateReady || this.data.publishing) return;
    const draft = this._getDraftMedia();
    const existingType = this._resolveDraftType(draft);
    if (existingType === 'video') {
      wx.showToast({ title: '图片和视频暂不支持同时发布', icon: 'none' });
      return;
    }
    const remain =
      existingType === 'images' ? IMAGES_MAX - draft.length : IMAGES_MAX;
    if (existingType === 'images' && remain <= 0) {
      wx.showToast({ title: '最多' + IMAGES_MAX + '张图片', icon: 'none' });
      return;
    }

    const self = this;
    // 已有图片时只开图片选择，避免系统选择器混选；空草稿才同时开 image/video
    const chooseTypes = existingType === 'images' ? ['image'] : ['image', 'video'];
    playerMomentMedia
      .selectMomentMedia({
        maxImageCount: remain,
        mediaType: chooseTypes,
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        existingMediaType: existingType
      })
      .then(function (res) {
        if (!res || res.cancelled) return;
        if (!res.ok) {
          if (res.error === 'cancelled') return;
          wx.showToast({
            title: res.message || '选择失败',
            icon: 'none'
          });
          return;
        }
        const picked = res.media || [];
        if (!picked.length) return;

        const pickedType = self._resolveDraftType(picked);
        if (
          (existingType === 'images' && pickedType === 'video') ||
          (existingType === 'video' && pickedType === 'images') ||
          pickedType === 'mixed'
        ) {
          wx.showToast({
            title: '图片和视频暂不支持同时发布',
            icon: 'none'
          });
          return;
        }

        if (pickedType === 'video') {
          const v = picked[0];
          const duration = Number(v.duration) || 0;
          const size = Number(v.size) || 0;
          if (duration > VIDEO_MAX_DURATION_SEC) {
            wx.showToast({
              title: '视频最长支持' + VIDEO_MAX_DURATION_SEC + '秒',
              icon: 'none'
            });
            return;
          }
          if (size > VIDEO_MAX_SIZE_BYTES) {
            wx.showToast({
              title: '视频最大支持' + VIDEO_SIZE_LABEL,
              icon: 'none'
            });
            return;
          }
          self._pausePreviewVideo();
          self._applyDraftMedia([
            {
              type: 'video',
              tempFilePath: v.tempFilePath,
              thumbTempFilePath: v.thumbTempFilePath || '',
              duration: duration,
              size: size,
              width: Number(v.width) || 0,
              height: Number(v.height) || 0
            }
          ]);
          return;
        }

        // 图片：补齐宽高后并入草稿（仍不写最终持久目录）
        const imageTemps = picked
          .filter(function (p) {
            return p && p.type === 'image' && p.tempFilePath;
          })
          .map(function (p) {
            return {
              tempFilePath: p.tempFilePath,
              width: Number(p.width) || 0,
              height: Number(p.height) || 0
            };
          });
        playerMomentImageLayout
          .ensureTempFilesDimensions(imageTemps)
          .then(function (ready) {
            const next = draft.slice();
            (ready || []).forEach(function (f) {
              if (!f || !f.tempFilePath) return;
              if (next.length >= IMAGES_MAX) return;
              next.push({
                type: 'image',
                tempFilePath: f.tempFilePath,
                width: Number(f.width) || 0,
                height: Number(f.height) || 0
              });
            });
            self._applyDraftMedia(next);
          });
      });
  },

  onRemoveImage(e) {
    if (this.data.publishing) return;
    const idx = Number(
      e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.index
    );
    if (!Number.isFinite(idx) || idx < 0) return;
    const draft = this._getDraftMedia().filter(function (m) {
      return m && m.type === 'image';
    });
    draft.splice(idx, 1);
    this._applyDraftMedia(draft);
  },

  onRemoveVideo() {
    if (this.data.publishing) return;
    this._pausePreviewVideo();
    this._applyDraftMedia([]);
  },

  onTapVideoPreview() {
    if (this.data.publishing) return;
    const video = this.data.videoDraft;
    if (!video || !video.tempFilePath) return;
    if (!this._videoCtx && typeof wx.createVideoContext === 'function') {
      this._videoCtx = wx.createVideoContext('mpDraftVideo', this);
    }
    if (this.data.videoPreviewPlaying) {
      this._pausePreviewVideo();
      return;
    }
    try {
      if (this._videoCtx && typeof this._videoCtx.play === 'function') {
        this._videoCtx.play();
        this.setData({ videoPreviewPlaying: true });
      }
    } catch (e) {
      wx.showToast({ title: '视频暂不可预览', icon: 'none' });
    }
  },

  onDraftVideoPlay() {
    this.setData({ videoPreviewPlaying: true });
  },

  onDraftVideoPause() {
    this.setData({ videoPreviewPlaying: false });
  },

  onDraftVideoEnded() {
    this.setData({ videoPreviewPlaying: false });
  },

  onDraftVideoError() {
    this.setData({ videoPreviewPlaying: false });
    wx.showToast({ title: '视频暂不可预览', icon: 'none' });
  },

  async onPublish() {
    if (!this.data.gateReady || this.data.publishing || !this.data.canPublish) return;
    if (!this._relatedGame) {
      wx.showToast({ title: '缺少比赛关联', icon: 'none' });
      return;
    }
    const me = socialRelationStore.resolveCurrentUserId();
    const assert = playerMomentPublishContext.assertRelatedGameForCreate(
      this._relatedGame,
      me
    );
    if (!assert.ok) {
      wx.showToast({ title: '参赛资格已失效', icon: 'none' });
      return;
    }

    const content = String(this.data.content || '').replace(/^\s+|\s+$/g, '');
    const draft = this._getDraftMedia();
    if (!content && !draft.length) {
      wx.showToast({ title: '请输入文字或添加图片/视频', icon: 'none' });
      return;
    }

    // 发布前校验草稿（仍为临时路径，不写最终目录）
    const draftForCheck = draft.map(function (m) {
      if (!m) return null;
      if (m.type === 'video') {
        return {
          type: 'video',
          path: m.tempFilePath,
          tempFilePath: m.tempFilePath,
          duration: m.duration,
          size: m.size,
          width: m.width,
          height: m.height,
          storageMode: 'local'
        };
      }
      return {
        type: 'image',
        path: m.tempFilePath,
        tempFilePath: m.tempFilePath,
        width: m.width,
        height: m.height,
        storageMode: 'local_user_data'
      };
    });
    const check = playerMomentMedia.validateMomentMedia(draftForCheck);
    if (!check.ok) {
      let tip = check.message || '媒体无效';
      if (check.error === 'video_too_long') {
        tip = '视频最长支持' + VIDEO_MAX_DURATION_SEC + '秒';
      } else if (check.error === 'video_too_large') {
        tip = '视频最大支持' + VIDEO_SIZE_LABEL;
      } else if (check.error === 'mixed_image_video') {
        tip = '图片和视频暂不支持同时发布';
      }
      wx.showToast({ title: tip, icon: 'none' });
      return;
    }

    this._pausePreviewVideo();
    this.setData({ publishing: true, canPublish: false });

    let persistedMedia = [];
    try {
      let mediaRes = { ok: true, media: [] };
      if (draft.length) {
        mediaRes = await playerMomentMedia.persistMomentMedia(draft);
      }
      if (!mediaRes || !mediaRes.ok) {
        let tip = '媒体保存失败，请重试';
        if (mediaRes) {
          if (mediaRes.error === 'video_too_long') {
            tip = '视频最长支持' + VIDEO_MAX_DURATION_SEC + '秒';
          } else if (mediaRes.error === 'video_too_large') {
            tip = '视频最大支持' + VIDEO_SIZE_LABEL;
          } else if (mediaRes.message) {
            tip = mediaRes.message;
          }
        }
        wx.showToast({ title: tip, icon: 'none' });
        return;
      }
      persistedMedia = mediaRes.media || [];

      const created = playerMomentStore.createMoment({
        authorUserId: me,
        content: content,
        media: persistedMedia,
        relatedGame: assert.relatedGame
      });
      if (!created || !created.ok) {
        if (persistedMedia.length) {
          try {
            await playerMomentMedia.cleanupMomentMedia(persistedMedia);
          } catch (ce) { /* ignore */ }
        }
        persistedMedia = [];
        wx.showToast({
          title:
            created &&
            (created.error === 'related_game_required' ||
              created.error === 'not_in_game_slots' ||
              created.error === 'game_missing' ||
              created.error === 'match_missing')
              ? '需关联本场成绩卡'
              : '发布失败',
          icon: 'none'
        });
        return;
      }

      // 成功：清空草稿，不清理已归属动态的媒体
      this._dirty = false;
      this._clearDraftMedia();
      this.setData({ content: '', contentCount: 0 });
      try {
        const channel = this.getOpenerEventChannel && this.getOpenerEventChannel();
        if (channel && channel.emit) {
          channel.emit('momentPublished', {
            momentId: created.moment && created.moment.momentId,
            revision: created.revision
          });
        }
      } catch (e) { /* ignore */ }
      wx.showToast({ title: '已发布', icon: 'success', duration: 800 });
      setTimeout(function () {
        wx.navigateBack({ fail: function () {} });
      }, 400);
    } catch (err) {
      if (persistedMedia.length) {
        try {
          await playerMomentMedia.cleanupMomentMedia(persistedMedia);
        } catch (ce) { /* ignore */ }
      }
      wx.showToast({ title: '发布失败，草稿已保留', icon: 'none' });
    } finally {
      this.setData({ publishing: false });
      this._syncCanPublish();
    }
  },

  onBack() {
    if (this.data.publishing) return;
    if (!this.data.gateReady) {
      wx.navigateBack({ fail: function () {} });
      return;
    }
    if (!this._dirty) {
      this._pausePreviewVideo();
      wx.navigateBack({ fail: function () {} });
      return;
    }
    const self = this;
    wx.showModal({
      title: '放弃编辑？',
      content: '当前有未发布内容，返回将丢失',
      confirmText: '放弃',
      cancelText: '继续编辑',
      success: function (res) {
        if (res.confirm) {
          self._dirty = false;
          self._pausePreviewVideo();
          self._clearDraftMedia();
          wx.navigateBack({ fail: function () {} });
        }
      }
    });
  }
});
