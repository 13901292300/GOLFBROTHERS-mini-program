/**
 * 总杆球队榜独立 host（R-TEAM-B1）
 * Series 不能挂载普通 detail 页面实例，用与个人榜相同的 match 纯函数构造 host。
 * 不写 wx / storage / Series。
 */

var personalLeaderboardBoard = require('../../../utils/personalLeaderboardBoard.js');
var playerManage = require('../../../utils/playerManage.js');
var mockAvatars = require('../../../utils/mockAvatars.js');
var playerDisplayName = require('../../../utils/playerDisplayName.js');
var { isInterTeamMatch } = require('../../../utils/teamMatchCapabilities.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function createStandaloneHost(opts) {
  var o = opts && typeof opts === 'object' ? opts : {};
  var remarkCtx = o.viewerRemarkCtx && typeof o.viewerRemarkCtx === 'object'
    ? o.viewerRemarkCtx
    : { viewer: '', rev: 0, map: {} };

  var host = {
    data: {
      leaderboardScoreType: 'gross',
      openIndex: -1
    },
    _viewerRemarkCtx: remarkCtx,

    _shouldBuildEntityLeaderboard: function (match) {
      return personalLeaderboardBoard.shouldBuildEntityLeaderboard(match);
    },

    _buildEntityLeaderboardRows: function (match) {
      return personalLeaderboardBoard.buildEntityLeaderboardRows(match) || [];
    },

    _buildGroupPlayerLookup: function (match) {
      return personalLeaderboardBoard.buildRegisterLookup(match) || {};
    },

    _buildLeaderboardPlayerTeamLookup: function (match) {
      return personalLeaderboardBoard.buildPlayerTeamLookup(match) || {};
    },

    _buildTeamGroupLogoMap: function (match) {
      return personalLeaderboardBoard.buildTeamGroupLogoMap(match) || {};
    },

    _buildLeaderboardTeamNameMap: function (match) {
      return personalLeaderboardBoard.buildTeamNameMap(match) || {};
    },

    _resolveAnyPlayerId: function (raw) {
      return personalLeaderboardBoard.resolveAnyPlayerId(raw);
    },

    _resolveSlotScorePlayerId: function (slotPlayer, currentPlayerId) {
      return personalLeaderboardBoard.resolveSlotScorePlayerId(slotPlayer, currentPlayerId);
    },

    _resolveAnyPlayerNickname: function (raw) {
      if (!raw || typeof raw !== 'object') return '';
      return playerManage.resolveMatchNickname(raw) || '';
    },

    _getLeaderboardScoreFields: function (stats) {
      var source = stats || {};
      var grossRaw = source.grossTotal != null ? source.grossTotal : source.total;
      var toParRaw = source.toPar != null ? source.toPar : source.diff;
      var grossTotal = Number(grossRaw);
      var toPar = Number(toParRaw);
      return {
        grossTotal: Number.isFinite(grossTotal) ? grossTotal : 0,
        toPar: Number.isFinite(toPar) ? toPar : 0
      };
    },

    _computeMatchLeaderboardStats: function (match, group, player, playerId) {
      return personalLeaderboardBoard.computePlayerStats(match, group, player, playerId);
    },

    _resolveViewerDisplayName: function (targetUserId, publicOrSnapshotName, opts) {
      var nameOpts = opts || {};
      var fallback = publicOrSnapshotName != null ? String(publicOrSnapshotName).trim() : '';
      var named = playerDisplayName.resolvePlayerDisplayNameForViewer({
        viewerUserId: (host._viewerRemarkCtx && host._viewerRemarkCtx.viewer) || '',
        targetUserId: targetUserId,
        publicName: nameOpts.publicName != null ? nameOpts.publicName : fallback,
        snapshotName: nameOpts.snapshotName != null ? nameOpts.snapshotName : fallback,
        identityMasked: nameOpts.identityMasked === true,
        remarkNameMap: (host._viewerRemarkCtx && host._viewerRemarkCtx.map) || {},
        defaultName: '未知球员'
      });
      return named && named.displayName ? named.displayName : fallback || '未知球员';
    },

    _resolveLeaderboardPlayerTeam: function (player, playerId, playerLookup, playerTeamLookup) {
      var registerTeam = playerTeamLookup && playerId ? playerTeamLookup[playerId] : null;
      if (registerTeam && registerTeam.teamId) return registerTeam;
      var lookup = playerLookup && playerId ? playerLookup[playerId] : null;
      var lookupTeamId = playerManage.resolveMatchTeamId(lookup);
      if (lookupTeamId) {
        return {
          teamId: lookupTeamId,
          teamName: playerManage.resolveMatchTeamName(lookup)
        };
      }
      var directTeamId = playerManage.resolveMatchTeamId(player);
      if (directTeamId) {
        return {
          teamId: directTeamId,
          teamName: playerManage.resolveMatchTeamName(player)
        };
      }
      return { teamId: '', teamName: '' };
    },

    _resolveInterTeamBadgeLogo: function (match, teamGroupId, logoMap) {
      if (!isInterTeamMatch(match)) return '';
      var id = teamGroupId != null ? String(teamGroupId).trim() : '';
      if (!id) return '';
      var map = logoMap || host._buildTeamGroupLogoMap(match);
      if (!Object.prototype.hasOwnProperty.call(map, id)) return '';
      return id;
    },

    hydrateGroupDisplayPlayers: function (group, playerLookup) {
      var lookup = playerLookup || {};
      var list = (group && Array.isArray(group.players) ? group.players : [])
        .map(function (p) {
          var userId = personalLeaderboardBoard.resolveAnyPlayerId(p);
          if (!userId) return null;
          var src = lookup[userId] || {};
          var snapshotName =
            host._resolveAnyPlayerNickname(p) ||
            asString(src.nickname || src.displayName || src.name) ||
            '';
          var publicName = asString(src.nickname || src.displayName);
          var nickname = host._resolveViewerDisplayName(
            userId,
            publicName || snapshotName || '未知球员',
            {
              publicName: publicName,
              snapshotName: snapshotName,
              identityMasked: !!(src.identityMasked || p.identityMasked)
            }
          );
          var avatarSrc =
            src.avatar ||
            (p && p.avatar ? String(p.avatar) : '') ||
            (p && p.avatarUrl ? String(p.avatarUrl) : '') ||
            '';
          return {
            playerId: userId,
            userId: userId,
            nickname: nickname,
            name: nickname,
            displayName: nickname,
            avatar: mockAvatars.resolveAvatar(avatarSrc, userId),
            gender: p.gender || src.gender || ''
          };
        })
        .filter(Boolean);
      return list;
    }
  };

  return host;
}

module.exports = {
  createStandaloneHost: createStandaloneHost
};
