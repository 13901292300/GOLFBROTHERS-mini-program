/**
 * 球队赛（队内/队际）M 面板菜单纯函数
 * - 无 setData / 导航 / 写入副作用
 * - managedSeriesMode 仅过滤 Series 禁止项；默认保持单场原行为
 */

var matchManageAccess = require('./matchManageAccess.js');
var tempAdminPermission = require('./tempAdminPermission.js');
var { isTeamMatchFamily } = require('./teamMatchCapabilities.js');
var strokeEntityValidator = require('./strokeEntityValidator.js');
var teamMatchFinish = require('./teamMatchFinish.js');
var isMatchPlayBoardMode = strokeEntityValidator.isMatchPlayBoardMode;
var resolveGameMode = strokeEntityValidator.resolveGameMode;

var FEATURES_COMMON = [
  { permission: 'leaderboard', glyph: '▦', label: '领先榜' },
  { permission: 'stats', glyph: '📈', label: '统计数据' },
  { permission: 'feedback', glyph: '💬', label: '反馈' },
  { permission: 'theme', glyph: '🎨', label: '显示设置' }
];

var FEATURES_VIEW_PERMISSION_SET = {
  leaderboard: true,
  stats: true,
  feedback: true,
  register_for_other: true,
  invite_friends_register: true
};

var FEATURES_PERMISSION = [
  { permission: 'edit_match', glyph: '✏️', label: '修改比赛', tone: '' },
  { permission: 'edit_half', glyph: '⛳', label: '修改半场', tone: '' },
  { permission: 'manage_players', glyph: '👤', label: '选手管理', tone: '' },
  { permission: 'manage_tee_sheet', glyph: '🚩', label: '出发管理', tone: '' },
  { permission: 'edit_groups', glyph: '👥', label: '修改分组', tone: '' },
  { permission: 'permission_management', glyph: '🛡️', label: '权限管理', tone: '' },
  { permission: 'manage_payment', glyph: '👛', label: '收费管理', tone: '' },
  { permission: 'net_score', glyph: '🧩', label: '生成净杆', tone: '' },
  { permission: 'cancel_match', glyph: '✖', label: '取消比赛', tone: 'danger' },
  { permission: 'finish_match', glyph: '⏻', label: '结束比赛', tone: 'warning' }
];

var REGISTERING_FEATURES_COMMON = [
  { permission: 'register_for_other', glyph: '📝', label: '替他人报名' },
  { permission: 'invite_friends_register', glyph: '📤', label: '邀请好友报名' }
];

var REGISTERING_FEATURES_PERMISSION = [
  { permission: 'edit_match', glyph: '✏️', label: '修改比赛', tone: '' },
  { permission: 'edit_half', glyph: '⛳', label: '修改半场', tone: '' },
  { permission: 'permission_management', glyph: '🛡️', label: '权限管理', tone: '' },
  { permission: 'manage_players', glyph: '👤', label: '选手管理', tone: '' },
  { permission: 'manage_tee_sheet', glyph: '🚩', label: '出发管理', tone: '' },
  { permission: 'manage_payment', glyph: '👛', label: '收费管理', tone: '' },
  { permission: 'close_registration', glyph: '🔒', label: '关闭报名', tone: '' },
  { permission: 'cancel_match', glyph: '✖', label: '取消比赛', tone: 'danger' },
  { permission: 'start_match', glyph: '▶', label: '开始比赛', tone: 'warning' }
];

var FEATURES_PERMISSION_FOOTER_KEYS = {
  cancel_match: true,
  start_match: true,
  finish_match: true
};

var FEATURE_SECTION_DEFAULT = {
  commonMain: '常用功能',
  commonSub: '普通用户可用',
  permissionMain: '管理功能',
  permissionSub: '需权限'
};

var FEATURE_SECTION_REGISTERING = {
  commonMain: '普通功能',
  commonSub: '',
  permissionMain: '赛事管理',
  permissionSub: ''
};

/**
 * Series-managed **本轮**菜单从数据源移除（不渲染、不占位）。
 * Series 级替代入口由 seriesManageSheetViewModel（scope:'series'）承载，勿删 Series 区按钮。
 */
var SERIES_MANAGED_HIDDEN_PERMISSIONS = {
  register_for_other: true,
  invite_friends_register: true,
  close_registration: true,
  cancel_match: true
};

/** Series 统一面板顶区权限键（与本轮隐藏项对应，但 scope 不同） */
var SERIES_SCOPE_PERMISSIONS = {
  register_for_other: true,
  invite_friends_register: true,
  toggle_registration: true,
  cancel_series: true,
  finish_series: true
};

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function resolveMatchLifecycle(match) {
  if (!match) {
    return {
      status: '',
      isRegistering: false,
      isOngoing: false,
      isCompleted: false
    };
  }
  var raw = asString(match.status).toLowerCase();
  var status = '';
  if (raw === 'finished' || raw === 'completed') status = 'completed';
  else if (raw === 'registering' || raw === 'ongoing') status = raw;
  return {
    status: status,
    isRegistering: status === 'registering',
    isOngoing: status === 'ongoing',
    isCompleted: status === 'completed'
  };
}

function normalizeRegistrationStatus(match) {
  var raw = asString(
    (match && (match.registrationStatus || match.registerStatus)) || 'open'
  ).toLowerCase();
  return raw === 'closed' ? 'closed' : 'open';
}

function buildCloseRegistrationFeature(match) {
  var registrationStatus = normalizeRegistrationStatus(match);
  return {
    permission: 'close_registration',
    glyph: registrationStatus === 'closed' ? '🔓' : '🔒',
    label: registrationStatus === 'closed' ? '打开报名' : '关闭报名',
    tone: registrationStatus === 'closed' ? 'success' : 'state'
  };
}

function canToggleRegistrationStatus(match) {
  var lifecycle = resolveMatchLifecycle(match);
  if (!lifecycle || lifecycle.isCompleted) return false;
  if (lifecycle.isRegistering) return true;
  return !!(lifecycle.isOngoing && isTeamMatchFamily(match));
}

function resolveOngoingCommonFeatures(match, lifecycle) {
  var base = FEATURES_COMMON.map(function (f) {
    return Object.assign({}, f);
  });
  if (!(lifecycle && lifecycle.isOngoing && isTeamMatchFamily(match))) {
    return base;
  }
  var proxy = null;
  for (var i = 0; i < REGISTERING_FEATURES_COMMON.length; i++) {
    if (
      REGISTERING_FEATURES_COMMON[i] &&
      REGISTERING_FEATURES_COMMON[i].permission === 'register_for_other'
    ) {
      proxy = REGISTERING_FEATURES_COMMON[i];
      break;
    }
  }
  var next = [];
  var seen = Object.create(null);
  base.forEach(function (f) {
    var item =
      f && f.permission === 'theme' && proxy ? Object.assign({}, proxy) : f;
    if (!item || !item.permission || seen[item.permission]) return;
    seen[item.permission] = true;
    next.push(item);
  });
  return next;
}

function splitPermissionFeatures(list) {
  var items = Array.isArray(list) ? list : [];
  var main = items.filter(function (f) {
    return f && !FEATURES_PERMISSION_FOOTER_KEYS[f.permission];
  });
  var footer = items.filter(function (f) {
    return f && FEATURES_PERMISSION_FOOTER_KEYS[f.permission];
  });
  var cols = 4;
  var rem = main.length % cols;
  var padCount = footer.length > 0 && rem !== 0 ? cols - rem : 0;
  var pad = [];
  for (var i = 0; i < padCount; i++) {
    pad.push({
      empty: true,
      permission: '__pad_' + i,
      label: '__placeholder__'
    });
  }
  return {
    featuresPermission: main,
    featuresPermissionFooterPad: pad,
    featuresPermissionFooter: footer
  };
}

function getMoreFeatureDisabledState(match, feature, seriesCompleted) {
  if (!feature || feature.empty) return false;
  var permission = feature.permission != null ? String(feature.permission) : '';
  if (!permission || FEATURES_VIEW_PERMISSION_SET[permission]) return false;

  var locked =
    !!seriesCompleted || teamMatchFinish.isMatchCompleted(match);
  if (!locked) return false;

  if (permission === 'manage_payment') return false;

  var netGenerated = !!(
    match &&
    match.peoriaResult &&
    match.peoriaResult.status === 'generated'
  );
  if (permission === 'net_score') return netGenerated;
  return true;
}

function withMoreFeatureDisabledState(list, match, seriesCompleted) {
  return (Array.isArray(list) ? list : []).map(function (f) {
    if (!f || f.empty) return f;
    var next = Object.assign({}, f, {
      disabled: getMoreFeatureDisabledState(match, f, seriesCompleted)
    });
    if (String(f.permission || '') === 'finish_match') {
      next.label =
        !!seriesCompleted || teamMatchFinish.isMatchCompleted(match)
          ? '已结束'
          : '结束比赛';
    }
    return next;
  });
}

function filterSeriesManagedPermissions(list) {
  return (Array.isArray(list) ? list : []).filter(function (f) {
    if (!f || f.empty) return true;
    var p = asString(f.permission);
    return !SERIES_MANAGED_HIDDEN_PERMISSIONS[p];
  });
}

function resolveGameModeSafe(match) {
  if (typeof resolveGameMode === 'function') {
    try {
      return resolveGameMode(match);
    } catch (e1) {
      /* fallthrough */
    }
  }
  return asString(match && (match.gameMode || match.selectedGameMode));
}

function rebuildFooterPad(mainLen, footerLen) {
  var cols = 4;
  var rem = mainLen % cols;
  var padCount = footerLen > 0 && rem !== 0 ? cols - rem : 0;
  var footerPad = [];
  for (var i = 0; i < padCount; i++) {
    footerPad.push({
      empty: true,
      permission: '__pad_' + i,
      label: '__placeholder__'
    });
  }
  return footerPad;
}

/**
 * @param {object} input
 * @param {object|null} input.match
 * @param {object|null} input.user
 * @param {object} [input.options]
 * @param {boolean} [input.options.managedSeriesMode]
 * @returns {object} menu view model fields for setData
 */
function buildMoreMenuViewModel(input) {
  var src = input && typeof input === 'object' ? input : {};
  var match = src.match && typeof src.match === 'object' ? src.match : null;
  var user = src.user && typeof src.user === 'object' ? src.user : {};
  var opts = src.options && typeof src.options === 'object' ? src.options : {};
  var managedSeriesMode = opts.managedSeriesMode === true;
  var seriesCompleted = opts.seriesCompleted === true;
  var userId = asString(user.userId || user.id);
  var lifecycle = resolveMatchLifecycle(match);
  var access = matchManageAccess.resolveMatchManageAccess(match, user);
  var permSet = access.permissions || [];

  function visible(scope, permission) {
    if (access.isPrivilegedUser || scope === 'common') return true;
    if (permission === 'edit_half') {
      return (
        tempAdminPermission.hasTempAdminPermission(match, userId, 'edit_match') ||
        tempAdminPermission.hasTempAdminPermission(match, userId, 'edit_half') ||
        permSet.indexOf('edit_match') >= 0 ||
        permSet.indexOf('edit_half') >= 0
      );
    }
    if (tempAdminPermission.hasTempAdminPermission(match, userId, permission)) {
      return true;
    }
    return permSet.indexOf(permission) >= 0;
  }

  if (lifecycle.isRegistering) {
    var sectionR = FEATURE_SECTION_REGISTERING;
    var lifecyclePermissionMap = {
      cancel_match: true,
      close_registration: true,
      start_match: true
    };
    var closeRegistrationFeature = buildCloseRegistrationFeature(match);
    var visibleRegisteringPermissionFeatures = REGISTERING_FEATURES_PERMISSION.filter(
      function (f) {
        return visible('permission', f.permission);
      }
    ).map(function (f) {
      if (f.permission !== 'close_registration') return Object.assign({}, f);
      return Object.assign({}, closeRegistrationFeature);
    });
    if (managedSeriesMode) {
      visibleRegisteringPermissionFeatures = filterSeriesManagedPermissions(
        visibleRegisteringPermissionFeatures
      );
    }
    var permissionFeatures = visibleRegisteringPermissionFeatures.filter(function (f) {
      return !(f && lifecyclePermissionMap[f.permission]);
    });
    var lifecycleActions = visibleRegisteringPermissionFeatures
      .filter(function (f) {
        return f && lifecyclePermissionMap[f.permission];
      })
      .map(function (f) {
        if (f.permission === 'cancel_match') return Object.assign({}, f, { tone: 'danger' });
        if (f.permission === 'start_match') return Object.assign({}, f, { tone: 'success' });
        return Object.assign({}, f);
      })
      .sort(function (a, b) {
        var order = { cancel_match: 1, close_registration: 2, start_match: 3 };
        return (order[a.permission] || 99) - (order[b.permission] || 99);
      });
    var splitR = splitPermissionFeatures(permissionFeatures);
    var commonR = REGISTERING_FEATURES_COMMON.filter(function (f) {
      return visible('common', f.permission);
    });
    if (managedSeriesMode) {
      commonR = filterSeriesManagedPermissions(commonR);
    }
    return {
      featuresCommon: withMoreFeatureDisabledState(commonR, match, seriesCompleted),
      featuresPermission: withMoreFeatureDisabledState(splitR.featuresPermission, match, seriesCompleted),
      featuresPermissionFooterPad: splitR.featuresPermissionFooterPad,
      featuresPermissionFooter: withMoreFeatureDisabledState(
        splitR.featuresPermissionFooter,
        match,
        seriesCompleted
      ),
      lifecycleActions: withMoreFeatureDisabledState(lifecycleActions, match, seriesCompleted),
      featuresSectionCommonMain: sectionR.commonMain,
      featuresSectionCommonSub: sectionR.commonSub,
      featuresSectionPermissionMain: sectionR.permissionMain,
      featuresSectionPermissionSub: sectionR.permissionSub,
      lifecycle: lifecycle,
      managedSeriesMode: managedSeriesMode
    };
  }

  var section = FEATURE_SECTION_DEFAULT;
  var hideStrokeOnlyFeatures = isMatchPlayBoardMode(resolveGameModeSafe(match));
  function allowFeature(f) {
    if (!f || !f.permission) return false;
    if (
      hideStrokeOnlyFeatures &&
      (f.permission === 'leaderboard' || f.permission === 'net_score')
    ) {
      return false;
    }
    return true;
  }
  var permissionFeaturesN = FEATURES_PERMISSION.filter(function (f) {
    return allowFeature(f) && visible('permission', f.permission);
  });
  if (managedSeriesMode) {
    permissionFeaturesN = filterSeriesManagedPermissions(permissionFeaturesN);
  }
  var split = splitPermissionFeatures(permissionFeaturesN);
  var footer = (split.featuresPermissionFooter || []).slice();
  var footerPad = split.featuresPermissionFooterPad || [];

  if (
    canToggleRegistrationStatus(match) &&
    visible('permission', 'close_registration') &&
    !managedSeriesMode
  ) {
    var closeFeature = buildCloseRegistrationFeature(match);
    var byId = Object.create(null);
    footer.forEach(function (f) {
      if (f && f.permission) byId[f.permission] = f;
    });
    byId.close_registration = closeFeature;
    var footerOrder = ['cancel_match', 'close_registration', 'finish_match'];
    var ordered = [];
    footerOrder.forEach(function (id) {
      if (byId[id]) ordered.push(byId[id]);
    });
    footer.forEach(function (f) {
      if (!f || !f.permission || footerOrder.indexOf(f.permission) >= 0) return;
      ordered.push(f);
    });
    footer = ordered;
    footerPad = rebuildFooterPad((split.featuresPermission || []).length, footer.length);
  } else if (managedSeriesMode) {
    footer = filterSeriesManagedPermissions(footer);
    footerPad = rebuildFooterPad((split.featuresPermission || []).length, footer.length);
  }

  // Series-managed：不把 theme 替换成代报名（该项会被过滤且不应留空位）
  var commonFeatures = (
    managedSeriesMode
      ? FEATURES_COMMON.map(function (f) {
          return Object.assign({}, f);
        })
      : resolveOngoingCommonFeatures(match, lifecycle)
  ).filter(function (f) {
    return allowFeature(f) && visible('common', f.permission);
  });
  if (managedSeriesMode) {
    commonFeatures = filterSeriesManagedPermissions(commonFeatures);
  }

  return {
    featuresCommon: withMoreFeatureDisabledState(commonFeatures, match, seriesCompleted),
    featuresPermission: withMoreFeatureDisabledState(split.featuresPermission, match, seriesCompleted),
    featuresPermissionFooterPad: footerPad,
    featuresPermissionFooter: withMoreFeatureDisabledState(footer, match, seriesCompleted),
    lifecycleActions: [],
    featuresSectionCommonMain: section.commonMain,
    featuresSectionCommonSub: section.commonSub,
    featuresSectionPermissionMain: section.permissionMain,
    featuresSectionPermissionSub: section.permissionSub,
    lifecycle: lifecycle,
    managedSeriesMode: managedSeriesMode
  };
}

/** 自测用：稳定菜单签名 */
function menuSignature(vm) {
  function mapList(list) {
    return (Array.isArray(list) ? list : [])
      .filter(function (f) {
        return f && !f.empty && f.permission;
      })
      .map(function (f) {
        return f.permission + (f.disabled ? ':d' : '') + (f.label ? '@' + f.label : '');
      });
  }
  return {
    common: mapList(vm && vm.featuresCommon),
    permission: mapList(vm && vm.featuresPermission),
    footer: mapList(vm && vm.featuresPermissionFooter),
    lifecycle: mapList(vm && vm.lifecycleActions)
  };
}

module.exports = {
  FEATURES_COMMON: FEATURES_COMMON,
  FEATURES_VIEW_PERMISSION_SET: FEATURES_VIEW_PERMISSION_SET,
  FEATURES_PERMISSION: FEATURES_PERMISSION,
  REGISTERING_FEATURES_COMMON: REGISTERING_FEATURES_COMMON,
  REGISTERING_FEATURES_PERMISSION: REGISTERING_FEATURES_PERMISSION,
  FEATURES_PERMISSION_FOOTER_KEYS: FEATURES_PERMISSION_FOOTER_KEYS,
  FEATURE_SECTION_DEFAULT: FEATURE_SECTION_DEFAULT,
  FEATURE_SECTION_REGISTERING: FEATURE_SECTION_REGISTERING,
  SERIES_MANAGED_HIDDEN_PERMISSIONS: SERIES_MANAGED_HIDDEN_PERMISSIONS,
  SERIES_SCOPE_PERMISSIONS: SERIES_SCOPE_PERMISSIONS,
  resolveMatchLifecycle: resolveMatchLifecycle,
  buildCloseRegistrationFeature: buildCloseRegistrationFeature,
  canToggleRegistrationStatus: canToggleRegistrationStatus,
  resolveOngoingCommonFeatures: resolveOngoingCommonFeatures,
  splitPermissionFeatures: splitPermissionFeatures,
  getMoreFeatureDisabledState: getMoreFeatureDisabledState,
  withMoreFeatureDisabledState: withMoreFeatureDisabledState,
  filterSeriesManagedPermissions: filterSeriesManagedPermissions,
  buildMoreMenuViewModel: buildMoreMenuViewModel,
  menuSignature: menuSignature
};
