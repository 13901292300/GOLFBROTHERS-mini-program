/**
 * 系列赛领域 ID 生成（无碰撞）
 * - 不得依赖裸 Date.now()
 * - 含同毫秒序列 + 随机段
 * - 本模块不读写 storage，不依赖 wx
 */

var _seq = 0;
var _lastMs = 0;

function _randomBase36(len) {
  var n = Math.max(1, len | 0);
  var out = '';
  while (out.length < n) {
    out += Math.floor(Math.random() * 36).toString(36);
  }
  return out.slice(0, n);
}

/**
 * @param {string} prefix
 * @returns {string}
 */
function generateScopedId(prefix) {
  var p = prefix != null && String(prefix).trim() !== '' ? String(prefix).trim() : 'id';
  var ms = Date.now();
  if (ms === _lastMs) {
    _seq += 1;
  } else {
    _lastMs = ms;
    _seq = 0;
  }
  return p + '-' + ms.toString(36) + '-' + _seq.toString(36) + '-' + _randomBase36(6);
}

function generateSeriesId() {
  return generateScopedId('series');
}

function generateRoundId() {
  return generateScopedId('sround');
}

function generatePublishToken() {
  return generateScopedId('pub');
}

function generateEntryId() {
  return generateScopedId('sre');
}

/** roster 条目 ID（复用 sre 前缀生成器） */
function generateRosterEntryId() {
  return generateEntryId();
}

function generateSeriesParticipantId(kind, sourceId) {
  var k = kind === 'division' ? 'division' : 'team';
  var sid = sourceId != null ? String(sourceId).trim() : '';
  if (sid) return k + ':' + sid;
  return generateScopedId(k);
}

/**
 * 预分配唯一 matchId（本批不写分站；existsFn 由调用方注入）
 * @param {number} count
 * @param {{ existsFn?: (id: string) => boolean }} [options]
 * @returns {string[]}
 */
function allocateUniqueMatchIds(count, options) {
  var n = Math.max(0, Math.floor(Number(count) || 0));
  var existsFn =
    options && typeof options.existsFn === 'function'
      ? options.existsFn
      : function () {
          return false;
        };
  var out = [];
  var guard = 0;
  while (out.length < n && guard < n * 50 + 100) {
    guard += 1;
    var id = generateScopedId('team-match');
    if (existsFn(id)) continue;
    var dup = false;
    for (var i = 0; i < out.length; i++) {
      if (out[i] === id) {
        dup = true;
        break;
      }
    }
    if (dup) continue;
    out.push(id);
  }
  if (out.length < n) {
    throw new Error('allocateUniqueMatchIds_failed');
  }
  return out;
}

module.exports = {
  generateScopedId: generateScopedId,
  generateSeriesId: generateSeriesId,
  generateRoundId: generateRoundId,
  generatePublishToken: generatePublishToken,
  generateEntryId: generateEntryId,
  generateRosterEntryId: generateRosterEntryId,
  generateSeriesParticipantId: generateSeriesParticipantId,
  allocateUniqueMatchIds: allocateUniqueMatchIds
};
