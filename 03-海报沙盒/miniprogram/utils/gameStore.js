/**
 * 海报沙盒：写死一场 18 洞成绩。合并回主体时不要带走本文件。
 */

const DEMO_GAME_ID = "sandbox-round-1";
const DEMO_HOLE_PARS = [4, 4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 4, 3, 4, 5, 4, 3, 4];
const DEMO_SCORES = [4, 5, 4, 3, 4, 4, 5, 3, 4, 4, 3, 4, 2, 5, 5, 4, 3, 5];

const CURRENT_USER = {
  userId: "me",
  name: "TIGERHOODS"
};

const DEMO_GAME = {
  gameId: DEMO_GAME_ID,
  courseName: "Pinehurst No. 2",
  par: 72,
  roundName: "沙盒演示场",
  gameMode: "stroke",
  createdAt: "2026-08-17",
  groups: [
    {
      groupId: "grp-1",
      name: "第1组",
      playersSlots: [{ playerId: "me", name: "TIGERHOODS" }],
      scoresBySlot: [
        {
          scores: DEMO_SCORES.slice(),
          putts: []
        }
      ],
      scoresByPlayer: {
        me: {
          scores: DEMO_SCORES.slice(),
          putts: []
        }
      }
    }
  ]
};

function getCurrentUser() {
  return Object.assign({}, CURRENT_USER);
}

function listGames() {
  return [DEMO_GAME];
}

function getGame(gameId) {
  if (!gameId || String(gameId) === DEMO_GAME_ID) return DEMO_GAME;
  return DEMO_GAME;
}

function getGameById(gameId) {
  return getGame(gameId);
}

function listGroups(game) {
  const src = game || DEMO_GAME;
  return Array.isArray(src.groups) ? src.groups : [];
}

function getGroup(gameId, groupIndex) {
  const groups = listGroups(getGame(gameId));
  return groups[groupIndex || 0] || groups[0] || null;
}

function resolveGroupSlotScoreRecord(group, slotIndex, playerId) {
  const si = Number(slotIndex);
  if (group && Array.isArray(group.scoresBySlot) && si >= 0 && group.scoresBySlot[si]) {
    const rec = group.scoresBySlot[si];
    return {
      scores: (rec.scores || []).slice(),
      putts: (rec.putts || []).slice()
    };
  }
  const pid = playerId != null ? String(playerId).trim() : "";
  if (pid && group && group.scoresByPlayer && group.scoresByPlayer[pid]) {
    const rec = group.scoresByPlayer[pid];
    return {
      scores: (rec.scores || []).slice(),
      putts: (rec.putts || []).slice()
    };
  }
  return {
    scores: DEMO_SCORES.slice(),
    putts: []
  };
}

module.exports = {
  DEMO_GAME_ID,
  DEMO_HOLE_PARS,
  DEMO_SCORES,
  getCurrentUser,
  listGames,
  getGame,
  getGameById,
  listGroups,
  getGroup,
  resolveGroupSlotScoreRecord
};
