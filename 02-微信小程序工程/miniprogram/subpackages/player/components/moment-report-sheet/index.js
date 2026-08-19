/**
 * 球友圈举报原因 Bottom Sheet（展示层）。
 * 提交由页面调用 contentReportService；本组件不写 Storage。
 */
const contentReportService = require('../../utils/contentReportService.js');

const REASONS = contentReportService.REPORT_REASONS || [];
const DESC_MAX = contentReportService.DESCRIPTION_MAX_CHARS || 200;

Component({
  properties: {
    visible: { type: Boolean, value: false },
    themeClass: { type: String, value: 'bright-mode' },
    title: { type: String, value: '举报' },
    submitting: { type: Boolean, value: false }
  },

  data: {
    reasons: REASONS,
    selectedCode: '',
    description: '',
    descCount: 0,
    descMax: DESC_MAX,
    showDesc: false,
    canSubmit: false
  },

  observers: {
    visible: function (v) {
      if (!v) return;
      this._syncCanSubmit();
    },
    submitting: function () {
      this._syncCanSubmit();
    }
  },

  methods: {
    resetForm() {
      this.setData({
        selectedCode: '',
        description: '',
        descCount: 0,
        showDesc: false,
        canSubmit: false
      });
    },

    _syncCanSubmit() {
      const code = this.data.selectedCode;
      this.setData({ canSubmit: !!code && !this.data.submitting });
    },

    onSelectReason(e) {
      if (this.data.submitting) return;
      const code =
        (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.code) ||
        '';
      if (!code) return;
      this.setData({
        selectedCode: code,
        showDesc: code === 'other',
        canSubmit: true
      });
    },

    onDescInput(e) {
      if (this.data.submitting) return;
      const raw = (e && e.detail && e.detail.value) != null ? String(e.detail.value) : '';
      const sliced = contentReportService.sliceChars
        ? contentReportService.sliceChars(raw, DESC_MAX)
        : raw.slice(0, DESC_MAX);
      this.setData({
        description: sliced,
        descCount: contentReportService.countChars
          ? contentReportService.countChars(sliced)
          : sliced.length
      });
    },

    onMaskTap() {
      if (this.data.submitting) return;
      this.triggerEvent('close');
    },

    onCancel() {
      if (this.data.submitting) return;
      this.triggerEvent('close');
    },

    onSubmit() {
      if (this.data.submitting || !this.data.selectedCode) return;
      let label = '';
      for (let i = 0; i < REASONS.length; i++) {
        if (REASONS[i].code === this.data.selectedCode) {
          label = REASONS[i].label;
          break;
        }
      }
      this.triggerEvent('submit', {
        reasonCode: this.data.selectedCode,
        reasonLabel: label,
        description: this.data.selectedCode === 'other' ? this.data.description : ''
      });
    },

    noop() {}
  }
});
