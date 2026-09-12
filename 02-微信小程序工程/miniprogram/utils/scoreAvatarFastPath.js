/**
 * 记分页本人头像 Fast Path：同 playerId + 相同 avatar src 时复用上一帧行对象，
 * 避免 onShow 整表 refresh 把 <image> 重挂并再次走 cloud:// native load。
 * 不下载、不改 src 优先级。
 */

function avatarRowKey(row) {
  const p = row && typeof row === 'object' ? row : {};
  return String(p.playerId || p.id || '') + '\0' + String(p.displayAvatar || '');
}

function reuseUnchangedAvatarRows(prevList, nextList) {
  if (!Array.isArray(prevList) || !Array.isArray(nextList)) return nextList;
  if (prevList.length !== nextList.length || !nextList.length) return nextList;
  const out = [];
  for (let i = 0; i < nextList.length; i++) {
    const prev = prevList[i];
    const next = nextList[i];
    if (!prev || !next) return nextList;
    if (avatarRowKey(prev) !== avatarRowKey(next)) return nextList;
    Object.assign(prev, next);
    prev.displayAvatar = next.displayAvatar;
    prev.avatar = next.avatar;
    out.push(prev);
  }
  return out;
}

module.exports = {
  avatarRowKey,
  reuseUnchangedAvatarRows
};
