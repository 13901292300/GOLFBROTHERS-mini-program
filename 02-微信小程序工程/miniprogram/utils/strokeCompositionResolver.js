/**
 * G2/G3 组合解析（只读）：由 match + 单个出发组 → 组合列表
 * 供后续 group-editor / detail TAB / strokeEntityBuilder 复用
 * 本文件不写盘、不改 match
 */

const playerManage = require('./playerManage.js');
const mockAvatars = require('./mockAvatars.js');

const G2_G3_MODES = {
  最好成绩比杆赛: true,
  四人四球比杆赛: true,
  最佳球位比杆赛: true,
  // G6/G7 比洞：复用 G2/G3 组合解析
  最好成绩比洞赛: true,
  四人四球比洞赛: true,
  最佳球位比洞赛: true
};

function resolveGameMode(match) {
  return String((match && (match.gameMode || match.selectedGameMode)) || '').trim();
}

function isG2G3GameMode(match) {
  return !!G2_G3_MODES[resolveGameMode(match)];
}

function resolveCompositionMode(match) {
  const raw =
    match && match.strokeCompositionMode != null
      ? String(match.strokeCompositionMode).trim()
      : '';
  return raw === '2+2' ? '2+2' : '4+0';
}

function resolveUserId(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw).trim();
  const id = raw.userId || raw.playerId || raw.id;
  return id != null ? String(id).trim() : '';
}

function buildRegisterUserMap(match) {
  const users =
    match && match.registerInfo && Array.isArray(match.registerInfo.users)
      ? match.registerInfo.users
      : [];
  const map = {};
  users.forEach((user) => {
    const uid = resolveUserId(user);
    if (!uid) return;
    const teamId =
      user.matchTeamId != null && String(user.matchTeamId).trim() !== ''
        ? String(user.matchTeamId).trim()
        : user.groupId != null && String(user.groupId).trim() !== ''
          ? String(user.groupId).trim()
          : '';
    map[uid] = {
      teamId: teamId,
      nickname: playerManage.resolveMatchNickname
        ? playerManage.resolveMatchNickname(user)
        : String(user.competitionName || user.displayName || user.nickname || uid),
      avatar: user.avatar != null ? String(user.avatar) : ''
    };
  });
  return map;
}

function buildTeamNameMap(match) {
  const map = {};
  const list = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
  list.forEach((g, index) => {
    const id = g && g.id != null ? String(g.id).trim() : '';
    if (!id) return;
    const name = g && g.name != null ? String(g.name).trim() : '';
    map[id] = name || ('分队' + (index + 1));
  });
  return map;
}

function listTeamOrder(match) {
  const list = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
  const order = [];
  const seen = {};
  list.forEach((g) => {
    const id = g && g.id != null ? String(g.id).trim() : '';
    if (!id || seen[id]) return;
    seen[id] = true;
    order.push(id);
  });
  return order;
}

function listFilledGroupPlayers(group) {
  const players = Array.isArray(group && group.players) ? group.players : [];
  return players
    .map((p) => ({
      userId: resolveUserId(p),
      position: Number(p && (p.position != null ? p.position : p.slotIndex)) || 0
    }))
    .filter((p) => p.userId)
    .slice(0, 4);
}

function toMember(player, registerMap) {
  const uid = player.userId;
  const src = registerMap[uid] || {};
  const nickname = src.nickname || uid;
  const avatarRaw = src.avatar || '';
  return {
    userId: uid,
    position: player.position,
    nickname: nickname,
    avatar: mockAvatars.resolveAvatar ? mockAvatars.resolveAvatar(avatarRaw, uid) : avatarRaw
  };
}

function chunkByTwo(sortedMembers) {
  const out = [];
  for (let i = 0; i < sortedMembers.length; i += 2) {
    out.push(sortedMembers.slice(i, i + 2));
  }
  return out;
}

/**
 * @param {object} match
 * @param {object} group 单个出发组（含 players[{position,userId}]）
 * @returns {Array<{ teamId: string, teamName: string, members: Array<{userId,position,nickname,avatar}> }>}
 */
function resolveStrokeCompositions(match, group) {
  if (!isG2G3GameMode(match)) return [];

  const filled = listFilledGroupPlayers(group);
  if (!filled.length) return [];

  const registerMap = buildRegisterUserMap(match);
  const teamNameMap = buildTeamNameMap(match);
  const teamOrder = listTeamOrder(match);
  const mode = resolveCompositionMode(match);

  // 按 teamId 分桶（保留组内出现顺序，桶内再按 position 排）
  const buckets = {};
  filled.forEach((p) => {
    const info = registerMap[p.userId] || {};
    const teamId = info.teamId ? String(info.teamId) : '';
    const key = teamId || '__unknown__';
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(p);
  });

  Object.keys(buckets).forEach((key) => {
    buckets[key].sort(
      (a, b) => a.position - b.position || String(a.userId).localeCompare(String(b.userId))
    );
  });

  const orderedTeamIds = [];
  const used = {};
  teamOrder.forEach((id) => {
    if (buckets[id] && buckets[id].length && !used[id]) {
      orderedTeamIds.push(id);
      used[id] = true;
    }
  });
  Object.keys(buckets).forEach((id) => {
    if (!used[id] && buckets[id] && buckets[id].length) {
      orderedTeamIds.push(id);
      used[id] = true;
    }
  });

  const compositions = [];

  if (mode === '4+0') {
    orderedTeamIds.forEach((teamId) => {
      const list = buckets[teamId] || [];
      if (!list.length) return;
      // 人数允许 1–4；组内已 slice(0,4)
      const members = list.map((p) => toMember(p, registerMap));
      compositions.push({
        teamId: teamId === '__unknown__' ? '' : String(teamId),
        teamName:
          teamId === '__unknown__'
            ? ''
            : teamNameMap[teamId] || String(teamId),
        members: members
      });
    });
    return compositions;
  }

  // 2+2：合法性由 validator 判断；此处只生成组合
  // 单分队：按座位 1+2 / 3+4；双分队及以上：按分队分桶后桶内每 2 人切
  const useSeatPairs = orderedTeamIds.length === 1;

  if (useSeatPairs) {
    const teamId = orderedTeamIds[0];
    const list = buckets[teamId] || [];
    const combo1 = [];
    const combo2 = [];
    list.forEach((p) => {
      const pos = Number(p.position) || 0;
      const member = toMember(p, registerMap);
      if (pos === 1 || pos === 2) combo1.push(member);
      else if (pos === 3 || pos === 4) combo2.push(member);
    });
    combo1.sort(
      (a, b) => a.position - b.position || String(a.userId).localeCompare(String(b.userId))
    );
    combo2.sort(
      (a, b) => a.position - b.position || String(a.userId).localeCompare(String(b.userId))
    );
    const pushSeat = (members) => {
      if (!members.length) return;
      compositions.push({
        teamId: teamId === '__unknown__' ? '' : String(teamId),
        teamName:
          teamId === '__unknown__'
            ? ''
            : teamNameMap[teamId] || String(teamId),
        members: members
      });
    };
    pushSeat(combo1);
    pushSeat(combo2);
    return compositions;
  }

  orderedTeamIds.forEach((teamId) => {
    const list = buckets[teamId] || [];
    if (!list.length) return;
    const membersSorted = list.map((p) => toMember(p, registerMap));
    const chunks = chunkByTwo(membersSorted);
    for (let i = 0; i < chunks.length; i++) {
      const members = chunks[i];
      if (!members.length) continue;
      compositions.push({
        teamId: teamId === '__unknown__' ? '' : String(teamId),
        teamName:
          teamId === '__unknown__'
            ? ''
            : teamNameMap[teamId] || String(teamId),
        members: members
      });
    }
  });

  return compositions;
}

module.exports = {
  resolveStrokeCompositions,
  isG2G3GameMode,
  resolveCompositionMode
};
