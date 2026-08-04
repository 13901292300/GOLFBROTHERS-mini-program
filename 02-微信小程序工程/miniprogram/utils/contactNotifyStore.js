/**
 * 通讯录相关通知（事件驱动红点）
 *
 * notifications: { id, type, target, status, userId? }
 * - type: newFollower | …（其他模块可扩展，互不覆盖）
 * - target: 事件落点路径，如 profile.contacts.followers
 * - status: unread | read
 *
 * 路径红点：存在未读事件且 event.target === path 或为 path 的子路径时显示。
 */
const STORAGE_KEY = 'gb_contact_notifications_v1';

const TARGET = {
  PROFILE: 'profile',
  CONTACTS: 'profile.contacts',
  FOLLOWERS: 'profile.contacts.followers'
};

const TYPE = {
  NEW_FOLLOWER: 'newFollower'
};

let ready = false;
/** @type {Array<{id:string,type:string,target:string,status:string,userId?:string}>} */
let notifications = [];

function persist() {
  try {
    wx.setStorageSync(STORAGE_KEY, {
      notifications: notifications
    });
  } catch (e) {
    /* ignore */
  }
}

function seedMockNewFollowerEvents() {
  const samples = [
    { userId: 'nf-5001', id: 'evt-newFollower-nf-5001' },
    { userId: 'nf-5002', id: 'evt-newFollower-nf-5002' }
  ];
  samples.forEach((s) => {
    if (notifications.some((n) => n.id === s.id)) return;
    notifications.push({
      id: s.id,
      type: TYPE.NEW_FOLLOWER,
      target: TARGET.FOLLOWERS,
      status: 'unread',
      userId: s.userId
    });
  });
}

function ensureReady() {
  if (ready) return;
  ready = true;
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (raw && Array.isArray(raw.notifications)) {
      notifications = raw.notifications.slice();
    } else if (raw === '' || raw === undefined || raw === null) {
      notifications = [];
      // 兼容旧布尔红点：已清除则不再注入 mock
      let legacyCleared = false;
      try {
        const legacy = wx.getStorageSync('gb_new_follower_badge_v1');
        legacyCleared = legacy === 0 || legacy === '0' || legacy === false;
      } catch (e2) {
        legacyCleared = false;
      }
      if (!legacyCleared) seedMockNewFollowerEvents();
      persist();
    } else {
      notifications = [];
    }
  } catch (e) {
    notifications = [];
    seedMockNewFollowerEvents();
  }
}

function getNotifications() {
  ensureReady();
  return notifications.slice();
}

function hasUnreadForPath(path) {
  ensureReady();
  const p = String(path || '');
  if (!p) return false;
  return notifications.some((n) => {
    if (!n || n.status !== 'unread') return false;
    const t = String(n.target || '');
    return t === p || t.indexOf(p + '.') === 0;
  });
}

function hasUnreadByType(type) {
  ensureReady();
  const t = String(type || '');
  return notifications.some((n) => n && n.status === 'unread' && n.type === t);
}

function getUnreadUserIdsByType(type) {
  ensureReady();
  const t = String(type || '');
  const ids = [];
  const seen = {};
  notifications.forEach((n) => {
    if (!n || n.status !== 'unread' || n.type !== t) return;
    const uid = String(n.userId || '');
    if (!uid || seen[uid]) return;
    seen[uid] = true;
    ids.push(uid);
  });
  return ids;
}

/** 将某 type 的未读全部标为已读（不影响其他 type） */
function markReadByType(type) {
  ensureReady();
  const t = String(type || '');
  let changed = false;
  notifications = notifications.map((n) => {
    if (n && n.type === t && n.status === 'unread') {
      changed = true;
      return Object.assign({}, n, { status: 'read' });
    }
    return n;
  });
  if (changed) persist();
  return changed;
}

/** 将某 userId + type 的未读标为已读 */
function markReadByTypeAndUser(type, userId) {
  ensureReady();
  const t = String(type || '');
  const uid = String(userId || '');
  let changed = false;
  notifications = notifications.map((n) => {
    if (n && n.type === t && String(n.userId || '') === uid && n.status === 'unread') {
      changed = true;
      return Object.assign({}, n, { status: 'read' });
    }
    return n;
  });
  if (changed) persist();
  return changed;
}

function addNotification(evt) {
  ensureReady();
  const item = {
    id: String((evt && evt.id) || 'evt-' + Date.now()),
    type: String((evt && evt.type) || ''),
    target: String((evt && evt.target) || TARGET.FOLLOWERS),
    status: (evt && evt.status) === 'read' ? 'read' : 'unread',
    userId: evt && evt.userId != null ? String(evt.userId) : ''
  };
  if (!item.type) return null;
  const idx = notifications.findIndex((n) => n.id === item.id);
  if (idx >= 0) notifications[idx] = item;
  else notifications.push(item);
  persist();
  return item;
}

module.exports = {
  TARGET,
  TYPE,
  getNotifications,
  hasUnreadForPath,
  hasUnreadByType,
  getUnreadUserIdsByType,
  markReadByType,
  markReadByTypeAndUser,
  addNotification
};
