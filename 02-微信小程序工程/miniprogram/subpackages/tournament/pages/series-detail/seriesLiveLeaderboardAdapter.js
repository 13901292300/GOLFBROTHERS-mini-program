/**
 * Series Rn LIVE 领先榜：核验分站后直接调用共享 liveLeaderboardBoard。
 * 不 remap 展示字段、不走 TOT、不写 Series / match / storage。
 */

var liveLeaderboardBoard = require('../../../../utils/liveLeaderboardBoard.js');
var leaderboardSettingViewModel = require('../../../../utils/leaderboardSettingViewModel.js');
var seriesStandingsAssembler = require('../../../../utils/seriesStandingsAssembler.js');
var seriesResultAdapter = require('../../../../utils/seriesResultAdapter.js');
var teamLeaderboardHost = require('../../../../utils/teamLeaderboardHost.js');
var standingsViewModel = require('./seriesStandingsViewModel.js');
var seriesPersonalLeaderboardAdapter = require('./seriesPersonalLeaderboardAdapter.js');
var seriesStandingsExpandIdentity = require('../../../../utils/seriesStandingsExpandIdentity.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function packLiveOverlay(state, extra) {
  var sharedEmpty = seriesPersonalLeaderboardAdapter.emptySharedPersonalBoardFields();
  var view = (state && state.view) || 'all';
  var scoreType = state && state.scoreType === 'net' ? 'net' : 'gross';
  return Object.assign({}, sharedEmpty, extra || {}, {
    useLiveLeaderboard: true,
    showTeamBoard: false,
    showSharedPersonalBoard: false,
    showEntityAllBoard: false,
    listRows: [],
    listEmptyText: '',
    boardView: view,
    selection: { view: view, scoreType: scoreType },
    leaderboardViewLabel: (state && state.viewLabel) || '',
    liveView: view,
    liveScoreType: scoreType,
    liveTeamLeaderboard: (state && state.teamLeaderboard) || [],
    liveLeaderboard: (state && state.leaderboard) || [],
    showLeaderboardTeamColumn: !!(state && state.showLeaderboardTeamColumn),
    liveTeamGroupLogoById: (state && state.teamGroupLogoById) || {},
    liveAvatarBadge: (state && state.avatarBadge) || 'auto',
    liveMetaMode: (state && state.metaMode) || 'countryAge',
    liveShowExpandGender: !!(state && state.showExpandGender),
    liveEmptyText: (extra && extra.liveEmptyText) || (state && state.emptyText) || '',
    liveMatchId: (state && state.matchId) || '',
    liveScorePanel: 'technical',
    personalLeaderboard: (state && state.leaderboard) || []
  });
}

function projectSeriesRnLiveLeaderboard(input) {
  var src = input && typeof input === 'object' ? input : {};
  var selectedKey = asString(src.selectedKey) || standingsViewModel.CUMULATIVE_KEY;
  var rawSel = src.selection && typeof src.selection === 'object' ? src.selection : {};
  var match = src.match && typeof src.match === 'object' ? src.match : null;
  var sel = leaderboardSettingViewModel.normalizeLeaderboardSelection(match, rawSel);
  var view = sel.view;
  var scoreType = sel.scoreType;

  if (selectedKey === standingsViewModel.CUMULATIVE_KEY) {
    return {
      useLive: false,
      reason: 'tot',
      calledShared: false,
      verifiedOk: true,
      overlay: seriesPersonalLeaderboardAdapter.emptySharedPersonalBoardFields()
    };
  }

  var verified = seriesStandingsAssembler.verifyManagedStation(
    src.series,
    src.round,
    match,
    src.indexLink
  );
  if (!verified || !verified.ok) {
    var failState = liveLeaderboardBoard.emptyState(view, scoreType, '', '本轮比赛数据异常');
    return {
      useLive: true,
      reason: 'managed_fail',
      calledShared: false,
      verifiedOk: false,
      overlay: packLiveOverlay(failState, { liveEmptyText: '本轮比赛数据异常' })
    };
  }

  var host = teamLeaderboardHost.createStandaloneHost({
    viewerRemarkCtx: src.viewerRemarkCtx
  });
  var state = liveLeaderboardBoard.buildLiveLeaderboardState(match, {
    view: view,
    scoreType: scoreType,
    openIndex: src.openIndex,
    host: host,
    viewerRemarkCtx: src.viewerRemarkCtx
  });
  var overlay = packLiveOverlay(state);
  if (seriesStandingsExpandIdentity.isDivisionSeriesStandings(src.series)) {
    overlay = Object.assign({}, overlay, {
      liveAvatarBadge: 'team',
      liveTeamGroupLogoById: seriesStandingsExpandIdentity.buildStandingsTeamGroupLogoById(
        match,
        src.series
      ),
      liveTeamLeaderboard: seriesStandingsExpandIdentity.stampTeamBoardDivisionAvatarMarks(
        overlay.liveTeamLeaderboard,
        match,
        src.series
      ),
      liveLeaderboard: (overlay.liveLeaderboard || []).map(function (row) {
        return seriesStandingsExpandIdentity.stampPlayerDivisionAvatarMark(
          row,
          match,
          src.series
        );
      })
    });
  }
  return {
    useLive: true,
    reason: 'shared',
    calledShared: true,
    verifiedOk: true,
    overlay: overlay
  };
}

function collectMemberUserIds(player) {
  var src = player && typeof player === 'object' ? player : {};
  if (Array.isArray(src.memberUserIds) && src.memberUserIds.length) {
    var copied = [];
    for (var i = 0; i < src.memberUserIds.length; i++) {
      var id = asString(src.memberUserIds[i]);
      if (id) copied.push(id);
    }
    return copied;
  }
  var members = Array.isArray(src.members)
    ? src.members
    : Array.isArray(src.pairMembers)
      ? src.pairMembers
      : [];
  var out = [];
  var seen = Object.create(null);
  for (var m = 0; m < members.length; m++) {
    var mem = members[m];
    var mid = asString(mem && (mem.userId || mem.playerId || mem.id));
    if (!mid || seen[mid]) continue;
    seen[mid] = true;
    out.push(mid);
  }
  return out;
}

function stampExpandPlayer(player, roundId, matchId) {
  var row = player && typeof player === 'object' ? Object.assign({}, player) : {};
  var rid = asString(roundId) || asString(row.roundId);
  var mid = asString(matchId) || asString(row.stationMatchId) || asString(row.matchId);
  var entityId = asString(row.entityId);
  var kind = asString(row.kind);
  var resultUnitType = asString(row.resultUnitType);
  if (!resultUnitType) {
    if (kind === 'pair') resultUnitType = 'pair';
    else if (row.isEntity === true || kind === 'team') resultUnitType = 'entity';
    else resultUnitType = 'player';
  }
  var isEntity =
    row.isEntity === true || resultUnitType === 'entity' || resultUnitType === 'pair';
  var memberUserIds = collectMemberUserIds(row);
  var playerId = isEntity ? '' : asString(row.playerId || row.userId);
  var scorecardKey =
    asString(row.scorecardKey) || rid + ':' + (entityId || playerId || asString(row.name));
  return Object.assign({}, row, {
    roundId: rid,
    matchId: mid,
    stationMatchId: mid,
    entityId: entityId,
    isEntity: isEntity,
    resultUnitType: resultUnitType,
    memberUserIds: memberUserIds,
    playerId: playerId,
    userId: isEntity ? asString(row.userId) : playerId || asString(row.userId),
    canOpenScorecard: !!rid && (!!entityId || !!playerId),
    occurrenceKey: asString(row.occurrenceKey) || rid + ':' + (entityId || playerId || scorecardKey),
    scorecardKey: scorecardKey
  });
}

function preparePerRoundLiveExpandTeams(liveTeamRows, opts) {
  var o = opts && typeof opts === 'object' ? opts : {};
  var map =
    typeof seriesResultAdapter.buildParticipantResolveMap === 'function'
      ? seriesResultAdapter.buildParticipantResolveMap(o.series)
      : {};
  var roundId = asString(o.roundId);
  var matchId = asString(o.matchId);
  var started = seriesStandingsAssembler.isStationStarted(o.match);
  var list = Array.isArray(liveTeamRows) ? liveTeamRows : [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var src = list[i];
    if (!src || typeof src !== 'object') continue;
    var liveId = asString(src.teamId);
    var pid = (liveId && map[liveId]) || asString(src.seriesParticipantId) || liveId;
    var players = Array.isArray(src.players) ? src.players : [];
    var stamped = [];
    for (var p = 0; p < players.length; p++) {
      stamped.push(stampExpandPlayer(players[p], roundId, matchId));
    }
    out.push({
      teamId: pid,
      seriesParticipantId: pid,
      players: stamped,
      scoringPlayersCount: src.scoringPlayersCount == null ? 0 : src.scoringPlayersCount,
      expandEmptyHint: stamped.length
        ? ''
        : asString(src.expandEmptyHint) || '本轮暂无该队球员',
      expandStatusHint:
        asString(src.expandStatusHint) || (!started && stamped.length ? 'TEEING OFF SOON' : '')
    });
  }
  return out;
}

function indexLiveExpandTeams(liveTeamRows) {
  var map = Object.create(null);
  var list = Array.isArray(liveTeamRows) ? liveTeamRows : [];
  for (var i = 0; i < list.length; i++) {
    var t = list[i];
    if (!t || typeof t !== 'object') continue;
    var a = asString(t.seriesParticipantId);
    var b = asString(t.teamId);
    if (a && !map[a]) map[a] = t;
    if (b && !map[b]) map[b] = t;
  }
  return map;
}

/**
 * 只替换展开字段。不重排主卡，不覆盖 POS/TOTAL/Rx。
 * 按稳定 ID 对齐；找不到共享球队时保持空态，不串队。
 */
function mergePerRoundExpandProjection(baseTeamRows, liveTeamRows) {
  var base = Array.isArray(baseTeamRows) ? baseTeamRows : [];
  var liveMap = indexLiveExpandTeams(liveTeamRows);
  var out = [];
  for (var i = 0; i < base.length; i++) {
    var row = base[i] && typeof base[i] === 'object' ? base[i] : {};
    var pid = asString(row.seriesParticipantId) || asString(row.teamId);
    var live = pid ? liveMap[pid] : null;
    if (!live) {
      out.push(
        Object.assign({}, row, {
          players: [],
          scoringPlayersCount: 0,
          expandStatusHint: '',
          expandEmptyHint: asString(row.expandEmptyHint) || '本轮暂无该队球员'
        })
      );
      continue;
    }
    var players = Array.isArray(live.players) ? live.players.slice() : [];
    out.push(
      Object.assign({}, row, {
        players: players,
        scoringPlayersCount: live.scoringPlayersCount == null ? 0 : live.scoringPlayersCount,
        expandEmptyHint: players.length
          ? ''
          : asString(live.expandEmptyHint) || asString(row.expandEmptyHint) || '本轮暂无该队球员',
        expandStatusHint: asString(live.expandStatusHint)
      })
    );
  }
  return out;
}

function applyPerRoundExpandFromLive(baseTeamRows, liveProjected, opts) {
  var live = liveProjected && typeof liveProjected === 'object' ? liveProjected : {};
  if (!live.verifiedOk || !live.calledShared) {
    return mergePerRoundExpandProjection(baseTeamRows, []);
  }
  var overlay = live.overlay && typeof live.overlay === 'object' ? live.overlay : {};
  var rawTeams = Array.isArray(overlay.teamRows)
    ? overlay.teamRows
    : Array.isArray(overlay.liveTeamLeaderboard)
      ? overlay.liveTeamLeaderboard
      : [];
  var prepared = preparePerRoundLiveExpandTeams(rawTeams, opts);
  return mergePerRoundExpandProjection(baseTeamRows, prepared);
}

/**
 * per_round_n：球队视图保留累计主卡；查看全部复用当前 Rx 共享 LIVE 全量计分单元榜。
 * 不截断 Top N，不改写累计 teamRows 顺序。
 */
function applyPerRoundNStandingsOverlay(vm, selection, liveProjected, opts) {
  var base = vm && typeof vm === 'object' ? vm : {};
  var sel = selection && typeof selection === 'object' ? selection : {};
  var view = asString(sel.view) || 'team';
  var o = opts && typeof opts === 'object' ? opts : {};
  var sharedEmpty = seriesPersonalLeaderboardAdapter.emptySharedPersonalBoardFields();
  var baseRows = Array.isArray(base.teamRows) ? base.teamRows : [];
  if (view !== 'team') {
    var overlay = (liveProjected && liveProjected.overlay) || {};
    return Object.assign({}, base, sharedEmpty, overlay, {
      roundHeadline:
        o.roundHeadline != null && String(o.roundHeadline).trim()
          ? String(o.roundHeadline).trim()
          : base.roundHeadline,
      useLiveLeaderboard: true,
      teamRows: baseRows.slice(),
      // 查看全部：保留单场 LIVE 顶部文案，不用 Series 赛制覆盖
      leaderboardViewLabel: asString(overlay.leaderboardViewLabel)
    });
  }
  var merged = applyPerRoundExpandFromLive(baseRows, liveProjected, {
    series: o.series,
    roundId: o.roundId,
    matchId: o.matchId,
    match: o.match
  });
  return Object.assign({}, base, sharedEmpty, {
    teamRows: merged,
    useLiveLeaderboard: false,
    showTeamBoard: true,
    leaderboardViewLabel: asString(base.leaderboardViewLabel)
  });
}

/**
 * global_m 单轮 LIVE 榜：球队视图用当前轮赛制名；查看全部保留 LIVE 顶部文案。
 * 不改写 overlay 成绩行 / 展开 / 记分卡字段。
 */
function applyGlobalMRnStandingsOverlay(vm, selection, liveProjected, opts) {
  var base = vm && typeof vm === 'object' ? vm : {};
  var sel = selection && typeof selection === 'object' ? selection : {};
  var view = asString(sel.view) || 'team';
  var o = opts && typeof opts === 'object' ? opts : {};
  var overlay = (liveProjected && liveProjected.overlay) || {};
  var sharedEmpty = seriesPersonalLeaderboardAdapter.emptySharedPersonalBoardFields();
  var merged = Object.assign({}, base, sharedEmpty, overlay, {
    roundHeadline:
      o.roundHeadline != null && String(o.roundHeadline).trim()
        ? String(o.roundHeadline).trim()
        : base.roundHeadline,
    useLiveLeaderboard: true
  });
  if (view === 'team') {
    merged.leaderboardViewLabel = asString(
      o.teamViewLabel != null && String(o.teamViewLabel).trim() !== ''
        ? o.teamViewLabel
        : base.leaderboardViewLabel
    );
  } else {
    merged.leaderboardViewLabel = asString(overlay.leaderboardViewLabel);
  }
  return merged;
}

module.exports = {
  projectSeriesRnLiveLeaderboard: projectSeriesRnLiveLeaderboard,
  packLiveOverlay: packLiveOverlay,
  mergePerRoundExpandProjection: mergePerRoundExpandProjection,
  preparePerRoundLiveExpandTeams: preparePerRoundLiveExpandTeams,
  applyPerRoundExpandFromLive: applyPerRoundExpandFromLive,
  applyPerRoundNStandingsOverlay: applyPerRoundNStandingsOverlay,
  applyGlobalMRnStandingsOverlay: applyGlobalMRnStandingsOverlay
};
