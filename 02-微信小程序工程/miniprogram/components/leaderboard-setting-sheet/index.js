/**
 * 领先榜查看方式选择（共享）
 * - 普通 detail：成绩类型 + 查看方式（球队/全部/男/女）
 * - Series：按轮次 gameMode 投影球队/个人/组合/配对
 * - L1：组件内自带全屏 overlay + bottom-sheet（isolated，不依赖页面 common）
 * 无 storage 写入；选中态由宿主 draftValues 驱动
 */
Component({
  options: {
    styleIsolation: 'isolated'
  },

  properties: {
    visible: { type: Boolean, value: false },
    themeClass: { type: String, value: 'bright-mode' },
    overline: { type: String, value: 'LEADERBOARD' },
    title: { type: String, value: '查看方式' },
    subtitle: { type: String, value: '' },
    sections: { type: Array, value: [] },
    draftValues: { type: Object, value: {} }
  },

  methods: {
    noop: function () {},

    onMaskTap: function () {
      this.triggerEvent('close');
    },

    onCloseTap: function () {
      this.triggerEvent('close');
    },

    onCancelTap: function () {
      this.triggerEvent('cancel');
      this.triggerEvent('close');
    },

    onOptionTap: function (e) {
      var ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      var sectionKey = ds.section != null ? String(ds.section).trim() : '';
      var optionKey = ds.key != null ? String(ds.key).trim() : '';
      var disabled =
        ds.disabled === true ||
        ds.disabled === 'true' ||
        ds.disabled === 1 ||
        ds.disabled === '1';
      if (!sectionKey || !optionKey || disabled) return;
      this.triggerEvent('change', { section: sectionKey, key: optionKey });
    },

    onConfirmTap: function () {
      this.triggerEvent('confirm', {
        values: this.properties.draftValues || {}
      });
    }
  }
});
