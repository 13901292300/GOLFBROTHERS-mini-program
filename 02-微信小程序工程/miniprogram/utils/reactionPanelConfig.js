/**
 * 头像互动动画选择面板配置（仅 UI 展示）
 * reaction-panel-coin-display-v1
 *
 * 正式记分页与 demo 共用；不接入扣金币逻辑；cost 仅用于面板展示。
 *
 * Reaction Mode（统一业务命名，勿再用「第一/第三视角」作判断）：
 * - self：互动主体头像进入中央并承受动画（原位头像需 detach 隐藏）
 * - observer：保留原头像，展示社交效果
 */

/**
 * @typedef {'self' | 'observer'} ReactionMode
 * @typedef {{
 *   key: string,
 *   type: string,
 *   mode: ReactionMode,
 *   icon: string,
 *   cost: number
 * }} PlayerActionReactionItem
 */

/** @type {PlayerActionReactionItem[]} */
const PLAYER_ACTION_REACTIONS = [
  { key: 'flower', type: 'flower', mode: 'observer', icon: '🌹', cost: 10 },
  { key: 'beer', type: 'beer', mode: 'observer', icon: '🍺', cost: 10 },
  { key: 'bucket', type: 'bucket', mode: 'self', icon: '🪣', cost: 20 },
  { key: 'tomato', type: 'tomato', mode: 'self', icon: '🍅', cost: 20 },
  { key: 'kiss', type: 'kiss', mode: 'self', icon: '👄', cost: 50 },
  { key: 'egg', type: 'egg', mode: 'self', icon: '🥚', cost: 50 },
  { key: 'rocket', type: 'rocket', mode: 'self', icon: '🚀', cost: 100 },
  { key: 'boxing', type: 'boxing', mode: 'self', icon: '🥊', cost: 100 }
];

/** key → cost，便于后续扩展（当前仅展示用） */
const REACTION_COST = PLAYER_ACTION_REACTIONS.reduce(function (map, item) {
  map[item.key] = item.cost;
  return map;
}, {});

/** key → mode */
const REACTION_MODE = PLAYER_ACTION_REACTIONS.reduce(function (map, item) {
  map[item.key] = item.mode;
  return map;
}, {});

/**
 * @param {string} keyOrType
 * @returns {ReactionMode|''}
 */
function getReactionMode(keyOrType) {
  const k = keyOrType != null ? String(keyOrType).trim() : '';
  return REACTION_MODE[k] || '';
}

/**
 * Self Reaction：主体头像进中央，原位需 is-reaction-detached。
 * @param {string} keyOrType
 * @returns {boolean}
 */
function isSelfReactionMode(keyOrType) {
  return getReactionMode(keyOrType) === 'self';
}

/**
 * Observer / Social Reaction：保留原头像。
 * @param {string} keyOrType
 * @returns {boolean}
 */
function isObserverReactionMode(keyOrType) {
  return getReactionMode(keyOrType) === 'observer';
}

module.exports = {
  PLAYER_ACTION_REACTIONS: PLAYER_ACTION_REACTIONS,
  REACTION_COST: REACTION_COST,
  REACTION_MODE: REACTION_MODE,
  getReactionMode: getReactionMode,
  isSelfReactionMode: isSelfReactionMode,
  isObserverReactionMode: isObserverReactionMode
};
