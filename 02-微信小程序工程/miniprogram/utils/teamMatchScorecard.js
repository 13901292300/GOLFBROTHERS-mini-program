/**
 * 队际/队内领先榜逐洞记分卡（只读投影）
 * - 权威语义对齐 detail._resolveTeamMatchScorecard
 * - 展示结构复用 publicScorecardView.buildStrokeScorecardFromScores
 * - 不写 storage；不改成绩
 */

var publicScorecardView = require('./publicScorecardView.js');
var holeLayout = require('./holeLayout.js');
var halfCourse = require('./halfCourse.js');
var strokeEntityValidator = require('./strokeEntityValidator.js');

function asString(v) {
  return v == null ? '' : String(v);
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

function isFilledScore(score) {
  return score !== null && score !== undefined && score !== '' && !Number.isNaN(Number(score));
}

function resolveSlotScorePlayerId(slotPlayer, currentPlayerId) {
  var p = slotPlayer || {};
  var scorePlayerId = p.scorePlayerId || p.slotScorePlayerId || p.scoreOwnerId;
  var resolved = scorePlayerId != null ? String(scorePlayerId).trim() : '';
  if (resolved) return resolved;
  return currentPlayerId != null ? String(currentPlayerId).trim() : '';
}

function resolveScoresByPlayerRecord(scoresByPlayer, slotPlayer, currentPlayerId) {
  if (!scoresByPlayer || typeof scoresByPlayer !== 'object') return null;
  var scorePlayerId = resolveSlotScorePlayerId(slotPlayer, currentPlayerId);
  if (scorePlayerId && scoresByPlayer[scorePlayerId]) return scoresByPlayer[scorePlayerId];
  var playerId = currentPlayerId != null ? String(currentPlayerId).trim() : '';
  if (playerId && scoresByPlayer[playerId]) return scoresByPlayer[playerId];
  return null;
}

function resolveGroupBucket(match, groupId) {
  var gid = asString(groupId).trim();
  if (!match || !gid) return null;
  var scoreData =
    match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? match.scoreData
      : null;
  if (!scoreData || !scoreData[gid] || typeof scoreData[gid] !== 'object') return null;
  return scoreData[gid];
}

function resolveEntityScoreRecord(match, groupId, entityId) {
  var bucket = resolveGroupBucket(match, groupId);
  if (!bucket) return { scores: [] };
  var teamScoresByEntity = Array.isArray(bucket.teamScoresByEntity)
    ? bucket.teamScoresByEntity
    : [];
  var eid = asString(entityId).trim();
  for (var i = 0; i < teamScoresByEntity.length; i++) {
    var rec = teamScoresByEntity[i];
    if (!rec || typeof rec !== 'object') continue;
    var teamId = rec.teamId != null ? String(rec.teamId).trim() : '';
    var recEntityId = rec.entityId != null ? String(rec.entityId).trim() : '';
    if ((teamId && teamId === eid) || (recEntityId && recEntityId === eid)) {
      return {
        scores: Array.isArray(rec.scores) ? rec.scores : [],
        putts: Array.isArray(rec.putts) ? rec.putts : undefined,
        fairways: Array.isArray(rec.fairways) ? rec.fairways : undefined,
        penalties: Array.isArray(rec.penalties) ? rec.penalties : undefined,
        sands: Array.isArray(rec.sands) ? rec.sands : undefined
      };
    }
  }
  return { scores: [] };
}

function resolvePlayerScoreRecord(match, groupId, row, playerId) {
  var bucket = resolveGroupBucket(match, groupId);
  if (!bucket) return null;
  var scoresByPlayer =
    bucket.scoresByPlayer && typeof bucket.scoresByPlayer === 'object'
      ? bucket.scoresByPlayer
      : null;
  return resolveScoresByPlayerRecord(scoresByPlayer, row, playerId);
}

/**
 * @param {object} match
 * @param {{
 *   groupId?: string,
 *   playerId?: string,
 *   entityId?: string,
 *   isEntity?: boolean,
 *   resultUnitType?: string,
 *   scorePlayerId?: string
 * }} row
 * @returns {{
 *   ok: boolean,
 *   kind: 'player'|'entity'|'pair'|'',
 *   started: boolean,
 *   scores: any[],
 *   reason?: string
 * }}
 */
function resolveTeamMatchScoreRecord(match, row) {
  var r = row && typeof row === 'object' ? row : {};
  var groupId = asString(r.groupId).trim();
  var entityId = asString(r.entityId).trim();
  var resultUnitType = asString(r.resultUnitType).trim();
  var isEntityRow =
    r.isEntity === true ||
    !!entityId ||
    resultUnitType === 'entity' ||
    resultUnitType === 'pair';

  if (isEntityRow) {
    if (!match || !groupId || !entityId) {
      return { ok: false, kind: '', started: false, scores: [], reason: 'missing_entity_identity' };
    }
    var entityRec = resolveEntityScoreRecord(match, groupId, entityId);
    var entityScores = Array.isArray(entityRec.scores) ? entityRec.scores : [];
    var entityStarted = entityScores.some(isFilledScore);
    return {
      ok: true,
      kind: resultUnitType === 'pair' ? 'pair' : 'entity',
      started: entityStarted,
      scores: entityScores,
      reason: entityStarted ? '' : 'not_started'
    };
  }

  var playerId = asString(r.playerId || r.userId || r.unitId).trim();
  if (!match || !groupId || !playerId) {
    return { ok: false, kind: '', started: false, scores: [], reason: 'missing_player_identity' };
  }
  var playerRec = resolvePlayerScoreRecord(match, groupId, r, playerId);
  var playerScores =
    playerRec && Array.isArray(playerRec.scores) ? playerRec.scores : [];
  var playerStarted = playerScores.some(isFilledScore);
  return {
    ok: true,
    kind: 'player',
    started: playerStarted,
    scores: playerScores,
    reason: playerStarted ? '' : 'not_started'
  };
}

function buildTeamMatchScorecardView(match, row, mode) {
  var resolved = resolveTeamMatchScoreRecord(match, row);
  if (!resolved.ok) {
    return { ok: false, scorecard: null, reason: resolved.reason || 'resolve_failed' };
  }
  if (!resolved.started) {
    return { ok: false, scorecard: null, reason: 'not_started' };
  }
  var scorecard = publicScorecardView.buildStrokeScorecardFromScores(
    resolved.scores,
    resolveMatchHolePars(match),
    mode === 'diff' ? 'diff' : 'gross'
  );
  if (!scorecard) {
    return { ok: false, scorecard: null, reason: 'build_failed' };
  }
  return {
    ok: true,
    scorecard: scorecard,
    kind: resolved.kind,
    reason: ''
  };
}

function hasOpenableTeamMatchScore(match, row) {
  var resolved = resolveTeamMatchScoreRecord(match, row);
  return !!(resolved.ok && resolved.started);
}

function buildScorecardCourseTitle(match) {
  var courseName = asString(match && match.courseName).trim();
  var front9Course = asString(match && match.front9Course).trim();
  var back9Course = asString(match && match.back9Course).trim();
  if (!courseName) return '';
  if (!front9Course || !back9Course) return courseName;
  return courseName + '（' + front9Course + '/' + back9Course + '）';
}

/**
 * 球员是否属于该轮正式分组（players / playersSlots）
 */
function isPlayerInFormalGroups(match, playerId) {
  var pid = asString(playerId).trim();
  if (!pid || !match) return false;
  var groups = Array.isArray(match.groups) ? match.groups : [];
  for (var g = 0; g < groups.length; g++) {
    var group = groups[g];
    var lists = [];
    if (Array.isArray(group && group.players)) lists.push(group.players);
    if (Array.isArray(group && group.playersSlots)) lists.push(group.playersSlots);
    for (var li = 0; li < lists.length; li++) {
      var list = lists[li];
      for (var i = 0; i < list.length; i++) {
        var seat = list[i];
        if (!seat || typeof seat !== 'object') continue;
        var sid =
          seat.playerId != null
            ? String(seat.playerId).trim()
            : seat.userId != null
              ? String(seat.userId).trim()
              : seat.id != null
                ? String(seat.id).trim()
                : '';
        if (sid && sid === pid) return true;
      }
    }
  }
  return false;
}

/**
 * Entity/pair 是否存在于 match.scoreEntities，且成员包含 playerId（若提供）
 */
function isEntityInMatch(match, groupId, entityId, playerId) {
  var gid = asString(groupId).trim();
  var eid = asString(entityId).trim();
  if (!match || !gid || !eid) return false;
  var scoreEntities =
    match.scoreEntities && typeof match.scoreEntities === 'object' && !Array.isArray(match.scoreEntities)
      ? match.scoreEntities
      : null;
  var list = scoreEntities && Array.isArray(scoreEntities[gid]) ? scoreEntities[gid] : [];
  var entity = null;
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (!e) continue;
    if (asString(e.entityId).trim() === eid) {
      entity = e;
      break;
    }
  }
  if (!entity) {
    // 无 entity 目录时，允许 teamScoresByEntity 命中（兼容旧数据）
    var rec = resolveEntityScoreRecord(match, gid, eid);
    return Array.isArray(rec.scores) && rec.scores.some(isFilledScore);
  }
  var pid = asString(playerId).trim();
  if (!pid) return true;
  var members = Array.isArray(entity.members) ? entity.members : [];
  for (var m = 0; m < members.length; m++) {
    var mid =
      members[m] == null
        ? ''
        : typeof members[m] === 'object'
          ? asString(members[m].userId || members[m].playerId || members[m].id).trim()
          : asString(members[m]).trim();
    if (mid && mid === pid) return true;
  }
  return false;
}

/** 分站是否已开赛（ongoing/live/finished/completed） */
function isStationStartedForScorecard(match) {
  if (!match) return false;
  var raw = asString(match.status).trim().toLowerCase();
  return (
    raw === 'ongoing' ||
    raw === 'live' ||
    raw === 'finished' ||
    raw === 'completed'
  );
}

function memberIdOf(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw).trim();
  return asString(raw.userId || raw.playerId || raw.id).trim();
}

/**
 * 在 scoreEntities 中按球员查找所属 entity/pair
 * @returns {{ entityId: string, entityType: string }|null}
 */
function findEntityIdForPlayer(match, groupId, playerId) {
  var gid = asString(groupId).trim();
  var pid = asString(playerId).trim();
  if (!match || !gid || !pid) return null;
  var scoreEntities =
    match.scoreEntities && typeof match.scoreEntities === 'object' && !Array.isArray(match.scoreEntities)
      ? match.scoreEntities
      : null;
  var list = scoreEntities && Array.isArray(scoreEntities[gid]) ? scoreEntities[gid] : [];
  for (var i = 0; i < list.length; i++) {
    var ent = list[i];
    if (!ent) continue;
    var members = Array.isArray(ent.members) ? ent.members : [];
    for (var j = 0; j < members.length; j++) {
      if (memberIdOf(members[j]) === pid) {
        return {
          entityId: asString(ent.entityId || ent.teamId || ent.id).trim(),
          entityType: asString(ent.entityType).trim()
        };
      }
    }
  }
  return null;
}

/**
 * G1→player；G2/G3→entity；G4→pair。点击球员始终保留 playerId 供主页。
 */
function resolveStrokeScoringRow(match, playerRow) {
  var src = playerRow && typeof playerRow === 'object' ? playerRow : {};
  var groupId = asString(src.groupId).trim();
  var playerId = asString(src.playerId || src.userId || (!src.isEntity ? src.unitId : '')).trim();
  var gameMode = strokeEntityValidator.resolveGameMode(match);
  var kind = strokeEntityValidator.resolveStrokeKind(gameMode);

  if (kind === 'g2g3' || kind === 'g4') {
    var found = findEntityIdForPlayer(match, groupId, playerId);
    var entityId =
      asString(src.entityId).trim() || (found && found.entityId ? found.entityId : '');
    var entityType =
      asString(src.resultUnitType).trim() ||
      (found && found.entityType ? found.entityType : '') ||
      (kind === 'g4' ? 'pair' : 'entity');
    var resultUnitType = entityType === 'pair' || kind === 'g4' ? 'pair' : 'entity';
    return {
      groupId: groupId,
      playerId: playerId,
      userId: playerId,
      entityId: entityId,
      isEntity: true,
      resultUnitType: resultUnitType,
      scorePlayerId: src.scorePlayerId || '',
      strokeKind: kind
    };
  }

  return {
    groupId: groupId,
    playerId: playerId,
    userId: playerId,
    entityId: '',
    isEntity: false,
    resultUnitType: 'player',
    scorePlayerId: src.scorePlayerId || '',
    strokeKind: kind || 'g1'
  };
}

/**
 * Series R 轮展开面板三态：
 * - teeing_off_soon → TEEING OFF SOON
 * - awaiting_score → AWAITING SCORE
 * - scorecard → 正常逐洞表
 */
function resolveStandingsExpandPanel(match, playerRow, mode) {
  var row = resolveStrokeScoringRow(match, playerRow);
  if (!isStationStartedForScorecard(match)) {
    return {
      state: 'teeing_off_soon',
      emptyLabel: 'TEEING OFF SOON',
      scorecard: null,
      row: row,
      kind: row.resultUnitType || ''
    };
  }

  // G2/G3/G4：无 entityId 时仍走组合通道，禁止回落个人杆数
  if (row.isEntity && !row.entityId) {
    return {
      state: 'awaiting_score',
      emptyLabel: 'AWAITING SCORE',
      scorecard: null,
      row: row,
      kind: row.resultUnitType || ''
    };
  }

  var resolved = resolveTeamMatchScoreRecord(match, row);
  if (!resolved.ok || !resolved.started) {
    return {
      state: 'awaiting_score',
      emptyLabel: 'AWAITING SCORE',
      scorecard: null,
      row: row,
      kind: row.resultUnitType || ''
    };
  }

  var built = buildTeamMatchScorecardView(match, row, mode);
  if (!built || !built.ok || !built.scorecard) {
    return {
      state: 'awaiting_score',
      emptyLabel: 'AWAITING SCORE',
      scorecard: null,
      row: row,
      kind: row.resultUnitType || ''
    };
  }

  return {
    state: 'scorecard',
    emptyLabel: '',
    scorecard: built.scorecard,
    row: row,
    kind: built.kind || row.resultUnitType || ''
  };
}

/**
 * 普通 LIVE 领先榜展开记分卡（对齐 detail._resolveTeamMatchScorecard）
 * - 无杆数仍返回空表（scorecardStatus=not_started），保证 openScorecard 为真、行内可展开
 * - 不改变 TOT 使用的 resolveStandingsExpandPanel / buildTeamMatchScorecardView(not_started→null)
 */
function buildLeaderboardExpandScorecard(match, row, mode) {
  var resolved = resolveTeamMatchScoreRecord(match, row);
  if (!resolved.ok) {
    return { ok: false, scorecard: null, reason: resolved.reason || 'resolve_failed', started: false };
  }
  var scorecard = publicScorecardView.buildStrokeScorecardFromScores(
    resolved.started ? resolved.scores : [],
    resolveMatchHolePars(match),
    mode === 'diff' ? 'diff' : 'gross'
  );
  if (!scorecard) {
    return { ok: false, scorecard: null, reason: 'build_failed', started: resolved.started };
  }
  return {
    ok: true,
    scorecard: scorecard,
    kind: resolved.kind,
    started: resolved.started,
    reason: resolved.started ? '' : 'not_started'
  };
}

module.exports = {
  isFilledScore: isFilledScore,
  resolveTeamMatchScoreRecord: resolveTeamMatchScoreRecord,
  buildTeamMatchScorecardView: buildTeamMatchScorecardView,
  hasOpenableTeamMatchScore: hasOpenableTeamMatchScore,
  buildScorecardCourseTitle: buildScorecardCourseTitle,
  isPlayerInFormalGroups: isPlayerInFormalGroups,
  isEntityInMatch: isEntityInMatch,
  isStationStartedForScorecard: isStationStartedForScorecard,
  findEntityIdForPlayer: findEntityIdForPlayer,
  resolveStrokeScoringRow: resolveStrokeScoringRow,
  resolveStandingsExpandPanel: resolveStandingsExpandPanel,
  buildLeaderboardExpandScorecard: buildLeaderboardExpandScorecard
};
