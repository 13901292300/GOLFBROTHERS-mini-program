/**
 * 反馈页 — M 面板「反馈」入口
 * 必填描述 + 最多 5 张云图片 + 可选定位/电话 → feedbackStore
 */
const { createHeaderStyle } = require('../../utils/headerEngine.js');
const feedbackStore = require('../../utils/feedbackStore.js');
const gameStore = require('../../utils/gameStore.js');

function extFromPath(path) {
  const p = String(path || '');
  const m = p.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return m ? m[1].toLowerCase() : 'jpg';
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    content: '',
    phone: '',
    images: [],
    location: null,
    submitting: false,
    source: '',
    matchId: '',
    gameId: ''
  },

  onLoad(options) {
    const opt = options || {};
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    this.setData({
      source: opt.source || '',
      matchId: opt.matchId || '',
      gameId: opt.gameId || ''
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

  onBack() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/home/index' }) });
  },

  onContentInput(e) {
    this.setData({ content: (e.detail && e.detail.value) || '' });
  },

  onPhoneInput(e) {
    this.setData({ phone: (e.detail && e.detail.value) || '' });
  },

  onChooseImage() {
    const remain = 5 - (this.data.images || []).length;
    if (remain <= 0) {
      wx.showToast({ title: '最多上传 5 张', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const files = (res.tempFiles || []).map((f) => ({
          path: f.tempFilePath,
          size: f.size || 0
        }));
        const tempFilePath = files.map((f) => f.path);
        console.log('[feedback-upload] chooseMedia success tempFilePath', tempFilePath);
        this.setData({ images: (this.data.images || []).concat(files).slice(0, 5) });
      },
      fail: (err) => {
        console.log('[feedback-upload] chooseMedia fail', err && err.errMsg, err);
        // 兼容旧基础库
        wx.chooseImage({
          count: remain,
          sizeType: ['compressed'],
          sourceType: ['album', 'camera'],
          success: (res2) => {
            const files = (res2.tempFilePaths || []).map((path) => ({ path: path, size: 0 }));
            const tempFilePath = files.map((f) => f.path);
            console.log('[feedback-upload] chooseImage success tempFilePath', tempFilePath);
            this.setData({ images: (this.data.images || []).concat(files).slice(0, 5) });
          },
          fail: (err2) => {
            console.log('[feedback-upload] chooseImage fail', err2 && err2.errMsg, err2);
          }
        });
      }
    });
  },

  onRemoveImage(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    if (!Number.isFinite(idx)) return;
    const images = (this.data.images || []).slice();
    images.splice(idx, 1);
    this.setData({ images: images });
  },

  onGetLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.setData({
          location: {
            latitude: res.latitude,
            longitude: res.longitude
          }
        });
        wx.showToast({ title: '定位成功', icon: 'success' });
      },
      fail: () => {
        wx.showToast({ title: '定位失败，请检查权限', icon: 'none' });
      }
    });
  },

  onClearLocation() {
    this.setData({ location: null });
  },

  _uploadImages() {
    const images = this.data.images || [];
    if (!images.length) return Promise.resolve([]);

    if (!wx.cloud || typeof wx.cloud.uploadFile !== 'function') {
      console.log('[feedback-upload] cloud_unavailable before uploadFile');
      return Promise.reject(new Error('cloud_unavailable'));
    }

    const tasks = images.map((img, i) => {
      const ext = extFromPath(img.path);
      const cloudPath = 'feedback/' + Date.now() + '_' + i + '.' + ext;
      const filePath = img.path;
      console.log('[feedback-upload] uploadFile before', { cloudPath: cloudPath, filePath: filePath });
      return wx.cloud
        .uploadFile({
          cloudPath: cloudPath,
          filePath: filePath
        })
        .then((res) => {
          console.log('[feedback-upload] uploadFile success fileID', res && res.fileID);
          return res.fileID;
        })
        .catch((err) => {
          console.log('[feedback-upload] uploadFile fail', err && err.errMsg, err);
          return '';
        });
    });

    return Promise.all(tasks).then((ids) => ids.filter(Boolean));
  },

  onSubmit() {
    if (this.data.submitting) return;
    const content = String(this.data.content || '').trim();
    if (!content) {
      wx.showToast({ title: '请填写问题描述', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中', mask: true });

    const user = gameStore.getCurrentUser() || {};
    const hasImages = (this.data.images || []).length > 0;

    const uploadPromise = hasImages
      ? this._uploadImages()
      : Promise.resolve([]);

    uploadPromise
      .then((fileIDs) => {
        const imageFileIDs = fileIDs || [];
        console.log('[feedback-upload] submit imageFileIDs', imageFileIDs);
        if (hasImages && !imageFileIDs.length) {
          throw new Error('upload_failed');
        }
        return feedbackStore.saveFeedback({
          content: content,
          imageFileIDs: imageFileIDs,
          location: this.data.location,
          phone: this.data.phone,
          userId: user.userId || '',
          source: this.data.source || '',
          matchId: this.data.matchId || '',
          gameId: this.data.gameId || ''
        });
      })
      .then(() => {
        wx.hideLoading();
        this.setData({ submitting: false });
        wx.showToast({ title: '提交成功', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack({ fail: () => {} });
        }, 600);
      })
      .catch((err) => {
        console.log('[feedback-upload] submit fail', err && err.message, err);
        wx.hideLoading();
        this.setData({ submitting: false });
        const msg =
          err && err.message === 'upload_failed'
            ? '图片上传失败，请重试'
            : err && err.message === 'cloud_unavailable'
              ? '云能力未就绪，请稍后重试'
              : '提交失败，请重试';
        wx.showToast({ title: msg, icon: 'none' });
      });
  }
});
