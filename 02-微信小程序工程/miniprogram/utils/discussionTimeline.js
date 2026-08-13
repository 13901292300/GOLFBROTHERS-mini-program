/**
 * 讨论区时间节点纯投影（微信群聊式）
 * - 不写存储、不改写输入 messages
 * - 仅产出 UI 行：time 节点 + message 引用行
 */

var GAP_MS = 5 * 60 * 1000;

function pad2(n) {
  var v = Number(n);
  if (!Number.isFinite(v)) v = 0;
  v = Math.floor(v);
  return v < 10 ? '0' + v : String(v);
}

/**
 * @param {object|null|undefined} msg
 * @returns {number|null} ms
 */
function resolveMessageTime(msg) {
  if (!msg || typeof msg !== 'object') return null;
  var raw = msg.createdAt != null ? msg.createdAt : msg.timestamp;
  var n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * @param {number} ts
 * @returns {{ y:number, m:number, d:number, hh:number, mm:number }}
 */
function localParts(ts) {
  var d = new Date(ts);
  return {
    y: d.getFullYear(),
    m: d.getMonth() + 1,
    d: d.getDate(),
    hh: d.getHours(),
    mm: d.getMinutes()
  };
}

function sameCalendarDay(a, b) {
  if (a == null || b == null) return false;
  var pa = localParts(a);
  var pb = localParts(b);
  return pa.y === pb.y && pa.m === pb.m && pa.d === pb.d;
}

/**
 * @param {number|null} prevTs
 * @param {number|null} currTs
 * @param {boolean} isFirst
 * @returns {boolean}
 */
function shouldShowTimeNode(prevTs, currTs, isFirst) {
  if (currTs == null) return false;
  if (isFirst) return true;
  if (prevTs == null) return true;
  if (!sameCalendarDay(prevTs, currTs)) return true;
  return currTs - prevTs > GAP_MS;
}

/**
 * @param {number} ts
 * @param {number|null} prevTs
 * @returns {string}
 */
function formatDiscussionTimeLabel(ts, prevTs) {
  var p = localParts(ts);
  var time = pad2(p.hh) + ':' + pad2(p.mm);
  var crossDay = prevTs == null || !sameCalendarDay(prevTs, ts);
  if (crossDay) {
    return p.y + '年' + p.m + '月' + p.d + '日 ' + time;
  }
  return time;
}

/**
 * 将消息列表投影为 UI 行；不修改输入数组及其元素。
 * @param {Array} messages
 * @returns {Array<{ rowType:string, key:string, label?:string, msgIndex?:number, [k:string]:any }>}
 */
function projectDiscussionTimeline(messages) {
  var list = Array.isArray(messages) ? messages : [];
  var out = [];
  var prevTs = null;
  for (var i = 0; i < list.length; i++) {
    var msg = list[i];
    var ts = resolveMessageTime(msg);
    if (shouldShowTimeNode(prevTs, ts, i === 0)) {
      out.push({
        rowType: 'time',
        key: 't-' + i + '-' + String(ts),
        label: formatDiscussionTimeLabel(ts, prevTs)
      });
    }
    var row = {};
    if (msg && typeof msg === 'object') {
      for (var k in msg) {
        if (Object.prototype.hasOwnProperty.call(msg, k)) row[k] = msg[k];
      }
    }
    row.rowType = 'message';
    row.key = 'm-' + i;
    row.msgIndex = i;
    out.push(row);
    if (ts != null) prevTs = ts;
  }
  return out;
}

module.exports = {
  GAP_MS: GAP_MS,
  resolveMessageTime: resolveMessageTime,
  sameCalendarDay: sameCalendarDay,
  shouldShowTimeNode: shouldShowTimeNode,
  formatDiscussionTimeLabel: formatDiscussionTimeLabel,
  projectDiscussionTimeline: projectDiscussionTimeline
};
