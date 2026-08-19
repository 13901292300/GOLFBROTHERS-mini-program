/**
 * Series 详情：LIVE 会话纯投影
 * - 是否存在有效 LIVE 轮
 * - 默认目标轮（总榜 / 出发表共用）
 * - TAB 顺序（报名是否置末）
 * - 轮次层空态 / 查看领先榜（不写分组卡片右上角）
 * 不读 storage，不改 round/match 结构。
 */

var seriesRoundVisualState = require('./seriesRoundVisualState.js');
var seriesLiveRoundSelect = require('../../../../utils/seriesLiveRoundSelect.js');

var TAB_INFO = { id: 'info', label: '赛事信息' };
var TAB_STANDINGS = { id: 'standings', label: '总榜' };
var TAB_REGISTER = { id: 'register', label: '报名' };
var TAB_SCHEDULE = { id: 'schedule', label: '出发表' };
var TAB_DISCUSSION = { id: 'discussion', label: '讨论区' };

var SERIES_TABS = [TAB_INFO, TAB_STANDINGS, TAB_REGISTER, TAB_SCHEDULE, TAB_DISCUSSION];

var CARD_STATUS = {
  unassigned: { text: '等待分组', badgeClass: '' },
  grouped: { text: '已分组', badgeClass: 'badge-gold' },
  live: { text: 'LIVE', badgeClass: 'badge-live live-badge-pulse' },
  completed: { text: '已完成', badgeClass: 'badge-finished' },
  cancelled: { text: '已取消', badgeClass: '' }
};

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function cloneTab(tab) {
  return { id: tab.id, label: tab.label };
}

function cloneTabs(list) {
  var out = [];
  for (var i = 0; i < list.length; i++) out.push(cloneTab(list[i]));
  return out;
}

function visualOfRoundState(row) {
  return seriesRoundVisualState.normalizeRoundVisualFromStateRow(row || {});
}

function hasAnyLiveRound(roundStates) {
  return seriesLiveRoundSelect.hasAnyLiveRound(roundStates);
}

/**
 * 默认目标轮：LIVE（系列原顺序最靠前）→ 已分组未开始 → 最后已完成 → 首个未取消。
 */
function resolveDefaultTargetRoundId(roundStates) {
  return seriesLiveRoundSelect.resolveDefaultTargetRoundId(roundStates);
}

function isValidRoundKey(roundStates, key, extraValidKeys) {
  var k = asString(key);
  if (!k) return false;
  if (extraValidKeys && extraValidKeys[k]) return true;
  var list = Array.isArray(roundStates) ? roundStates : [];
  for (var i = 0; i < list.length; i++) {
    if (asString(list[i] && list[i].roundId) === k) return true;
  }
  return false;
}

function stateOfKey(roundStates, key) {
  var k = asString(key);
  var list = Array.isArray(roundStates) ? roundStates : [];
  for (var i = 0; i < list.length; i++) {
    if (asString(list[i] && list[i].roundId) === k) {
      return visualOfRoundState(list[i]).state;
    }
  }
  return '';
}

/**
 * 会话轮次：未访问则跟随默认；访问后 LIVE→已完成保持当前轮；
 * 未手选且随后出现新 LIVE 时再跟随默认。手选后刷新不抢焦点。
 */
function resolveSessionSelectedRoundId(input) {
  var src = input && typeof input === 'object' ? input : {};
  var roundStates = src.roundStates;
  var extraValidKeys = src.extraValidKeys && typeof src.extraValidKeys === 'object'
    ? src.extraValidKeys
    : null;
  var current = asString(src.currentKey);
  var userPicked = !!src.userPicked;
  var visited = !!src.visited;
  var def = resolveDefaultTargetRoundId(roundStates);

  if (
    userPicked &&
    isValidRoundKey(roundStates, current, extraValidKeys) &&
    stateOfKey(roundStates, current) !== 'cancelled'
  ) {
    return current;
  }
  if (!visited) return def;
  if (!isValidRoundKey(roundStates, current, extraValidKeys)) return def;
  if (stateOfKey(roundStates, current) === 'cancelled') return def;
  if (extraValidKeys && extraValidKeys[current]) return current;

  var curState = stateOfKey(roundStates, current);
  var defState = stateOfKey(roundStates, def);
  if (curState === 'completed') {
    if (defState === 'live' && def && def !== current) return def;
    return current;
  }
  return def || current;
}

/**
 * 有任意未取消 LIVE 时，报名 TAB 移到最后；其它 TAB 相对顺序不变。
 * 选中态必须用 id，禁止下标。
 */
function buildSeriesDetailTabs(hasLiveRound, options) {
  var tabs = cloneTabs(SERIES_TABS);
  if (options && options.ryderCup) {
    for (var t = 0; t < tabs.length; t++) {
      if (tabs[t].id === 'standings') tabs[t].label = '得分榜';
      if (tabs[t].id === 'schedule') {
        tabs[t].label = hasLiveRound ? '出发表' : '分组';
      }
    }
  }
  if (!hasLiveRound) return tabs;
  var register = null;
  var rest = [];
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i].id === 'register') register = tabs[i];
    else rest.push(tabs[i]);
  }
  if (register) rest.push(register);
  return rest;
}

function resolveScheduleCardStatus(state) {
  var s = asString(state) || 'unassigned';
  return CARD_STATUS[s] || CARD_STATUS.unassigned;
}

function tabIds(tabs) {
  var out = [];
  var list = Array.isArray(tabs) ? tabs : [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].id) out.push(list[i].id);
  }
  return out;
}

module.exports = {
  SERIES_TABS: cloneTabs(SERIES_TABS),
  hasAnyLiveRound: hasAnyLiveRound,
  resolveDefaultTargetRoundId: resolveDefaultTargetRoundId,
  resolveSessionSelectedRoundId: resolveSessionSelectedRoundId,
  isValidRoundKey: isValidRoundKey,
  buildSeriesDetailTabs: buildSeriesDetailTabs,
  resolveScheduleCardStatus: resolveScheduleCardStatus,
  tabIds: tabIds
};
