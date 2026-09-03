/**
 * 游戏 TAB「选择参与人员」展示投影：按赛事正式分组，不按姓名 A–Z。
 * 不修改传入的 eventGroups / roster 原数组。
 */
var LAYOUT_EVENT_GROUPS = "event-groups";
var UNGROUPED_ID = "__ungrouped__";

function asString(v) {
  return v == null ? "" : String(v);
}

function asFiniteNumber(v) {
  if (v == null || v === "") return NaN;
  var n = Number(v);
  return isFinite(n) ? n : NaN;
}

function clonePerson(item, selectedMap) {
  var id = asString(item && (item.id || item.partyId || item.playerId));
  var selected = !!(item && item.selected);
  if (selectedMap) selected = !!selectedMap[id];
  return Object.assign({}, item, {
    id: id,
    selected: selected,
    businessDisabled: !!(item && item.businessDisabled),
    capacityBlocked: !!(item && item.capacityBlocked),
    disabled: !!(item && item.disabled)
  });
}

function numericHint(group, index) {
  if (!group) return { has: false, n: index + 1, index: index };
  var keys = [group.order, group.teeGroupIndex, group.groupIndex, group.groupNo];
  var i;
  for (i = 0; i < keys.length; i++) {
    var n = asFiniteNumber(keys[i]);
    if (!isNaN(n)) return { has: true, n: n, index: index };
  }
  var label = asString(group.groupName || group.name);
  var m = label.match(/第\s*(\d+)\s*组/);
  if (m) return { has: true, n: Number(m[1]), index: index };
  return { has: false, n: index + 1, index: index };
}

function orderEventGroups(eventGroups) {
  var src = Array.isArray(eventGroups) ? eventGroups : [];
  var rows = src.map(function (g, i) {
    return { group: g, hint: numericHint(g, i) };
  });
  var allHave = rows.length > 0 && rows.every(function (row) {
    return row.hint.has;
  });
  if (allHave) {
    rows.sort(function (a, b) {
      if (a.hint.n !== b.hint.n) return a.hint.n - b.hint.n;
      return a.hint.index - b.hint.index;
    });
  }
  return rows;
}

function groupLabelOf(group, displayNo) {
  var noLabel = "第" + displayNo + "组";
  var custom = asString(group && (group.groupName || group.name)).trim();
  if (!custom || custom === noLabel || /^第\s*\d+\s*组$/.test(custom)) return noLabel;
  return noLabel + " " + custom;
}

function slotPosition(item, fallback) {
  var n = asFiniteNumber(item && (item.position != null ? item.position : item.slotIndex));
  return isNaN(n) ? fallback : n;
}

function memberIdsOfGroup(group) {
  var g = group || {};
  var raw = [];
  if (Array.isArray(g.playersSlots) && g.playersSlots.length) {
    raw = g.playersSlots.slice();
  } else if (Array.isArray(g.players) && g.players.length) {
    raw = g.players.slice();
  }
  var decorated = raw.map(function (slot, i) {
    return { slot: slot, index: i };
  });
  decorated.sort(function (a, b) {
    var pa = slotPosition(a.slot, a.index);
    var pb = slotPosition(b.slot, b.index);
    if (pa !== pb) return pa - pb;
    return a.index - b.index;
  });
  var ids = [];
  var seen = {};
  decorated.forEach(function (row) {
    var slot = row.slot;
    if (!slot) return;
    var id = asString(slot.playerId || slot.userId || slot.id);
    if (!id || seen[id]) return;
    seen[id] = true;
    ids.push(id);
  });
  return ids;
}

function partyMatchesMember(person, memberId) {
  var pid = asString(person && person.id);
  if (!pid || !memberId) return false;
  if (pid === memberId) return true;
  var members = (person && person.memberPlayerIds) || [];
  var i;
  for (i = 0; i < members.length; i++) {
    if (asString(members[i]) === memberId) return true;
  }
  return false;
}

function partyBelongsToGroup(person, groupId, memberIds) {
  var gid = asString(groupId);
  if (gid && asString(person && person.groupId) === gid) return true;
  var i;
  for (i = 0; i < (memberIds || []).length; i++) {
    if (partyMatchesMember(person, memberIds[i])) return true;
  }
  return false;
}

function orderPartiesInGroup(memberIds, parties) {
  var used = {};
  var out = [];
  (memberIds || []).forEach(function (mid) {
    var i;
    for (i = 0; i < parties.length; i++) {
      var p = parties[i];
      if (!p || used[p.id]) continue;
      if (partyMatchesMember(p, mid)) {
        used[p.id] = true;
        out.push(p);
        break;
      }
    }
  });
  parties.forEach(function (p) {
    if (p && p.id && !used[p.id]) out.push(p);
  });
  return out;
}

function buildSelectionGroups(input) {
  var src = input || {};
  var selectedMap = {};
  var useSelectedIds = Array.isArray(src.selectedIds);
  (src.selectedIds || []).forEach(function (id) {
    var s = asString(id);
    if (s) selectedMap[s] = true;
  });
  var anomalies = [];
  var seenPerson = {};
  var roster = [];
  (src.players || []).forEach(function (item) {
    var person = clonePerson(item, useSelectedIds ? selectedMap : null);
    if (!person.id) return;
    if (seenPerson[person.id]) {
      anomalies.push({ type: "duplicate_playerId", playerId: person.id });
      return;
    }
    seenPerson[person.id] = true;
    roster.push(person);
  });

  var placed = {};
  var groups = [];
  var ordered = orderEventGroups(src.eventGroups);
  ordered.forEach(function (row, idx) {
    var g = row.group || {};
    var gid = asString(g.groupId) || "event-g-" + (idx + 1);
    var memberIds = memberIdsOfGroup(g);
    var bucket = [];
    roster.forEach(function (p) {
      if (placed[p.id]) return;
      if (partyBelongsToGroup(p, gid, memberIds)) bucket.push(p);
    });
    if (!bucket.length) return;
    var members = orderPartiesInGroup(memberIds, bucket);
    members.forEach(function (p) {
      placed[p.id] = true;
    });
    var displayNo = row.hint.has ? row.hint.n : idx + 1;
    groups.push({
      groupId: gid,
      groupNo: displayNo,
      groupLabel: groupLabelOf(g, displayNo),
      order: row.hint.index,
      members: members
    });
  });

  var ungrouped = [];
  roster.forEach(function (p) {
    if (!placed[p.id]) ungrouped.push(p);
  });
  if (ungrouped.length) {
    groups.push({
      groupId: UNGROUPED_ID,
      groupNo: 0,
      groupLabel: "未分组",
      order: 9999,
      members: ungrouped
    });
  }

  var flat = [];
  groups.forEach(function (g) {
    (g.members || []).forEach(function (m) {
      flat.push(m);
    });
  });

  return {
    layoutMode: LAYOUT_EVENT_GROUPS,
    selectionGroups: groups,
    groups: groups,
    flat: flat,
    selectedCount: flat.filter(function (p) {
      return p.selected;
    }).length,
    anomalies: anomalies
  };
}

function rebuildFromFlat(prevGroups, flat) {
  var selectedIds = (flat || [])
    .filter(function (p) {
      return p && p.selected;
    })
    .map(function (p) {
      return p.id;
    });
  var selectedMap = {};
  selectedIds.forEach(function (id) {
    selectedMap[id] = true;
  });
  var groups = (prevGroups || []).map(function (g) {
    return Object.assign({}, g, {
      members: (g.members || []).map(function (m) {
        return Object.assign({}, m, { selected: !!selectedMap[m.id] });
      })
    });
  });
  var nextFlat = [];
  groups.forEach(function (g) {
    (g.members || []).forEach(function (m) {
      nextFlat.push(m);
    });
  });
  return {
    layoutMode: LAYOUT_EVENT_GROUPS,
    selectionGroups: groups,
    groups: groups,
    flat: nextFlat,
    selectedCount: selectedIds.length
  };
}

module.exports = {
  LAYOUT_EVENT_GROUPS: LAYOUT_EVENT_GROUPS,
  UNGROUPED_ID: UNGROUPED_ID,
  numericHint: numericHint,
  orderEventGroups: orderEventGroups,
  groupLabelOf: groupLabelOf,
  memberIdsOfGroup: memberIdsOfGroup,
  buildSelectionGroups: buildSelectionGroups,
  rebuildFromFlat: rebuildFromFlat
};
