'use strict';

var DEFAULT_LIMIT = 50;
var MAX_LIMIT = 100;
var QUERY_ALL_PAGE = 100;
var QUERY_ALL_MAX_PAGES = 50;

function clampLimit(n) {
  var x = Number(n);
  if (!x || x < 1) return DEFAULT_LIMIT;
  if (x > MAX_LIMIT) return MAX_LIMIT;
  return Math.floor(x);
}

function encodeCursor(obj) {
  if (!obj) return '';
  try {
    return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
  } catch (e) {
    return '';
  }
}

function decodeCursor(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(Buffer.from(String(raw), 'base64').toString('utf8'));
  } catch (e) {
    return null;
  }
}

function prefixRange(prefix) {
  var p = String(prefix || '');
  return { field: 'searchKey', gte: p, lt: p + '\uffff' };
}

function ensureOrderBy(orderBy) {
  var list = Array.isArray(orderBy) ? orderBy.slice() : [];
  var hasId = list.some(function (o) {
    return o && o.field === '_id';
  });
  if (!hasId) {
    var dir = list.length && list[0].direction === 'asc' ? 'asc' : 'desc';
    list.push({ field: '_id', direction: dir });
  }
  return list;
}

function cmpVal(a, b) {
  if (a == null && b == null) return 0;
  if (typeof a === 'number' && typeof b === 'number') {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
  var as = String(a == null ? '' : a);
  var bs = String(b == null ? '' : b);
  if (as < bs) return -1;
  if (as > bs) return 1;
  return 0;
}

function rowVal(row, field) {
  if (field === '_id') return row._id;
  return row[field];
}

function matchEq(row, where) {
  if (!where) return true;
  var keys = Object.keys(where);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (cmpVal(rowVal(row, k), where[k]) !== 0) return false;
  }
  return true;
}

function matchRange(row, range) {
  if (!range || !range.field) return true;
  var v = rowVal(row, range.field);
  if (range.gte != null && cmpVal(v, range.gte) < 0) return false;
  if (range.gt != null && cmpVal(v, range.gt) <= 0) return false;
  if (range.lte != null && cmpVal(v, range.lte) > 0) return false;
  if (range.lt != null && cmpVal(v, range.lt) >= 0) return false;
  return true;
}

function afterCursor(row, cursor, orderBy) {
  if (!cursor) return true;
  for (var i = 0; i < orderBy.length; i++) {
    var f = orderBy[i].field;
    var dir = orderBy[i].direction === 'asc' ? 1 : -1;
    var c = cmpVal(rowVal(row, f), cursor[f]);
    if (c === 0) continue;
    return dir === 1 ? c > 0 : c < 0;
  }
  return false;
}

function sortRows(rows, orderBy) {
  return rows.slice().sort(function (a, b) {
    for (var i = 0; i < orderBy.length; i++) {
      var dir = orderBy[i].direction === 'asc' ? 1 : -1;
      var c = cmpVal(rowVal(a, orderBy[i].field), rowVal(b, orderBy[i].field));
      if (c !== 0) return c * dir;
    }
    return 0;
  });
}

function cursorFromRow(row, orderBy) {
  var next = {};
  orderBy.forEach(function (o) {
    next[o.field] = rowVal(row, o.field);
  });
  return encodeCursor(next);
}

function applyMemoryQuery(map, spec) {
  spec = spec && typeof spec === 'object' ? spec : {};
  var where = spec.where || {};
  var range = spec.range || null;
  var lookup = !!spec.lookup;
  var orderBy = lookup ? [] : ensureOrderBy(spec.orderBy);
  if (lookup && (!spec.orderBy || !spec.orderBy.length)) {
    orderBy = [{ field: '_id', direction: 'asc' }];
  } else if (!lookup) {
    orderBy = ensureOrderBy(spec.orderBy);
  }
  var limit = spec.limit === 1 || lookup ? Math.max(1, Number(spec.limit) || 1) : clampLimit(spec.limit);
  var cursor = decodeCursor(spec.cursor);
  var rows = [];
  Object.keys(map || {}).forEach(function (k) {
    var row = map[k];
    if (!row) return;
    if (!matchEq(row, where)) return;
    if (!matchRange(row, range)) return;
    if (!lookup && !afterCursor(row, cursor, orderBy)) return;
    rows.push(row);
  });
  rows = sortRows(rows, orderBy);
  if (lookup) {
    return { list: rows.slice(0, limit), cursor: '', hasMore: false };
  }
  var hasMore = rows.length > limit;
  var list = rows.slice(0, limit);
  return {
    list: list,
    cursor: hasMore && list.length ? cursorFromRow(list[list.length - 1], orderBy) : '',
    hasMore: hasMore
  };
}

function queryAllFrom(queryFn, name, spec) {
  var acc = [];
  var cursor = '';
  var pages = 0;
  function step() {
    pages += 1;
    if (pages > QUERY_ALL_MAX_PAGES) return Promise.resolve(acc);
    var nextSpec = Object.assign({}, spec, { limit: QUERY_ALL_PAGE, cursor: cursor, lookup: false });
    return queryFn(name, nextSpec).then(function (page) {
      var list = (page && page.list) || [];
      acc = acc.concat(list);
      if (!page || !page.hasMore || !page.cursor) return acc;
      cursor = page.cursor;
      return step();
    });
  }
  return step();
}

function buildCondition(command, eq, range, cursor, orderBy) {
  var ands = [];
  var base = {};
  Object.keys(eq || {}).forEach(function (k) {
    if (eq[k] !== undefined) base[k] = eq[k];
  });
  if (Object.keys(base).length) ands.push(base);
  if (range && range.field) {
    if (range.gte != null) {
      var g = {};
      g[range.field] = command.gte(range.gte);
      ands.push(g);
    }
    if (range.gt != null) {
      var gt = {};
      gt[range.field] = command.gt(range.gt);
      ands.push(gt);
    }
    if (range.lt != null) {
      var l = {};
      l[range.field] = command.lt(range.lt);
      ands.push(l);
    }
    if (range.lte != null) {
      var le = {};
      le[range.field] = command.lte(range.lte);
      ands.push(le);
    }
  }
  if (cursor && orderBy && orderBy.length) {
    ands.push(cursorCondition(command, cursor, orderBy));
  }
  if (!ands.length) return null;
  if (ands.length === 1) return ands[0];
  return command.and(ands);
}

function cursorCondition(command, cursor, orderBy) {
  if (orderBy.length === 1) {
    var f = orderBy[0].field;
    var one = {};
    one[f] = orderBy[0].direction === 'asc' ? command.gt(cursor[f]) : command.lt(cursor[f]);
    return one;
  }
  var a = orderBy[0];
  var b = orderBy[1];
  var first = {};
  first[a.field] = a.direction === 'asc' ? command.gt(cursor[a.field]) : command.lt(cursor[a.field]);
  var eqFirst = {};
  eqFirst[a.field] = cursor[a.field];
  var second = {};
  second[b.field] = b.direction === 'asc' ? command.gt(cursor[b.field]) : command.lt(cursor[b.field]);
  return command.or([first, command.and([eqFirst, second])]);
}

function applyCloudQuery(db, collectionRef, spec) {
  if (typeof spec === 'function') {
    return Promise.reject(new Error('cloud query does not accept JS predicates'));
  }
  spec = spec && typeof spec === 'object' ? spec : {};
  var command = db.command;
  var lookup = !!spec.lookup;
  var orderBy = lookup ? [] : ensureOrderBy(spec.orderBy);
  var limit = lookup || Number(spec.limit) === 1 ? Math.max(1, Number(spec.limit) || 1) : clampLimit(spec.limit);
  var cursor = lookup ? null : decodeCursor(spec.cursor);
  var cond = buildCondition(command, spec.where || {}, spec.range, cursor, lookup ? [] : orderBy);
  var ref = collectionRef;
  if (cond != null) ref = ref.where(cond);
  if (!lookup) {
    orderBy.forEach(function (o) {
      ref = ref.orderBy(o.field, o.direction === 'asc' ? 'asc' : 'desc');
    });
  }
  if (spec.fields && spec.fields.length) {
    var fieldMap = { _id: true };
    spec.fields.forEach(function (name) {
      fieldMap[name] = true;
    });
    ref = ref.field(fieldMap);
  }
  var fetch = lookup ? limit : limit + 1;
  return ref.limit(fetch).get().then(function (res) {
    var rows = (res && res.data) || [];
    if (lookup) {
      return { list: rows.slice(0, limit), cursor: '', hasMore: false };
    }
    var hasMore = rows.length > limit;
    var list = hasMore ? rows.slice(0, limit) : rows;
    return {
      list: list,
      cursor: hasMore && list.length ? cursorFromRow(list[list.length - 1], orderBy) : '',
      hasMore: hasMore
    };
  });
}

module.exports = {
  DEFAULT_LIMIT: DEFAULT_LIMIT,
  MAX_LIMIT: MAX_LIMIT,
  QUERY_ALL_PAGE: QUERY_ALL_PAGE,
  clampLimit: clampLimit,
  encodeCursor: encodeCursor,
  decodeCursor: decodeCursor,
  prefixRange: prefixRange,
  ensureOrderBy: ensureOrderBy,
  cursorFromRow: cursorFromRow,
  applyMemoryQuery: applyMemoryQuery,
  applyCloudQuery: applyCloudQuery,
  queryAllFrom: queryAllFrom
};
