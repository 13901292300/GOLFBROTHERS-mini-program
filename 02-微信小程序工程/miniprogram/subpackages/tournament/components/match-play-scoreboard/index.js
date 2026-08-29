Component({
  properties: {
    scoreboard: { type: Object, value: null },
    scorecardAdImage: { type: String, value: '' },
    showSummary: { type: Boolean, value: true },
    showCards: { type: Boolean, value: true }
  },
  methods: {
    onToggleCard: function (e) {
      var id = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.id : '';
      this.triggerEvent('togglecard', { id: id });
    }
  }
});
