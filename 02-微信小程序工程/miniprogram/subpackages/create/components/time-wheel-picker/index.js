const bindGate = require('./bindGate.js');

Component({
  properties: {
    show: {
      type: Boolean,
      value: false,
      observer(visible) {
        if (visible) {
          this._mountPicker(this.properties.value);
        } else {
          this.setData(bindGate.closePatch());
        }
      }
    },
    title: { type: String, value: '' },
    year: { type: Number, value: 2026 },
    value: {
      type: Array,
      value: [0, 0, 0, 0],
      observer(newVal) {
        if (!this.data.pickerReady) return;
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
    pickerReady: false,
    monthLabels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  },

  methods: {
    _mountPicker(boundValue) {
      this.setData(bindGate.mountPatch(boundValue));
    },

    _syncInnerValue(newVal) {
      const innerValue = bindGate.toIndex4(newVal);
      if (bindGate.sameIndex4(this.data.innerValue, innerValue)) return;
      this.setData({ innerValue });
    },

    onMaskTap() {
      this.triggerEvent('close');
    },

    onConfirmTap() {
      this.triggerEvent('confirm');
    },

    onPickerChange(e) {
      if (!bindGate.shouldForwardPickerChange(this.data.pickerReady)) return;
      const value = bindGate.toIndex4(e && e.detail && e.detail.value);
      this.setData({ innerValue: value });
      this.triggerEvent('change', { value });
    },

    onChangeYear(e) {
      this.triggerEvent('yearchange', { delta: Number(e.currentTarget.dataset.delta) });
    }
  }
});
