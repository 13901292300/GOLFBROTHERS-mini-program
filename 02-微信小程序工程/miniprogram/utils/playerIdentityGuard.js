/**
 * 球员身份合法性叶子模块（无业务 require）。
 * 唯一「能否作为正式球员身份 / 公开主页主键」规则源。
 */

/**
 * @param {*} value
 * @returns {string}
 */
function normalizePlayerUserId(value) {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  if (lower === 'undefined' || lower === 'null') return '';
  return s;
}

/**
 * @param {*} value
 * @returns {boolean}
 */
function isGuestPlayerId(value) {
  const id = normalizePlayerUserId(value);
  return !!id && id.indexOf('guest_') === 0;
}

/**
 * @param {*} value
 * @returns {boolean}
 */
function isMaskedPlayerId(value) {
  const id = normalizePlayerUserId(value);
  return !!id && id.indexOf('masked:') === 0;
}

/**
 * scorecard / 复合席位键：含冒号且非 masked 前缀场景也一律视为非公开主键。
 * @param {*} value
 * @returns {boolean}
 */
function isScorecardOnlyKey(value) {
  const id = normalizePlayerUserId(value);
  if (!id) return false;
  if (isMaskedPlayerId(id)) return true;
  return id.indexOf(':') >= 0;
}

/**
 * 纯页面/列表索引标签（非用户身份）。
 * 不把纯数字 ID 一律判非法（避免误伤合法数字型 userId）。
 * @param {*} value
 * @returns {boolean}
 */
function isPageIndexOnlyId(value) {
  const id = normalizePlayerUserId(value);
  if (!id) return false;
  return /^(index|idx|row|item)[-_]?\d+$/i.test(id);
}

/**
 * 稳定公开用户 ID：可作为球员主页 / 关注 / 私人备注目标。
 *
 * 默认拒绝：空、guest_*、masked:*、scorecard 冒号键、userType=guest、纯索引、
 * 字面量 "undefined"/"null"。
 * 允许：me、正式目录 ID、赛事稳定注册 userId（含普通连字符）。
 *
 * @param {*} value
 * @param {{ userType?: string, allowPageIndex?: boolean }} [options]
 * @returns {boolean}
 */
function isStablePublicUserId(value, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const userType = String(opts.userType == null ? '' : opts.userType)
    .trim()
    .toLowerCase();
  if (userType === 'guest') return false;

  const id = normalizePlayerUserId(value);
  if (!id) return false;
  if (isGuestPlayerId(id)) return false;
  if (isMaskedPlayerId(id)) return false;
  if (isScorecardOnlyKey(id)) return false;
  if (!opts.allowPageIndex && isPageIndexOnlyId(id)) return false;
  return true;
}

module.exports = {
  normalizePlayerUserId: normalizePlayerUserId,
  isGuestPlayerId: isGuestPlayerId,
  isMaskedPlayerId: isMaskedPlayerId,
  isScorecardOnlyKey: isScorecardOnlyKey,
  isPageIndexOnlyId: isPageIndexOnlyId,
  isStablePublicUserId: isStablePublicUserId
};
