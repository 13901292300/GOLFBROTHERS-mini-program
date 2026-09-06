Component({
  properties: {
    pageState: { type: String, value: 'loading' },
    team: { type: Object, value: null },
    canShareTeam: { type: Boolean, value: false },
    shareReady: { type: Boolean, value: false },
    pendingApplicationCount: { type: Number, value: 0 },
    errorTitle: { type: String, value: '加载失败' },
    errorDesc: { type: String, value: '无法获取球队简介，请稍后重试。' }
  },
  methods: {
    onRetry() {
      this.triggerEvent('retry');
    },
    onLogoError() {
      const team = this.data.team;
      if (!team || team.logoBroken) return;
      this.setData({ team: Object.assign({}, team, { logoBroken: true }) });
    },
    onEdit() {
      this.triggerEvent('edit');
    },
    onApplications() {
      this.triggerEvent('applications');
    },
    onNotices() {
      this.triggerEvent('notices');
    },
    onLeave() {
      this.triggerEvent('leave');
    },
    onDissolve() {
      this.triggerEvent('dissolve');
    }
  }
});
