const catalog = require("./catalog.js");

/** A1–B9 词表。非正式球场；生产必须传入正式 holeOrder。 */
function defaultHoleOrder() {
  return (catalog.HOLES || []).slice();
}

function uniqueLabels(raw) {
  const seen = {};
  const out = [];
  (Array.isArray(raw) ? raw : []).forEach(function (label) {
    const s = String(label == null ? "" : label).trim();
    if (!s || seen[s]) return;
    seen[s] = true;
    out.push(s);
  });
  return out;
}

function normalizeHoleOrder(raw, base) {
  const vocab = uniqueLabels(base && base.length ? base : defaultHoleOrder());
  if (!vocab.length) return uniqueLabels(raw);
  const seen = {};
  const out = [];
  uniqueLabels(raw).forEach(function (s) {
    if (vocab.indexOf(s) >= 0 && !seen[s]) {
      seen[s] = true;
      out.push(s);
    }
  });
  vocab.forEach(function (label) {
    if (!seen[label]) out.push(label);
  });
  return out;
}

function rotateHoleOrderToStart(order, startLabel) {
  const arr = normalizeHoleOrder(order);
  const i = arr.indexOf(String(startLabel));
  if (i <= 0) return arr;
  return arr.slice(i).concat(arr.slice(0, i));
}

function holeOrderTextOf(order) {
  const arr = normalizeHoleOrder(order);
  return (arr[0] || "A1") + "起";
}

function moveHoleOrderIndex(order, from, to) {
  const arr = normalizeHoleOrder(order);
  if (from < 0 || to < 0 || from >= arr.length || to >= arr.length || from === to) {
    return arr;
  }
  const item = arr.splice(from, 1)[0];
  arr.splice(to, 0, item);
  return arr;
}

/** 按洞序重排。传入 order 时以该序列为词表，不补 catalog 缺省 18 洞。 */
function orderHoles(holes, order, fillMissing) {
  const injected = uniqueLabels(order);
  const labels = injected.length
    ? normalizeHoleOrder(order, injected)
    : normalizeHoleOrder(order);
  const map = {};
  (holes || []).forEach(function (item) {
    const key = item && item.label != null ? String(item.label) : String(item);
    map[key] = item && typeof item === "object" ? item : { label: key, on: true };
  });
  const out = [];
  labels.forEach(function (label) {
    if (map[label]) {
      out.push(Object.assign({}, map[label], { label: label }));
      return;
    }
    if (fillMissing) {
      out.push({ label: label, on: true });
    }
  });
  return out;
}

module.exports = {
  defaultHoleOrder,
  uniqueLabels,
  normalizeHoleOrder,
  rotateHoleOrderToStart,
  holeOrderTextOf,
  moveHoleOrderIndex,
  orderHoles
};
