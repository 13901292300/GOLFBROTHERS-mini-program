/**
 * Series 球场身份 / 半场规则（叶子模块：无 ViewModel 依赖）
 * 身份优先稳定 courseId，并计入前九/后九组合；不把 C/A 排成 A/C。
 */

var halfCourse = require('./halfCourse.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function normalizeCourseNameKey(name) {
  return asString(name).replace(/\s+/g, ' ');
}

function foldFullwidthAscii(s) {
  return asString(s).replace(/[\uFF01-\uFF5E]/g, function (ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
  });
}

function normalizeHalfToken(raw) {
  return foldFullwidthAscii(asString(raw)).replace(/\s+/g, '');
}

function isHalfToken(raw) {
  return /^[A-Za-z0-9]{1,3}$/.test(normalizeHalfToken(raw));
}

function halfCodeFromValue(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'object' && !Array.isArray(v)) {
    return normalizeHalfToken(v.key || v.code || v.label || v.name);
  }
  return normalizeHalfToken(v);
}

function parseSeriesHalfPairFromText(text) {
  var raw = asString(text);
  if (!raw) return { front: '', back: '' };
  var parsed = halfCourse.parseCourseHalfText(raw);
  var slashFront = normalizeHalfToken(parsed.front9Course);
  var slashBack = normalizeHalfToken(parsed.back9Course);
  if (isHalfToken(slashFront) && isHalfToken(slashBack)) {
    return { front: slashFront, back: slashBack };
  }
  if (isHalfToken(slashFront) && !slashBack) {
    return { front: slashFront, back: '' };
  }
  var inner = foldFullwidthAscii(raw)
    .replace(/^[（(]/, '')
    .replace(/[）)]$/, '')
    .trim()
    .replace(/\s+/g, '');
  var m = inner.match(/^([A-Za-z0-9]{1,3})[/／+＋&＆]([A-Za-z0-9]{1,3})$/);
  if (!m) {
    if (/^[A-Za-z0-9]{1,3}$/.test(inner) && isHalfToken(inner)) {
      return { front: normalizeHalfToken(inner), back: '' };
    }
    return { front: '', back: '' };
  }
  return { front: m[1], back: m[2] };
}

function stripTrailingCourseHalfSuffix(name) {
  var s = foldFullwidthAscii(asString(name));
  var m = s.match(
    /^(.*?)(?:\s*[（(]\s*([A-Za-z0-9]{1,3})\s*[/／+＋&＆]\s*([A-Za-z0-9]{1,3})\s*[）)]\s*)$/
  );
  if (m) {
    var front = normalizeHalfToken(m[2]);
    var back = normalizeHalfToken(m[3]);
    if (isHalfToken(front) && isHalfToken(back)) {
      return { base: asString(m[1]), front: front, back: back };
    }
  }
  var bare = s.match(
    /^(.*?)\s+([A-Za-z0-9]{1,3})\s*[/／+＋&＆]\s*([A-Za-z0-9]{1,3})\s*$/
  );
  if (bare) {
    var f2 = normalizeHalfToken(bare[2]);
    var b2 = normalizeHalfToken(bare[3]);
    if (isHalfToken(f2) && isHalfToken(b2)) {
      return { base: asString(bare[1]), front: f2, back: b2 };
    }
  }
  return { base: asString(name), front: '', back: '' };
}

function resolveSeriesRoundHalves(round) {
  var r = round && typeof round === 'object' ? round : {};
  var front = halfCodeFromValue(r.front9Course);
  var back = halfCodeFromValue(r.back9Course);
  if (isHalfToken(front) || isHalfToken(back)) {
    return { front: front, back: back, source: 'fields' };
  }
  var fromText = parseSeriesHalfPairFromText(r.courseHalfText || r.courseHalf || r.halfText);
  if (fromText.front || fromText.back) {
    return { front: fromText.front, back: fromText.back, source: 'halfText' };
  }
  var fromName = stripTrailingCourseHalfSuffix(r.courseName);
  if (fromName.front || fromName.back) {
    return { front: fromName.front, back: fromName.back, source: 'name-fallback' };
  }
  return { front: '', back: '', source: '' };
}

function formatSeriesCourseDisplayName(round) {
  return halfCourse.formatCourseDisplayName(round);
}

function formatSeriesCourseHalfSuffix(front, back) {
  var combo = halfCourse.formatHalfCombo(front, back);
  return combo ? ' ' + combo : '';
}

function buildSeriesCourseIdentityKey(round) {
  var r = round && typeof round === 'object' ? round : {};
  var name = asString(r.courseName);
  if (!name) return '';
  var halves = resolveSeriesRoundHalves(r);
  var baseNorm = normalizeCourseNameKey(stripTrailingCourseHalfSuffix(name).base || name);
  var courseId = asString(r.courseId);
  var halfKey = halves.front && halves.back ? halves.front + '/' + halves.back : '';
  return (courseId ? 'id:' + courseId : 'name:' + baseNorm) + '|half:' + halfKey;
}

function sameSeriesCourseLine(a, b) {
  if (!a || !b) return false;
  if (a.halfKey !== b.halfKey) return false;
  if (a.courseId && b.courseId) return a.courseId === b.courseId;
  return !!(a.baseNorm && b.baseNorm && a.baseNorm === b.baseNorm);
}

function buildSeriesCourseLines(roundsInput) {
  var rounds = Array.isArray(roundsInput) ? roundsInput : [];
  var lines = [];
  for (var i = 0; i < rounds.length; i++) {
    var r = rounds[i] || {};
    var name = asString(r.courseName);
    if (!name) continue;
    var display = formatSeriesCourseDisplayName(r);
    var halves = resolveSeriesRoundHalves(r);
    var courseId = asString(r.courseId);
    var baseNorm = normalizeCourseNameKey(stripTrailingCourseHalfSuffix(name).base || name);
    var halfKey = halves.front && halves.back ? halves.front + '/' + halves.back : '';
    var row = {
      courseId: courseId,
      baseNorm: baseNorm,
      halfKey: halfKey,
      name: display
    };
    var mergeIdx = -1;
    for (var j = 0; j < lines.length; j++) {
      if (sameSeriesCourseLine(row, lines[j])) {
        mergeIdx = j;
        break;
      }
    }
    if (mergeIdx >= 0) {
      if (!lines[mergeIdx].courseId && courseId) {
        lines[mergeIdx].courseId = courseId;
      }
      continue;
    }
    lines.push(row);
  }
  return {
    pending: lines.length === 0,
    lines: lines.map(function (x) {
      return x.name;
    })
  };
}

module.exports = {
  resolveSeriesRoundHalves: resolveSeriesRoundHalves,
  formatSeriesCourseDisplayName: formatSeriesCourseDisplayName,
  buildSeriesCourseIdentityKey: buildSeriesCourseIdentityKey,
  buildSeriesCourseLines: buildSeriesCourseLines
};
