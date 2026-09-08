/**
 * 页面 query 与空态。页面不读 Storage。
 */
var headerEngine = require('../../../utils/headerEngine.js');
var repository = require('./sideGameRepository.js');

var EMPTY_HINT = '暂无游戏';

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
  return repository.hasImplementation();
}

function themeClass() {
  try {
    var app = getApp();
    var theme = app && typeof app.getTheme === 'function' ? app.getTheme() : 'bright';
    return theme === 'dark' ? 'dark-mode' : 'bright-mode';
  } catch (e) {
    return 'bright-mode';
  }
}

function windowBg(cls) {
  return cls === 'dark-mode' ? '#000000' : '#FCFCFC';
}

/** 先改窗口色，再 setData。不读页面实例，供 onLoad 首行与组件 created 调用。 */
function paintNativeTheme(cls) {
  cls = cls || themeClass();
  var bg = windowBg(cls);
  try {
    if (typeof wx !== 'undefined' && typeof wx.setBackgroundColor === 'function') {
      wx.setBackgroundColor({
        backgroundColor: bg,
        backgroundColorTop: bg,
        backgroundColorBottom: bg
      });
    }
    if (typeof wx !== 'undefined' && typeof wx.setBackgroundTextStyle === 'function') {
      wx.setBackgroundTextStyle({
        textStyle: cls === 'dark-mode' ? 'light' : 'dark'
      });
    }
  } catch (e2) {
    /* ignore */
  }
  return cls;
}

function applyTheme(page) {
  var cls = paintNativeTheme();
  if (!page || typeof page.setData !== 'function') return cls;
  if (page.data && page.data.themeClass === cls) return cls;
  page.setData({ themeClass: cls });
  return cls;
}

/** 保证 onLoad/onShow 在业务逻辑前先对齐已保存主题（官方时序：onLoad 早于首帧渲染） */
function bindPageTheme(options) {
  var origLoad = options.onLoad;
  var origShow = options.onShow;
  options.onLoad = function (query) {
    applyTheme(this);
    if (typeof origLoad === 'function') return origLoad.call(this, query);
  };
  options.onShow = function (opts) {
    applyTheme(this);
    if (typeof origShow === 'function') return origShow.call(this, opts);
  };
  return options;
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
  var cls = paintNativeTheme();
  patch.themeClass = cls;
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
  bootPage: bootPage,
  themeClass: themeClass,
  paintNativeTheme: paintNativeTheme,
  applyTheme: applyTheme,
  bindPageTheme: bindPageTheme
};
