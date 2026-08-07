/**
 * Demo：头像互动动画选择面板配置（仅 UI 展示）
 * reaction-panel-coin-display-v1
 *
 * 不接入扣金币逻辑；cost 仅用于面板展示。
 */

/** @typedef {{ key: string, icon: string, cost: number }} PlayerActionReactionItem */

/** @type {PlayerActionReactionItem[]} */
const PLAYER_ACTION_REACTIONS = [
  { key: 'flower', icon: '🌹', cost: 10 },
  { key: 'beer', icon: '🍺', cost: 10 },
  { key: 'bucket', icon: '🪣', cost: 20 },
  { key: 'tomato', icon: '🍅', cost: 20 },
  { key: 'kiss', icon: '👄', cost: 50 },
  { key: 'egg', icon: '🥚', cost: 50 },
  { key: 'rocket', icon: '🚀', cost: 100 },
  { key: 'boxing', icon: '🥊', cost: 100 }
];

/** key → cost，便于后续扩展（当前仅展示用） */
const REACTION_COST = PLAYER_ACTION_REACTIONS.reduce(function (map, item) {
  map[item.key] = item.cost;
  return map;
}, {});

module.exports = {
  PLAYER_ACTION_REACTIONS: PLAYER_ACTION_REACTIONS,
  REACTION_COST: REACTION_COST
};
