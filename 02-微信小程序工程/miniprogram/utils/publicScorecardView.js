/**
 * 球友圈公开成绩卡只读投影。
 * - 每次展示从当前权威 GAME/赛事成绩重新投影，动态不存逐洞副本
 * - 复用 groupsStore.getScoreStatus / matchPlayResult，不复制 G1–G8 公式
 * - publicScorecardId 仅公开定位，不授予比赛权限
 */

const groupsStore = require('./groupsStore.js');
const matchPlayResult = require('./matchPlayResult.js');
const holeLayout = require('./holeLayout.js');
const halfCourse = require('./halfCourse.js');
const teamMatchStore = require('./teamMatchStore.js');
const gameStore = require('./gameStore.js');
const gameLeaderboard = require('./gameLeaderboard.js');
const playerMomentPublishContext = require('./playerMomentPublishContext.js');
const strokeEntityValidator = require('./strokeEntityValidator.js');
const socialRelationStore = require('./socialRelationStore.js');
const playerIdentityGuard = require('./playerIdentityGuard.js');
const matchStatus = require('./matchStatus.js');
const mockAvatars = require('./mockAvatars.js');
const playerMatchHistory = require('./playerMatchHistory.js');

function _trim(v) {
  return v == null ? '' : String(v).trim();
}

function _canon(userId) {
  return socialRelationStore.resolveCanonicalUserId(
    playerIdentityGuard.normalizePlayerUserId(userId)
  );
}

function _sameUser(a, b) {
  const ca = _canon(a);
  const cb = _canon(b);
  return !!(ca && cb && ca === cb);
}

function _isFilled(score) {
  return score !== null && score !== undefined && score !== '' && !Number.isNaN(Number(score));
}

function _formatDiff(diff) {
  if (diff > 0) return '+' + diff;
  if (diff === 0) return '0';
  return String(diff);
}

function _marker(status) {
  switch (status) {
    case 'eagle':
      return { m: 'circle', c: 'score-eagle' };
    case 'birdie':
      return { m: 'circle', c: 'score-birdie' };
    case 'bogey':
      return { m: 'square', c: 'score-bogey' };
    case 'double-bogey':
      return { m: 'square', c: 'score-double-bogey' };
    default:
      return { m: '', c: '' };
  }
}

function _holeCell(score, par, mode) {
  if (!_isFilled(score)) return { t: '-', m: '', c: '' };
  const diff = Number(score) - Number(par || 0);
  const marker = _marker(groupsStore.getScoreStatus(diff));
  return {
    t: mode === 'diff' ? _formatDiff(diff) : String(score),
    m: marker.m,
    c: marker.c
  };
}

function _sumCell(scores, pars, from, to, mode) {
  let gross = 0;
  let diff = 0;
  let filled = 0;
  for (let i = from; i < to; i++) {
    if (!_isFilled(scores[i])) continue;
    gross += Number(scores[i]);
    diff += Number(scores[i]) - Number(pars[i] || 0);
    filled += 1;
  }
  if (!filled) return { t: '', m: '', c: '' };
  return { t: mode === 'diff' ? _formatDiff(diff) : String(gross), m: '', c: '' };
}

function _sumPars(pars, from, to) {
  let total = 0;
  for (let i = from; i < to; i++) total += Number(pars[i] || 0);
  return total;
}

function resolveHolePars(matchOrGame) {
  const src = matchOrGame || {};
  const parsed =
    !src.front9Course && !src.back9Course
      ? halfCourse.parseCourseHalfText(src.courseHalfText || src.courseHalf || src.halfText)
      : {};
  const layout = holeLayout.resolveLayoutFromContext({
    courseId: src.courseId || '',
    courseName: src.courseName || '',
    front9Course: src.front9Course || parsed.front9Course || null,
    back9Course: src.back9Course || parsed.back9Course || null
  });
  return (layout.holePars || holeLayout.getLayout().holePars).slice();
}

function resolveCourseName(matchOrGame, related) {
  return (
    _trim(matchOrGame && matchOrGame.courseName) ||
    _trim(related && related.courseName) ||
    _trim(matchOrGame && matchOrGame.venue) ||
    '球场'
  );
}

/**
 * 球友圈比杆赛制展示名（产品中文语义，禁止输出内部 mode code / 英文技术词）。
 * G1→个人比杆赛；G2→最好成绩比杆；G3→最佳球位比杆；G4→四人两球比杆
 */
function resolveStrokeModeLabel(gameMode) {
  const mode = _trim(gameMode);
  const lower = mode.toLowerCase();

  // 内部枚举 / 英文技术词：不直接展示
  if (
    !mode ||
    lower === 'individual_stroke' ||
    lower === 'stroke' ||
    lower === 'stroke_entity' ||
    lower === 'standard' ||
    lower === 'game' ||
    lower === 'fourball' ||
    lower === 'fourball40' ||
    lower === 'fourball_best' ||
    lower === 'fourball_2ball' ||
    lower === 'best-ball' ||
    lower === 'best_ball' ||
    lower === 'best_ball_4_0' ||
    lower === 'best_score' ||
    lower === 'foursomes' ||
    lower === 'foursome'
  ) {
    // fourball_2ball / foursomes → G4；best_ball* → G3；其余未知英文兜底个人比杆
    if (lower === 'fourball_2ball' || lower === 'foursomes' || lower === 'foursome') {
      return '四人两球比杆';
    }
    if (
      lower === 'best_ball' ||
      lower === 'best-ball' ||
      lower === 'best_ball_4_0' ||
      lower === 'best_score' ||
      lower === 'fourball_best' ||
      lower === 'fourball'
    ) {
      // 无更细 format 时按最好成绩展示；禁止原样输出英文/内部枚举
      return '最好成绩比杆';
    }
    return '个人比杆赛';
  }

  if (
    mode === '个人比杆' ||
    mode === '个人比杆赛' ||
    (strokeEntityValidator.G1_MODES && strokeEntityValidator.G1_MODES[mode])
  ) {
    return '个人比杆赛';
  }

  // G4
  if (
    mode === '四人两球比杆赛' ||
    mode === '四人两球赛' ||
    (strokeEntityValidator.G4_MODES && strokeEntityValidator.G4_MODES[mode])
  ) {
    return '四人两球比杆';
  }

  // G3 最佳球位
  if (mode === '最佳球位比杆赛' || mode === '最佳球位赛') {
    return '最佳球位比杆';
  }

  // G2 最好成绩（含产品现用名「四人四球比杆赛」）
  if (
    mode === '最好成绩比杆赛' ||
    mode === '最好成绩赛' ||
    mode === '四人四球比杆赛' ||
    mode === '四人四球赛'
  ) {
    return '最好成绩比杆';
  }

  // 比洞模式名不应出现在比杆卡
  if (strokeEntityValidator.isMatchPlayBoardMode(mode)) {
    return '个人比杆赛';
  }

  // 其余未知：禁止英文/内部枚举泄漏
  if (/[A-Za-z_]/.test(mode)) {
    return '个人比杆赛';
  }
  return '个人比杆赛';
}

/**
 * 球友圈比洞赛制展示名（产品中文语义）。
 * G5→个人比洞；G6→四人四球比洞（含历史名「最好成绩比洞赛」）；G7→最佳球位比洞；G8→四人两球比洞
 */
function resolveMatchPlayModeLabel(gameMode) {
  const mode = _trim(gameMode);
  const lower = mode.toLowerCase();

  if (
    !mode ||
    /match[-_]?play|fourball|best[-_]?ball|foursomes?|stroke/.test(lower)
  ) {
    // 英文/内部 code 不得进 UI；能识别的映射中文，否则个人比洞
    if (lower.indexOf('foursome') >= 0 || lower.indexOf('fourball_2') >= 0) {
      return '四人两球比洞';
    }
    if (lower.indexOf('best') >= 0 || lower.indexOf('fourball') >= 0) {
      return '四人四球比洞';
    }
    return '个人比洞';
  }

  if (
    mode === '个人比洞赛' ||
    mode === '个人比洞' ||
    (strokeEntityValidator.G5_MATCH_PLAY_MODES &&
      strokeEntityValidator.G5_MATCH_PLAY_MODES[mode])
  ) {
    return '个人比洞';
  }

  if (mode === '四人两球比洞赛' || mode === '四人两球比洞') {
    return '四人两球比洞';
  }

  if (mode === '最佳球位比洞赛' || mode === '最佳球位比洞') {
    return '最佳球位比洞';
  }

  if (
    mode === '最好成绩比洞赛' ||
    mode === '最好成绩比洞' ||
    mode === '四人四球比洞赛' ||
    mode === '四人四球比洞'
  ) {
    return '四人四球比洞';
  }

  if (/[A-Za-z_]/.test(mode)) {
    return '个人比洞';
  }
  return '个人比洞';
}

/**
 * 比杆逐洞 VM（对齐领先榜展开面板图模式）
 */
function buildStrokeScorecardFromScores(scoresRaw, parsRaw, mode) {
  const scores = Array.isArray(scoresRaw) ? scoresRaw : [];
  const pars =
    Array.isArray(parsRaw) && parsRaw.length
      ? parsRaw
      : holeLayout.getLayout().holePars.slice();
  const blank = { t: '', m: '', c: '' };
  const parCell = function (v) {
    return { t: String(v), m: '', c: '' };
  };
  const frontHead = ['Hole', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Out', ''];
  const backHead = ['Hole', '10', '11', '12', '13', '14', '15', '16', '17', '18', 'In', 'Tot'];
  const frontPar = [{ t: 'Par', m: '', c: '' }];
  const backPar = [{ t: 'Par', m: '', c: '' }];
  for (let i = 0; i < 9; i++) frontPar.push(parCell(pars[i]));
  frontPar.push(parCell(_sumPars(pars, 0, 9)));
  frontPar.push(blank);
  for (let i = 9; i < 18; i++) backPar.push(parCell(pars[i]));
  backPar.push(parCell(_sumPars(pars, 9, 18)));
  backPar.push(parCell(_sumPars(pars, 0, 18)));

  const frontScore = [blank];
  const backScore = [blank];
  for (let i = 0; i < 9; i++) frontScore.push(_holeCell(scores[i], pars[i], mode));
  frontScore.push(_sumCell(scores, pars, 0, 9, mode));
  frontScore.push(blank);
  for (let i = 9; i < 18; i++) backScore.push(_holeCell(scores[i], pars[i], mode));
  backScore.push(_sumCell(scores, pars, 9, 18, mode));
  backScore.push(_sumCell(scores, pars, 0, 18, mode));

  let gross = 0;
  let toPar = 0;
  let filled = 0;
  for (let i = 0; i < 18; i++) {
    if (!_isFilled(scores[i])) continue;
    gross += Number(scores[i]);
    toPar += Number(scores[i]) - Number(pars[i] || 0);
    filled += 1;
  }

  return {
    frontHead: frontHead,
    frontPar: frontPar,
    frontScore: frontScore,
    backHead: backHead,
    backPar: backPar,
    backScore: backScore,
    scorecardStatus: filled ? null : 'not_started',
    summary: {
      filled: filled,
      gross: filled ? gross : null,
      toPar: filled ? toPar : null,
      toParText: filled ? _formatDiff(toPar) : '--',
      outText: _sumCell(scores, pars, 0, 9, 'gross').t || '--',
      inText: _sumCell(scores, pars, 9, 18, 'gross').t || '--',
      totalText: filled ? String(gross) : '--'
    }
  };
}

function _hashPush(h, s) {
  const str = String(s == null ? '' : s);
  let out = h;
  for (let i = 0; i < str.length; i++) {
    out = ((out << 5) - out + str.charCodeAt(i)) | 0;
  }
  return out;
}

function _fingerprintScoreArray(scores, h0) {
  let h = h0 || 0;
  const arr = Array.isArray(scores) ? scores : [];
  h = _hashPush(h, arr.length);
  for (let i = 0; i < arr.length; i++) {
    h = _hashPush(h, arr[i] == null ? '-' : arr[i]);
  }
  return h;
}

function _fingerprintBucket(bucket) {
  let h = 0;
  const b = bucket || {};
  const byPlayer = b.scoresByPlayer && typeof b.scoresByPlayer === 'object' ? b.scoresByPlayer : {};
  Object.keys(byPlayer)
    .sort()
    .forEach(function (k) {
      h = _hashPush(h, k);
      h = _fingerprintScoreArray(byPlayer[k] && byPlayer[k].scores, h);
    });
  const entities = Array.isArray(b.teamScoresByEntity) ? b.teamScoresByEntity : [];
  entities.forEach(function (rec) {
    h = _hashPush(h, rec && rec.teamId);
    h = _fingerprintScoreArray(rec && rec.scores, h);
  });
  const bySide = b.scoresBySide && typeof b.scoresBySide === 'object' ? b.scoresBySide : {};
  Object.keys(bySide)
    .sort()
    .forEach(function (k) {
      h = _hashPush(h, k);
      const rec = bySide[k];
      h = _fingerprintScoreArray(rec && rec.scores, h);
    });
  h = _hashPush(h, b.firstScoreAt || 0);
  h = _hashPush(h, b.finishedScoreAt || 0);
  if (b.matchPlayMeta && b.matchPlayMeta.startHole) {
    h = _hashPush(h, b.matchPlayMeta.startHole);
  }
  return String(h);
}

function resolveScoreRevisionForSource(sourceType, source, groupId) {
  if (!source) return '0';
  if (sourceType === 'team_match') {
    const gid = _trim(groupId);
    const bucket = teamMatchStore.normalizeGroupScoreBucket(
      source.scoreData && (gid ? source.scoreData[gid] : null)
    );
    return [
      'tm',
      source.matchId || '',
      source.updatedAt || source.finishedAt || source.createdAt || 0,
      source.status || '',
      gid,
      _fingerprintBucket(bucket)
    ].join('|');
  }
  // ordinary game：无可靠 updatedAt，指纹走分组成绩
  let h = 0;
  h = _hashPush(h, source.gameId || '');
  h = _hashPush(h, source.status || '');
  h = _hashPush(h, source.updatedAt || source.createdAt || 0);
  const groups = gameStore.listGroups(source) || [];
  groups.forEach(function (g) {
    h = _hashPush(h, g && g.groupId);
    h = _hashPush(h, g && g.status);
    const sbp = (g && g.scoresByPlayer) || {};
    Object.keys(sbp)
      .sort()
      .forEach(function (k) {
        h = _hashPush(h, k);
        h = _fingerprintScoreArray(sbp[k] && sbp[k].scores, h);
      });
    const entities = (g && g.teamScoresByEntity) || [];
    if (Array.isArray(entities)) {
      entities.forEach(function (rec) {
        h = _hashPush(h, rec && rec.teamId);
        h = _fingerprintScoreArray(rec && rec.scores, h);
      });
    }
  });
  // 顶层兼容
  h = _fingerprintScoreArray(
    source.scoresByPlayer &&
      source.scoresByPlayer[
        Object.keys(source.scoresByPlayer || {})[0]
      ] &&
      source.scoresByPlayer[Object.keys(source.scoresByPlayer || {})[0]].scores,
    h
  );
  return ['g', source.gameId || '', String(h)].join('|');
}

function getScoreStoreRevision() {
  try {
    if (typeof playerMatchHistory.getStoreRevision === 'function') {
      return String(playerMatchHistory.getStoreRevision() || '0');
    }
  } catch (e) { /* ignore */ }
  return '0';
}

/**
 * 比洞头像行趋势 + 箭头状态层（对齐得分榜 statusLayerClass）。
 * leaderSide: 'A' | 'B' | 'AS' | 'VS'
 * statusLayerClass: 'winner-a' | 'winner-b' | 'all-square' | 'not-started'
 * 中心文案不含 RED/BLUE；胜方颜色由箭头层 class 表达。
 */
function buildMatchPlayTrend(summary, groupCompleted) {
  const s = summary || {};
  const thru = Number(s.thru) || 0;
  const completed = !!groupCompleted || !!s.clinched || thru >= 18;
  const notStarted = !completed && thru === 0;

  if (notStarted) {
    return {
      leaderSide: 'VS',
      statusLayerClass: 'not-started',
      statusMain: 'VS',
      statusSub: '',
      statusLeadClass: 'mp-sb-lead--vs',
      phaseLabel: '',
      completed: false
    };
  }

  const matchPlayOver = completed || !!s.clinched;
  let leaderSide = 'AS';
  let statusLayerClass = 'all-square';
  let statusLeadClass = 'mp-sb-lead--as';
  if (s.leader === 'A') {
    leaderSide = 'A';
    statusLayerClass = 'winner-a';
    statusLeadClass = 'mp-sb-lead--a';
  } else if (s.leader === 'B') {
    leaderSide = 'B';
    statusLayerClass = 'winner-b';
    statusLeadClass = 'mp-sb-lead--b';
  }

  // 与得分榜中心一致：FINAL/clinch 用摘要 n&m / nUP；进行中 UP/DN；平局 TIED
  let statusMain = s.statusMain || 'TIED';
  let statusSub = s.statusSub || '';
  if (!matchPlayOver) {
    if (s.leader === 'A') {
      statusMain = String(s.up || 0);
      statusSub = 'UP';
    } else if (s.leader === 'B') {
      statusMain = String(s.up || 0);
      statusSub = 'DN';
    } else {
      statusMain = 'TIED';
      statusSub = '';
    }
  } else if (leaderSide === 'AS') {
    statusMain = 'TIED';
    statusSub = '';
  }

  return {
    leaderSide: leaderSide,
    statusLayerClass: statusLayerClass,
    statusMain: statusMain,
    statusSub: statusSub,
    statusLeadClass: statusLeadClass,
    phaseLabel: matchPlayOver ? 'FINAL' : 'THRU ' + thru,
    completed: matchPlayOver,
    isFinished: matchPlayOver
  };
}

function buildMatchPlayDetailFromSides(scoresA, scoresB, startHole, groupCompleted) {
  const summary = matchPlayResult.buildMatchPlayResultSummary(scoresA, scoresB, startHole) || {};
  const trend = buildMatchPlayTrend(summary, groupCompleted);
  // 与得分榜卡片底部 holeDots 同源：比赛序 + side 逐洞比较
  const holeDots = matchPlayResult.buildMatchPlayHoleDots(scoresA, scoresB, startHole);
  return {
    trend: trend,
    holeDots: holeDots,
    summary: {
      thru: Number(summary.thru) || 0,
      label: summary.label || String(trend.statusMain || '') + String(trend.statusSub || ''),
      clinched: !!summary.clinched,
      completed: !!trend.completed,
      leader: summary.leader || 'AS',
      leaderSide: trend.leaderSide
    }
  };
}

function _findGroup(match, groupId) {
  const groups = Array.isArray(match && match.groups) ? match.groups : [];
  const gid = _trim(groupId);
  if (!gid) return groups[0] || null;
  for (let i = 0; i < groups.length; i++) {
    if (groups[i] && String(groups[i].groupId) === gid) return groups[i];
  }
  return groups[0] || null;
}

function _resolveScoresByPlayer(scoresByPlayer, userId, slotPlayer) {
  if (!scoresByPlayer || typeof scoresByPlayer !== 'object') return null;
  const slot = slotPlayer || {};
  const scorePlayerId = _trim(
    slot.scorePlayerId || slot.slotScorePlayerId || slot.scoreOwnerId || ''
  );
  if (scorePlayerId && scoresByPlayer[scorePlayerId]) return scoresByPlayer[scorePlayerId];
  const id = _canon(userId);
  if (id && scoresByPlayer[id]) return scoresByPlayer[id];
  const keys = Object.keys(scoresByPlayer);
  for (let i = 0; i < keys.length; i++) {
    if (_sameUser(keys[i], userId) || (scorePlayerId && _sameUser(keys[i], scorePlayerId))) {
      return scoresByPlayer[keys[i]];
    }
  }
  return null;
}

function _findEntityForUser(match, groupId, userId) {
  const entities =
    match &&
    match.scoreEntities &&
    match.scoreEntities[groupId] &&
    Array.isArray(match.scoreEntities[groupId])
      ? match.scoreEntities[groupId]
      : [];
  for (let i = 0; i < entities.length; i++) {
    const ent = entities[i];
    if (!ent) continue;
    const members = Array.isArray(ent.members) ? ent.members : [];
    for (let j = 0; j < members.length; j++) {
      const m = members[j];
      const mid =
        typeof m === 'string' || typeof m === 'number'
          ? m
          : m && (m.userId || m.playerId || m.id);
      if (_sameUser(mid, userId)) {
        return {
          entityId: _trim(ent.entityId || ent.teamId || ent.id),
          entity: ent
        };
      }
    }
  }
  return null;
}

function _resolveTeamMatchStrokeScores(match, groupId, authorUserId) {
  const bucket = teamMatchStore.normalizeGroupScoreBucket(
    match.scoreData && match.scoreData[groupId]
  );
  const gameMode = strokeEntityValidator.resolveGameMode(match);
  const isEntityMode =
    !!(strokeEntityValidator.G2_G3_MODES && strokeEntityValidator.G2_G3_MODES[gameMode]) ||
    !!(strokeEntityValidator.G4_MODES && strokeEntityValidator.G4_MODES[gameMode]);

  if (isEntityMode) {
    const found = _findEntityForUser(match, groupId, authorUserId);
    if (found && found.entityId) {
      const list = Array.isArray(bucket.teamScoresByEntity) ? bucket.teamScoresByEntity : [];
      for (let i = 0; i < list.length; i++) {
        const rec = list[i];
        if (rec && _trim(rec.teamId) === found.entityId) {
          return {
            scores: Array.isArray(rec.scores) ? rec.scores : [],
            subjectType: 'side_entity',
            subjectId: found.entityId
          };
        }
      }
      return { scores: [], subjectType: 'side_entity', subjectId: found.entityId };
    }
  }

  const rec = _resolveScoresByPlayer(bucket.scoresByPlayer, authorUserId);
  return {
    scores: rec && Array.isArray(rec.scores) ? rec.scores : [],
    subjectType: 'personal',
    subjectId: _canon(authorUserId)
  };
}

function _resolveMatchPlaySideTeamIds(match) {
  const teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
  return {
    teamAId:
      teamGroups[0] && teamGroups[0].id != null ? String(teamGroups[0].id).trim() : '',
    teamBId:
      teamGroups[1] && teamGroups[1].id != null ? String(teamGroups[1].id).trim() : ''
  };
}

function _resolveAnyPlayerId(p) {
  if (!p) return '';
  return _canon(p.userId || p.playerId || p.id || '');
}

function _buildRegisterLookup(match) {
  const map = {};
  const users =
    match && match.registerInfo && Array.isArray(match.registerInfo.users)
      ? match.registerInfo.users
      : [];
  users.forEach(function (user) {
    const uid = _resolveAnyPlayerId(user);
    if (uid) map[uid] = user;
  });
  return map;
}

function _resolvePlayerAvatar(userId, slotPlayer, registerUser) {
  const slot = slotPlayer || {};
  const reg = registerUser || {};
  const src =
    _trim(reg.avatar) ||
    _trim(reg.avatarUrl) ||
    _trim(slot.avatar) ||
    _trim(slot.avatarUrl) ||
    '';
  // 仅球员公开头像；缺失走默认头像（不用备注头像 / 球队 LOGO）
  return mockAvatars.resolveAvatar(src, userId) || mockAvatars.DEFAULT_AVATAR;
}

function _buildSideAvatarMembers(players, registerLookup, maxCount) {
  const list = Array.isArray(players) ? players : [];
  const out = [];
  const limit = maxCount > 0 ? maxCount : list.length;
  for (let i = 0; i < list.length && out.length < limit; i++) {
    const p = list[i];
    if (!p || !p.userId) continue;
    out.push({
      userId: p.userId,
      avatar: _resolvePlayerAvatar(p.userId, p.raw, registerLookup[p.userId])
    });
  }
  // 叠放：数组左→右业务顺序不变；视觉上左侧最高（stackZ = n - index）
  const n = out.length;
  for (let j = 0; j < n; j++) {
    out[j].stackZ = n - j;
  }
  return out;
}

function _resolveMatchPlaySides(match, group, isG5) {
  const groupId = group && group.groupId != null ? String(group.groupId).trim() : '';
  const bucket = teamMatchStore.normalizeGroupScoreBucket(
    match.scoreData && match.scoreData[groupId]
  );
  const teamIds = _resolveMatchPlaySideTeamIds(match);
  const teamAId = teamIds.teamAId;
  const teamBId = teamIds.teamBId;
  const registerLookup = _buildRegisterLookup(match);

  const teamIdByUser = {};
  Object.keys(registerLookup).forEach(function (uid) {
    const user = registerLookup[uid];
    const teamId =
      user.matchTeamId != null && String(user.matchTeamId).trim() !== ''
        ? String(user.matchTeamId).trim()
        : user.groupId != null && String(user.groupId).trim() !== ''
          ? String(user.groupId).trim()
          : '';
    if (teamId) teamIdByUser[uid] = teamId;
  });

  const filled = (Array.isArray(group && group.players) ? group.players : [])
    .map(function (p) {
      return {
        userId: _resolveAnyPlayerId(p),
        position: Number(p && (p.position != null ? p.position : p.slotIndex)) || 0,
        raw: p
      };
    })
    .filter(function (p) {
      return p.userId;
    })
    .sort(function (a, b) {
      return a.position - b.position || String(a.userId).localeCompare(String(b.userId));
    });

  const playersA = [];
  const playersB = [];
  filled.forEach(function (p) {
    const tid = teamIdByUser[p.userId] || '';
    if (teamAId && tid === teamAId) playersA.push(p);
    else if (teamBId && tid === teamBId) playersB.push(p);
  });
  // 无分队归属：与得分榜一致按座位拆边（不因发布者交换红蓝）
  if (!playersA.length && !playersB.length) {
    if (filled.length <= 2) {
      if (filled[0]) playersA.push(filled[0]);
      if (filled[1]) playersB.push(filled[1]);
    } else {
      const mid = Math.ceil(filled.length / 2);
      filled.forEach(function (p, idx) {
        if (idx < mid) playersA.push(p);
        else playersB.push(p);
      });
    }
  }

  let scoresA = [];
  let scoresB = [];
  if (isG5) {
    const recA = playersA[0]
      ? _resolveScoresByPlayer(bucket.scoresByPlayer, playersA[0].userId, playersA[0].raw)
      : null;
    const recB = playersB[0]
      ? _resolveScoresByPlayer(bucket.scoresByPlayer, playersB[0].userId, playersB[0].raw)
      : null;
    scoresA = recA && Array.isArray(recA.scores) ? recA.scores.slice() : [];
    scoresB = recB && Array.isArray(recB.scores) ? recB.scores.slice() : [];
  } else {
    const scoresBySide =
      bucket.scoresBySide && typeof bucket.scoresBySide === 'object' ? bucket.scoresBySide : {};
    const rawA =
      (teamAId && scoresBySide[teamAId]) || scoresBySide.A || scoresBySide.a || null;
    const rawB =
      (teamBId && scoresBySide[teamBId]) || scoresBySide.B || scoresBySide.b || null;
    const normA = teamMatchStore.normalizeSideScoreRecord(teamAId || 'A', 'A', rawA);
    const normB = teamMatchStore.normalizeSideScoreRecord(teamBId || 'B', 'B', rawB);
    scoresA = normA && Array.isArray(normA.scores) ? normA.scores.slice() : [];
    scoresB = normB && Array.isArray(normB.scores) ? normB.scores.slice() : [];
  }

  let startHole = 1;
  const meta = teamMatchStore.normalizeMatchPlayMeta(bucket.matchPlayMeta);
  if (meta && meta.startHole) {
    startHole = meta.startHole;
  } else {
    for (let hi = 0; hi < 18; hi++) {
      if (!_isFilled(scoresA[hi]) || !_isFilled(scoresB[hi])) continue;
      const sa = Number(scoresA[hi]);
      const sb = Number(scoresB[hi]);
      if (!Number.isFinite(sa) || !Number.isFinite(sb)) continue;
      startHole = hi + 1;
      break;
    }
  }

  const avatarLimit = isG5 ? 1 : 0;
  return {
    scoresA: scoresA,
    scoresB: scoresB,
    startHole: startHole,
    teamAId: teamAId,
    teamBId: teamBId,
    playersA: playersA,
    playersB: playersB,
    sideAAvatars: _buildSideAvatarMembers(playersA, registerLookup, avatarLimit),
    sideBAvatars: _buildSideAvatarMembers(playersB, registerLookup, avatarLimit)
  };
}

function _resolveGameStrokeScores(game, authorUserId) {
  const built = gameLeaderboard.build(game) || {};
  const scoresIndex = built.scoresIndex || {};
  const leaderboard = built.leaderboard || [];
  for (let i = 0; i < leaderboard.length; i++) {
    const row = leaderboard[i];
    if (!row) continue;
    if (row.playerId && _sameUser(row.playerId, authorUserId)) {
      return {
        scores: scoresIndex[row.rowId] || row.scores || [],
        subjectType: 'personal',
        subjectId: _canon(authorUserId)
      };
    }
    const members = Array.isArray(row.members) ? row.members : [];
    for (let j = 0; j < members.length; j++) {
      if (members[j] && _sameUser(members[j].playerId, authorUserId)) {
        return {
          scores: scoresIndex[row.rowId] || row.scores || [],
          subjectType: 'side_entity',
          subjectId: row.rowId || row.teamId || ''
        };
      }
    }
  }
  const groups = Array.isArray(game.groups) ? game.groups : [];
  for (let g = 0; g < groups.length; g++) {
    const grp = groups[g];
    const rec = _resolveScoresByPlayer(grp && grp.scoresByPlayer, authorUserId);
    if (rec && Array.isArray(rec.scores)) {
      return {
        scores: rec.scores,
        subjectType: 'personal',
        subjectId: _canon(authorUserId)
      };
    }
  }
  return null;
}

function _navIdentity(related, authorUserId, viewUrl) {
  const r = related || {};
  const uid = _canon(authorUserId || r.userId);
  return {
    authorUserId: uid,
    targetUserId: uid,
    sourceType: r.sourceType === 'team_match' ? 'team_match' : 'game',
    gameId: r.gameId || null,
    matchId: r.matchId || null,
    groupId: r.groupId || null,
    slotId: r.slotId || null,
    viewUrl: viewUrl || ''
  };
}

function _unavailable(message, extra) {
  return Object.assign(
    {
      ok: false,
      unavailable: true,
      message: message || '成绩卡暂不可用',
      kind: '',
      stroke: null,
      matchPlay: null,
      viewUrl: '',
      matchName: '',
      courseName: '',
      modeLabel: '',
      publicScorecardId: '',
      scoreRevision: '0',
      authorUserId: '',
      targetUserId: '',
      sourceType: '',
      gameId: null,
      matchId: null,
      groupId: null,
      slotId: null
    },
    extra || {}
  );
}

/**
 * @param {string} publicScorecardId
 * @param {string} viewerUserId
 * @param {{ relatedGame?: object, authorUserId?: string, scoreDisplayMode?: string }} [options]
 */
function resolvePublicScorecardView(publicScorecardId, viewerUserId, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const psc = _trim(publicScorecardId);
  if (!psc) return _unavailable('成绩卡暂不可用');

  const authorUserId = _canon(
    opts.authorUserId || (opts.relatedGame && opts.relatedGame.userId)
  );
  if (!authorUserId) return _unavailable('成绩卡暂不可用');
  const related = playerMomentPublishContext.normalizeRelatedGame(
    Object.assign({}, opts.relatedGame || {}, { userId: authorUserId })
  );
  if (!related) return _unavailable('成绩卡暂不可用');

  const expected = playerMomentPublishContext.buildPublicScorecardId({
    sourceType: related.sourceType,
    gameId: related.gameId,
    matchId: related.matchId,
    groupId: related.groupId,
    slotId: related.slotId,
    userId: authorUserId
  });
  if (!expected || expected !== psc || expected !== related.publicScorecardId) {
    return _unavailable('成绩卡暂不可用');
  }

  const mode = opts.scoreDisplayMode === 'diff' ? 'diff' : 'gross';
  const viewUrl = playerMomentPublishContext.buildRelatedGameViewUrl(related);
  const nav = _navIdentity(related, authorUserId, viewUrl);
  const baseMeta = Object.assign(
    {
      matchName: related.matchName || '本场比赛',
      publicScorecardId: psc,
      viewUrl: viewUrl,
      gameMode: related.gameMode || ''
    },
    nav
  );

  try {
    if (related.sourceType === 'team_match') {
      const match = teamMatchStore.getMatchById(related.matchId);
      if (!match) return Object.assign(_unavailable('成绩卡暂不可用'), baseMeta);
      const group = _findGroup(match, related.groupId);
      if (!group) return Object.assign(_unavailable('成绩卡暂不可用'), baseMeta);
      const gameMode = strokeEntityValidator.resolveGameMode(match);
      const pars = resolveHolePars(match);
      const courseName = resolveCourseName(match, related);
      const scoreRevision = resolveScoreRevisionForSource(
        'team_match',
        match,
        group && group.groupId
      );

      if (strokeEntityValidator.isMatchPlayBoardMode(gameMode)) {
        const isG5 = strokeEntityValidator.isG5MatchPlayMode(gameMode);
        const sides = _resolveMatchPlaySides(match, group, isG5);
        const groupCompleted = !!(
          matchStatus.isGroupConfirmedFinished(group && group.status) ||
          matchStatus.getMatchStatus(group, { source: 'groups' }).isCompleted
        );
        const detail = buildMatchPlayDetailFromSides(
          sides.scoresA,
          sides.scoresB,
          sides.startHole,
          groupCompleted
        );
        detail.sideAAvatars = sides.sideAAvatars;
        detail.sideBAvatars = sides.sideBAvatars;
        const matchStatusKey = String(match.status || '').toLowerCase();
        return Object.assign(
          {
            ok: true,
            unavailable: false,
            message: '',
            kind: 'match_play',
            stroke: null,
            matchPlay: detail,
            subjectType: 'match_play_side',
            matchName: baseMeta.matchName,
            courseName: courseName,
            modeLabel: resolveMatchPlayModeLabel(gameMode),
            publicScorecardId: psc,
            gameMode: gameMode,
            scoreRevision: scoreRevision,
            live: !groupCompleted && matchStatusKey === 'ongoing'
          },
          nav
        );
      }

      const strokeSrc = _resolveTeamMatchStrokeScores(
        match,
        String(group.groupId),
        authorUserId
      );
      const stroke = buildStrokeScorecardFromScores(strokeSrc.scores, pars, mode);
      const matchStatusKey = String(match.status || '').toLowerCase();
      const groupCompletedStroke = !!(
        matchStatus.isGroupConfirmedFinished(group && group.status) ||
        matchStatus.getMatchStatus(group, { source: 'groups' }).isCompleted
      );
      return Object.assign(
        {
          ok: true,
          unavailable: false,
          message: '',
          kind: 'stroke',
          stroke: stroke,
          matchPlay: null,
          subjectType: strokeSrc.subjectType,
          matchName: baseMeta.matchName,
          courseName: courseName,
          modeLabel: resolveStrokeModeLabel(gameMode),
          publicScorecardId: psc,
          gameMode: gameMode,
          scoreRevision: scoreRevision,
          live: !groupCompletedStroke && matchStatusKey === 'ongoing'
        },
        nav
      );
    }

    const game = gameStore.getGame(related.gameId);
    if (!game) return Object.assign(_unavailable('成绩卡暂不可用'), baseMeta);
    const strokeSrc = _resolveGameStrokeScores(game, authorUserId);
    if (!strokeSrc) return Object.assign(_unavailable('成绩卡暂不可用'), baseMeta);
    const pars = resolveHolePars(game);
    const stroke = buildStrokeScorecardFromScores(strokeSrc.scores, pars, mode);
    // 展示标签优先中文 gameMode；仅在缺失时用 formatType（仍走中文映射，禁止原样输出）
    const gameMode =
      _trim(related.gameMode || game.gameMode || game.formatType || '') || '个人比杆赛';
    const scoreRevision = resolveScoreRevisionForSource('game', game, related.groupId);
    return Object.assign(
      {
        ok: true,
        unavailable: false,
        message: '',
        kind: 'stroke',
        stroke: stroke,
        matchPlay: null,
        subjectType: strokeSrc.subjectType,
        matchName: baseMeta.matchName,
        courseName: resolveCourseName(game, related),
        modeLabel: resolveStrokeModeLabel(gameMode),
        publicScorecardId: psc,
        gameMode: gameMode,
        scoreRevision: scoreRevision,
        live: String(game.status || '').toLowerCase() === 'live'
      },
      nav
    );
  } catch (e) {
    return Object.assign(_unavailable('成绩卡暂不可用'), baseMeta);
  }
}

/**
 * 批量投影：缓存 key = publicScorecardId + scoreRevision
 * 不把完整比赛对象写入返回值 / 动态存储
 */
function attachPublicScorecardsToMoments(moments, viewerUserId, options) {
  const list = Array.isArray(moments) ? moments : [];
  const opts = options && typeof options === 'object' ? options : {};
  const cache = {};
  return list.map(function (card) {
    if (!card) return card;
    const related = card.relatedGame;
    const psc = related && related.publicScorecardId;
    if (!psc) {
      return Object.assign({}, card, {
        publicScorecard: _unavailable('成绩卡暂不可用')
      });
    }
    // 先轻量取 revision，再决定是否命中缓存
    let scoreRevision = '0';
    try {
      if (related.sourceType === 'team_match' && related.matchId) {
        const match = teamMatchStore.getMatchById(related.matchId);
        scoreRevision = resolveScoreRevisionForSource(
          'team_match',
          match,
          related.groupId
        );
      } else if (related.gameId) {
        const game = gameStore.getGame(related.gameId);
        scoreRevision = resolveScoreRevisionForSource('game', game, related.groupId);
      }
    } catch (e) {
      scoreRevision = '0';
    }
    const cacheKey = String(psc) + '::' + String(scoreRevision);
    if (!cache[cacheKey]) {
      const view = resolvePublicScorecardView(psc, viewerUserId, {
        relatedGame: related,
        authorUserId: card.authorUserId,
        scoreDisplayMode: opts.scoreDisplayMode
      });
      if (view && !view.scoreRevision) view.scoreRevision = scoreRevision;
      cache[cacheKey] = view;
    }
    return Object.assign({}, card, {
      publicScorecard: cache[cacheKey]
    });
  });
}

module.exports = {
  resolvePublicScorecardView: resolvePublicScorecardView,
  attachPublicScorecardsToMoments: attachPublicScorecardsToMoments,
  buildStrokeScorecardFromScores: buildStrokeScorecardFromScores,
  buildMatchPlayDetailFromSides: buildMatchPlayDetailFromSides,
  resolveStrokeModeLabel: resolveStrokeModeLabel,
  resolveMatchPlayModeLabel: resolveMatchPlayModeLabel,
  getScoreStoreRevision: getScoreStoreRevision,
  resolveScoreRevisionForSource: resolveScoreRevisionForSource
};
