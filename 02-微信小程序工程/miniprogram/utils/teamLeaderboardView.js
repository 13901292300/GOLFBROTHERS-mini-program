/**
 * 普通单场总杆球队榜纯投影（R-TEAM-A1）
 * - G1：正式 groups 球员成绩按 teamGroups 归队
 * - G2/G3：entity 成绩按 teamGroupId 归队（不拆个人）
 * - 排名 / 并列 / TOTAL / TO PAR / 队名全称 / 无成绩表达
 * - 不写 wx / storage；净杆分队榜仍由 detail 页面私有实现
 *
 * host 仅提供普通 detail 已有的身份/成绩/Entity 行构造，避免第二套统计权威。
 */

var playerManage = require('./playerManage.js');
var mockAvatars = require('./mockAvatars.js');
var { isInterTeamMatch } = require('./teamMatchCapabilities.js');

function asString(v) {
  return v == null ? '' : String(v);
}

function unnamedSideLabel(match) {
  return '未命名' + (isInterTeamMatch(match) ? '球队' : '分队');
}

function formatLeaderboardDiff(diff) {
  if (diff > 0) return '+' + diff;
  if (diff === 0) return '0';
  return String(diff);
}

function resolveLeaderboardTotalClass(diff) {
  if (diff < 0) return 'score-under';
  if (diff === 0) return 'score-even';
  return 'score-over';
}

function resolveLeaderboardThruLabel(thru) {
  if (!thru) return '-';
  return thru >= 18 ? 'F' : String(thru);
}

function buildCompetitionRanking(rows, scoreGetter) {
  var source = Array.isArray(rows) ? rows : [];
  var getter =
    typeof scoreGetter === 'function'
      ? scoreGetter
      : function (row) {
          return row && row.total;
        };
  var ranked = source.map(function (row) {
    return Object.assign({}, row);
  });
  var scores = ranked.map(function (row) {
    var value = getter(row);
    var score = Number(value);
    return value === null || value === undefined || value === '' || Number.isNaN(score)
      ? null
      : score;
  });
  var index = 0;
  var rankedCount = 0;
  while (index < ranked.length) {
    var score = scores[index];
    if (score === null) {
      ranked[index].pos = '-';
      index += 1;
      continue;
    }
    var rank = rankedCount + 1;
    var end = index + 1;
    while (end < ranked.length && scores[end] === score) {
      end += 1;
    }
    var groupSize = end - index;
    var pos = groupSize > 1 ? 'T' + rank : String(rank);
    for (var i = index; i < end; i++) {
      ranked[i].pos = pos;
    }
    rankedCount += groupSize;
    index = end;
  }
  return ranked;
}

function buildTeamLeaderboardTeamMap(match) {
  var map = {};
  var teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
  var sideUnit = isInterTeamMatch(match) ? '球队' : '分队';
  teamGroups.forEach(function (team, index) {
    var teamId = team && team.id != null ? String(team.id).trim() : '';
    if (!teamId) return;
    map[teamId] = {
      teamId: teamId,
      teamName: String((team && team.name) || '').trim() || sideUnit + (index + 1),
      grossTotal: 0,
      toPar: 0,
      total: 0,
      scoringPlayersCount: 0,
      players: []
    };
  });
  return map;
}

function readTeamCompetition(match) {
  var rules = match && match.scoringRules;
  var competition = rules && rules.teamCompetition;
  var enabled = !!(competition && competition.enabled === true);
  return {
    enabled: enabled,
    topN: enabled ? Math.max(1, parseInt(competition.topN, 10) || 1) : 0
  };
}

function sortExpandRows(rows) {
  return (Array.isArray(rows) ? rows : []).slice().sort(function (a, b) {
    if (a.hasScore !== b.hasScore) return a.hasScore ? -1 : 1;
    if (a.toPar !== b.toPar) return a.toPar - b.toPar;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function assembleGrossTeams(match, teamMap, teamGroups) {
  var competition = readTeamCompetition(match);
  var teamOrder = teamGroups
    .map(function (team) {
      return team && team.id != null ? String(team.id).trim() : '';
    })
    .filter(Boolean);
  var orderedTeams = teamOrder.map(function (teamId) {
    return teamMap[teamId];
  }).filter(Boolean);
  var extraTeams = Object.keys(teamMap)
    .filter(function (teamId) {
      return teamOrder.indexOf(teamId) < 0;
    })
    .map(function (teamId) {
      return teamMap[teamId];
    });
  var teams = orderedTeams.concat(extraTeams).filter(function (team) {
    return competition.enabled ? team.players.length > 0 : true;
  });
  if (!teams.length) return [];

  if (!competition.enabled) {
    return teams.map(function (team, teamIndex) {
      var rankedPlayers = buildCompetitionRanking(sortExpandRows(team.players), function (player) {
        return player && player.hasScore === true ? player.toPar : null;
      });
      var grossTotal = 0;
      var toPar = 0;
      rankedPlayers.forEach(function (player) {
        if (!(player && player.hasScore === true)) return;
        grossTotal += Number(player.grossTotal || 0);
        toPar += Number(player.toPar || 0);
      });
      return {
        pos: String(teamIndex + 1),
        teamId: team.teamId,
        teamName: team.teamName || unnamedSideLabel(match),
        grossTotal: grossTotal,
        toPar: toPar,
        total: 0,
        hasScore: false,
        scoreStr: '-',
        scoreClass: 'score-even',
        scoringPlayersCount: 0,
        players: rankedPlayers.map(function (player) {
          var out = Object.assign({}, player, { isCounting: false });
          delete out._thruValue;
          return out;
        })
      };
    });
  }

  var sortedTeams = teams.map(function (team, teamIndex) {
    var sortedPlayers = sortExpandRows(team.players);
    var toPar = 0;
    var grossTotal = 0;
    var scoringPlayersCount = Math.min(
      competition.topN,
      sortedPlayers.filter(function (player) {
        return player && player.hasScore === true;
      }).length
    );
    var players = sortedPlayers.map(function (player, index) {
      var isCounting = player.hasScore === true && index < scoringPlayersCount;
      if (isCounting) {
        toPar += Number(player.toPar || 0);
        grossTotal += Number(player.grossTotal || 0);
      }
      var out = Object.assign({}, player, { isCounting: isCounting });
      delete out._thruValue;
      return out;
    });
    var rankedPlayers = buildCompetitionRanking(players, function (player) {
      return player && player.hasScore === true ? player.toPar : null;
    });
    return {
      teamId: team.teamId,
      teamName: team.teamName || unnamedSideLabel(match),
      grossTotal: grossTotal,
      toPar: toPar,
      total: toPar,
      hasScore: scoringPlayersCount > 0,
      scoreStr: scoringPlayersCount > 0 ? formatLeaderboardDiff(toPar) : '-',
      scoreClass: scoringPlayersCount > 0 ? resolveLeaderboardTotalClass(toPar) : 'score-even',
      scoringPlayersCount: scoringPlayersCount,
      players: rankedPlayers,
      _sortIndex: teamIndex
    };
  }).sort(function (a, b) {
    if (a.hasScore !== b.hasScore) return a.hasScore ? -1 : 1;
    if (a.toPar !== b.toPar) return a.toPar - b.toPar;
    return a._sortIndex - b._sortIndex;
  });
  return buildCompetitionRanking(sortedTeams, function (team) {
    return team && team.hasScore === true ? team.toPar : null;
  }).map(function (team) {
    var out = Object.assign({}, team);
    delete out._sortIndex;
    return out;
  });
}

function ensureTeamBucket(teamMap, teamId, teamName, match) {
  if (teamMap[teamId]) {
    if (!teamMap[teamId].teamName && teamName) teamMap[teamId].teamName = teamName;
    return teamMap[teamId];
  }
  teamMap[teamId] = {
    teamId: teamId,
    teamName: teamName || unnamedSideLabel(match),
    grossTotal: 0,
    toPar: 0,
    total: 0,
    scoringPlayersCount: 0,
    players: []
  };
  return teamMap[teamId];
}

function buildPlayerTeamLeaderboardView(match, host) {
  var teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
  if (teamGroups.length < 2) return [];
  var teamMap = buildTeamLeaderboardTeamMap(match);
  var playerLookup = host._buildGroupPlayerLookup(match);
  var playerTeamLookup = host._buildLeaderboardPlayerTeamLookup(match);
  var teamLogoMap = host._buildTeamGroupLogoMap(match);
  var groups = match && Array.isArray(match.groups) ? match.groups : [];

  groups.forEach(function (group) {
    var displayPlayers = host.hydrateGroupDisplayPlayers(group, playerLookup);
    var displayMap = {};
    displayPlayers.forEach(function (displayPlayer) {
      if (displayPlayer && displayPlayer.userId) displayMap[String(displayPlayer.userId)] = displayPlayer;
    });
    (Array.isArray(group && group.players) ? group.players : []).forEach(function (player) {
      var playerId = host._resolveAnyPlayerId(player);
      if (!playerId) return;
      var teamRef = host._resolveLeaderboardPlayerTeam(player, playerId, playerLookup, playerTeamLookup);
      if (!teamRef.teamId) return;
      ensureTeamBucket(teamMap, teamRef.teamId, teamRef.teamName, match);
      var lookup = playerLookup[playerId] || {};
      var display = displayMap[playerId] || {};
      var genderDisplay = playerManage.getGenderDisplay(
        Object.assign({}, lookup, player, { gender: lookup.gender || display.gender || player.gender })
      );
      var stat = host._computeMatchLeaderboardStats(match, group, player, playerId);
      var scoreFields = host._getLeaderboardScoreFields(stat);
      var scorePlayerId = host._resolveSlotScorePlayerId(player, playerId);
      var name = host._resolveViewerDisplayName(
        playerId,
        display.displayName ||
          display.name ||
          lookup.nickname ||
          host._resolveAnyPlayerNickname(player) ||
          '未知球员',
        {
          publicName: String(lookup.nickname || display.nickname || '').trim(),
          snapshotName: host._resolveAnyPlayerNickname(player) ||
            String(display.displayName || display.name || '').trim(),
          identityMasked: !!(lookup.identityMasked || player.identityMasked || display.identityMasked)
        }
      );
      var avatar = display.avatar || mockAvatars.resolveAvatar(lookup.avatar || player.avatar || player.avatarUrl || '', playerId);
      var badgeTeamId = host._resolveInterTeamBadgeLogo(match, teamRef.teamId, teamLogoMap);
      teamMap[teamRef.teamId].players.push({
        playerId: playerId,
        userId: playerId,
        scorePlayerId: scorePlayerId,
        groupId: group && group.groupId ? String(group.groupId) : '',
        matchTeamId: teamRef.teamId,
        scorecardKey: teamRef.teamId + ':' + playerId,
        name: name,
        nickname: name,
        avatar: avatar,
        gender: genderDisplay.gender || '',
        genderIcon: genderDisplay.icon,
        genderClass: genderDisplay.className,
        country: player.country || '',
        age: player.age || '',
        flag: player.flag || '',
        badgeTeamId: badgeTeamId,
        grossTotal: scoreFields.grossTotal,
        toPar: scoreFields.toPar,
        total: scoreFields.toPar,
        diff: scoreFields.toPar,
        hasScore: stat.hasScore,
        scoreStr: stat.hasScore ? formatLeaderboardDiff(scoreFields.toPar) : '-',
        scoreClass: stat.hasScore ? resolveLeaderboardTotalClass(scoreFields.toPar) : 'score-even',
        thru: stat.hasScore ? resolveLeaderboardThruLabel(stat.thru) : '-',
        isCounting: false,
        _thruValue: stat.thru
      });
    });
  });

  return assembleGrossTeams(match, teamMap, teamGroups);
}

function buildEntityTeamLeaderboardView(match, host) {
  var teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
  if (teamGroups.length < 2) return [];
  var teamMap = buildTeamLeaderboardTeamMap(match);
  var teamNameMap = host._buildLeaderboardTeamNameMap(match);
  var teamLogoMap = host._buildTeamGroupLogoMap(match);
  var entityRows = host._buildEntityLeaderboardRows(match, -1) || [];

  entityRows.forEach(function (row) {
    if (!row || !row.entityId) return;
    var members = Array.isArray(row.members) ? row.members : [];
    if (!members.length) return;
    var teamId =
      row.teamGroupId != null && String(row.teamGroupId).trim() !== ''
        ? String(row.teamGroupId).trim()
        : '';
    if (!teamId) return;
    ensureTeamBucket(teamMap, teamId, teamNameMap[teamId], match);
    var avatar = row.avatar || (members[0] && members[0].avatar) || '';
    var teamFallbackBadgeId = host._resolveInterTeamBadgeLogo(match, teamId, teamLogoMap);
    var membersWithBadge = members.map(function (m) {
      if (!m) return m;
      if (m.badgeTeamId) return m;
      return Object.assign({}, m, { badgeTeamId: teamFallbackBadgeId });
    });
    teamMap[teamId].players.push({
      entityId: String(row.entityId),
      isEntity: true,
      isTeam: true,
      kind: row.kind || 'team',
      compositionMode: row.compositionMode || '',
      teamGroupId: teamId,
      playerId: '',
      userId: '',
      groupId: row.groupId ? String(row.groupId) : '',
      scorecardKey: teamId + ':' + String(row.entityId),
      name: row.name || '组合',
      nickname: row.name || '组合',
      avatar: avatar,
      members: membersWithBadge,
      pairMembers: membersWithBadge,
      gender: '',
      genderIcon: '',
      genderClass: '',
      country: '',
      age: '',
      flag: '',
      badgeTeamId: teamFallbackBadgeId,
      grossTotal: Number(row.grossTotal) || 0,
      toPar: Number(row.toPar) || 0,
      total: Number(row.toPar) || 0,
      diff: Number(row.toPar) || 0,
      hasScore: row.hasScore === true,
      scoreStr: row.hasScore === true
        ? row.scoreStr || formatLeaderboardDiff(row.toPar)
        : '-',
      scoreClass: row.hasScore === true
        ? row.scoreClass || resolveLeaderboardTotalClass(row.toPar)
        : 'score-even',
      thru: row.thru != null ? row.thru : '-',
      scoreSource: row.scoreSource || 'teamMatch.scoreData.teamScoresByEntity',
      isCounting: false,
      _thruValue: row._thruValue != null ? row._thruValue : 0
    });
  });

  return assembleGrossTeams(match, teamMap, teamGroups);
}

/**
 * @param {object} match
 * @param {object} host 普通 detail 页面实例（身份/洞分/Entity 行）
 */
function buildGrossTeamLeaderboardView(match, host) {
  if (!host || typeof host !== 'object') return [];
  if (typeof host._shouldBuildEntityLeaderboard === 'function' && host._shouldBuildEntityLeaderboard(match)) {
    return buildEntityTeamLeaderboardView(match, host);
  }
  return buildPlayerTeamLeaderboardView(match, host);
}

function teamLeaderboardSignature(teams) {
  var list = Array.isArray(teams) ? teams : [];
  return list.map(function (team) {
    var players = Array.isArray(team && team.players) ? team.players : [];
    return [
      asString(team && team.teamId),
      asString(team && team.pos),
      asString(team && team.teamName),
      String(team && team.grossTotal),
      asString(team && team.scoreStr),
      asString(team && team.scoreClass),
      String(!!(team && team.hasScore)),
      String(team && team.scoringPlayersCount),
      players.map(function (p) {
        return [
          asString(p.scorecardKey || p.entityId || p.playerId),
          asString(p.name),
          asString(p.pos),
          asString(p.scoreStr),
          asString(p.thru),
          String(!!p.isCounting),
          asString(p.genderIcon),
          asString(p.genderClass)
        ].join('~');
      }).join(',')
    ].join('|');
  }).join(';;');
}

module.exports = {
  unnamedSideLabel: unnamedSideLabel,
  formatLeaderboardDiff: formatLeaderboardDiff,
  resolveLeaderboardTotalClass: resolveLeaderboardTotalClass,
  resolveLeaderboardThruLabel: resolveLeaderboardThruLabel,
  buildCompetitionRanking: buildCompetitionRanking,
  buildTeamLeaderboardTeamMap: buildTeamLeaderboardTeamMap,
  buildGrossTeamLeaderboardView: buildGrossTeamLeaderboardView,
  teamLeaderboardSignature: teamLeaderboardSignature
};
