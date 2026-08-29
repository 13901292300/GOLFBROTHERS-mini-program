/**
 * tournament-tools 横屏 Header metrics。
 * 只服务成绩卡 / 统计页胶囊避让，不是通用设备信息工具。
 */

function isPositiveFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function fallbackMetrics() {
  return {
    headerPadY: 6,
    headerPadRight: 96,
    headerInnerH: 32,
    headerChrome: 46
  };
}

function pickPositiveWidth(info) {
  if (!info) return 0;
  if (isPositiveFiniteNumber(info.windowWidth)) return info.windowWidth;
  if (isPositiveFiniteNumber(info.screenWidth)) return info.screenWidth;
  return 0;
}

function readLandscapeWindowWidth() {
  var width = 0;
  var modernValid = false;
  try {
    if (typeof wx !== 'undefined' && typeof wx.getWindowInfo === 'function') {
      try {
        width = pickPositiveWidth(wx.getWindowInfo());
        modernValid = isPositiveFiniteNumber(width);
      } catch (err) {
        modernValid = false;
      }
    }
  } catch (errOuter) {
    modernValid = false;
  }
  if (modernValid) return width;
  try {
    if (typeof wx !== 'undefined' && typeof wx.getSystemInfoSync === 'function') {
      width = pickPositiveWidth(wx.getSystemInfoSync());
    }
  } catch (errLegacy) {
    width = 0;
  }
  return isPositiveFiniteNumber(width) ? width : 0;
}

function computeLandscapeHeaderMetrics() {
  var fallback = fallbackMetrics();
  var windowWidth = 0;
  try {
    windowWidth = readLandscapeWindowWidth();
  } catch (errWidth) {
    windowWidth = 0;
  }
  try {
    if (typeof wx === 'undefined' || typeof wx.getMenuButtonBoundingClientRect !== 'function') {
      return fallback;
    }
    var menu = wx.getMenuButtonBoundingClientRect();
    if (!menu || !isPositiveFiniteNumber(menu.height)) return fallback;
    var capTop = Math.max(0, Number(menu.top) || 0);
    var capH = Math.max(32, Number(menu.height) || 32);
    var padRight = fallback.headerPadRight;
    if (menu.left > 0 && windowWidth > menu.left) {
      padRight = Math.max(16, windowWidth - menu.left + 8);
    }
    return {
      headerPadY: capTop,
      headerPadRight: padRight,
      headerInnerH: capH,
      headerChrome: capTop * 2 + capH + 2
    };
  } catch (errMenu) {
    return fallback;
  }
}

module.exports = {
  computeLandscapeHeaderMetrics: computeLandscapeHeaderMetrics
};
