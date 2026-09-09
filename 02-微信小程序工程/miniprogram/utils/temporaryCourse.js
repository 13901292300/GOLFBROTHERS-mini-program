/**
 * 普通创建 Temporary Course：本机 snapshot identity，不入库 COURSE_DB。
 */

const DISPLAY_FALLBACK = '临时球场';
const SOURCE = 'temporary';

var _idSeq = 0;

function isTemporarySource(src) {
  if (typeof src === 'string') return src === SOURCE;
  return !!(src && src.courseSource === SOURCE);
}

function normalizePar(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return parseInt(value.trim(), 10);
  return null;
}

function isValidHolePars(holePars) {
  if (!Array.isArray(holePars) || holePars.length !== 18) return false;
  for (var i = 0; i < 18; i++) {
    var n = normalizePar(holePars[i]);
    if (n !== 3 && n !== 4 && n !== 5) return false;
  }
  return true;
}

function isValidTemporaryCourse(record) {
  return isTemporarySource(record) && isValidHolePars(record && record.holePars);
}

function cloneHolePars(holePars) {
  if (!isValidHolePars(holePars)) return null;
  return holePars.map(function (v) {
    return normalizePar(v);
  });
}

function nextTemporaryCourseId() {
  _idSeq += 1;
  return 'tc-' + Date.now() + '-' + _idSeq;
}

function displayCourseName(courseName) {
  var name = courseName != null ? String(courseName).trim() : '';
  return name || DISPLAY_FALLBACK;
}

function totalPar(holePars) {
  var pars = cloneHolePars(holePars);
  if (!pars) return 0;
  return pars.reduce(function (s, v) {
    return s + v;
  }, 0);
}

module.exports = {
  SOURCE: SOURCE,
  DISPLAY_FALLBACK: DISPLAY_FALLBACK,
  isTemporarySource: isTemporarySource,
  isValidHolePars: isValidHolePars,
  isValidTemporaryCourse: isValidTemporaryCourse,
  cloneHolePars: cloneHolePars,
  normalizePar: normalizePar,
  nextTemporaryCourseId: nextTemporaryCourseId,
  displayCourseName: displayCourseName,
  totalPar: totalPar
};
