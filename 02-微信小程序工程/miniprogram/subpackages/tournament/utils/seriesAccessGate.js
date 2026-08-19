/**
 * Series 详情访问码门闩（纯函数）
 * - 对比结果不得回传明文 accessCode
 * - draft preview 跳过；非 preview 的 private 必须校验
 */

function asString(v) {
  return v == null ? '' : String(v);
}

function trim(v) {
  return asString(v).trim();
}

/**
 * @param {object|null|undefined} series
 * @param {{ preview?: boolean|string|number }} [options]
 * @returns {{
 *   needVerify: boolean,
 *   reason: string,
 *   visibility: string,
 *   lifecycleStatus: string,
 *   isDraftPreview: boolean
 * }}
 */
function decideAccessGate(series, options) {
  var opts = options || {};
  var preview =
    opts.preview === true || opts.preview === 1 || opts.preview === '1';
  var life = trim(series && series.lifecycleStatus);
  var vis = series && series.visibility === 'private' ? 'private' : 'public';
  var isDraftPreview = life === 'draft' && preview;

  if (!series || typeof series !== 'object') {
    return {
      needVerify: false,
      reason: 'series_missing',
      visibility: 'public',
      lifecycleStatus: life || '',
      isDraftPreview: false
    };
  }

  if (isDraftPreview) {
    return {
      needVerify: false,
      reason: 'draft_preview_skip',
      visibility: vis,
      lifecycleStatus: life,
      isDraftPreview: true
    };
  }

  if (vis !== 'private') {
    return {
      needVerify: false,
      reason: 'public_skip',
      visibility: 'public',
      lifecycleStatus: life,
      isDraftPreview: false
    };
  }

  // private + 非 preview：published / cancelled / archived / 其它均需校验
  return {
    needVerify: true,
    reason: 'private_requires_code',
    visibility: 'private',
    lifecycleStatus: life,
    isDraftPreview: false
  };
}

/**
 * @param {string} expected 页面控制层刚读到的原始码（不得进入 setData）
 * @param {string} input 用户输入
 * @returns {{ ok: boolean, errorKey?: string }}
 */
function verifyAccessCode(expected, input) {
  var exp = asString(expected).trim();
  var got = asString(input).trim();
  // 空期望码不得直通；返回值永不带回明文
  if (!exp) return { ok: false, errorKey: 'wrong_code' };
  if (exp === got) return { ok: true };
  return { ok: false, errorKey: 'wrong_code' };
}

/** 错误文案（固定，不含码） */
function wrongCodeMessage() {
  return '访问码错误';
}

/**
 * 取消验证后的导航意图（供页面执行 / 自测）
 * @param {{ pageStackLength?: number }} [env]
 * @returns {{ action: 'navigateBack'|'switchTabHome' }}
 */
function resolveCancelNavigation(env) {
  var len = env && env.pageStackLength != null ? Number(env.pageStackLength) : 0;
  if (Number.isFinite(len) && len > 1) {
    return { action: 'navigateBack' };
  }
  return { action: 'switchTabHome' };
}

/** 业务内容是否允许渲染 */
function canRenderBusinessContent(accessGate) {
  return accessGate === 'open' || accessGate === 'unlocked';
}

module.exports = {
  decideAccessGate: decideAccessGate,
  verifyAccessCode: verifyAccessCode,
  wrongCodeMessage: wrongCodeMessage,
  resolveCancelNavigation: resolveCancelNavigation,
  canRenderBusinessContent: canRenderBusinessContent
};
