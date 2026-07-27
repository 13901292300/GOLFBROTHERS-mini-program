/**
 * scheduleStore — 首页日程 V1 数据层
 *
 * 高尔夫活动事件的本地持久化（非个人待办）。
 * V1：仅手工日程（type=manual）；支持创建 / 查询 / 修改 / 删除 / 添加提醒好友。
 * 不做：接受拒绝、微信通知、gameStore / teamMatchStore 同步。
 *
 * Storage key: gb_schedule_v1
 */

const STORAGE_KEY = 'gb_schedule_v1';

function createScheduleId() {
  return (
    'sch_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 8)
  );
}

/** @returns {Array} */
function getSchedules() {
  try {
    const list = wx.getStorageSync(STORAGE_KEY);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

/** @param {Array} list */
function saveSchedules(list) {
  const next = Array.isArray(list) ? list : [];
  try {
    wx.setStorageSync(STORAGE_KEY, next);
  } catch (e) {
    /* ignore */
  }
  return next;
}

/**
 * 规范化提醒成员；按 userId 去重，保留先出现的项。
 * @param {Array} members
 * @returns {Array<{ userId: string, name: string, avatar: string }>}
 */
function normalizeMembers(members) {
  if (!Array.isArray(members)) return [];
  const seen = {};
  const out = [];
  for (let i = 0; i < members.length; i++) {
    const raw = members[i];
    if (!raw || typeof raw !== 'object') continue;
    const userId = String(raw.userId != null ? raw.userId : '').trim();
    if (!userId || seen[userId]) continue;
    seen[userId] = true;
    out.push({
      userId: userId,
      name: String(raw.name != null ? raw.name : ''),
      avatar: String(raw.avatar != null ? raw.avatar : '')
    });
  }
  return out;
}

/**
 * 创建手工日程
 * @param {{ date?: string, content?: string, members?: Array, ownerId?: string, sourceType?: string, sourceUserId?: string }} data
 * @returns {object}
 */
function createSchedule(data) {
  const payload = data && typeof data === 'object' ? data : {};
  const now = Date.now();
  const item = {
    id: createScheduleId(),
    type: 'manual',
    date: String(payload.date != null ? payload.date : ''),
    content: String(payload.content != null ? payload.content : ''),
    members: normalizeMembers(payload.members),
    createdAt: now,
    updatedAt: now
  };
  if (payload.ownerId != null && String(payload.ownerId).trim() !== '') {
    item.ownerId = String(payload.ownerId).trim();
  }
  if (payload.sourceType != null && String(payload.sourceType).trim() !== '') {
    item.sourceType = String(payload.sourceType).trim();
  }
  if (payload.sourceId != null && String(payload.sourceId).trim() !== '') {
    item.sourceId = String(payload.sourceId).trim();
  }
  if (payload.sourceUserId != null && String(payload.sourceUserId).trim() !== '') {
    item.sourceUserId = String(payload.sourceUserId).trim();
  }
  const list = getSchedules();
  list.unshift(item);
  saveSchedules(list);
  return item;
}

/**
 * 修改日程（仅 date / content / members）
 * @param {string} id
 * @param {{ date?: string, content?: string, members?: Array }} patch
 * @returns {object|null}
 */
function updateSchedule(id, patch) {
  const targetId = String(id != null ? id : '');
  if (!targetId) return null;
  const list = getSchedules();
  const idx = list.findIndex(function (item) {
    return item && String(item.id) === targetId;
  });
  if (idx < 0) return null;

  const prev = list[idx];
  const p = patch && typeof patch === 'object' ? patch : {};
  const next = Object.assign({}, prev, {
    type: 'manual',
    updatedAt: Date.now()
  });
  if (Object.prototype.hasOwnProperty.call(p, 'date')) {
    next.date = String(p.date != null ? p.date : '');
  }
  if (Object.prototype.hasOwnProperty.call(p, 'content')) {
    next.content = String(p.content != null ? p.content : '');
  }
  if (Object.prototype.hasOwnProperty.call(p, 'members')) {
    next.members = normalizeMembers(p.members);
  }

  list[idx] = next;
  saveSchedules(list);
  return next;
}

/**
 * @param {string} id
 * @returns {object|null}
 */
function getScheduleById(id) {
  const targetId = String(id != null ? id : '');
  if (!targetId) return null;
  const list = getSchedules();
  for (let i = 0; i < list.length; i++) {
    if (list[i] && String(list[i].id) === targetId) return list[i];
  }
  return null;
}

/**
 * 按来源定位日程（球队赛同步去重用）
 * @param {string} sourceType
 * @param {string} sourceId
 * @param {string} ownerId
 * @returns {Array}
 */
function findSchedulesBySource(sourceType, sourceId, ownerId) {
  const st = String(sourceType != null ? sourceType : '').trim();
  const sid = String(sourceId != null ? sourceId : '').trim();
  const oid = String(ownerId != null ? ownerId : '').trim();
  if (!st || !sid || !oid) return [];
  return getSchedules().filter(function (item) {
    if (!item) return false;
    return (
      String(item.sourceType || '') === st &&
      String(item.sourceId || '') === sid &&
      String(item.ownerId || '') === oid
    );
  });
}

/**
 * 按来源删除日程
 * - 传 ownerId：只删该用户该赛事（取消报名）
 * - 不传 ownerId：删该赛事下全部 team_match 日程（取消整场）
 * @param {string} sourceType
 * @param {string} sourceId
 * @param {string} [ownerId]
 * @returns {number} 删除条数
 */
function deleteSchedulesBySource(sourceType, sourceId, ownerId) {
  const st = String(sourceType != null ? sourceType : '').trim();
  const sid = String(sourceId != null ? sourceId : '').trim();
  const oid =
    ownerId != null && String(ownerId).trim() !== ''
      ? String(ownerId).trim()
      : '';
  if (!st || !sid) return 0;
  const list = getSchedules();
  const next = [];
  let removed = 0;
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const matchSource =
      item &&
      String(item.sourceType || '') === st &&
      String(item.sourceId || '') === sid;
    const matchOwner = !oid || (item && String(item.ownerId || '') === oid);
    if (matchSource && matchOwner) {
      removed += 1;
      continue;
    }
    next.push(item);
  }
  if (removed) saveSchedules(next);
  return removed;
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function deleteSchedule(id) {
  const targetId = String(id != null ? id : '');
  if (!targetId) return false;
  const list = getSchedules();
  const next = list.filter(function (item) {
    return !(item && String(item.id) === targetId);
  });
  if (next.length === list.length) return false;
  saveSchedules(next);
  return true;
}

/**
 * @param {string} date YYYY-MM-DD
 * @returns {Array}
 */
function getSchedulesByDate(date) {
  const key = String(date != null ? date : '');
  if (!key) return [];
  return getSchedules().filter(function (item) {
    return item && String(item.date) === key;
  });
}

/**
 * 向已有日程追加提醒好友（userId 去重）
 * @param {string} id
 * @param {Array} members
 * @returns {object|null}
 */
function addMembers(id, members) {
  const targetId = String(id != null ? id : '');
  if (!targetId) return null;
  const list = getSchedules();
  const idx = list.findIndex(function (item) {
    return item && String(item.id) === targetId;
  });
  if (idx < 0) return null;

  const prev = list[idx];
  const merged = normalizeMembers(
    (Array.isArray(prev.members) ? prev.members : []).concat(
      Array.isArray(members) ? members : []
    )
  );
  const next = Object.assign({}, prev, {
    type: 'manual',
    members: merged,
    updatedAt: Date.now()
  });
  list[idx] = next;
  saveSchedules(list);
  return next;
}

module.exports = {
  STORAGE_KEY,
  getSchedules,
  saveSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getScheduleById,
  findSchedulesBySource,
  deleteSchedulesBySource,
  getSchedulesByDate,
  addMembers
};
