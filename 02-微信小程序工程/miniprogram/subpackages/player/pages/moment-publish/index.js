/**
 * 发布球友圈动态 —— 仅接受记分页短期 publishToken。
 */
const { createHeaderStyle } = require('../../../../utils/headerEngine.js');
const playerMomentStore = require('../../../../utils/playerMomentStore.js');
const playerMomentMedia = require('../../../../utils/playerMomentMedia.js');
const playerMomentImageLayout = require('../../../../utils/playerMomentImageLayout.js');
const socialRelationStore = require('../../../../utils/socialRelationStore.js');
const playerIdentityGuard = require('../../../../utils/playerIdentityGuard.js');
const playerMomentPublishContext = require('../../../../utils/playerMomentPublishContext.js');

const CONTENT_MAX = playerMomentStore.CONTENT_MAX_CHARS || 2000;
const IMAGES_MAX = playerMomentStore.IMAGES_MAX || 9;

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
    content: '',
    contentCount: 0,
    contentMax: CONTENT_MAX,
    images: [],
    imagesMax: IMAGES_MAX,
    publishing: false,
    canPublish: false,
    gateReady: false,
    gateError: '',
    relatedMatchName: '',
    relatedScorecardLabel: ''
  },

  onLoad(query) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    this._dirty = false;
    this._relatedGame = null;
    // 拒绝 URL 伪造 relatedGame / authorUserId；只认短期 token
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
      relatedScorecardLabel: assert.relatedGame.publicScorecardId || ''
    });
    this._syncCanPublish();
  },

  onUnload() {
    this._dirty = false;
    this._relatedGame = null;
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

  _syncCanPublish() {
    if (!this.data.gateReady || !this._relatedGame) {
      this.setData({ canPublish: false });
      return;
    }
    const content = String(this.data.content || '').replace(/^\s+|\s+$/g, '');
    const hasText = !!content;
    const hasImg = (this.data.images || []).length > 0;
    const tooLong = playerMomentStore.countChars(this.data.content || '') > CONTENT_MAX;
    this.setData({
      canPublish: (hasText || hasImg) && !tooLong && !this.data.publishing
    });
  },

  onContentInput(e) {
    let value = (e.detail && e.detail.value) || '';
    const count = playerMomentStore.countChars(value);
    if (count > CONTENT_MAX) {
      value = playerMomentStore.sliceChars(value, CONTENT_MAX);
    }
    this._dirty = !!(value || (this.data.images || []).length);
    this.setData({
      content: value,
      contentCount: playerMomentStore.countChars(value)
    });
    this._syncCanPublish();
  },

  onChooseImages() {
    if (!this.data.gateReady || this.data.publishing) return;
    const remain = IMAGES_MAX - (this.data.images || []).length;
    if (remain <= 0) {
      wx.showToast({ title: '最多' + IMAGES_MAX + '张图片', icon: 'none' });
      return;
    }
    const self = this;
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        const files = (res && res.tempFiles) || [];
        if (!files.length) return;
        const picked = [];
        files.forEach(function (f) {
          if (!f || !f.tempFilePath) return;
          picked.push({
            tempFilePath: f.tempFilePath,
            width: Number(f.width) || 0,
            height: Number(f.height) || 0
          });
        });
        playerMomentImageLayout.ensureTempFilesDimensions(picked).then(function (ready) {
          const next = (self.data.images || []).slice();
          (ready || []).forEach(function (f) {
            if (!f || !f.tempFilePath) return;
            if (next.length >= IMAGES_MAX) return;
            next.push({
              tempFilePath: f.tempFilePath,
              width: Number(f.width) || 0,
              height: Number(f.height) || 0
            });
          });
          self._dirty = true;
          self.setData({ images: next });
          self._syncCanPublish();
        });
      },
      fail: function () { /* user cancel */ }
    });
  },

  onRemoveImage(e) {
    if (this.data.publishing) return;
    const idx = Number(
      e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.index
    );
    if (!Number.isFinite(idx) || idx < 0) return;
    const next = (this.data.images || []).slice();
    next.splice(idx, 1);
    this._dirty = !!(next.length || String(this.data.content || '').trim());
    this.setData({ images: next });
    this._syncCanPublish();
  },

  onPublish() {
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
    const temps = this.data.images || [];
    if (!content && !temps.length) {
      wx.showToast({ title: '请输入文字或添加图片', icon: 'none' });
      return;
    }

    const self = this;
    this.setData({ publishing: true, canPublish: false });

    const persistPromise = temps.length
      ? playerMomentMedia.persistMomentImages(temps)
      : Promise.resolve({ ok: true, images: [] });

    persistPromise
      .then(function (mediaRes) {
        if (!mediaRes.ok) {
          self.setData({ publishing: false });
          self._syncCanPublish();
          wx.showToast({ title: '图片保存失败，请重试', icon: 'none' });
          return;
        }
        const created = playerMomentStore.createMoment({
          authorUserId: me,
          content: content,
          images: mediaRes.images || [],
          relatedGame: assert.relatedGame
        });
        if (!created.ok) {
          if (mediaRes.images && mediaRes.images.length) {
            playerMomentMedia.cleanupMomentLocalFiles(mediaRes.images);
          }
          self.setData({ publishing: false });
          self._syncCanPublish();
          wx.showToast({
            title:
              created.error === 'related_game_required' ||
              created.error === 'not_in_game_slots' ||
              created.error === 'game_missing' ||
              created.error === 'match_missing'
                ? '需关联本场成绩卡'
                : '发布失败',
            icon: 'none'
          });
          return;
        }
        self._dirty = false;
        self.setData({ publishing: false, content: '', images: [], contentCount: 0 });
        try {
          const channel = self.getOpenerEventChannel && self.getOpenerEventChannel();
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
      })
      .catch(function () {
        self.setData({ publishing: false });
        self._syncCanPublish();
        wx.showToast({ title: '发布失败，草稿已保留', icon: 'none' });
      });
  },

  onBack() {
    if (this.data.publishing) return;
    if (!this.data.gateReady) {
      wx.navigateBack({ fail: function () {} });
      return;
    }
    if (!this._dirty) {
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
          wx.navigateBack({ fail: function () {} });
        }
      }
    });
  }
});
