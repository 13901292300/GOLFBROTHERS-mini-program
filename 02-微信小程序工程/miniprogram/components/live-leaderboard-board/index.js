/**
 * 普通队际 LIVE 领先榜（team + all/male/female）
 * - 只渲染宿主传入的显示态，不读 match / storage
 * - 交互上抛事件，由宿主打开记分卡 / 展开球队
 */
var liveLeaderboardScorecard = require('../../utils/liveLeaderboardScorecard.js');

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    view: { type: String, value: 'all' },
    scoreType: { type: String, value: 'gross' },
    viewLabel: { type: String, value: '' },
    teamLeaderboard: { type: Array, value: [] },
    leaderboard: { type: Array, value: [] },
    expandedTeamId: { type: String, value: '' },
    openIndex: { type: null, value: -1 },
    openScorecard: { type: Object, value: null },
    scorecardAdImage: { type: String, value: '' },
    scorecardCourseTitle: { type: String, value: '' },
    scoreDisplayMode: { type: String, value: '' },
    scorePanel: { type: String, value: '' },
    showLeaderboardTeamColumn: { type: Boolean, value: false },
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
    onTeamRowTap: function (e) {
      var ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      this.triggerEvent('teamtap', { teamId: ds.teamId != null ? String(ds.teamId) : '' });
    },

    onTeamPlayerTap: function (e) {
      var ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      this.triggerEvent(
        'scorecardtap',
        liveLeaderboardScorecard.buildTeamScorecardTapEvent(ds, this.data.teamLeaderboard)
      );
    },

    onPersonalRowTap: function (e) {
      var detail = (e && e.detail) || {};
      var idx = detail.index;
      var list = this.data.leaderboard || [];
      var row = list[idx];
      this.triggerEvent('rowtap', {
        mode: 'personal',
        index: idx,
        scorecardKey: row && row.scorecardKey != null ? String(row.scorecardKey) : '',
        player: row || null,
        matchId: row && row.matchId != null ? String(row.matchId) : '',
        stationMatchId: row && (row.stationMatchId || row.matchId) != null
          ? String(row.stationMatchId || row.matchId)
          : '',
        entityId: row && row.entityId != null ? String(row.entityId) : '',
        playerId: row && (row.playerId || row.userId) ? String(row.playerId || row.userId) : '',
        groupId: row && row.groupId != null ? String(row.groupId) : '',
        roundId: row && row.roundId != null ? String(row.roundId) : '',
        members: row && Array.isArray(row.members) ? row.members : []
      });
    },

    onProfileTap: function (e) {
      this.triggerEvent('profiletap', (e && e.detail) || {});
    },

    onFollowTap: function (e) {
      this.triggerEvent('follow', (e && e.detail) || {});
    },

    onAdError: function (e) {
      this.triggerEvent('aderror', (e && e.detail) || {});
    }
  }
});
