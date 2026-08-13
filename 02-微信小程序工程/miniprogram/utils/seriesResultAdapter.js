/**
 * Series 分站真实成绩 → 标准化 SeriesResultEntry[]
 * - 只读：不修改 match / Series，不写 storage
 * - 仅抽取四种比杆：个人 / 四人四球 / 最佳球位 / 四人两球
 * - 至少一洞有效成绩才产出 entry；空洞不计 0；无成绩不计
 */

var seriesModel = require('./seriesModel.js');
var holeLayout = require('./holeLayout.js');
var halfCourse = require('./halfCourse.js');
var strokeEntityValidator = require('./strokeEntityValidator.js');

function asString(v) {
  return v == null ? '' : String(v);
}

function isFilledScore(score) {
  return score !== null && score !== undefined && score !== '' && !Number.isNaN(Number(score));
}

function resolvePlayerId(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw).trim();
  var id = raw.userId != null ? raw.userId : raw.playerId != null ? raw.playerId : raw.id;
  return id != null ? String(id).trim() : '';
}

function resolvePlayerNickname(raw) {
  if (!raw || typeof raw !== 'object') return '';
  var n =
    raw.nickname != null
      ? raw.nickname
      : raw.displayName != null
        ? raw.displayName
        : raw.name != null
          ? raw.name
          : '';
  return asString(n).trim();
}

function getMatchHolePars(match) {
  if (!match) return holeLayout.createDefaultLayout().holePars.slice();
  var parsed =
    !match.front9Course && !match.back9Course
      ? halfCourse.parseCourseHalfText(
          match.courseHalfText || match.courseHalf || match.halfText
        )
      : {};
  var layout = holeLayout.resolveLayoutFromContext({
    courseId: match.courseId || '',
    courseName: match.courseName || '',
    front9Course: match.front9Course || parsed.front9Course || null,
    back9Course: match.back9Course || parsed.back9Course || null
  });
  return (layout.holePars || []).slice();
}

function summarizeScores(scores, pars) {
  var list = Array.isArray(scores) ? scores : [];
  var parList = Array.isArray(pars) ? pars : [];
  var gross = 0;
  var parThru = 0;
  var thru = 0;
  var limit = Math.min(18, Math.max(list.length, parList.length, 18));
  for (var h = 0; h < limit; h++) {
    if (!isFilledScore(list[h])) continue;
    gross += Number(list[h]);
    parThru += Number(parList[h] || 0);
    thru += 1;
  }
  if (thru <= 0) {
    return { ok: false, gross: null, toPar: null, thru: 0 };
  }
  return {
    ok: true,
    gross: gross,
    toPar: gross - parThru,
    thru: thru
  };
}

function formatThruLabel(thru) {
  var n = Number(thru);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n >= 18 ? 'F' : String(Math.floor(n));
}

/**
 * teamGroupId / sourceTeamId / seriesParticipantId → seriesParticipantId
 */
function buildParticipantResolveMap(series) {
  var map = Object.create(null);
  var parts = Array.isArray(series && series.participants) ? series.participants : [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (!p || typeof p !== 'object') continue;
    var pid = asString(p.seriesParticipantId).trim();
    if (!pid) continue;
    map[pid] = pid;
    var sourceTeamId = asString(p.sourceTeamId).trim();
    if (sourceTeamId) {
      map[sourceTeamId] = pid;
      map['team:' + sourceTeamId] = pid;
    }
    var divisionId = asString(p.divisionId).trim();
    if (divisionId) {
      map[divisionId] = pid;
      map['division:' + divisionId] = pid;
    }
  }
  return map;
}

function resolveSeriesParticipantId(teamKey, participantMap) {
  var key = asString(teamKey).trim();
  if (!key) return '';
  if (participantMap[key]) return participantMap[key];
  return '';
}

function buildRegisterTeamMap(match) {
  return strokeEntityValidator.buildRegisterTeamMap(match) || {};
}

function buildPlayerLookup(match) {
  var map = Object.create(null);
  var groups = Array.isArray(match && match.groups) ? match.groups : [];
  for (var g = 0; g < groups.length; g++) {
    var players = Array.isArray(groups[g] && groups[g].players) ? groups[g].players : [];
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var id = resolvePlayerId(p);
      if (!id) continue;
      map[id] = p;
    }
  }
  var users =
    match && match.registerInfo && Array.isArray(match.registerInfo.users)
      ? match.registerInfo.users
      : [];
  for (var u = 0; u < users.length; u++) {
    var user = users[u];
    var uid = resolvePlayerId(user);
    if (!uid) continue;
    if (!map[uid]) map[uid] = user;
  }
  return map;
}

function resolveScoresByPlayerRecord(scoresByPlayer, player, playerId) {
  if (!scoresByPlayer || typeof scoresByPlayer !== 'object') return null;
  var scorePlayerId =
    player && player.scorePlayerId != null ? asString(player.scorePlayerId).trim() : '';
  if (scorePlayerId && scoresByPlayer[scorePlayerId]) return scoresByPlayer[scorePlayerId];
  var id = asString(playerId).trim();
  if (id && scoresByPlayer[id]) return scoresByPlayer[id];
  return null;
}

function buildPeoriaNetMap(match) {
  var map = Object.create(null);
  var list =
    match && match.peoriaResult && Array.isArray(match.peoriaResult.results)
      ? match.peoriaResult.results
      : [];
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    if (!item) continue;
    var id = resolvePlayerId(item);
    if (!id) continue;
    var net = item.net != null ? Number(item.net) : NaN;
    if (Number.isFinite(net)) map[id] = net;
  }
  return map;
}

function resolveUnitName(memberIds, playerLookup) {
  var names = [];
  for (var i = 0; i < memberIds.length; i++) {
    var id = memberIds[i];
    var nick = resolvePlayerNickname(playerLookup[id]) || id;
    if (nick) names.push(nick);
  }
  return names.join(' / ');
}

function stableEntryId(matchId, sourceEntityKey) {
  return 'sre__' + asString(matchId).trim() + '__' + asString(sourceEntityKey).trim();
}

function buildEntryBase(ctx, partial) {
  var scoreBasis = ctx.scoreBasis;
  var gross = partial.gross;
  var toPar = partial.toPar;
  var net = partial.net != null ? partial.net : null;
  var resolved = seriesModel.resolveRankingValue(
    { gross: gross, toPar: toPar, net: net },
    scoreBasis
  );
  if (!resolved.ok || resolved.rankingValue == null) {
    return null;
  }
  var thru = partial.thru;
  var entry = seriesModel.createResultEntry({
    entryId: stableEntryId(ctx.matchId, partial.sourceEntityKey),
    seriesId: ctx.seriesId,
    roundId: ctx.roundId,
    matchId: ctx.matchId,
    seriesParticipantId: partial.seriesParticipantId,
    resultUnitType: partial.resultUnitType,
    sourceEntityKey: partial.sourceEntityKey,
    memberUserIds: partial.memberUserIds,
    memberSnapshots: [],
    gross: gross,
    toPar: toPar,
    net: net,
    rankingValue: resolved.rankingValue,
    resultStatus: 'OK',
    sourceRevision: ctx.sourceRevision,
    extractedAt: ctx.extractedAt
  });
  // 展示辅助（assembler / VM 消费；不算分字段）
  entry.roundIndex = ctx.roundIndex;
  entry.unitId = partial.unitId;
  entry.unitName = partial.unitName;
  entry.thruLabel = formatThruLabel(thru);
  entry.thruValue = thru;
  entry.grossTotalValue = gross;
  entry.toParValue = toPar;
  return entry;
}

function extractG1Entries(ctx, match, participantMap, playerLookup, teamMap, pars, peoriaNet) {
  var out = [];
  var scoreData =
    match && match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? match.scoreData
      : {};
  var groups = Array.isArray(match && match.groups) ? match.groups : [];
  for (var g = 0; g < groups.length; g++) {
    var group = groups[g];
    var groupId = group && group.groupId != null ? asString(group.groupId).trim() : '';
    if (!groupId) continue;
    var bucket =
      scoreData[groupId] && typeof scoreData[groupId] === 'object' ? scoreData[groupId] : {};
    var scoresByPlayer =
      bucket.scoresByPlayer && typeof bucket.scoresByPlayer === 'object'
        ? bucket.scoresByPlayer
        : {};
    var players = Array.isArray(group.players) ? group.players : [];
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      var playerId = resolvePlayerId(player);
      if (!playerId) continue;
      var rec = resolveScoresByPlayerRecord(scoresByPlayer, player, playerId);
      var scores = rec && Array.isArray(rec.scores) ? rec.scores : [];
      var summary = summarizeScores(scores, pars);
      if (!summary.ok) continue;
      var teamKey = teamMap[playerId] || '';
      var seriesParticipantId = resolveSeriesParticipantId(teamKey, participantMap);
      if (!seriesParticipantId) continue;
      var net = summary.thru >= 18 && peoriaNet[playerId] != null ? peoriaNet[playerId] : null;
      var entry = buildEntryBase(ctx, {
        seriesParticipantId: seriesParticipantId,
        resultUnitType: 'player',
        sourceEntityKey: 'player:' + playerId,
        memberUserIds: [playerId],
        unitId: playerId,
        unitName: resolvePlayerNickname(playerLookup[playerId] || player) || playerId,
        gross: summary.gross,
        toPar: summary.toPar,
        net: net,
        thru: summary.thru
      });
      if (entry) out.push(entry);
    }
  }
  return out;
}

function extractEntityEntries(ctx, match, participantMap, playerLookup, teamMap, pars, kind) {
  var out = [];
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
  var groupIds = Object.keys(scoreEntities);
  for (var gi = 0; gi < groupIds.length; gi++) {
    var groupId = groupIds[gi];
    var entities = Array.isArray(scoreEntities[groupId]) ? scoreEntities[groupId] : [];
    if (!entities.length) continue;
    var bucket =
      scoreData[groupId] && typeof scoreData[groupId] === 'object' ? scoreData[groupId] : {};
    var teamScoresByEntity = Array.isArray(bucket.teamScoresByEntity)
      ? bucket.teamScoresByEntity
      : [];
    var scoreByEntityId = Object.create(null);
    for (var t = 0; t < teamScoresByEntity.length; t++) {
      var rec = teamScoresByEntity[t];
      if (!rec || typeof rec !== 'object') continue;
      var key =
        rec.teamId != null && asString(rec.teamId).trim() !== ''
          ? asString(rec.teamId).trim()
          : rec.entityId != null && asString(rec.entityId).trim() !== ''
            ? asString(rec.entityId).trim()
            : '';
      if (!key) continue;
      scoreByEntityId[key] = rec;
    }

    for (var ei = 0; ei < entities.length; ei++) {
      var entity = entities[ei];
      if (!entity) continue;
      var entityId = entity.entityId != null ? asString(entity.entityId).trim() : '';
      if (!entityId) continue;
      var rawMembers = Array.isArray(entity.members) ? entity.members : [];
      var memberIds = [];
      for (var m = 0; m < rawMembers.length; m++) {
        var mid = resolvePlayerId(rawMembers[m]);
        if (mid) memberIds.push(mid);
      }
      if (!memberIds.length) continue;

      var scoreRec = scoreByEntityId[entityId] || {};
      var summary = summarizeScores(scoreRec.scores, pars);
      if (!summary.ok) continue;

      var teamKey =
        entity.teamGroupId != null && asString(entity.teamGroupId).trim() !== ''
          ? asString(entity.teamGroupId).trim()
          : '';
      if (!teamKey) {
        for (var mi = 0; mi < memberIds.length; mi++) {
          if (teamMap[memberIds[mi]]) {
            teamKey = teamMap[memberIds[mi]];
            break;
          }
        }
      }
      var seriesParticipantId = resolveSeriesParticipantId(teamKey, participantMap);
      if (!seriesParticipantId) continue;

      var entityType = asString(entity.entityType).trim();
      var resultUnitType =
        kind === 'g4' || entityType === 'pair' ? 'pair' : 'entity';
      if (resultUnitType === 'pair' && memberIds.length < 2) continue;

      var entry = buildEntryBase(ctx, {
        seriesParticipantId: seriesParticipantId,
        resultUnitType: resultUnitType,
        sourceEntityKey: entityId,
        memberUserIds: memberIds,
        unitId: entityId,
        unitName: resolveUnitName(memberIds, playerLookup) || entityId,
        gross: summary.gross,
        toPar: summary.toPar,
        net: null,
        thru: summary.thru
      });
      if (entry) out.push(entry);
    }
  }
  return out;
}

/**
 * 从单个已核验分站抽取标准化结果
 * @param {{ series: object, round: object, match: object }} input
 * @returns {{ ok: boolean, entries: object[], reason?: string }}
 */
function extractEntriesFromStation(input) {
  var src = input && typeof input === 'object' ? input : {};
  var series = src.series && typeof src.series === 'object' ? src.series : null;
  var round = src.round && typeof src.round === 'object' ? src.round : null;
  var match = src.match && typeof src.match === 'object' ? src.match : null;
  if (!series || !round || !match) {
    return { ok: false, entries: [], reason: 'invalid_input' };
  }

  var seriesId = asString(series.seriesId).trim();
  var roundId = asString(round.roundId).trim();
  var matchId = asString(match.matchId || round.matchId).trim();
  if (!seriesId || !roundId || !matchId) {
    return { ok: false, entries: [], reason: 'missing_ids' };
  }

  var gameMode = asString(match.gameMode || match.selectedGameMode || round.gameMode).trim();
  var kind = strokeEntityValidator.resolveStrokeKind(gameMode);
  if (kind !== 'g1' && kind !== 'g2g3' && kind !== 'g4') {
    return { ok: false, entries: [], reason: 'unsupported_game_mode' };
  }

  var scoreBasis =
    series.scoringRule && series.scoringRule.scoreBasis
      ? asString(series.scoringRule.scoreBasis).trim()
      : 'gross';
  if (!seriesModel.SCORE_BASIS[scoreBasis]) scoreBasis = 'gross';

  var roundIndex =
    round.index != null && Number.isFinite(Number(round.index))
      ? Math.floor(Number(round.index))
      : null;

  var ctx = {
    seriesId: seriesId,
    roundId: roundId,
    matchId: matchId,
    roundIndex: roundIndex,
    scoreBasis: scoreBasis,
    sourceRevision: asString(
      match.updatedAt != null
        ? match.updatedAt
        : match.status != null
          ? match.status
          : ''
    ).trim(),
    extractedAt: new Date().toISOString()
  };

  var participantMap = buildParticipantResolveMap(series);
  var playerLookup = buildPlayerLookup(match);
  var teamMap = buildRegisterTeamMap(match);
  var pars = getMatchHolePars(match);
  var peoriaNet = buildPeoriaNetMap(match);

  var entries = [];
  try {
    if (kind === 'g1') {
      entries = extractG1Entries(
        ctx,
        match,
        participantMap,
        playerLookup,
        teamMap,
        pars,
        peoriaNet
      );
    } else {
      entries = extractEntityEntries(
        ctx,
        match,
        participantMap,
        playerLookup,
        teamMap,
        pars,
        kind
      );
    }
  } catch (e) {
    return { ok: false, entries: [], reason: 'extract_error' };
  }

  return { ok: true, entries: entries, reason: '' };
}

/**
 * 批量抽取（单站失败不影响其它站）
 * @param {{ series: object, stations: Array<{ round: object, match: object }> }} input
 * @returns {{ entries: object[], stationErrors: Array<{ roundId: string, reason: string }> }}
 */
function extractEntriesFromStations(input) {
  var src = input && typeof input === 'object' ? input : {};
  var series = src.series;
  var stations = Array.isArray(src.stations) ? src.stations : [];
  var entries = [];
  var stationErrors = [];
  for (var i = 0; i < stations.length; i++) {
    var st = stations[i] || {};
    var roundId = asString(st.round && st.round.roundId).trim();
    try {
      var res = extractEntriesFromStation({
        series: series,
        round: st.round,
        match: st.match
      });
      if (!res.ok) {
        stationErrors.push({ roundId: roundId, reason: res.reason || 'extract_failed' });
        continue;
      }
      for (var e = 0; e < res.entries.length; e++) {
        entries.push(res.entries[e]);
      }
    } catch (err) {
      stationErrors.push({ roundId: roundId, reason: 'station_exception' });
    }
  }
  return { entries: entries, stationErrors: stationErrors };
}

module.exports = {
  isFilledScore: isFilledScore,
  summarizeScores: summarizeScores,
  formatThruLabel: formatThruLabel,
  buildParticipantResolveMap: buildParticipantResolveMap,
  extractEntriesFromStation: extractEntriesFromStation,
  extractEntriesFromStations: extractEntriesFromStations
};
