/**
 * Series 总杆球队榜 → 共享投影
 * - R1…Rn + view=team：该 stationMatch 的普通单场总杆球队榜镜像
 *   （buildGrossTeamLeaderboardView，按该轮自身 G1–G4 渲染；不另建投影）
 * - TOT + global_m：各轮共享球队榜 side bucket（队际=参赛球队，队内=分队）
 *   再交给 assembleGrossTeams（M = scoringRule.globalM）
 *   G1 收个人行，G2–G4 收组合实体；不按名称合并、不扫 roster 猜分队
 * - 净杆球队榜本轮不接
 * - 不写 Series / match / storage
 */

var teamLeaderboardView = require('../../../../utils/teamLeaderboardView.js');
var teamLeaderboardHost = require('../../../../utils/teamLeaderboardHost.js');
var seriesStandingsAssembler = require('../../../../utils/seriesStandingsAssembler.js');
var seriesResultAdapter = require('../../../../utils/seriesResultAdapter.js');
var standingsViewModel = require('./seriesStandingsViewModel.js');
var seriesPersonalLeaderboardAdapter = require('./seriesPersonalLeaderboardAdapter.js');
var leaderboardSettingViewModel = require('../../../../utils/leaderboardSettingViewModel.js');
var strokeEntityValidator = require('../../../../utils/strokeEntityValidator.js');
var { isInterTeamMatch } = require('../../../../utils/teamMatchCapabilities.js');
var seriesStandingsExpandIdentity = require('../../../../utils/seriesStandingsExpandIdentity.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function roundStationMatchId(round) {
  return asString(round && (round.stationMatchId || round.matchId));
}

function isStationStarted(match) {
  var st = asString(match && match.status).toLowerCase();
  return st === 'ongoing' || st === 'finished' || st === 'completed';
}

function hasFilledFormalGroups(match) {
  var groups = match && Array.isArray(match.groups) ? match.groups : [];
  for (var i = 0; i < groups.length; i++) {
    var players = groups[i] && Array.isArray(groups[i].players) ? groups[i].players : [];
    for (var j = 0; j < players.length; j++) {
      var p = players[j];
      if (p && (asString(p.userId) || asString(p.playerId))) return true;
    }
  }
  return false;
}

function countObjectKeys(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return 0;
  return Object.keys(obj).length;
}

function logTotDebug(debug) {
  if (!debug) return;
  try {
    if (typeof console !== 'undefined' && typeof console.log === 'function') {
      console.log(
        '[SERIES-TOT]',
        debug.reason || '',
        debug.failFn || '',
        debug.failRoundId || '',
        debug.failStationMatchId || '',
        debug
      );
    }
  } catch (eLog) {
    /* ignore */
  }
}

function attachTotDebug(overlay, debug) {
  var next = overlay && typeof overlay === 'object' ? overlay : {};
  next.totDebug = debug && typeof debug === 'object' ? debug : { ok: false, reason: 'unknown' };
  return next;
}

function isSoftUnavailableStation(verifyReason) {
  return verifyReason === 'missing_payload' || verifyReason === 'index_missing';
}

function isRoundCancelled(round) {
  return asString(round && round.roundStatus) === 'cancelled';
}

function roundSeqLabel(round, series, roundId, roundIndex) {
  var idx = round && round.index != null ? Number(round.index) : NaN;
  if (Number.isFinite(idx) && idx > 0) return 'R' + Math.floor(idx);
  if (roundIndex != null && Number.isFinite(Number(roundIndex)) && Number(roundIndex) > 0) {
    return 'R' + Math.floor(Number(roundIndex));
  }
  var rid = asString(roundId);
  var rounds = series && Array.isArray(series.rounds) ? series.rounds : [];
  for (var i = 0; i < rounds.length; i++) {
    if (asString(rounds[i] && rounds[i].roundId) === rid) return 'R' + (i + 1);
  }
  return rid ? 'R?' : '';
}

function isDivisionSeries(series) {
  if (asString(series && series.hostMode) === 'organization') return false;
  if (asString(series && series.hostMode) === 'team') return true;
  return asString(series && series.templateId) === 'division_series';
}

function resolveTotStrokeKind(gameMode) {
  var mode = asString(gameMode);
  if (!mode) return '';
  if (typeof strokeEntityValidator.isMatchPlayBoardMode === 'function' &&
      strokeEntityValidator.isMatchPlayBoardMode(mode)) {
    return '';
  }
  var kind =
    typeof strokeEntityValidator.resolveStrokeKind === 'function'
      ? strokeEntityValidator.resolveStrokeKind(mode)
      : '';
  if (kind === 'g1' || kind === 'g2g3' || kind === 'g4') return kind;
  return '';
}

function resolveTotStrokeFamily(gameMode) {
  var kind = resolveTotStrokeKind(gameMode);
  if (kind === 'g1') return 'g1';
  if (kind === 'g2g3' || kind === 'g4') return 'entity_stroke';
  return '';
}

function findParticipant(series, seriesParticipantId) {
  var pid = asString(seriesParticipantId);
  if (!pid) return null;
  var parts = series && Array.isArray(series.participants) ? series.participants : [];
  for (var i = 0; i < parts.length; i++) {
    if (asString(parts[i] && parts[i].seriesParticipantId) === pid) return parts[i];
  }
  return null;
}

/** 稳定 side id：divisionId / sourceTeamId，不用名称。 */
function canonicalSideId(series, rawId) {
  var tid = asString(rawId);
  if (!tid) return '';
  var parts = series && Array.isArray(series.participants) ? series.participants : [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    var divisionId = asString(p && p.divisionId);
    var spid = asString(p && p.seriesParticipantId);
    if (divisionId && (divisionId === tid || spid === tid || spid === 'division:' + tid)) {
      return divisionId;
    }
  }
  var map =
    typeof seriesResultAdapter.buildParticipantResolveMap === 'function'
      ? seriesResultAdapter.buildParticipantResolveMap(series)
      : {};
  var pid = map[tid] || '';
  var part = pid ? findParticipant(series, pid) : null;
  if (part && asString(part.kind) === 'division') {
    var hostAlias = asString(part.sourceTeamId);
    var did = asString(part.divisionId);
    if (hostAlias && hostAlias === tid && did && did !== tid) {
      part = null;
      pid = '';
    }
  }
  if (part) {
    var partDiv = asString(part.divisionId);
    if (partDiv) return partDiv;
    var source = asString(part.sourceTeamId);
    if (source && asString(part.kind) !== 'division') return source;
    if (pid.indexOf('division:') === 0) return pid.slice('division:'.length) || pid;
    if (pid.indexOf('team:') === 0) return pid.slice('team:'.length) || pid;
    return pid;
  }
  if (tid.indexOf('division:') === 0) return tid.slice('division:'.length) || tid;
  if (tid.indexOf('team:') === 0) return tid.slice('team:'.length) || tid;
  return tid;
}

function resolveSeriesParticipantId(series, matchTeamId) {
  var tid = asString(matchTeamId);
  if (!tid) return '';
  var map =
    typeof seriesResultAdapter.buildParticipantResolveMap === 'function'
      ? seriesResultAdapter.buildParticipantResolveMap(series)
      : {};
  if (map[tid]) return map[tid];
  var parts = series && Array.isArray(series.participants) ? series.participants : [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    var pid = asString(p && p.seriesParticipantId);
    if (pid && pid === tid) return pid;
  }
  for (var j = 0; j < parts.length; j++) {
    var row = parts[j];
    var sid = asString(row && row.seriesParticipantId);
    var source = asString(row && row.sourceTeamId);
    var divisionId = asString(row && row.divisionId);
    if (source && source === tid && sid) {
      if (asString(row && row.kind) !== 'division') return sid;
    }
    if (divisionId && divisionId === tid && sid) return sid;
  }
  var teamPrefixed = 'team:' + tid;
  var divPrefixed = 'division:' + tid;
  for (var k = 0; k < parts.length; k++) {
    var spid = asString(parts[k] && parts[k].seriesParticipantId);
    if (spid === teamPrefixed || spid === divPrefixed) return spid;
  }
  return tid;
}

function isComboExpandUnit(unit) {
  return !!(unit && unit.isEntity === true && asString(unit.entityId));
}

function isPlayerExpandUnit(unit) {
  if (!unit || unit.isEntity === true) return false;
  return !!(asString(unit.playerId) || asString(unit.userId));
}

function resolveGroupLabelFromMatch(match, groupId) {
  var gid = asString(groupId);
  if (!gid) return '';
  var groups = match && Array.isArray(match.groups) ? match.groups : [];
  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    if (!g) continue;
    if (asString(g.groupId) === gid) {
      return asString(g.groupName || g.groupLabel);
    }
  }
  return '';
}

function mapPlayer(p, roundId, matchId) {
  var row = p && typeof p === 'object' ? p : {};
  var playerId = asString(row.playerId || row.userId);
  var entityId = asString(row.entityId);
  var roundLabel = asString(row.roundLabel);
  var stationMatchId = asString(row.stationMatchId) || asString(matchId);
  var occurrenceKey =
    asString(row.occurrenceKey) ||
    asString(roundId) + ':' + (playerId || entityId || asString(row.scorecardKey));
  return Object.assign({}, row, {
    roundId: asString(row.roundId) || asString(roundId),
    matchId: stationMatchId,
    stationMatchId: stationMatchId,
    showRoundTag: false,
    roundLabel: roundLabel,
    subLabel: asString(row.subLabel),
    pendingLabel: '',
    fromLineup: false,
    canOpenScorecard: !!roundId && (!!playerId || !!entityId),
    occurrenceKey: occurrenceKey,
    userId: playerId || asString(row.userId)
  });
}

function mapTeam(team, roundId, matchId, match) {
  var src = team && typeof team === 'object' ? team : {};
  var players = Array.isArray(src.players)
    ? src.players.map(function (p) {
        return mapPlayer(p, roundId, matchId);
      })
    : [];
  var started = isStationStarted(match);
  return {
    teamId: asString(src.teamId),
    seriesParticipantId: asString(src.teamId),
    pos: src.pos == null ? '-' : String(src.pos),
    teamName: asString(src.teamName),
    sourceTeamLogo: asString(src.sourceTeamLogo),
    colorSnapshot: asString(src.colorSnapshot || src.teamColor),
    grossTotal: src.grossTotal,
    toPar: src.toPar,
    total: src.total,
    hasScore: src.hasScore === true,
    grossTotalDisplay:
      src.grossTotalDisplay != null
        ? String(src.grossTotalDisplay)
        : teamLeaderboardView.formatGrossTotalDisplay(src.hasScore === true, src.grossTotal),
    scoreStr: src.scoreStr == null ? '-' : String(src.scoreStr),
    scoreClass: asString(src.scoreClass) || 'score-even',
    scoringPlayersCount: src.scoringPlayersCount == null ? 0 : src.scoringPlayersCount,
    players: players,
    expandEmptyHint: players.length ? '' : '本轮暂无该队球员',
    expandStatusHint: !started && players.length ? 'TEEING OFF SOON' : ''
  };
}

function emptyOverlay(viewLabel) {
  var sharedEmpty = seriesPersonalLeaderboardAdapter.emptySharedPersonalBoardFields();
  return Object.assign({}, sharedEmpty, {
    boardView: 'team',
    selection: { view: 'team', scoreType: 'gross' },
    showTeamBoard: true,
    listRows: [],
    listEmptyText: '',
    listEmptyTitle: '',
    leaderboardViewLabel: viewLabel || '',
    headPlayerLabel: 'TEAM',
    teamRows: [],
    mainBoardInvariant: false
  });
}

function headerSignature(teams) {
  var list = Array.isArray(teams) ? teams : [];
  return list
    .map(function (t) {
      return [asString(t.teamId), asString(t.pos), asString(t.teamName), String(t.grossTotal), asString(t.scoreStr)].join('|');
    })
    .join(';;');
}

/**
 * @param {object} input
 */
function projectSeriesStandingsTeamBoard(input) {
  var src = input && typeof input === 'object' ? input : {};
  var selectedKey = asString(src.selectedKey) || standingsViewModel.CUMULATIVE_KEY;
  var sharedEmpty = seriesPersonalLeaderboardAdapter.emptySharedPersonalBoardFields();

  if (selectedKey === standingsViewModel.CUMULATIVE_KEY) {
    return projectSeriesTotG2G3TeamBoard(src);
  }

  var match = src.match && typeof src.match === 'object' ? src.match : null;
  var verified = seriesStandingsAssembler.verifyManagedStation(
    src.series,
    src.round,
    match,
    src.indexLink
  );
  var sideLabel = isInterTeamMatch(match) ? '球队' : '分队';
  var viewLabel = leaderboardSettingViewModel.buildLeaderboardViewLabel('gross', 'team', sideLabel);

  if (!verified || !verified.ok) {
    return {
      useShared: false,
      reason: 'managed_fail',
      calledShared: false,
      verifiedOk: false,
      overlay: Object.assign({}, emptyOverlay(viewLabel), {
        listEmptyText: '本轮比赛数据异常'
      })
    };
  }

  var host = teamLeaderboardHost.createStandaloneHost({
    viewerRemarkCtx: src.viewerRemarkCtx
  });
  var teams = teamLeaderboardView.buildGrossTeamLeaderboardView(match, host) || [];
  var matchId = match && match.matchId != null ? String(match.matchId).trim() : '';
  var teamRows = teams.map(function (team) {
    return mapTeam(team, selectedKey, matchId, match);
  });
  teamRows = seriesStandingsExpandIdentity.stampTeamBoardDivisionAvatarMarks(
    teamRows,
    match,
    src.series
  );

  return {
    useShared: true,
    reason: 'shared',
    calledShared: true,
    verifiedOk: true,
    overlay: Object.assign({}, sharedEmpty, {
      boardView: 'team',
      selection: { view: 'team', scoreType: 'gross' },
      showTeamBoard: true,
      showSharedPersonalBoard: false,
      listRows: [],
      listEmptyText: teamRows.length ? '' : '暂无榜单数据',
      leaderboardViewLabel: viewLabel,
      headPlayerLabel: 'TEAM',
      teamRows: teamRows,
      mainBoardInvariant: false
    })
  };
}

function totBypass() {
  return {
    useShared: false,
    reason: 'tot',
    calledShared: false,
    verifiedOk: true,
    overlay: null
  };
}

function totFailClosed(viewLabel, reason, debug) {
  var totDebug = Object.assign(
    {
      ok: false,
      reason: reason || 'station_fail',
      failFn: (debug && debug.failFn) || 'totFailClosed',
      failRoundId: (debug && debug.failRoundId) || '',
      failStationMatchId: (debug && debug.failStationMatchId) || '',
      errors: (debug && debug.errors) || []
    },
    debug || {}
  );
  totDebug.reason = reason || totDebug.reason;
  logTotDebug(totDebug);
  return {
    useShared: true,
    reason: reason || 'station_fail',
    calledShared: false,
    verifiedOk: false,
    totDebug: totDebug,
    overlay: attachTotDebug(
      Object.assign({}, emptyOverlay(viewLabel), {
        listEmptyTitle: '系列赛比赛数据异常',
        listEmptyText: '系列赛比赛数据异常'
      }),
      totDebug
    )
  };
}

function applySeriesTotTeamBoardOverlay(vm, projected, totLabel) {
  var sharedEmpty = seriesPersonalLeaderboardAdapter.emptySharedPersonalBoardFields();
  var base = vm && typeof vm === 'object' ? vm : {};
  if (projected && projected.useShared) {
    var merged = Object.assign({}, base, sharedEmpty, projected.overlay || {}, {
      leaderboardViewLabel:
        (projected.overlay && projected.overlay.leaderboardViewLabel) || totLabel || '',
      headPlayerLabel: 'TEAM',
      showEntityAllBoard: false,
      useLiveLeaderboard: false
    });
    if (projected.totDebug && !merged.totDebug) merged.totDebug = projected.totDebug;
    return merged;
  }
  return Object.assign({}, base, sharedEmpty, {
    boardView: 'team',
    selection: { view: 'team', scoreType: 'gross' },
    showTeamBoard: true,
    showEntityAllBoard: false,
    useLiveLeaderboard: false,
    listRows: [],
    leaderboardViewLabel: totLabel || '',
    headPlayerLabel: 'TEAM'
  });
}

function guardTotOverlayAgainstStaleEmpty(currentStandings, nextStandings, projected) {
  if (projected && projected.verifiedOk === false) return nextStandings;
  var nextRows = nextStandings && Array.isArray(nextStandings.teamRows) ? nextStandings.teamRows : [];
  var curRows = currentStandings && Array.isArray(currentStandings.teamRows) ? currentStandings.teamRows : [];
  if (!nextRows.length && curRows.length && nextStandings && nextStandings.useLiveLeaderboard !== true) {
    return Object.assign({}, nextStandings, { teamRows: curRows });
  }
  return nextStandings;
}

function mergeComboIntoTeamMap(teamMap, teamId, teamName, combo) {
  if (!teamId || !combo) return;
  var bucket = teamMap[teamId];
  if (!bucket) {
    teamMap[teamId] = {
      teamId: teamId,
      teamName: teamName || '',
      grossTotal: 0,
      toPar: 0,
      total: 0,
      scoringPlayersCount: 0,
      players: []
    };
    bucket = teamMap[teamId];
  } else if (!bucket.teamName && teamName) {
    bucket.teamName = teamName;
  }
  bucket.players.push(combo);
}

function projectSeriesTotG2G3TeamBoard(src) {
  var series = src.series && typeof src.series === 'object' ? src.series : null;
  var mode = asString(series && series.scoringRule && series.scoringRule.mode);
  if (!series || mode !== 'global_m') return totBypass();

  var viewLabel = standingsViewModel.buildTotTopMDescription
    ? standingsViewModel.buildTotTopMDescription(series)
    : '';
  var rounds = Array.isArray(series.rounds) ? series.rounds : [];
  var declaredFamily = '';
  for (var d = 0; d < rounds.length; d++) {
    if (!rounds[d] || isRoundCancelled(rounds[d])) continue;
    if (!roundStationMatchId(rounds[d])) continue;
    var declaredMode = asString(rounds[d].gameMode);
    if (!declaredMode) continue;
    var df = resolveTotStrokeFamily(declaredMode);
    if (!df) continue;
    declaredFamily = df;
    break;
  }

  var divisionSeries = isDivisionSeries(series);
  var wantSharedTot =
    declaredFamily === 'entity_stroke' ||
    (declaredFamily === 'g1' && divisionSeries);
  if (!wantSharedTot && declaredFamily === 'g1' && !divisionSeries) return totBypass();
  if (!declaredFamily) return totBypass();

  var getMatchById =
    typeof src.getMatchById === 'function'
      ? src.getMatchById
      : function () {
          return null;
        };
  var getIndexByMatchId =
    typeof src.getIndexByMatchId === 'function'
      ? src.getIndexByMatchId
      : function () {
          return null;
        };

  var host = teamLeaderboardHost.createStandaloneHost({
    viewerRemarkCtx: src.viewerRemarkCtx
  });
  var mergedMap = {};
  var teamOrderIds = [];
  var teamNameById = {};
  var sideMetaById = {};
  var sawFamilyStation = false;
  var sawOtherStation = false;
  var sawMatchId = false;
  var sawEntityG2G3 = false;
  var sawEntityG4 = false;
  var stationMatchType = divisionSeries ? 'team-internal' : 'inter-team';
  var roundTraces = [];

  function rememberSide(rawId, name, extra) {
    var sideId = canonicalSideId(series, rawId);
    if (!sideId) return '';
    if (teamOrderIds.indexOf(sideId) < 0) teamOrderIds.push(sideId);
    var nm = asString(name);
    if (nm) teamNameById[sideId] = nm;
    var meta = sideMetaById[sideId] || {};
    if (extra && typeof extra === 'object') {
      var logo = asString(extra.sourceTeamLogo);
      var color = asString(extra.colorSnapshot || extra.teamColor);
      if (logo) meta.sourceTeamLogo = logo;
      if (color) meta.colorSnapshot = color;
    }
    sideMetaById[sideId] = meta;
    return sideId;
  }

  function roundFailDebug(round, match, extra) {
    return Object.assign(
      {
        failRoundId: asString(round && round.roundId),
        failStationMatchId:
          roundStationMatchId(round) || asString(match && match.matchId),
        errors: roundTraces.slice()
      },
      extra || {}
    );
  }

  var seriesParts = series && Array.isArray(series.participants) ? series.participants : [];
  for (var sp = 0; sp < seriesParts.length; sp++) {
    var partRow = seriesParts[sp];
    if (!partRow) continue;
    var seedId =
      asString(partRow.kind) === 'division'
        ? asString(partRow.divisionId)
        : asString(partRow.sourceTeamId) || asString(partRow.seriesParticipantId);
    if (!seedId) continue;
    rememberSide(seedId, partRow.nameSnapshot, {
      sourceTeamLogo: partRow.logoSnapshot,
      colorSnapshot: partRow.colorSnapshot
    });
  }

  for (var i = 0; i < rounds.length; i++) {
    var round = rounds[i];
    if (!round || isRoundCancelled(round)) continue;
    var roundId = asString(round.roundId);
    if (!roundId) continue;
    var matchId = roundStationMatchId(round);
    if (!matchId) {
      roundTraces.push({
        roundId: roundId,
        stationMatchId: '',
        skipped: 'no_station'
      });
      continue;
    }
    sawMatchId = true;

    var match = null;
    var indexLink = null;
    try {
      match = getMatchById(matchId);
      indexLink = getIndexByMatchId(matchId);
    } catch (eRead) {
      roundTraces.push({ roundId: roundId, stationMatchId: matchId, skipped: 'read_error' });
      return totFailClosed(
        viewLabel,
        'read_error',
        roundFailDebug(round, match, { failFn: 'getMatchById' })
      );
    }

    var filledGroups = hasFilledFormalGroups(match);
    var verified = seriesStandingsAssembler.verifyManagedStation(
      series,
      round,
      match,
      indexLink
    );
    var verifyReason = verified && verified.reason ? verified.reason : 'managed_fail';
    if (!verified || !verified.ok) {
      roundTraces.push({
        roundId: roundId,
        stationMatchId: matchId,
        verify: verifyReason,
        filledGroups: filledGroups,
        teamGroups: match && Array.isArray(match.teamGroups) ? match.teamGroups.length : 0,
        groups: match && Array.isArray(match.groups) ? match.groups.length : 0
      });
      if (isSoftUnavailableStation(verifyReason)) {
        continue;
      }
      return totFailClosed(
        viewLabel,
        verifyReason,
        roundFailDebug(round, match, {
          failFn: 'verifyManagedStation',
          verify: verified
        })
      );
    }

    var stationMode = asString(match && (match.gameMode || match.selectedGameMode)) ||
      asString(round.gameMode);
    var stationFamily = resolveTotStrokeFamily(stationMode);
    var stationKind = resolveTotStrokeKind(stationMode);
    var teamGroupsSkip = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
    for (var tgs = 0; tgs < teamGroupsSkip.length; tgs++) {
      var gs = teamGroupsSkip[tgs];
      var gids = gs && gs.id != null ? asString(gs.id) : '';
      if (!gids) continue;
      rememberSide(gids, gs.name, gs);
    }
    if (!filledGroups) {
      if (stationFamily) {
        if (!declaredFamily) declaredFamily = stationFamily;
        sawFamilyStation = true;
        if (stationKind === 'g2g3') sawEntityG2G3 = true;
        if (stationKind === 'g4') sawEntityG4 = true;
        if (match && match.matchType) stationMatchType = asString(match.matchType) || stationMatchType;
      } else {
        sawOtherStation = true;
      }
      roundTraces.push({
        roundId: roundId,
        stationMatchId: matchId,
        skipped: stationFamily ? 'unfilled_station' : 'no_stroke_family_unfilled',
        filledGroups: false,
        teamGroups: teamGroupsSkip.length,
        groups: match && Array.isArray(match.groups) ? match.groups.length : 0,
        stationFamily: stationFamily,
        stationKind: stationKind
      });
      continue;
    }
    if (!stationFamily) {
      sawOtherStation = true;
      if (sawFamilyStation || declaredFamily) {
        roundTraces.push({ roundId: roundId, stationMatchId: matchId, skipped: 'mixed_game_mode' });
        return totFailClosed(
          viewLabel,
          'mixed_game_mode',
          roundFailDebug(round, match, {
            failFn: 'resolveTotStrokeFamily',
            stationMode: stationMode,
            stationFamily: stationFamily,
            declaredFamily: declaredFamily
          })
        );
      }
      roundTraces.push({
        roundId: roundId,
        stationMatchId: matchId,
        skipped: 'no_stroke_family_unfilled',
        filledGroups: true,
        teamGroups: teamGroupsSkip.length,
        groups: match && Array.isArray(match.groups) ? match.groups.length : 0
      });
      continue;
    }
    if (declaredFamily && stationFamily !== declaredFamily) {
      return totFailClosed(
        viewLabel,
        'mixed_game_mode',
        roundFailDebug(round, match, {
          failFn: 'resolveTotStrokeFamily',
          stationFamily: stationFamily,
          stationKind: stationKind,
          declaredFamily: declaredFamily
        })
      );
    }
    if (!declaredFamily) declaredFamily = stationFamily;
    sawFamilyStation = true;
    if (stationKind === 'g2g3') sawEntityG2G3 = true;
    if (stationKind === 'g4') sawEntityG4 = true;
    if (match && match.matchType) stationMatchType = asString(match.matchType) || stationMatchType;

    var roundTeams;
    try {
      roundTeams = teamLeaderboardView.buildGrossTeamLeaderboardView(match, host) || [];
    } catch (eCollect) {
      return totFailClosed(
        viewLabel,
        'entity_collect_error',
        roundFailDebug(round, match, { failFn: 'buildGrossTeamLeaderboardView' })
      );
    }
    var teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
    for (var tg = 0; tg < teamGroups.length; tg++) {
      var g = teamGroups[tg];
      var gid = g && g.id != null ? asString(g.id) : '';
      if (!gid) continue;
      rememberSide(gid, g.name, g);
    }
    var roundIndex =
      round.index != null && Number.isFinite(Number(round.index))
        ? Math.floor(Number(round.index))
        : i + 1;
    var roundLabel = roundSeqLabel(round, series, roundId, roundIndex);
    var entityTrace = [];
    for (var ti = 0; ti < roundTeams.length; ti++) {
      var team = roundTeams[ti];
      if (!team) continue;
      var combos = Array.isArray(team.players) ? team.players : [];
      var takeable = [];
      for (var c0 = 0; c0 < combos.length; c0++) {
        var unit0 = combos[c0];
        var take0 =
          declaredFamily === 'g1' ? isPlayerExpandUnit(unit0) : isComboExpandUnit(unit0);
        if (take0) takeable.push(unit0);
      }
      var rawTeamId = asString(team.teamId);
      if (!rawTeamId) {
        if (takeable.length) {
          return totFailClosed(
            viewLabel,
            'unattributed_side',
            roundFailDebug(round, match, {
              failFn: 'rememberSide',
              sharedProjectionLen: roundTeams.length
            })
          );
        }
        continue;
      }
      var teamId = rememberSide(rawTeamId, team.teamName);
      if (!teamId) {
        if (takeable.length) {
          return totFailClosed(
            viewLabel,
            'unattributed_side',
            roundFailDebug(round, match, {
              failFn: 'canonicalSideId',
              rawTeamId: rawTeamId,
              sharedProjectionLen: roundTeams.length
            })
          );
        }
        continue;
      }
      for (var c = 0; c < takeable.length; c++) {
        var combo = takeable[c];
        var unitKey =
          declaredFamily === 'g1'
            ? asString(combo.playerId || combo.userId || combo.scorecardKey)
            : asString(combo.entityId || combo.scorecardKey);
        if (!unitKey) {
          return totFailClosed(
            viewLabel,
            'unattributed_unit',
            roundFailDebug(round, match, {
              failFn: declaredFamily === 'g1' ? 'isPlayerExpandUnit' : 'isComboExpandUnit',
              teamId: teamId
            })
          );
        }
        entityTrace.push({
          teamId: teamId,
          rawTeamId: rawTeamId,
          divisionId: asString(combo.teamGroupId) || teamId,
          groupId: asString(combo.groupId),
          entityId: asString(combo.entityId),
          playerId: asString(combo.playerId || combo.userId)
        });
        var entityKey = asString(combo.scorecardKey) || teamId + ':' + unitKey;
        var groupLabel =
          asString(combo.groupLabel) || resolveGroupLabelFromMatch(match, combo.groupId);
        var tagged = Object.assign({}, combo, {
          roundId: roundId,
          roundIndex: roundIndex,
          roundLabel: roundLabel,
          groupId: asString(combo.groupId),
          groupLabel: groupLabel,
          stationMatchId: asString(match.matchId) || matchId,
          matchId: asString(match.matchId) || matchId,
          occurrenceKey: roundId + ':' + entityKey,
          scorecardKey: roundId + ':' + entityKey,
          subLabel: standingsViewModel.formatTotRowSubLabel(roundLabel, groupLabel),
          isCounting: false
        });
        delete tagged.pos;
        mergeComboIntoTeamMap(
          mergedMap,
          teamId,
          teamNameById[teamId] || asString(team.teamName),
          tagged
        );
      }
    }
    roundTraces.push({
      roundId: roundId,
      stationMatchId: matchId,
      verify: { ok: true, reason: '' },
      filledGroups: filledGroups,
      teamGroups: teamGroups.length,
      groups: match && Array.isArray(match.groups) ? match.groups.length : 0,
      scoreEntityGroups: countObjectKeys(match && match.scoreEntities),
      pairingGroups: countObjectKeys(match && match.pairings),
      sharedProjectionLen: roundTeams.length,
      entities: entityTrace,
      stationFamily: stationFamily,
      stationKind: stationKind
    });
  }

  if (sawOtherStation && !sawFamilyStation) return totBypass();
  if (!declaredFamily && !sawFamilyStation) return totBypass();
  if (sawMatchId && !sawFamilyStation && declaredFamily) {
    return totFailClosed(viewLabel, 'missing_station', {
      failFn: 'projectSeriesTotG2G3TeamBoard',
      errors: roundTraces
    });
  }

  var globalM = Math.max(1, Math.floor(Number(series.scoringRule && series.scoringRule.globalM)) || 1);
  var syntheticTeamGroups = teamOrderIds.map(function (id) {
    return { id: id, name: teamNameById[id] || '' };
  });
  var syntheticMatch = {
    matchType: stationMatchType || (divisionSeries ? 'team-internal' : 'inter-team'),
    teamGroups: syntheticTeamGroups,
    scoringRules: {
      teamCompetition: { enabled: true, topN: globalM }
    }
  };
  var ranked = teamLeaderboardView.assembleGrossTeams(
    syntheticMatch,
    mergedMap,
    syntheticTeamGroups,
    { enabled: true, topN: globalM }
  );
  var rankedList = Array.isArray(ranked) ? ranked.slice() : [];
  var seenSide = {};
  for (var rs = 0; rs < rankedList.length; rs++) {
    seenSide[asString(rankedList[rs] && rankedList[rs].teamId)] = true;
  }
  for (var si = 0; si < teamOrderIds.length; si++) {
    var sideId = teamOrderIds[si];
    if (!sideId || seenSide[sideId]) continue;
    rankedList.push({
      teamId: sideId,
      teamName: teamNameById[sideId] || '',
      pos: '-',
      grossTotal: 0,
      toPar: 0,
      hasScore: false,
      scoreStr: '-',
      scoreClass: 'score-even',
      scoringPlayersCount: 0,
      players: [],
      grossTotalDisplay: teamLeaderboardView.formatGrossTotalDisplay(false, 0)
    });
  }
  var teamRows = rankedList.map(function (team) {
    var canonicalId = asString(team && team.teamId);
    var mapped = mapTeam(team, standingsViewModel.CUMULATIVE_KEY, '', null);
    var meta = sideMetaById[canonicalId] || {};
    if (meta.sourceTeamLogo) mapped.sourceTeamLogo = meta.sourceTeamLogo;
    if (meta.colorSnapshot) mapped.colorSnapshot = meta.colorSnapshot;
    var seriesPid = resolveSeriesParticipantId(series, mapped.teamId);
    mapped.teamId = seriesPid || mapped.teamId;
    mapped.seriesParticipantId = seriesPid || mapped.teamId;
    var part = findParticipant(series, mapped.seriesParticipantId);
    if (part) {
      if (!mapped.teamName) mapped.teamName = asString(part.nameSnapshot);
      if (!mapped.sourceTeamLogo) mapped.sourceTeamLogo = asString(part.logoSnapshot);
      if (!mapped.colorSnapshot) mapped.colorSnapshot = asString(part.colorSnapshot);
    }
    mapped.expandEmptyHint = mapped.players.length ? '' : '暂无累计成绩';
    mapped.expandStatusHint = '';
    return mapped;
  });
  teamRows = seriesStandingsExpandIdentity.stampTeamBoardDivisionAvatarMarks(
    teamRows,
    src.match || null,
    series
  );

  var successReason =
    declaredFamily === 'g1'
      ? 'tot_g1_division'
      : sawEntityG4 && !sawEntityG2G3
        ? 'tot_g4_global_m'
        : sawEntityG2G3 && !sawEntityG4
          ? 'tot_g2g3_global_m'
          : 'tot_entity_stroke';
  var totDebug = {
    ok: true,
    reason: successReason,
    family: declaredFamily,
    failFn: '',
    failRoundId: '',
    failStationMatchId: '',
    errors: roundTraces
  };
  logTotDebug(totDebug);
  return {
    useShared: true,
    reason: successReason,
    calledShared: true,
    verifiedOk: true,
    totDebug: totDebug,
    overlay: attachTotDebug(
      Object.assign({}, seriesPersonalLeaderboardAdapter.emptySharedPersonalBoardFields(), {
        boardView: 'team',
        selection: { view: 'team', scoreType: 'gross' },
        showTeamBoard: true,
        listRows: [],
        listEmptyText: teamRows.length ? '' : '暂无榜单数据',
        listEmptyTitle: teamRows.length ? '' : '暂无榜单数据',
        leaderboardViewLabel: viewLabel,
        headPlayerLabel: 'TEAM',
        teamRows: teamRows,
        mainBoardInvariant: false
      }),
      totDebug
    )
  };
}

module.exports = {
  projectSeriesStandingsTeamBoard: projectSeriesStandingsTeamBoard,
  applySeriesTotTeamBoardOverlay: applySeriesTotTeamBoardOverlay,
  guardTotOverlayAgainstStaleEmpty: guardTotOverlayAgainstStaleEmpty,
  headerSignature: headerSignature
};
