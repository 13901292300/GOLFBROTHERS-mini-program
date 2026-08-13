/**
 * 领先榜展开资料区组合壳：只挂载并透传 leaderboard-player-identity。
 * 真实资料栏视觉由 identity/index.wxss 自己保证，本组件不写内部 class。
 */
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    player: { type: Object, value: {} },
    teamGroupLogoById: { type: Object, value: {} },
    avatarBadge: { type: String, value: 'auto' },
    metaMode: { type: String, value: 'countryAge' },
    showNameGender: { type: Boolean, value: false },
    gender: { type: String, value: '' },
    genderSymbol: { type: String, value: '' },
    genderClass: { type: String, value: '' },
    followed: { type: Boolean, value: false },
    relationStatus: { type: String, value: '' },
    relationshipLabel: { type: String, value: '' },
    canFollow: { type: Boolean, value: true },
    followLoading: { type: Boolean, value: false },
    isSelf: { type: Boolean, value: false }
  },

  methods: {
    onFollowTap: function (e) {
      this.triggerEvent('follow', (e && e.detail) || {});
    },

    onProfileTap: function (e) {
      this.triggerEvent('profiletap', (e && e.detail) || {});
    }
  }
});
