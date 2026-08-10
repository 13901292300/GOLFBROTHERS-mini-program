/**
 * 性别编码统一读取（展示层 / 公开资料投影）。
 * 不批量改写旧 Storage / 不改赛事快照。
 */

/**
 * @param {*} raw
 * @returns {'male'|'female'|'unknown'}
 */
function normalizeGenderCode(raw) {
  if (raw == null || raw === '') return 'unknown';
  const s = String(raw).trim();
  if (!s) return 'unknown';
  const lower = s.toLowerCase();
  if (
    s === '男' ||
    lower === 'male' ||
    lower === 'm' ||
    s === '1'
  ) {
    return 'male';
  }
  if (
    s === '女' ||
    lower === 'female' ||
    lower === 'f' ||
    s === '2'
  ) {
    return 'female';
  }
  if (
    s === '未知' ||
    lower === 'unknown' ||
    lower === 'u' ||
    s === '0'
  ) {
    return 'unknown';
  }
  return 'unknown';
}

/** ♂ / ♀；未知返回空串 */
function genderSymbol(raw) {
  const code = normalizeGenderCode(raw);
  if (code === 'male') return '♂';
  if (code === 'female') return '♀';
  return '';
}

/** 编辑页等中文展示 */
function genderLabelZh(raw) {
  const code = normalizeGenderCode(raw);
  if (code === 'male') return '男';
  if (code === 'female') return '女';
  return '未设置';
}

module.exports = {
  normalizeGenderCode: normalizeGenderCode,
  genderSymbol: genderSymbol,
  genderLabelZh: genderLabelZh
};
