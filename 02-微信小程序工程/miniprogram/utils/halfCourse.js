/**
 * 多半场 COURSE 选择（与球场选择页 buildHalves / confirmHalf 规则一致）
 */

const { COURSE_DB } = require('./courseDatabase.js');

const DEFAULT_PAR9 = [4, 4, 4, 3, 4, 5, 4, 3, 4];

function normPar(par) {
  if (Array.isArray(par)) return par.slice();
  return DEFAULT_PAR9.slice();
}

function buildHalves(course) {
  if (!course) return [];
  if (Array.isArray(course.halfCourses) && course.halfCourses.length) {
    return course.halfCourses.map((h) => {
      const par = normPar(h.par);
      return {
        key: h.code,
        label: h.code + '场',
        name: h.name || '',
        par: par,
        parTotal: par.reduce((s, v) => s + v, 0)
      };
    });
  }
  const count = course.halfCourseCount || 0;
  const arr = [];
  for (let i = 0; i < count; i++) {
    const key = String.fromCharCode(65 + i);
    const par = DEFAULT_PAR9.slice();
    arr.push({
      key: key,
      label: key + '场',
      name: '',
      par: par,
      parTotal: par.reduce((s, v) => s + v, 0)
    });
  }
  return arr;
}

function findCourseById(courseId) {
  if (!courseId) return null;
  return COURSE_DB.find((c) => c.courseId === courseId) || null;
}

function findCourseByName(courseName) {
  const name = (courseName || '').trim();
  if (!name) return null;
  return (
    COURSE_DB.find((c) => c.courseName === name) ||
    COURSE_DB.find((c) => name.indexOf(c.courseName) >= 0 || c.courseName.indexOf(name) >= 0) ||
    null
  );
}

function formatHalfCombo(front9, back9) {
  if (front9 && back9) return front9 + '/' + back9;
  return front9 || back9 || '';
}

function formatCourseHalfText(combo) {
  return combo ? '（' + combo + '）' : '';
}

/** 从「（A/B）」类文案解析前九/后九（兼容仅有 courseHalfText 的旧球队赛） */
function parseCourseHalfText(text) {
  const raw = String(text || '').trim();
  if (!raw) return { front9Course: null, back9Course: null };
  const inner = raw.replace(/^[（(]/, '').replace(/[）)]$/, '').trim();
  if (!inner) return { front9Course: null, back9Course: null };
  const parts = inner.split(/[/／]/).map((s) => String(s || '').trim()).filter(Boolean);
  return {
    front9Course: parts[0] || null,
    back9Course: parts[1] || null
  };
}

function resolveHalfCourseRecord(courseId, courseName) {
  return findCourseById(courseId) || findCourseByName(courseName);
}

function canEditHalfCourse(course) {
  return buildHalves(course).length >= 2;
}

module.exports = {
  buildHalves,
  findCourseById,
  findCourseByName,
  formatHalfCombo,
  formatCourseHalfText,
  parseCourseHalfText,
  resolveHalfCourseRecord,
  canEditHalfCourse
};
