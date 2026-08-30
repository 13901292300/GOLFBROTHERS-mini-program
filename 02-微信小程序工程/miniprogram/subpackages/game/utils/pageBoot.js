/**
 * 页面 query 与空态。无 Repository / HostContext，不读 Storage。
 */
var headerEngine = require('../../../utils/headerEngine.js');

var EMPTY_HINT = '游戏数据尚未接入';

function parseQuery(query) {
  var q = query || {};
  var scope = String(q.scope || 'group').trim();
  if (scope !== 'match') scope = 'group';
  return {
    matchId: String(q.matchId || '').trim(),
    groupId: String(q.groupId || '').trim(),
    sideGameId: String(q.sideGameId || '').trim(),
    scope: scope,
    ruleId: String(q.ruleId || '').trim()
  };
}

function hasMatchContext(ctx) {
  return !!(ctx && ctx.matchId);
}

function hasRepository() {
  return false;
}

function headerPatch() {
  var header = headerEngine.createHeaderStyle();
  return {
    headerRootStyle: header.headerRootStyle,
    headerBarStyle: header.headerBarStyle
  };
}

function encodeQuery(ctx, extra) {
  var base = ctx || {};
  var bag = {
    matchId: base.matchId || '',
    groupId: base.groupId || '',
    sideGameId: base.sideGameId || '',
    scope: base.scope || 'group'
  };
  extra = extra || {};
  Object.keys(extra).forEach(function (key) {
    if (extra[key] != null && extra[key] !== '') bag[key] = extra[key];
  });
  return Object.keys(bag)
    .filter(function (key) {
      return bag[key] !== '' && bag[key] != null;
    })
    .map(function (key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(String(bag[key]));
    })
    .join('&');
}

function pageUrl(path, ctx, extra) {
  var qs = encodeQuery(ctx, extra);
  return '/subpackages/game/' + path + (qs ? '?' + qs : '');
}

function bootPage(page, query, extraData) {
  var ctx = parseQuery(query);
  var patch = headerPatch();
  patch.matchId = ctx.matchId;
  patch.groupId = ctx.groupId;
  patch.sideGameId = ctx.sideGameId;
  patch.scope = ctx.scope;
  patch.ruleId = ctx.ruleId;
  patch.hasMatchContext = hasMatchContext(ctx);
  patch.hostReady = hasMatchContext(ctx) && hasRepository();
  patch.emptyHint = EMPTY_HINT;
  extraData = extraData || {};
  Object.keys(extraData).forEach(function (key) {
    patch[key] = extraData[key];
  });
  page.setData(patch);
  page._hostQuery = ctx;
  return ctx;
}

module.exports = {
  EMPTY_HINT: EMPTY_HINT,
  parseQuery: parseQuery,
  hasMatchContext: hasMatchContext,
  hasRepository: hasRepository,
  headerPatch: headerPatch,
  encodeQuery: encodeQuery,
  pageUrl: pageUrl,
  bootPage: bootPage
};
