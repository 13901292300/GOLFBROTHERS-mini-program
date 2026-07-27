/**
 * 球童记分 Sheet（纯 UI）
 * 数据由父页面传入；业务（生成码 / 删除 / 落盘）由父页面处理。
 *
 * props: visible, hasQr, qrUrl, generating, scorers
 * events: close / generateQr / removeCaddie
 */
Component({
  properties: {
    visible: { type: Boolean, value: false },
    /** 是否已有有效二维码 */
    hasQr: { type: Boolean, value: false },
    /** 二维码图片 URL */
    qrUrl: { type: String, value: '' },
    /** 生成中（按钮禁用） */
    generating: { type: Boolean, value: false },
    /** 已授权球童列表：[{ userId, nickname, avatar }] */
    scorers: { type: Array, value: [] }
  },

  data: {
    qrExpanded: true,
    manageVisible: false,
    manageTarget: null
  },

  observers: {
    visible(v) {
      if (v) {
        this.setData({
          qrExpanded: true,
          manageVisible: false,
          manageTarget: null
        });
      }
    }
  },

  methods: {
    stopPropagation() {},

    onOverlayClose() {
      if (this.data.manageVisible) {
        this.closeManage();
        return;
      }
      this.triggerEvent('close');
    },

    onClose() {
      this.closeManage();
      this.triggerEvent('close');
    },

    toggleQrExpanded() {
      this.setData({ qrExpanded: !this.data.qrExpanded });
    },

    onGenerateQr() {
      if (this.data.generating) return;
      this.triggerEvent('generateQr', { regenerate: false });
    },

    onRegenerateQr() {
      if (this.data.generating) return;
      this.triggerEvent('generateQr', { regenerate: true });
    },

    onScorerTap(e) {
      const userId =
        e && e.currentTarget && e.currentTarget.dataset
          ? String(e.currentTarget.dataset.userid || '').trim()
          : '';
      if (!userId) return;
      const list = Array.isArray(this.data.scorers) ? this.data.scorers : [];
      const target = list.find((item) => item && String(item.userId) === userId) || null;
      if (!target) return;
      this.setData({
        manageVisible: true,
        manageTarget: {
          userId: String(target.userId || ''),
          nickname: target.nickname || target.userId || '球童',
          avatar: target.avatar || ''
        }
      });
    },

    closeManage() {
      this.setData({ manageVisible: false, manageTarget: null });
    },

    onConfirmRemove() {
      const target = this.data.manageTarget;
      const userId = target && target.userId ? String(target.userId).trim() : '';
      if (!userId) return;
      this.triggerEvent('removeCaddie', { userId: userId });
      this.closeManage();
    },

    /** 保存二维码到相册（纯前端，不涉及授权业务） */
    onSaveQrImage() {
      const url = String(this.data.qrUrl || '').trim();
      if (!url) {
        wx.showToast({ title: '请先生成二维码', icon: 'none' });
        return;
      }
      wx.showLoading({ title: '保存中', mask: true });
      wx.downloadFile({
        url: url,
        success: (res) => {
          if (!res || res.statusCode !== 200 || !res.tempFilePath) {
            wx.hideLoading();
            wx.showToast({ title: '下载失败', icon: 'none' });
            return;
          }
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => {
              wx.hideLoading();
              wx.showToast({ title: '已保存到相册', icon: 'success' });
            },
            fail: () => {
              wx.hideLoading();
              wx.showToast({ title: '保存失败，请检查相册权限', icon: 'none' });
            }
          });
        },
        fail: () => {
          wx.hideLoading();
          wx.showToast({ title: '下载失败', icon: 'none' });
        }
      });
    }
  }
});
