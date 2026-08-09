Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    visible: { type: Boolean, value: false },
    target: { type: Object, value: null },
    reactions: { type: Array, value: [] },
    dark: { type: Boolean, value: false }
  },

  methods: {
    onMaskTap() {
      this.triggerEvent('close');
    },
    onNoop() {},
    onProfileTap() {
      this.triggerEvent('profiletap');
    },
    onReactionTap(e) {
      const key =
        e &&
        e.currentTarget &&
        e.currentTarget.dataset &&
        e.currentTarget.dataset.key != null
          ? String(e.currentTarget.dataset.key).trim()
          : '';
      this.triggerEvent('reactiontap', { key: key });
    }
  }
});
