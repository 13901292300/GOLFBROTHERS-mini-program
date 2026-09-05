/**
 * 球队模块开发开关。默认全部关闭，演示与验收时看不到任何诊断元素。
 * 需要排查问题时把对应项改成 true，改完记得改回来。
 *
 * USE_LOCAL_REPOSITORY 仅允许在明确的开发/自测中打开。生产默认走云仓储，失败不得回落本地。
 */
const SHOW_DIAG_TOOLS = false;
const USE_LOCAL_REPOSITORY = false;

module.exports = {
  SHOW_DIAG_TOOLS,
  USE_LOCAL_REPOSITORY
};
