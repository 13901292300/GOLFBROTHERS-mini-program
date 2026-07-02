Component({
  properties: {
    player: {
      type: Object,
      value: {}
    },
    followed: {
      type: Boolean,
      value: false
    },
    isSelf: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    onFollowTap() {
      const pid = this.data.player && this.data.player.playerId;
      if (!pid) return;
      this.triggerEvent('follow', { playerId: pid });
    }
  }
});
