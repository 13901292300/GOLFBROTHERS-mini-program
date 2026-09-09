/**
 * 18 洞记分表 HOLE / PAR 布局（随 FRONT/BACK COURSE 切换）
 */

const halfCourse = require('./halfCourse.js');
const courseDatabase = require('./courseDatabase.js');
const temporaryCourse = require('./temporaryCourse.js');

const DEFAULT_PAR9 = [4, 4, 4, 3, 4, 5, 4, 3, 4];
const SPECIAL_IDX = [9, 19, 20];
/** 成绩数组固定 18 格；scores[i] 绑定记分格位置 i，与 course 洞号标签无关 */
const SCORE_CELL_COUNT = 18;

function sumPar(arr) {
  return (arr || []).reduce((s, v) => s + v, 0);
}

function par9ForHalf(course, key, ctx) {
  if (courseDatabase.shouldUseLegacyQinghewanAB(course, key, ctx)) {
    return (courseDatabase.QHW_LEGACY_AB_PAR || DEFAULT_PAR9).slice();
  }
  if (!key) return DEFAULT_PAR9.slice();
  const halves = halfCourse.buildHalves(course);
  const half = halves.find((h) => h.key === key);
  if (half && Array.isArray(half.par) && half.par.length) return half.par.slice();
  return DEFAULT_PAR9.slice();
}

/** 由球场 + 前9/后9 COURSE 代码构建 18 洞布局 */
function buildHoleLayout(course, front9Key, back9Key, ctx) {
  const frontKey = front9Key || 'A';
  const backKey = back9Key || front9Key || 'B';
  const frontPars = par9ForHalf(course, frontKey, ctx);
  const backPars = par9ForHalf(course, backKey, ctx);
  const holePars = frontPars.concat(backPars);
  const frontLabels = frontPars.map((_, i) => frontKey + (i + 1));
  const backLabels = backPars.map((_, i) => backKey + (i + 1));
  const outPar = sumPar(frontPars);
  const inPar = sumPar(backPars);
  const columnLabels = frontLabels.concat(['OUT'], backLabels, ['IN', 'TOT']);
  const columnPars = frontPars.concat([outPar], backPars, [inPar, outPar + inPar]);
  return {
    holePars: holePars,
    columnLabels: columnLabels,
    columnPars: columnPars,
    front9Key: frontKey,
    back9Key: backKey,
    specialIdx: SPECIAL_IDX.slice()
  };
}

function createDefaultLayout() {
  return buildHoleLayout(null, 'A', 'B');
}

const _active = createDefaultLayout();

function getLayout() {
  return _active;
}

function applyLayout(layout) {
  if (!layout) return _active;
  _active.holePars = (layout.holePars || []).slice();
  _active.columnLabels = (layout.columnLabels || []).slice();
  _active.columnPars = (layout.columnPars || []).slice();
  _active.front9Key = layout.front9Key || 'A';
  _active.back9Key = layout.back9Key || 'B';
  _active.specialIdx = (layout.specialIdx || SPECIAL_IDX).slice();
  return _active;
}

function isHalfKeyOnCourse(course, key) {
  if (!key) return false;
  const halves = halfCourse.buildHalves(course);
  return halves.some((h) => h.key === key);
}

/** 缺半场、或记下的 A/B 在该球场不存在时，回退到球场真实前两个 COURSE（如 C/D） */
function resolveHalfKeys(course, ctx) {
  const c = ctx || {};
  let front9 = c.front9Course || null;
  let back9 = c.back9Course || null;
  if (!isHalfKeyOnCourse(course, front9) && !isHalfKeyOnCourse(course, back9)) {
    const parsed = halfCourse.parseCourseHalfText(c.courseHalfText || c.halfText || '');
    front9 = parsed.front9Course;
    back9 = parsed.back9Course;
  }
  if (!isHalfKeyOnCourse(course, front9) && !isHalfKeyOnCourse(course, back9)) {
    const name = String((c.courseName || (course && course.courseName) || '')).toUpperCase();
    const m = name.match(/([A-Z])\s*[&＆／/]\s*([A-Z])/);
    if (m) {
      front9 = m[1];
      back9 = m[2];
    }
  }
  const halves = halfCourse.buildHalves(course);
  if (!isHalfKeyOnCourse(course, front9)) {
    front9 = halves[0] ? halves[0].key : null;
  }
  if (!isHalfKeyOnCourse(course, back9)) {
    back9 = halves[1] ? halves[1].key : front9;
  }
  return { front9: front9, back9: back9 };
}

function buildLayoutFromHolePars(holePars, frontKey, backKey) {
  const pars = temporaryCourse.cloneHolePars(holePars);
  if (!pars) return null;
  const front = frontKey || 'A';
  const back = backKey || 'B';
  const frontPars = pars.slice(0, 9);
  const backPars = pars.slice(9, 18);
  const outPar = sumPar(frontPars);
  const inPar = sumPar(backPars);
  const frontLabels = frontPars.map((_, i) => front + (i + 1));
  const backLabels = backPars.map((_, i) => back + (i + 1));
  return {
    holePars: pars,
    columnLabels: frontLabels.concat(['OUT'], backLabels, ['IN', 'TOT']),
    columnPars: frontPars.concat([outPar], backPars, [inPar, outPar + inPar]),
    front9Key: front,
    back9Key: back,
    specialIdx: SPECIAL_IDX.slice()
  };
}

function invalidTemporaryLayout() {
  return {
    holePars: [],
    columnLabels: [],
    columnPars: [],
    front9Key: 'A',
    back9Key: 'B',
    specialIdx: SPECIAL_IDX.slice(),
    invalidTemporarySnapshot: true
  };
}

function contextFromRecord(src) {
  const o = src && typeof src === 'object' ? src : {};
  const parsed =
    !o.front9Course && !o.back9Course
      ? halfCourse.parseCourseHalfText(o.courseHalfText || o.courseHalf || o.halfText || '')
      : {};
  return {
    courseId: o.courseId || '',
    courseName: o.courseName || '',
    front9Course: o.front9Course != null ? o.front9Course : parsed.front9Course || null,
    back9Course: o.back9Course != null ? o.back9Course : parsed.back9Course || null,
    courseHalfText: o.courseHalfText || o.halfText || '',
    courseLayoutRevision: o.courseLayoutRevision,
    courseSource: o.courseSource || '',
    holePars: o.holePars,
    temporaryCourseId: o.temporaryCourseId || ''
  };
}

function resolveLayoutFromContext(ctx) {
  const c = ctx || {};
  if (temporaryCourse.isTemporarySource(c)) {
    const snap = buildLayoutFromHolePars(c.holePars, c.front9Course || 'A', c.back9Course || 'B');
    if (snap) return snap;
    try {
      console.warn('temporary course snapshot invalid');
    } catch (e) {
      /* ignore */
    }
    return invalidTemporaryLayout();
  }
  const course =
    halfCourse.resolveHalfCourseRecord(c.courseId, c.courseName) || null;
  if (!course) return createDefaultLayout();
  const keys = resolveHalfKeys(course, c);
  if (!keys.front9 && !keys.back9) return createDefaultLayout();
  return buildHoleLayout(course, keys.front9, keys.back9, c);
}

module.exports = {
  SCORE_CELL_COUNT,
  SPECIAL_IDX,
  buildHoleLayout,
  buildLayoutFromHolePars,
  createDefaultLayout,
  getLayout,
  applyLayout,
  contextFromRecord,
  resolveLayoutFromContext
};
