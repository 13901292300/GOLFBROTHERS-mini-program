/**
 * 游戏配置脏检查：标准化快照 + 深比较。
 * 只比较会影响实例保存/结算的业务字段；展示投影与 UI 状态一律排除。
 */

function asString(v) {
  return v == null ? '' : String(v);
}

/** 纯 UI / 权限 / 交互态：不参与 dirty */
var UI_KEY = {
  headerRootStyle: true,
  headerBarStyle: true,
  pageMode: true,
  canEdit: true,
  canView: true,
  readonlyHint: true,
  numEditing: true,
  numEditField: true,
  numEditDraft: true,
  numEditList: true,
  numEditId: true,
  numEditProp: true,
  holeY: true,
  loading: true,
  loadError: true,
  nameDirty: true,
  setupSaving: true,
  settingsOpen: true,
  settingsLocked: true,
  showDonateSheet: true,
  showWindSheet: true,
  showHoleOrderSheet: true,
  showHoleSheet: true,
  showScoreSheet: true,
  showKickSheet: true,
  showKickCustom: true,
  holeOrderDragging: true,
  holeOrderDragIndex: true,
  orderDragging: true,
  orderRolling: true,
  orderDragFrom: true,
  orderDragId: true,
  orderDragOffset: true,
  pkBoxShow: true,
  matchFoldMul: true,
  foldAdd: true,
  foldBao: true,
  foldIds: true,
  gameMenuOpen: true,
  activeGameId: true,
  activePairId: true,
  dockHScrollLeft: true,
  boardHScrollLeft: true,
  flowPinStuck: true,
  flowHeadStuck: true,
  // 页面派生展示
  ruleSummary: true,
  kLabel: true,
  handicapHint: true,
  pairCount: true,
  selectedCount: true,
  formationLabel: true,
  entry: true,
  maxPlayers: true,
  isEditing: true,
  isThreePlayer: true,
  playerPickLocked: true,
  usePagePick: true,
  showSetupRest: true,
  showRuleEdit: true,
  rosterCompact: true,
  matchupLocked: true,
  partyPickExact: true,
  needPlayers: true,
  hcapWheelTitle: true,
  hcapWheelKey: true,
  hcapWheelValue: true,
  threeSetHcapPairId: true,
  threeSetDraftFront: true,
  threeSetDraftBack: true,
  threeSetDraftOverall: true,
  threeSetHcapWheel: true
};

/** 参与方/对决上的纯展示投影字段 */
var PRESENTATION_KEY = {
  name: true,
  avatar: true,
  displayName: true,
  initial: true,
  leftFace: true,
  rightFace: true,
  leftSubject: true,
  rightSubject: true,
  members: true,
  memberAvatars: true,
  memberNames: true,
  faceKind: true,
  leftName: true,
  rightName: true,
  leftAvatar: true,
  rightAvatar: true,
  leftInitial: true,
  rightInitial: true,
  avatarModel: true,
  subjectType: true,
  useSubjectName: true,
  subjectId: true,
  segHcapText: true,
  segHcapSet: true,
  hcapText: true,
  hcapAddOff: true
};

/**
 * 实例配置业务根字段（保存/结算相关）。
 * 未列出的根字段默认排除，避免 showThreeSet 等派生条件污染 dirty。
 */
var INSTANCE_BUSINESS_ROOT = {
  ruleId: true,
  catalogId: true,
  ruleLibId: true,
  ruleSnapshot: true,
  ruleName: true,
  gameId: true,
  groupMode: true,
  sortMode: true,
  playerOrder: true,
  players: true,
  pairs: true,
  pairings: true,
  parties: true,
  selectedPartyIds: true,
  formationParties: true,
  teamedPartyMode: true,
  matchupMode: true,
  holes: true,
  holeCount: true,
  holeOrder: true,
  fullHoleOrder: true,
  createdHoleOrder: true,
  hcapNoHoles: true,
  rankId: true,
  multiplier: true,
  segmentValues: true,
  pointPerHole: true,
  defaultScoreCode: true,
  scoreRows: true,
  playerScoreCodes: true,
  dizhuboMode: true,
  flowerK: true,
  formation: true,
  bandMode: true,
  bandLowN: true,
  bandHighN: true,
  lasuoNMulRows: true,
  pushRule: true,
  reward: true,
  m2: true,
  meatInclude: true,
  meatCap: true,
  meatCapN: true,
  meatValueN: true,
  baoMode: true,
  baoPlusN: true,
  baoDoubleN: true,
  baoDiffN: true,
  deductMode: true,
  deductPlusN: true,
  deductCap: true,
  deductCapN: true,
  instanceDeduct: true,
  hcapRecvId: true,
  hcapRecvStrokes: true,
  hcapRecvHoles: true,
  lasuoHcapRows: true,
  kicks: true,
  potMode: true,
  potN: true,
  potM: true,
  potAllM: true,
  potS: true,
  potGameIds: true,
  windRule: true,
  windGameIds: true,
  privacy: true
};

function isUiKey(key) {
  var k = asString(key);
  if (!k) return true;
  if (UI_KEY[k]) return true;
  if (PRESENTATION_KEY[k]) return true;
  if (/fold/i.test(k)) return true;
  // 全部 show* 视为展示条件（含 showThreeSet / showTwoParty）
  if (/^show[A-Z]/.test(k)) return true;
  if (/Text$/i.test(k) && /^(lasuo|horn|rule|hole|pot|wind|band|formation)/i.test(k)) {
    return true;
  }
  if (k.indexOf('__') === 0) return true;
  return false;
}

function isPresentationKey(key) {
  return !!PRESENTATION_KEY[asString(key)];
}

function normScalar(v) {
  if (v == null) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') {
    if (!isFinite(v)) return null;
    return String(v);
  }
  if (typeof v === 'string') {
    var s = v.trim();
    if (s === '') return null;
    if (s === 'true') return true;
    if (s === 'false') return false;
    var n = Number(s);
    if (isFinite(n) && String(n) === s) return String(n);
    return s;
  }
  return v;
}

function stripPresentation(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  var out = {};
  Object.keys(obj).forEach(function (k) {
    if (isPresentationKey(k) || isUiKey(k)) return;
    out[k] = obj[k];
  });
  return out;
}

function normalizePlayer(p) {
  var raw = p && typeof p === 'object' ? p : {};
  var id = asString(raw.id || raw.partyId || raw.subjectId);
  var memberIds = raw.memberPlayerIds || raw.playerIds || null;
  var out = {
    id: id || null,
    partyId: asString(raw.partyId || id) || null,
    partyType: asString(raw.partyType) || null,
    selected: raw.selected === true ? true : raw.selected === false ? false : null,
    required: raw.required === true ? true : raw.required === false ? false : null,
    memberPlayerIds: Array.isArray(memberIds)
      ? memberIds.map(asString).filter(Boolean)
      : null,
    hcp: raw.hcp != null && raw.hcp !== '' ? normScalar(raw.hcp) : null
  };
  return normalize(out);
}

function normalizePair(pair) {
  var raw = pair && typeof pair === 'object' ? pair : {};
  var leftId = asString(raw.leftPartyId || raw.leftId);
  var rightId = asString(raw.rightPartyId || raw.rightId);
  var out = {
    id: asString(raw.id) || (leftId && rightId ? leftId + '|' + rightId : null),
    leftId: leftId || null,
    rightId: rightId || null,
    leftPartyId: asString(raw.leftPartyId || leftId) || null,
    rightPartyId: asString(raw.rightPartyId || rightId) || null,
    on: raw.on === false ? false : true,
    strokes: normScalar(raw.strokes != null ? raw.strokes : raw.handicap),
    handicap: normScalar(raw.handicap != null ? raw.handicap : raw.strokes),
    hcapList: raw.hcapList,
    segFront: normScalar(raw.segFront),
    segBack: normScalar(raw.segBack),
    segOverall: normScalar(raw.segOverall),
    segmentHandicaps: raw.segmentHandicaps
  };
  return normalize(out);
}

function normalize(value) {
  if (value == null) return null;
  if (Array.isArray(value)) {
    return value.map(function (item) {
      return normalize(item);
    });
  }
  var t = typeof value;
  if (t !== 'object') return normScalar(value);
  var keys = Object.keys(value)
    .filter(function (k) {
      return !isUiKey(k) && !isPresentationKey(k);
    })
    .sort();
  var out = {};
  keys.forEach(function (k) {
    var next = normalize(value[k]);
    if (next == null && (value[k] == null || value[k] === '')) return;
    out[k] = next;
  });
  if (out.id != null) {
    Object.keys(PRESENTATION_KEY).forEach(function (pk) {
      delete out[pk];
    });
  }
  return out;
}

/**
 * 从页面 data 抽取实例配置业务快照（唯一 dirty 比较入口）。
 */
function buildInstanceConfigSnapshot(pageData) {
  var src = pageData && typeof pageData === 'object' ? pageData : {};
  var raw = {};
  Object.keys(INSTANCE_BUSINESS_ROOT).forEach(function (k) {
    if (!Object.prototype.hasOwnProperty.call(src, k)) return;
    raw[k] = src[k];
  });
  // 兼容 catalogId / ruleId
  if (raw.ruleId == null && src.catalogId != null) raw.ruleId = src.catalogId;
  if (raw.catalogId == null && src.ruleId != null) raw.catalogId = src.ruleId;

  if (Array.isArray(raw.players)) {
    raw.players = raw.players.map(normalizePlayer);
  }
  if (Array.isArray(raw.pairs)) {
    raw.pairs = raw.pairs.map(normalizePair);
  }
  if (Array.isArray(raw.pairings)) {
    raw.pairings = raw.pairings.map(normalizePair);
  }
  if (Array.isArray(raw.parties)) {
    raw.parties = raw.parties.map(function (p) {
      return normalize({
        partyId: p && (p.partyId || p.id),
        playerIds: (p && (p.playerIds || p.memberPlayerIds)) || [],
        order: p && p.order
      });
    });
  }
  if (Array.isArray(raw.formationParties)) {
    raw.formationParties = raw.formationParties.map(function (p) {
      return normalize({
        partyId: p && (p.partyId || p.id),
        playerIds: (p && (p.playerIds || p.memberPlayerIds)) || [],
        order: p && p.order,
        selected: p && p.selected,
        required: p && p.required
      });
    });
  }
  if (raw.segmentValues && typeof raw.segmentValues === 'object') {
    raw.segmentValues = {
      front: normScalar(raw.segmentValues.front),
      back: normScalar(raw.segmentValues.back),
      overall: normScalar(raw.segmentValues.overall)
    };
  }
  return normalize(raw);
}

function stableString(value) {
  return JSON.stringify(normalize(value));
}

function deepEqual(a, b) {
  return stableString(a) === stableString(b);
}

function cloneJson(v) {
  if (v == null) return v;
  return JSON.parse(JSON.stringify(v));
}

function capture(value) {
  // 若已是页面 data 形态，优先走业务快照；否则标准化原值
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    var looksLikePage =
      Object.prototype.hasOwnProperty.call(value, 'ruleId') ||
      Object.prototype.hasOwnProperty.call(value, 'players') ||
      Object.prototype.hasOwnProperty.call(value, 'segmentValues') ||
      Object.prototype.hasOwnProperty.call(value, 'showThreeSet');
    if (looksLikePage) {
      return cloneJson(buildInstanceConfigSnapshot(value));
    }
  }
  return cloneJson(normalize(value));
}

function readonlyAllowedPatch(patch) {
  var src = patch && typeof patch === 'object' ? patch : {};
  var out = {};
  Object.keys(src).forEach(function (k) {
    if (isUiKey(k) || k === 'pageMode' || k === 'canEdit' || k === 'canView' || k === 'readonlyHint') {
      out[k] = src[k];
    }
  });
  return out;
}

function isUiOnlyPatch(patch) {
  var src = patch && typeof patch === 'object' ? patch : {};
  var keys = Object.keys(src);
  if (!keys.length) return true;
  return keys.every(function (k) {
    return isUiKey(k) || isPresentationKey(k);
  });
}

module.exports = {
  isUiKey: isUiKey,
  isPresentationKey: isPresentationKey,
  normalize: normalize,
  normalizePlayer: normalizePlayer,
  normalizePair: normalizePair,
  buildInstanceConfigSnapshot: buildInstanceConfigSnapshot,
  stableString: stableString,
  deepEqual: deepEqual,
  capture: capture,
  cloneJson: cloneJson,
  readonlyAllowedPatch: readonlyAllowedPatch,
  isUiOnlyPatch: isUiOnlyPatch,
  INSTANCE_BUSINESS_ROOT: INSTANCE_BUSINESS_ROOT
};
