/**
 * 球员真实历史战绩统一适配器（P2A）。
 * 从 gameStore / teamMatchStore 投影轻量记录；禁止 MOCK_ROUNDS。
 * 页面只消费本模块 API，不直接遍历多 Store 计算。
 */

const gameStore = require('./gameStore.js');
const teamMatchStore = require('./teamMatchStore.js');
const matchStatus = require('./matchStatus.js');
const userIdentityAlias = require('./userIdentityAlias.js');
const playerIdentityGuard = require('./playerIdentityGuard.js');
const holeLayout = require('./holeLayout.js');
const gameLeaderboard = require('./gameLeaderboard.js');
const {
  resolveGameMode,
  resolveStrokeKind,
  listFilledPlayers,
  isMatchPlayBoardMode,
  isG5MatchPlayMode,
  buildRegisterTeamMap
} = require('./strokeEntityValidator.js');
const { buildMatchPlayResultSummary } = require('./matchPlayResult.js');

const PAGE_SIZE = 20;
const HISTORY_FILTERS = {
  ALL: 'all',
  PERSONAL_STROKE: 'personal_stroke',
  TEAM_STROKE: 'team_stroke',
  MATCH_PLAY: 'match_play'
};

function _trim(v) {
  return v == null ? '' : String(v).trim();
}

function _expandUserIdSet(userId) {
  const raw = playerIdentityGuard.normalizePlayerUserId(userId);
  const set = {};
  if (!raw) return set;
  const canon = userIdentityAlias.resolveCanonicalUserId(raw) || raw;
  set[raw] = true;
  set[canon] = true;
  try {
    const aliases = []
      .concat(userIdentityAlias.getAliases(raw) || [])
      .concat(userIdentityAlias.getAliases(canon) || []);
    aliases.forEach((a) => {
      if (!a) return;
      if (a.fromUserId) set[String(a.fromUserId).trim()] = true;
      if (a.toUserId) set[String(a.toUserId).trim()] = true;
    });
  } catch (e) { /* ignore */ }
  return set;
}

function _idInSet(id, idSet) {
  const n = _trim(id);
  if (!n || !idSet) return false;
  if (idSet[n]) return true;
  const canon = userIdentityAlias.resolveCanonicalUserId(n);
  return !!(canon && idSet[canon]);
}

function _slotUserId(slot) {
  if (slot == null) return '';
  if (typeof slot === 'string' || typeof slot === 'number') return _trim(slot);
  if (typeof slot !== 'object') return '';
  return _trim(slot.userId || slot.playerId || slot.id);
}

function _isCompletedGame(game) {
  return matchStatus.isGroupConfirmedFinished(game && game.status);
}

function _isCompletedMatch(match) {
  return matchStatus.isGroupConfirmedFinished(match && match.status);
}

function _pickSortTime(parts) {
  const keys = [
    'completedAt',
    'finishedAt',
    'finishedScoreAt',
    'teeTime',
    'createdAt',
    'updatedAt'
  ];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = parts && parts[k];
    if (v == null || v === '') continue;
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
    const t = Date.parse(String(v));
    if (Number.isFinite(t) && t > 0) return t;
  }
  return 0;
}

function _formatDateLabel(ms) {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return '日期缺失';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '日期缺失';
  const y = d.getFullYear();
  const m0 = d.getMonth() + 1;
  const day0 = d.getDate();
  const m = m0 < 10 ? '0' + m0 : String(m0);
  const day = day0 < 10 ? '0' + day0 : String(day0);
  return y + '.' + m + '.' + day;
}

function _formatToPar(diff) {
  if (diff == null || !Number.isFinite(diff)) return '';
  if (diff === 0) return 'E';
  return diff > 0 ? '+' + diff : String(diff);
}

function _countFilled(scores) {
  if (!Array.isArray(scores)) return 0;
  let n = 0;
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];
    if (s !== null && s !== undefined && s !== '') n += 1;
  }
  return n;
}

function _resolveHolePars(ctx) {
  try {
    if (typeof holeLayout.resolveLayoutFromContext === 'function') {
      const layout = holeLayout.resolveLayoutFromContext({
        courseId: (ctx && ctx.courseId) || '',
        courseName: (ctx && ctx.courseName) || '',
        front9Course: (ctx && ctx.front9Course) || null,
        back9Course: (ctx && ctx.back9Course) || null
      });
      if (layout && Array.isArray(layout.holePars)) return layout.holePars.slice();
    }
  } catch (e) { /* ignore */ }
  try {
    return (holeLayout.getLayout().holePars || []).slice();
  } catch (e2) {
    return [];
  }
}

function _toParFromScores(scores, pars) {
  if (!Array.isArray(scores) || !Array.isArray(pars)) return null;
  let diff = 0;
  let n = 0;
  const limit = Math.min(scores.length, pars.length, 18);
  for (let i = 0; i < limit; i++) {
    const s = scores[i];
    if (s === null || s === undefined || s === '') continue;
    const sn = Number(s);
    const pn = Number(pars[i]);
    if (!Number.isFinite(sn) || !Number.isFinite(pn)) continue;
    diff += sn - pn;
    n += 1;
  }
  return n > 0 ? diff : null;
}

function _rankRowsByTotal(rows) {
  const scored = (rows || []).filter((r) => r && r.grossScore != null && Number.isFinite(r.grossScore));
  scored.sort((a, b) => {
    if (a.grossScore !== b.grossScore) return a.grossScore - b.grossScore;
    const ta = a.toPar != null && Number.isFinite(a.toPar) ? a.toPar : 9999;
    const tb = b.toPar != null && Number.isFinite(b.toPar) ? b.toPar : 9999;
    return ta - tb;
  });
  const rankMap = {};
  scored.forEach((r, i) => {
    const first = scored.findIndex((x) => x.grossScore === r.grossScore);
    const tied = scored.filter((x) => x.grossScore === r.grossScore).length > 1;
    rankMap[r._key] = {
      rank: first + 1,
      rankLabel: tied ? 'T' + (first + 1) : String(first + 1)
    };
  });
  return rankMap;
}

function _emptyRecordBase() {
  return {
    recordId: '',
    matchId: '',
    sourceType: '',
    matchType: '',
    gameMode: '',
    matchName: '',
    courseName: '',
    playedAt: 0,
    completedAt: null,
    resultCategory: '',
    resultPrimary: '',
    resultSecondary: '',
    grossScore: null,
    toPar: null,
    rank: null,
    rankLabel: '',
    sideId: '',
    sideName: '',
    teamId: '',
    teamName: '',
    teamLogo: '',
    matchPlayResult: '',
    opponentLabel: '',
    status: 'completed',
    identitySource: '',
    snapshotName: '',
    dateLabel: '日期缺失',
    modeLabel: '',
    familyLabel: '',
    filterKey: HISTORY_FILTERS.PERSONAL_STROKE,
    navUrl: '',
    dateMissing: true,
    // P2B PK 样本字段
    matchKey: '',
    groupId: '',
    completedHoleCount: 0,
    requiredHoleCount: 0,
    scoreValid: false,
    scoreInvalidReason: ''
  };
}

/** 稳定比赛键：sourceType + ':' + matchId（跨 Store 防裸 id 碰撞） */
function buildMatchKey(sourceType, matchId) {
  const id = _trim(matchId);
  if (!id) return '';
  const src = _trim(sourceType);
  if (src === 'game') return 'game:' + id;
  if (src === 'team_match' || src === 'team-match') return 'team-match:' + id;
  return src ? src + ':' + id : id;
}

function _requiredHoleCount(ctx) {
  const pars = _resolveHolePars(ctx);
  if (Array.isArray(pars) && pars.length >= 9) return pars.length;
  return 18;
}

function _sumGrossAndHoles(scores) {
  let sum = 0;
  let holes = 0;
  let allNonNeg = true;
  if (!Array.isArray(scores)) {
    return { grossScore: null, completedHoleCount: 0, allNonNeg: false };
  }
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];
    if (s === null || s === undefined || s === '') continue;
    const n = Number(s);
    if (!Number.isFinite(n)) {
      allNonNeg = false;
      continue;
    }
    if (n < 0) allNonNeg = false;
    sum += n;
    holes += 1;
  }
  return {
    grossScore: holes > 0 ? sum : null,
    completedHoleCount: holes,
    allNonNeg: allNonNeg
  };
}

/**
 * 有效个人总杆：有限非负、洞数达标、无退赛/DQ 标记。
 * 无法证明完整性时 scoreValid=false。
 */
function evaluatePersonalStrokeValidity(input) {
  const src = input && typeof input === 'object' ? input : {};
  const required = Number(src.requiredHoleCount) || 0;
  const holes = Number(src.completedHoleCount) || 0;
  const gross = src.grossScore;
  const slot = src.slot || null;
  if (slot && typeof slot === 'object') {
    const st = _trim(slot.scoreStatus || slot.resultStatus || slot.status).toLowerCase();
    if (
      st === 'withdrawn' ||
      st === 'wd' ||
      st === 'dq' ||
      st === 'disqualified' ||
      st === 'invalid' ||
      st === 'retired' ||
      slot.withdrawn === true ||
      slot.disqualified === true ||
      slot.scoreInvalid === true
    ) {
      return { scoreValid: false, scoreInvalidReason: 'withdrawn_or_dq' };
    }
  }
  if (required <= 0) {
    return { scoreValid: false, scoreInvalidReason: 'required_holes_unknown' };
  }
  if (holes <= 0) {
    return { scoreValid: false, scoreInvalidReason: 'no_filled_holes' };
  }
  if (holes !== required) {
    return { scoreValid: false, scoreInvalidReason: 'incomplete_holes' };
  }
  if (gross == null || !Number.isFinite(Number(gross)) || Number(gross) < 0) {
    return { scoreValid: false, scoreInvalidReason: 'invalid_gross' };
  }
  return { scoreValid: true, scoreInvalidReason: '' };
}

/**
 * 隐私能力入口（本批默认本人/他人均可见；无设置 UI）。
 */
function resolvePlayerHistoryAccess(viewerUserId, targetUserId, profile) {
  const viewer = playerIdentityGuard.normalizePlayerUserId(viewerUserId);
  const target = playerIdentityGuard.normalizePlayerUserId(targetUserId);
  const isSelf =
    !!(viewer && target && userIdentityAlias.resolveCanonicalUserId(viewer) ===
      userIdentityAlias.resolveCanonicalUserId(target));
  // 预留：未来可根据 profile.historyPrivacy 关闭
  const privacy = profile && profile.historyPrivacy != null
    ? String(profile.historyPrivacy).trim()
    : '';
  if (privacy === 'private' && !isSelf) {
    return {
      canViewHistory: false,
      reason: 'target_private',
      isSelf: isSelf
    };
  }
  return {
    canViewHistory: true,
    reason: isSelf ? 'self' : 'default_public',
    isSelf: isSelf
  };
}

function _findGameParticipation(game, idSet) {
  const groups = gameStore.listGroups(game) || [];
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const slots = Array.isArray(g && g.playersSlots) ? g.playersSlots : [];
    for (let si = 0; si < slots.length; si++) {
      const uid = _slotUserId(slots[si]);
      if (_idInSet(uid, idSet)) {
        return {
          group: g,
          slot: slots[si],
          userId: uid,
          identitySource: 'slot'
        };
      }
    }
  }
  return null;
}

function _findMatchParticipation(match, idSet) {
  const groups = Array.isArray(match && match.groups) ? match.groups : [];
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const lists = [];
    if (Array.isArray(g && g.playersSlots)) lists.push(g.playersSlots);
    if (Array.isArray(g && g.players)) lists.push(g.players);
    for (let li = 0; li < lists.length; li++) {
      const arr = lists[li];
      for (let j = 0; j < arr.length; j++) {
        const uid = _slotUserId(arr[j]);
        if (_idInSet(uid, idSet)) {
          return {
            group: g,
            slot: arr[j],
            userId: uid,
            identitySource: 'slot'
          };
        }
      }
    }
  }

  // score entity members
  const entities =
    match && match.scoreEntities && typeof match.scoreEntities === 'object'
      ? match.scoreEntities
      : {};
  const eKeys = Object.keys(entities);
  for (let ei = 0; ei < eKeys.length; ei++) {
    const list = Array.isArray(entities[eKeys[ei]]) ? entities[eKeys[ei]] : [];
    for (let j = 0; j < list.length; j++) {
      const members = Array.isArray(list[j] && list[j].members) ? list[j].members : [];
      for (let mi = 0; mi < members.length; mi++) {
        const mid =
          typeof members[mi] === 'object'
            ? _slotUserId(members[mi])
            : _trim(members[mi]);
        if (_idInSet(mid, idSet)) {
          return {
            group: null,
            slot: null,
            userId: mid,
            identitySource: 'score_entity',
            entity: list[j],
            groupId: eKeys[ei]
          };
        }
      }
    }
  }

  // registration snapshot（仅当正式组/entity 未命中时）
  const users =
    match && match.registerInfo && Array.isArray(match.registerInfo.users)
      ? match.registerInfo.users
      : [];
  for (let ui = 0; ui < users.length; ui++) {
    const uid = _trim(users[ui] && users[ui].userId);
    if (_idInSet(uid, idSet)) {
      // 仅报名、无正式完赛身份 → 不纳入历史
      return null;
    }
  }
  return null;
}

function _resolveTeamSideMeta(match, userId) {
  const uid = _trim(userId);
  const teamMap = buildRegisterTeamMap(match) || {};
  const teamId = _trim(teamMap[uid]);
  const groups = Array.isArray(match && match.teamGroups) ? match.teamGroups : [];
  let tg = null;
  for (let i = 0; i < groups.length; i++) {
    if (_trim(groups[i] && groups[i].id) === teamId) {
      tg = groups[i];
      break;
    }
  }
  const name = tg
    ? _trim(tg.sourceTeamName || tg.name)
    : '';
  const logo = tg ? _trim(tg.sourceTeamLogo || tg.logo) : '';
  return {
    teamId: teamId,
    teamName: name,
    teamLogo: logo,
    sideId: teamId,
    sideName: _trim(tg && tg.name) || name
  };
}

function _projectGameRecord(game, part, idSet) {
  const gameId = _trim(game && game.gameId);
  if (!gameId || !part) return null;
  const base = _emptyRecordBase();
  const finishedAt = game.finishedAt || game.completedAt || null;
  const playedAt = _pickSortTime({
    completedAt: finishedAt,
    finishedAt: finishedAt,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt
  });
  let grossScore = null;
  let toPar = null;
  let rankInfo = null;
  const group = part.group;
  const scoresByPlayer = (group && group.scoresByPlayer) || {};
  const pid = _trim(part.userId);
  const scoreRec =
    scoresByPlayer[pid] ||
    scoresByPlayer[userIdentityAlias.resolveCanonicalUserId(pid)] ||
    {};
  const holeAgg = _sumGrossAndHoles(scoreRec.scores);
  const requiredHoleCount = _requiredHoleCount(game);
  const completedHoleCount = holeAgg.completedHoleCount;
  try {
    const board = gameLeaderboard.build(game);
    const rows = (board && board.leaderboard) || [];
    let myRow = null;
    for (let i = 0; i < rows.length; i++) {
      if (_idInSet(rows[i].playerId, idSet) || _idInSet(rows[i].rowId, idSet)) {
        myRow = rows[i];
        break;
      }
    }
    if (myRow && myRow.thru && myRow.thru !== '-') {
      if (myRow.total != null && Number.isFinite(Number(myRow.total))) {
        grossScore = Math.floor(Number(myRow.total));
      }
      if (myRow.diff != null && Number.isFinite(Number(myRow.diff))) {
        toPar = Number(myRow.diff);
      }
      if (myRow.pos && myRow.pos !== '-') {
        const pos = String(myRow.pos);
        const num = parseInt(pos.replace(/^T/, ''), 10);
        rankInfo = {
          rank: Number.isFinite(num) ? num : null,
          rankLabel: pos
        };
      }
    }
  } catch (e) {
    const pars = _resolveHolePars(game);
    if (holeAgg.grossScore != null) {
      grossScore = holeAgg.grossScore;
      toPar = _toParFromScores(scoreRec.scores, pars);
    }
  }
  if (grossScore == null && holeAgg.grossScore != null) {
    grossScore = holeAgg.grossScore;
  }
  const validity = evaluatePersonalStrokeValidity({
    grossScore: grossScore,
    completedHoleCount: completedHoleCount,
    requiredHoleCount: requiredHoleCount,
    slot: part.slot
  });

  const groups = gameStore.listGroups(game) || [];
  const navUrl =
    groups.length > 1
      ? '/subpackages/scoring/pages/hub/index?gameId=' + encodeURIComponent(gameId)
      : '/subpackages/scoring/pages/score/index?gameId=' +
        encodeURIComponent(gameId) +
        '&groupIndex=0';

  const primary =
    grossScore != null ? String(grossScore) + '杆' : '完赛';
  const secondaryParts = [];
  if (toPar != null) secondaryParts.push(_formatToPar(toPar));
  if (rankInfo && rankInfo.rankLabel) secondaryParts.push('第' + rankInfo.rankLabel + '名');
  else secondaryParts.push('--');

  const groupId = _trim(group && group.groupId);
  return Object.assign(base, {
    recordId: 'game:' + gameId,
    matchId: gameId,
    matchKey: buildMatchKey('game', gameId),
    sourceType: 'game',
    matchType: 'normal',
    gameMode: '个人比杆赛',
    matchName: _trim(game.roundName || game.name) || '普通球局',
    courseName: _trim(game.courseName),
    playedAt: playedAt,
    completedAt: finishedAt != null ? Number(finishedAt) || null : null,
    resultCategory: 'personal_stroke',
    resultPrimary: primary,
    resultSecondary: secondaryParts.filter(Boolean).join(' · ') || '--',
    grossScore: grossScore,
    toPar: toPar,
    rank: rankInfo ? rankInfo.rank : null,
    rankLabel: rankInfo ? rankInfo.rankLabel : '',
    status: 'completed',
    identitySource: part.identitySource || 'slot',
    snapshotName: _trim(part.slot && (part.slot.name || part.slot.nickname)),
    dateLabel: _formatDateLabel(playedAt),
    modeLabel: '个人比杆',
    familyLabel: '普通球局',
    filterKey: HISTORY_FILTERS.PERSONAL_STROKE,
    navUrl: navUrl,
    dateMissing: !(playedAt > 0),
    groupId: groupId,
    completedHoleCount: completedHoleCount,
    requiredHoleCount: requiredHoleCount,
    scoreValid: validity.scoreValid,
    scoreInvalidReason: validity.scoreInvalidReason
  });
}

function _collectPersonalStrokeRows(match) {
  const pars = _resolveHolePars(match);
  const groups = Array.isArray(match && match.groups) ? match.groups : [];
  const rows = [];
  const seen = {};
  groups.forEach((group) => {
    const gid = _trim(group && group.groupId);
    const bucket = teamMatchStore.normalizeGroupScoreBucket(
      match.scoreData && match.scoreData[gid]
    );
    const slots = []
      .concat(Array.isArray(group.players) ? group.players : [])
      .concat(Array.isArray(group.playersSlots) ? group.playersSlots : []);
    slots.forEach((slot) => {
      const uid = _slotUserId(slot);
      if (!uid || seen[uid]) return;
      seen[uid] = true;
      const rec = bucket.scoresByPlayer[uid] || {};
      const filled = _countFilled(rec.scores);
      let total = null;
      if (filled > 0) {
        let sum = 0;
        (rec.scores || []).forEach((s) => {
          if (s === null || s === undefined || s === '') return;
          const n = Number(s);
          if (Number.isFinite(n)) sum += n;
        });
        total = sum;
      }
      rows.push({
        playerId: uid,
        groupId: gid,
        scores: rec.scores || [],
        grossScore: total,
        toPar: total != null ? _toParFromScores(rec.scores, pars) : null
      });
    });
  });
  return rows;
}

function _projectMatchPersonalStroke(match, part, idSet, mode) {
  const rows = _collectPersonalStrokeRows(match);
  let myRow = null;
  for (let i = 0; i < rows.length; i++) {
    if (_idInSet(rows[i].playerId, idSet)) {
      myRow = rows[i];
      break;
    }
  }
  const grossScore = myRow && myRow.grossScore != null ? myRow.grossScore : null;
  const toPar = myRow && myRow.toPar != null ? myRow.toPar : null;
  const rankInputs = rows.map((r) => ({
    _key: _trim(r.playerId),
    grossScore: r.grossScore,
    toPar: r.toPar
  }));
  const rankMap = _rankRowsByTotal(rankInputs);
  const myKey = _trim((myRow && myRow.playerId) || part.userId);
  const rankInfo = rankMap[myKey] || null;
  const teamMeta = _resolveTeamSideMeta(match, part.userId);
  const primary = grossScore != null ? String(grossScore) + '杆' : '完赛';
  const secondaryParts = [];
  if (toPar != null) secondaryParts.push(_formatToPar(toPar));
  if (rankInfo && rankInfo.rankLabel) secondaryParts.push('第' + rankInfo.rankLabel + '名');
  else secondaryParts.push('--');

  const requiredHoleCount = _requiredHoleCount(match);
  const completedHoleCount = myRow
    ? _countFilled(myRow.scores)
    : 0;
  const groupId = _trim(
    (myRow && myRow.groupId) || (part.group && part.group.groupId) || ''
  );
  const validity = evaluatePersonalStrokeValidity({
    grossScore: grossScore,
    completedHoleCount: completedHoleCount,
    requiredHoleCount: requiredHoleCount,
    slot: part.slot
  });

  return {
    resultCategory: 'personal_stroke',
    filterKey: HISTORY_FILTERS.PERSONAL_STROKE,
    resultPrimary: primary,
    resultSecondary: secondaryParts.filter(Boolean).join(' · ') || '--',
    grossScore: grossScore,
    toPar: toPar,
    rank: rankInfo ? rankInfo.rank : null,
    rankLabel: rankInfo ? rankInfo.rankLabel : '',
    modeLabel: mode || '个人比杆赛',
    teamId: teamMeta.teamId,
    teamName: teamMeta.teamName,
    teamLogo: teamMeta.teamLogo,
    sideId: teamMeta.sideId,
    sideName: teamMeta.sideName,
    groupId: groupId,
    completedHoleCount: completedHoleCount,
    requiredHoleCount: requiredHoleCount,
    scoreValid: validity.scoreValid,
    scoreInvalidReason: validity.scoreInvalidReason
  };
}

function _collectEntityStrokeRows(match) {
  const pars = _resolveHolePars(match);
  const scoreEntities =
    match && match.scoreEntities && typeof match.scoreEntities === 'object'
      ? match.scoreEntities
      : {};
  const rows = [];
  Object.keys(scoreEntities).forEach((gid) => {
    const list = Array.isArray(scoreEntities[gid]) ? scoreEntities[gid] : [];
    const bucket = teamMatchStore.normalizeGroupScoreBucket(
      match.scoreData && match.scoreData[gid]
    );
    list.forEach((entity) => {
      if (!entity) return;
      const entityId = _trim(entity.entityId);
      if (!entityId) return;
      const memberIds = (Array.isArray(entity.members) ? entity.members : [])
        .map((m) => (typeof m === 'object' ? _slotUserId(m) : _trim(m)))
        .filter(Boolean);
      if (!memberIds.length) return;
      let rec = null;
      for (let i = 0; i < bucket.teamScoresByEntity.length; i++) {
        const e = bucket.teamScoresByEntity[i];
        const key = _trim((e && (e.teamId || e.entityId)) || '');
        if (key === entityId) {
          rec = e;
          break;
        }
      }
      let total = null;
      if (_countFilled(rec && rec.scores) > 0) {
        let sum = 0;
        (rec.scores || []).forEach((s) => {
          if (s === null || s === undefined || s === '') return;
          const n = Number(s);
          if (Number.isFinite(n)) sum += n;
        });
        total = sum;
      }
      rows.push({
        entityId: entityId,
        groupId: gid,
        memberIds: memberIds,
        grossScore: total,
        toPar: total != null ? _toParFromScores(rec && rec.scores, pars) : null
      });
    });
  });
  return rows;
}

function _projectMatchTeamStroke(match, part, idSet, mode) {
  const rows = _collectEntityStrokeRows(match);
  let myEntity = null;
  for (let i = 0; i < rows.length; i++) {
    const members = Array.isArray(rows[i].memberIds) ? rows[i].memberIds : [];
    if (members.some((m) => _idInSet(m, idSet))) {
      myEntity = rows[i];
      break;
    }
  }
  if (!myEntity && part.entity) {
    myEntity = rows.find((r) => r.entityId === _trim(part.entity.entityId)) || null;
  }
  const sideGross = myEntity && myEntity.grossScore != null ? myEntity.grossScore : null;
  const toPar = myEntity && myEntity.toPar != null ? myEntity.toPar : null;
  const rankInputs = rows.map((r) => ({
    _key: _trim(r.entityId),
    grossScore: r.grossScore,
    toPar: r.toPar
  }));
  const rankMap = _rankRowsByTotal(rankInputs);
  const rankInfo = myEntity ? rankMap[_trim(myEntity.entityId)] || null : null;
  const teamMeta = _resolveTeamSideMeta(match, part.userId);
  const sideLabel = teamMeta.sideName || teamMeta.teamName || '所在Side';
  const primary =
    sideGross != null ? sideLabel + ' ' + sideGross + '杆' : sideLabel + ' 完赛';
  const secondary =
    rankInfo && rankInfo.rankLabel
      ? '第' + rankInfo.rankLabel + '名'
      : toPar != null
        ? _formatToPar(toPar)
        : '--';

  return {
    resultCategory: 'team_stroke',
    filterKey: HISTORY_FILTERS.TEAM_STROKE,
    resultPrimary: primary,
    resultSecondary: secondary,
    grossScore: null, // 不伪装为个人杆数
    toPar: toPar,
    rank: rankInfo ? rankInfo.rank : null,
    rankLabel: rankInfo ? rankInfo.rankLabel : '',
    modeLabel: mode || '团队比杆',
    teamId: teamMeta.teamId,
    teamName: teamMeta.teamName,
    teamLogo: teamMeta.teamLogo,
    sideId: teamMeta.sideId || _trim(myEntity && myEntity.entityId),
    sideName: sideLabel
  };
}

function _readSideScores(bucket, sideId, sideKey) {
  const map = bucket && bucket.scoresBySide ? bucket.scoresBySide : {};
  const id = _trim(sideId);
  const key = _trim(sideKey);
  if (id && map[id] && Array.isArray(map[id].scores)) return map[id].scores;
  if (key && map[key] && Array.isArray(map[key].scores)) return map[key].scores;
  return [];
}

function _projectMatchPlay(match, part, idSet, mode) {
  const groups = Array.isArray(match.groups) ? match.groups : [];
  let group = part.group;
  if (!group) {
    for (let i = 0; i < groups.length; i++) {
      const filled = listFilledPlayers(groups[i]);
      if (filled.some((p) => _idInSet(p.userId, idSet))) {
        group = groups[i];
        break;
      }
    }
  }
  if (!group) {
    return {
      resultCategory: 'match_play',
      filterKey: HISTORY_FILTERS.MATCH_PLAY,
      resultPrimary: '完赛',
      resultSecondary: '--',
      matchPlayResult: '',
      opponentLabel: '',
      modeLabel: mode || '比洞赛',
      grossScore: null,
      toPar: null,
      rank: null,
      rankLabel: ''
    };
  }

  const gid = _trim(group.groupId);
  const bucket = teamMatchStore.normalizeGroupScoreBucket(
    match.scoreData && match.scoreData[gid]
  );
  const startHole =
    bucket.matchPlayMeta && bucket.matchPlayMeta.startHole
      ? Number(bucket.matchPlayMeta.startHole)
      : 1;
  const teamMeta = _resolveTeamSideMeta(match, part.userId);
  const teamOrder = (Array.isArray(match.teamGroups) ? match.teamGroups : [])
    .map((tg) => _trim(tg && tg.id))
    .filter(Boolean);
  const teamMap = buildRegisterTeamMap(match) || {};
  const filled = listFilledPlayers(group);

  let scoresA = [];
  let scoresB = [];
  let mySideKey = '';
  let opponentLabel = '';
  let sideName = teamMeta.sideName;

  if (isG5MatchPlayMode(mode)) {
    const a = filled[0];
    const b = filled[1];
    if (a && b) {
      const recA = bucket.scoresByPlayer[_trim(a.userId)] || {};
      const recB = bucket.scoresByPlayer[_trim(b.userId)] || {};
      scoresA = Array.isArray(recA.scores) ? recA.scores : [];
      scoresB = Array.isArray(recB.scores) ? recB.scores : [];
      mySideKey = _idInSet(a.userId, idSet) ? 'A' : _idInSet(b.userId, idSet) ? 'B' : '';
      const opp = mySideKey === 'A' ? b : a;
      const regUsers =
        (match.registerInfo && match.registerInfo.users) || [];
      const oppReg = regUsers.find((u) => _trim(u.userId) === _trim(opp.userId));
      opponentLabel = _trim(
        (oppReg && (oppReg.competitionName || oppReg.nickname)) || ''
      );
      sideName = '个人';
    }
  } else {
    const aId = teamOrder[0] || '';
    const bId = teamOrder[1] || '';
    scoresA = _readSideScores(bucket, aId, 'A');
    scoresB = _readSideScores(bucket, bId, 'B');
    const myTeam = _trim(teamMap[part.userId]);
    mySideKey = myTeam && myTeam === aId ? 'A' : myTeam && myTeam === bId ? 'B' : '';
    const oppTg = (match.teamGroups || []).find(
      (tg) => _trim(tg && tg.id) && _trim(tg.id) !== myTeam
    );
    opponentLabel = _trim(
      (oppTg && (oppTg.sourceTeamName || oppTg.name)) || ''
    );
  }

  const summary = buildMatchPlayResultSummary(scoresA, scoresB, startHole);
  const finishedLike = !!(summary && (summary.clinched || summary.thru >= 18));
  let outcome = '';
  let resultLabel = (summary && summary.label) || '';
  if (summary) {
    if (summary.leader === 'AS') {
      outcome = '平';
      resultLabel = resultLabel || 'AS';
    } else if (mySideKey && summary.leader === mySideKey) {
      outcome = '胜';
    } else if (mySideKey) {
      outcome = '负';
      // 视角翻转 UP/DN
      if (resultLabel.indexOf('UP') >= 0) {
        resultLabel = resultLabel.replace('UP', 'DN');
      } else if (resultLabel.indexOf('DN') >= 0) {
        resultLabel = resultLabel.replace('DN', 'UP');
      }
    }
  }

  const primary = outcome
    ? outcome + (resultLabel ? ' ' + resultLabel : '')
    : resultLabel || (finishedLike ? '完赛' : '完赛');
  const secondaryParts = [];
  if (opponentLabel) secondaryParts.push('对阵 ' + opponentLabel);
  if (teamMeta.teamName) secondaryParts.push(teamMeta.teamName);

  return {
    resultCategory: 'match_play',
    filterKey: HISTORY_FILTERS.MATCH_PLAY,
    resultPrimary: primary,
    resultSecondary: secondaryParts.join(' · ') || '--',
    matchPlayResult: resultLabel || '',
    opponentLabel: opponentLabel,
    modeLabel: mode || '比洞赛',
    grossScore: null,
    toPar: null,
    rank: null,
    rankLabel: '',
    teamId: teamMeta.teamId,
    teamName: teamMeta.teamName,
    teamLogo: teamMeta.teamLogo,
    sideId: teamMeta.sideId,
    sideName: sideName || teamMeta.sideName
  };
}

function _projectMatchRecord(match, part, idSet) {
  const matchId = _trim(match && match.matchId);
  if (!matchId || !part) return null;
  const mode = resolveGameMode(match);
  const kind = resolveStrokeKind(mode);
  const matchType = _trim(match.matchType);
  const familyLabel =
    matchType === 'inter-team'
      ? '队际赛'
      : matchType === 'team-internal'
        ? '队内赛'
        : '球队赛';

  let finishedScoreAt = null;
  const scoreData = match.scoreData || {};
  Object.keys(scoreData).forEach((gid) => {
    const b = teamMatchStore.normalizeGroupScoreBucket(scoreData[gid]);
    if (b.finishedScoreAt && (!finishedScoreAt || b.finishedScoreAt > finishedScoreAt)) {
      finishedScoreAt = b.finishedScoreAt;
    }
  });

  const completedAt = match.finishedAt != null ? Number(match.finishedAt) || null : null;
  const playedAt = _pickSortTime({
    completedAt: completedAt,
    finishedAt: completedAt,
    finishedScoreAt: finishedScoreAt,
    teeTime: match.teeTime,
    createdAt: match.createdAt,
    updatedAt: match.updatedAt
  });

  let resultPatch;
  if (isMatchPlayBoardMode(mode)) {
    resultPatch = _projectMatchPlay(match, part, idSet, mode);
  } else if (kind === 'g2g3' || kind === 'g4') {
    resultPatch = _projectMatchTeamStroke(match, part, idSet, mode);
  } else {
    // G1 / 缺省个人比杆
    resultPatch = _projectMatchPersonalStroke(match, part, idSet, mode || '个人比杆赛');
  }

  const card = teamMatchStore.toTournamentCard(match);
  const base = _emptyRecordBase();
  const isPersonal =
    resultPatch && resultPatch.filterKey === HISTORY_FILTERS.PERSONAL_STROKE;
  return Object.assign(base, resultPatch, {
    recordId: 'match:' + matchId,
    matchId: matchId,
    matchKey: buildMatchKey('team-match', matchId),
    sourceType: 'team_match',
    matchType: matchType || 'team-internal',
    gameMode: mode,
    matchName: _trim(match.roundName) || (card && card.title) || '球队赛',
    courseName: _trim(match.courseName),
    playedAt: playedAt,
    completedAt: completedAt,
    status: 'completed',
    identitySource: part.identitySource || 'slot',
    snapshotName: _trim(
      part.slot && (part.slot.competitionName || part.slot.nickname || part.slot.name)
    ),
    dateLabel: _formatDateLabel(playedAt),
    familyLabel: familyLabel,
    navUrl: card && card.navUrl ? card.navUrl : '',
    dateMissing: !(playedAt > 0),
    // 非个人比杆：PK 样本字段保持无效，避免误入
    groupId: isPersonal ? _trim(resultPatch.groupId) : '',
    completedHoleCount: isPersonal ? Number(resultPatch.completedHoleCount) || 0 : 0,
    requiredHoleCount: isPersonal ? Number(resultPatch.requiredHoleCount) || 0 : 0,
    scoreValid: isPersonal ? !!resultPatch.scoreValid : false,
    scoreInvalidReason: isPersonal
      ? resultPatch.scoreInvalidReason || ''
      : 'not_personal_stroke'
  });
}

function _buildRevision() {
  let rev = 0;
  try {
    const games = gameStore.listGames() || [];
    games.forEach((g) => {
      rev += 1;
      rev += Number(g && (g.updatedAt || g.createdAt || 0)) || 0;
      if (g && (g.status === 'finished' || g.status === 'ended')) rev += 17;
    });
  } catch (e) { /* ignore */ }
  try {
    const matches = teamMatchStore.listMatches() || [];
    matches.forEach((m) => {
      rev += 1;
      rev += Number(m && (m.updatedAt || m.finishedAt || m.createdAt || 0)) || 0;
      if (m && String(m.status).toLowerCase() === 'finished') rev += 19;
    });
  } catch (e2) { /* ignore */ }
  return String(rev);
}

/**
 * 一次读取 Store，投影目标用户完赛历史（轻量记录）。
 * @returns {{ access, records, summary, revision }}
 */
function listPlayerMatchHistory(viewerUserId, targetUserId, profile) {
  const target = playerIdentityGuard.normalizePlayerUserId(targetUserId);
  const access = resolvePlayerHistoryAccess(viewerUserId, target, profile);
  const revision = _buildRevision();
  if (!target || !playerIdentityGuard.isStablePublicUserId(target)) {
    return {
      access: access,
      records: [],
      summary: buildHistorySummary([]),
      revision: revision
    };
  }
  if (!access.canViewHistory) {
    return {
      access: access,
      records: [],
      summary: buildHistorySummary([]),
      revision: revision
    };
  }

  const idSet = _expandUserIdSet(target);
  const records = [];

  try {
    const games = gameStore.listGames() || [];
    games.forEach((game) => {
      if (!_isCompletedGame(game)) return;
      const part = _findGameParticipation(game, idSet);
      if (!part) return;
      const rec = _projectGameRecord(game, part, idSet);
      if (rec) records.push(rec);
    });
  } catch (e) { /* ignore */ }

  try {
    const matches = teamMatchStore.listMatches() || [];
    matches.forEach((match) => {
      if (!_isCompletedMatch(match)) return;
      const part = _findMatchParticipation(match, idSet);
      if (!part) return;
      const rec = _projectMatchRecord(match, part, idSet);
      if (rec) records.push(rec);
    });
  } catch (e2) { /* ignore */ }

  records.sort((a, b) => {
    const ta = a.playedAt > 0 ? a.playedAt : -1;
    const tb = b.playedAt > 0 ? b.playedAt : -1;
    if (ta !== tb) return tb - ta;
    // 无可信时间排最后：两者皆缺失时保持稳定
    if (ta <= 0 && tb <= 0) {
      return String(a.recordId).localeCompare(String(b.recordId));
    }
    return 0;
  });

  return {
    access: access,
    records: records,
    summary: buildHistorySummary(records),
    revision: revision
  };
}

function filterHistoryRecords(records, filterKey) {
  const key = _trim(filterKey) || HISTORY_FILTERS.ALL;
  const list = Array.isArray(records) ? records : [];
  if (key === HISTORY_FILTERS.ALL) return list.slice();
  return list.filter((r) => r && r.filterKey === key);
}

function paginateHistoryRecords(records, page, pageSize) {
  const size = pageSize > 0 ? pageSize : PAGE_SIZE;
  const p = page > 0 ? Math.floor(page) : 1;
  const list = Array.isArray(records) ? records : [];
  const start = (p - 1) * size;
  return {
    page: p,
    pageSize: size,
    total: list.length,
    hasMore: start + size < list.length,
    items: list.slice(start, start + size)
  };
}

function buildHistorySummary(records) {
  const list = Array.isArray(records) ? records : [];
  const completedCount = list.length;
  let bestGross = null;
  list.forEach((r) => {
    if (!r || r.filterKey !== HISTORY_FILTERS.PERSONAL_STROKE) return;
    if (r.grossScore == null || !Number.isFinite(Number(r.grossScore))) return;
    const g = Math.floor(Number(r.grossScore));
    if (bestGross == null || g < bestGross) bestGross = g;
  });
  return {
    playedCount: completedCount,
    completedCount: completedCount,
    bestGrossScore: bestGross,
    recent: list.slice(0, 3)
  };
}

function getRecordNavUrl(record) {
  return record && record.navUrl ? String(record.navUrl) : '';
}

/**
 * 个人比杆 PK 轻量样本（普通球局 + G1；不含 G2–G8）。
 * 不解析 resultPrimary 字符串。
 * @param {string} userId
 * @returns {Array<object>}
 */
function listPlayerPersonalStrokeSamples(userId) {
  const uid = playerIdentityGuard.normalizePlayerUserId(userId);
  if (!uid || !playerIdentityGuard.isStablePublicUserId(uid)) return [];
  // 以本人视角读历史（隐私对自己开放）；只取个人比杆记录再投影样本
  const bundle = listPlayerMatchHistory(uid, uid, { historyPrivacy: '' });
  const list = Array.isArray(bundle.records) ? bundle.records : [];
  const out = [];
  list.forEach((r) => {
    if (!r || r.filterKey !== HISTORY_FILTERS.PERSONAL_STROKE) return;
    const matchKey =
      _trim(r.matchKey) || buildMatchKey(r.sourceType, r.matchId);
    if (!matchKey) return;
    const completedAt =
      r.completedAt != null && Number(r.completedAt) > 0
        ? Number(r.completedAt)
        : r.playedAt > 0
          ? Number(r.playedAt)
          : 0;
    out.push({
      userId: uid,
      matchKey: matchKey,
      matchId: _trim(r.matchId),
      sourceType: _trim(r.sourceType),
      matchName: _trim(r.matchName),
      courseName: _trim(r.courseName),
      grossScore:
        r.grossScore != null && Number.isFinite(Number(r.grossScore))
          ? Math.floor(Number(r.grossScore))
          : null,
      completedHoleCount: Number(r.completedHoleCount) || 0,
      requiredHoleCount: Number(r.requiredHoleCount) || 0,
      groupId: _trim(r.groupId),
      completedAt: completedAt,
      dateLabel: r.dateLabel || _formatDateLabel(completedAt),
      navUrl: _trim(r.navUrl),
      scoreValid: !!r.scoreValid,
      scoreInvalidReason: _trim(r.scoreInvalidReason)
    });
  });
  return out;
}

/** 展示层：rank/toPar 缺失 → '--'；不写回 Store */
function toHistoryCardView(record) {
  if (!record) return null;
  const toParText =
    record.toPar != null && Number.isFinite(record.toPar)
      ? _formatToPar(record.toPar)
      : '--';
  const rankText = record.rankLabel
    ? '第' + record.rankLabel + '名'
    : '--';
  const teamLine = record.teamName || record.sideName || '';
  return {
    recordId: record.recordId,
    dateLabel: record.dateLabel || '日期缺失',
    matchName: record.matchName || '',
    courseName: record.courseName || '',
    modeLabel: record.modeLabel || '',
    familyLabel: record.familyLabel || '',
    resultPrimary: record.resultPrimary || '--',
    resultSecondary: record.resultSecondary || '--',
    toParText: toParText,
    rankText: rankText,
    teamLine: teamLine,
    teamLogo: record.teamLogo || '',
    matchPlayResult: record.matchPlayResult || '',
    opponentLabel: record.opponentLabel || '',
    navUrl: record.navUrl || '',
    hasNav: !!(record.navUrl && record.matchId),
    dateMissing: !!record.dateMissing,
    filterKey: record.filterKey
  };
}

module.exports = {
  PAGE_SIZE: PAGE_SIZE,
  HISTORY_FILTERS: HISTORY_FILTERS,
  resolvePlayerHistoryAccess: resolvePlayerHistoryAccess,
  listPlayerMatchHistory: listPlayerMatchHistory,
  listPlayerPersonalStrokeSamples: listPlayerPersonalStrokeSamples,
  filterHistoryRecords: filterHistoryRecords,
  paginateHistoryRecords: paginateHistoryRecords,
  buildHistorySummary: buildHistorySummary,
  getRecordNavUrl: getRecordNavUrl,
  toHistoryCardView: toHistoryCardView,
  getStoreRevision: _buildRevision,
  buildMatchKey: buildMatchKey,
  evaluatePersonalStrokeValidity: evaluatePersonalStrokeValidity
};
