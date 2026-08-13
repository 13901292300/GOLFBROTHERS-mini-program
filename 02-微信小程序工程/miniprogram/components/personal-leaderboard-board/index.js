/**
 * 普通队际个人榜 UI（纯渲染）
 * - 只渲染宿主传入的显示态，不读 match / storage
 * - 不排序、不过滤、不算 gross/net
 * - 不导航主页、不改比赛数据
 */
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    leaderboard: { type: Array, value: [] },
    leaderboardScoreType: { type: String, value: 'gross' },
    showLeaderboardTeamColumn: { type: Boolean, value: false },
    openScorecard: { type: Object, value: null },
    scorecardAdImage: { type: String, value: '' },
    scorecardCourseTitle: { type: String, value: '' },
    scoreDisplayMode: { type: String, value: '' },
    scorePanel: { type: String, value: '' },
    teamGroupLogoById: { type: Object, value: {} },
    leaderboardAvatarBadge: { type: String, value: 'auto' },
    leaderboardMetaMode: { type: String, value: 'countryAge' },
    leaderboardShowExpandGender: { type: Boolean, value: false },
    leaderboardFollowEnabled: { type: Boolean, value: false },
    followMap: { type: Object, value: {} },
    relationMap: { type: Object, value: {} },
    relationLabelMap: { type: Object, value: {} },
    leaderboardFollowableMap: { type: Object, value: {} },
    followLoadingMap: { type: Object, value: {} },
    leaderboardProfileEntryMap: { type: Object, value: {} },
    emptyText: { type: String, value: '' },
    prestartExpandMode: { type: String, value: 'none' }
  },

  methods: {
    onRowTap: function (e) {
      var ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      this.triggerEvent('rowtap', { index: ds.index });
    },

    onProfileTap: function (e) {
      var detail = (e && e.detail) || {};
      var ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      this.triggerEvent('profiletap', {
        userId: detail.userId || detail.playerId || ds.userid || ds.userId,
        playerId: detail.playerId || detail.userId || ds.playerid || ds.playerId,
        name: detail.publicName || detail.name || ds.name,
        publicName: detail.publicName || detail.name || ds.name,
        avatar: detail.avatar || ds.avatar,
        gender: detail.gender,
        handicap: detail.handicap,
        floatCoef: detail.floatCoef,
        userType: detail.userType,
        identitySource: detail.identitySource,
        unavailable: !!detail.unavailable
      });
    },

    onFollowTap: function (e) {
      this.triggerEvent('follow', (e && e.detail) || {});
    },

    onAdError: function (e) {
      this.triggerEvent('aderror', (e && e.detail) || {});
    }
  }
});
