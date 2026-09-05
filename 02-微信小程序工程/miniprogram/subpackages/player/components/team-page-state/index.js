Component({
  properties: {
    pageState: { type: String, value: '' },
    loadingText: { type: String, value: '加载中…' },
    emptyIcon: { type: String, value: '🛡' },
    emptyTitle: { type: String, value: '暂无数据' },
    emptyDesc: { type: String, value: '' },
    errorTitle: { type: String, value: '加载失败' },
    errorDesc: { type: String, value: '请稍后重试' },
    retryLabel: { type: String, value: '重试' }
  },
  methods: {
    onRetry() {
      this.triggerEvent('retry');
    }
  }
});
