/**
 * Series M 统一面板投影（纯函数）
 * - 普通功能：替他人报名 / 邀请（common，不要求 Series 管理身份）
 * - Series 管理：报名开关 / 取消（管理权限）
 * - 选择轮次：普通用户与管理员均可
 * - 本轮普通功能：领先榜 / 统计数据（查看权限，不要求管理员）
 * - 本轮管理：仅管理员；并从中移除领先榜/统计数据以免重复
 */

var teamMatchMoreMenu = require('../../../../utils/teamMatchMoreMenu.js');
var seriesManageRoundPicker = require('./seriesManageRoundPicker.js');
var seriesManageAccess = require('../../../../utils/seriesManageAccess.js');
var matchManageAccess = require('../../../../utils/matchManageAccess.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

/** Series 区权限键 */
var SERIES_SCOPE_PERMISSIONS = {
  register_for_other: true,
  invite_friends_register: true,
  edit_series: true,
  toggle_registration: true,
  cancel_series: true
};

var SERIES_COMMON_PERMISSIONS = {
  register_for_other: true,
  invite_friends_register: true
};

var SERIES_MANAGE_PERMISSIONS = {
  edit_series: true,
  toggle_registration: true,
  cancel_series: true
};

/** 选轮后「本轮普通功能」：仅查看类，不要求管理员 */
var ROUND_VIEW_FEATURE_DEFS = [
  { permission: 'leaderboard', glyph: '▦', label: '领先榜' },
  { permission: 'stats', glyph: '📈', label: '统计数据' }
];

var ROUND_VIEW_PERMISSION_SET = {
  leaderboard: true,
  stats: true
};

/**
 * @param {object} input
 * @param {object} input.series
 * @param {object} input.user
 * @param {boolean} [input.canManageSeries]
 * @param {boolean} [input.canRegisterForOther]
 */
function buildSeriesScopeFeatures(input) {
  var src = input && typeof input === 'object' ? input : {};
  var series = src.series && typeof src.series === 'object' ? src.series : null;
  var user = src.user || {};
  var canManage =
    typeof src.canManageSeries === 'boolean'
      ? src.canManageSeries
      : !!(series && seriesManageAccess.isSeriesHostPrivileged(series, user));
  var canProxy =
    typeof src.canRegisterForOther === 'boolean'
      ? src.canRegisterForOther
      : !!(
          series &&
          matchManageAccess.isCommonViewPermission('register_for_other') &&
          matchManageAccess.resolveUserId(user)
        );

  var regState = asString(series && series.registrationState) === 'open' ? 'open' : 'closed';
  var life = asString(series && series.lifecycleStatus);
  var published = life === 'published';
  var historical = life === 'cancelled' || life === 'archived';
  var seriesCompleted = asString(series && series.competitionPhaseCache) === 'completed';

  // 对齐队际赛：邀请/代报名在 published 均可见且不因 closed 置灰；
  // closed 拦截放在点击入口（共享 Modal），不在 ViewModel 置灰。
  // Series 整体 completed 对齐普通 finished：不展示替他人报名入口。
  var featuresCommon = [];
  if (published && !historical) {
    if (!seriesCompleted) {
      featuresCommon.push({
        scope: 'series',
        tier: 'common',
        permission: 'register_for_other',
        glyph: '📝',
        label: '替他人报名',
        tone: '',
        disabled: !canProxy,
        disabledReason: !canProxy ? 'permission_denied' : ''
      });
    }
    featuresCommon.push({
      scope: 'series',
      tier: 'common',
      permission: 'invite_friends_register',
      glyph: '📤',
      label: '邀请好友报名',
      tone: '',
      disabled: false,
      disabledReason: ''
    });
  }

  // 管理四列网格：修改系列赛 / 取消 / 打开关闭报名；第4位自然留空
  var featuresManage = [];
  if (canManage && published && !historical) {
    featuresManage.push({
      scope: 'series',
      tier: 'manage',
      permission: 'edit_series',
      glyph: '✏️',
      label: '修改系列赛',
      tone: '',
      disabled: false,
      disabledReason: ''
    });
    featuresManage.push({
      scope: 'series',
      tier: 'manage',
      permission: 'cancel_series',
      glyph: '✖',
      label: '取消系列赛',
      tone: 'danger',
      disabled: true,
      disabledReason: 'coming_soon',
      subLabel: '功能即将开放'
    });
    featuresManage.push({
      scope: 'series',
      tier: 'manage',
      permission: 'toggle_registration',
      glyph: regState === 'open' ? '🔒' : '🔓',
      label: regState === 'open' ? '关闭报名' : '打开报名',
      tone: regState === 'open' ? 'state' : 'success',
      disabled: false,
      disabledReason: '',
      registrationState: regState
    });
  }

  return {
    canManageSeries: canManage,
    canRegisterForOther: canProxy,
    registrationState: regState,
    showRoundManage: !!canManage,
    featuresCommon: featuresCommon,
    featuresManage: featuresManage,
    // 兼容旧字段：危险项已并入 featuresManage
    featuresDanger: featuresManage.filter(function (f) {
      return f.permission === 'cancel_series';
    }),
    featuresMain: featuresCommon.concat(featuresManage)
  };
}

function emptyRoundSection() {
  return {
    hasSelection: false,
    gateOk: false,
    gateMessage: '',
    placeholder: '请选择需要管理的轮次',
    headline: '',
    summaryLine: '',
    roundId: '',
    matchId: '',
    featuresCommon: [],
    featuresPermission: [],
    featuresPermissionFooterPad: [],
    featuresPermissionFooter: [],
    lifecycleActions: [],
    featuresSectionCommonMain: '',
    featuresSectionCommonSub: '',
    featuresSectionPermissionMain: '',
    featuresSectionPermissionSub: ''
  };
}

function emptyRoundViewSection() {
  return {
    hasSelection: false,
    gateOk: false,
    gateMessage: '',
    headline: '',
    summaryLine: '',
    roundId: '',
    matchId: '',
    features: []
  };
}

/**
 * 不可见占位：保留四列槽位，无图标/文字/点击/焦点
 */
function makeSlotPlaceholder(slotKey, permission) {
  var perm = asString(permission) || asString(slotKey);
  return {
    slotKey: asString(slotKey) || 'ph_' + perm,
    permission: perm,
    placeholder: true,
    empty: true,
    visible: false,
    disabled: true,
    label: '',
    glyph: '',
    tone: ''
  };
}

function projectSlotFeature(feature, slotKey) {
  var f = feature && typeof feature === 'object' ? feature : {};
  var perm = asString(f.permission);
  return Object.assign({}, f, {
    slotKey: asString(slotKey) || perm || 'slot',
    permission: perm,
    placeholder: false,
    empty: false,
    visible: true
  });
}

function indexFeaturesByPermission(lists) {
  var map = Object.create(null);
  var arrs = Array.isArray(lists) ? lists : [];
  for (var i = 0; i < arrs.length; i++) {
    var list = Array.isArray(arrs[i]) ? arrs[i] : [];
    for (var j = 0; j < list.length; j++) {
      var f = list[j];
      if (!f || f.empty || f.placeholder) continue;
      var p = asString(f.permission);
      if (!p || p.indexOf('__pad_') === 0) continue;
      map[p] = f;
    }
  }
  return map;
}

/**
 * 权威 common 槽位（managedSeriesMode 源序 = FEATURES_COMMON）
 * 领先榜/统计迁移后保留 placeholder，禁止反馈/显示设置前移。
 */
var SERIES_ROUND_COMMON_SLOT_ORDER = [
  'leaderboard',
  'stats',
  'feedback',
  'theme'
];

/**
 * 权威 permission 主区槽位（ongoing/finished FEATURES_PERMISSION 非 footer）
 */
var SERIES_ROUND_PERM_MAIN_ONGOING = [
  'edit_match',
  'edit_half',
  'manage_players',
  'manage_tee_sheet',
  'edit_groups',
  'permission_management',
  'manage_payment',
  'net_score'
];

/** registering 主区（REGISTERING_FEATURES_PERMISSION 去掉 lifecycle 键） */
var SERIES_ROUND_PERM_MAIN_REGISTERING = [
  'edit_match',
  'edit_half',
  'permission_management',
  'manage_players',
  'manage_tee_sheet',
  'manage_payment'
];

/**
 * 本轮网格尾部生命周期键（C3-U）：仅追加开始/结束，紧跟主区末项（收费管理），
 * 不再插入取消/关闭报名占位或行末 pad（避免错列）。
 */
var SERIES_ROUND_TAIL_ONGOING = ['finish_match'];
var SERIES_ROUND_TAIL_REGISTERING = ['start_match'];

function projectOrderedSlots(order, byPerm, forcePlaceholderSet) {
  var out = [];
  var force = forcePlaceholderSet || {};
  for (var i = 0; i < order.length; i++) {
    var perm = order[i];
    var slotKey = 'slot_' + perm;
    if (force[perm] || ROUND_VIEW_PERMISSION_SET[perm]) {
      out.push(makeSlotPlaceholder(slotKey, perm));
      continue;
    }
    if (byPerm[perm]) {
      out.push(projectSlotFeature(byPerm[perm], slotKey));
      continue;
    }
    // 本生命周期权威矩阵中有、但当前菜单无此键（Series 隐藏或状态不可用）→ 占位保列
    if (
      teamMatchMoreMenu.SERIES_MANAGED_HIDDEN_PERMISSIONS[perm] ||
      perm === 'close_registration' ||
      perm === 'cancel_match'
    ) {
      out.push(makeSlotPlaceholder(slotKey, perm));
      continue;
    }
    // 模式隐藏（如 Match Play 无 net_score）：不输出，避免伪造槽位
  }
  return out;
}

/**
 * Series 本轮管理：单一四列网格投影（与上方 feature-grid 同规范）
 * - 主区：managed 菜单 featuresPermission 顺序
 * - 尾部：仅 start_match / finish_match，紧跟主区（收费管理后），无行 pad、无独立 lifecycle 容器
 * - common 区领先榜/统计已迁「本轮普通功能」，此处不再输出
 */
function projectRoundManageSlots(menu) {
  var src = menu && typeof menu === 'object' ? menu : {};
  var life = src.lifecycle || {};
  var byPerm = indexFeaturesByPermission([
    src.featuresCommon,
    src.featuresPermission,
    src.featuresPermissionFooter,
    src.lifecycleActions
  ]);

  var featuresPermission = [];
  var mainList = Array.isArray(src.featuresPermission) ? src.featuresPermission : [];
  for (var i = 0; i < mainList.length; i++) {
    var mf = mainList[i];
    if (!mf || mf.empty) continue;
    var mp = asString(mf.permission);
    if (!mp) continue;
    if (ROUND_VIEW_PERMISSION_SET[mp]) continue;
    featuresPermission.push(projectSlotFeature(mf, 'slot_' + mp));
  }

  var tailOrder = life.isRegistering
    ? SERIES_ROUND_TAIL_REGISTERING
    : SERIES_ROUND_TAIL_ONGOING;
  for (var f = 0; f < tailOrder.length; f++) {
    var fp = tailOrder[f];
    var fKey = 'slot_' + fp;
    if (byPerm[fp]) {
      featuresPermission.push(projectSlotFeature(byPerm[fp], fKey));
    }
  }

  featuresPermission = featuresPermission.map(function (item) {
    if (!item || item.placeholder || item.permission !== 'edit_match') return item;
    return Object.assign({}, item, { label: '编辑本轮' });
  });

  return {
    featuresCommon: [],
    featuresPermission: featuresPermission,
    featuresPermissionFooterPad: [],
    featuresPermissionFooter: [],
    lifecycleActions: []
  };
}

/** @deprecated 兼容旧自测名：现为占位投影，不再删除数组项 */
function stripRoundViewPermissions(list) {
  return projectOrderedSlots(
    SERIES_ROUND_COMMON_SLOT_ORDER,
    indexFeaturesByPermission([list]),
    ROUND_VIEW_PERMISSION_SET
  );
}

/** @deprecated 兼容：改走 projectRoundManageSlots */
function mergeLifecycleIntoRoundPermissionGrid(menu) {
  var projected = projectRoundManageSlots(menu);
  return {
    featuresPermission: projected.featuresPermission,
    featuresPermissionFooterPad: [],
    featuresPermissionFooter: [],
    lifecycleActions: []
  };
}

function buildRoundHeadline(meta) {
  var m = meta && typeof meta === 'object' ? meta : {};
  var label = asString(m.label) || 'R?';
  var name = asString(m.name);
  return label + (name ? ' · ' + name : '');
}

/**
 * 本轮普通功能：领先榜 / 统计数据（任何可打开 M 的用户，选轮后可见）
 */
function buildRoundViewSection(input) {
  var src = input && typeof input === 'object' ? input : {};
  var selected = asString(src.selectedRoundId);
  if (!selected) return emptyRoundViewSection();

  var meta = src.roundMeta && typeof src.roundMeta === 'object' ? src.roundMeta : {};
  var headline = buildRoundHeadline(meta);
  var summaryParts = [];
  var dateText = asString(meta.dateText);
  var statusLabel = asString(meta.statusLabel);
  if (dateText) summaryParts.push(dateText);
  if (statusLabel) summaryParts.push(statusLabel);
  var summaryLine = summaryParts.join(' · ');

  var gate = src.gate && typeof src.gate === 'object' ? src.gate : null;
  if (!gate || !gate.ok) {
    return {
      hasSelection: true,
      gateOk: false,
      gateMessage: asString(gate && gate.message) || '本轮比赛数据异常',
      headline: headline,
      summaryLine: summaryLine,
      roundId: selected,
      matchId: asString(gate && gate.matchId) || asString(meta.matchId),
      features: []
    };
  }

  // 四列：领先榜 | 统计数据 | 占位 | 占位（与本轮管理列宽一致，不紧缩）
  var features = [
    projectSlotFeature(
      {
        scope: 'round_view',
        tier: 'common',
        permission: 'leaderboard',
        glyph: '▦',
        label: '领先榜',
        tone: '',
        disabled: false,
        disabledReason: ''
      },
      'slot_leaderboard'
    ),
    projectSlotFeature(
      {
        scope: 'round_view',
        tier: 'common',
        permission: 'stats',
        glyph: '📈',
        label: '统计数据',
        tone: '',
        disabled: false,
        disabledReason: ''
      },
      'slot_stats'
    ),
    makeSlotPlaceholder('slot_round_view_pad_2', '__pad_round_view_2'),
    makeSlotPlaceholder('slot_round_view_pad_3', '__pad_round_view_3')
  ];

  return {
    hasSelection: true,
    gateOk: true,
    gateMessage: '',
    headline: headline,
    summaryLine: summaryLine,
    roundId: asString(gate.roundId) || selected,
    matchId: asString(gate.matchId),
    features: features
  };
}

/**
 * @param {object} input
 * @param {object} input.series
 * @param {string} [input.selectedRoundId]
 * @param {object} [input.gate]
 * @param {object} [input.user]
 * @param {object} [input.roundMeta]
 * @param {boolean} [input.canManageSeries]
 */
function buildRoundManageSection(input) {
  var src = input && typeof input === 'object' ? input : {};
  var canManage =
    typeof src.canManageSeries === 'boolean'
      ? src.canManageSeries
      : !!(
          src.series &&
          seriesManageAccess.isSeriesHostPrivileged(src.series, src.user || {})
        );
  if (!canManage) return emptyRoundSection();

  var selected = asString(src.selectedRoundId);
  if (!selected) return emptyRoundSection();

  var meta = src.roundMeta && typeof src.roundMeta === 'object' ? src.roundMeta : {};
  // C3-U：不再渲染「本轮管理」标题；轮次信息由上方「本轮普通功能」headline 承担
  var headline = '';
  var summaryLine = '';

  var gate = src.gate && typeof src.gate === 'object' ? src.gate : null;
  if (!gate || !gate.ok) {
    return {
      hasSelection: true,
      gateOk: false,
      gateMessage: asString(gate && gate.message) || '本轮比赛数据异常',
      placeholder: '',
      headline: headline,
      summaryLine: summaryLine,
      roundId: selected,
      matchId: asString(gate && gate.matchId) || asString(meta.matchId),
      featuresCommon: [],
      featuresPermission: [],
      featuresPermissionFooterPad: [],
      featuresPermissionFooter: [],
      lifecycleActions: [],
      featuresSectionCommonMain: '',
      featuresSectionCommonSub: '',
      featuresSectionPermissionMain: '',
      featuresSectionPermissionSub: ''
    };
  }

  var menu = teamMatchMoreMenu.buildMoreMenuViewModel({
    match: gate.match,
    user: src.user || {},
    options: { managedSeriesMode: true }
  });
  var projected = projectRoundManageSlots(menu);

  return {
    hasSelection: true,
    gateOk: true,
    gateMessage: '',
    placeholder: '',
    headline: headline,
    summaryLine: summaryLine,
    roundId: asString(gate.roundId) || selected,
    matchId: asString(gate.matchId),
    featuresCommon: [],
    featuresPermission: projected.featuresPermission || [],
    featuresPermissionFooterPad: [],
    featuresPermissionFooter: [],
    lifecycleActions: [],
    featuresSectionCommonMain: '',
    featuresSectionCommonSub: '',
    featuresSectionPermissionMain: menu.featuresSectionPermissionMain || '赛事管理',
    featuresSectionPermissionSub: menu.featuresSectionPermissionSub || ''
  };
}

/**
 * @param {object} input
 * @param {object} input.series
 * @param {object} input.user
 * @param {string} [input.suggestedRoundId]
 * @param {string} [input.selectedRoundId]
 * @param {object} [input.gate]
 * @param {function} [input.getMatchById]
 * @param {boolean} [input.canManageSeries]
 * @param {boolean} [input.canRegisterForOther]
 */
function buildSeriesManageSheetViewModel(input) {
  var src = input && typeof input === 'object' ? input : {};
  var series = src.series && typeof src.series === 'object' ? src.series : {};
  var user = src.user || {};
  var canManage =
    typeof src.canManageSeries === 'boolean'
      ? src.canManageSeries
      : !!seriesManageAccess.isSeriesHostPrivileged(series, user);
  var seriesScope = buildSeriesScopeFeatures({
    series: series,
    user: user,
    canManageSeries: canManage,
    canRegisterForOther: src.canRegisterForOther
  });

  var life = asString(series.lifecycleStatus);
  var showRoundPicker = life === 'published';
  var picker = { items: [], suggestedRoundId: '', emptyText: '' };
  var roundViewSection = emptyRoundViewSection();
  var roundSection = emptyRoundSection();

  if (showRoundPicker) {
    picker = seriesManageRoundPicker.buildManageRoundPickerViewModel({
      series: series,
      suggestedRoundId: src.suggestedRoundId,
      getMatchById: src.getMatchById
    });
    var selected = asString(src.selectedRoundId);
    var roundMeta = null;
    var items = picker.items || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].roundId === selected) {
        roundMeta = items[i];
        break;
      }
    }
    var pickerItems = items.map(function (it) {
      var isSelected = !!(selected && it && it.roundId === selected);
      // 建议态在用户已选后退出；且建议轮不得带选中对勾
      var isSuggested = !selected && !!(it && it.isSuggested);
      return Object.assign({}, it, {
        isSelected: isSelected,
        isSuggested: isSuggested,
        showSelectedCheck: isSelected
      });
    });
    picker = {
      items: pickerItems,
      suggestedRoundId: selected ? '' : picker.suggestedRoundId,
      emptyText: picker.emptyText
    };
    roundViewSection = buildRoundViewSection({
      selectedRoundId: selected,
      gate: src.gate,
      roundMeta: roundMeta
    });
    if (canManage) {
      roundSection = buildRoundManageSection({
        series: series,
        selectedRoundId: selected,
        gate: src.gate,
        user: user,
        roundMeta: roundMeta,
        canManageSeries: true
      });
    }
  }

  return {
    seriesScope: seriesScope,
    showRoundPicker: showRoundPicker,
    showRoundManage: !!canManage,
    roundPicker: picker,
    roundViewSection: roundViewSection,
    roundSection: roundSection
  };
}

function buildSeriesInviteSharePath(seriesId) {
  var sid = asString(seriesId);
  if (!sid) return '';
  return (
    '/subpackages/tournament/pages/series-detail/index?seriesId=' +
    encodeURIComponent(sid) +
    '&tab=register'
  );
}

module.exports = {
  SERIES_SCOPE_PERMISSIONS: SERIES_SCOPE_PERMISSIONS,
  SERIES_COMMON_PERMISSIONS: SERIES_COMMON_PERMISSIONS,
  SERIES_MANAGE_PERMISSIONS: SERIES_MANAGE_PERMISSIONS,
  ROUND_VIEW_PERMISSION_SET: ROUND_VIEW_PERMISSION_SET,
  SERIES_ROUND_COMMON_SLOT_ORDER: SERIES_ROUND_COMMON_SLOT_ORDER,
  SERIES_ROUND_PERM_MAIN_ONGOING: SERIES_ROUND_PERM_MAIN_ONGOING,
  SERIES_ROUND_PERM_MAIN_REGISTERING: SERIES_ROUND_PERM_MAIN_REGISTERING,
  SERIES_ROUND_TAIL_ONGOING: SERIES_ROUND_TAIL_ONGOING,
  SERIES_ROUND_TAIL_REGISTERING: SERIES_ROUND_TAIL_REGISTERING,
  buildSeriesScopeFeatures: buildSeriesScopeFeatures,
  buildRoundViewSection: buildRoundViewSection,
  buildRoundManageSection: buildRoundManageSection,
  buildSeriesManageSheetViewModel: buildSeriesManageSheetViewModel,
  buildSeriesInviteSharePath: buildSeriesInviteSharePath,
  emptyRoundSection: emptyRoundSection,
  emptyRoundViewSection: emptyRoundViewSection,
  makeSlotPlaceholder: makeSlotPlaceholder,
  projectRoundManageSlots: projectRoundManageSlots,
  stripRoundViewPermissions: stripRoundViewPermissions,
  mergeLifecycleIntoRoundPermissionGrid: mergeLifecycleIntoRoundPermissionGrid
};
