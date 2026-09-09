/**
 * 普通创建 Temporary Course：本机 snapshot identity，不入库 COURSE_DB。
 */

const DISPLAY_FALLBACK = '临时球场';
const SOURCE = 'temporary';
const VALID_PARS = [3, 4, 5, 6];
const VALID_COURSES = ['A', 'B', 'C', 'D', 'E', 'F'];

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

function isValidPar(value) {
  var n = normalizePar(value);
  return n === 3 || n === 4 || n === 5 || n === 6;
}

function keepStandardPar(value, fallback) {
  if (isValidPar(value)) return normalizePar(value);
  if (isValidPar(fallback)) return normalizePar(fallback);
  return 4;
}

function parseParInput(raw) {
  var s = raw == null ? '' : String(raw);
  var i;
  var ch;
  var n;
  for (i = 0; i < s.length; i++) {
    ch = s.charAt(i);
    if (ch < '0' || ch > '9') continue;
    n = parseInt(ch, 10);
    if (isValidPar(n)) return n;
  }
  return null;
}

function isValidHolePars(holePars) {
  if (!Array.isArray(holePars) || holePars.length !== 18) return false;
  var i;
  for (i = 0; i < 18; i++) {
    if (!isValidPar(holePars[i])) return false;
  }
  return true;
}

function normalizeCourseKey(key) {
  var k = key == null ? '' : String(key).trim().toUpperCase();
  return VALID_COURSES.indexOf(k) >= 0 ? k : '';
}

function isValidCourseKey(key) {
  return !!normalizeCourseKey(key);
}

function isValidNineHolePars(pars) {
  if (!Array.isArray(pars) || pars.length !== 9) return false;
  var i;
  for (i = 0; i < 9; i++) {
    if (!isValidPar(pars[i])) return false;
  }
  return true;
}

function areSameNineHolePars(frontPars, backPars) {
  if (!isValidNineHolePars(frontPars) || !isValidNineHolePars(backPars)) return false;
  var i;
  for (i = 0; i < 9; i++) {
    if (normalizePar(frontPars[i]) !== normalizePar(backPars[i])) return false;
  }
  return true;
}

function hasConflictingDuplicateCourse(record) {
  var front = normalizeCourseKey(record && record.front9Course);
  var back = normalizeCourseKey(record && record.back9Course);
  if (!front || front !== back) return false;
  var holePars = record && record.holePars;
  if (!isValidHolePars(holePars)) return false;
  return !areSameNineHolePars(holePars.slice(0, 9), holePars.slice(9, 18));
}

function isValidTemporaryCourse(record) {
  return (
    isTemporarySource(record) &&
    isValidHolePars(record && record.holePars) &&
    isValidCourseKey(record && record.front9Course) &&
    isValidCourseKey(record && record.back9Course) &&
    !hasConflictingDuplicateCourse(record)
  );
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

function sumParsRange(holePars, start, end) {
  var s = 0;
  var i;
  var n;
  var from = start || 0;
  var to = end == null ? (Array.isArray(holePars) ? holePars.length : 0) : end;
  for (i = from; i < to; i++) {
    n = normalizePar(holePars && holePars[i]);
    if (isValidPar(n)) s += n;
  }
  return s;
}

function front9ParTotal(holePars) {
  return sumParsRange(holePars, 0, 9);
}

function back9ParTotal(holePars) {
  return sumParsRange(holePars, 9, 18);
}

function totalPar(holePars) {
  return front9ParTotal(holePars) + back9ParTotal(holePars);
}

module.exports = {
  SOURCE: SOURCE,
  DISPLAY_FALLBACK: DISPLAY_FALLBACK,
  VALID_PARS: VALID_PARS,
  VALID_COURSES: VALID_COURSES,
  isTemporarySource: isTemporarySource,
  isValidPar: isValidPar,
  isValidHolePars: isValidHolePars,
  isValidCourseKey: isValidCourseKey,
  isValidNineHolePars: isValidNineHolePars,
  areSameNineHolePars: areSameNineHolePars,
  hasConflictingDuplicateCourse: hasConflictingDuplicateCourse,
  DUPLICATE_COURSE_PAR_ERROR: '相同 COURSE 的标准 PAR 必须一致',
  isValidTemporaryCourse: isValidTemporaryCourse,
  cloneHolePars: cloneHolePars,
  normalizePar: normalizePar,
  keepStandardPar: keepStandardPar,
  parseParInput: parseParInput,
  normalizeCourseKey: normalizeCourseKey,
  nextTemporaryCourseId: nextTemporaryCourseId,
  displayCourseName: displayCourseName,
  sumParsRange: sumParsRange,
  front9ParTotal: front9ParTotal,
  back9ParTotal: back9ParTotal,
  totalPar: totalPar
};
