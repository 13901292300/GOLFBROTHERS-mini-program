Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    overline: {
      type: String,
      value: 'ADD PLAYER'
    },
    title: {
      type: String,
      value: '选择添加方式'
    },
    options: {
      type: Array,
      value: []
    },
    themeClass: {
      type: String,
      value: 'bright-mode'
    }
  },

  methods: {
    noop() {},

    onMaskTap() {
      this.triggerEvent('close');
    },

    onCloseTap() {
      this.triggerEvent('close');
    },

    onOptionTap(e) {
      const key = e.currentTarget.dataset.key;
      if (!key) return;
      const item = (this.properties.options || []).find((opt) => opt.key === key);
      if (item && item.disabled) {
        this.triggerEvent('denied', { key });
        return;
      }
      this.triggerEvent('select', { key });
    }
  }
});
