/**
 * 统计数据适配层（Stats-0.3-A1）
 *
 * 输入：match（teamMatchStore 比赛对象）
 * 输出：statistics rows（供统计页消费；本 Patch 不接入页面）
 *
 * 数据来源：仅 match.scoreData
 * 身份：复用详情页 / teamMatchStore 的 scorePlayerId 解析规则
 * 洞状态：groupsStore.getScoreStatus
 * 标准杆：holeLayout.resolveLayoutFromContext
 */

const groupsStore = require('./groupsStore.js');
const holeLayout = require('./holeLayout.js');
const halfCourse = require('./halfCourse.js');
const playerManage = require('./playerManage.js');
const tPosition = require('./tPosition.js');
const mockAvatars = require('./mockAvatars.js');
const matchStatus = require('./matchStatus.js');

const SCORE_CELL_COUNT = holeLayout.SCORE_CELL_COUNT || 18;

/** 与详情页 _resolveAnyPlayerId 一致 */
function resolveAnyPlayerId(raw) {
  if (!raw || typeof raw !== 'object') return '';
  const id = raw.userId || raw.playerId || raw.id || raw.uid || raw.openid;
  return id != null ? String(id).trim() : '';
}

/**
 * 与详情页 _resolveSlotScorePlayerId / teamMatchStore.resolveSlotScorePlayerId 一致：
 * scorePlayerId || slotScorePlayerId || scoreOwnerId || currentPlayerId
 */
function resolveSlotScorePlayerId(slotPlayer, currentPlayerId) {
  const p = slotPlayer || {};
  const scorePlayerId = p.scorePlayerId || p.slotScorePlayerId || p.scoreOwnerId;
  const resolved = scorePlayerId != null ? String(scorePlayerId).trim() : '';
  if (resolved) return resolved;
  return currentPlayerId != null ? String(currentPlayerId).trim() : '';
}

/** 与详情页 _resolveScoresByPlayerRecord 一致 */
function resolveScoresByPlayerRecord(scoresByPlayer, slotPlayer, currentPlayerId) {
  if (!scoresByPlayer || typeof scoresByPlayer !== 'object') return null;
  const scorePlayerId = resolveSlotScorePlayerId(slotPlayer, currentPlayerId);
  if (scorePlayerId && scoresByPlayer[scorePlayerId]) return scoresByPlayer[scorePlayerId];
  const playerId = currentPlayerId != null ? String(currentPlayerId).trim() : '';
  if (playerId && scoresByPlayer[playerId]) return scoresByPlayer[playerId];
  return null;
}

function isFilledScore(score) {
  if (typeof matchStatus.isFilledScore === 'function') {
    return matchStatus.isFilledScore(score) && !Number.isNaN(Number(score));
  }
  return score !== null && score !== undefined && score !== '' && !Number.isNaN(Number(score));
}

/** 与详情页 _getMatchHolePars 等价 */
function resolveMatchHolePars(match) {
  if (!match) return holeLayout.getLayout().holePars.slice();
  const parsed = (!match.front9Course && !match.back9Course)
    ? halfCourse.parseCourseHalfText(match.courseHalfText || match.courseHalf || match.halfText)
    : {};
  const layout = holeLayout.resolveLayoutFromContext({
    courseId: match.courseId || '',
    courseName: match.courseName || '',
    front9Course: match.front9Course || parsed.front9Course || null,
    back9Course: match.back9Course || parsed.back9Course || null
  });
  return (layout.holePars || []).slice();
}

function collectRegisterPlayerSources(match) {
  const lists = [];
  const pushList = (arr) => {
    if (Array.isArray(arr) && arr.length) lists.push(arr);
  };
  const registerInfo = match && match.registerInfo;
  if (registerInfo && typeof registerInfo === 'object') {
    pushList(registerInfo.users);
    pushList(registerInfo.players);
  }
  pushList(match && match.participants);
  pushList(match && match.players);
  return lists;
}

/** 报名名单 lookup：昵称 / 头像 / 性别 / T台（与详情 hydrate 同源字段） */
function buildPlayerLookup(match) {
  const map = {};
  collectRegisterPlayerSources(match).forEach((users) => {
    users.forEach((u) => {
      if (!u || typeof u !== 'object') return;
      const primaryId = resolveAnyPlayerId(u);
      if (!primaryId) return;
      const gender = playerManage.resolveMatchGender
        ? playerManage.resolveMatchGender(u)
        : (playerManage.getGenderDisplay(u).gender || '');
      const teeCode = tPosition.defaultFromGender(gender);
      const entry = {
        userId: primaryId,
        nickname: playerManage.resolveMatchNickname(u) || '未知球员',
        avatar: u.avatar || u.avatarUrl || '',
        gender: gender,
        tee: teeCode,
        tPosition: u.tPosition || teeCode
      };
      const aliasIds = [u.userId, u.playerId, u.id, u.uid, u.openid]
        .map((v) => (v != null ? String(v).trim() : ''))
        .filter(Boolean);
      if (aliasIds.indexOf(primaryId) < 0) aliasIds.push(primaryId);
      aliasIds.forEach((id) => {
        if (!map[id]) map[id] = entry;
      });
    });
  });
  return map;
}

function resolveTeeColor(player, lookup) {
  if (player && player.teeColor) return String(player.teeColor);
  const tp = tPosition.resolve(
    Object.assign({}, lookup || {}, player || {})
  );
  return tp === tPosition.RED_T ? '#dc2626' : '#00aeef';
}

/**
 * 8421 单洞得分：按相对标准杆 diff
 * diff <= -3 → 32；-2→16；-1→8；0→4；1→2；2→1；3→0；>=4 → 3-diff
 */
function get8421Score(diff) {
  const d = Number(diff);
  if (!Number.isFinite(d)) return 0;
  if (d <= -3) return 32;
  if (d === -2) return 16;
  if (d === -1) return 8;
  if (d === 0) return 4;
  if (d === 1) return 2;
  if (d === 2) return 1;
  if (d === 3) return 0;
  return 3 - d;
}

/**
 * 单球员：由 scores/putts/fairways/penalties/sands + pars 计算统计
 * 同一洞循环内累加 TOTAL / PUT / GIR% / FWY% / PEN / SAND / 8421 / EAG…DBL+；未填洞不参与
 *
 * PUT：已填成绩洞对应 putts[i] 之和（默认 2，最小 0）
 * GIR：approachStrokes = score - putts；若 approachStrokes <= par - 2 则计 GIR
 *      girPercent = girCount / playedHoles * 100（仅已完成洞）
 * FWY：仅已填且 Par 4/5；fairwayHit / fairwayAttempt * 100；无有效开球洞为 '-'
 * PEN：已填成绩洞对应 penalties[i] 之和（缺省 0）；无完成洞为 0（同 PUT）
 * SAND：已填成绩洞对应 sands[i] 之和（缺省 0）；无完成洞为 0（同 PUT）
 * 8421：已填且 holePar 存在时累加 get8421Score(score - par)；无完成洞为 '-'
 */
function computePlayerHoleStats(scores, putts, pars, fairways, penalties, sands) {
  const scoreArr = Array.isArray(scores) ? scores : [];
  const puttArr = Array.isArray(putts) ? putts : [];
  const parArr = Array.isArray(pars) ? pars : [];
  const fairwayArr = Array.isArray(fairways) ? fairways : [];
  const penaltyArr = Array.isArray(penalties) ? penalties : [];
  const sandArr = Array.isArray(sands) ? sands : [];
  let eagle = 0;
  let birdie = 0;
  let par = 0;
  let bogey = 0;
  let doublePlus = 0;
  let total = 0;
  let puttsTotal = 0;
  let penaltyTotal = 0;
  let sandTotal = 0;
  let girCount = 0;
  let playedHoles = 0;
  let fairwayAttempt = 0;
  let fairwayHit = 0;
  let stat8421Sum = 0;
  const limit = Math.min(SCORE_CELL_COUNT, Math.max(scoreArr.length, parArr.length, 18));

  for (let i = 0; i < limit; i++) {
    const score = scoreArr[i];
    if (!isFilledScore(score)) continue;

    const scoreNum = Number(score);
    total += scoreNum;
    playedHoles += 1;

    const rawPutt = puttArr[i];
    const puttRawNum = (rawPutt === null || rawPutt === undefined || rawPutt === '')
      ? 2
      : Number(rawPutt);
    const puttNum = Number.isFinite(puttRawNum) && puttRawNum >= 0 ? puttRawNum : 2;
    puttsTotal += puttNum;

    penaltyTotal += Number(penaltyArr[i]) || 0;
    sandTotal += Number(sandArr[i]) || 0;

    const rawPar = parArr[i];
    const hasHolePar = rawPar !== null && rawPar !== undefined && rawPar !== '' && !Number.isNaN(Number(rawPar));
    const holePar = hasHolePar ? Number(rawPar) : Number(rawPar || 0);

    const approachStrokes = scoreNum - puttNum;
    if (approachStrokes <= holePar - 2) girCount += 1;

    if (holePar === 4 || holePar === 5) {
      fairwayAttempt += 1;
      if (fairwayArr[i] === 'fairway') fairwayHit += 1;
    }

    if (hasHolePar) {
      stat8421Sum += get8421Score(scoreNum - holePar);
    }

    const status = groupsStore.getScoreStatus(scoreNum - holePar);
    if (status === 'eagle') eagle += 1;
    else if (status === 'birdie') birdie += 1;
    else if (status === 'par') par += 1;
    else if (status === 'bogey') bogey += 1;
    else if (status === 'double-bogey') doublePlus += 1;
  }

  const girPercent = playedHoles > 0
    ? Math.round((girCount / playedHoles) * 100) + '%'
    : '-';
  const fairwayPercent = fairwayAttempt > 0
    ? Math.round((fairwayHit / fairwayAttempt) * 100) + '%'
    : '-';
  const stat8421 = playedHoles > 0 ? stat8421Sum : '-';

  return {
    eagle: eagle,
    birdie: birdie,
    par: par,
    bogey: bogey,
    doublePlus: doublePlus,
    putts: puttsTotal,
    girPercent: girPercent,
    fairwayPercent: fairwayPercent,
    penalty: penaltyTotal,
    sand: sandTotal,
    stat8421: stat8421,
    total: total
  };
}

function getGroupScoreData(match, groupId) {
  const scoreData = match && match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
    ? match.scoreData
    : null;
  const gid = groupId != null ? String(groupId).trim() : '';
  if (!scoreData || !gid) return null;
  const groupScoreData = scoreData[gid];
  return groupScoreData && typeof groupScoreData === 'object' ? groupScoreData : null;
}

/**
 * @param {object} match teamMatchStore 比赛对象
 * @returns {Array<object>} statistics rows
 */
function buildStatisticsRows(match) {
  if (!match || typeof match !== 'object') return [];
  const pars = resolveMatchHolePars(match);
  const lookup = buildPlayerLookup(match);
  const groups = Array.isArray(match.groups) ? match.groups : [];
  const rows = [];
  const seen = {};

  groups.forEach((group) => {
    const groupId = group && group.groupId != null ? String(group.groupId).trim() : '';
    const groupScoreData = getGroupScoreData(match, groupId);
    const scoresByPlayer = groupScoreData &&
      groupScoreData.scoresByPlayer &&
      typeof groupScoreData.scoresByPlayer === 'object'
      ? groupScoreData.scoresByPlayer
      : null;
    const players = Array.isArray(group && group.players) ? group.players : [];

    players.forEach((player) => {
      const playerId = resolveAnyPlayerId(player);
      if (!playerId) return;
      const scoreOwnerId = resolveSlotScorePlayerId(player, playerId);
      const dedupeKey = scoreOwnerId || playerId;
      if (seen[dedupeKey]) return;
      seen[dedupeKey] = true;

      const record = resolveScoresByPlayerRecord(scoresByPlayer, player, playerId);
      const scores = record && Array.isArray(record.scores) ? record.scores : [];
      const putts = record && Array.isArray(record.putts) ? record.putts : [];
      const fairways = record && Array.isArray(record.fairways) ? record.fairways : [];
      const penalties = record && Array.isArray(record.penalties) ? record.penalties : [];
      const sands = record && Array.isArray(record.sands) ? record.sands : [];
      const holeStats = computePlayerHoleStats(scores, putts, pars, fairways, penalties, sands);

      const meta = lookup[playerId] || lookup[scoreOwnerId] || {};
      const genderDisplay = playerManage.getGenderDisplay(
        Object.assign({}, meta, player, {
          gender: meta.gender || player.gender
        })
      );
      const name =
        playerManage.resolveMatchNickname(Object.assign({}, meta, player)) ||
        meta.nickname ||
        '未知球员';
      const avatar = mockAvatars.resolveAvatar(
        meta.avatar || player.avatar || player.avatarUrl || '',
        playerId
      );

      rows.push({
        playerId: playerId,
        scorePlayerId: scoreOwnerId || playerId,
        groupId: groupId,
        avatar: avatar,
        name: name,
        gender: genderDisplay.gender || '',
        genderIcon: genderDisplay.icon || '',
        teeColor: resolveTeeColor(player, meta),
        eagle: holeStats.eagle,
        birdie: holeStats.birdie,
        par: holeStats.par,
        bogey: holeStats.bogey,
        doublePlus: holeStats.doublePlus,
        girPercent: holeStats.girPercent,
        putts: holeStats.putts,
        fairwayPercent: holeStats.fairwayPercent,
        sand: holeStats.sand,
        penalty: holeStats.penalty,
        stat8421: holeStats.stat8421,
        total: holeStats.total
      });
    });
  });

  return rows;
}

module.exports = {
  buildStatisticsRows,
  computePlayerHoleStats,
  get8421Score,
  resolveMatchHolePars,
  resolveSlotScorePlayerId,
  resolveScoresByPlayerRecord,
  resolveAnyPlayerId
};
