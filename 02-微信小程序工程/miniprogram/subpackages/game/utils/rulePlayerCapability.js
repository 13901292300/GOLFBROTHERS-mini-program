/**
 * 规则人数能力：页面与规则库统一走 catalog 实现，禁止各入口自写过滤条件。
 */
var catalog = require('./catalog.js');

module.exports = {
  MULTI_MIN_PLAYERS: catalog.MULTI_MIN_PLAYERS,
  rulePlayerCapability: catalog.rulePlayerCapability,
  isMultiplayerRule: catalog.isMultiplayerRule,
  requiredEntityCount: catalog.requiredEntityCount,
  isExactEntityCount: catalog.isExactEntityCount,
  isRuleAvailableForGroupCapacity: catalog.isRuleAvailableForGroupCapacity,
  listCatalogForGroupCapacity: catalog.listCatalogForGroupCapacity,
  isRuleCompatibleWithPlayerCount: catalog.isRuleCompatibleWithPlayerCount
};
