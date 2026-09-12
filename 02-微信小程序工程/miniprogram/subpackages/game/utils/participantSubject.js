/**
 * 参赛主体投影：个人/组合统一为 subject 头像 + 昵称。
 * 组合昵称唯一走 utils/comboDisplayName（成员用 / 连接）。
 * 内部身份始终为 partyId；不向 UI 暴露 Team/partyId 等内部标签。
 */
var comboName = require('../../../utils/comboDisplayName.js');

function asString(v) {
  return comboName.asString(v);
}

function isInternalPartyLabel(name) {
  return comboName.isInternalPartyLabel(name);
}

function pickPublicName(candidates) {
  return comboName.pickPublicName(candidates);
}

function memberJoinedName(members, sep) {
  return comboName.memberJoinedName(members, sep);
}

/**
 * @param {object} party formation party / score party
 * @param {object} opts
 * @param {function} opts.presentPlayer (id) => {displayName, avatar, playerId}
 * @param {function} [opts.presentPerson] (id) => host party face
 * @param {boolean} [opts.selected]
 * @param {boolean} [opts.required]
 */
function buildParticipantSubject(party, opts) {
  opts = opts || {};
  var partyId = asString(
    party && (party.partyId || party.id || party.subjectId || party.teamId)
  );
  var playerIds = ((party && (party.playerIds || party.memberPlayerIds)) || [])
    .map(asString)
    .filter(Boolean);
  if (!playerIds.length && partyId) playerIds = [partyId];

  var presentPlayer =
    typeof opts.presentPlayer === "function"
      ? opts.presentPlayer
      : function (id) {
          return { playerId: id, displayName: id, displayAvatar: "", avatar: "" };
        };

  var hostFace = null;
  if (typeof opts.presentPerson === "function" && partyId) {
    try {
      hostFace = opts.presentPerson(partyId);
    } catch (eHost) {
      hostFace = null;
    }
  }

  var members = playerIds.map(function (id) {
    var p = presentPlayer(id) || {};
    var rawName = pickPublicName([p.displayName, p.name, p.matchNickname, p.nickname]);
    // presentPlayer 缺席时常用 id 充当 displayName，不当作可见昵称
    if (rawName === id) rawName = "";
    return {
      playerId: id,
      id: id,
      displayName: rawName,
      canonicalAvatar: asString(p.canonicalAvatar),
      displayAvatar: asString(p.displayAvatar),
      avatar: asString(p.avatar)
    };
  });
  // host party members 可补全头像/昵称
  if (hostFace && Array.isArray(hostFace.members) && hostFace.members.length) {
    var byId = {};
    hostFace.members.forEach(function (m) {
      var mid = asString(m && (m.playerId || m.id));
      if (mid) byId[mid] = m;
    });
    members = members.map(function (m) {
      var hit = byId[m.playerId];
      if (!hit) return m;
      var hitName = pickPublicName([hit.displayName, hit.name]);
      if (hitName === m.playerId) hitName = "";
      return {
        playerId: m.playerId,
        id: m.playerId,
        displayName: hitName || m.displayName,
        canonicalAvatar: asString(hit.canonicalAvatar) || m.canonicalAvatar,
        displayAvatar: asString(hit.displayAvatar) || m.displayAvatar,
        avatar: asString(hit.avatar) || m.avatar
      };
    });
  }

  var subjectType = playerIds.length <= 1 ? "person" : "combo";
  var displayName = "";
  if (subjectType === "person") {
    displayName = pickPublicName([
      members[0] && members[0].displayName,
      hostFace && hostFace.members && hostFace.members[0] && hostFace.members[0].displayName,
      hostFace && hostFace.name,
      hostFace && hostFace.displayName,
      party && party.displayName,
      party && party.name
    ]);
    if (!displayName) displayName = "球员";
  } else {
    displayName = comboName.formatComboDisplayName({
      savedNames: [
        party && party.displayName,
        party && party.name,
        party && party.teamName,
        hostFace && hostFace.name,
        hostFace && hostFace.displayName
      ],
      members: members,
      emptyFallback: "组合"
    });
  }

  var faceKind =
    subjectType === "person" ? "single" : members.length === 2 ? "pair" : "stack";
  var displayAvatar =
    subjectType === "person"
      ? (members[0] && members[0].displayAvatar) || ""
      : (members[0] && members[0].displayAvatar) || "";
  var avatar = (members[0] && members[0].avatar) || "";

  return {
    // 业务身份：始终 partyId
    id: partyId,
    subjectId: partyId,
    partyId: partyId,
    subjectType: subjectType,
    partyType:
      asString(party && party.partyType) ||
      (subjectType === "person" ? "player" : "combination"),
    faceKind: faceKind,
    // 统一主体展示
    name: displayName,
    displayName: displayName,
    displayAvatar: displayAvatar,
    canonicalAvatar: (members[0] && members[0].canonicalAvatar) || "",
    avatar: avatar,
    avatarModel: {
      kind: faceKind,
      members: members,
      displayAvatar: displayAvatar,
      avatar: avatar
    },
    members: members,
    memberPlayerIds: playerIds.slice(),
    memberAvatars: members.map(function (m) {
      return m.displayAvatar;
    }),
    memberNames: members.map(function (m) {
      return m.displayName;
    }),
    selected: !!opts.selected,
    required: !!opts.required,
    // 组合主体：party-face 用单行昵称，不展示双行成员名
    useSubjectName: subjectType === "combo",
    groupId: asString(party && party.groupId)
  };
}

module.exports = {
  asString: asString,
  isInternalPartyLabel: isInternalPartyLabel,
  pickPublicName: pickPublicName,
  memberJoinedName: memberJoinedName,
  formatComboDisplayName: comboName.formatComboDisplayName,
  joinMemberDisplayNames: comboName.joinMemberDisplayNames,
  normalizeComboDisplayName: comboName.normalizeComboDisplayName,
  COMBO_MEMBER_SEP: comboName.COMBO_MEMBER_SEP,
  buildParticipantSubject: buildParticipantSubject
};
