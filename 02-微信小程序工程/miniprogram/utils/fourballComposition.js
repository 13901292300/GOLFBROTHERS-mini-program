/**
 * 普通创建 fourball_best：组合拓扑纯函数（不依赖 Page / 不写盘）。
 *
 * 记分页轻量调整：只改 members 映射，不重新选择已有球员、不进 grouping / 修改比赛。
 */

function partType(size) {
  const n = Number(size) || 0;
  if (n >= 4) return 'quad';
  if (n === 3) return 'triple';
  if (n === 2) return 'pair';
  return 'single';
}

function cloneMember(m) {
  if (!m) return null;
  const playerId = String(m.playerId || m.userId || m.id || '').trim();
  if (!playerId) return null;
  return {
    playerId: playerId,
    userId: m.userId != null && String(m.userId).trim() ? String(m.userId).trim() : playerId,
    name: (m.name || '球员').trim() || '球员',
    avatar: m.avatar || '',
    gender: m.gender || '',
    tPosition: m.tPosition || '',
    tee: m.tee || m.tPosition || ''
  };
}

function teamMembers(team) {
  if (!team) return [];
  const raw = Array.isArray(team.members)
    ? team.members
    : Array.isArray(team.players)
      ? team.players
      : [];
  return raw.map(cloneMember).filter(Boolean);
}

function makeTeam(teamIndex, teamId, members, prevTeam) {
  const list = (members || []).map(cloneMember).filter(Boolean);
  return {
    teamIndex: teamIndex,
    teamId: teamId || 'team-' + teamIndex,
    name: (prevTeam && prevTeam.name) || '队伍 ' + teamIndex,
    type: partType(list.length),
    players: list.slice(),
    members: list.slice()
  };
}

function resolveCompositionType(comp) {
  if (!comp) return '';
  return String(comp.compositionType || comp.type || '').trim();
}

/** '3+1' → [3, 1]；无效则 null */
function parseCompositionParts(compositionType) {
  const type = String(compositionType || '').trim();
  if (!type || type.indexOf('+') < 0) return null;
  const parts = type.split('+').map((n) => Number(n));
  if (!parts.length || parts.some((n) => !n || n < 1 || Number.isNaN(n))) return null;
  return parts;
}

/** 按组合容量决定 team.type（缺员时仍用目标容量，不因 members 变少降级） */
function teamTypeForCapacity(capacity, membersLen) {
  const cap = Number(capacity) || 0;
  if (cap >= 4) return 'quad';
  if (cap === 3) return 'triple';
  if (cap === 2) return membersLen === 1 ? 'single' : 'pair';
  if (cap === 1) return 'single';
  return partType(membersLen);
}

/** 结构是否为 2+1（一 pair + 一 single，共 3 人） */
function isFourball21Shape(comp) {
  const teams = (comp && Array.isArray(comp.teams) ? comp.teams : []).filter(Boolean);
  if (teams.length !== 2) return false;
  let pair = 0;
  let single = 0;
  let total = 0;
  teams.forEach((t) => {
    const n = teamMembers(t).length;
    total += n;
    if (n === 2) pair += 1;
    if (n === 1) single += 1;
  });
  return total === 3 && pair === 1 && single === 1;
}

/** Seat Model：固定 4 座 */
const FOURBALL_SEAT_COUNT = 4;

function emptySeat(seatIndex) {
  return {
    seatIndex: seatIndex,
    teamId: null,
    playerId: null,
    name: '',
    avatar: ''
  };
}

function cloneSeat(seat, fallbackIndex) {
  if (!seat) return emptySeat(fallbackIndex);
  const seatIndex = Number(seat.seatIndex) || fallbackIndex;
  const teamId =
    seat.teamId != null && String(seat.teamId).trim()
      ? String(seat.teamId).trim()
      : null;
  const playerId =
    seat.playerId != null && String(seat.playerId).trim()
      ? String(seat.playerId).trim()
      : null;
  return {
    seatIndex: seatIndex,
    teamId: teamId,
    playerId: playerId,
    name: seat.name || '',
    avatar: seat.avatar || ''
  };
}

/**
 * 旧 composition 无 seats 时：按 teams.members 顺序临时派生（不写回 composition）。
 * 映射与创建端一致：2+2 / 3+1 / 2+1+1 / 2+1（不足补空座至 seat4）。
 */
function buildSeatsFromTeams(teams) {
  const seats = [];
  (Array.isArray(teams) ? teams : []).forEach((t) => {
    if (!t || seats.length >= FOURBALL_SEAT_COUNT) return;
    const teamId =
      t.teamId != null && String(t.teamId).trim()
        ? String(t.teamId).trim()
        : null;
    const raw = Array.isArray(t.members)
      ? t.members
      : Array.isArray(t.players)
        ? t.players
        : [];
    raw.forEach((m) => {
      if (seats.length >= FOURBALL_SEAT_COUNT) return;
      const playerId =
        m && (m.playerId != null || m.userId != null || m.id != null)
          ? String(m.playerId || m.userId || m.id).trim()
          : '';
      seats.push({
        seatIndex: seats.length + 1,
        teamId: teamId,
        playerId: playerId || null,
        name: (m && m.name) || '',
        avatar: (m && m.avatar) || ''
      });
    });
  });
  while (seats.length < FOURBALL_SEAT_COUNT) {
    seats.push(emptySeat(seats.length + 1));
  }
  return seats;
}

/**
 * Seat Model 统一读取层（只读，不改 composition / teams / storage）。
 *
 * 1) 已有 composition.seats → 直接返回（浅拷贝，避免调用方误改原对象）
 * 2) 旧数据无 seats → 按 teams.members 临时生成固定 4 座
 */
function getCompositionSeats(composition) {
  if (!composition) {
    return [
      emptySeat(1),
      emptySeat(2),
      emptySeat(3),
      emptySeat(4)
    ];
  }
  if (Array.isArray(composition.seats) && composition.seats.length) {
    const seats = composition.seats.map((s, i) => cloneSeat(s, i + 1));
    while (seats.length < FOURBALL_SEAT_COUNT) {
      seats.push(emptySeat(seats.length + 1));
    }
    return seats.slice(0, FOURBALL_SEAT_COUNT);
  }
  return buildSeatsFromTeams(composition.teams);
}

/**
 * Seat Model：由 seats 派生 teams.members（只读，不改 composition / 不写 storage）。
 *
 * - seats 不存在 / 非数组 → 返回 null（由调用方 fallback）
 * - 空 seat（playerId 空）不进 members
 * - 保留原 teams 的 teamId / teamIndex / type / 其它字段
 * - members 按 seatIndex 升序
 */
function deriveTeamsFromSeats(composition, seats) {
  if (!Array.isArray(seats) || !seats.length) return null;
  const prevTeams = composition && Array.isArray(composition.teams)
    ? composition.teams.filter(Boolean)
    : [];
  if (!prevTeams.length) return null;

  const membersByTeamId = {};
  seats
    .slice()
    .sort((a, b) => (Number(a && a.seatIndex) || 0) - (Number(b && b.seatIndex) || 0))
    .forEach((seat) => {
      if (!seat) return;
      const playerId =
        seat.playerId != null && String(seat.playerId).trim()
          ? String(seat.playerId).trim()
          : '';
      if (!playerId) return;
      const teamId =
        seat.teamId != null && String(seat.teamId).trim()
          ? String(seat.teamId).trim()
          : '';
      if (!teamId) return;
      if (!membersByTeamId[teamId]) membersByTeamId[teamId] = [];
      membersByTeamId[teamId].push({
        playerId: playerId,
        userId: playerId,
        name: (seat.name || '').trim() || '球员',
        avatar: seat.avatar || ''
      });
    });

  return prevTeams.map((t, ti) => {
    const teamId =
      t.teamId != null && String(t.teamId).trim()
        ? String(t.teamId).trim()
        : 'team-' + (ti + 1);
    const members = (membersByTeamId[teamId] || []).slice();
    const next = Object.assign({}, t, {
      teamId: teamId,
      teamIndex: t.teamIndex != null ? t.teamIndex : ti + 1,
      type: t.type || partType(members.length),
      members: members,
      players: members.slice()
    });
    return next;
  });
}

/**
 * 2+1 增加第 4 人：由旧 composition + addedPlayer 直接生成目标 teams。
 * 禁止依赖「选人 / grouping」；只改 members，保留原 teamId。
 *
 * 1) 2+2 → pair 不变；single + added
 * 2) 3+1 → pair + added；single 不变
 * 3) 2+1+1 → pair / single 不变；added → team-3
 */
function transitionFourballComposition(oldComposition, addedPlayers, targetType) {
  const type = String(targetType || '').trim();
  if (type !== '2+2' && type !== '3+1' && type !== '2+1+1') return null;

  const teams = (oldComposition && Array.isArray(oldComposition.teams)
    ? oldComposition.teams
    : []
  ).filter(Boolean);
  if (!teams.length) return null;

  let pairTeam = null;
  let singleTeam = null;
  teams.forEach((t) => {
    const n = teamMembers(t).length;
    if (n === 2 && !pairTeam) pairTeam = t;
    else if (n === 1 && !singleTeam) singleTeam = t;
  });
  if (!pairTeam || !singleTeam) return null;

  const pairMembers = teamMembers(pairTeam);
  const singleMembers = teamMembers(singleTeam);
  const added = (addedPlayers || []).map(cloneMember).filter(Boolean);
  if (!added.length) return null;

  if (type === '2+2') {
    return [
      makeTeam(1, pairTeam.teamId || 'team-1', pairMembers, pairTeam),
      makeTeam(
        2,
        singleTeam.teamId || 'team-2',
        singleMembers.concat(added),
        singleTeam
      )
    ];
  }

  if (type === '3+1') {
    return [
      makeTeam(
        1,
        pairTeam.teamId || 'team-1',
        pairMembers.concat(added),
        pairTeam
      ),
      makeTeam(2, singleTeam.teamId || 'team-2', singleMembers, singleTeam)
    ];
  }

  return [
    makeTeam(1, pairTeam.teamId || 'team-1', pairMembers, pairTeam),
    makeTeam(2, singleTeam.teamId || 'team-2', singleMembers, singleTeam),
    makeTeam(3, 'team-3', added, null)
  ];
}

module.exports = {
  partType,
  resolveCompositionType,
  parseCompositionParts,
  teamTypeForCapacity,
  isFourball21Shape,
  getCompositionSeats,
  deriveTeamsFromSeats,
  transitionFourballComposition
};
