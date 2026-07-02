/**
 * 18 洞记分表 HOLE / PAR 布局（随 FRONT/BACK COURSE 切换）
 */

const halfCourse = require('./halfCourse.js');

const DEFAULT_PAR9 = [4, 4, 4, 3, 4, 5, 4, 3, 4];
const SPECIAL_IDX = [9, 19, 20];
/** 成绩数组固定 18 格；scores[i] 绑定记分格位置 i，与 course 洞号标签无关 */
const SCORE_CELL_COUNT = 18;

function sumPar(arr) {
  return (arr || []).reduce((s, v) => s + v, 0);
}

function par9ForHalf(course, key) {
  if (!key) return DEFAULT_PAR9.slice();
  const halves = halfCourse.buildHalves(course);
  const half = halves.find((h) => h.key === key);
  if (half && Array.isArray(half.par) && half.par.length) return half.par.slice();
  return DEFAULT_PAR9.slice();
}

/** 由球场 + 前9/后9 COURSE 代码构建 18 洞布局 */
function buildHoleLayout(course, front9Key, back9Key) {
  const frontKey = front9Key || 'A';
  const backKey = back9Key || front9Key || 'B';
  const frontPars = par9ForHalf(course, frontKey);
  const backPars = par9ForHalf(course, backKey);
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

function resolveLayoutFromContext(ctx) {
  const c = ctx || {};
  const course =
    halfCourse.resolveHalfCourseRecord(c.courseId, c.courseName) || null;
  const front9 = c.front9Course || null;
  const back9 = c.back9Course || null;
  if (course && (front9 || back9)) {
    return buildHoleLayout(course, front9, back9);
  }
  return createDefaultLayout();
}

module.exports = {
  SCORE_CELL_COUNT,
  SPECIAL_IDX,
  buildHoleLayout,
  createDefaultLayout,
  getLayout,
  applyLayout,
  resolveLayoutFromContext
};
