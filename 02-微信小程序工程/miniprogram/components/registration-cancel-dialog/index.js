/**
 * 普通报名取消确认弹窗（REG-P0）
 * 只展示标题/正文/按钮并抛 cancel/confirm，不读 storage、不执行取消。
 */
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '' },
    desc: { type: String, value: '' },
    cancelText: { type: String, value: '取消' },
    confirmText: { type: String, value: '确认取消' },
    submitting: { type: Boolean, value: false }
  },

  methods: {
    onMaskTap: function () {
      this.triggerEvent('cancel');
    },
    onCancelTap: function () {
      this.triggerEvent('cancel');
    },
    onConfirmTap: function () {
      this.triggerEvent('confirm');
    },
    onNoop: function () {}
  }
});
