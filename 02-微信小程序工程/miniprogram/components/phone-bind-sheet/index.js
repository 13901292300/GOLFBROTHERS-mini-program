/**
 * 绑定手机号底部弹层（二维码权限入口复用）
 * 开发态支持手动输入；正式环境可接 getPhoneNumber。
 */
const qrAccessAuth = require('../../utils/qrAccessAuth.js');

Component({
  properties: {
    visible: { type: Boolean, value: false },
    entryType: { type: String, value: 'admin_qr' },
    title: { type: String, value: '绑定手机号' },
    hint: { type: String, value: '' }
  },

  data: {
    phoneDraft: '',
    submitting: false
  },

  observers: {
    visible(v) {
      if (v) {
        this.setData({ phoneDraft: '', submitting: false });
      }
    }
  },

  methods: {
    stopPropagation() {},

    onPhoneInput(e) {
      const value = e && e.detail ? String(e.detail.value || '') : '';
      this.setData({ phoneDraft: value.replace(/[^\d]/g, '').slice(0, 11) });
    },

    onCancel() {
      this.triggerEvent('cancel', { entryType: this.data.entryType });
    },

    onConfirm() {
      if (this.data.submitting) return;
      const phone = String(this.data.phoneDraft || '').trim();
      if (!qrAccessAuth.isValidPhone(phone)) {
        wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
        return;
      }
      this.setData({ submitting: true });
      const result = qrAccessAuth.bindPhone(phone);
      this.setData({ submitting: false });
      if (!result || !result.ok) {
        wx.showToast({ title: '绑定失败', icon: 'none' });
        return;
      }
      this.triggerEvent('success', {
        entryType: this.data.entryType,
        phone: result.phone
      });
    },

    /** 微信手机号快捷授权（无后端解密时回退为提示手动输入） */
    onGetPhoneNumber(e) {
      const detail = (e && e.detail) || {};
      if (detail.errMsg && String(detail.errMsg).indexOf('ok') < 0) {
        wx.showToast({ title: '未授权手机号，请手动输入', icon: 'none' });
        return;
      }
      // 云开发解密未接入：引导手动填写，避免假成功写入
      wx.showToast({
        title: '请手动输入手机号完成绑定',
        icon: 'none'
      });
    }
  }
});
