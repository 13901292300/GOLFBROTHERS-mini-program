/**
 * 系列赛颜色圆圈 + 首字符（叶子模块）
 * - 自然首字符：trim 后取完整 grapheme，英文大写，不拆 emoji
 * - 颜色只接受持久化合法 hex，不按顺序重分配、不回填调色板
 */

function asString(v) {
  return v == null ? '' : String(v).trim();
}

var ZWJ_CODE = 0x200d;

function isGraphemeExtender(cp) {
  if (!Number.isFinite(cp)) return false;
  if (cp === 0xfe0e || cp === 0xfe0f) return true;
  if (cp === 0x20e3) return true;
  if (cp >= 0x1f3fb && cp <= 0x1f3ff) return true;
  if (cp >= 0x300 && cp <= 0x36f) return true;
  return false;
}

function takeFirstGrapheme(str) {
  var s = str != null ? String(str) : '';
  if (!s) return '';
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    try {
      var segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s);
      var iterator = segments[Symbol.iterator]();
      var step = iterator.next();
      if (!step.done && step.value && step.value.segment) return step.value.segment;
    } catch (err) {
      /* fall through */
    }
  }
  var i = 0;
  var cp = s.codePointAt(0);
  if (cp == null) return '';
  var out = String.fromCodePoint(cp);
  i += cp > 0xffff ? 2 : 1;
  while (i < s.length) {
    var next = s.codePointAt(i);
    if (next === ZWJ_CODE) {
      out += String.fromCodePoint(next);
      i += 1;
      if (i >= s.length) break;
      var after = s.codePointAt(i);
      out += String.fromCodePoint(after);
      i += after > 0xffff ? 2 : 1;
      continue;
    }
    if (isGraphemeExtender(next)) {
      out += String.fromCodePoint(next);
      i += next > 0xffff ? 2 : 1;
      continue;
    }
    break;
  }
  return out;
}

function firstDisplayGrapheme(name, emptyPlaceholder) {
  var placeholder = asString(emptyPlaceholder).trim();
  var s = asString(name).trim();
  if (!s) s = placeholder;
  if (!s) return '';
  var g = takeFirstGrapheme(s);
  if (!g) return placeholder ? takeFirstGrapheme(placeholder) : '';
  if (g.length === 1 && g >= 'a' && g <= 'z') return g.toUpperCase();
  return g;
}

function sanitizePersistedColor(raw) {
  var s = asString(raw);
  if (!s) return '';
  if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(s)) return s;
  return '';
}

/**
 * @param {{ name?: string, color?: string, emptyNamePlaceholder?: string }} opts
 */
function buildColorMark(opts) {
  var o = opts && typeof opts === 'object' ? opts : {};
  var placeholder = asString(o.emptyNamePlaceholder) || '未命名分队';
  var color = sanitizePersistedColor(o.color);
  var fallbackText = firstDisplayGrapheme(o.name, placeholder) || takeFirstGrapheme(placeholder) || '未';
  return {
    fallbackText: fallbackText,
    color: color,
    backgroundStyle: color ? 'background:' + color + ';' : ''
  };
}

module.exports = {
  takeFirstGrapheme: takeFirstGrapheme,
  firstDisplayGrapheme: firstDisplayGrapheme,
  sanitizePersistedColor: sanitizePersistedColor,
  buildColorMark: buildColorMark
};
