Component({
  properties: {
    show: {
      type: Boolean,
      value: false,
      observer(visible) {
        if (visible) {
          this._syncInnerValue(this.properties.value);
        }
      }
    },
    title: { type: String, value: '' },
    year: { type: Number, value: 2026 },
    value: {
      type: Array,
      value: [0, 0, 0, 0],
      observer(newVal) {
        this._syncInnerValue(newVal);
      }
    },
    monthOptions: { type: Array, value: [] },
    dayOptions: { type: Array, value: [] },
    hourOptions: { type: Array, value: [] },
    minuteOptions: { type: Array, value: [] },
    confirmText: { type: String, value: '确认时间' }
  },

  data: {
    innerValue: [0, 0, 0, 0],
    monthLabels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  },

  methods: {
    _syncInnerValue(newVal) {
      if (!Array.isArray(newVal) || newVal.length < 4) return;
      const innerValue = [
        Number(newVal[0]) || 0,
        Number(newVal[1]) || 0,
        Number(newVal[2]) || 0,
        Number(newVal[3]) || 0
      ];
      const cur = this.data.innerValue;
      if (
        cur[0] === innerValue[0] &&
        cur[1] === innerValue[1] &&
        cur[2] === innerValue[2] &&
        cur[3] === innerValue[3]
      ) {
        return;
      }
      this.setData({ innerValue });
    },

    onMaskTap() {
      this.triggerEvent('close');
    },

    onConfirmTap() {
      this.triggerEvent('confirm');
    },

    onPickerChange(e) {
      const value = e.detail.value;
      this.setData({ innerValue: value });
      this.triggerEvent('change', { value });
    },

    onChangeYear(e) {
      this.triggerEvent('yearchange', { delta: Number(e.currentTarget.dataset.delta) });
    }
  }
});
