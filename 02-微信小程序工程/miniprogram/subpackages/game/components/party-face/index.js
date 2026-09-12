function asList(v) {
  return Array.isArray(v) ? v : [];
}

var comboDisplayName = require("../../../../utils/comboDisplayName.js");

function normalizeLayout(layout) {
  var raw = String(layout || "slot");
  if (raw === "folded") return "compact";
  if (raw === "expanded" || raw === "spread") return "board";
  return raw;
}

function kindOf(party) {
  var p = party || {};
  if (p.faceKind) return String(p.faceKind);
  var type = p.partyType ? String(p.partyType) : "player";
  var members = asList(p.members);
  if (type === "player" || members.length <= 1) return "single";
  if (members.length === 2) return "pair";
  return "stack";
}

/**
 * 显示模式只控制头像内部排列：
 * - compact/folded：折叠（含昵称）
 * - avatar-only：与 compact 相同折叠，但不渲染昵称（游戏设置卡片参与人行）
 * - board/expanded/spread：铺开（结果表头）
 * - slot/chip/row/sheet：既有页面布局，保持不变
 */
function viewOf(party, layout) {
  var p = party || {};
  var rawLayout = String(layout || "slot");
  var hideNames = rawLayout === "avatar-only";
  var resolvedLayout = hideNames ? "compact" : normalizeLayout(layout);
  var members = asList(p.members).map(function (m) {
    return {
      playerId: m.playerId || m.id || "",
      displayName: m.displayName || m.name || "",
      displayAvatar: m.displayAvatar || ""
    };
  });
  var kind = kindOf(p);
  // compact / avatar-only：2 人组合也走折叠叠放，与 3+ 一致
  var renderKind = kind;
  if (resolvedLayout === "compact" && kind === "pair" && members.length >= 2) {
    renderKind = "stack";
  }
  // 结果表头 board：保持 sourceKind；铺开由 faceMode=spread + CSS 控制，不改 stack DOM
  var stackMembers = members.slice(0, 4);
  var stackName = comboDisplayName.joinMemberDisplayNames(members);
  if (!stackName) stackName = p.name || p.displayName || "";
  var isCombo =
    !!p.useSubjectName ||
    p.subjectType === "combo" ||
    (p.partyType === "combination" && members.length > 1);
  var subjectName = "";
  if (isCombo) {
    subjectName = comboDisplayName.formatComboDisplayName({
      savedNames: [p.name, p.displayName, p.teamName],
      members: members,
      emptyFallback: stackName || "组合"
    });
  } else if (kind === "stack") {
    subjectName = comboDisplayName.formatComboDisplayName({
      savedNames: [p.name, p.displayName],
      members: members,
      emptyFallback: p.name || p.displayName || ""
    });
  }
  var showNames = !hideNames;
  var headerName = comboDisplayName.pickPublicName([
    members[0] && members[0].displayName,
    p.name,
    p.displayName
  ]);
  if (isCombo || kind === "stack") {
    headerName =
      subjectName ||
      headerName ||
      comboDisplayName.pickPublicName([p.name, p.displayName]) ||
      "";
  } else if (!headerName) {
    headerName = "球员";
  }
  return {
    kind: renderKind,
    sourceKind: kind,
    resolvedLayout: resolvedLayout,
    faceMode: resolvedLayout === "compact" ? "folded" : resolvedLayout === "board" ? "spread" : "slot",
    showNames: showNames,
    displayAvatar: p.displayAvatar || (members[0] && members[0].displayAvatar) || "",
    name: headerName,
    subjectName: subjectName,
    members: members,
    stackMembers: stackMembers,
    stackCount: stackMembers.length,
    stackName: stackName
  };
}

Component({
  properties: {
    party: {
      type: Object,
      value: {}
    },
    layout: {
      type: String,
      value: "slot"
    }
  },
  data: viewOf({}, "slot"),
  observers: {
    "party, layout": function () {
      this.setData(viewOf(this.properties.party, this.properties.layout));
    }
  }
});
