/**
 * Header Engine — 全局唯一 Header 计算系统
 *
 * 所有页面统一通过 createHeaderStyle() 获取自定义导航栏样式，
 * 禁止页面自行计算胶囊位置或写死 padding。
 *
 * 计算依据：
 *   - wx.getSystemInfoSync()              → statusBarHeight / windowWidth
 *   - wx.getMenuButtonBoundingClientRect() → 系统胶囊 top / height / bottom / left
 *
 * 输出：
 *   { headerRootStyle, headerBarStyle, metrics }
 */

// Header 内容区下方留白（px）
const PADDING_BOTTOM = 16;
// 左侧固定内边距（px）
const PADDING_LEFT = 16;
// 兜底状态栏高度（px）
const FALLBACK_STATUS_BAR = 24;
// 兜底内容高度（px）
const MIN_CONTENT_HEIGHT = 32;
// 兜底右侧预留宽度（px）
const FALLBACK_PADDING_RIGHT = 96;
// 品牌色
const HEADER_BG = '#002D62';
const HEADER_BORDER = '2px solid var(--champion-gold)';

function buildRootStyle(totalHeight) {
  return [
    'min-height:' + totalHeight + 'px',
    'height:' + totalHeight + 'px',
    'background-color:' + HEADER_BG,
    'border-bottom:' + HEADER_BORDER,
    'box-sizing:border-box',
    'flex-shrink:0'
  ].join(';') + ';';
}

function buildBarStyle(paddingTop, paddingRight, barMinHeight) {
  return [
    'padding-top:' + paddingTop + 'px',
    'padding-right:' + paddingRight + 'px',
    'padding-bottom:' + PADDING_BOTTOM + 'px',
    'padding-left:' + PADDING_LEFT + 'px',
    'min-height:' + barMinHeight + 'px',
    'height:' + barMinHeight + 'px',
    'box-sizing:border-box',
    'display:flex',
    'align-items:center'
  ].join(';') + ';';
}

function fallbackResult() {
  const statusBarHeight = FALLBACK_STATUS_BAR;
  const contentHeight = MIN_CONTENT_HEIGHT;
  const paddingTop = statusBarHeight + 8;
  const totalHeight = paddingTop + contentHeight + PADDING_BOTTOM;
  return {
    headerRootStyle: buildRootStyle(totalHeight),
    headerBarStyle: buildBarStyle(paddingTop, FALLBACK_PADDING_RIGHT, totalHeight),
    metrics: {
      statusBarHeight: statusBarHeight,
      capsuleHeight: contentHeight,
      capsuleTop: paddingTop,
      capsuleLeft: 0,
      headerPaddingTop: paddingTop,
      headerPaddingRight: FALLBACK_PADDING_RIGHT,
      headerContentHeight: contentHeight,
      headerTotalHeight: totalHeight
    }
  };
}

/**
 * 计算并返回统一的 Header 样式。
 * @returns {{ headerRootStyle: string, headerBarStyle: string, metrics: object }}
 */
function createHeaderStyle() {
  try {
    const sys = wx.getSystemInfoSync();
    const menu = wx.getMenuButtonBoundingClientRect();
    const statusBarHeight = sys.statusBarHeight || FALLBACK_STATUS_BAR;

    // 系统胶囊数据缺失时走兜底
    if (!menu || !menu.top || !menu.height || !menu.bottom) {
      return fallbackResult();
    }

    const capsuleTop = menu.top;
    const capsuleHeight = menu.height;
    const capsuleLeft = menu.left;
    const windowWidth = sys.windowWidth || sys.screenWidth;

    const headerPaddingTop = capsuleTop;
    const headerContentHeight = Math.max(capsuleHeight, MIN_CONTENT_HEIGHT);
    const headerTotalHeight = Math.max(
      menu.bottom + PADDING_BOTTOM,
      headerPaddingTop + headerContentHeight + PADDING_BOTTOM
    );
    const headerPaddingRight = Math.max(
      windowWidth - capsuleLeft + 8,
      FALLBACK_PADDING_RIGHT
    );
    const headerBarMinHeight = headerPaddingTop + headerContentHeight + PADDING_BOTTOM;

    return {
      headerRootStyle: buildRootStyle(headerTotalHeight),
      headerBarStyle: buildBarStyle(headerPaddingTop, headerPaddingRight, headerBarMinHeight),
      metrics: {
        statusBarHeight: statusBarHeight,
        capsuleHeight: capsuleHeight,
        capsuleTop: capsuleTop,
        capsuleLeft: capsuleLeft,
        headerPaddingTop: headerPaddingTop,
        headerPaddingRight: headerPaddingRight,
        headerContentHeight: headerContentHeight,
        headerTotalHeight: headerTotalHeight
      }
    };
  } catch (e) {
    return fallbackResult();
  }
}

module.exports = {
  createHeaderStyle: createHeaderStyle
};
