/**
 * @deprecated 兼容旧引用；请使用 contactNotifyStore（事件驱动）
 */
const contactNotifyStore = require('./contactNotifyStore.js');

function hasNewFollowerBadge() {
  return contactNotifyStore.hasUnreadByType(contactNotifyStore.TYPE.NEW_FOLLOWER);
}

/** 不再支持布尔开关；true 无效，false 等价于清除 newFollower 未读 */
function setNewFollowerBadge(on) {
  if (!on) {
    contactNotifyStore.markReadByType(contactNotifyStore.TYPE.NEW_FOLLOWER);
  }
}

module.exports = {
  hasNewFollowerBadge,
  setNewFollowerBadge
};
