/**
 * Series global_m 总榜装配：标准化 entry → standingsResult（页面投影输入）
 * - 只读：不写 Series / match / storage
 * - global_m：computeGlobalTopM；per_round_n：computePerRoundTopN（各轮 round.topN）
 * - 其它 mode 仍返回 mode_not_global_m 空结构
 * - 成绩投影：仅已开始轮进入累计计算
 * - 阵容投影：合法 managed + 正式 groups（不要求已开赛）→ 供 R 轮展开
 */

var seriesScoring = require('./seriesScoring.js');
var seriesResultAdapter = require('./seriesResultAdapter.js');
var seriesStationMatch = require('../../../utils/seriesStationMatch.js');
var playerManage = require('../../../utils/playerManage.js');

function asString(v) {
  return v == null ? '' : String(v);
}

function emptyStandingsResult() {
  return { participantRows: [], roundMeta: {} };
}

/**
 * 分站是否已开始（可计入当前总榜）
 * ongoing/live + finished/completed → true
 * registering/scheduled/ready 等 → false
 */
function isStationStarted(match, stationStatusLabel) {
  if (!match) return false;
  var raw = asString(match.status).trim().toLowerCase();
  if (raw === 'ongoing' || raw === 'live') return true;
  if (raw === 'finished' || raw === 'completed') return true;
  var label = asString(stationStatusLabel).trim();
  if (label === 'LIVE' || label === '已结束') return true;
  return false;
}

function isRoundCancelled(round) {
  return asString(round && round.roundStatus).trim() === 'cancelled';
}

/**
 * 核验分站身份：managed + seriesId/roundId/publishToken + index 一致
 */
function verifyManagedStation(series, round, match, indexLink) {
  if (!series || !round || !match) {
    return { ok: false, reason: 'missing_payload' };
  }
  if (!seriesStationMatch.isSeriesManagedMatch(match)) {
    return { ok: false, reason: 'not_series_managed' };
  }
  var seriesId = asString(series.seriesId).trim();
  var publishToken = asString(series.publishToken).trim();
  var roundId = asString(round.roundId).trim();
  var matchId = asString(round.matchId || match.matchId).trim();
  var ctx = match.seriesContext || {};
  if (asString(ctx.seriesId).trim() !== seriesId) {
    return { ok: false, reason: 'context_series_id_conflict' };
  }
  if (asString(ctx.roundId).trim() !== roundId) {
    return { ok: false, reason: 'context_round_id_conflict' };
  }
  if (asString(ctx.publishToken).trim() !== publishToken) {
    return { ok: false, reason: 'context_publish_token_conflict' };
  }
  if (!matchId || asString(match.matchId).trim() !== matchId) {
    return { ok: false, reason: 'match_id_mismatch' };
  }
  if (!indexLink) {
    return { ok: false, reason: 'index_missing' };
  }
  if (
    asString(indexLink.seriesId).trim() !== seriesId ||
    asString(indexLink.roundId).trim() !== roundId
  ) {
    return { ok: false, reason: 'index_conflict' };
  }
  return { ok: true, reason: '' };
}

function collectParticipantIds(series) {
  var parts = Array.isArray(series && series.participants) ? series.participants : [];
  var out = [];
  var seen = Object.create(null);
  for (var i = 0; i < parts.length; i++) {
    var pid = asString(parts[i] && parts[i].seriesParticipantId).trim();
    if (!pid || seen[pid]) continue;
    seen[pid] = true;
    out.push(pid);
  }
  return out;
}

function sumFinite(values) {
  var sum = 0;
  var has = false;
  for (var i = 0; i < values.length; i++) {
    var n = Number(values[i]);
    if (!Number.isFinite(n)) continue;
    sum += n;
    has = true;
  }
  return has ? sum : null;
}

function projectDisplayEntry(entry, counting) {
  var e = entry || {};
  var disp = {
    entryId: asString(e.entryId).trim(),
    roundId: asString(e.roundId).trim(),
    roundIndex: e.roundIndex != null ? e.roundIndex : null,
    resultUnitType: asString(e.resultUnitType).trim() || 'player',
    unitId: asString(e.unitId || e.sourceEntityKey).trim(),
    unitName: asString(e.unitName).trim() || '计分单元',
    rankingValue: e.rankingValue != null ? e.rankingValue : null,
    grossTotalValue: e.grossTotalValue != null ? e.grossTotalValue : e.gross,
    toParValue: e.toParValue != null ? e.toParValue : e.toPar,
    resultStatus: asString(e.resultStatus).trim() || 'MISSING',
    thruLabel: asString(e.thruLabel).trim(),
    counting: counting,
    memberUserIds: Array.isArray(e.memberUserIds) ? e.memberUserIds.slice() : [],
    stationStarted: e.stationStarted === true,
    fromLineup: e.fromLineup === true
  };
  var gid = asString(e.groupId).trim();
  if (gid) disp.groupId = gid;
  var glabel = asString(e.groupLabel).trim();
  if (glabel) disp.groupLabel = glabel;
  var mid = asString(e.matchId).trim();
  if (mid) disp.matchId = mid;
  return disp;
}

function resolveSeatPlayerId(seat) {
  if (!seat || typeof seat !== 'object') return '';
  var id =
    seat.playerId != null
      ? seat.playerId
      : seat.userId != null
        ? seat.userId
        : seat.id;
  return id != null ? String(id).trim() : '';
}

function resolveSeatNickname(seat) {
  if (!seat || typeof seat !== 'object') return '';
  var keys = [
    'nickname',
    'displayName',
    'competitionName',
    'name',
    'nickName',
    'nameSnapshot'
  ];
  for (var i = 0; i < keys.length; i++) {
    var v = asString(seat[keys[i]]).trim();
    if (v) return v;
  }
  return '';
}

function buildRosterProfileMap(series) {
  var map = Object.create(null);
  var roster = Array.isArray(series && series.roster) ? series.roster : [];
  for (var i = 0; i < roster.length; i++) {
    var e = roster[i];
    if (!e || typeof e !== 'object') continue;
    var pid = asString(e.playerId || e.userId || e.id).trim();
    if (!pid || map[pid]) continue;
    map[pid] = {
      name:
        asString(e.competitionName).trim() ||
        asString(e.nickname).trim() ||
        asString(e.displayName).trim() ||
        asString(e.name).trim() ||
        asString(e.nameSnapshot).trim() ||
        '',
      avatar: asString(e.avatar || e.avatarUrl || e.headimgurl).trim(),
      gender: asString(e.gender).trim(),
      country: asString(e.country).trim(),
      age: e.age != null ? String(e.age).trim() : '',
      handicap: e.handicap != null ? e.handicap : e.jianghuHandicap,
      floatCoef: e.floatCoef != null ? e.floatCoef : e.floatingCoefficient
    };
  }
  return map;
}

function resolveSeatDisplayProfile(seat, playerId, rosterProfile) {
  var rp = rosterProfile || {};
  var name =
    resolveSeatNickname(seat) || asString(rp.name).trim() || playerId || '球员';
  var avatar =
    asString(seat && (seat.avatar || seat.avatarUrl || seat.headimgurl)).trim() ||
    asString(rp.avatar).trim() ||
    '';
  var fromSeat = playerManage.getGenderDisplay(seat || {});
  var genderDisplay = fromSeat.gender
    ? fromSeat
    : playerManage.getGenderDisplay(rp);
  var gender = genderDisplay.gender || '';
  var genderIcon = genderDisplay.icon || '';
  var genderClass = genderDisplay.className || '';
  var country = asString(seat && seat.country).trim() || asString(rp.country).trim();
  var age =
    seat && seat.age != null && String(seat.age).trim() !== ''
      ? String(seat.age).trim()
      : asString(rp.age).trim();
  var handicap =
    seat && seat.handicap != null
      ? seat.handicap
      : seat && seat.jianghuHandicap != null
        ? seat.jianghuHandicap
        : rp.handicap;
  var floatCoef =
    seat && seat.floatCoef != null
      ? seat.floatCoef
      : seat && seat.floatingCoefficient != null
        ? seat.floatingCoefficient
        : rp.floatCoef;
  var handicapText =
    handicap != null && handicap !== '' && Number.isFinite(Number(handicap))
      ? String(handicap)
      : '--';
  var floatCoefText =
    floatCoef != null && floatCoef !== '' && Number.isFinite(Number(floatCoef))
      ? String(floatCoef)
      : '--';
  return {
    name: name,
    avatar: avatar,
    gender: gender,
    genderIcon: genderIcon,
    genderClass: genderClass,
    country: country || '—',
    age: age || '—',
    handicapText: handicapText,
    floatCoefText: floatCoefText,
    badgeTeamId:
      asString(seat && (seat.matchTeamId || seat.affiliationId || seat.seriesParticipantId)).trim()
  };
}

function findProvisionalEntityForSeat(match, groupId, playerId) {
  try {
    var teamMatchScorecard = require('../../../utils/teamMatchScorecard.js');
    return teamMatchScorecard.findEntityIdForPlayer(match, groupId, playerId);
  } catch (e) {
    return null;
  }
}

function buildTeamGroupIdMap(match, participantMap) {
  var map = Object.create(null);
  var tgs = Array.isArray(match && match.teamGroups) ? match.teamGroups : [];
  for (var i = 0; i < tgs.length; i++) {
    var tg = tgs[i];
    if (!tg || typeof tg !== 'object') continue;
    var tid = asString(tg.id || tg.teamGroupId || tg.groupId).trim();
    if (!tid) continue;
    var resolved = resolveSeriesParticipantKey(tid, participantMap);
    if (resolved) map[tid] = resolved;
  }
  return map;
}

function resolveSeriesParticipantKey(teamKey, participantMap) {
  var key = asString(teamKey).trim();
  if (!key) return '';
  if (participantMap[key]) return participantMap[key];
  return '';
}

/**
 * 席位 → seriesParticipantId（不得默认第一支球队）
 */
function resolveSeatSeriesParticipantId(seat, playerId, participantMap, teamMap, teamGroupMap) {
  var sp = asString(seat && seat.seriesParticipantId).trim();
  if (sp && participantMap[sp]) return participantMap[sp];

  var aff =
    asString(seat && seat.matchTeamId).trim() ||
    asString(seat && seat.affiliationId).trim();
  if (aff) {
    var fromAff = resolveSeriesParticipantKey(aff, participantMap);
    if (fromAff) return fromAff;
    if (teamGroupMap[aff]) return teamGroupMap[aff];
  }

  var seatGroup = asString(seat && seat.groupId).trim();
  if (seatGroup) {
    var fromGroup = resolveSeriesParticipantKey(seatGroup, participantMap);
    if (fromGroup) return fromGroup;
    if (teamGroupMap[seatGroup]) return teamGroupMap[seatGroup];
  }

  var fromTeamMap =
    playerId && teamMap[playerId] != null ? asString(teamMap[playerId]).trim() : '';
  if (fromTeamMap) {
    var fromReg = resolveSeriesParticipantKey(fromTeamMap, participantMap);
    if (fromReg) return fromReg;
    if (teamGroupMap[fromTeamMap]) return teamGroupMap[fromTeamMap];
  }

  return '';
}

function listFilledSeatsFromMatch(match) {
  var out = [];
  var groups = Array.isArray(match && match.groups) ? match.groups : [];
  for (var g = 0; g < groups.length; g++) {
    var group = groups[g];
    if (!group) continue;
    var groupId = group.groupId != null ? asString(group.groupId).trim() : '';
    var lists = [];
    if (Array.isArray(group.players)) lists.push(group.players);
    if (Array.isArray(group.playersSlots)) lists.push(group.playersSlots);
    for (var li = 0; li < lists.length; li++) {
      var list = lists[li];
      for (var i = 0; i < list.length; i++) {
        var seat = list[i];
        var playerId = resolveSeatPlayerId(seat);
        if (!playerId) continue;
        out.push({
          seat: seat,
          playerId: playerId,
          groupId: groupId,
          groupLabel: asString(group.groupName).trim()
        });
      }
    }
  }
  return out;
}

/**
 * 阵容投影：正式 groups 席位 → 展示行（不要求开赛 / 成绩）
 * @returns {{
 *   seats: object[],
 *   hasFormalGroups: boolean,
 *   affiliationErrors: Array<{ playerId: string, reason: string }>
 * }}
 */
function extractRoundLineupFromStation(input) {
  var src = input && typeof input === 'object' ? input : {};
  var series = src.series && typeof src.series === 'object' ? src.series : null;
  var round = src.round && typeof src.round === 'object' ? src.round : null;
  var match = src.match && typeof src.match === 'object' ? src.match : null;
  if (!series || !round || !match) {
    return { seats: [], hasFormalGroups: false, affiliationErrors: [] };
  }

  var roundId = asString(round.roundId).trim();
  var matchId = asString(match.matchId || round.matchId).trim();
  var roundIndex =
    round.index != null && Number.isFinite(Number(round.index))
      ? Math.floor(Number(round.index))
      : null;
  var stationStarted = src.stationStarted === true;

  var participantMap = seriesResultAdapter.buildParticipantResolveMap(series);
  var teamMap = {};
  try {
    var strokeEntityValidator = require('../../../utils/strokeEntityValidator.js');
    teamMap = strokeEntityValidator.buildRegisterTeamMap(match) || {};
  } catch (eMap) {
    teamMap = {};
  }
  var teamGroupMap = buildTeamGroupIdMap(match, participantMap);
  var rosterProfiles = buildRosterProfileMap(series);

  var filled = listFilledSeatsFromMatch(match);
  var hasFormalGroups = filled.length > 0;
  var seats = [];
  var seenPlayer = Object.create(null);
  var affiliationErrors = [];

  for (var i = 0; i < filled.length; i++) {
    var item = filled[i];
    var playerId = item.playerId;
    if (seenPlayer[playerId]) continue;
    seenPlayer[playerId] = true;

    var seat = item.seat;
    var seriesParticipantId = resolveSeatSeriesParticipantId(
      seat,
      playerId,
      participantMap,
      teamMap,
      teamGroupMap
    );
    if (!seriesParticipantId) {
      affiliationErrors.push({ playerId: playerId, reason: 'missing_affiliation' });
      continue;
    }

    var groupId = asString(item.groupId).trim();
    var profile = resolveSeatDisplayProfile(seat, playerId, rosterProfiles[playerId]);
    var provisional = findProvisionalEntityForSeat(match, groupId, playerId);
    var provisionalEntityId = provisional && provisional.entityId ? provisional.entityId : '';
    var provisionalType =
      provisional && provisional.entityType === 'pair'
        ? 'pair'
        : provisionalEntityId
          ? 'entity'
          : 'player';

    seats.push({
      entryId: 'sre_lineup__' + matchId + '__player:' + playerId,
      roundId: roundId,
      roundIndex: roundIndex,
      matchId: matchId,
      groupId: groupId,
      groupLabel: asString(item.groupLabel).trim(),
      seriesParticipantId: seriesParticipantId,
      resultUnitType: provisionalType,
      unitId: playerId,
      playerId: playerId,
      userId: playerId,
      entityId: provisionalEntityId,
      isEntity: !!provisionalEntityId,
      unitName: profile.name,
      avatar: profile.avatar,
      gender: profile.gender,
      matchGender: asString(seat && seat.matchGender).trim(),
      genderIcon: profile.genderIcon,
      genderClass: profile.genderClass,
      country: profile.country,
      age: profile.age,
      handicapText: profile.handicapText,
      floatCoefText: profile.floatCoefText,
      badgeTeamId: profile.badgeTeamId || seriesParticipantId,
      rankingValue: null,
      grossTotalValue: null,
      toParValue: null,
      resultStatus: 'MISSING',
      thruLabel: '',
      counting: 'pending',
      memberUserIds: [playerId],
      stationStarted: stationStarted,
      fromLineup: true
    });
  }

  return {
    seats: seats,
    hasFormalGroups: hasFormalGroups,
    affiliationErrors: affiliationErrors
  };
}

function scoreKey(roundId, unitId) {
  return asString(roundId).trim() + '::' + asString(unitId).trim();
}

/**
 * 将成绩投影合并到阵容行（按 roundId + playerId/unitId）
 */
function mergeLineupWithScores(lineupSeats, scoredDisplayEntries) {
  var scoreByKey = Object.create(null);
  var scoreByMember = Object.create(null);
  var list = Array.isArray(scoredDisplayEntries) ? scoredDisplayEntries : [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (!e) continue;
    var rid = asString(e.roundId).trim();
    var uid = asString(e.unitId).trim();
    if (rid && uid) scoreByKey[scoreKey(rid, uid)] = e;
    var members = Array.isArray(e.memberUserIds) ? e.memberUserIds : [];
    for (var m = 0; m < members.length; m++) {
      var mid = asString(members[m]).trim();
      if (!mid) continue;
      var mk = scoreKey(rid, mid);
      if (!scoreByMember[mk]) scoreByMember[mk] = e;
    }
  }

  var out = [];
  var usedScoreIds = Object.create(null);
  var seats = Array.isArray(lineupSeats) ? lineupSeats : [];
  for (var s = 0; s < seats.length; s++) {
    var seat = seats[s];
    var sk = scoreKey(seat.roundId, seat.unitId);
    var scored = scoreByKey[sk] || scoreByMember[sk] || null;
    if (scored) {
      usedScoreIds[asString(scored.entryId).trim()] = true;
      var scoredType = asString(scored.resultUnitType).trim() || 'player';
      var isEntityScore = scoredType === 'entity' || scoredType === 'pair';
      out.push(
        Object.assign({}, seat, {
          entryId: scored.entryId || seat.entryId,
          rankingValue: scored.rankingValue,
          grossTotalValue: scored.grossTotalValue,
          toParValue: scored.toParValue,
          resultStatus: scored.resultStatus || 'OK',
          thruLabel: scored.thruLabel || '',
          counting: scored.counting || 'pending',
          // 名单行仍用席位球员名；记分卡按 entity/pair 语义打开
          resultUnitType: scoredType,
          unitName: asString(seat.unitName).trim() || asString(scored.unitName).trim() || seat.unitId,
          playerId: asString(seat.playerId || seat.unitId).trim(),
          entityId: isEntityScore ? asString(scored.unitId).trim() : '',
          isEntity: isEntityScore,
          memberUserIds: Array.isArray(scored.memberUserIds)
            ? scored.memberUserIds.slice()
            : seat.memberUserIds,
          stationStarted: true,
          fromLineup: true
        })
      );
    } else {
      out.push(
        Object.assign({}, seat, {
          counting: 'pending',
          resultStatus: 'MISSING',
          grossTotalValue: null,
          toParValue: null,
          rankingValue: null,
          thruLabel: '',
          playerId: asString(seat.playerId || seat.unitId).trim(),
          entityId: '',
          isEntity: false,
          fromLineup: true
        })
      );
    }
  }

  // 已开赛且有成绩、但不在正式席位中的 entry：保留在成绩 allEntries，不硬塞进阵容
  return out;
}

/**
 * @param {object} input
 * @param {object} input.series
 * @param {(id: string) => object|null} input.getMatchById
 * @param {(id: string) => object|null} input.getIndexByMatchId
 * @param {(match: object) => string} [input.resolveStationStatusLabel]
 * @returns {{
 *   standingsResult: { participantRows: object[], roundMeta: object },
 *   meta: object
 * }}
 */
function buildStandingsResult(input) {
  var src = input && typeof input === 'object' ? input : {};
  var series = src.series && typeof src.series === 'object' ? src.series : null;
  if (!series) {
    return {
      standingsResult: emptyStandingsResult(),
      meta: { error: 'missing_series', startedRoundCount: 0, stationErrors: [] }
    };
  }

  var mode = asString(series.scoringRule && series.scoringRule.mode).trim();
  if (mode !== 'global_m' && mode !== 'per_round_n') {
    return {
      standingsResult: emptyStandingsResult(),
      meta: { error: 'mode_not_global_m', startedRoundCount: 0, stationErrors: [] }
    };
  }

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
  var resolveStationStatusLabel =
    typeof src.resolveStationStatusLabel === 'function'
      ? src.resolveStationStatusLabel
      : function () {
          return '';
        };

  var rounds = Array.isArray(series.rounds) ? series.rounds : [];
  var stations = [];
  var stationErrors = [];
  var startedRoundMeta = [];
  var startedRoundIds = Object.create(null);
  var roundMeta = Object.create(null);
  var lineupByPid = Object.create(null);

  for (var i = 0; i < rounds.length; i++) {
    var round = rounds[i];
    if (!round) continue;
    var roundId = asString(round.roundId).trim();
    if (!roundId) continue;
    if (isRoundCancelled(round)) {
      roundMeta[roundId] = {
        hasFormalGroups: false,
        stationStarted: false,
        cancelled: true
      };
      continue;
    }

    var matchId = asString(round.matchId).trim();
    if (!matchId) {
      roundMeta[roundId] = {
        hasFormalGroups: false,
        stationStarted: false,
        cancelled: false
      };
      continue;
    }

    var match = null;
    var indexLink = null;
    try {
      match = getMatchById(matchId);
      indexLink = getIndexByMatchId(matchId);
    } catch (eRead) {
      stationErrors.push({ roundId: roundId, reason: 'read_error' });
      roundMeta[roundId] = {
        hasFormalGroups: false,
        stationStarted: false,
        cancelled: false
      };
      continue;
    }

    var verified = verifyManagedStation(series, round, match, indexLink);
    if (!verified.ok) {
      stationErrors.push({ roundId: roundId, reason: verified.reason });
      roundMeta[roundId] = {
        hasFormalGroups: false,
        stationStarted: false,
        cancelled: false
      };
      continue;
    }

    var statusLabel = '';
    try {
      statusLabel = resolveStationStatusLabel(match) || '';
    } catch (eLabel) {
      statusLabel = '';
    }

    var started = isStationStarted(match, statusLabel);

    // 阵容投影：不要求 isStationStarted
    var lineup = extractRoundLineupFromStation({
      series: series,
      round: round,
      match: match,
      stationStarted: started
    });
    roundMeta[roundId] = {
      hasFormalGroups: !!lineup.hasFormalGroups,
      stationStarted: started,
      cancelled: false
    };
    for (var ae = 0; ae < lineup.affiliationErrors.length; ae++) {
      stationErrors.push({
        roundId: roundId,
        reason: 'affiliation_error',
        playerId: lineup.affiliationErrors[ae].playerId
      });
    }
    for (var ls = 0; ls < lineup.seats.length; ls++) {
      var seatRow = lineup.seats[ls];
      var lpid = asString(seatRow.seriesParticipantId).trim();
      if (!lpid) continue;
      if (!lineupByPid[lpid]) lineupByPid[lpid] = [];
      lineupByPid[lpid].push(seatRow);
    }

    if (!started) {
      // 未开始：不进入成绩计算
      continue;
    }

    startedRoundIds[roundId] = true;
    startedRoundMeta.push({
      roundId: roundId,
      index:
        round.index != null && Number.isFinite(Number(round.index))
          ? Math.floor(Number(round.index))
          : i + 1,
      roundStatus: asString(round.roundStatus).trim() || 'scheduled',
      topN: round.topN
    });
    stations.push({ round: round, match: match });
  }

  var extracted = seriesResultAdapter.extractEntriesFromStations({
    series: series,
    stations: stations
  });
  for (var se = 0; se < extracted.stationErrors.length; se++) {
    stationErrors.push(extracted.stationErrors[se]);
  }

  // 仅保留已开始轮的 entry（防御）— 累计成绩绝不吃未开赛阵容
  var entries = (extracted.entries || []).filter(function (e) {
    return e && startedRoundIds[asString(e.roundId).trim()];
  });

  var rule = series.scoringRule || {};
  var globalM = Math.floor(Number(rule.globalM));
  var cfgBest = series.scoringConfig && Number(series.scoringConfig.bestOfRounds);
  if (Number.isFinite(cfgBest) && cfgBest >= 1) {
    globalM = Math.floor(cfgBest);
  }
  var allowRepeat = rule.allowRepeat === true;
  var participantIds = collectParticipantIds(series);

  // rounds 元数据：已开始轮 + 全部 cancelled（供 scoring 排除）
  var scoringRounds = startedRoundMeta.slice();
  for (var c = 0; c < rounds.length; c++) {
    var cr = rounds[c];
    if (!cr || !isRoundCancelled(cr)) continue;
    var cid = asString(cr.roundId).trim();
    if (!cid) continue;
    scoringRounds.push({
      roundId: cid,
      index:
        cr.index != null && Number.isFinite(Number(cr.index))
          ? Math.floor(Number(cr.index))
          : c + 1,
      roundStatus: 'cancelled'
    });
  }

  var topNByRoundId = Object.create(null);
  for (var tn = 0; tn < scoringRounds.length; tn++) {
    var tnr = scoringRounds[tn];
    if (!tnr || tnr.roundStatus === 'cancelled') continue;
    var tid = asString(tnr.roundId).trim();
    if (!tid || tnr.topN == null || tnr.topN === '') continue;
    topNByRoundId[tid] = tnr.topN;
  }

  var scored =
    mode === 'per_round_n'
      ? seriesScoring.computePerRoundTopN({
          entries: entries,
          rounds: scoringRounds,
          topNByRoundId: topNByRoundId,
          participantIds: participantIds
        })
      : seriesScoring.computeGlobalTopM({
          entries: entries,
          rounds: scoringRounds,
          globalM: globalM,
          allowRepeat: allowRepeat,
          participantIds: participantIds
        });

  var byPidEntries = Object.create(null);
  for (var ei = 0; ei < entries.length; ei++) {
    var ent = entries[ei];
    var epid = asString(ent && ent.seriesParticipantId).trim();
    if (!epid) continue;
    if (!byPidEntries[epid]) byPidEntries[epid] = [];
    byPidEntries[epid].push(ent);
  }

  var scoredById = Object.create(null);
  var scoredList = Array.isArray(scored.participants) ? scored.participants : [];
  for (var sp = 0; sp < scoredList.length; sp++) {
    var row = scoredList[sp];
    if (!row) continue;
    scoredById[asString(row.seriesParticipantId).trim()] = row;
  }

  // 主榜序：完整/不完整由 scoring 决定；再补未出现的配置球队（固定空结构）
  var order = [];
  var seenPid = Object.create(null);
  for (var so = 0; so < scoredList.length; so++) {
    var sid = asString(scoredList[so] && scoredList[so].seriesParticipantId).trim();
    if (!sid || seenPid[sid]) continue;
    seenPid[sid] = true;
    order.push(sid);
  }
  for (var pi = 0; pi < participantIds.length; pi++) {
    var cfgId = participantIds[pi];
    if (seenPid[cfgId]) continue;
    seenPid[cfgId] = true;
    order.push(cfgId);
  }

  var participantRows = [];
  for (var oi = 0; oi < order.length; oi++) {
    var pid = order[oi];
    var scoredRow = scoredById[pid] || null;
    var selected = scoredRow && Array.isArray(scoredRow.selectedEntries)
      ? scoredRow.selectedEntries
      : [];
    var selectedIds = Object.create(null);
    for (var si = 0; si < selected.length; si++) {
      var selId = asString(selected[si] && selected[si].entryId).trim();
      if (selId) selectedIds[selId] = true;
    }

    var allSrc = (byPidEntries[pid] || []).slice();
    // TOT 默认序：计入段优先由 VM 处理；此处按累计总杆稳定预排，便于保序
    allSrc.sort(function (a, b) {
      var ga = a.grossTotalValue != null ? Number(a.grossTotalValue) : Number(a.gross);
      var gb = b.grossTotalValue != null ? Number(b.grossTotalValue) : Number(b.gross);
      var aOk = Number.isFinite(ga);
      var bOk = Number.isFinite(gb);
      if (aOk && bOk && ga !== gb) return ga - gb;
      if (aOk && !bOk) return -1;
      if (!aOk && bOk) return 1;
      var ia = a.roundIndex != null ? Number(a.roundIndex) : Number.MAX_SAFE_INTEGER;
      var ib = b.roundIndex != null ? Number(b.roundIndex) : Number.MAX_SAFE_INTEGER;
      if (ia !== ib) return ia - ib;
      var ea = asString(a.entryId);
      var eb = asString(b.entryId);
      if (ea < eb) return -1;
      if (ea > eb) return 1;
      return 0;
    });

    var allEntries = [];
    for (var ai = 0; ai < allSrc.length; ai++) {
      var srcEntry = allSrc[ai];
      var eid = asString(srcEntry.entryId).trim();
      var counting = selectedIds[eid] ? 'counted' : 'excluded';
      var disp = projectDisplayEntry(srcEntry, counting);
      disp.stationStarted = true;
      disp.fromLineup = false;
      allEntries.push(disp);
    }

    var roundLineups = mergeLineupWithScores(lineupByPid[pid] || [], allEntries);

    var grossVals = [];
    var toParVals = [];
    for (var sv = 0; sv < selected.length; sv++) {
      var sEntry = selected[sv];
      grossVals.push(
        sEntry.grossTotalValue != null
          ? sEntry.grossTotalValue
          : sEntry.gross
      );
      toParVals.push(
        sEntry.toParValue != null ? sEntry.toParValue : sEntry.toPar
      );
    }

    participantRows.push({
      seriesParticipantId: pid,
      rank: scoredRow && scoredRow.rank != null ? scoredRow.rank : null,
      provisionalRank:
        scoredRow && scoredRow.provisionalRank != null ? scoredRow.provisionalRank : null,
      tieUnresolved: !!(scoredRow && scoredRow.tieUnresolved),
      rankDecision: scoredRow && scoredRow.rankDecision ? scoredRow.rankDecision : 'unset',
      isComplete: !!(scoredRow && scoredRow.isComplete),
      totalRankingValue:
        scoredRow && scoredRow.totalRankingValue != null ? scoredRow.totalRankingValue : null,
      selectedCount: scoredRow ? scoredRow.selectedCount || 0 : 0,
      incompleteRoundIds:
        scoredRow && Array.isArray(scoredRow.incompleteRoundIds)
          ? scoredRow.incompleteRoundIds.slice()
          : [],
      roundBreakdown:
        scoredRow && Array.isArray(scoredRow.roundBreakdown)
          ? scoredRow.roundBreakdown
          : [],
      grossTotalValue: sumFinite(grossVals),
      toParValue: sumFinite(toParVals),
      allEntries: allEntries,
      roundLineups: roundLineups
    });
  }

  return {
    standingsResult: { participantRows: participantRows, roundMeta: roundMeta },
    meta: {
      mode: mode,
      globalM: mode === 'global_m' ? globalM : undefined,
      allowRepeat: allowRepeat,
      startedRoundCount: startedRoundMeta.length,
      eligibleEntryCount: entries.length,
      stationErrors: stationErrors,
      scoringMeta: scored.meta || {},
      rosterSeatCount: Object.keys(lineupByPid).reduce(function (n, k) {
        return n + (lineupByPid[k] ? lineupByPid[k].length : 0);
      }, 0)
    }
  };
}

module.exports = {
  emptyStandingsResult: emptyStandingsResult,
  isStationStarted: isStationStarted,
  verifyManagedStation: verifyManagedStation,
  extractRoundLineupFromStation: extractRoundLineupFromStation,
  mergeLineupWithScores: mergeLineupWithScores,
  buildStandingsResult: buildStandingsResult
};
