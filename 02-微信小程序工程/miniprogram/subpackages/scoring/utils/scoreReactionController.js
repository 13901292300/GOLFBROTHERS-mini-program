/**
 * 记分页 reaction 薄编排层（门控 / 面板配置 / 共享依赖入口）。
 *
 * 动画时间轴与播放逻辑仍留在 pages/score/index，本模块不复制、不改写动画。
 * 资源统一引用：
 *   - subpackages/scoring/assets/reaction
 *   - subpackages/scoring/assets/sounds
 * Timeline 统一复用各 *ReactionTimeline.js（不复制文件）。
 */

const scoreReactionAccess = require('./scoreReactionAccess.js');
const reactionPanelConfig = require('./reactionPanelConfig.js');
const reactionSounds = require('./reactionSounds.js');
const rocketReactionTimeline = require('./rocketReactionTimeline.js');
const boxingReactionTimeline = require('./boxingReactionTimeline.js');
const flowerReactionTimeline = require('./flowerReactionTimeline.js');
const beerReactionTimeline = require('./beerReactionTimeline.js');
const kissReactionTimeline = require('./kissReactionTimeline.js');
const eggReactionTimeline = require('./eggReactionTimeline.js');
const tomatoReactionTimeline = require('./tomatoReactionTimeline.js');
const bucketReactionTimeline = require('./bucketReactionTimeline.js');

const REACTION_KEYS = {
  flower: true,
  beer: true,
  bucket: true,
  tomato: true,
  kiss: true,
  egg: true,
  rocket: true,
  boxing: true
};

/**
 * @param {string|number|null|undefined} gameId
 * @param {{ matchId?: string|number|null } } [ctx]
 * @returns {boolean}
 */
function canOpenReaction(gameId, ctx) {
  return scoreReactionAccess.isScoreReactionEnabled(gameId, ctx);
}

/**
 * @param {string|number|null|undefined} gameId
 * @param {string} key
 * @param {{ matchId?: string|number|null } } [ctx]
 * @returns {boolean}
 */
function canPlayReaction(gameId, key, ctx) {
  if (!canOpenReaction(gameId, ctx)) return false;
  const k = key != null ? String(key).trim() : '';
  return !!REACTION_KEYS[k];
}

/**
 * 送花系统消息：与互动同开；仍只写页面 chatMessages，不落盘。
 * @param {string|number|null|undefined} gameId
 * @param {{ matchId?: string|number|null } } [ctx]
 * @returns {boolean}
 */
function shouldAppendFlowerSystemMessage(gameId, ctx) {
  return canOpenReaction(gameId, ctx);
}

module.exports = {
  canOpenReaction: canOpenReaction,
  canPlayReaction: canPlayReaction,
  shouldAppendFlowerSystemMessage: shouldAppendFlowerSystemMessage,
  isScoreReactionEnabled: scoreReactionAccess.isScoreReactionEnabled,
  PLAYER_ACTION_REACTIONS: reactionPanelConfig.PLAYER_ACTION_REACTIONS,
  REACTION_COST: reactionPanelConfig.REACTION_COST,
  REACTION_MODE: reactionPanelConfig.REACTION_MODE,
  getReactionMode: reactionPanelConfig.getReactionMode,
  isSelfReactionMode: reactionPanelConfig.isSelfReactionMode,
  isObserverReactionMode: reactionPanelConfig.isObserverReactionMode,
  reactionSounds: reactionSounds,
  rocketReactionTimeline: rocketReactionTimeline,
  boxingReactionTimeline: boxingReactionTimeline,
  flowerReactionTimeline: flowerReactionTimeline,
  beerReactionTimeline: beerReactionTimeline,
  kissReactionTimeline: kissReactionTimeline,
  eggReactionTimeline: eggReactionTimeline,
  tomatoReactionTimeline: tomatoReactionTimeline,
  bucketReactionTimeline: bucketReactionTimeline
};
