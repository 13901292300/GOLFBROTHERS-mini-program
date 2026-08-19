/**
 * 全局「槽位式球员管理」模型（所有记分页面统一使用）
 *
 * 设计原则：
 *  - 槽位顺序固定、slotId 即 UI 固定位置；删除只置空、添加只补位，禁止 splice/shift/sort/push 改变顺序。
 *  - 删除 = slot 释放为「可恢复空位」，可经 手动/好友/扫码 三种方式重新绑定 playerId。
 *  - 本模型只管理「人在哪个位置」，不参与 score / diff / putts / 领先榜计算。
 *  - 领先榜等需要球员列表的模块，必须先 flatten（剔除空位）后再使用。
 *
 * 槽位结构：
 *   { slotId, player|null, playerId|null, status: 'occupied'|'empty'|'pending', source: 'manual'|'friend'|'qr'|null }
 */

const DEFAULT_SLOT_SIZE = 4;

// 由球员对象生成单个槽位（player 为 null → 空位）
function _slot(slotId, player) {
  if (!player) {
    return { slotId, player: null, playerId: null, status: 'empty', source: null };
  }
  return {
    slotId,
    player: player,
    playerId: player.playerId || null,
    status: 'occupied',
    source: player.source || 'manual'
  };
}

// 浅拷贝槽位（保持 slotId 顺序与全部字段，不直接 mutate 入参）
function _clone(slots) {
  return (slots || []).map((s) => ({
    slotId: s.slotId,
    player: s.player,
    playerId: s.playerId,
    status: s.status,
    source: s.source
  }));
}

// 由球员数组生成固定长度槽位（不足补空位，顺序即槽位）
function toSlots(players, size) {
  const n = size || DEFAULT_SLOT_SIZE;
  const list = players || [];
  const slots = [];
  for (let i = 0; i < n; i++) {
    slots.push(_slot(i + 1, list[i] || null));
  }
  return slots;
}

// 第一个空槽位索引（occupied/pending 都视为占用）
function firstEmptyIndex(slots) {
  return (slots || []).findIndex((s) => s && s.status === 'empty');
}

function isFull(slots) {
  return firstEmptyIndex(slots) === -1;
}

// 删除：把指定槽位释放为可恢复空位（status=empty），槽位与顺序不变
function removeAt(slots, slotIndex) {
  const next = _clone(slots);
  if (next[slotIndex]) {
    next[slotIndex] = _slot(next[slotIndex].slotId, null);
  }
  return next;
}

// 绑定到「指定」槽位（好友/扫码补位回原 slot）
function bindToSlot(slots, slotIndex, player, source) {
  const next = _clone(slots);
  if (!next[slotIndex]) return { ok: false, reason: 'no-slot', slots: next, index: -1 };
  const p = Object.assign({}, player, { source: source || (player && player.source) || 'manual' });
  next[slotIndex] = _slot(next[slotIndex].slotId, p);
  return { ok: true, slots: next, index: slotIndex };
}

// 添加：补「第一个」空槽位；已满返回 ok:false
function addPlayer(slots, player, source) {
  const idx = firstEmptyIndex(slots);
  if (idx === -1) return { ok: false, reason: 'full', slots: _clone(slots), index: -1 };
  return bindToSlot(slots, idx, player, source);
}

// 标记某槽位为「待扫码加入」（pending），占位但不计入真实球员
function setPending(slots, slotIndex, pending) {
  const next = _clone(slots);
  if (next[slotIndex] && next[slotIndex].status !== 'occupied') {
    next[slotIndex].status = pending ? 'pending' : 'empty';
  }
  return next;
}

// flatten：仅保留 occupied 的真实球员（供记分/领先榜/出发表消费）
function flatten(slots) {
  return (slots || [])
    .filter((s) => s && s.status === 'occupied' && s.player)
    .map((s) => s.player);
}

function count(slots) {
  return flatten(slots).length;
}

module.exports = {
  DEFAULT_SLOT_SIZE,
  toSlots,
  firstEmptyIndex,
  isFull,
  removeAt,
  bindToSlot,
  addPlayer,
  setPending,
  flatten,
  count
};
