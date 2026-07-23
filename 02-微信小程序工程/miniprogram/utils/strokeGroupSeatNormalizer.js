/**
 * 正式分组座位规范化（报名保存）
 * position = 正式比赛座位，不是用户选择顺序。
 * 只改 groups.players 的 position / userId 占位；不碰 pairing / entity / score。
 */

const PLAYER_SLOTS = 4;

function resolveUserId(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw).trim();
  const id = raw.userId || raw.playerId || raw.id;
  return id != null ? String(id).trim() : '';
}

function buildRegisterTeamMap(match) {
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
    if (teamId) map[uid] = teamId;
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

/** 四槽：position 1–4；空位 userId='' */
function buildSlotPlayers(orderedUserIds) {
  const ids = Array.isArray(orderedUserIds) ? orderedUserIds : [];
  return Array.from({ length: PLAYER_SLOTS }, (_, i) => ({
    position: i + 1,
    userId: ids[i] ? String(ids[i]).trim() : ''
  }));
}

/**
 * 规范化正式 groups 座位
 * - 双分队：第一分队 → 1,2；第二分队 → 3,4
 * - 单分队：稳定序重编 position 1–N（其余槽空）
 * - 其他（0 / 3+ 分队等）：原样返回
 *
 * @param {array} groups
 * @param {object} match 需 registerInfo / teamGroups
 * @returns {array}
 */
function normalizeFormalGroupSeats(groups, match) {
  if (!Array.isArray(groups) || !groups.length) return groups || [];
  const teamMap = buildRegisterTeamMap(match);
  const teamOrder = listTeamOrder(match);

  return groups.map((group) => {
    const players = Array.isArray(group && group.players) ? group.players : [];
    const filled = players
      .map((p) => ({
        userId: resolveUserId(p),
        position: Number(p && (p.position != null ? p.position : p.slotIndex)) || 0
      }))
      .filter((p) => p.userId)
      .sort((a, b) => a.position - b.position || String(a.userId).localeCompare(String(b.userId)));

    if (!filled.length) {
      return group;
    }

    const buckets = {};
    filled.forEach((p) => {
      const teamId = teamMap[p.userId] || '__unknown__';
      if (!buckets[teamId]) buckets[teamId] = [];
      buckets[teamId].push(p.userId);
    });

    const presentTeamIds = [];
    const used = {};
    teamOrder.forEach((id) => {
      if (buckets[id] && buckets[id].length && !used[id]) {
        presentTeamIds.push(id);
        used[id] = true;
      }
    });
    Object.keys(buckets).forEach((id) => {
      if (!used[id] && buckets[id] && buckets[id].length) {
        presentTeamIds.push(id);
        used[id] = true;
      }
    });

    let nextUserIds = null;
    if (presentTeamIds.length === 1) {
      // 单分队：稳定序 → position 1–N，其余空槽
      const list = buckets[presentTeamIds[0]] || [];
      nextUserIds = Array.from({ length: PLAYER_SLOTS }, (_, i) => (list[i] ? list[i] : ''));
    } else if (presentTeamIds.length === 2) {
      // 双分队：第一队 1+2，第二队 3+4
      const a = (buckets[presentTeamIds[0]] || []).slice(0, 2);
      const b = (buckets[presentTeamIds[1]] || []).slice(0, 2);
      while (a.length < 2) a.push('');
      while (b.length < 2) b.push('');
      nextUserIds = [a[0], a[1], b[0], b[1]];
    }

    if (!nextUserIds) {
      return group;
    }

    return Object.assign({}, group, {
      players: buildSlotPlayers(nextUserIds)
    });
  });
}

module.exports = {
  normalizeFormalGroupSeats,
  PLAYER_SLOTS
};
