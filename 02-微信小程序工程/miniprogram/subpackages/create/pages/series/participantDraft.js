/**
 * Series Step 5 参赛主体纯函数（无 wx / Page / storage）
 */
var seriesModel = require('../../../../utils/seriesModel.js');
var seriesIds = require('../../../../utils/seriesIds.js');

var DIVISION_COLOR_PALETTE = [
  '#002d62',
  '#ce9224',
  '#00aeef',
  '#ef4444',
  '#10b981',
  '#8b5cf6',
  '#f59e0b',
  '#64748b'
];

var DEFAULT_DIVISION_NAMES = ['分队 A', '分队 B'];

function deepClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function isFirstWaveTemplate(hostMode, templateId) {
  var host = asString(hostMode);
  var tid = asString(templateId);
  if (host === 'team' && tid === 'division_series') return true;
  if (host === 'organization' && tid === 'inter_team_series') return true;
  return false;
}

function hasOrganization(draft) {
  var org = (draft && draft.organization) || {};
  return !!asString(org.organizationId);
}

function hasHostTeam(draft) {
  var host = (draft && draft.hostTeam) || {};
  return !!asString(host.teamId);
}

function listParticipants(draft) {
  return Array.isArray(draft && draft.participants) ? draft.participants : [];
}

function hasStep5BranchData(draft) {
  if (hasOrganization(draft) || hasHostTeam(draft)) return true;
  return listParticipants(draft).length > 0;
}

function countTeamParticipants(participants) {
  var list = Array.isArray(participants) ? participants : [];
  var n = 0;
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].kind === 'team') n += 1;
  }
  return n;
}

function countDivisionParticipants(participants) {
  var list = Array.isArray(participants) ? participants : [];
  var n = 0;
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].kind === 'division') n += 1;
  }
  return n;
}

function emptyOrganization() {
  return { organizationId: '', organizationName: '', organizationLogo: '' };
}

function emptyHostTeam() {
  return { teamId: '', teamName: '', teamLogo: '' };
}

function mapOrganizationPayload(payload) {
  var p = payload || {};
  return {
    organizationId: asString(p.organizationId),
    organizationName: asString(p.organizationName),
    organizationLogo: asString(p.organizationLogo)
  };
}

function mapHostTeamPayload(payload) {
  var p = payload || {};
  return {
    teamId: asString(p.teamId),
    teamName: asString(p.teamName),
    teamLogo: asString(p.teamLogo)
  };
}

/**
 * 全称快照：sourceTeamName → name → ''（不得从简称猜测）
 */
function resolveTeamFullNameSnapshot(item) {
  var p = item || {};
  return asString(p.sourceTeamName) || asString(p.name) || '';
}

/**
 * 简称快照：sourceTeamShortName → shortName → fullNameSnapshot → ''
 */
function resolveTeamShortNameSnapshot(item, fullNameSnapshot) {
  var p = item || {};
  return (
    asString(p.sourceTeamShortName) ||
    asString(p.shortName) ||
    asString(fullNameSnapshot) ||
    ''
  );
}

/**
 * 兼容字段 nameSnapshot：short → full → ''
 */
function resolveTeamParticipantNameSnapshot(item) {
  var full = resolveTeamFullNameSnapshot(item);
  var short = resolveTeamShortNameSnapshot(item, full);
  return short || full || '';
}

/**
 * 选择器参赛球队 → Series participants（整表替换语义由调用方决定）
 * 同时写入 fullNameSnapshot / shortNameSnapshot / nameSnapshot。
 */
function mapTeamParticipantsFromSelect(selectList) {
  var list = Array.isArray(selectList) ? selectList : [];
  var seen = Object.create(null);
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var item = list[i] || {};
    var sourceTeamId = asString(item.sourceTeamId);
    if (!sourceTeamId || seen[sourceTeamId]) continue;
    seen[sourceTeamId] = 1;
    var fullNameSnapshot = resolveTeamFullNameSnapshot(item);
    var shortNameSnapshot = resolveTeamShortNameSnapshot(item, fullNameSnapshot);
    var nameSnapshot = shortNameSnapshot || fullNameSnapshot || '';
    out.push(
      seriesModel.createParticipant({
        kind: 'team',
        sourceTeamId: sourceTeamId,
        divisionId: '',
        seriesParticipantId: 'team:' + sourceTeamId,
        fullNameSnapshot: fullNameSnapshot,
        shortNameSnapshot: shortNameSnapshot,
        nameSnapshot: nameSnapshot,
        logoSnapshot: asString(item.sourceTeamLogo),
        colorSnapshot: ''
      })
    );
  }
  return out;
}

function removeTeamParticipantBySourceId(participants, sourceTeamId) {
  var sid = asString(sourceTeamId);
  var list = Array.isArray(participants) ? participants : [];
  if (!sid) return deepClone(list);
  return list.filter(function (p) {
    return !(p && p.kind === 'team' && asString(p.sourceTeamId) === sid);
  });
}

function createDivisionId() {
  return seriesIds.generateScopedId('sdiv');
}

function nameInitial(name) {
  var text = asString(name);
  if (!text) return '?';
  return text.charAt(0);
}

function createDefaultDivisions(hostTeam) {
  var host = hostTeam || {};
  var sourceTeamId = asString(host.teamId);
  var out = [];
  for (var i = 0; i < 2; i++) {
    var divisionId = createDivisionId();
    out.push(
      seriesModel.createParticipant({
        kind: 'division',
        sourceTeamId: sourceTeamId,
        divisionId: divisionId,
        seriesParticipantId: 'division:' + divisionId,
        nameSnapshot: DEFAULT_DIVISION_NAMES[i] || '分队 ' + (i + 1),
        logoSnapshot: '',
        colorSnapshot: DIVISION_COLOR_PALETTE[i] || DIVISION_COLOR_PALETTE[0]
      })
    );
  }
  return out;
}

function addDivision(participants, hostTeam) {
  var list = deepClone(Array.isArray(participants) ? participants : []);
  var host = hostTeam || {};
  var divisionId = createDivisionId();
  var colorIndex = countDivisionParticipants(list) % DIVISION_COLOR_PALETTE.length;
  list.push(
    seriesModel.createParticipant({
      kind: 'division',
      sourceTeamId: asString(host.teamId),
      divisionId: divisionId,
      seriesParticipantId: 'division:' + divisionId,
      nameSnapshot: '新分队',
      logoSnapshot: '',
      colorSnapshot: DIVISION_COLOR_PALETTE[colorIndex] || DIVISION_COLOR_PALETTE[0]
    })
  );
  return { ok: true, participants: list };
}

function updateDivision(participants, divisionId, patch) {
  var did = asString(divisionId);
  var list = deepClone(Array.isArray(participants) ? participants : []);
  if (!did) return { ok: false, reason: 'missing_division_id', participants: list };
  var found = false;
  var p = patch || {};
  for (var i = 0; i < list.length; i++) {
    var cur = list[i];
    if (!cur || cur.kind !== 'division' || asString(cur.divisionId) !== did) continue;
    found = true;
    if (Object.prototype.hasOwnProperty.call(p, 'nameSnapshot')) {
      cur.nameSnapshot = asString(p.nameSnapshot);
    }
    if (Object.prototype.hasOwnProperty.call(p, 'colorSnapshot')) {
      cur.colorSnapshot = asString(p.colorSnapshot);
    }
    // 身份字段禁止被 patch 覆盖
    cur.divisionId = did;
    cur.seriesParticipantId = 'division:' + did;
    cur.kind = 'division';
    cur.logoSnapshot = '';
    list[i] = cur;
    break;
  }
  if (!found) return { ok: false, reason: 'division_not_found', participants: list };
  return { ok: true, participants: list };
}

function removeDivision(participants, divisionId) {
  var did = asString(divisionId);
  var list = Array.isArray(participants) ? participants : [];
  if (!did) return deepClone(list);
  return list.filter(function (p) {
    return !(p && p.kind === 'division' && asString(p.divisionId) === did);
  });
}

function clearBranchForHostModeSwitch(draft, nextHostMode) {
  var next = deepClone(draft || {});
  next.hostMode = asString(nextHostMode);
  next.organization = emptyOrganization();
  next.hostTeam = emptyHostTeam();
  next.participants = [];
  return next;
}

function applyHostTeamChange(draft, hostTeamPayload, options) {
  var opts = options || {};
  var next = deepClone(draft || {});
  var mapped = mapHostTeamPayload(hostTeamPayload);
  next.hostTeam = mapped;
  if (opts.clearDivisions) {
    next.participants = [];
  }
  return next;
}

function ensureDefaultDivisionsIfNeeded(draft) {
  var next = deepClone(draft || {});
  if (!hasHostTeam(next)) return next;
  if (countDivisionParticipants(next.participants) > 0) return next;
  next.participants = createDefaultDivisions(next.hostTeam);
  return next;
}

function buildDivisionCards(participants) {
  var list = Array.isArray(participants) ? participants : [];
  var cards = [];
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    if (!p || p.kind !== 'division') continue;
    var name = asString(p.nameSnapshot) || '未命名分队';
    var color = asString(p.colorSnapshot) || DIVISION_COLOR_PALETTE[0];
    cards.push({
      divisionId: asString(p.divisionId),
      seriesParticipantId: asString(p.seriesParticipantId),
      name: name,
      nameInput: name,
      color: color,
      initial: nameInitial(name)
    });
  }
  return cards;
}

function resolveTeamChipDisplayName(participant) {
  var p = participant || {};
  return (
    asString(p.shortNameSnapshot) ||
    asString(p.nameSnapshot) ||
    asString(p.fullNameSnapshot) ||
    '未命名球队'
  );
}

function buildTeamParticipantChips(participants) {
  var list = Array.isArray(participants) ? participants : [];
  var chips = [];
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    if (!p || p.kind !== 'team') continue;
    chips.push({
      sourceTeamId: asString(p.sourceTeamId),
      seriesParticipantId: asString(p.seriesParticipantId),
      name: resolveTeamChipDisplayName(p),
      fullName: asString(p.fullNameSnapshot),
      shortName: asString(p.shortNameSnapshot),
      logo: asString(p.logoSnapshot)
    });
  }
  return chips;
}

function buildInitParticipantsPayload(participants) {
  var list = Array.isArray(participants) ? participants : [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    if (!p || p.kind !== 'team') continue;
    var fullName = asString(p.fullNameSnapshot);
    var shortName = asString(p.shortNameSnapshot);
    var display = resolveTeamChipDisplayName(p);
    out.push({
      id: asString(p.sourceTeamId),
      groupId: asString(p.sourceTeamId),
      sourceTeamId: asString(p.sourceTeamId),
      // 回填必须分字段；禁止把简称同时写成全称
      sourceTeamName: fullName,
      sourceTeamShortName: shortName,
      sourceTeamLogo: asString(p.logoSnapshot),
      name: display,
      order: out.length
    });
  }
  return { participants: out };
}

module.exports = {
  DIVISION_COLOR_PALETTE: DIVISION_COLOR_PALETTE,
  DEFAULT_DIVISION_NAMES: DEFAULT_DIVISION_NAMES,
  deepClone: deepClone,
  isFirstWaveTemplate: isFirstWaveTemplate,
  hasOrganization: hasOrganization,
  hasHostTeam: hasHostTeam,
  hasStep5BranchData: hasStep5BranchData,
  countTeamParticipants: countTeamParticipants,
  countDivisionParticipants: countDivisionParticipants,
  emptyOrganization: emptyOrganization,
  emptyHostTeam: emptyHostTeam,
  mapOrganizationPayload: mapOrganizationPayload,
  mapHostTeamPayload: mapHostTeamPayload,
  resolveTeamFullNameSnapshot: resolveTeamFullNameSnapshot,
  resolveTeamShortNameSnapshot: resolveTeamShortNameSnapshot,
  resolveTeamParticipantNameSnapshot: resolveTeamParticipantNameSnapshot,
  resolveTeamChipDisplayName: resolveTeamChipDisplayName,
  mapTeamParticipantsFromSelect: mapTeamParticipantsFromSelect,
  removeTeamParticipantBySourceId: removeTeamParticipantBySourceId,
  createDivisionId: createDivisionId,
  nameInitial: nameInitial,
  createDefaultDivisions: createDefaultDivisions,
  addDivision: addDivision,
  updateDivision: updateDivision,
  removeDivision: removeDivision,
  clearBranchForHostModeSwitch: clearBranchForHostModeSwitch,
  applyHostTeamChange: applyHostTeamChange,
  ensureDefaultDivisionsIfNeeded: ensureDefaultDivisionsIfNeeded,
  buildDivisionCards: buildDivisionCards,
  buildTeamParticipantChips: buildTeamParticipantChips,
  buildInitParticipantsPayload: buildInitParticipantsPayload
};
