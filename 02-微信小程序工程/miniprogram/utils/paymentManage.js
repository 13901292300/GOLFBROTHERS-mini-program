/**
 * 极简版收费管理：本场实收登记。
 * 只维护 paymentConfirmed / paidAmount / cashPaidAmount / paymentRemark。
 */

const mockAvatars = require('./mockAvatars.js');
const playerManage = require('./playerManage.js');

const FILTER_ALL = 'all';
const FILTER_PAID = 'paid';
const FILTER_UNPAID = 'unpaid';

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value == null ? null : value));
  } catch (e) {
    return value;
  }
}

function toAmount(raw) {
  if (raw === '' || raw === null || raw === undefined) return 0;
  const n = Number(String(raw).replace(/[¥￥,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function formatAmount(raw) {
  const n = toAmount(raw);
  if (Math.round(n) === n) return String(n);
  return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function normalizePaymentFilter(value) {
  const v = String(value || '').trim();
  if (v === FILTER_PAID) return FILTER_PAID;
  if (v === FILTER_UNPAID) return FILTER_UNPAID;
  return FILTER_ALL;
}

function resolveStableUserId(user, fallback) {
  const raw = user && typeof user === 'object' ? user : {};
  const id =
    raw.stableUserId ||
    raw.userId ||
    raw.id ||
    raw.playerId ||
    raw.uid ||
    raw.openid ||
    raw.phone ||
    raw.mobile ||
    raw.phoneNumber ||
    raw.contactPhone ||
    fallback;
  return id != null ? String(id).trim() : '';
}

function resolveDisplayName(user) {
  return playerManage.resolveMatchNickname(user) || '未知用户';
}

function hasPaidAmountValue(user) {
  if (!user || typeof user !== 'object') return false;
  const value = user.paidAmount != null ? user.paidAmount : user.cashPaidAmount;
  return value !== '' && value !== null && value !== undefined;
}

function resolvePaidAmount(user) {
  if (!user || typeof user !== 'object') return 0;
  if (user.paidAmount !== '' && user.paidAmount !== null && user.paidAmount !== undefined) {
    return toAmount(user.paidAmount);
  }
  return toAmount(user.cashPaidAmount);
}

function isUserPaymentConfirmed(user) {
  return !!(user && user.paymentConfirmed === true);
}

function buildDisplayUser(rawUser, index) {
  const user = cloneJson(rawUser) || {};
  const stableUserId = resolveStableUserId(user, 'payment-user-' + (index + 1));
  const confirmed = isUserPaymentConfirmed(user);
  const hasAmount = hasPaidAmountValue(user);
  const amount = hasAmount ? resolvePaidAmount(user) : '';
  const amountText = hasAmount ? formatAmount(amount) : '';
  const genderDisplay = playerManage.getGenderDisplay(user);
  return Object.assign({}, user, {
    stableUserId: stableUserId,
    displayName: resolveDisplayName(user),
    displayAvatar: mockAvatars.resolveAvatar(user.avatar || user.avatarUrl || '', stableUserId),
    genderIcon: genderDisplay.icon,
    genderClass: genderDisplay.className,
    paymentConfirmed: confirmed,
    paidAmount: amount,
    cashPaidAmount: amount,
    paidAmountInput: hasAmount ? amountText : '',
    paidAmountText: confirmed && hasAmount ? '¥' + formatAmount(amount) : '',
    paymentStatusText: confirmed ? '已收' : '未收',
    paymentStatusLine: confirmed ? (hasAmount ? '已收 · ¥' + formatAmount(amount) : '已收') : '未收',
    paymentRemark: user.paymentRemark != null ? String(user.paymentRemark) : '',
    searchText: [
      user.matchNickname,
      user.competitionName,
      user.nickname,
      user.name,
      user.phone,
      user.mobile,
      user.phoneNumber,
      user.contactPhone,
      stableUserId
    ].map((v) => String(v || '').toLowerCase()).join(' ')
  });
}

function normalizePaymentUserForDisplay(user) {
  return buildDisplayUser(user || {}, 0);
}

function buildPaymentDraftUsers(match) {
  const users =
    match && match.registerInfo && Array.isArray(match.registerInfo.users)
      ? match.registerInfo.users
      : [];
  return users.map(buildDisplayUser);
}

function calculatePaymentSummary(users) {
  const list = Array.isArray(users) ? users : [];
  const sum = list.reduce((acc, user) => {
    if (isUserPaymentConfirmed(user)) {
      acc.totalPaid += resolvePaidAmount(user);
      acc.paidCount += 1;
    } else {
      acc.unpaidCount += 1;
    }
    return acc;
  }, { totalPaid: 0, paidCount: 0, unpaidCount: 0 });
  return {
    totalPaid: sum.totalPaid,
    totalPaidText: formatAmount(sum.totalPaid),
    paidCount: sum.paidCount,
    unpaidCount: sum.unpaidCount
  };
}

function filterPaymentUsers(users, options) {
  const opts = options || {};
  const filter = normalizePaymentFilter(opts.filter || opts.statusFilter);
  const keyword = String(opts.keyword || '').trim().toLowerCase();
  return (Array.isArray(users) ? users : []).filter((user) => {
    if (filter === FILTER_PAID && !isUserPaymentConfirmed(user)) return false;
    if (filter === FILTER_UNPAID && isUserPaymentConfirmed(user)) return false;
    if (keyword && String(user.searchText || '').indexOf(keyword) < 0) return false;
    return true;
  });
}

function patchDraftUser(users, stableUserId, patch) {
  const id = String(stableUserId || '');
  return (Array.isArray(users) ? users : []).map((user) => {
    if (String(user && user.stableUserId) !== id) return user;
    const next = Object.assign({}, user, patch || {});
    next.paidAmount = hasPaidAmountValue(next) ? resolvePaidAmount(next) : '';
    next.cashPaidAmount = next.paidAmount;
    next.paidAmountInput = hasPaidAmountValue(next) ? formatAmount(next.paidAmount) : '';
    next.paidAmountText = isUserPaymentConfirmed(next) && hasPaidAmountValue(next) ? '¥' + formatAmount(next.paidAmount) : '';
    next.paymentStatusText = isUserPaymentConfirmed(next) ? '已收' : '未收';
    next.paymentStatusLine = isUserPaymentConfirmed(next)
      ? (hasPaidAmountValue(next) ? '已收 · ¥' + formatAmount(next.paidAmount) : '已收')
      : '未收';
    return next;
  });
}

function setPaymentConfirmed(users, stableUserId, confirmed) {
  const id = String(stableUserId || '');
  return (Array.isArray(users) ? users : []).map((user) => {
    if (String(user && user.stableUserId) !== id) return user;
    const next = Object.assign({}, user, { paymentConfirmed: !!confirmed });
    if (confirmed) {
      if (!hasPaidAmountValue(next)) {
        next.paidAmount = '';
        next.cashPaidAmount = '';
        next.paidAmountInput = '';
      }
    } else {
      next.paidAmount = '';
      next.cashPaidAmount = '';
      next.paidAmountInput = '';
    }
    next.paidAmountText = next.paymentConfirmed && hasPaidAmountValue(next) ? '¥' + formatAmount(next.paidAmount) : '';
    next.paymentStatusText = next.paymentConfirmed ? '已收' : '未收';
    next.paymentStatusLine = next.paymentConfirmed
      ? (hasPaidAmountValue(next) ? '已收 · ¥' + formatAmount(next.paidAmount) : '已收')
      : '未收';
    return next;
  });
}

function updatePaidAmount(users, stableUserId, amount) {
  const empty = amount === '' || amount === null || amount === undefined;
  const paidAmount = empty ? '' : toAmount(amount);
  return patchDraftUser(users, stableUserId, {
    paymentConfirmed: true,
    paidAmount: paidAmount,
    cashPaidAmount: paidAmount,
    paidAmountInput: empty ? '' : formatAmount(paidAmount)
  });
}

function updatePaymentRemark(users, stableUserId, remark) {
  return patchDraftUser(users, stableUserId, {
    paymentRemark: String(remark || '')
  });
}

function snapshotPaymentFields(user) {
  const confirmed = isUserPaymentConfirmed(user);
  const amount = confirmed ? resolvePaidAmount(user) : '';
  return {
    paymentConfirmed: confirmed,
    paidAmount: amount,
    cashPaidAmount: amount,
    paymentRemark: user && user.paymentRemark != null ? String(user.paymentRemark) : ''
  };
}

function paymentFieldChanged(a, b, key) {
  const av = a ? a[key] : undefined;
  const bv = b ? b[key] : undefined;
  return String(av == null ? '' : av) !== String(bv == null ? '' : bv);
}

function buildDiffText(targetName, before, after) {
  const name = targetName || '该用户';
  const parts = [];
  if (paymentFieldChanged(before, after, 'paymentConfirmed')) {
    parts.push((before.paymentConfirmed ? '已收' : '未收') + ' → ' + (after.paymentConfirmed ? '已收' : '未收'));
  }
  if (paymentFieldChanged(before, after, 'paidAmount')) {
    const beforeText = before.paidAmount === '' ? '未登记' : '¥' + formatAmount(before.paidAmount);
    const afterText = after.paidAmount === '' ? '未登记' : '¥' + formatAmount(after.paidAmount);
    parts.push('实收 ' + beforeText + ' → ' + afterText);
  }
  if (paymentFieldChanged(before, after, 'paymentRemark')) {
    parts.push(after.paymentRemark ? '备注已更新' : '备注已清空');
  }
  return name + '：' + (parts.length ? parts.join('，') : '收费信息已更新');
}

function createPaymentLog(options) {
  const opts = options || {};
  const target = opts.targetUser || {};
  const operator = opts.operator || {};
  const now = Date.now();
  return {
    id: 'paylog_' + now + '_' + Math.random().toString(36).slice(2, 8),
    action: String(opts.action || 'payment_updated'),
    operatorId: String(operator.operatorId || operator.userId || ''),
    operatorName: String(operator.operatorName || operator.name || operator.nickname || '管理员'),
    targetUserId: resolveStableUserId(target),
    targetUserName: resolveDisplayName(target),
    before: cloneJson(opts.before || {}),
    after: cloneJson(opts.after || {}),
    diffText: String(opts.diffText || ''),
    createdAt: now
  };
}

function buildPaymentDiffLogs(options) {
  const opts = options || {};
  const beforeUsers = Array.isArray(opts.beforeUsers) ? opts.beforeUsers : [];
  const afterUsers = Array.isArray(opts.afterUsers) ? opts.afterUsers : [];
  const beforeMap = {};
  beforeUsers.forEach((user, index) => {
    const id = resolveStableUserId(user, 'payment-user-' + (index + 1));
    if (id) beforeMap[id] = user;
  });
  const logs = [];
  afterUsers.forEach((afterUser) => {
    const id = String(afterUser && afterUser.stableUserId || '');
    if (!id) return;
    const beforeUser = beforeMap[id] || {};
    const before = snapshotPaymentFields(beforeUser);
    const after = snapshotPaymentFields(afterUser);
    const changed =
      paymentFieldChanged(before, after, 'paymentConfirmed') ||
      paymentFieldChanged(before, after, 'paidAmount') ||
      paymentFieldChanged(before, after, 'paymentRemark');
    if (!changed) return;
    const targetUser = Object.assign({}, beforeUser, afterUser);
    logs.push(createPaymentLog({
      action: 'payment_updated',
      operator: opts.operator,
      targetUser: targetUser,
      before: before,
      after: after,
      diffText: buildDiffText(resolveDisplayName(targetUser), before, after)
    }));
  });
  return logs;
}

function appendPaymentLogs(match, logs) {
  if (!match || typeof match !== 'object') return [];
  const list = Array.isArray(logs) ? logs.filter(Boolean) : (logs ? [logs] : []);
  if (!list.length) return Array.isArray(match.paymentLogs) ? match.paymentLogs : [];
  const existing = Array.isArray(match.paymentLogs) ? match.paymentLogs : [];
  match.paymentLogs = existing.concat(list);
  return match.paymentLogs;
}

function applyPaymentDraftToMatch(match, draftUsers) {
  if (!match || typeof match !== 'object') return { ok: false };
  if (!match.registerInfo || typeof match.registerInfo !== 'object') {
    match.registerInfo = { totalCount: 0, users: [] };
  }
  const source = Array.isArray(match.registerInfo.users) ? match.registerInfo.users : [];
  const draftMap = {};
  (Array.isArray(draftUsers) ? draftUsers : []).forEach((user) => {
    if (user && user.stableUserId) draftMap[String(user.stableUserId)] = user;
  });
  match.registerInfo.users = source.map((raw, index) => {
    const id = resolveStableUserId(raw, 'payment-user-' + (index + 1));
    const draft = draftMap[id];
    if (!draft) return raw;
    const next = Object.assign({}, raw);
    next.paymentConfirmed = draft.paymentConfirmed === true;
    next.paidAmount = next.paymentConfirmed ? toAmount(draft.paidAmount) : '';
    next.cashPaidAmount = next.paidAmount;
    next.paymentRemark = draft.paymentRemark || '';
    return next;
  });
  match.registerInfo.totalCount = match.registerInfo.users.length;
  return { ok: true, target: match };
}

function canManagePayment(match, userId, isPrivileged) {
  if (isPrivileged) return true;
  const uid = String(userId || '').trim();
  if (!uid || !match) return false;
  const creatorId = String(match.createdBy || match.creatorId || '').trim();
  if (creatorId && creatorId === uid) return true;
  const tempAdminPermission = require('./tempAdminPermission.js');
  return tempAdminPermission.hasTempAdminPermission(match, uid, 'manage_payment');
}

module.exports = {
  FILTER_ALL,
  FILTER_PAID,
  FILTER_UNPAID,
  buildPaymentDraftUsers,
  normalizePaymentUserForDisplay,
  calculatePaymentSummary,
  filterPaymentUsers,
  normalizePaymentFilter,
  setPaymentConfirmed,
  updatePaidAmount,
  updatePaymentRemark,
  applyPaymentDraftToMatch,
  buildPaymentDiffLogs,
  createPaymentLog,
  appendPaymentLogs,
  canManagePayment,
  isUserPaymentConfirmed,
  resolveStableUserId,
  toAmount,
  formatAmount
};
