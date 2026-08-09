/**
 * 统一「加关注」操作按钮
 * 语义：当前未关注该用户；点击建立关注关系
 * loading/disabled：防重复提交（默认 false，通讯录等既有用法不变）
 */
Component({
  properties: {
    userId: {
      type: String,
      value: ''
    },
    loading: {
      type: Boolean,
      value: false
    },
    disabled: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    onTap() {
      if (this.data.loading || this.data.disabled) return;
      const userId = String(this.data.userId || '').trim();
      if (!userId) return;
      this.triggerEvent('follow', { userId: userId, playerId: userId });
    }
  }
});
