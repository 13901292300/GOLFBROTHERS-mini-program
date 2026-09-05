Component({
  properties: {
    pageState: { type: String, value: 'loading' },
    matches: { type: Array, value: [] },
    canCreateTeamMatch: { type: Boolean, value: false }
  },
  methods: {
    onRetry() {
      this.triggerEvent('retry');
    },
    onCreateMatch() {
      this.triggerEvent('creatematch');
    },
    onTapMatch(e) {
      const ds = (e.currentTarget && e.currentTarget.dataset) || {};
      this.triggerEvent('openmatch', {
        matchId: ds.id || '',
        navUrl: ds.url || '',
        canOpen: !!ds.canOpen,
        navHint: ds.hint || ''
      });
    }
  }
});
