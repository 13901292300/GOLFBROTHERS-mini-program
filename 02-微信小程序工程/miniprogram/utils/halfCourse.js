/**
 * 多半场 COURSE 选择（与球场选择页 buildHalves / confirmHalf 规则一致）
 */

const {
  COURSE_DB,
  findCourseById: findDbCourseById,
  canonicalizeQinghewanBaseName,
  isQinghewanBaseName,
  canonicalCourseId,
  QHW_CANONICAL_ID,
  QHW_DISPLAY_NAME
} = require('./courseDatabase.js');
const temporaryCourse = require('./temporaryCourse.js');

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
  return findDbCourseById(courseId);
}

function findCourseByName(courseName) {
  const name = (courseName || '').trim();
  if (!name) return null;
  const exact = COURSE_DB.find((c) => c.courseName === name);
  if (exact) return exact;
  const stripped = stripHalfComboSuffix(name);
  const canon = canonicalizeQinghewanBaseName(stripped.base || name);
  const byCanon = COURSE_DB.find((c) => c.courseName === canon);
  if (byCanon) return byCanon;
  if (isQinghewanBaseName(name) || isQinghewanBaseName(stripped.base)) {
    return findDbCourseById('c-qhw');
  }
  // 模糊时取最长命中，避免短名抢掉更具体球场
  let best = null;
  let bestLen = 0;
  COURSE_DB.forEach((c) => {
    const cn = String(c.courseName || '').trim();
    if (!cn) return;
    if (name.indexOf(cn) >= 0 || cn.indexOf(name) >= 0) {
      if (cn.length > bestLen) {
        best = c;
        bestLen = cn.length;
      }
    }
  });
  return best;
}

function stripHalfComboSuffix(name) {
  var s = _trim(name);
  var paren = stripParenHalfSuffix(s);
  if (paren.hit) {
    return {
      base: paren.base,
      front9Course: paren.front9Course,
      back9Course: paren.back9Course
    };
  }
  var m = s.match(/^(.*?)([A-Za-z0-9]{1,3})场?\s*[/／+＋&＆]\s*([A-Za-z0-9]{1,3})场?\s*$/i);
  if (m) {
    var a = normalizeHalfCode(m[2]);
    var b = normalizeHalfCode(m[3]);
    if (a && b) {
      return { base: _trim(m[1]), front9Course: a, back9Course: b };
    }
  }
  return { base: s, front9Course: null, back9Course: null };
}

function _trim(v) {
  return v == null ? '' : String(v).trim();
}

function foldFullwidthAscii(s) {
  return _trim(s).replace(/[\uFF01-\uFF5E]/g, function (ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
  });
}

/** 半场代码：A–Z / 1–3 位字母数字，去掉「场」 */
function normalizeHalfCode(raw) {
  var t = foldFullwidthAscii(raw).replace(/\s+/g, '').replace(/场$/i, '');
  if (!/^[A-Za-z0-9]{1,3}$/.test(t)) return '';
  return t.toUpperCase();
}

function isHalfCode(raw) {
  return !!normalizeHalfCode(raw);
}

/**
 * 仅识别明确半场组合：A/B、A&B、A+B、（A/D）、(A) 等。
 * 不把「前九」「18洞」「（国际）」当成半场。
 */
function parseHalfPair(text) {
  var raw = foldFullwidthAscii(text);
  if (!raw) return { front9Course: null, back9Course: null };
  var inner = raw
    .replace(/^[（(]/, '')
    .replace(/[）)]$/, '')
    .trim()
    .replace(/^Course\s+/i, '')
    .replace(/\s+/g, '');
  if (!inner) return { front9Course: null, back9Course: null };
  var m = inner.match(/^([A-Za-z0-9]{1,3})场?(?:[/／+＋&＆]([A-Za-z0-9]{1,3})场?)?$/i);
  if (!m) return { front9Course: null, back9Course: null };
  var a = normalizeHalfCode(m[1]);
  var b = m[2] ? normalizeHalfCode(m[2]) : '';
  if (!a) return { front9Course: null, back9Course: null };
  return { front9Course: a, back9Course: b || null };
}

function formatHalfCombo(front9, back9) {
  var a = normalizeHalfCode(front9);
  var b = normalizeHalfCode(back9);
  if (a && b) return a + '&' + b;
  return a || b || '';
}

/** 存盘/表单后缀：有半场时前导空格 + A&D，无括号 */
function formatCourseHalfText(combo) {
  var parsed = parseHalfPair(combo);
  var text = formatHalfCombo(parsed.front9Course, parsed.back9Course);
  return text ? ' ' + text : '';
}

/** 从「（A/B）」/「A&D」类文案解析前九/后九（兼容旧球队赛） */
function parseCourseHalfText(text) {
  return parseHalfPair(text);
}

var PAREN_HALF_SUFFIX =
  /[（(]\s*([A-Za-z0-9]{1,3})场?\s*(?:[/／+＋&＆]\s*([A-Za-z0-9]{1,3})场?\s*)?[）)]\s*$/i;
var BARE_PAIR_SUFFIX =
  /\s+([A-Za-z0-9]{1,3})场?\s*[/／+＋&＆]\s*([A-Za-z0-9]{1,3})场?\s*$/i;

function stripParenHalfSuffix(name) {
  var s = _trim(name);
  var m = s.match(PAREN_HALF_SUFFIX);
  if (!m) return { base: s, front9Course: null, back9Course: null, hit: false };
  var a = normalizeHalfCode(m[1]);
  var b = m[2] ? normalizeHalfCode(m[2]) : '';
  if (!a) return { base: s, front9Course: null, back9Course: null, hit: false };
  return {
    base: s.slice(0, m.index).trimEnd(),
    front9Course: a,
    back9Course: b || null,
    hit: true
  };
}

function stripBarePairSuffixIfMatch(name, combo) {
  var s = _trim(name);
  if (!combo) return s;
  var m = s.match(BARE_PAIR_SUFFIX);
  if (!m) return s;
  var got = formatHalfCombo(m[1], m[2]);
  if (got !== combo) return s;
  return s.slice(0, m.index).trimEnd();
}

function stripBareSingleSuffixIfMatch(name, combo) {
  var s = _trim(name);
  if (!combo || /[&＆+/／]/.test(combo)) return s;
  var re = new RegExp('\\s+' + combo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '场?\\s*$', 'i');
  if (!re.test(s)) return s;
  return s.replace(re, '').trimEnd();
}

function resolveDisplayHalves(input) {
  var o = input && typeof input === 'object' ? input : {};
  var f = normalizeHalfCode(o.front9Course || o.front9);
  var b = normalizeHalfCode(o.back9Course || o.back9);
  if (f || b) return { front9Course: f || null, back9Course: b || null };
  var fromText = parseHalfPair(o.courseHalfText || o.halfText || o.courseHalf || '');
  if (fromText.front9Course || fromText.back9Course) return fromText;
  var fromName = stripParenHalfSuffix(o.courseName || o.course || '');
  if (fromName.hit) {
    return { front9Course: fromName.front9Course, back9Course: fromName.back9Course };
  }
  return { front9Course: null, back9Course: null };
}

/**
 * 展示用球场名：原始名 + 空格 + A&D（保留选择顺序）。
 * 无半场时不加空格、&、括号或 undefined。
 */
function formatCourseDisplayName(input) {
  var o = input && typeof input === 'object' ? input : {};
  if (temporaryCourse.isTemporarySource(o)) {
    return temporaryCourse.displayCourseName(o.courseName);
  }
  var rawName = _trim(o.courseName || o.course || '');
  var halves = resolveDisplayHalves(o);
  var fromName = stripHalfComboSuffix(rawName);
  if (!halves.front9Course && !halves.back9Course) {
    if (fromName.front9Course || fromName.back9Course) {
      halves = { front9Course: fromName.front9Course, back9Course: fromName.back9Course };
    }
  }
  var combo = formatHalfCombo(halves.front9Course, halves.back9Course);
  var name = fromName.base || rawName;
  name = stripBarePairSuffixIfMatch(name, combo);
  name = stripBareSingleSuffixIfMatch(name, combo);
  if (
    canonicalCourseId(o.courseId) === QHW_CANONICAL_ID ||
    isQinghewanBaseName(name) ||
    isQinghewanBaseName(rawName)
  ) {
    name = QHW_DISPLAY_NAME;
  } else {
    name = canonicalizeQinghewanBaseName(name);
  }
  if (!name) return combo || '';
  if (!combo) return name;
  return name + ' ' + combo;
}

/** 半场码走 formatCourseDisplayName；「前九」等非半场备注用 · 追加，不伪造第二半场 */
function formatCourseLineForUi(input) {
  var o = input && typeof input === 'object' ? input : {};
  var display = formatCourseDisplayName(o);
  var raw = _trim(o.courseHalfText || o.halfText);
  if (!raw) return display;
  var parsed = parseHalfPair(raw);
  if (parsed.front9Course || parsed.back9Course) return display;
  var note = raw.replace(/^[（(]/, '').replace(/[）)]$/, '').trim();
  if (!note || /^undefined$/i.test(note)) return display;
  if (display && display.indexOf(note) >= 0) return display;
  return display ? display + ' · ' + note : note;
}

function hasSelectedCourse(record) {
  if (temporaryCourse.isValidTemporaryCourse(record)) return true;
  var o = record && typeof record === 'object' ? record : {};
  return !!(_trim(o.courseId) && _trim(o.courseName));
}

function buildCourseSelectionFields(payload) {
  var p = payload && typeof payload === 'object' ? payload : {};
  var isTemporary = p.courseSource === 'temporary';
  var courseHalfText = halfTextFromPayload(p);
  var courseName = _trim(p.courseName);
  var front9 = p.front9Course != null ? p.front9Course : p.front9;
  var back9 = p.back9Course != null ? p.back9Course : p.back9;
  if (isTemporary) {
    front9 = front9 || 'A';
    back9 = back9 || 'B';
    courseHalfText = formatCourseHalfText(formatHalfCombo(front9, back9));
  }
  var fields = {
    courseId: isTemporary ? '' : p.courseId || '',
    courseName: courseName,
    courseLocation: isTemporary ? '' : p.courseLocation || '',
    front9Course: front9 || null,
    back9Course: back9 || null,
    courseHalfText: courseHalfText,
    courseSource: isTemporary ? 'temporary' : '',
    temporaryCourseId: isTemporary ? String(p.temporaryCourseId || '').trim() : '',
    holePars: isTemporary && Array.isArray(p.holePars) ? p.holePars.slice() : null,
    courseDisplayName: formatCourseDisplayName({
      courseId: isTemporary ? '' : p.courseId || '',
      courseName: courseName,
      front9Course: front9,
      back9Course: back9,
      courseHalfText: courseHalfText,
      courseSource: isTemporary ? 'temporary' : ''
    })
  };
  if (!isTemporary && p.courseLayoutRevision != null) {
    fields.courseLayoutRevision = p.courseLayoutRevision;
  }
  if (isTemporary) {
    fields.courseLayoutRevision = null;
  }
  fields.hasSelectedCourse = hasSelectedCourse(fields);
  return fields;
}

function halfTextFromPayload(payload) {
  var p = payload && typeof payload === 'object' ? payload : {};
  var combo = formatHalfCombo(p.front9Course || p.front9, p.back9Course || p.back9);
  if (!combo) {
    var parsed = parseHalfPair(p.halfText || p.courseHalfText || '');
    combo = formatHalfCombo(parsed.front9Course, parsed.back9Course);
  }
  return formatCourseHalfText(combo);
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
  formatCourseDisplayName,
  formatCourseLineForUi,
  hasSelectedCourse,
  buildCourseSelectionFields,
  parseCourseHalfText,
  parseHalfPair,
  resolveDisplayHalves,
  normalizeHalfCode,
  halfTextFromPayload,
  resolveHalfCourseRecord,
  canEditHalfCourse,
  stripHalfComboSuffix
};
