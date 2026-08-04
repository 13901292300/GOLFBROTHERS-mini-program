Component({
  properties: {
    player: {
      type: Object,
      value: {}
    },
    /** @deprecated 兼容旧用法；优先 relationStatus */
    followed: {
      type: Boolean,
      value: false
    },
    /** none | following | friend */
    relationStatus: {
      type: String,
      value: ''
    },
    isSelf: {
      type: Boolean,
      value: false
    }
  },

  data: {
    displayStatus: 'none'
  },

  observers: {
    'followed, relationStatus': function (followed, relationStatus) {
      const status = String(relationStatus || '').trim();
      let next = 'none';
      if (status === 'none' || status === 'following' || status === 'friend') {
        next = status;
      } else {
        next = followed ? 'following' : 'none';
      }
      if (this.data.displayStatus !== next) {
        this.setData({ displayStatus: next });
      }
    }
  },

  methods: {
    onFollowTap(e) {
      const fromDetail = e && e.detail ? e.detail : {};
      const pid =
        String(fromDetail.userId || fromDetail.playerId || '').trim() ||
        String((this.data.player && this.data.player.playerId) || '').trim();
      if (!pid) return;
      this.triggerEvent('follow', {
        playerId: pid,
        userId: pid,
        player: this.data.player || {}
      });
    }
  }
});
