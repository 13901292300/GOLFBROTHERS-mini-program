/**
 * reaction 分包宿主桥（仅重逻辑）。
 * 宿主页必须在用户选择具体动画后 require.async，禁止 onLoad/打开面板时预拉。
 */

module.exports = {
  reactionSounds: require('./reactionSounds.js'),
  scoreReactionController: require('./scoreReactionController.js')
};
