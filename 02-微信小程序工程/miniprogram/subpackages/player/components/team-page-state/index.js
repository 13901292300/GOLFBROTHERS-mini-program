Component({
  properties: {
    pageState: { type: String, value: '' },
    loadingText: { type: String, value: '加载中…' },
    emptyIcon: { type: String, value: '🛡' },
    emptyTitle: { type: String, value: '暂无数据' },
    emptyDesc: { type: String, value: '' },
    errorTitle: { type: String, value: '加载失败' },
    errorDesc: { type: String, value: '请稍后重试' },
    retryLabel: { type: String, value: '重试' },
    actionKind: { type: String, value: '' },
    actionLabel: { type: String, value: '' }
  },
  data: {
    showRetry: false,
    showCompleteProfile: false,
    btnLabel: '重试'
  },
  observers: {
    'pageState, actionKind, actionLabel, retryLabel': function (pageState, actionKind, actionLabel, retryLabel) {
      var kind = String(actionKind || '');
      if (!kind) {
        if (pageState === 'profile_required') kind = 'completeProfile';
        else if (
          pageState === 'network_error' ||
          pageState === 'service_unavailable' ||
          pageState === 'env_unknown' ||
          pageState === 'error' ||
          pageState === 'conflict'
        ) {
          kind = 'retry';
        }
      }
      var label = String(actionLabel || '');
      if (!label) {
        if (kind === 'completeProfile') label = '完善资料';
        else if (kind === 'retry') label = retryLabel || '重试';
      }
      this.setData({
        showRetry: kind === 'retry',
        showCompleteProfile: kind === 'completeProfile',
        btnLabel: label
      });
    }
  },
  methods: {
    onRetry() {
      this.triggerEvent('retry');
    },
    onCompleteProfile() {
      this.triggerEvent('completeprofile');
    }
  }
});
