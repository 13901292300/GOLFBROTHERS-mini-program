/**
 * 普通 GAME 领先榜：个人模式 / 组合（teams）模式派生
 */
const { getProfileById } = require('./playerDirectory.js');
const holeLayout = require('./holeLayout.js');

function holePars() {
  return holeLayout.getLayout().holePars;
}

// 姓名列约可容纳字符数（与 .lr-player 45% 宽、28rpx 字号估算）
const TEAM_NAME_MAX_UNITS = 14;

function isFilled(s) {
  return s !== null && s !== undefined && s !== '';
}

function formatDiffWithPlus(diff) {
  if (diff > 0) return '+' + diff;
  if (diff === 0) return '0';
  return String(diff);
}

function totalClass(diff) {
  if (diff < 0) return 'score-under';
  if (diff === 0) return 'score-even';
  return 'score-over';
}

function thruLabel(thru) {
  if (!thru) return '-';
  return thru >= 18 ? 'F' : String(thru);
}

function getGroupComposition(game, group, groupIndex) {
  const map = (game && game.groupCompositionMap) || {};
  const gid = (group && group.groupId) || (group && group.id);
  if (gid && map[gid]) return map[gid];
  if (group && group.composition) return group.composition;
  if (groupIndex === 0 && game && game.composition) return game.composition;
  return null;
}

function enrichPlayerIdentity(m) {
  const prof = getProfileById(m.playerId, m);
  return {
    playerId: m.playerId,
    name: m.name || '',
    avatar: m.avatar || '',
    flag: prof.flag || '',
    country: prof.country || '',
    age: prof.age || '',
    isFemale: prof.gender === 'female'
  };
}

function normalizeMembers(team) {
  return ((team && (team.members || team.players)) || []).map(enrichPlayerIdentity);
}

/** 是否存在球员组合（teams）数据 */
function gameHasComposition(game) {
  if (!game) return false;
  const mode = game.gameMode || '';
  if (mode !== '最好成绩赛' && mode !== '最佳球位赛') return false;
  const map = game.groupCompositionMap || {};
  const mapTeams = Object.keys(map).some((gid) => {
    const c = map[gid];
    return c && Array.isArray(c.teams) && c.teams.length > 0;
  });
  if (mapTeams) return true;

  const top = game.composition;
  if (top && Array.isArray(top.teams) && top.teams.length) {
    if (top.teamMode === 'single_team' || top.teamMode === 'split_team') return true;
    if (top.teams.length > 1) return true;
    if (normalizeMembers(top.teams[0]).length > 1) return true;
  }

  return (game.groups || []).some((g, gi) => {
    const c = getGroupComposition(game, g, gi);
    if (!c || !Array.isArray(c.teams) || !c.teams.length) return false;
    if (c.teamMode === 'single_team' || c.teamMode === 'split_team') return true;
    if (c.teams.length > 1) return true;
    return normalizeMembers(c.teams[0]).length > 1;
  });
}

/**
 * 组合名：昵称用 `/` 连接；超长时每名球员相同前缀 N + `…`
 */
function formatTeamDisplayName(names, maxUnits) {
  const list = (names || []).map((n) => String(n || '').trim()).filter(Boolean);
  if (!list.length) return '—';
  const limit = maxUnits || TEAM_NAME_MAX_UNITS;
  const full = list.join('/');
  if (full.length <= limit) return full;

  for (let n = 12; n >= 1; n--) {
    const parts = list.map((name) => (name.length <= n ? name : name.slice(0, n) + '…'));
    const joined = parts.join('/');
    if (joined.length <= limit) return joined;
  }
  return list.map((name) => name.slice(0, 1) + '…').join('/');
}

/** 逐洞取组合成绩：各成员该洞最低有效杆数（最好成绩 / 最佳球位统一引擎） */
function computeTeamHoleScores(members, scoresByPlayer) {
  const memberScores = (members || []).map(
    (m) => ((scoresByPlayer || {})[m.playerId] || {}).scores || []
  );
  const scores = [];
  for (let h = 0; h < 18; h++) {
    let best = null;
    memberScores.forEach((arr) => {
      const s = arr[h];
      if (isFilled(s) && (best === null || Number(s) < best)) best = Number(s);
    });
    scores[h] = best;
  }
  return scores;
}

function resolveTeamScores(group, teamIndex, team) {
  const entities = (group && group.teamScoresByEntity) || [];
  const entity = entities[teamIndex];
  if (entity && Array.isArray(entity.scores) && entity.scores.some(isFilled)) {
    return entity.scores.slice();
  }
  return computeTeamHoleScores(normalizeMembers(team), group.scoresByPlayer || {});
}

function aggregateScores(scores) {
  let total = 0;
  let parThru = 0;
  let thru = 0;
  (scores || []).forEach((s, i) => {
    if (isFilled(s)) {
      total += Number(s);
      parThru += holePars()[i];
      thru += 1;
    }
  });
  return { total, diff: total - parThru, thru };
}

function buildTeamRows(game) {
  const flat = [];
  (game.groups || []).forEach((grp, gi) => {
    const comp = getGroupComposition(game, grp, gi);
    if (!comp || !Array.isArray(comp.teams) || !comp.teams.length) return;

    comp.teams.forEach((team, ti) => {
      const members = normalizeMembers(team);
      if (!members.length) return;
      const scores = resolveTeamScores(grp, ti, team);
      const agg = aggregateScores(scores);
      const names = members.map((m) => m.name);
      const teamId = team.teamId || team.id || 'team-' + (ti + 1);
      const rowId = (grp.groupId || 'g-' + gi) + ':' + teamId;

      flat.push({
        rowId,
        isTeam: true,
        teamId,
        groupId: grp.groupId,
        groupIndex: gi,
        name: formatTeamDisplayName(names),
        nameFull: names.join('/'),
        avatar: members[0].avatar || '',
        members,
        total: agg.total,
        diff: agg.diff,
        thru: agg.thru,
        scores
      });
    });
  });
  return flat;
}

function buildPlayerRows(game) {
  const flat = [];
  (game.groups || []).forEach((grp) => {
    (grp.playersSlots || []).filter(Boolean).forEach((p) => {
      const rec = (grp.scoresByPlayer || {})[p.playerId] || {};
      const scores = (rec.scores || []).slice();
      const agg = aggregateScores(scores);
      const prof = getProfileById(p.playerId, p);
      flat.push({
        rowId: p.playerId,
        isTeam: false,
        playerId: p.playerId,
        name: p.name,
        avatar: p.avatar,
        isFemale: prof.gender === 'female',
        flag: prof.flag,
        country: prof.country,
        age: prof.age,
        player: enrichPlayerIdentity(p),
        total: agg.total,
        diff: agg.diff,
        thru: agg.thru,
        scores
      });
    });
  });
  return flat;
}

function sortAndRank(flat) {
  flat.sort((a, b) => {
    if (a.thru === 0 && b.thru === 0) return 0;
    if (a.thru === 0) return 1;
    if (b.thru === 0) return -1;
    if (a.diff !== b.diff) return a.diff - b.diff;
    return b.thru - a.thru;
  });

  return flat.map((p, i) => {
    const started = p.thru > 0;
    const firstIndex = flat.findIndex((x) => x.thru > 0 && x.diff === p.diff);
    const tied = flat.filter((x) => x.thru > 0 && x.diff === p.diff).length > 1;
    const pos = !started ? '-' : tied ? 'T' + (firstIndex + 1) : String(i + 1);
    return Object.assign({}, p, {
      pos,
      thru: started ? thruLabel(p.thru) : '-',
      scoreStr: started ? formatDiffWithPlus(p.diff) : '-',
      scoreClass: started ? totalClass(p.diff) : 'score-even'
    });
  });
}

/**
 * 构建领先榜行 + scoresIndex（rowId → 18 洞成绩数组）
 */
function build(game, openIndex) {
  const hasComp = gameHasComposition(game);
  const raw = hasComp ? buildTeamRows(game) : buildPlayerRows(game);
  const ranked = sortAndRank(raw);

  const scoresIndex = {};
  ranked.forEach((row) => {
    scoresIndex[row.rowId] = row.scores || [];
  });

  const leaderboard = ranked.map((row, i) =>
    Object.assign({}, row, {
      expanded: openIndex === i
    })
  );

  return { leaderboard, scoresIndex, hasComposition: hasComp };
}

module.exports = {
  holePars,
  gameHasComposition,
  formatTeamDisplayName,
  enrichPlayerIdentity,
  build
};
