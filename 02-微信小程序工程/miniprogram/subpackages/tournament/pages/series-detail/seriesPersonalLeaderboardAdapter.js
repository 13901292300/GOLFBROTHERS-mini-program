/**
 * Series 单轮个人榜 → 共享投影（LB-B1 已开赛 / LB-B2 未开赛 pending）
 * - 已开赛：直接调用 buildPersonalLeaderboardBoard
 * - 未开赛：正式席位 pending rows，不调用共享成绩语义
 * - 不排序成绩、不算 gross/net、不写 Series / match / storage
 * - TOT / team：不调用共享模块
 */

var personalLeaderboardBoard = require('../../../../utils/personalLeaderboardBoard.js');
var seriesStandingsAssembler = require('../../utils/seriesStandingsAssembler.js');
var teamMatchScorecard = require('../../../../utils/teamMatchScorecard.js');
var standingsViewModel = require('./seriesStandingsViewModel.js');
var playerManage = require('../../../../utils/playerManage.js');
var mockAvatars = require('../../../../utils/mockAvatars.js');
var leaderboardSettingViewModel = require('../../../../utils/leaderboardSettingViewModel.js');
var seriesStandingsViewOptions = require('./seriesStandingsViewOptions.js');
var {
  isTeamMatchFamily,
  isTeamInternalMatch,
  isInterTeamMatch,
  DEFAULT_ORG_LOGO
} = require('../../../../utils/teamMatchCapabilities.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function isFilledScore(score) {
  return score !== null && score !== undefined && score !== '' && !Number.isNaN(Number(score));
}

function resolveAnyPlayerId(raw) {
  if (!raw || typeof raw !== 'object') return '';
  var id = raw.userId || raw.playerId || raw.id || raw.uid || raw.openid;
  return id != null ? String(id).trim() : '';
}

function pickFilled(primary, fallback) {
  var a = asString(primary);
  if (a) return a;
  return asString(fallback);
}

function bucketHasFilledScore(bucket) {
  if (!bucket || typeof bucket !== 'object') return false;
  var byPlayer =
    bucket.scoresByPlayer && typeof bucket.scoresByPlayer === 'object'
      ? bucket.scoresByPlayer
      : null;
  if (byPlayer) {
    var pids = Object.keys(byPlayer);
    for (var i = 0; i < pids.length; i++) {
      var rec = byPlayer[pids[i]];
      var scores = rec && Array.isArray(rec.scores) ? rec.scores : [];
      for (var s = 0; s < scores.length; s++) {
        if (isFilledScore(scores[s])) return true;
      }
    }
  }
  var entities = Array.isArray(bucket.teamScoresByEntity) ? bucket.teamScoresByEntity : [];
  for (var e = 0; e < entities.length; e++) {
    var escores = entities[e] && Array.isArray(entities[e].scores) ? entities[e].scores : [];
    for (var k = 0; k < escores.length; k++) {
      if (isFilledScore(escores[k])) return true;
    }
  }
  return false;
}

function matchHasFilledScore(match) {
  if (!match || typeof match !== 'object') return false;
  var scoreData =
    match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? match.scoreData
      : null;
  if (scoreData) {
    var gids = Object.keys(scoreData);
    for (var i = 0; i < gids.length; i++) {
      if (bucketHasFilledScore(scoreData[gids[i]])) return true;
    }
  }
  var results =
    match.peoriaResult && Array.isArray(match.peoriaResult.results)
      ? match.peoriaResult.results
      : [];
  for (var r = 0; r < results.length; r++) {
    var net = results[r] && results[r].net != null ? Number(results[r].net) : NaN;
    if (Number.isFinite(net)) return true;
  }
  return false;
}

function isRoundReadyForSharedPersonalBoard(match) {
  if (seriesStandingsAssembler.isStationStarted(match)) return true;
  if (teamMatchScorecard.isStationStartedForScorecard(match)) return true;
  return matchHasFilledScore(match);
}

function emptySharedPersonalBoardFields() {
  return {
    useLiveLeaderboard: false,
    showSharedPersonalBoard: false,
    showEntityAllBoard: false,
    personalLeaderboard: [],
    personalScoreType: 'gross',
    showLeaderboardTeamColumn: false,
    personalTeamGroupLogoById: {},
    personalAvatarBadge: 'auto',
    personalMetaMode: 'countryAge',
    personalShowExpandGender: false,
    personalProfileEntryMap: {},
    personalFollowMap: {},
    personalRelationMap: {},
    personalRelationLabelMap: {},
    personalFollowableMap: {},
    personalFollowLoadingMap: {},
    personalFollowEnabled: false,
    personalEmptyText: '',
    prestartExpandMode: 'none'
  };
}

function collectProfileEntryMap(leaderboard) {
  var map = Object.create(null);
  var list = Array.isArray(leaderboard) ? leaderboard : [];
  for (var i = 0; i < list.length; i++) {
    var row = list[i];
    if (!row) continue;
    var pid = asString(row.playerId || row.userId);
    if (pid) map[pid] = true;
    var members = Array.isArray(row.members) ? row.members : [];
    for (var m = 0; m < members.length; m++) {
      var mem = members[m];
      var mid = asString(mem && (mem.playerId || mem.userId));
      if (mid) map[mid] = true;
    }
  }
  return map;
}

function collectRegisterLookup(match) {
  var map = Object.create(null);
  var lists = [];
  var info = match && match.registerInfo;
  if (info && typeof info === 'object') {
    if (Array.isArray(info.users)) lists.push(info.users);
    if (Array.isArray(info.players)) lists.push(info.players);
  }
  if (Array.isArray(match && match.participants)) lists.push(match.participants);
  for (var i = 0; i < lists.length; i++) {
    var users = lists[i];
    for (var j = 0; j < users.length; j++) {
      var u = users[j];
      var id = resolveAnyPlayerId(u);
      if (!id || map[id]) continue;
      map[id] = u;
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

function resolvePrestartChrome(match) {
  var avatarBadge = 'auto';
  if (isTeamInternalMatch(match)) avatarBadge = 'none';
  else if (isInterTeamMatch(match)) avatarBadge = 'team';
  var teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
  return {
    avatarBadge: avatarBadge,
    metaMode: isTeamMatchFamily(match) ? 'handicapFloat' : 'countryAge',
    showExpandGender: isTeamMatchFamily(match),
    showTeamColumn: teamGroups.length >= 1,
    teamGroupLogoById: buildTeamGroupLogoMap(match)
  };
}

function resolveSeatAffiliationTeamId(seat, flightGroupId) {
  var src = seat && typeof seat === 'object' ? seat : {};
  var flight = asString(flightGroupId);
  var fromSeat = asString(src.matchTeamId || src.teamGroupId);
  if (fromSeat && fromSeat !== flight) return fromSeat;
  var via = '';
  try {
    via = asString(playerManage.resolveMatchTeamId(src));
  } catch (e0) {
    via = '';
  }
  if (via && via !== flight) return via;
  return '';
}

function collectFormalSeats(match) {
  var groups = match && Array.isArray(match.groups) ? match.groups : [];
  var seats = [];
  var seen = Object.create(null);
  for (var g = 0; g < groups.length; g++) {
    var group = groups[g];
    if (!group) continue;
    var lists = [];
    if (Array.isArray(group.players)) lists.push(group.players);
    if (Array.isArray(group.playersSlots)) lists.push(group.playersSlots);
    var flightId = asString(group.groupId);
    for (var li = 0; li < lists.length; li++) {
      var list = lists[li];
      for (var p = 0; p < list.length; p++) {
        var seat = list[p];
        if (!seat || typeof seat !== 'object') continue;
        var playerId = resolveAnyPlayerId(seat);
        if (!playerId || seen[playerId]) continue;
        seen[playerId] = true;
        seats.push({
          seat: seat,
          group: group,
          playerId: playerId,
          flightGroupId: flightId
        });
      }
    }
  }
  return seats;
}

function filterByGenderView(rows, view) {
  var list = Array.isArray(rows) ? rows : [];
  if (view !== 'male' && view !== 'female') return list.slice();
  var out = [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].gender === view) out.push(list[i]);
  }
  return out;
}

function applyExpanded(rows, openIndex) {
  var idx = Number(openIndex);
  if (!Number.isFinite(idx)) idx = -1;
  return (Array.isArray(rows) ? rows : []).map(function (row, index) {
    return Object.assign({}, row, { expanded: index === idx });
  });
}

/**
 * 未开赛 pending 行：只读正式席位；roster 仅补缺失展示字段；无虚假成绩。
 */
function buildPrestartPersonalRows(match, view) {
  var roster = collectRegisterLookup(match);
  var teamNameMap = buildTeamNameMap(match);
  var logoMap = buildTeamGroupLogoMap(match);
  var seats = collectFormalSeats(match);
  var rows = [];
  for (var i = 0; i < seats.length; i++) {
    var item = seats[i];
    var seat = item.seat;
    var playerId = item.playerId;
    var lookup = roster[playerId] || {};
    var name =
      playerManage.resolveMatchNickname(seat) ||
      playerManage.resolveMatchNickname(lookup) ||
      playerId;
    var seatGender = playerManage.getGenderDisplay(seat);
    var genderDisplay =
      seatGender && seatGender.gender
        ? seatGender
        : playerManage.getGenderDisplay(lookup);
    var teamId = resolveSeatAffiliationTeamId(seat, item.flightGroupId);
    var teamName = asString((teamId && teamNameMap[teamId]) || seat.matchTeamName);
    var badgeTeamId =
      teamId && logoMap && Object.prototype.hasOwnProperty.call(logoMap, teamId)
        ? teamId
        : '';
    var handicap = pickFilled(seat.handicap, lookup.handicap);
    var floatCoef = pickFilled(
      seat.floatCoef || seat.floatCoefficient,
      lookup.floatCoef || lookup.floatCoefficient
    );
    rows.push({
      rowId: playerId,
      playerId: playerId,
      userId: playerId,
      name: name,
      displayName: name,
      group: (item.group && item.group.groupName) || '',
      groupId: item.group && item.group.groupId ? item.group.groupId : '',
      gender: (genderDisplay && genderDisplay.gender) || '',
      genderIcon: (genderDisplay && genderDisplay.icon) || '',
      genderClass: (genderDisplay && genderDisplay.className) || '',
      isFemale: !!(genderDisplay && genderDisplay.gender === 'female'),
      pos: '-',
      thru: '-',
      scoreStr: '-',
      netScoreDisplay: '-',
      scoreClass: 'score-even',
      hasScore: false,
      hasNetScore: false,
      avatar: mockAvatars.resolveAvatar(
        pickFilled(
          seat.avatar || seat.avatarUrl,
          lookup.avatar || lookup.avatarUrl
        ),
        playerId
      ),
      flag: pickFilled(seat.flag, lookup.flag),
      country: pickFilled(seat.country, lookup.country),
      age: pickFilled(seat.age, lookup.age),
      teamName: teamName,
      teamTag: playerManage.formatTeamTagName(teamName),
      badgeTeamId: badgeTeamId,
      handicapText: handicap,
      floatCoefText: floatCoef,
      isEntity: false,
      members: [],
      pendingPrestart: true
    });
  }
  return filterByGenderView(rows, view);
}

function shouldProjectEntityAllBoard(match, view, scoreType) {
  if (asString(view) === 'team') return false;
  if (asString(scoreType) === 'net') return false;
  return personalLeaderboardBoard.shouldBuildEntityLeaderboard(match) === true;
}

function mapEntityAllRow(row, roundId, matchId) {
  var src = row && typeof row === 'object' ? row : {};
  var entityId = asString(src.entityId);
  var members = Array.isArray(src.members) ? src.members : [];
  var scorecardKey =
    asString(src.scorecardKey) ||
    (entityId ? 'entity:' + entityId : asString(src.rowId));
  return Object.assign({}, src, {
    roundId: asString(roundId),
    matchId: asString(matchId),
    stationMatchId: asString(matchId),
    playerId: '',
    userId: '',
    isEntity: true,
    canOpenScorecard: true,
    scorecardKey: scorecardKey,
    occurrenceKey: asString(roundId) + ':' + (entityId || scorecardKey),
    resultUnitType: asString(src.kind) === 'pair' ? 'pair' : 'entity',
    members: members,
    expanded: false
  });
}

function packEntityAllOverlay(match, view, scoreType, rows, chrome, viewLabel, roundId) {
  var matchId = match && match.matchId != null ? String(match.matchId).trim() : '';
  var listRows = (Array.isArray(rows) ? rows : []).map(function (row) {
    return mapEntityAllRow(row, roundId, matchId);
  });
  var unit = seriesStandingsViewOptions.resolveListUnit(match, scoreType);
  var headPlayerLabel = unit === 'pair' ? 'PAIR' : 'COMBO';
  return Object.assign({}, emptySharedPersonalBoardFields(), {
    boardView: view,
    selection: { view: view, scoreType: scoreType },
    showTeamBoard: false,
    showSharedPersonalBoard: false,
    showEntityAllBoard: true,
    listRows: listRows,
    listEmptyText: listRows.length ? '' : '暂无榜单数据',
    leaderboardViewLabel: viewLabel || '',
    headPlayerLabel: headPlayerLabel,
    showLeaderboardTeamColumn: !!(chrome && chrome.showTeamColumn),
    personalTeamGroupLogoById: (chrome && chrome.teamGroupLogoById) || {},
    personalAvatarBadge: (chrome && chrome.avatarBadge) || 'auto',
    personalMetaMode: (chrome && chrome.metaMode) || 'countryAge',
    personalShowExpandGender: !!(chrome && chrome.showExpandGender)
  });
}

function packSharedOverlay(match, view, scoreType, rows, chrome, viewLabel, prestartExpandMode) {
  return Object.assign({}, emptySharedPersonalBoardFields(), {
    boardView: view,
    selection: { view: view, scoreType: scoreType },
    showTeamBoard: false,
    showSharedPersonalBoard: true,
    listRows: [],
    listEmptyText: '',
    leaderboardViewLabel: viewLabel || '',
    headPlayerLabel: 'PLAYER',
    personalLeaderboard: rows,
    personalScoreType: scoreType,
    showLeaderboardTeamColumn: !!(chrome && chrome.showTeamColumn),
    personalTeamGroupLogoById: (chrome && chrome.teamGroupLogoById) || {},
    personalAvatarBadge: (chrome && chrome.avatarBadge) || 'auto',
    personalMetaMode: (chrome && chrome.metaMode) || 'countryAge',
    personalShowExpandGender: !!(chrome && chrome.showExpandGender),
    personalProfileEntryMap: collectProfileEntryMap(rows),
    personalFollowEnabled: false,
    personalEmptyText: '',
    prestartExpandMode: prestartExpandMode === 'teeing_off_soon' ? 'teeing_off_soon' : 'none'
  });
}

/**
 * @param {object} input
 */
function projectSeriesStandingsPersonalBoard(input) {
  var src = input && typeof input === 'object' ? input : {};
  var selectedKey = asString(src.selectedKey) || standingsViewModel.CUMULATIVE_KEY;
  var rawSel = src.selection && typeof src.selection === 'object' ? src.selection : {};
  var view = asString(rawSel.view) || 'team';
  var scoreType = asString(rawSel.scoreType) === 'net' ? 'net' : 'gross';
  var empty = emptySharedPersonalBoardFields();
  var openIndex = src.openIndex != null ? Number(src.openIndex) : -1;
  if (!Number.isFinite(openIndex)) openIndex = -1;

  if (selectedKey === standingsViewModel.CUMULATIVE_KEY) {
    return {
      useShared: false,
      reason: 'tot',
      calledShared: false,
      verifiedOk: true,
      openIndex: -1,
      board: null,
      overlay: empty
    };
  }
  if (view === 'team') {
    return {
      useShared: false,
      reason: 'team',
      calledShared: false,
      verifiedOk: true,
      openIndex: -1,
      board: null,
      overlay: empty
    };
  }

  var match = src.match && typeof src.match === 'object' ? src.match : null;
  var verified = seriesStandingsAssembler.verifyManagedStation(
    src.series,
    src.round,
    match,
    src.indexLink
  );
  if (!verified || !verified.ok) {
    return {
      useShared: false,
      reason: 'managed_fail',
      calledShared: false,
      verifiedOk: false,
      openIndex: -1,
      board: null,
      overlay: Object.assign({}, empty, {
        boardView: view,
        selection: { view: view, scoreType: scoreType },
        showTeamBoard: false,
        listRows: [],
        listEmptyText: '本轮比赛数据异常',
        headPlayerLabel: 'PLAYER'
      })
    };
  }

  var sideLabel = isInterTeamMatch(match) ? '球队' : '分队';
  var viewLabel = leaderboardSettingViewModel.buildLeaderboardViewLabel(
    scoreType,
    view,
    sideLabel
  );

  if (shouldProjectEntityAllBoard(match, view, scoreType)) {
    var entityBoard = personalLeaderboardBoard.buildPersonalLeaderboardBoard(match, {
      view: view,
      scoreType: scoreType,
      openIndex: -1
    });
    var entityRows = (entityBoard && entityBoard.leaderboard) || [];
    return {
      useShared: false,
      reason: 'entity_all',
      calledShared: true,
      verifiedOk: true,
      openIndex: -1,
      board: entityBoard,
      overlay: packEntityAllOverlay(
        match,
        view,
        (entityBoard && entityBoard.scoreType) || scoreType,
        entityRows,
        {
          showTeamColumn: entityBoard && entityBoard.showTeamColumn,
          teamGroupLogoById: entityBoard && entityBoard.teamGroupLogoById,
          avatarBadge: entityBoard && entityBoard.avatarBadge,
          metaMode: entityBoard && entityBoard.metaMode,
          showExpandGender: entityBoard && entityBoard.showExpandGender
        },
        entityBoard && entityBoard.viewLabel ? entityBoard.viewLabel : viewLabel,
        selectedKey
      )
    };
  }

  if (!isRoundReadyForSharedPersonalBoard(match)) {
    var chrome = resolvePrestartChrome(match);
    var pending = buildPrestartPersonalRows(match, view);
    if (openIndex >= 0 && openIndex >= pending.length) openIndex = -1;
    var pendingRows = applyExpanded(pending, openIndex);
    return {
      useShared: true,
      reason: 'prestart',
      calledShared: false,
      verifiedOk: true,
      openIndex: openIndex,
      board: null,
      overlay: packSharedOverlay(
        match,
        view,
        scoreType,
        pendingRows,
        chrome,
        viewLabel,
        'teeing_off_soon'
      )
    };
  }

  var board = personalLeaderboardBoard.buildPersonalLeaderboardBoard(match, {
    view: view,
    scoreType: scoreType,
    openIndex: openIndex
  });
  var rows = (board && board.leaderboard) || [];
  if (openIndex >= 0 && openIndex >= rows.length) {
    openIndex = -1;
    board = personalLeaderboardBoard.buildPersonalLeaderboardBoard(match, {
      view: view,
      scoreType: scoreType,
      openIndex: -1
    });
    rows = (board && board.leaderboard) || [];
  }

  return {
    useShared: true,
    reason: 'shared',
    calledShared: true,
    verifiedOk: true,
    openIndex: openIndex,
    board: board,
    overlay: packSharedOverlay(
      match,
      view,
      (board && board.scoreType) || scoreType,
      rows,
      {
        showTeamColumn: board && board.showTeamColumn,
        teamGroupLogoById: board && board.teamGroupLogoById,
        avatarBadge: board && board.avatarBadge,
        metaMode: board && board.metaMode,
        showExpandGender: board && board.showExpandGender
      },
      board && board.viewLabel ? board.viewLabel : viewLabel,
      'none'
    )
  };
}

module.exports = {
  projectSeriesStandingsPersonalBoard: projectSeriesStandingsPersonalBoard,
  isRoundReadyForSharedPersonalBoard: isRoundReadyForSharedPersonalBoard,
  emptySharedPersonalBoardFields: emptySharedPersonalBoardFields,
  matchHasFilledScore: matchHasFilledScore,
  buildPrestartPersonalRows: buildPrestartPersonalRows
};
