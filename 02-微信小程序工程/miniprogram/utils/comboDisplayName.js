/**
 * 组合昵称唯一生成入口（全小程序展示层共用）。
 *
 * 规则：
 * - 成员简称用 `/` 连接：张三/李四、张三/李四/王五
 * - 禁止 ` + ` / 空格加号等拼接
 * - 历史系统名「张三 + 李四」「张三 / 李四」在投影层归一为「张三/李四」
 * - 不覆盖用户手工输入的真实组合名（如「铁三角」）
 * - 不向 UI 暴露 Team/partyId 等内部标签
 *
 * 优先级：
 * 1. 有效已保存组合昵称（创建/记分）
 * 2. 成员原序用 `/` 拼接
 * 3. 无成员简称时，仅允许用户真实名「组合1」等非内部标签
 */

var COMBO_MEMBER_SEP = '/';

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function isInternalPartyLabel(name) {
  var n = asString(name);
  if (!n) return true;
  var lower = n.toLowerCase();
  if (/^party[-_]?\d+$/i.test(n)) return true;
  if (/^team[-_\s]?\d+$/i.test(n)) return true;
  if (lower === 'team1' || lower === 'team2' || lower === 'team 1' || lower === 'team 2') {
    return true;
  }
  if (/^队伍\s*\d+$/.test(n)) return true;
  if (/^第\d+方$/.test(n)) return true;
  if (n === '组合') return true;
  if (n === '球员') return true;
  if (/^组合\s*\d+$/.test(n)) return true;
  if (/^leftpartyid|^rightpartyid$/i.test(n)) return true;
  if (/^side\s*\d+$/i.test(n)) return true;
  return false;
}

function pickPublicName(candidates) {
  var i;
  for (i = 0; i < (candidates || []).length; i++) {
    var n = asString(candidates[i]);
    if (n && !isInternalPartyLabel(n)) return n;
  }
  return '';
}

function memberNameList(membersOrNames) {
  var parts = [];
  (membersOrNames || []).forEach(function (m) {
    var n =
      typeof m === 'string' || typeof m === 'number'
        ? asString(m)
        : asString((m && (m.displayName || m.name || m.unitName)) || '');
    if (n && !isInternalPartyLabel(n)) parts.push(n);
  });
  return parts;
}

/**
 * 成员昵称拼接：唯一允许的组合兜底格式。
 */
function joinMemberDisplayNames(membersOrNames) {
  return memberNameList(membersOrNames).join(COMBO_MEMBER_SEP);
}

/**
 * 是否为「仅由分隔符连接成员昵称」的系统自动名（可安全归一）。
 */
function isAutoJoinedMemberName(name, membersOrNames) {
  var n = asString(name);
  if (!n) return false;
  var parts = memberNameList(membersOrNames);
  if (parts.length >= 2) {
    var candidates = [
      parts.join(' + '),
      parts.join('+'),
      parts.join(' / '),
      parts.join('/'),
      parts.join('、'),
      parts.join(',')
    ];
    if (candidates.indexOf(n) >= 0) return true;
  }
  // 无成员列表时：整串为「词 + 词」或「词 / 词」形态
  if (/^\S+(?:\s*\+\s*\S+)+$/.test(n)) return true;
  if (/^\S+(?:\s+\/\s+\S+)+$/.test(n)) return true;
  if (/^\S+(?:\/\S+)+$/.test(n)) return true;
  if (/^\S+(?:、\S+)+$/.test(n)) return true;
  return false;
}

/**
 * 历史系统拼接名 → 标准 `/` 名；真实业务名原样返回（仍过滤内部标签）。
 * 若有成员列表且保存名是「别人的 + 拼接」而不匹配本组成员，返回空以便回退成员简称。
 */
function normalizeComboDisplayName(name, membersOrNames) {
  var n = asString(name);
  if (!n || isInternalPartyLabel(n)) return '';
  var parts = memberNameList(membersOrNames);
  if (parts.length >= 2) {
    if (isAutoJoinedMemberName(n, parts)) {
      return joinMemberDisplayNames(parts);
    }
    // 有本组成员时：不匹配的旧式拼接名无效（含 A→B 后残留的 A/队友）
    if (
      /^\S+(?:\s*\+\s*\S+)+$/.test(n) ||
      /^\S+(?:\s+\/\s+\S+)+$/.test(n) ||
      /^\S+(?:\/\S+)+$/.test(n) ||
      /^\S+(?:、\S+)+$/.test(n)
    ) {
      return '';
    }
    return n;
  }
  if (isAutoJoinedMemberName(n, parts)) {
    return n
      .split(/\s*\+\s*|\s+\/\s*|、|,/)
      .map(asString)
      .filter(function (p) {
        return p && !isInternalPartyLabel(p);
      })
      .join(COMBO_MEMBER_SEP);
  }
  return n;
}

/**
 * 组合可见昵称（展示投影唯一入口）。
 *
 * @param {object} opts
 * @param {string} [opts.savedName] 已保存 displayName/name/teamName
 * @param {string[]} [opts.savedNames] 多个候选保存名
 * @param {Array|string[]} [opts.members] 成员对象或昵称列表（原序）
 * @param {string} [opts.emptyFallback='组合'] 无任何可用名时的占位（非内部 ID）
 */
function formatComboDisplayName(opts) {
  opts = opts || {};
  var members = opts.members || opts.memberNames || [];
  var savedCandidates = [];
  if (opts.savedNames && opts.savedNames.length) {
    savedCandidates = opts.savedNames.slice();
  } else if (opts.savedName != null || opts.displayName != null || opts.name != null) {
    savedCandidates = [opts.savedName, opts.displayName, opts.name, opts.teamName];
  }
  var rawSaved = pickPublicName(savedCandidates);
  var saved = normalizeComboDisplayName(rawSaved, members);
  var joined = joinMemberDisplayNames(members);

  // 系统占位「组合N」优先回退成员简称
  if (saved && !/^组合\s*\d+$/.test(saved)) {
    return saved;
  }
  if (joined) return joined;
  if (saved) return saved;
  return asString(opts.emptyFallback) || '组合';
}

/**
 * 组合主体对象：按成员原序走 formatComboDisplayName。
 * 自定义名保留；历史 `A + 队友` / 过期 `A/队友` 在投影时改为当前成员 `/` 名。
 */
function applyComboDisplayNameToPerson(person) {
  if (!person || typeof person !== 'object') return person;
  var members = Array.isArray(person.members) ? person.members : [];
  var isCombo =
    !!person.useSubjectName ||
    person.subjectType === 'combo' ||
    person.partyType === 'combination' ||
    members.length > 1;
  if (!isCombo) return person;
  var formatted = formatComboDisplayName({
    savedNames: [person.displayName, person.name, person.teamName],
    members: members,
    emptyFallback: ''
  });
  if (formatted) {
    person.displayName = formatted;
    person.name = formatted;
  }
  return person;
}

/** @deprecated 兼容旧名：默认 sep 已改为 / */
function memberJoinedName(members, sep) {
  if (sep != null && sep !== COMBO_MEMBER_SEP && String(sep).indexOf('+') >= 0) {
    // 忽略调用方传入的 + 分隔，强制 /
    return joinMemberDisplayNames(members);
  }
  if (sep != null && sep !== COMBO_MEMBER_SEP) {
    return memberNameList(members).join(sep);
  }
  return joinMemberDisplayNames(members);
}

module.exports = {
  COMBO_MEMBER_SEP: COMBO_MEMBER_SEP,
  asString: asString,
  isInternalPartyLabel: isInternalPartyLabel,
  pickPublicName: pickPublicName,
  memberNameList: memberNameList,
  joinMemberDisplayNames: joinMemberDisplayNames,
  isAutoJoinedMemberName: isAutoJoinedMemberName,
  normalizeComboDisplayName: normalizeComboDisplayName,
  formatComboDisplayName: formatComboDisplayName,
  applyComboDisplayNameToPerson: applyComboDisplayNameToPerson,
  memberJoinedName: memberJoinedName
};
