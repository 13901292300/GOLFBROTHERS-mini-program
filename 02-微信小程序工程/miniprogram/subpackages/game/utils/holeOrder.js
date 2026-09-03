const catalog = require("./catalog.js");

/** A1–B9 词表。非正式球场；生产必须传入正式 holeOrder。仅作历史数据完全缺失时的兜底。 */
function defaultHoleOrder() {
  return (catalog.HOLES || []).slice();
}

function uniqueLabels(raw) {
  const seen = {};
  const out = [];
  (Array.isArray(raw) ? raw : []).forEach(function (label) {
    const s = asHoleId(label);
    if (!s || seen[s]) return;
    seen[s] = true;
    out.push(s);
  });
  return out;
}

function asHoleId(item) {
  if (item == null) return "";
  if (typeof item === "object") {
    const id =
      item.holeId != null
        ? item.holeId
        : item.id != null
          ? item.id
          : item.label != null
            ? item.label
            : item.displayHoleNo;
    return String(id == null ? "" : id).trim();
  }
  return String(item).trim();
}

function labelsFromHoles(holes) {
  return uniqueLabels(holes);
}

function inferSection(id) {
  const s = String(id == null ? "" : id);
  const m = s.match(/^(.*?)(\d+)$/);
  return m && m[1] ? m[1] : "";
}

function inferVocab(rawLabels, base) {
  const baseLabels = uniqueLabels(base);
  if (baseLabels.length) return baseLabels;
  if (!rawLabels.length) return defaultHoleOrder();
  if (rawLabels.length >= 9) return rawLabels;
  const def = defaultHoleOrder();
  const allInDef = rawLabels.every(function (s) {
    return def.indexOf(s) >= 0;
  });
  return allInDef ? def : rawLabels;
}

function normalizeHoleOrder(raw, base) {
  const rawLabels = uniqueLabels(raw);
  const vocab = inferVocab(rawLabels, base);
  if (!vocab.length) return rawLabels;
  const seen = {};
  const out = [];
  rawLabels.forEach(function (s) {
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

/**
 * 调整洞序 / 全程洞序唯一解析。
 * 1 已保存调整  2 创建时原始  3 洞列表/球场快照兼容  4 仅全空时 A1–B9
 */
function resolveHoleOrder(src) {
  src = src || {};
  const adjusted = uniqueLabels(src.adjusted);
  const created = uniqueLabels(src.created);
  const holes = labelsFromHoles(src.holes);
  const host = uniqueLabels(src.hostOrder);
  const course = labelsFromHoles(
    src.courseSnapshot && (src.courseSnapshot.holes || src.courseSnapshot.holeOrder)
  );
  const route = uniqueLabels(src.routeSnapshot);
  const vocab = created.length
    ? created
    : holes.length
      ? holes
      : host.length
        ? host
        : course.length
          ? course
          : route.length
            ? route
            : [];
  if (adjusted.length && vocab.length) return normalizeHoleOrder(adjusted, vocab);
  if (created.length) return created.slice();
  if (holes.length) return holes.slice();
  if (host.length) return host.slice();
  if (course.length) return course.slice();
  if (route.length) return route.slice();
  if (adjusted.length) return normalizeHoleOrder(adjusted);
  return defaultHoleOrder();
}

function isAbDefaultLabels(labels) {
  const def = defaultHoleOrder();
  const ids = uniqueLabels(labels);
  if (!ids.length) return false;
  return ids.every(function (s) {
    return def.indexOf(s) >= 0;
  });
}

function shouldMigrateAbPollution(full, created) {
  const f = uniqueLabels(full);
  const c = uniqueLabels(created);
  if (!f.length || !c.length || f.length !== c.length) return false;
  if (isAbDefaultLabels(c)) return false;
  if (!isAbDefaultLabels(f)) return false;
  const createdSet = {};
  c.forEach(function (id) {
    createdSet[id] = true;
  });
  return f.some(function (id) {
    return !createdSet[id];
  });
}

function migrateAbOrderToCreated(full, created) {
  const f = uniqueLabels(full);
  const c = uniqueLabels(created);
  const def = defaultHoleOrder();
  if (!shouldMigrateAbPollution(f, c)) return f;
  return f.map(function (ab) {
    const i = def.indexOf(ab);
    if (i >= 0 && c[i] != null) return c[i];
    return ab;
  });
}

function alignHolesToFullOrder(holes, fullIds) {
  const ids = uniqueLabels(fullIds);
  const list = holes || [];
  const map = {};
  list.forEach(function (item) {
    const key = asHoleId(item);
    if (key) map[key] = item && typeof item === "object" ? item : { label: key, on: true };
  });
  const overlap = ids.some(function (id) {
    return !!map[id];
  });
  return ids.map(function (id, i) {
    if (map[id]) {
      return Object.assign({}, map[id], { label: id, holeId: map[id].holeId || id });
    }
    if (!overlap && list[i]) {
      const prev = list[i];
      const obj = prev && typeof prev === "object" ? prev : { on: true };
      return Object.assign({}, obj, { label: id, holeId: id, on: obj.on !== false });
    }
    return { label: id, holeId: id, on: true };
  });
}

function hcapGroupsFromOrder(order) {
  const ids = uniqueLabels(order);
  return {
    front9: ids.slice(0, 9),
    back9: ids.slice(9, 18),
    front6: ids.slice(0, 6),
    mid6: ids.slice(6, 12),
    back6: ids.slice(12, 18)
  };
}

function usedDefaultAbFallback(src) {
  const resolved = resolveHoleOrder(src);
  const def = defaultHoleOrder();
  const created = uniqueLabels(src && src.created);
  const holes = labelsFromHoles(src && src.holes);
  const host = uniqueLabels(src && src.hostOrder);
  const adjusted = uniqueLabels(src && src.adjusted);
  const course = labelsFromHoles(
    src && src.courseSnapshot && (src.courseSnapshot.holes || src.courseSnapshot.holeOrder)
  );
  const route = uniqueLabels(src && src.routeSnapshot);
  const hasReal =
    created.length || holes.length || host.length || course.length || route.length || adjusted.length;
  return !hasReal && resolved.join(",") === def.join(",");
}

function buildHoleRecords(labels, opts) {
  opts = opts || {};
  const pars = opts.pars || {};
  return uniqueLabels(labels).map(function (id, i) {
    return {
      holeId: id,
      displayHoleNo: id,
      courseSection: inferSection(id),
      par: pars[id] != null ? Number(pars[id]) : opts.defaultPar,
      originalIndex: i
    };
  });
}

function orderRecordsByIds(records, orderedIds) {
  const map = {};
  (records || []).forEach(function (row) {
    if (!row) return;
    const id = asHoleId(row);
    if (id) map[id] = row;
  });
  return uniqueLabels(orderedIds)
    .map(function (id) {
      return map[id] || null;
    })
    .filter(Boolean);
}

function rotateHoleOrderToStart(order, startLabel) {
  const arr = uniqueLabels(order);
  if (!arr.length) return defaultHoleOrder();
  const i = arr.indexOf(String(startLabel));
  if (i <= 0) return arr;
  return arr.slice(i).concat(arr.slice(0, i));
}

function holeOrderTextOf(order) {
  const arr = uniqueLabels(order);
  if (arr.length) return arr[0] + "起";
  return (defaultHoleOrder()[0] || "A1") + "起";
}

function moveHoleOrderIndex(order, from, to) {
  const arr = uniqueLabels(order);
  if (!arr.length) return arr;
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
    const key = asHoleId(item);
    if (!key) return;
    map[key] = item && typeof item === "object" ? item : { label: key, on: true };
  });
  const out = [];
  labels.forEach(function (label) {
    if (map[label]) {
      const prev = map[label];
      out.push(Object.assign({}, prev, { label: prev.label != null ? prev.label : label, holeId: prev.holeId || label }));
      return;
    }
    if (fillMissing) {
      out.push({ label: label, holeId: label, on: true });
    }
  });
  return out;
}

module.exports = {
  defaultHoleOrder,
  uniqueLabels,
  asHoleId,
  labelsFromHoles,
  normalizeHoleOrder,
  resolveHoleOrder,
  usedDefaultAbFallback,
  buildHoleRecords,
  orderRecordsByIds,
  rotateHoleOrderToStart,
  holeOrderTextOf,
  moveHoleOrderIndex,
  orderHoles,
  isAbDefaultLabels,
  shouldMigrateAbPollution,
  migrateAbOrderToCreated,
  alignHolesToFullOrder,
  hcapGroupsFromOrder,
  inferSection
};
