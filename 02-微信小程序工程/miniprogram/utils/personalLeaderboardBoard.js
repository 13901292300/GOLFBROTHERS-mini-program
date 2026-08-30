/**
 * 普通队际个人领先榜 ViewModel（纯投影）
 * - view=all|male|female，scoreType=gross|net
 * - 行主体仅来自 match.groups 正式座位；不从 Series roster 臆造
 * - 净杆只读 match.peoriaResult；Entity 路径读 scoreEntities + teamScoresByEntity
 * - 不写 wx / storage
 */

var playerManage = require('./playerManage.js');
var mockAvatars = require('./mockAvatars.js');
var leaderboardSettingViewModel = require('./leaderboardSettingViewModel.js');
var holeLayout = require('./holeLayout.js');
var halfCourse = require('./halfCourse.js');
var {
  isTeamMatchFamily,
  isTeamInternalMatch,
  isInterTeamMatch,
  DEFAULT_ORG_LOGO
} = require('./teamMatchCapabilities.js');
var {
  isG5MatchPlayMode,
  resolveStrokeKind
} = require('./strokeEntityValidator.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function isFilledScore(score) {
  return score !== null && score !== undefined && score !== '' && !Number.isNaN(Number(score));
}

/** 成绩归属为当前座位球员；旧 scorePlayerId 不得覆盖当前身份 */
function resolveSlotScorePlayerId(slotPlayer, currentPlayerId) {
  var current = currentPlayerId != null ? String(currentPlayerId).trim() : '';
  if (current) return current;
  var p = slotPlayer || {};
  var scorePlayerId = p.scorePlayerId || p.slotScorePlayerId || p.scoreOwnerId;
  return scorePlayerId != null ? String(scorePlayerId).trim() : '';
}

function resolveScoresByPlayerRecord(scoresByPlayer, slotPlayer, currentPlayerId) {
  if (!scoresByPlayer || typeof scoresByPlayer !== 'object') return null;
  var scorePlayerId = resolveSlotScorePlayerId(slotPlayer, currentPlayerId);
  if (scorePlayerId && scoresByPlayer[scorePlayerId]) return scoresByPlayer[scorePlayerId];
  var playerId = currentPlayerId != null ? String(currentPlayerId).trim() : '';
  if (playerId && scoresByPlayer[playerId]) return scoresByPlayer[playerId];
  return null;
}

function resolveMatchHolePars(match) {
  var src = match || {};
  var parsed =
    !src.front9Course && !src.back9Course
      ? halfCourse.parseCourseHalfText(src.courseHalfText || src.courseHalf || src.halfText)
      : {};
  var layout = holeLayout.resolveLayoutFromContext({
    courseId: src.courseId || '',
    courseName: src.courseName || '',
    front9Course: src.front9Course || parsed.front9Course || null,
    back9Course: src.back9Course || parsed.back9Course || null
  });
  return (layout.holePars || holeLayout.getLayout().holePars || []).slice();
}

function resolveAnyPlayerId(raw) {
  if (!raw || typeof raw !== 'object') return '';
  var id = raw.userId || raw.playerId || raw.id || raw.uid || raw.openid;
  return id != null ? String(id).trim() : '';
}

function resolvePlayerDisplayName(raw) {
  if (!raw || typeof raw !== 'object') return '未知球员';
  return playerManage.resolveMatchNickname(raw) || '未知球员';
}

/**
 * true：match.groups 中存在至少一个有球员座位的正式组
 */
function hasFormalGroups(match) {
  var groups = match && Array.isArray(match.groups) ? match.groups : [];
  for (var i = 0; i < groups.length; i++) {
    var players = groups[i] && Array.isArray(groups[i].players) ? groups[i].players : [];
    for (var j = 0; j < players.length; j++) {
      if (resolveAnyPlayerId(players[j])) return true;
    }
  }
  return false;
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

function formatNetScore(value) {
  var n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return Math.round(n * 100) % 100 === 0
    ? String(Math.round(n))
    : String(Math.round(n * 100) / 100);
}

/**
 * 竞赛排名（T-ties）。假定 rows 已按成绩排好序；scoreGetter 返回 null 表示未计名次。
 */
function buildCompetitionRanking(rows, scoreGetter) {
  var source = Array.isArray(rows) ? rows : [];
  var getter =
    typeof scoreGetter === 'function' ? scoreGetter : function (row) {
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

function rankSignature(rows) {
  var list = Array.isArray(rows) ? rows : [];
  return list
    .map(function (row) {
      if (!row) return '';
      return [
        asString(row.pos),
        asString(row.playerId || row.entityId || row.rowId),
        asString(row.scoreStr),
        asString(row.thru)
      ].join('|');
    })
    .join(';');
}

function collectRegisterSources(match) {
  var lists = [];
  var pushList = function (arr) {
    if (Array.isArray(arr) && arr.length) lists.push(arr);
  };
  var info = match && match.registerInfo;
  if (info && typeof info === 'object') {
    pushList(info.users);
    pushList(info.players);
    pushList(info.participants);
  }
  pushList(match && match.participants);
  pushList(match && match.players);
  pushList(match && match.users);
  return lists;
}

function buildRegisterLookup(match) {
  var map = Object.create(null);
  var lists = collectRegisterSources(match);
  for (var i = 0; i < lists.length; i++) {
    var users = lists[i];
    for (var j = 0; j < users.length; j++) {
      var u = users[j];
      if (!u || typeof u !== 'object') continue;
      var id = resolveAnyPlayerId(u);
      if (!id || map[id]) continue;
      map[id] = u;
      [u.userId, u.playerId, u.id, u.uid, u.openid]
        .map(function (v) {
          return v != null ? String(v).trim() : '';
        })
        .filter(Boolean)
        .forEach(function (alias) {
          if (!map[alias]) map[alias] = u;
        });
    }
  }
  return map;
}

function buildTeamNameMap(match) {
  var map = Object.create(null);
  var teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
  for (var i = 0; i < teamGroups.length; i++) {
    var team = teamGroups[i];
    var teamId = team && team.id != null ? String(team.id).trim() : '';
    if (!teamId) continue;
    map[teamId] = asString(team && team.name);
  }
  return map;
}

function buildTeamGroupLogoMap(match) {
  var map = Object.create(null);
  if (!isInterTeamMatch(match)) return map;
  var teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
  for (var i = 0; i < teamGroups.length; i++) {
    var team = teamGroups[i];
    var teamId = team && team.id != null ? String(team.id).trim() : '';
    if (!teamId) continue;
    var logo = asString(team && team.sourceTeamLogo);
    map[teamId] = logo || DEFAULT_ORG_LOGO;
  }
  return map;
}

function buildPlayerTeamLookup(match) {
  var map = Object.create(null);
  var lists = collectRegisterSources(match);
  for (var i = 0; i < lists.length; i++) {
    var users = lists[i];
    for (var j = 0; j < users.length; j++) {
      var user = users[j];
      var playerId = resolveAnyPlayerId(user);
      if (!playerId) continue;
      var teamId = playerManage.resolveMatchTeamId(user);
      if (!teamId) continue;
      var entry = {
        teamId: teamId,
        teamName: playerManage.resolveMatchTeamName(user),
        matchTeamId: user.matchTeamId != null ? String(user.matchTeamId).trim() : '',
        matchTeamName: user.matchTeamName != null ? String(user.matchTeamName).trim() : '',
        groupId: user.groupId != null ? String(user.groupId).trim() : '',
        groupName: user.groupName != null ? String(user.groupName).trim() : ''
      };
      [user.userId, user.playerId, user.id, user.uid, user.openid, playerId]
        .map(function (value) {
          return value != null ? String(value).trim() : '';
        })
        .filter(Boolean)
        .forEach(function (id) {
          if (!map[id]) map[id] = entry;
        });
    }
  }
  return map;
}

function resolvePlayerTeamName(playerId, playerTeamLookup, teamNameMap) {
  var id = asString(playerId);
  if (!id) return '';
  var ref = playerTeamLookup && playerTeamLookup[id];
  var teamId = ref && ref.teamId ? String(ref.teamId).trim() : '';
  if (!teamId) return '';
  return asString((teamNameMap && teamNameMap[teamId]) || (ref && ref.teamName));
}

function resolveBadgeTeamId(match, playerId, playerTeamLookup, logoMap, playerRaw) {
  if (!isInterTeamMatch(match)) return '';
  var entry = playerTeamLookup && playerId ? playerTeamLookup[String(playerId)] : null;
  var fromPlayer = entry
    ? asString(entry.matchTeamId || entry.teamId || entry.groupId)
    : '';
  var teamGroupId = fromPlayer || playerManage.resolveMatchTeamId(playerRaw);
  if (!teamGroupId) return '';
  if (!logoMap || !Object.prototype.hasOwnProperty.call(logoMap, teamGroupId)) return '';
  return teamGroupId;
}

function resolvePlayerHoles(match, group, player, playerId) {
  var groupId = group && group.groupId ? String(group.groupId) : '';
  var scoreData =
    match && match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? match.scoreData
      : null;
  var groupScoreData =
    scoreData && groupId && scoreData[groupId] && typeof scoreData[groupId] === 'object'
      ? scoreData[groupId]
      : null;
  var scoreRecord =
    groupScoreData &&
    groupScoreData.scoresByPlayer &&
    typeof groupScoreData.scoresByPlayer === 'object' &&
    playerId
      ? resolveScoresByPlayerRecord(groupScoreData.scoresByPlayer, player, playerId)
      : null;
  if (scoreRecord && Array.isArray(scoreRecord.scores)) {
    return {
      source: 'teamMatch.scoreData',
      holes: scoreRecord.scores.map(function (score, index) {
        return { holeNo: index + 1, score: score };
      })
    };
  }
  if (Array.isArray(player && player.holes)) {
    return { source: 'match.groups', holes: player.holes };
  }
  if (Array.isArray(player && player.scores)) {
    return {
      source: 'match.groups',
      holes: player.scores.map(function (score, index) {
        return { holeNo: index + 1, score: score };
      })
    };
  }
  var groupScoreRecord =
    group && group.scoresByPlayer && playerId
      ? resolveScoresByPlayerRecord(group.scoresByPlayer, player, playerId)
      : null;
  if (groupScoreRecord && Array.isArray(groupScoreRecord.scores)) {
    return {
      source: 'match.groups',
      holes: groupScoreRecord.scores.map(function (score, index) {
        return { holeNo: index + 1, score: score };
      })
    };
  }
  return { source: '', holes: [] };
}

function computePlayerStats(match, group, player, playerId) {
  var resolved = resolvePlayerHoles(match, group, player, playerId);
  var holes = resolved.holes || [];
  var pars = resolveMatchHolePars(match);
  var total = 0;
  var parThru = 0;
  var thru = 0;
  for (var i = 0; i < holes.length; i++) {
    var score = holes[i] && holes[i].score;
    if (!isFilledScore(score)) continue;
    total += Number(score);
    parThru += Number(pars[i] || 0);
    thru += 1;
  }
  var toPar = total - parThru;
  return {
    grossTotal: thru > 0 ? total : 0,
    toPar: thru > 0 ? toPar : 0,
    thru: thru,
    hasScore: thru > 0,
    source: resolved.source || ''
  };
}

function scoreEntitiesHaveEntries(match) {
  var scoreEntities =
    match &&
    match.scoreEntities &&
    typeof match.scoreEntities === 'object' &&
    !Array.isArray(match.scoreEntities)
      ? match.scoreEntities
      : null;
  if (!scoreEntities) return false;
  var keys = Object.keys(scoreEntities);
  for (var i = 0; i < keys.length; i++) {
    var list = scoreEntities[keys[i]];
    if (Array.isArray(list) && list.length > 0) return true;
  }
  return false;
}

function shouldBuildEntityLeaderboard(match) {
  var gameMode = asString(match && (match.gameMode || match.selectedGameMode));
  if (gameMode === '个人比杆赛' || isG5MatchPlayMode(gameMode)) return false;
  var kind = typeof resolveStrokeKind === 'function' ? resolveStrokeKind(gameMode) : '';
  if (kind === 'g2g3' || kind === 'g4') return true;
  return scoreEntitiesHaveEntries(match);
}

function sortGrossRows(rows) {
  var list = Array.isArray(rows) ? rows.slice() : [];
  list.sort(function (a, b) {
    var aThru = Number(a && a._thruValue) || 0;
    var bThru = Number(b && b._thruValue) || 0;
    var aHas = !!(a && a.hasScore);
    var bHas = !!(b && b.hasScore);
    if (!aHas && !bHas) return 0;
    if (!aHas) return 1;
    if (!bHas) return -1;
    var aToPar = Number(a.toPar);
    var bToPar = Number(b.toPar);
    if (aToPar !== bToPar) return aToPar - bToPar;
    return bThru - aThru;
  });
  return list;
}

function filterByGenderView(rows, view) {
  var list = Array.isArray(rows) ? rows : [];
  if (view !== 'male' && view !== 'female') return list.slice();
  return list.filter(function (row) {
    return row && row.gender === view;
  });
}

function resolveLeaderboardChrome(match) {
  var avatarBadge = 'auto';
  if (isTeamInternalMatch(match)) avatarBadge = 'none';
  else if (isInterTeamMatch(match)) avatarBadge = 'team';
  var metaMode = isTeamMatchFamily(match) ? 'handicapFloat' : 'countryAge';
  var showExpandGender = isTeamMatchFamily(match);
  var teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
  return {
    avatarBadge: avatarBadge,
    metaMode: metaMode,
    showExpandGender: showExpandGender,
    showTeamColumn: teamGroups.length >= 1,
    teamGroupLogoById: buildTeamGroupLogoMap(match)
  };
}

function buildGrossPersonalRows(match) {
  var groups = match && Array.isArray(match.groups) ? match.groups : [];
  var registerLookup = buildRegisterLookup(match);
  var teamNameMap = buildTeamNameMap(match);
  var playerTeamLookup = buildPlayerTeamLookup(match);
  var teamLogoMap = buildTeamGroupLogoMap(match);
  var flat = [];

  for (var g = 0; g < groups.length; g++) {
    var group = groups[g];
    var players = group && Array.isArray(group.players) ? group.players : [];
    for (var p = 0; p < players.length; p++) {
      var player = players[p];
      var playerId = resolveAnyPlayerId(player);
      if (!playerId) continue;
      var lookup = registerLookup[playerId] || {};
      var merged = Object.assign({}, lookup, player, {
        gender: lookup.gender || player.gender
      });
      var genderDisplay = playerManage.getGenderDisplay(merged);
      var stat = computePlayerStats(match, group, player, playerId);
      var teamName = resolvePlayerTeamName(playerId, playerTeamLookup, teamNameMap);
      var badgeTeamId = resolveBadgeTeamId(
        match,
        playerId,
        playerTeamLookup,
        teamLogoMap,
        merged
      );
      var slotIndex = Number(player && (player.position != null ? player.position : player.slotIndex)) || 0;
      var name = resolvePlayerDisplayName(
        Object.assign({}, lookup, player, {
          competitionName: player.competitionName || lookup.competitionName,
          matchNickname: player.matchNickname || lookup.matchNickname,
          nickname: lookup.nickname || player.nickname,
          name: player.name || lookup.name
        })
      );
      flat.push({
        rowId: playerId,
        playerId: playerId,
        scorePlayerId: resolveSlotScorePlayerId(player, playerId) || playerId,
        slotIndex: slotIndex,
        position: slotIndex,
        name: name,
        displayName: name,
        group: (group && group.groupName) || '',
        groupId: group && group.groupId ? group.groupId : '',
        gender: genderDisplay.gender || '',
        genderIcon: genderDisplay.icon,
        genderClass: genderDisplay.className,
        isFemale: genderDisplay.gender === 'female',
        _thruValue: stat.thru,
        thru: resolveLeaderboardThruLabel(stat.thru),
        grossTotal: stat.grossTotal,
        toPar: stat.toPar,
        total: stat.grossTotal,
        diff: stat.toPar,
        hasScore: stat.hasScore === true,
        scoreStr: stat.hasScore ? formatLeaderboardDiff(stat.toPar) : '-',
        scoreClass: stat.hasScore ? resolveLeaderboardTotalClass(stat.toPar) : 'score-even',
        avatar: mockAvatars.resolveAvatar(
          (lookup && (lookup.avatar || lookup.avatarUrl)) ||
            player.avatar ||
            player.avatarUrl ||
            '',
          playerId
        ),
        flag: player.flag || '',
        country: player.country || '',
        age: player.age || '',
        teamName: teamName,
        teamTag: playerManage.formatTeamTagName(teamName),
        badgeTeamId: badgeTeamId,
        scoreSource: stat.source || '',
        isEntity: false,
        members: []
      });
    }
  }
  return sortGrossRows(flat);
}

function buildEntityLeaderboardRows(match) {
  var scoreEntities =
    match &&
    match.scoreEntities &&
    typeof match.scoreEntities === 'object' &&
    !Array.isArray(match.scoreEntities)
      ? match.scoreEntities
      : {};
  var scoreData =
    match && match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? match.scoreData
      : {};
  var registerLookup = buildRegisterLookup(match);
  var groupNameMap = Object.create(null);
  var groupPlayerMapByGroupId = Object.create(null);
  var groups = match && Array.isArray(match.groups) ? match.groups : [];
  for (var gi = 0; gi < groups.length; gi++) {
    var g = groups[gi];
    if (!g || g.groupId == null) continue;
    var gid = String(g.groupId);
    groupNameMap[gid] = g.groupName || '';
    var playerMap = Object.create(null);
    var plist = Array.isArray(g.players) ? g.players : [];
    for (var pi = 0; pi < plist.length; pi++) {
      var pid = resolveAnyPlayerId(plist[pi]);
      if (!pid) continue;
      playerMap[pid] = plist[pi];
      if (!registerLookup[pid]) registerLookup[pid] = plist[pi];
    }
    groupPlayerMapByGroupId[gid] = playerMap;
  }
  var pars = resolveMatchHolePars(match);
  var playerTeamLookup = buildPlayerTeamLookup(match);
  var teamLogoMap = buildTeamGroupLogoMap(match);
  var teamNameMap = buildTeamNameMap(match);
  var flat = [];
  var keys = Object.keys(scoreEntities);

  for (var k = 0; k < keys.length; k++) {
    var groupId = keys[k];
    var entities = Array.isArray(scoreEntities[groupId]) ? scoreEntities[groupId] : [];
    if (!entities.length) continue;
    var groupScoreData =
      scoreData[groupId] && typeof scoreData[groupId] === 'object' ? scoreData[groupId] : {};
    var teamScoresByEntity = Array.isArray(groupScoreData.teamScoresByEntity)
      ? groupScoreData.teamScoresByEntity
      : [];
    var scoreByEntityId = Object.create(null);
    for (var t = 0; t < teamScoresByEntity.length; t++) {
      var rec = teamScoresByEntity[t];
      if (!rec || typeof rec !== 'object') continue;
      var ek =
        rec.teamId != null && String(rec.teamId).trim() !== ''
          ? String(rec.teamId).trim()
          : rec.entityId != null && String(rec.entityId).trim() !== ''
            ? String(rec.entityId).trim()
            : '';
      if (ek) scoreByEntityId[ek] = rec;
    }
    var slotPlayerMap = groupPlayerMapByGroupId[String(groupId)] || {};

    for (var e = 0; e < entities.length; e++) {
      var entity = entities[e];
      if (!entity) continue;
      var entityId = entity.entityId != null ? String(entity.entityId).trim() : '';
      if (!entityId) continue;
      var rawMembers = Array.isArray(entity.members) ? entity.members : [];
      var memberIds = [];
      for (var m = 0; m < rawMembers.length; m++) {
        var mm = rawMembers[m];
        var mid = '';
        if (mm == null) continue;
        if (typeof mm === 'string' || typeof mm === 'number') mid = asString(mm);
        else mid = resolveAnyPlayerId(mm);
        if (mid) memberIds.push(mid);
      }
      if (!memberIds.length) continue;

      var memberViews = [];
      for (var mi = 0; mi < memberIds.length; mi++) {
        var uid = memberIds[mi];
        var slotPlayer = slotPlayerMap[uid] || null;
        var lookup = registerLookup[uid] || {};
        var mergedMember = Object.assign({}, lookup, slotPlayer || {});
        var genderDisplay = playerManage.getGenderDisplay(mergedMember);
        var displayName = resolvePlayerDisplayName(mergedMember);
        var lookupAvatar =
          (lookup && (lookup.avatar || lookup.avatarUrl)) ||
          (slotPlayer && (slotPlayer.avatar || slotPlayer.avatarUrl)) ||
          '';
        memberViews.push({
          playerId: uid,
          userId: uid,
          name: displayName,
          displayName: displayName,
          avatar: mockAvatars.resolveAvatar(lookupAvatar, uid),
          flag: (mergedMember && mergedMember.flag) || '',
          country: (mergedMember && mergedMember.country) || '',
          age: (mergedMember && mergedMember.age) || '',
          gender: '',
          genderIcon: genderDisplay.icon,
          genderClass: genderDisplay.className,
          isFemale: genderDisplay.gender === 'female',
          badgeTeamId: resolveBadgeTeamId(match, uid, playerTeamLookup, teamLogoMap, mergedMember)
        });
      }
      if (!memberViews.length) continue;

      var name = memberViews
        .map(function (mv) {
          return asString(mv && (mv.name || mv.displayName));
        })
        .filter(Boolean)
        .join(' / ');
      if (!name) continue;

      var entityRec = scoreByEntityId[entityId] || {};
      var scores = Array.isArray(entityRec.scores) ? entityRec.scores.slice() : [];
      var grossTotal = 0;
      var parThru = 0;
      var thru = 0;
      for (var h = 0; h < 18; h++) {
        var s = scores[h];
        if (!isFilledScore(s)) continue;
        grossTotal += Number(s);
        parThru += Number(pars[h] || 0);
        thru += 1;
      }
      var toPar = grossTotal - parThru;
      var hasScore = thru > 0;
      var teamGroupId =
        entity.teamGroupId != null && String(entity.teamGroupId).trim() !== ''
          ? String(entity.teamGroupId).trim()
          : '';
      if (!teamGroupId) {
        for (var ti = 0; ti < memberViews.length; ti++) {
          var muid = memberViews[ti].userId;
          var ref = muid && playerTeamLookup[muid] ? playerTeamLookup[muid] : null;
          if (ref && ref.teamId) {
            teamGroupId = String(ref.teamId).trim();
            break;
          }
        }
      }
      var teamName = teamGroupId && teamNameMap[teamGroupId] ? asString(teamNameMap[teamGroupId]) : '';
      if (!teamName) {
        for (var tn = 0; tn < memberViews.length; tn++) {
          var fromMember = resolvePlayerTeamName(
            memberViews[tn].userId,
            playerTeamLookup,
            teamNameMap
          );
          if (fromMember) {
            teamName = fromMember;
            break;
          }
        }
      }

      var entityType = entity.entityType ? String(entity.entityType) : '';
      var compositionMode =
        entity.compositionMode === '2+2' ? '2+2' : entity.compositionMode === '4+0' ? '4+0' : '';
      var kind = entityType === 'pair' || compositionMode === '2+2' ? 'pair' : 'team';

      flat.push({
        rowId: entityId,
        entityId: entityId,
        teamGroupId: teamGroupId,
        playerId: '',
        name: name,
        displayName: name,
        group: groupNameMap[String(groupId)] || '',
        groupId: String(groupId),
        scores: scores,
        members: memberViews,
        pairMembers: memberViews,
        kind: kind,
        compositionMode: compositionMode,
        isTeam: memberViews.length > 1,
        gender: '',
        genderIcon: '',
        genderClass: '',
        _thruValue: thru,
        thru: resolveLeaderboardThruLabel(thru),
        grossTotal: hasScore ? grossTotal : 0,
        toPar: hasScore ? toPar : 0,
        total: hasScore ? grossTotal : 0,
        diff: hasScore ? toPar : 0,
        hasScore: hasScore,
        scoreStr: hasScore ? formatLeaderboardDiff(toPar) : '-',
        scoreClass: hasScore ? resolveLeaderboardTotalClass(toPar) : 'score-even',
        avatar: memberViews[0].avatar || '',
        teamName: teamName,
        teamTag: playerManage.formatTeamTagName(teamName),
        scoreSource: 'teamMatch.scoreData.teamScoresByEntity',
        isEntity: true
      });
    }
  }
  return sortGrossRows(flat);
}

function buildNetPersonalRows(match) {
  var results =
    match && match.peoriaResult && Array.isArray(match.peoriaResult.results)
      ? match.peoriaResult.results
      : [];
  var netByPlayerId = Object.create(null);
  for (var i = 0; i < results.length; i++) {
    var item = results[i];
    if (!item || item.playerId == null) continue;
    var id = asString(item.playerId);
    if (id) netByPlayerId[id] = item;
  }

  var groups = match && Array.isArray(match.groups) ? match.groups : [];
  var registerLookup = buildRegisterLookup(match);
  var teamNameMap = buildTeamNameMap(match);
  var playerTeamLookup = buildPlayerTeamLookup(match);
  var teamLogoMap = buildTeamGroupLogoMap(match);
  var flat = [];
  var seen = Object.create(null);

  for (var g = 0; g < groups.length; g++) {
    var group = groups[g];
    var players = group && Array.isArray(group.players) ? group.players : [];
    for (var p = 0; p < players.length; p++) {
      var player = players[p];
      var playerId = resolveAnyPlayerId(player);
      if (!playerId || seen[playerId]) continue;
      seen[playerId] = true;
      var scorePlayerId = resolveSlotScorePlayerId(player, playerId) || playerId;
      var lookup = registerLookup[playerId] || {};
      var merged = Object.assign({}, lookup, player, {
        gender: lookup.gender || player.gender
      });
      var genderDisplay = playerManage.getGenderDisplay(merged);
      var stat = computePlayerStats(match, group, player, playerId);
      var filledHoles = Number(stat && stat.thru) || 0;
      var peoria =
        netByPlayerId[playerId] ||
        (scorePlayerId ? netByPlayerId[scorePlayerId] : null) ||
        null;
      var netRaw = peoria && peoria.net != null ? Number(peoria.net) : NaN;
      var hasNetScore = filledHoles === 18 && Number.isFinite(netRaw);
      var slotIndex = Number(player && (player.position != null ? player.position : player.slotIndex)) || 0;
      var teamName = resolvePlayerTeamName(playerId, playerTeamLookup, teamNameMap);
      flat.push({
        playerId: playerId,
        scorePlayerId: scorePlayerId,
        slotIndex: slotIndex,
        position: slotIndex,
        name: resolvePlayerDisplayName(
          Object.assign({}, lookup, player, {
            competitionName: player.competitionName || lookup.competitionName,
            matchNickname: player.matchNickname || lookup.matchNickname,
            nickname: lookup.nickname || player.nickname,
            name: player.name || lookup.name
          })
        ),
        group: (group && group.groupName) || '',
        groupId: group && group.groupId ? group.groupId : '',
        gender: genderDisplay.gender || '',
        genderIcon: genderDisplay.icon,
        genderClass: genderDisplay.className,
        isFemale: genderDisplay.gender === 'female',
        filledHoles: filledHoles,
        _thruValue: filledHoles,
        thru: resolveLeaderboardThruLabel(filledHoles),
        flag: player.flag || '',
        country: player.country || '',
        age: player.age || '',
        teamName: teamName,
        teamTag: playerManage.formatTeamTagName(teamName),
        badgeTeamId: resolveBadgeTeamId(
          match,
          playerId,
          playerTeamLookup,
          teamLogoMap,
          merged
        ),
        net: hasNetScore ? netRaw : null,
        hasNetScore: hasNetScore,
        hasScore: hasNetScore,
        grossTotal: 0,
        toPar: 0,
        total: hasNetScore ? netRaw : 0,
        diff: 0,
        netScoreDisplay: hasNetScore ? formatNetScore(netRaw) : '-',
        scoreStr: hasNetScore ? formatNetScore(netRaw) : '-',
        scoreClass: 'score-even',
        avatar: mockAvatars.resolveAvatar(
          (lookup && (lookup.avatar || lookup.avatarUrl)) ||
            player.avatar ||
            player.avatarUrl ||
            '',
          playerId
        ),
        scoreSource: 'match.peoriaResult',
        isEntity: false,
        members: []
      });
    }
  }

  var complete = [];
  var incomplete = [];
  for (var r = 0; r < flat.length; r++) {
    if (flat[r].hasNetScore) complete.push(flat[r]);
    else incomplete.push(flat[r]);
  }
  complete.sort(function (a, b) {
    return Number(a.net) - Number(b.net);
  });
  var rankedComplete = buildCompetitionRanking(complete, function (row) {
    return row.net;
  });
  return rankedComplete.concat(
    incomplete.map(function (row) {
      return Object.assign({}, row, {
        pos: '-',
        scoreStr: '-',
        netScoreDisplay: '-',
        hasNetScore: false,
        hasScore: false,
        net: null,
        total: 0
      });
    })
  );
}

function applyExpanded(rows, openIndex) {
  var idx = Number(openIndex);
  if (!Number.isFinite(idx)) idx = -1;
  return (Array.isArray(rows) ? rows : []).map(function (row, index) {
    return Object.assign({}, row, { expanded: index === idx });
  });
}

function emptyBoard(match, options) {
  var view = asString(options && options.view) || 'all';
  if (view !== 'male' && view !== 'female') view = 'all';
  var scoreType = asString(options && options.scoreType) === 'net' ? 'net' : 'gross';
  var chrome = resolveLeaderboardChrome(match);
  var sideLabel = isInterTeamMatch(match) ? '球队' : '分队';
  return {
    leaderboard: [],
    viewLabel: leaderboardSettingViewModel.buildLeaderboardViewLabel(
      scoreType,
      view,
      sideLabel
    ),
    scoreType: scoreType,
    showTeamColumn: chrome.showTeamColumn,
    teamGroupLogoById: chrome.teamGroupLogoById,
    avatarBadge: chrome.avatarBadge,
    metaMode: chrome.metaMode,
    showExpandGender: chrome.showExpandGender
  };
}

/**
 * @param {object|null} match
 * @param {{ view?: string, scoreType?: string, openIndex?: number }} [options]
 */
function buildPersonalLeaderboardBoard(match, options) {
  var opts = options && typeof options === 'object' ? options : {};
  var sel = leaderboardSettingViewModel.normalizeLeaderboardSelection(match, {
    view: opts.view,
    scoreType: opts.scoreType
  });
  var view = sel.view;
  if (view !== 'male' && view !== 'female') view = 'all';
  var scoreType = sel.scoreType;
  var openIndex = opts.openIndex != null ? Number(opts.openIndex) : -1;
  if (!Number.isFinite(openIndex)) openIndex = -1;

  if (!match || typeof match !== 'object' || !hasFormalGroups(match)) {
    return emptyBoard(match, { view: view, scoreType: scoreType });
  }

  var chrome = resolveLeaderboardChrome(match);
  var sideLabel = isInterTeamMatch(match) ? '球队' : '分队';
  var viewLabel = leaderboardSettingViewModel.buildLeaderboardViewLabel(
    scoreType,
    view,
    sideLabel
  );

  var rows;
  if (scoreType === 'net') {
    rows = buildNetPersonalRows(match);
    rows = filterByGenderView(rows, view);
    var complete = [];
    var incomplete = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row && row.hasNetScore === true && row.filledHoles === 18) complete.push(row);
      else {
        incomplete.push(
          Object.assign({}, row, {
            pos: '-',
            scoreStr: '-',
            netScoreDisplay: '-',
            hasNetScore: false,
            hasScore: false,
            net: null,
            total: 0
          })
        );
      }
    }
    complete.sort(function (a, b) {
      return Number(a.net) - Number(b.net);
    });
    rows = buildCompetitionRanking(complete, function (r) {
      return r.net;
    }).concat(incomplete);
  } else if (shouldBuildEntityLeaderboard(match)) {
    rows = buildEntityLeaderboardRows(match);
    rows = filterByGenderView(rows, view);
    rows = sortGrossRows(rows);
    rows = buildCompetitionRanking(rows, function (r) {
      return r && r.hasScore === true ? (r.toPar != null ? r.toPar : r.diff) : null;
    });
  } else {
    rows = buildGrossPersonalRows(match);
    rows = filterByGenderView(rows, view);
    rows = sortGrossRows(rows);
    rows = buildCompetitionRanking(rows, function (r) {
      return r && r.hasScore === true ? (r.toPar != null ? r.toPar : r.diff) : null;
    });
  }

  return {
    leaderboard: applyExpanded(rows, openIndex),
    viewLabel: viewLabel,
    scoreType: scoreType,
    showTeamColumn: chrome.showTeamColumn,
    teamGroupLogoById: chrome.teamGroupLogoById,
    avatarBadge: chrome.avatarBadge,
    metaMode: chrome.metaMode,
    showExpandGender: chrome.showExpandGender
  };
}

module.exports = {
  buildPersonalLeaderboardBoard: buildPersonalLeaderboardBoard,
  shouldBuildEntityLeaderboard: shouldBuildEntityLeaderboard,
  buildEntityLeaderboardRows: buildEntityLeaderboardRows,
  computePlayerStats: computePlayerStats,
  buildRegisterLookup: buildRegisterLookup,
  buildPlayerTeamLookup: buildPlayerTeamLookup,
  buildTeamGroupLogoMap: buildTeamGroupLogoMap,
  buildTeamNameMap: buildTeamNameMap,
  resolveAnyPlayerId: resolveAnyPlayerId,
  resolveSlotScorePlayerId: resolveSlotScorePlayerId
};
