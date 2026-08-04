/**
 * 统一「加关注」操作按钮
 * 语义：当前未关注该用户；点击建立关注关系
 */
Component({
  properties: {
    userId: {
      type: String,
      value: ''
    }
  },

  methods: {
    onTap() {
      const userId = String(this.data.userId || '').trim();
      if (!userId) return;
      this.triggerEvent('follow', { userId: userId, playerId: userId });
    }
  }
});
