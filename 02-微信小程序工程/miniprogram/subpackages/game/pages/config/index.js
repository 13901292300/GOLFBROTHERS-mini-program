const { createHeaderStyle } = require("../../../../utils/headerEngine.js");
const catalog = require("../../utils/catalog.js");
const session = require("../../utils/sideGameBind.js");
const nav = require("../../utils/nav.js");
const numField = require("../../utils/numField.js");
const holeOrderUtil = require("../../utils/holeOrder.js");
const configGuard = require("../../utils/sideGameConfigGuard.js");
const pageBoot = require("../../utils/pageBoot.js");
const scoreMapUtil = require("../../utils/sideGameScoreMap.js");
const partyFormation = require("../../utils/partyFormation.js");
const threeSetPairReset = require("../../utils/threeSetPairReset.js");
const playerScoreCfg = require("../../utils/sideGame8421PlayerConfig.js");
const ruleDefaults = require("../../utils/sideGameRuleDefaults.js");
const normalizeHoleOrder = holeOrderUtil.normalizeHoleOrder;
const rotateHoleOrderToStart = holeOrderUtil.rotateHoleOrderToStart;
const holeOrderTextOf = holeOrderUtil.holeOrderTextOf;
const moveHoleOrderIndex = holeOrderUtil.moveHoleOrderIndex;

function ruleSummaryOf(snapshot, catalogId) {
  return catalog.summarizeRule(
    Object.assign({}, snapshot || {}, {
      catalogId: catalogId || (snapshot && snapshot.catalogId) || ""
    })
  );
}

function faceOf(item) {
  // 已投影的参赛主体：保留组合头像/昵称，勿被 presentPerson 内部标签覆盖
  if (item && (item.subjectType || item.useSubjectName || item.avatarModel)) {
    const next = Object.assign({}, item, {
      id: item.subjectId || item.id || item.partyId,
      name: item.displayName || item.name || "",
      displayName: item.displayName || item.name || ""
    });
    delete next.initial;
    return next;
  }
  const face = session.presentPerson(item && (item.id || item.partyId));
  const next = Object.assign({}, item || {}, {
    id: face.id,
    name: face.name,
    avatar: face.avatar,
    members: face.members,
    memberAvatars: face.memberAvatars,
    partyType: face.partyType,
    memberPlayerIds: face.memberPlayerIds
  });
  delete next.initial;
  return next;
}

function pairFaces(pair) {
  const leftId = pair && (pair.leftId || pair.leftPartyId);
  const rightId = pair && (pair.rightId || pair.rightPartyId);
  const left = pair && pair.leftSubject ? faceOf(pair.leftSubject) : session.presentPerson(leftId);
  const right =
    pair && pair.rightSubject ? faceOf(pair.rightSubject) : session.presentPerson(rightId);
  const next = Object.assign({}, pair || {}, {
    leftName: left.name,
    leftAvatar: left.avatar,
    leftFace: left,
    rightName: right.name,
    rightAvatar: right.avatar,
    rightFace: right
  });
  delete next.leftInitial;
  delete next.rightInitial;
  return next;
}

function labelOf(list, id) {
  const hit = list.find(function (item) {
    return item.id === id;
  });
  return hit ? hit.label : id;
}

function pairId(a, b) {
  return String(a.id) + "|" + String(b.id);
}

function parVal(item, key) {
  return item && item[key] != null && item[key] !== "" ? String(item[key]) : "0";
}

const HCAP_STEPS = ["-2", "-1.5", "-1", "-0.5", "0", "0.5", "1", "1.5", "2"];

function detectHcapTag(holes, order) {
  const list = holes || [];
  const unlocked = list.filter(function (item) {
    return !item.locked;
  });
  if (!unlocked.length) return "";
  if (unlocked.every(function (item) {
    return item.on;
  })) {
    return "all";
  }
  const groups = holeOrderUtil.hcapGroupsFromOrder(order);
  const onSet = {};
  unlocked.forEach(function (item) {
    if (item.on) onSet[item.label] = true;
  });
  const keys = Object.keys(groups);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const group = groups[key] || [];
    const available = group.filter(function (label) {
      const hit = list.find(function (item) {
        return item.label === label;
      });
      return hit && !hit.locked;
    });
    if (!available.length) continue;
    const allOn = available.every(function (label) {
      return onSet[label];
    });
    const onlyGroup = unlocked.filter(function (item) {
      return item.on;
    }).every(function (item) {
      return group.indexOf(item.label) >= 0;
    });
    if (allOn && onlyGroup) return key;
  }
  return "";
}

function applyHcapGroup(holes, groupKey, order) {
  const want = {};
  (holeOrderUtil.hcapGroupsFromOrder(order)[groupKey] || []).forEach(function (label) {
    want[label] = true;
  });
  return (holes || []).map(function (item) {
    if (item.locked) return item;
    return Object.assign({}, item, { on: !!want[item.label] });
  });
}

function hcapIndex(value) {
  const raw = String(value == null || value === "" ? "0" : value);
  const exact = HCAP_STEPS.indexOf(raw);
  if (exact >= 0) return exact;
  const n = Number(raw);
  if (!isFinite(n)) return 4;
  let best = 4;
  let dist = Infinity;
  HCAP_STEPS.forEach(function (step, idx) {
    const d = Math.abs(Number(step) - n);
    if (d < dist) {
      dist = d;
      best = idx;
    }
  });
  return best;
}

function baseHoleLabels(gameHoles) {
  return (gameHoles || [])
    .filter(function (item) {
      return item && item.on;
    })
    .map(function (item) {
      return item.label;
    });
}

function cloneHcapHoles(saved, gameHoles) {
  const labels = baseHoleLabels(gameHoles);
  return labels.map(function (label) {
    const hit = (saved || []).find(function (item) {
      return item && item.label === label;
    });
    if (hit) return { label: label, on: !!hit.on };
    if (!saved || !saved.length) return { label: label, on: true };
    return { label: label, on: false };
  });
}

function hcapHoleCount(holes) {
  return (holes || []).filter(function (item) {
    return item.on;
  }).length;
}

function hcapTextOf(par3, par4, par5, holes, noHoles) {
  if (noHoles) {
    return "前9 " + par3 + " · 后9 " + par4 + " · 18洞 " + par5;
  }
  const n = hcapHoleCount(holes);
  const total = (holes && holes.length) || 18;
  return "PAR3 " + par3 + " · PAR4 " + par4 + " · PAR5 " + par5 + " · " + n + "/" + total + "洞";
}

function makeHcapItem(cfg, gameHoles, noHoles) {
  const par3 = HCAP_STEPS[hcapIndex(cfg && cfg.par3)];
  const par4 = HCAP_STEPS[hcapIndex(cfg && cfg.par4)];
  const par5 = HCAP_STEPS[hcapIndex(cfg && cfg.par5)];
  const hcapHoles = noHoles ? [] : cloneHcapHoles(cfg && cfg.hcapHoles, gameHoles);
  return {
    par3: par3,
    par4: par4,
    par5: par5,
    hcapHoles: hcapHoles,
    holeCount: hcapHoleCount(hcapHoles),
    hcapText: hcapTextOf(par3, par4, par5, hcapHoles, noHoles)
  };
}

function segHandicapNonZero(front, back, overall) {
  function nz(v) {
    const n = Number(v);
    return isFinite(n) && n !== 0;
  }
  return nz(front) || nz(back) || nz(overall);
}

function normalizeSegHandicapValue(raw) {
  if (raw == null || raw === "") return "0";
  return HCAP_STEPS[hcapIndex(raw)];
}

function readPairSegmentHandicaps(pair) {
  const sh = (pair && pair.segmentHandicaps) || {};
  const front =
    pair && pair.segFront != null && pair.segFront !== ""
      ? pair.segFront
      : sh.front != null && sh.front !== ""
        ? sh.front
        : "0";
  const back =
    pair && pair.segBack != null && pair.segBack !== ""
      ? pair.segBack
      : sh.back != null && sh.back !== ""
        ? sh.back
        : "0";
  const overall =
    pair && pair.segOverall != null && pair.segOverall !== ""
      ? pair.segOverall
      : sh.overall != null && sh.overall !== ""
        ? sh.overall
        : "0";
  return {
    front: normalizeSegHandicapValue(front),
    back: normalizeSegHandicapValue(back),
    overall: normalizeSegHandicapValue(overall)
  };
}

function negateSegValue(raw) {
  const n = Number(raw);
  if (!isFinite(n) || n === 0) return "0";
  return normalizeSegHandicapValue(-n);
}

function flipPairSegmentHandicaps(pair) {
  const segs = readPairSegmentHandicaps(pair);
  return {
    front: negateSegValue(segs.front),
    back: negateSegValue(segs.back),
    overall: negateSegValue(segs.overall)
  };
}

/** 旧球员级 → 组合有符号 N = right - left */
function migratePairSegFromPlayers(pair, playerSegMap) {
  const map = playerSegMap || {};
  const left = map[String(pair.leftId)] || {};
  const right = map[String(pair.rightId)] || {};
  function diff(seg) {
    const l = Number(left[seg] != null && left[seg] !== "" ? left[seg] : 0);
    const r = Number(right[seg] != null && right[seg] !== "" ? right[seg] : 0);
    const a = isFinite(l) ? l : 0;
    const b = isFinite(r) ? r : 0;
    return normalizeSegHandicapValue(b - a);
  }
  return { front: diff("front"), back: diff("back"), overall: diff("overall") };
}

function attachPairSegmentFields(pair, segs) {
  const s = segs || { front: "0", back: "0", overall: "0" };
  return Object.assign({}, pair, {
    segFront: String(s.front),
    segBack: String(s.back),
    segOverall: String(s.overall),
    segmentHandicaps: {
      front: String(s.front),
      back: String(s.back),
      overall: String(s.overall)
    }
  });
}

/** 油菜旧单值让杆 → 比洞同构 hcapList（PAR3=PAR4=PAR5=N，有效洞默认全开） */
function migrateYoucaiPairToMatchHcap(pair, gameHoles) {
  if (pair && pair.hcapList && pair.hcapList.length) {
    return decoratePairHcap(pair, pair, gameHoles, false);
  }
  const raw =
    pair && pair.handicap != null && pair.handicap !== ""
      ? pair.handicap
      : pair && pair.strokes != null && pair.strokes !== ""
        ? pair.strokes
        : "0";
  const n = normalizeSegHandicapValue(raw);
  if (Number(n) === 0) {
    return decoratePairHcap(pair, { hcapList: [] }, gameHoles, false);
  }
  return decoratePairHcap(
    Object.assign({}, pair, { strokes: n, handicap: n }),
    { hcapList: [makeHcapItem({ par3: n, par4: n, par5: n }, gameHoles)] },
    gameHoles,
    false
  );
}

function flipHcapListSigns(list) {
  return (list || []).map(function (cfg) {
    if (!cfg) return cfg;
    return Object.assign({}, cfg, {
      par3: normalizeSegHandicapValue(-(Number(cfg.par3) || 0)),
      par4: normalizeSegHandicapValue(-(Number(cfg.par4) || 0)),
      par5: normalizeSegHandicapValue(-(Number(cfg.par5) || 0))
    });
  });
}

/** 三局：组合行摘要（组合三段任一非 0 →「已设置」） */
function decorateThreeSetPairRows(pairs) {
  return (pairs || []).map(function (pair) {
    const segs = readPairSegmentHandicaps(pair);
    const set = segHandicapNonZero(segs.front, segs.back, segs.overall);
    return Object.assign({}, pairFaces(pair), attachPairSegmentFields(pair, segs), {
      segHcapSet: !!set,
      segHcapText: set ? "已设置" : ""
    });
  });
}

function readHcapList(item, gameHoles, noHoles) {
  if (item && item.hcapList && item.hcapList.length) {
    return item.hcapList.map(function (cfg) {
      return makeHcapItem(cfg, gameHoles, noHoles);
    });
  }
  if (item && item.hcapOn) return [makeHcapItem(item, gameHoles, noHoles)];
  return [];
}

function assignedLabels(list, skipIndex) {
  const taken = {};
  (list || []).forEach(function (cfg, i) {
    if (i === skipIndex) return;
    (cfg.hcapHoles || []).forEach(function (hole) {
      if (hole.on) taken[hole.label] = true;
    });
  });
  return taken;
}

function playerHcapSrc(item, gameHoles) {
  if (item && item.hcapList && item.hcapList.length) return item;
  const par3 = item && item.hcapPar3;
  const par4 = item && item.hcapPar4;
  const par5 = item && item.hcapPar5;
  if (Number(par3) || Number(par4) || Number(par5)) {
    return {
      hcapList: [makeHcapItem({ par3: par3, par4: par4, par5: par5 }, gameHoles)]
    };
  }
  return item;
}

function decoratePlayersHcap(players, gameHoles) {
  return (players || []).map(function (item) {
    return decoratePairHcap(item, playerHcapSrc(item, gameHoles), gameHoles, false);
  });
}

function lasuoHcapRowsOf(players) {
  const rows = [];
  (players || []).forEach(function (item) {
    if (!item || item.selected === false) return;
    (item.hcapList || []).forEach(function (hcap, hidx) {
      rows.push(
        Object.assign({}, faceOf(item), {
          rowKey: String(item.id) + "-" + hidx,
          id: item.id,
          hidx: hidx,
          hcapText: (hcap && hcap.hcapText) || ""
        })
      );
    });
  });
  return rows;
}

function lasuoHcapCanAdd(players) {
  return (players || []).some(function (item) {
    return item && item.selected !== false && !item.hcapAddOff;
  });
}

function lasuoHcapPatch(players) {
  const lasuoHcapRows = lasuoHcapRowsOf(players);
  return {
    lasuoHcapRows: lasuoHcapRows,
    lasuoHcapText: lasuoHcapRows.length
      ? lasuoHcapRows.length === 1
        ? lasuoHcapRows[0].name + " · " + lasuoHcapRows[0].hcapText
        : lasuoHcapRows.length + "项让杆"
      : "无让杆",
    lasuoHcapCanAdd: lasuoHcapCanAdd(players)
  };
}

function hasHcapSetup(players, pairs) {
  const fromPlayers = (players || []).some(function (item) {
    return item && item.selected !== false && item.hcapList && item.hcapList.length;
  });
  if (fromPlayers) return true;
  return (pairs || []).some(function (item) {
    if (!item || item.on === false) return false;
    if (item.hcapList && item.hcapList.length) return true;
    const raw = String(item.strokes == null || item.strokes === "" ? "0" : item.strokes).trim();
    return raw !== "0" && raw !== "";
  });
}

function hasScoreGive(players, defaultCode) {
  const def = String(defaultCode || "8421");
  return (players || []).some(function (item) {
    if (!item || item.selected === false) return false;
    const raw = String(item.scoreCode == null || item.scoreCode === "" ? def : item.scoreCode);
    return raw !== def;
  });
}

function rankFromPage(page, players, pairs, rankId) {
  return rankPatch(
    page.data.showLandlordGroup,
    players,
    pairs,
    rankId != null ? rankId : page.data.rankId,
    page.data.defaultScoreCode
  );
}

function rankPatch(showLandlord, players, pairs, rankId, defaultScoreCode) {
  const base = showLandlord ? catalog.LANDLORD_RANK_OPTIONS : catalog.RANK_OPTIONS;
  let rankOptions = hasHcapSetup(players, pairs) ? base.concat(catalog.NET_RANK_OPTIONS) : base.slice();
  if (hasScoreGive(players, defaultScoreCode)) {
    rankOptions = rankOptions.concat(catalog.POINTS_RANK_OPTIONS);
  }
  const ok = rankOptions.some(function (item) {
    return item.id === rankId;
  });
  return {
    rankOptions: rankOptions,
    rankId: ok ? rankId : "gross-origin",
    rankFoldText: labelOf(rankOptions, ok ? rankId : "gross-origin")
  };
}

function decoratePairHcap(pair, src, gameHoles, noHoles) {
  if (noHoles) {
    const hcapList = readHcapList(src || pair, gameHoles, true);
    return Object.assign({}, pair, {
      hcapList: hcapList,
      hcapAddOff: (hcapList || []).length >= 1
    });
  }
  const hcapList = pruneHcapList(readHcapList(src || pair, gameHoles), gameHoles);
  const taken = assignedLabels(hcapList, -1);
  const base = baseHoleLabels(gameHoles);
  let used = 0;
  base.forEach(function (label) {
    if (taken[label]) used += 1;
  });
  return Object.assign({}, pair, {
    hcapList: hcapList,
    hcapAddOff: !base.length || used >= base.length
  });
}

function pruneHcapList(list, gameHoles) {
  if (!list || !list.length) return [];
  const labels = baseHoleLabels(gameHoles);
  const taken = {};
  const out = [];
  list.forEach(function (cfg, i) {
    const holes = labels.map(function (label) {
      const hit = (cfg.hcapHoles || []).find(function (hole) {
        return hole.label === label;
      });
      const on = !!(hit && hit.on) && (i === 0 || !taken[label]);
      return { label: label, on: on };
    });
    const next = makeHcapItem(Object.assign({}, cfg, { hcapHoles: holes }), gameHoles);
    if (i > 0 && hcapHoleCount(next.hcapHoles) < 1) return;
    next.hcapHoles.forEach(function (hole) {
      if (hole.on) taken[hole.label] = true;
    });
    out.push(next);
  });
  return out;
}

function holesForHcapForm(list, editIndex, current, gameHoles) {
  const taken = editIndex === 0 ? {} : assignedLabels(list, editIndex);
  return baseHoleLabels(gameHoles).map(function (label) {
    const locked = !!taken[label];
    const hit = ((current && current.hcapHoles) || []).find(function (hole) {
      return hole.label === label;
    });
    let on = false;
    if (locked) on = false;
    else if (hit) on = !!hit.on;
    else if (editIndex < 0) on = true;
    return { label: label, on: on, locked: locked };
  });
}

function shuffleIds(ids) {
  const arr = (ids || []).slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function syncPlayerOrder(players, prevOrder, sortMode, forceShuffle, pinLast, zoneMasterCount) {
  const selected = (players || []).filter(function (item) {
    return item.selected;
  });
  const keep = (prevOrder || []).filter(function (id) {
    return selected.some(function (item) {
      return item.id === id;
    });
  });
  selected.forEach(function (item) {
    if (keep.indexOf(item.id) < 0) keep.push(item.id);
  });
  if (sortMode === "hcp") {
    if (pinLast && keep.length >= 4) {
      const fixed = keep[keep.length - 1];
      const head = keep.slice(0, -1).map(function (id) {
        return selected.find(function (item) {
          return item.id === id;
        });
      }).filter(Boolean);
      head.sort(function (a, b) {
        return Number(a.hcp || 99) - Number(b.hcp || 99);
      });
      return head
        .map(function (item) {
          return item.id;
        })
        .concat(fixed);
    }
    return selected
      .slice()
      .sort(function (a, b) {
        return Number(a.hcp || 99) - Number(b.hcp || 99);
      })
      .map(function (item) {
        return item.id;
      });
  }
  if (sortMode === "random" && (forceShuffle || (keep.length >= 3 && (prevOrder || []).length < 3))) {
    const zoneN = Math.max(0, Number(zoneMasterCount) || 0);
    // 高手不见面：高手区 / 低手区各自随机，互不串区
    if (zoneN > 0 && zoneN < keep.length) {
      return shuffleIds(keep.slice(0, zoneN)).concat(shuffleIds(keep.slice(zoneN)));
    }
    if (pinLast && keep.length >= 4) {
      const fixed = keep[keep.length - 1];
      return shuffleIds(keep.slice(0, -1)).concat(fixed);
    }
    return shuffleIds(keep);
  }
  return keep;
}

function orderedPlayersOf(players, order) {
  const map = {};
  (players || []).forEach(function (item) {
    if (item.selected) map[item.id] = item;
  });
  const out = [];
  (order || []).forEach(function (id) {
    if (map[id]) {
      out.push(map[id]);
      delete map[id];
    }
  });
  Object.keys(map).forEach(function (id) {
    out.push(map[id]);
  });
  return out;
}

const TRI_BLUE = "#007AFF";
const TRI_RED = "#FF3B30";

function usesLasuoGroupUi(catalogId) {
  return catalog.isLasuo4(catalogId) || catalog.is8421Four(catalogId) || catalog.isVegas(catalogId);
}

function hideSplitHighGroup(catalogId) {
  return (
    catalog.isLandlordMid(catalogId) ||
    catalog.isLandlordSmall(catalogId) ||
    catalog.is8421Three(catalogId)
  );
}

function groupModesOf(catalogId, showLandlordGroup) {
  if (catalog.isDizhubo4(catalogId)) return catalog.DIZHUBO_GROUP_MODES;
  if (usesLasuoGroupUi(catalogId)) return catalog.GROUP_MODES;
  if (showLandlordGroup) {
    if (hideSplitHighGroup(catalogId)) {
      return catalog.LANDLORD_GROUP_MODES.filter(function (item) {
        return item.id !== "split-high";
      });
    }
    return catalog.LANDLORD_GROUP_MODES;
  }
  return catalog.GROUP_MODES;
}

function comboKind(catalogId) {
  if (catalog.isLandlordMid(catalogId) || catalog.is8421Three(catalogId)) return "mid";
  if (catalog.isLandlordSmall(catalogId)) return "small";
  if (catalog.isLandlordBig(catalogId)) return "big";
  return "";
}

function triColorOf(catalogId, n, groupMode, i, dizhuboMode) {
  if (catalog.isThreeVsOne(catalogId)) return i === 0 ? TRI_BLUE : TRI_RED;
  if (catalog.isDizhubo4(catalogId)) {
    if (dizhuboMode === "mid") return i === 0 || i === 2 ? TRI_BLUE : TRI_RED;
    return i === 0 || i === 3 ? TRI_BLUE : TRI_RED;
  }
  const isFixed = groupMode === "fixed";
  const kind = comboKind(catalogId);
  if (n === 3) {
    if (kind === "mid") return i === 1 ? TRI_RED : TRI_BLUE;
    if (kind === "small") return i === 2 ? TRI_RED : TRI_BLUE;
    return i === 0 ? TRI_BLUE : TRI_RED;
  }
  if (n >= 4) {
    if (isFixed) return i < 2 ? TRI_BLUE : TRI_RED;
    return i === 0 || i === 3 ? TRI_BLUE : TRI_RED;
  }
  return i === 0 ? TRI_BLUE : TRI_RED;
}

const TRI_BYE = "#8E8E93";
const TRI_GOLD = "#ce9224";

/** 多人拉丝：按江湖/海岛编队为每位排序位分配 A/B（奇数末位轮空） */
function lasuoNTeamByIndex(n, formation) {
  const total = Number(n) || 0;
  const sides = [];
  for (let i = 0; i < total; i++) sides.push("bye");
  const m = total % 2 === 0 ? total : Math.max(0, total - 1);
  if (m < 2) return sides;
  if (formation === "haidao") {
    if (m >= 4) {
      sides[0] = "A";
      sides[1] = "B";
      sides[2] = "B";
      sides[3] = "A";
      for (let i = 4; i < m; i++) {
        sides[i] = (i + 1) % 2 === 0 ? "A" : "B";
      }
    } else {
      sides[0] = "A";
      sides[1] = "B";
    }
    return sides;
  }
  let groupNo = 0;
  for (let start = 0; start < m; start += 4) {
    const size = Math.min(4, m - start);
    const oddGroup = groupNo % 2 === 0;
    if (size === 4) {
      if (oddGroup) {
        sides[start] = "A";
        sides[start + 1] = "B";
        sides[start + 2] = "B";
        sides[start + 3] = "A";
      } else {
        sides[start] = "B";
        sides[start + 1] = "A";
        sides[start + 2] = "A";
        sides[start + 3] = "B";
      }
    } else if (size === 2) {
      // 末组剩余 2 人：A={p2} B={p1}；独立 2 人集合（含第 1 名）：A={p1} B={p2}，保证第 1 名蓝三角
      if (start === 0) {
        sides[start] = "A";
        sides[start + 1] = "B";
      } else {
        sides[start] = "B";
        sides[start + 1] = "A";
      }
    }
    groupNo += 1;
  }
  return sides;
}

function lasuoNFormTeamLists(orderedIds, formation) {
  const ids = orderedIds || [];
  const sides = lasuoNTeamByIndex(ids.length, formation);
  const A = [];
  const B = [];
  ids.forEach(function (id, i) {
    if (sides[i] === "A") A.push(id);
    else if (sides[i] === "B") B.push(id);
  });
  return { A: A, B: B };
}

/**
 * 集合人数为奇数时：该集合当前排序末位轮空（容错），余下偶数再编队。
 */
function groupEvenizeIds(orderedIds) {
  const ids = (orderedIds || []).slice();
  if (ids.length % 2 === 1 && ids.length > 0) {
    return {
      active: ids.slice(0, -1),
      byeId: ids[ids.length - 1]
    };
  }
  return { active: ids, byeId: null };
}

/**
 * 多人拉丝队属预览：
 * - 所有一起：整队按编队规则分 A/B，奇数末位轮空
 * - 高手不见面：低/高两个集合各自编队；集合奇数则末位轮空；
 *   再交叉 A = A_low ∪ B_high，B = B_low ∪ A_high（高手只与高手 PK，低手只与低手 PK）
 */
function lasuoNSideMap(orderedRows, formation, opts) {
  const rows = orderedRows || [];
  const map = {};
  const form = formation || "jianghu";
  if (!opts || opts.bandMode !== "split-high") {
    const sides = lasuoNTeamByIndex(rows.length, form);
    rows.forEach(function (item, i) {
      map[item.id] = sides[i] || "bye";
    });
    return map;
  }
  const bandMap = opts.bandMap || {};
  const lowOrdered = rows.filter(function (item) {
    return bandMap[item.id] !== "high";
  });
  const highOrdered = rows.filter(function (item) {
    return bandMap[item.id] === "high";
  });
  const lowEv = groupEvenizeIds(
    lowOrdered.map(function (item) {
      return item.id;
    })
  );
  const highEv = groupEvenizeIds(
    highOrdered.map(function (item) {
      return item.id;
    })
  );
  const lowLists = lasuoNFormTeamLists(lowEv.active, form);
  const highLists = lasuoNFormTeamLists(highEv.active, form);
  const Aset = {};
  const Bset = {};
  lowLists.A.forEach(function (id) {
    Aset[id] = 1;
  });
  highLists.B.forEach(function (id) {
    Aset[id] = 1;
  });
  lowLists.B.forEach(function (id) {
    Bset[id] = 1;
  });
  highLists.A.forEach(function (id) {
    Bset[id] = 1;
  });
  rows.forEach(function (item) {
    if (item.id === lowEv.byeId || item.id === highEv.byeId) map[item.id] = "bye";
    else if (Aset[item.id]) map[item.id] = "A";
    else if (Bset[item.id]) map[item.id] = "B";
    else map[item.id] = "bye";
  });
  return map;
}

function hornMeta(n) {
  const total = Number(n) || 0;
  const hasBye = total > 0 && total % 2 === 0;
  const m = hasBye ? total - 1 : total;
  const flowerPos = m > 0 ? (m + 1) / 2 : 0;
  return {
    total: total,
    hasBye: hasBye,
    m: m,
    flowerPos: flowerPos,
    lasuoCount: Math.max(0, m - 1)
  };
}

function hornPairMatches(totalN, formation) {
  const meta = hornMeta(totalN);
  const form = formation === "haidao" ? "haidao" : "jianghu";
  const nos = [];
  for (let i = 1; i <= meta.m; i++) {
    if (i !== meta.flowerPos) nos.push(i);
  }
  const lists = lasuoNFormTeamLists(nos, form);
  const out = [];
  const len = Math.min(lists.A.length, lists.B.length);
  for (let i = 0; i < len; i++) {
    out.push({ aNo: lists.A[i], bNo: lists.B[i] });
  }
  return out;
}

function hornSideMap(orderedRows, formation) {
  const rows = orderedRows || [];
  const map = {};
  const meta = hornMeta(rows.length);
  const form = formation || "jianghu";
  if (meta.hasBye && rows.length) {
    map[rows[rows.length - 1].id] = "bye";
  }
  const remainingIds = [];
  rows.slice(0, meta.m).forEach(function (item, i) {
    if (i + 1 === meta.flowerPos) map[item.id] = "flower";
    else remainingIds.push(item.id);
  });
  const sides = lasuoNTeamByIndex(remainingIds.length, form);
  remainingIds.forEach(function (id, i) {
    map[id] = sides[i] || "bye";
  });
  return map;
}

function hornPushTextOf(pushRule) {
  return pushRule === "none" ? "禁用" : "启用";
}

function lasuoNTriColorOf(side) {
  if (side === "A") return TRI_BLUE;
  if (side === "B") return TRI_RED;
  if (side === "flower") return TRI_GOLD;
  return TRI_BYE;
}

function pageLasuoNOpts(data) {
  if (!data || !(data.showLasuoN || data.showHorn)) return null;
  if (data.showHorn) {
    return {
      bandMode: "all",
      bandMap: {},
      bandLow: data.bandLow,
      bandHigh: data.bandHigh,
      horn: true,
      sortUpdate: data.sortUpdate || "dynamic"
    };
  }
  return {
    bandMode: data.bandMode || "all",
    bandMap: data.bandMap || {},
    bandLow: data.bandLow,
    bandHigh: data.bandHigh,
    sortUpdate: data.sortUpdate || "dynamic"
  };
}

function lasuoNCallOpts(data, extra) {
  return Object.assign(
    {
      pairCoeffs: data.pairCoeffs,
      bandLow: data.bandLow,
      bandHigh: data.bandHigh,
      bandMap: data.bandMap,
      lasuoNMulRows: data.lasuoNMulRows,
      rewardOn: data.rewardOn,
      totalPkKt: data.totalPkKt,
      flowerK: data.flowerK,
      bandMode: data.showHorn ? "all" : data.bandMode,
      formation: data.formation,
      horn: !!data.showHorn
    },
    extra || {}
  );
}

function teamRoleOf(catalogId, n, i) {
  if (catalog.isThreeVsOne(catalogId) || catalog.isDizhubo4(catalogId)) return "";
  if (n !== 3) return "";
  const kind = comboKind(catalogId);
  if (kind === "mid") return i === 1 ? "单人队" : "双人队";
  if (kind === "small") return i === 2 ? "单人队" : "双人队";
  return i === 0 ? "单人队" : "双人队";
}

function showFixedPairsOf(groupMode, orderedPlayers, catalogId, lasuoNOpts) {
  const n = (orderedPlayers || []).length;
  if (catalog.isDizhubo4(catalogId)) return false;
  if (groupMode === "fixed" && n >= 4) return true;
  if (
    (catalog.isLasuoN(catalogId) || catalog.isHorn(catalogId)) &&
    lasuoNOpts &&
    lasuoNOpts.sortUpdate === "fixed" &&
    n >= 2
  ) {
    return true;
  }
  return false;
}

/** 固拉队线分段：喇叭花固拉在中间花位留白，线段只盖本队 */
function buildPairRailSegs(orderedPlayers, catalogId, lasuoNOpts) {
  const n = (orderedPlayers || []).length;
  if (
    catalog.isHorn(catalogId) &&
    lasuoNOpts &&
    lasuoNOpts.sortUpdate === "fixed" &&
    n >= 2
  ) {
    const meta = hornMeta(n);
    const flowerIdx = Math.max(0, meta.flowerPos - 1);
    const blue = flowerIdx;
    const red = Math.max(0, meta.m - meta.flowerPos);
    const segs = [];
    if (blue > 0) segs.push({ id: "a", cls: "order-pair-line--a", flex: blue });
    segs.push({ id: "gap-flower", cls: "order-pair-line--gap", flex: 1 });
    if (red > 0) segs.push({ id: "b", cls: "order-pair-line--b", flex: red });
    if (meta.hasBye) segs.push({ id: "gap-bye", cls: "order-pair-line--gap", flex: 1 });
    return segs;
  }
  return [
    { id: "a", cls: "order-pair-line--a", flex: 1 },
    { id: "b", cls: "order-pair-line--b", flex: 1 }
  ];
}

function decorateOrderRows(players, order, groupMode, catalogId, dizhuboMode, formation, lasuoNOpts) {
  const rows = orderedPlayersOf(players, order);
  const n = rows.length;
  const isFixed = groupMode === "fixed";
  const isHigh = groupMode === "split-high";
  const isTvo = catalog.isThreeVsOne(catalogId);
  const isDizhubo = catalog.isDizhubo4(catalogId);
  const isLasuoN = catalog.isLasuoN(catalogId);
  const isHorn = catalog.isHorn(catalogId);
  const isLasuoFamily = isLasuoN || isHorn;
  const familyFixed =
    isLasuoFamily && lasuoNOpts && lasuoNOpts.sortUpdate === "fixed";
  const hideNum = (isFixed && n >= 4) || familyFixed;
  const splitHigh = !!(lasuoNOpts && lasuoNOpts.bandMode === "split-high") && !familyFixed;
  const masterCount = splitHigh ? Math.max(0, Number(lasuoNOpts.bandLow) || 0) : 0;
  // 高手不见面：出发顺序前 N 名视为低差点组，其余为高差点组
  let opts = lasuoNOpts;
  if (isLasuoN && splitHigh) {
    const bandMap = {};
    rows.forEach(function (item, i) {
      bandMap[item.id] = i < masterCount ? "low" : "high";
    });
    opts = Object.assign({}, lasuoNOpts, { bandMap: bandMap });
  }
  const sideMap =
    isHorn && !familyFixed
      ? hornSideMap(rows, formation || "jianghu")
      : isLasuoN && !familyFixed
        ? lasuoNSideMap(rows, formation || "jianghu", opts)
        : null;
  const fixedActive = familyFixed && isLasuoN ? (n % 2 === 0 ? n : Math.max(0, n - 1)) : 0;
  const fixedHalf = fixedActive / 2;
  const flowerMeta = isHorn ? hornMeta(n) : null;
  const flowerIdx = flowerMeta ? flowerMeta.flowerPos - 1 : -1;
  return rows.map(function (item, i) {
    const side = sideMap ? sideMap[item.id] || "bye" : "";
    const hornRole =
      side === "flower" ? "喇叭花" : side === "A" ? "A队" : side === "B" ? "B队" : "轮空";
    let triColor;
    let teamRole;
    let showBye = false;
    let showFlower = false;
    if (familyFixed && isHorn && flowerMeta) {
      if (flowerMeta.hasBye && i === n - 1) {
        showBye = true;
        triColor = TRI_BYE;
        teamRole = "轮空";
      } else if (i === flowerIdx) {
        showFlower = true;
        triColor = TRI_GOLD;
        teamRole = "喇叭花";
      } else if (i < flowerIdx) {
        triColor = TRI_BLUE;
        teamRole = "蓝队";
      } else {
        triColor = TRI_RED;
        teamRole = "红队";
      }
    } else if (familyFixed) {
      const isBye = n % 2 === 1 && i === n - 1;
      showBye = isBye;
      triColor = isBye ? TRI_BYE : i < fixedHalf ? TRI_BLUE : TRI_RED;
      teamRole = isBye ? "轮空" : i < fixedHalf ? "蓝队" : "红队";
    } else if (isLasuoFamily) {
      triColor = lasuoNTriColorOf(side);
      teamRole = isHorn
        ? hornRole
        : side === "A"
          ? "A队"
          : side === "B"
            ? "B队"
            : "轮空";
      showBye = side === "bye";
      showFlower = isHorn && side === "flower";
    } else {
      triColor = triColorOf(catalogId, n, groupMode, i, dizhuboMode);
      teamRole = teamRoleOf(catalogId, n, i);
    }
    return Object.assign({}, faceOf(item), {
      orderNo: i + 1,
      hideNum: hideNum,
      triColor: triColor,
      showHigh: isLasuoN ? splitHigh && i < masterCount : isHigh && i < 2,
      showTiger: isTvo && i === 0,
      showDizhuboTag: isDizhubo && i === 3,
      showFlower: showFlower,
      showBye: showBye,
      showLowBand: false,
      showHighBand: false,
      teamRole: teamRole
    });
  });
}

function isSetupRestReady(isThreePlayer, playerPickLocked, players, needPlayers, usePagePick, showLasuoN, showHorn, teamedPartyMode, partyPickExact, ruleId, formationParties) {
  if (playerPickLocked) return true;
  const n = (players || []).filter(function (item) {
    return item.selected;
  }).length;
  if (teamedPartyMode) {
    if (catalog.isAllPairsOneVsOneCatalog(ruleId)) {
      if (n < 2) return false;
      const ids = (players || [])
        .filter(function (item) {
          return item.selected;
        })
        .map(function (item) {
          return item.id;
        });
      return partyFormation.isSelectionCompatible(formationParties, ids, ruleId);
    }
    const need = Number(partyPickExact) || 0;
    if (!(need > 0) || n !== need) return false;
    const ids = (players || [])
      .filter(function (item) {
        return item.selected;
      })
      .map(function (item) {
        return item.id;
      });
    return partyFormation.isSelectionCompatible(formationParties, ids, ruleId);
  }
  if (showHorn) return n >= 5;
  if (showLasuoN) return n >= 5;
  if (catalog.isAllPairsOneVsOneCatalog(ruleId)) return n >= 2;
  if (isThreePlayer) return n === Number(needPlayers || 3);
  if (usePagePick) {
    const req = Number(needPlayers) || 0;
    if (req >= 2 && req <= 4) return n === req;
    return n >= 2;
  }
  const req = Number(needPlayers) || 0;
  if (req >= 2 && req <= 4) return n === req;
  return n >= 2;
}

function partySelectCap(data) {
  if (!data || data.showLasuoFamily || data.showTwoParty) return 0;
  if (data.isThreePlayer) return Number(data.needPlayers) || 0;
  const need = Number(data.needPlayers) || 0;
  const max = Number(data.maxPlayers) || 0;
  if (need > 0 && max > 0) return Math.min(need, max);
  return need || max;
}

function splitHighZoneCount(groupMode, selectedCount, lasuoNOpts) {
  if (lasuoNOpts && lasuoNOpts.bandMode === "split-high") {
    return Math.max(0, Number(lasuoNOpts.bandLow) || 0);
  }
  if (groupMode === "split-high") {
    const n = Number(selectedCount) || 0;
    // 四人乱拉族：前 2 名高手、后 2 名低手，随机只在各自集合内打乱
    if (n >= 4) return 2;
  }
  return 0;
}

function orderPatch(players, prevOrder, sortMode, groupMode, forceShuffle, catalogId, dizhuboMode, formation, lasuoNOpts) {
  const pinLast = catalog.isDizhubo4(catalogId);
  const selectedN = (players || []).filter(function (item) {
    return item.selected;
  }).length;
  const zoneMaster = splitHighZoneCount(groupMode, selectedN, lasuoNOpts);
  const playerOrder = syncPlayerOrder(
    players,
    prevOrder,
    sortMode,
    forceShuffle,
    pinLast,
    zoneMaster
  );
  const orderedPlayers = decorateOrderRows(
    players,
    playerOrder,
    groupMode,
    catalogId,
    dizhuboMode,
    formation,
    lasuoNOpts
  );
  const showFixedPairs = showFixedPairsOf(groupMode, orderedPlayers, catalogId, lasuoNOpts);
  return {
    playerOrder: playerOrder,
    orderedPlayers: orderedPlayers,
    sortMode: sortMode,
    showFixedPairs: showFixedPairs,
    pairRailSegs: showFixedPairs
      ? buildPairRailSegs(orderedPlayers, catalogId, lasuoNOpts)
      : []
  };
}

function isPartyMatchupRule(ruleId) {
  const cap = partyFormation.ruleCapability(ruleId);
  return cap && (cap.matchupMode === "party-matchup" || cap.matchupMode === "party-matchup");
}

function indexPrevPairs(prevPairs) {
  const prev = {};
  (prevPairs || []).forEach(function (item) {
    if (!item) return;
    prev[item.id] = item;
    const lid = item.leftId != null ? String(item.leftId) : String(item.leftPartyId || "");
    const rid = item.rightId != null ? String(item.rightId) : String(item.rightPartyId || "");
    if (lid && rid) {
      prev[lid + "|" + rid] = item;
      // 反向键：换边时让杆反号（油菜/比杆组合级让杆；三局三段一并反号）
      const flippedSeg = flipPairSegmentHandicaps(item);
      const flipped = Object.assign({}, item, {
        id: rid + "|" + lid,
        leftId: rid,
        rightId: lid,
        leftPartyId: rid,
        rightPartyId: lid,
        strokes:
          item.strokes != null && item.strokes !== ""
            ? String(-Number(item.strokes) || 0)
            : item.handicap != null && item.handicap !== ""
              ? String(-Number(item.handicap) || 0)
              : "0",
        handicap:
          item.handicap != null && item.handicap !== ""
            ? String(-Number(item.handicap) || 0)
            : item.strokes != null && item.strokes !== ""
              ? String(-Number(item.strokes) || 0)
              : "0",
        hcapList: flipHcapListSigns(item.hcapList),
        segFront: flippedSeg.front,
        segBack: flippedSeg.back,
        segOverall: flippedSeg.overall,
        segmentHandicaps: {
          front: flippedSeg.front,
          back: flippedSeg.back,
          overall: flippedSeg.overall
        },
        __flippedFrom: item.id || lid + "|" + rid
      });
      if (!prev[rid + "|" + lid]) prev[rid + "|" + lid] = flipped;
    }
  });
  return prev;
}

function hydratePairFromPrev(raw, prev, gameHoles, noHoles) {
  const leftId = raw.leftId != null ? raw.leftId : raw.leftPartyId;
  const rightId = raw.rightId != null ? raw.rightId : raw.rightPartyId;
  const hit = prev[raw.id] || prev[String(leftId) + "|" + String(rightId)];
  const strokeRaw =
    hit && hit.strokes != null && hit.strokes !== ""
      ? String(hit.strokes)
      : hit && hit.handicap != null && hit.handicap !== ""
        ? String(hit.handicap)
        : "0";
  const basePair = pairFaces({
    id: raw.id || String(leftId) + "|" + String(rightId),
    leftId: leftId,
    rightId: rightId,
    leftPartyId: raw.leftPartyId || leftId,
    rightPartyId: raw.rightPartyId || rightId,
    on: hit ? hit.on !== false : raw.on !== false,
    strokes: strokeRaw,
    handicap: strokeRaw
  });
  if (hit && (hit.segmentHandicaps || hit.segFront != null || hit.segBack != null || hit.segOverall != null)) {
    Object.assign(basePair, attachPairSegmentFields(hit, readPairSegmentHandicaps(hit)));
  }
  return decoratePairHcap(basePair, hit, gameHoles, noHoles);
}

/** 编队两方：已选组合之间生成 party vs party 对决（不拆球员） */
function buildPartyPairsFromSelection(formationParties, selectedPartyIds, prevPairs, gameHoles, noHoles) {
  const want = {};
  (selectedPartyIds || []).forEach(function (id) {
    want[String(id)] = true;
  });
  const picked = (formationParties || []).filter(function (p) {
    return p && want[String(p.partyId)];
  });
  const raw = partyFormation.buildPartyMatchups(picked);
  const prev = indexPrevPairs(prevPairs);
  return raw.map(function (item) {
    return hydratePairFromPrev(item, prev, gameHoles, noHoles);
  });
}

function buildPairs(players, prevPairs, gameHoles, noHoles) {
  const selected = (players || []).filter(function (item) {
    return item.selected;
  });
  const prev = indexPrevPairs(prevPairs);
  const pairs = [];
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      const id = pairId(selected[i], selected[j]);
      pairs.push(
        hydratePairFromPrev(
          {
            id: id,
            leftId: selected[i].id,
            rightId: selected[j].id,
            leftPartyId: selected[i].id,
            rightPartyId: selected[j].id,
            on: true
          },
          prev,
          gameHoles,
          noHoles
        )
      );
    }
  }
  return pairs;
}
function comboCount(n) {
  const m = Number(n) || 0;
  return m > 1 ? (m * (m - 1)) / 2 : 0;
}

/** 多人拉丝人选超过 8：参与人员 / 初始排序改为折叠面板 */
function lasuoNManyPlayersOf(showFamily, selectedCount) {
  return !!showFamily && Number(selectedCount) > 8;
}

function isRosterCompact(showTwoParty, selectedCount) {
  return !!showTwoParty && Number(selectedCount) > 8;
}

function twoPartyPairsPatch(showTwoParty, players, prevPairs, holes, hcapNoHoles, opts) {
  if (!showTwoParty) {
    return { pairs: [], pairCount: 0, rosterCompact: false };
  }
  const selected = (players || []).filter(function (item) {
    return item.selected;
  });
  const n = selected.length;
  const rosterCompact = isRosterCompact(true, n);
  if (rosterCompact) {
    return {
      pairs: [],
      pairCount: comboCount(n),
      rosterCompact: true
    };
  }
  let pairs;
  if (opts && opts.partyMatchup && opts.formationParties && opts.formationParties.length) {
    pairs = buildPartyPairsFromSelection(
      opts.formationParties,
      selected.map(function (item) {
        return item.id;
      }),
      prevPairs || [],
      holes,
      hcapNoHoles
    );
    // 编队组合对决默认全开；锁定时强制不可关
    if (opts.matchupLocked) {
      pairs = pairs.map(function (item) {
        return Object.assign({}, item, { on: true });
      });
    }
  } else {
    pairs = buildPairs(players, prevPairs || [], holes, hcapNoHoles);
  }
  // 三局：主体集合变化后重建，强制全部勾选（保留重叠对的让杆等字段）
  if (opts && opts.forceAllOn) {
    pairs = pairs.map(function (item) {
      return Object.assign({}, item, { on: true });
    });
  }
  return {
    pairs: pairs,
    pairCount: pairs.filter(function (item) {
      return item.on;
    }).length,
    rosterCompact: false
  };
}

/** 三局专用：主体集合未变则保留 PK；变化则两两重建并全选 */
function threeSetPairsPatch(page, players, prevPairs) {
  const action = threeSetPairReset.resolveThreeSetPairAction(page.data.players, players);
  if (action.keepPairs) {
    const kept = prevPairs || page.data.pairs || [];
    return {
      pairs: kept,
      pairCount: kept.filter(function (item) {
        return item && item.on;
      }).length,
      rosterCompact: !!page.data.rosterCompact
    };
  }
  let pairUi = twoPartyPairsPatch(
    true,
    players,
    prevPairs || [],
    page.data.holes,
    page.data.hcapNoHoles,
    Object.assign(
      {},
      partyMatchupOptsFrom(
        page.data.teamedPartyMode,
        page.data.ruleId,
        page.data.formationParties,
        !!page.data.matchupLocked
      ) || {},
      { forceAllOn: true }
    )
  );
  if (page.data.teamedPartyMode && (page.data.formationParties || []).length) {
    const faceById = {};
    (page.data.formationParties || []).forEach(function (p) {
      faceById[String(p.partyId)] = session.buildParticipantSubject(p, {
        selected: true,
        required: false
      });
    });
    pairUi.pairs = (pairUi.pairs || []).map(function (pair) {
      return pairFaces(
        Object.assign({}, pair, {
          leftSubject: faceById[String(pair.leftId || pair.leftPartyId)],
          rightSubject: faceById[String(pair.rightId || pair.rightPartyId)],
          leftPartyId: pair.leftPartyId || pair.leftId,
          rightPartyId: pair.rightPartyId || pair.rightId
        })
      );
    });
  }
  pairUi.pairs = decorateThreeSetPairRows(pairUi.pairs);
  return pairUi;
}

function partyMatchupOptsFrom(teamedPartyMode, ruleId, formationParties, matchupLocked) {
  if (!teamedPartyMode || !isPartyMatchupRule(ruleId)) return null;
  return {
    partyMatchup: true,
    matchupLocked: !!matchupLocked,
    formationParties: formationParties || []
  };
}

function isIntStrokes(value) {
  return /^-?(0|[1-9]\d*)$/.test(String(value == null ? "" : value).trim());
}

function isHalfStrokes(value) {
  const raw = String(value == null ? "" : value).trim();
  return /^-?(0|[1-9]\d*)(\.5)?$/.test(raw);
}

function scoreToneOf(code, defaultCode) {
  const def = String(defaultCode || "8421");
  const raw = String(code == null || code === "" ? def : code);
  if (raw === def) return "default";
  const n = Number(raw);
  const d = Number(def);
  if (!isFinite(n) || !isFinite(d)) return "default";
  if (n < d) return "low";
  if (n > d) return "high";
  return "default";
}

function withScoreTones(players, defaultCode) {
  return (players || []).map(function (item) {
    return Object.assign({}, item, {
      scoreTone: scoreToneOf(item.scoreCode, defaultCode)
    });
  });
}

function mergeScoreFields(selected, players) {
  const byId = {};
  (players || []).forEach(function (item) {
    if (item && item.id != null) byId[String(item.id)] = item;
  });
  return (selected || []).map(function (item) {
    const src = byId[String(item.id)];
    if (!src) return item;
    return Object.assign({}, item, {
      scoreCode: src.scoreCode != null && src.scoreCode !== "" ? src.scoreCode : item.scoreCode,
      scoreRows: takeScoreRows(src, item),
      scoreOverrides: Object.prototype.hasOwnProperty.call(src, "scoreOverrides")
        ? src.scoreOverrides
        : item.scoreOverrides
    });
  });
}

function isNonNegInt(value) {
  return /^(0|[1-9]\d*)$/.test(String(value == null ? "" : value).trim());
}

function deductThumb(d) {
  if (!d || d.deductMode === "none") return "";
  const way =
    d.deductWay === "doublepar-n"
      ? catalog.doubleParMark(d.deductDoubleN)
      : "从+" + (d.deductPlusN || "4");
  const cap = d.deductCap === "cap" ? (d.deductCapN || "3") + "分封顶" : "不封顶";
  return way + " · " + cap;
}

function pickPlayerScoreMeta(src) {
  if (!src) return {};
  const out = {};
  if (src.scoreCode != null && src.scoreCode !== "") out.scoreCode = src.scoreCode;
  if (Object.prototype.hasOwnProperty.call(src, "scoreRows")) out.scoreRows = src.scoreRows;
  if (src.scoreOverrides) out.scoreOverrides = src.scoreOverrides;
  return out;
}

function takeScoreRows(primary, fallback) {
  if (primary && Object.prototype.hasOwnProperty.call(primary, "scoreRows")) return primary.scoreRows;
  if (fallback && Object.prototype.hasOwnProperty.call(fallback, "scoreRows")) return fallback.scoreRows;
  return null;
}

const PAGE_FOLD_FIELDS = [
  "lasuoFoldHcap",
  "rankFold",
  "foldDeduct",
  "pairFold",
  "lasuoNFoldPk",
  "lasuoNFoldReward",
  "lasuoNFoldPush",
  "lasuoNFoldPlayers",
  "lasuoNFoldOrder",
  "lasuoNFoldBand",
  "lasuoNFoldFormation",
  "lasuoNFoldSort"
];

const LASUO_N_RANK_OPTIONS = [
  { id: "gross-origin", label: "按出身成绩排序" },
  { id: "gross-result", label: "成绩相同按输赢排序" }
];

const LASUO_N_MUL_DEFAULTS = [
  { id: "birdie", label: "小鸟", value: "2" },
  { id: "eagle", label: "老鹰", value: "5" },
  { id: "albatross", label: "信天翁 / HIO", value: "10" }
];

function pkCountOf(n) {
  const m = Number(n) || 0;
  return m % 2 === 0 ? m : Math.max(0, m - 1);
}

function hydrateLasuoNMulRows(saved) {
  return LASUO_N_MUL_DEFAULTS.map(function (row) {
    const hit = (saved || []).find(function (item) {
      return item && item.id === row.id;
    });
    return {
      id: row.id,
      label: row.label,
      value: hit && hit.value != null && hit.value !== "" ? String(hit.value) : row.value
    };
  });
}

function lasuoNRewardTextOf(rewardOn, rows) {
  if (!rewardOn) return "无奖励";
  const short = { birdie: "鸟", eagle: "鹰" };
  const parts = [];
  (rows || []).forEach(function (row) {
    if (!row || !short[row.id]) return;
    if (row.value == null || row.value === "") return;
    parts.push(short[row.id] + "*" + row.value);
  });
  return parts.length ? parts.join(" · ") : "乘法奖励";
}

function lasuoNPushTextOf(pushRule) {
  if (pushRule === "team-tie") return "两队积分打平";
  if (pushRule === "all-tie") return "所有PK均打平";
  return "无顶洞";
}

function lasuoNBandTextOf(bandMode) {
  return bandMode === "split-high" ? "高手不见面" : "所有一起";
}

function lasuoNFormationTextOf(formation) {
  return formation === "haidao" ? "海岛编队规则" : "江湖编队规则";
}

function lasuoNSortTextOf(sortUpdate, rankId) {
  if (sortUpdate === "fixed") return "固拉";
  const rankLabel = labelOf(LASUO_N_RANK_OPTIONS, rankId || "gross-origin");
  return "乱拉 · " + rankLabel;
}

function lasuoNPkTextOf(pairCoeffs, trailValue) {
  const ks = (pairCoeffs || [])
    .map(function (item) {
      return item.value == null || item.value === "" ? "1" : String(item.value);
    })
    .join("/");
  const trail = trailValue == null || trailValue === "" ? "0" : String(trailValue);
  return (ks ? ks : "") + "|" + trail;
}

function pagePkTrailOf(data) {
  if (data && data.showHorn) {
    return data.flowerK == null || data.flowerK === "" ? "1" : String(data.flowerK);
  }
  return data && data.totalPkKt != null && data.totalPkKt !== "" ? String(data.totalPkKt) : "0";
}

function normalizeLasuoNPushRule(raw) {
  if (raw === "team-tie" || raw === "all-tie") return raw;
  return "none";
}

/**
 * 按编队规则生成 1V1 对阵顺序号（蓝队 A 在前，红队 B 在后）。
 * 返回 [{ aNo, bNo }, ...]，编号为出发顺序名次（1-based）。
 */
function lasuoNPairMatches(totalN, formation, bandOpts) {
  const form = formation === "haidao" ? "haidao" : "jianghu";
  const n = Number(totalN) || 0;
  function matchesFromLists(A, B) {
    const out = [];
    const len = Math.min(A.length, B.length);
    for (let i = 0; i < len; i++) {
      out.push({ aNo: A[i], bNo: B[i] });
    }
    return out;
  }
  if (bandOpts && bandOpts.bandMode === "split-high") {
    const lowN = Math.max(0, Number(bandOpts.bandLow) || 0);
    const highN = Math.max(0, n - lowN);
    const lowNos = [];
    for (let i = 1; i <= lowN; i++) lowNos.push(i);
    const highNos = [];
    for (let i = lowN + 1; i <= lowN + highN; i++) highNos.push(i);
    const lowEv = groupEvenizeIds(lowNos);
    const highEv = groupEvenizeIds(highNos);
    const lowLists = lasuoNFormTeamLists(lowEv.active, form);
    const highLists = lasuoNFormTeamLists(highEv.active, form);
    // 交叉：A = A_low ∪ B_high，B = B_low ∪ A_high；先低后高再顺序配对
    return matchesFromLists(
      lowLists.A.concat(highLists.B),
      lowLists.B.concat(highLists.A)
    );
  }
  const m = pkCountOf(n);
  const nos = [];
  for (let i = 1; i <= m; i++) nos.push(i);
  const lists = lasuoNFormTeamLists(nos, form);
  return matchesFromLists(lists.A, lists.B);
}

function pairCoeffsOf(selectedCount, prevCoeffs, formation, bandOpts) {
  const matches =
    bandOpts && bandOpts.horn
      ? hornPairMatches(selectedCount, formation)
      : lasuoNPairMatches(selectedCount, formation, bandOpts);
  const prevList = prevCoeffs || [];
  const prev = {};
  prevList.forEach(function (item) {
    if (item && item.id) prev[item.id] = item;
  });
  const out = [];
  for (let i = 0; i < matches.length; i++) {
    const id = "k-" + (i + 1);
    const hit = prev[id] || prevList[i];
    const aNo = matches[i].aNo;
    const bNo = matches[i].bNo;
    out.push({
      id: id,
      index: i + 1,
      aNo: aNo,
      bNo: bNo,
      label: "第" + aNo + "名 VS 第" + bNo + "名",
      value: hit && hit.value != null && hit.value !== "" ? String(hit.value) : "1"
    });
  }
  return out;
}

function evenClamp(raw, min, max) {
  let n = Math.round(Number(raw) || 0);
  if (n % 2 !== 0) n -= 1;
  if (n < min) n = min;
  if (n > max) n = max;
  if (n % 2 !== 0) n -= 1;
  if (n < min) n = min;
  return n;
}

function intClamp(raw, min, max) {
  let n = Math.round(Number(raw) || 0);
  if (n < min) n = min;
  if (n > max) n = max;
  return n;
}

function defaultBandLow(totalN) {
  const n = Number(totalN) || 0;
  if (n < 4) return 2;
  let low = Math.floor(n / 2);
  if (low < 2) low = 2;
  if (low > n - 2) low = Math.max(2, n - 2);
  return low;
}

/** 高手不见面：两集合各自奇数容错后，实际 1V1 场数 */
function splitHighPairSlots(lowCount, highCount) {
  const lowActive = Number(lowCount) || 0;
  const highActive = Number(highCount) || 0;
  return Math.floor(lowActive / 2) + Math.floor(highActive / 2);
}

function bandPoolOf(players, bandMap) {
  return (players || [])
    .filter(function (item) {
      return item.selected;
    })
    .slice()
    .sort(function (a, b) {
      return Number(a.hcp || 99) - Number(b.hcp || 99);
    })
    .map(function (item) {
      const band = (bandMap && bandMap[item.id]) || item.band || "low";
      return Object.assign({}, item, {
        band: band === "high" ? "high" : "low",
        hcpText: item.hcp != null && item.hcp !== "" ? String(item.hcp) : "—"
      });
    });
}

function autoBandMap(players, lowCount) {
  const selected = (players || [])
    .filter(function (item) {
      return item.selected;
    })
    .slice()
    .sort(function (a, b) {
      return Number(a.hcp || 99) - Number(b.hcp || 99);
    });
  const map = {};
  const preferLow = Math.max(2, Number(lowCount) || 2);
  selected.forEach(function (item, i) {
    map[item.id] = i < preferLow ? "low" : "high";
  });
  if (selected.length >= 4) {
    let highN = 0;
    selected.forEach(function (item) {
      if (map[item.id] === "high") highN += 1;
    });
    if (highN < 2) {
      for (let i = selected.length - 1; i >= 0 && highN < 2; i--) {
        if (map[selected[i].id] !== "high") {
          map[selected[i].id] = "high";
          highN += 1;
        }
      }
    }
  }
  return map;
}

function lasuoNPatch(players, opts) {
  const selected = (players || []).filter(function (item) {
    return item.selected;
  });
  const n = selected.length;
  const isHorn = !!(opts && opts.horn);
  const pkCount = isHorn ? hornMeta(n).lasuoCount : pkCountOf(n);
  let bandLow = Number(opts && opts.bandLow);
  if (!(bandLow >= 2)) bandLow = defaultBandLow(n);
  const maxLow = Math.max(2, n - 2);
  if (bandLow > maxLow) bandLow = maxLow;
  if (bandLow < 2) bandLow = 2;
  const bandHigh = Math.max(0, n - bandLow);
  const useSplit =
    !isHorn && opts && (opts.bandMode === "split-high" || opts.forceSplitSlots);
  const pairCoeffs = pairCoeffsOf(
    n,
    (opts && opts.pairCoeffs) || [],
    opts && opts.formation,
    {
      bandMode: useSplit ? "split-high" : "all",
      bandLow: bandLow,
      bandHigh: bandHigh,
      horn: isHorn
    }
  );
  let bandMap = (opts && opts.bandMap) || {};
  if (!Object.keys(bandMap).length || opts.forceAutoBand) {
    bandMap = autoBandMap(selected, bandLow);
  } else {
    const next = {};
    selected.forEach(function (item) {
      next[item.id] = bandMap[item.id] === "high" ? "high" : "low";
    });
    bandMap = next;
  }
  const bandPool = bandPoolOf(selected, bandMap);
  let bandLowCount = 0;
  let bandHighCount = 0;
  bandPool.forEach(function (item) {
    if (item.band === "high") bandHighCount += 1;
    else bandLowCount += 1;
  });
  const bandReady = bandLow >= 2 && bandHigh >= 2 && bandLow + bandHigh === n;
  const mulRows = hydrateLasuoNMulRows(opts && opts.lasuoNMulRows);
  const rewardOn = opts && opts.rewardOn === false ? false : true;
  const totalPkKt =
    opts && opts.totalPkKt != null && opts.totalPkKt !== "" ? String(opts.totalPkKt) : "0";
  const flowerK =
    opts && opts.flowerK != null && opts.flowerK !== "" ? String(opts.flowerK) : "1";
  const pkTrail = isHorn ? flowerK : totalPkKt;
  return {
    pkCount: useSplit
      ? Math.floor(bandLow / 2) * 2 + Math.floor(bandHigh / 2) * 2
      : pkCount,
    pairSlotCount: pairCoeffs.length,
    pairCoeffs: pairCoeffs,
    lasuoNPkText: lasuoNPkTextOf(pairCoeffs, pkTrail),
    bandLow: String(bandLow),
    bandHigh: String(bandHigh),
    bandMap: bandMap,
    bandPool: bandPool,
    bandLowCount: bandLowCount,
    bandHighCount: bandHighCount,
    bandReady: bandReady,
    bandLowOdd: bandLow % 2 === 1,
    bandHighOdd: bandHigh % 2 === 1,
    lasuoNMulRows: mulRows,
    lasuoNRewardText: lasuoNRewardTextOf(rewardOn, mulRows),
    rewardOn: rewardOn
  };
}

function exclusiveFoldPatch(data, field) {
  const opening = !data[field];
  if (!opening) {
    const patch = {};
    patch[field] = false;
    return patch;
  }
  const patch = {};
  PAGE_FOLD_FIELDS.forEach(function (key) {
    patch[key] = false;
  });
  patch[field] = true;
  return patch;
}

Page(pageBoot.bindPageTheme({
  data: {
    headerRootStyle: "",
    headerBarStyle: "",
    entry: "score",
    maxPlayers: 4,
    ruleId: "",
    ruleName: "",
    ruleSummary: "",
    ruleLibId: "",
    ruleSnapshot: null,
    gameId: "",
    isEditing: false,
    needPlayers: 4,
    isThreePlayer: false,
    playerPickLocked: false,
    teamedPartyMode: false,
    matchupMode: "",
    matchupLocked: false,
    partyPickExact: 0,
    formationLabel: "",
    formationParties: [],
    usePagePick: false,
    selectedCount: 0,
    showSetupRest: true,
    multiplier: "1",
    players: [],
    holes: [],
    holeCount: 18,
    holeOrder: [],
    holeOrderText: holeOrderTextOf(null),
    holeOrderDraft: [],
    showHoleOrderSheet: false,
    showInstanceHoleOrder: false,
    holeOrderDragging: false,
    holeOrderDragIndex: -1,
    holeDraft: [],
    holeDraftCount: 18,
    holeTag: "all",
    showHoleSheet: false,
    showScoreSheet: false,
    scorePresets: catalog.SCORE_PRESETS,
    scorePlayerIndex: 0,
    scorePlayerName: "",
    scorePlayerAvatar: "",
    scorePlayerFace: {},
    customScore: "",
    customPlaceholder: "自定义",
    scoreUsingCustom: false,
    scoreDraft: "8421",
    defaultScoreCode: "8421",
    showScoreMap: false,
    showInstanceDeduct: false,
    deductMode: "on",
    deductWay: "plus-n",
    deductPlusN: "4",
    deductDoubleN: "0",
    deductCap: "none",
    deductCapN: "3",
    foldDeduct: false,
    deductText: "",
    groupModes: catalog.GROUP_MODES,
    groupMode: "random",
    rankOptions: catalog.RANK_OPTIONS,
    rankId: "gross-origin",
    rankFold: false,
    rankFoldText: "按出身成绩排序",
    showLandlordBig: false,
    showThreeVsOne: false,
    showDizhubo: false,
    dizhuboMode: "mid",
    showOrderDrag: false,
    showLandlordFamily: false,
    showLandlordGroup: false,
    showHcapRecv: false,
    showLasuoHcap: false,
    lasuoFoldHcap: false,
    lasuoHcapRows: [],
    lasuoHcapText: "无让杆",
    lasuoHcapCanAdd: true,
    showLasuoN: false,
    showHorn: false,
    showLasuoFamily: false,
    flowerK: "1",
    showRuleEdit: true,
    sortUpdate: "dynamic",
    lasuoNSortText: "乱拉 · 按出身成绩排序",
    lasuoNFoldSort: false,
    lasuoNFoldSortRank: false,
    formation: "jianghu",
    lasuoNFormationText: "江湖编队规则",
    lasuoNFoldFormation: false,
    bandMode: "all",
    lasuoNBandText: "所有一起",
    lasuoNFoldBand: false,
    lasuoNFoldBandSplit: false,
    bandLow: "2",
    bandHigh: "2",
    bandMap: {},
    bandPool: [],
    bandLowCount: 0,
    bandHighCount: 0,
    bandReady: true,
    bandLowOdd: false,
    bandHighOdd: false,
    pkCount: 0,
    pairSlotCount: 0,
    pairCoeffs: [],
    totalPkKt: "0",
    lasuoNPkText: "|0",
    lasuoNFoldPk: false,
    rewardOn: true,
    lasuoNMulRows: LASUO_N_MUL_DEFAULTS.slice(),
    lasuoNRewardText: "鸟*2 · 鹰*5",
    lasuoNFoldReward: false,
    lasuoNFoldMul: false,
    lasuoNFoldPush: false,
    lasuoNFoldPushKind: false,
    lasuoNFoldPlayers: false,
    lasuoNFoldOrder: false,
    lasuoNManyPlayers: false,
    lasuoNRankOptions: LASUO_N_RANK_OPTIONS,
    pushRule: "none",
    lasuoNPushText: "无顶洞",
    hcapPickRecv: false,
    hcapRecvOptions: [],
    orderDragging: false,
    orderRolling: false,
    orderDragFrom: -1,
    orderDragId: "",
    orderDragOffset: 0,
    showFixedPairs: false,
    pairRailSegs: [],
    sortMode: "random",
    sortModes: catalog.LANDLORD_SORT_MODES,
    playerOrder: [],
    orderedPlayers: [],
    hcapPersonal: false,
    hcapGroupRecv: false,
    hcapPlayerId: "",
    showTwoParty: false,
    allPairsOneVsOne: false,
    matchPlay: false,
    showPairHandicap: false,
    showMatchHandicap: false,
    showPairHoleHandicap: false,
    handicapMode: "none",
    hcapNoHoles: false,
    showHcapSheet: false,
    showThreeSetHcapSheet: false,
    threeSetHcapPairId: "",
    threeSetDraftFront: "0",
    threeSetDraftBack: "0",
    threeSetDraftOverall: "0",
    threeSetHcapWheel: false,
    hcapPairId: "",
    hcapLeftName: "",
    hcapLeftAvatar: "",
    hcapLeftFace: {},
    hcapRightName: "",
    hcapRightAvatar: "",
    hcapRightFace: {},
    hcapPar3: "0",
    hcapPar4: "0",
    hcapPar5: "0",
    hcapSteps: HCAP_STEPS,
    showHcapWheel: false,
    hcapWheelKey: "",
    hcapWheelTitle: "",
    hcapWheelIndex: [4],
    hcapWheelDraft: "0",
    hcapHoles: [],
    hcapHoleCount: 18,
    hcapEditIndex: -1,
    hcapCanDelete: false,
    hcapTag: "all",
    handicapInteger: true,
    handicapHint: "",
    kLabel: "积分系数",
    pairs: [],
    pairCount: 0,
    rosterCompact: false,
    pairFold: false,
    numEditing: false,
    numEditList: "",
    numEditId: "",
    numEditField: "",
    numEditDraft: "",
    canEdit: true,
    canView: true,
    pageMode: "edit",
    readonlyHint: "",
    themeClass: ""
  },

  onNumFocus: numField.onNumFocus,
  onNumInput: numField.onNumInput,
  onNumBlur: numField.onNumBlur,

  onLoad(query) {
    if (!session.ensureHost(query)) return;
    pageBoot.applyTheme(this);
    const header = createHeaderStyle();
    const entry = (query && query.entry) || "score";
    if (!session.requireSetupDraft(entry)) return;
    const maxPlayers = Number((query && query.maxPlayers) || 4);
    const needPlayers = Number((query && query.players) || 4);
    const showInstanceHoleOrder = entry === "hub" || entry === "match";
    const gameId = decodeURIComponent((query && query.gameId) || "");
    const existing = gameId ? session.getGame(entry, gameId) : null;
    this._repoRevision = existing && existing.revision != null ? Number(existing.revision) : null;
    const fullView = session.getFullHoleOrder(entry);
    const globalHoleOrder = (fullView.holes || []).map(function (h) {
      return h.holeId;
    });
    const holesBase = globalHoleOrder.map(function (label) {
      return { label: label, on: true };
    });
    const libId = decodeURIComponent((query && query.libId) || "") || (existing && existing.ruleLibId) || "";
    const rawSnap =
      (existing && existing.ruleSnapshot) ||
        session.getMyRuleById(libId) ||
        session.findMyRuleByName(decodeURIComponent((query && query.ruleName) || (existing && existing.name) || "")) ||
        null;
    let snapshot = session.cloneRule(session.unwrapGameplaySnapshot ? session.unwrapGameplaySnapshot(rawSnap) : rawSnap);
    const catalogId = (snapshot && snapshot.catalogId) || (existing && existing.catalogId) || (query && query.ruleId) || "";
    if (catalogId && session.ensureStrokePlayReward) {
      snapshot = session.cloneRule(session.ensureStrokePlayReward(catalogId, snapshot || {}));
    }
    if (catalog.isUnavailableRule(catalogId)) {
      wx.showToast({ title: "玩法尚未开放", icon: "none" });
      nav.navigateBackSafe(1);
      return;
    }
    const catalogItem = catalog.findRule(catalogId);
    const rulePlayers = catalog.resolveInstancePlayerNeed(catalogId, snapshot, needPlayers);
    const showTwoParty = rulePlayers === 2;
    const matchPlay =
      !!(snapshot && snapshot.matchPlay) || !!(catalogItem && catalogItem.matchPlay);
    const isThreePlayer = rulePlayers === 3;
    const showLandlordBig = catalog.isLandlordBig(catalogId);
    const showLasuoN = catalog.isLasuoN(catalogId);
    const showHorn = catalog.isHorn(catalogId);
    const showLasuoFamily = showLasuoN || showHorn;
    const showThreeVsOne = catalog.isThreeVsOne(catalogId);
    const showDizhubo = catalog.isDizhubo4(catalogId);
    const showLandlordFamily = catalog.isLandlordFamily(catalogId);
    const showHcapRecv =
      showLandlordFamily ||
      catalog.isLasuo4(catalogId) ||
      catalog.isVegas(catalogId) ||
      showDizhubo ||
      showThreeVsOne;
    const showLasuoHcap = showHcapRecv;
    const showLandlordGroup =
      showLandlordFamily ||
      catalog.is8421Three(catalogId) ||
      usesLasuoGroupUi(catalogId);
    const showOrderDrag = showLandlordGroup || showThreeVsOne || showDizhubo || showLasuoFamily;
    const dizhuboMode = ruleDefaults.defaultDizhuboMode(existing);
    const defaultGroupMode = ruleDefaults.defaultGroupMode(catalogId, existing);
    const showSetHandicap = false;
    const showThreeSet = showTwoParty && catalogId === "three-set";
    const showYoucai = showTwoParty && catalogId === "youcai";
    // 油菜与普通比洞共享组合让杆弹窗 / 有效洞 / 保存回显
    const showMatchHandicap = showTwoParty && catalog.usesMatchPlayPairSettings(catalogId);
    const showPairHoleHandicap = showMatchHandicap;
    const hcapNoHoles = false;
    const showPairHandicap = showTwoParty && catalog.supportsTotalStrokeHandicap(catalogId);
    const handicapMode = showPairHoleHandicap
      ? "pair-hole"
      : showPairHandicap
        ? "total-stroke"
        : "none";
    const showHoleRange = showTwoParty && !showThreeSet;
    const handicapInteger = catalogId === "stroke-2";
    const kLabel = showThreeSet ? "每局分值" : showYoucai ? "每洞分值" : "积分系数";
    const segmentValues = {
      front: existing && existing.segmentValues && existing.segmentValues.front != null && existing.segmentValues.front !== ""
        ? String(existing.segmentValues.front)
        : "1",
      back: existing && existing.segmentValues && existing.segmentValues.back != null && existing.segmentValues.back !== ""
        ? String(existing.segmentValues.back)
        : "1",
      overall: existing && existing.segmentValues && existing.segmentValues.overall != null && existing.segmentValues.overall !== ""
        ? String(existing.segmentValues.overall)
        : "1"
    };
    const playerSegmentHandicaps = (existing && existing.playerSegmentHandicaps) || {};
    const defaultScoreCode = (snapshot && snapshot.scoreCode) || "8421";
    const showScoreMap = catalog.is8421(catalogId);
    const showInstanceDeduct = catalog.is8421(catalogId);
    const pickNeed = rulePlayers > 0 ? rulePlayers : needPlayers;
    const people = session.listPlayers(entry);
    const formCtx = entry === "score" ? session.getScoreFormationContext(entry) : null;
    const teamedPartyMode = !!(formCtx && formCtx.teamed);
    const ruleCompat =
      teamedPartyMode && catalogId
        ? partyFormation.resolveRuleCompatibility(formCtx, catalogId)
        : null;
    const partyPickExact = ruleCompat ? Number(ruleCompat.requiredPartyCount) || 0 : 0;
    const formationParties = teamedPartyMode ? formCtx.parties.slice() : [];
    const defaultPartyIdSet = {};
    if (ruleCompat && ruleCompat.visible && ruleCompat.defaultPartyIds) {
      ruleCompat.defaultPartyIds.forEach(function (id) {
        defaultPartyIdSet[String(id)] = true;
      });
    } else if (teamedPartyMode) {
      formationParties.forEach(function (p) {
        defaultPartyIdSet[String(p.partyId)] = true;
      });
    }
    const cap = Number(session.getRuleCap(entry)) || people.length;
    const usePagePick = entry === "hub" || entry === "match";
    const pool = usePagePick ? people : people.slice(0, cap);
    // 编队记分页：方数与玩法刚好匹配时锁死；HUB 自由选人不锁
    const playerPickLocked = teamedPartyMode
      ? !!(ruleCompat && ruleCompat.locked)
      : !usePagePick && !showTwoParty && pool.length === pickNeed;
    const deductRow = function (item, selected) {
      return Object.assign({}, item, {
      selected: !!selected,
      scoreCode: item.scoreCode != null && item.scoreCode !== "" ? item.scoreCode : defaultScoreCode,
      scoreRows: item.scoreRows || null,
      hcp: item.hcp || "18",
        hcapPar3: "0",
        hcapPar4: "0",
        hcapPar5: "0"
      }, pickPlayerScoreMeta(item));
    };
    let playersBase;
    if (usePagePick) {
      // 配置页只挂已选，避免百人名单撑爆 DOM；全量在选人页按需加载
      if (existing && existing.players && existing.players.length) {
        playersBase = existing.players.map(function (item) {
          return deductRow(faceOf(item), true);
        });
      } else {
        playersBase = [];
      }
    } else if (teamedPartyMode) {
      playersBase = formationParties.map(function (party) {
        const selected = playerPickLocked || !!defaultPartyIdSet[String(party.partyId)];
        const required = !!playerPickLocked;
        const subject = session.buildParticipantSubject(party, {
          selected: selected,
          required: required
        });
        return deductRow(faceOf(subject), selected);
      });
    } else if (showTwoParty) {
      playersBase = session.listScoreSlots(entry).map(function (item) {
        return Object.assign({}, faceOf(item), { scoreCode: defaultScoreCode, selected: true }, pickPlayerScoreMeta(item));
      });
    } else {
      playersBase = pool.map(function (item, idx) {
        return deductRow(
          faceOf(item),
          playerPickLocked || (!isThreePlayer && idx < needPlayers)
        );
      });
    }
    const picked = {};
    ((existing && existing.players) || []).forEach(function (item) {
      picked[item.id] = item;
    });
    let players = existing && !usePagePick
      ? playersBase.map(function (item) {
          const hit = picked[item.id];
          const forceSelected = teamedPartyMode
            ? playerPickLocked || (hit ? true : !!defaultPartyIdSet[String(item.id)])
            : playerPickLocked
              ? true
              : !!hit;
          return Object.assign({}, item, pickPlayerScoreMeta(hit || item), {
            selected: forceSelected,
            required: teamedPartyMode ? !!playerPickLocked : !!item.required,
            subjectType: item.subjectType,
            useSubjectName: item.useSubjectName,
            avatarModel: item.avatarModel,
            displayName: item.displayName || item.name,
            scoreCode: (hit && hit.scoreCode != null && hit.scoreCode !== "") ? hit.scoreCode : (item.scoreCode || defaultScoreCode),
            scoreRows: takeScoreRows(hit, item),
            hcp: (hit && hit.hcp) || item.hcp || "18",
            hcapPar3: hit && hit.hcapPar3 != null && hit.hcapPar3 !== "" ? String(hit.hcapPar3) : "0",
            hcapPar4: hit && hit.hcapPar4 != null && hit.hcapPar4 !== "" ? String(hit.hcapPar4) : "0",
            hcapPar5: hit && hit.hcapPar5 != null && hit.hcapPar5 !== "" ? String(hit.hcapPar5) : "0"
          });
        })
      : playersBase;
    if (existing && usePagePick) {
      players = playersBase.map(function (item) {
        const hit = picked[item.id] || item;
        return Object.assign({}, item, pickPlayerScoreMeta(hit), {
          selected: true,
          scoreCode: (hit.scoreCode != null && hit.scoreCode !== "") ? hit.scoreCode : (item.scoreCode || defaultScoreCode),
          scoreRows: takeScoreRows(hit, item),
          hcp: hit.hcp || item.hcp || "18",
          hcapPar3: hit.hcapPar3 != null && hit.hcapPar3 !== "" ? String(hit.hcapPar3) : "0",
          hcapPar4: hit.hcapPar4 != null && hit.hcapPar4 !== "" ? String(hit.hcapPar4) : "0",
          hcapPar5: hit.hcapPar5 != null && hit.hcapPar5 !== "" ? String(hit.hcapPar5) : "0"
        });
      });
    }
    if (showScoreMap) (function hydrateScoreCodes() {
      var note = false;
      players = (players || []).map(function (item) {
        var hyd = scoreMapUtil.hydratePlayerScore(item);
        if (!hyd.lossless) note = true;
        return Object.assign({}, item, {
          scoreCode: hyd.scoreCode || item.scoreCode || defaultScoreCode
        });
      });
      if (note) {
        wx.showToast({
          title: "本场有无法还原成快捷码的分值表，已保留内部数据",
          icon: "none",
          duration: 2800
        });
      }
    })();
    const onHoles = {};
    ((existing && existing.holes) || []).forEach(function (item) {
      onHoles[item.label] = true;
    });
    const holes = holesBase.map(function (item) {
      return {
        label: item.label,
        on: showThreeSet ? true : existing ? !!onHoles[item.label] : true
      };
    });
    let pairs = [];
    let pairCount = 0;
    let rosterCompact = false;
    if (showTwoParty) {
      const prevPairSrc =
        existing && existing.pairings && existing.pairings.length
          ? existing.pairings
          : existing && existing.matchups && existing.matchups.length
            ? existing.matchups.map(function (m) {
                const lid = m.leftPartyId || m.leftId;
                const rid = m.rightPartyId || m.rightId;
                return Object.assign({}, m, {
                  id: m.id || String(lid) + "|" + String(rid),
                  leftId: lid,
                  rightId: rid,
                  leftPartyId: lid,
                  rightPartyId: rid
                });
              })
            : [];
      const pairUi = twoPartyPairsPatch(
        true,
        players,
        prevPairSrc,
        holes,
        hcapNoHoles,
        partyMatchupOptsFrom(teamedPartyMode, catalogId, formationParties, !!(ruleCompat && ruleCompat.locked))
      );
      pairs = pairUi.pairs;
      pairCount = pairUi.pairCount;
      rosterCompact = pairUi.rosterCompact;
      if (!rosterCompact && prevPairSrc.length) {
        const keep = {};
        prevPairSrc.forEach(function (item) {
          keep[item.id] = item;
          if (item.leftId && item.rightId) keep[String(item.leftId) + "|" + String(item.rightId)] = item;
        });
        pairs = pairs.map(function (item) {
          const hit = keep[item.id] || keep[String(item.leftId) + "|" + String(item.rightId)];
          if (!hit) {
            // 编队组合对决：旧版球员笛卡尔积不匹配时仍默认开启唯一 party 对决
            return Object.assign({}, item, { on: teamedPartyMode || showThreeSet ? true : false });
          }
          return decoratePairHcap(
            Object.assign({}, item, {
              // 三局 / 1V1 all-pairs：回显勾选；其余两人玩法保持原强制开启
              on:
                showThreeSet || catalog.isAllPairsOneVsOneCatalog(catalogId)
                  ? hit.on !== false
                  : true,
              strokes:
                hit.strokes != null && hit.strokes !== ""
                  ? String(hit.strokes)
                  : hit.handicap != null && hit.handicap !== ""
                    ? String(hit.handicap)
                    : item.strokes,
              handicap:
                hit.handicap != null && hit.handicap !== ""
                  ? String(hit.handicap)
                  : hit.strokes != null && hit.strokes !== ""
                    ? String(hit.strokes)
                    : item.handicap,
              hcapList: hit.hcapList || item.hcapList,
              segFront: hit.segFront != null ? hit.segFront : item.segFront,
              segBack: hit.segBack != null ? hit.segBack : item.segBack,
              segOverall: hit.segOverall != null ? hit.segOverall : item.segOverall,
              segmentHandicaps: hit.segmentHandicaps || item.segmentHandicaps
            }),
            hit,
            holes,
            hcapNoHoles
          );
        });
        pairCount = pairs.filter(function (item) {
          return item.on;
        }).length;
      }
      if (teamedPartyMode && formationParties.length) {
        const faceById = {};
        formationParties.forEach(function (p) {
          faceById[String(p.partyId)] = session.buildParticipantSubject(p, {
            selected: true,
            required: !!(ruleCompat && ruleCompat.locked)
          });
        });
        pairs = pairs.map(function (pair) {
          const leftSubject = faceById[String(pair.leftId || pair.leftPartyId)];
          const rightSubject = faceById[String(pair.rightId || pair.rightPartyId)];
          return pairFaces(
            Object.assign({}, pair, {
              leftSubject: leftSubject,
              rightSubject: rightSubject,
              leftPartyId: pair.leftPartyId || pair.leftId,
              rightPartyId: pair.rightPartyId || pair.rightId
            })
          );
        });
      }
      if (showThreeSet) {
        const legacyMap = playerSegmentHandicaps || {};
        const keepRaw = {};
        ((existing && existing.pairings) || []).forEach(function (item) {
          if (item && item.id != null) keepRaw[item.id] = item;
        });
        pairs = (pairs || []).map(function (pair) {
          const raw = keepRaw[pair.id] || pair;
          const sh = (raw && raw.segmentHandicaps) || {};
          const hasPair =
            (raw.segmentHandicaps && typeof raw.segmentHandicaps === "object") ||
            (raw.segFront != null && raw.segFront !== "") ||
            (raw.segBack != null && raw.segBack !== "") ||
            (raw.segOverall != null && raw.segOverall !== "") ||
            (sh.front != null && sh.front !== "") ||
            (sh.back != null && sh.back !== "") ||
            (sh.overall != null && sh.overall !== "");
          const segs = hasPair
            ? readPairSegmentHandicaps(raw)
            : migratePairSegFromPlayers(pair, legacyMap);
          return attachPairSegmentFields(pair, segs);
        });
        pairs = decorateThreeSetPairRows(pairs);
      }
      if (showYoucai) {
        pairs = (pairs || []).map(function (pair) {
          return migrateYoucaiPairToMatchHcap(pair, holes);
        });
      }
    }
    if (showHcapRecv) {
      players = decoratePlayersHcap(players, holes);
    }
    const sortMode =
      existing && (existing.sortMode === "manual" || existing.sortMode === "hcp")
        ? existing.sortMode
        : "random";
    const savedOrder = existing
      ? existing.playerOrder && existing.playerOrder.length
        ? existing.playerOrder
        : (existing.players || []).map(function (item) {
            return item.id;
          })
      : [];
    let groupMode = (existing && existing.groupMode) || defaultGroupMode;
    if (showDizhubo && groupMode === "split-high") groupMode = "fixed";
    if (hideSplitHighGroup(catalogId) && groupMode === "split-high") {
      groupMode = "random";
    }
    if (showLasuoFamily) groupMode = "random";
    const formation =
      existing && existing.formation === "haidao" ? "haidao" : "jianghu";
    const sortUpdate = ruleDefaults.defaultSortUpdate(existing);
    const bandMode =
      showHorn || sortUpdate === "fixed"
        ? "all"
        : existing && existing.bandMode === "split-high"
          ? "split-high"
          : "all";
    const lasuoNUi = showLasuoFamily
      ? lasuoNPatch(players, {
          pairCoeffs: existing && existing.pairCoeffs,
          bandLow: existing && existing.bandLow,
          bandHigh: existing && existing.bandHigh,
          bandMap: existing && existing.bandMap,
          lasuoNMulRows: existing && existing.lasuoNMulRows,
          rewardOn: existing && existing.rewardOn,
          totalPkKt: existing && existing.totalPkKt,
          flowerK: existing && existing.flowerK,
          bandMode: bandMode,
          formation: formation,
          horn: showHorn
        })
      : null;
    const startOrder = orderPatch(
      players,
      savedOrder,
      sortMode,
      groupMode,
      false,
      catalogId,
      dizhuboMode,
      formation,
      showLasuoFamily
        ? {
            bandMode: bandMode,
            bandMap: lasuoNUi ? lasuoNUi.bandMap : {},
            bandLow: lasuoNUi ? lasuoNUi.bandLow : "2",
            bandHigh: lasuoNUi ? lasuoNUi.bandHigh : "2",
            horn: showHorn,
            sortUpdate: sortUpdate
          }
        : null
    );
    const ranks = rankPatch(
      showLandlordGroup,
      players,
      pairs,
      existing && existing.rankId ? existing.rankId : "gross-origin",
      defaultScoreCode
    );
    const lasuoHcapUi = lasuoHcapPatch(players);
    const pushRule = showHorn
      ? existing && existing.pushRule === "none"
        ? "none"
        : "all-tie"
      : normalizeLasuoNPushRule(existing && existing.pushRule);
    const lasuoNRankId =
      existing && existing.rankId === "gross-result" ? "gross-result" : "gross-origin";
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle,
      entry: entry,
      maxPlayers: maxPlayers,
      ruleId: catalogId,
      ruleLibId: libId,
      ruleSnapshot: snapshot,
      gameId: existing ? existing.id : "",
      isEditing: !!existing,
      ruleName: decodeURIComponent(
        (query && query.ruleName) ||
          (existing && existing.name) ||
          (showHorn ? "喇叭花" : showLasuoN ? "多人拉丝" : "北京 8421")
      ),
      ruleSummary: ruleSummaryOf(snapshot, catalogId),
      needPlayers: pickNeed,
      isThreePlayer: isThreePlayer,
      playerPickLocked: playerPickLocked,
      teamedPartyMode: teamedPartyMode,
      matchupMode: ruleCompat && ruleCompat.matchupMode
        ? ruleCompat.matchupMode
        : isPartyMatchupRule(catalogId)
          ? "party-matchup"
          : "",
      matchupLocked: !!(teamedPartyMode && ruleCompat && ruleCompat.locked),
      partyPickExact: partyPickExact,
      formationLabel: teamedPartyMode ? formCtx.formation : "",
      formationParties: formationParties,
      usePagePick: usePagePick,
      selectedCount: players.filter(function (item) {
        return item.selected;
      }).length,
      lasuoNManyPlayers:
        lasuoNManyPlayersOf(
          showLasuoFamily,
          players.filter(function (item) {
            return item.selected;
          }).length
        ),
      lasuoNFoldPlayers: false,
      lasuoNFoldOrder: false,
      showSetupRest: isSetupRestReady(
        isThreePlayer,
        playerPickLocked,
        players,
        pickNeed,
        usePagePick,
        showLasuoN,
        showHorn,
        teamedPartyMode,
        partyPickExact,
        catalogId,
        formationParties
      ),
      showLandlordBig: showLandlordBig,
      showLasuoN: showLasuoN,
      showHorn: showHorn,
      showLasuoFamily: showLasuoFamily,
      flowerK:
        existing && existing.flowerK != null && existing.flowerK !== ""
          ? String(existing.flowerK)
          : "1",
      showRuleEdit: !catalog.isNoSettings(catalogId),
      showThreeVsOne: showThreeVsOne,
      showDizhubo: showDizhubo,
      dizhuboMode: dizhuboMode,
      showOrderDrag: showOrderDrag,
      showLandlordFamily: showLandlordFamily,
      showHcapRecv: showHcapRecv,
      showLasuoHcap: showLasuoHcap,
      lasuoFoldHcap: false,
      lasuoHcapRows: lasuoHcapUi.lasuoHcapRows,
      lasuoHcapText: lasuoHcapUi.lasuoHcapText,
      lasuoHcapCanAdd: lasuoHcapUi.lasuoHcapCanAdd,
      sortUpdate: sortUpdate,
      lasuoNSortText: lasuoNSortTextOf(sortUpdate, lasuoNRankId),
      lasuoNFoldSort: false,
      lasuoNFoldSortRank: false,
      formation: formation,
      lasuoNFormationText: lasuoNFormationTextOf(formation),
      lasuoNFoldFormation: false,
      bandMode: bandMode,
      lasuoNBandText: lasuoNBandTextOf(bandMode),
      lasuoNFoldBand: false,
      lasuoNFoldBandSplit: false,
      pushRule: showLasuoFamily ? pushRule : "none",
      lasuoNPushText: showHorn
        ? hornPushTextOf(pushRule)
        : showLasuoN
          ? lasuoNPushTextOf(pushRule)
          : "无顶洞",
      lasuoNFoldPush: false,
      lasuoNFoldPushKind: false,
      totalPkKt:
        existing && existing.totalPkKt != null && existing.totalPkKt !== ""
          ? String(existing.totalPkKt)
          : "0",
      lasuoNFoldPk: false,
      lasuoNPkText: lasuoNPkTextOf(
        lasuoNUi ? lasuoNUi.pairCoeffs : [],
        showHorn
          ? existing && existing.flowerK != null && existing.flowerK !== ""
            ? String(existing.flowerK)
            : "1"
          : existing && existing.totalPkKt != null && existing.totalPkKt !== ""
            ? String(existing.totalPkKt)
            : "0"
      ),
      lasuoNFoldReward: false,
      lasuoNRankOptions: LASUO_N_RANK_OPTIONS,
      pkCount: lasuoNUi ? lasuoNUi.pkCount : 0,
      pairSlotCount: lasuoNUi ? lasuoNUi.pairSlotCount : 0,
      pairCoeffs: lasuoNUi ? lasuoNUi.pairCoeffs : [],
      bandLow: lasuoNUi ? lasuoNUi.bandLow : "2",
      bandHigh: lasuoNUi ? lasuoNUi.bandHigh : "2",
      bandMap: lasuoNUi ? lasuoNUi.bandMap : {},
      bandPool: lasuoNUi ? lasuoNUi.bandPool : [],
      bandLowCount: lasuoNUi ? lasuoNUi.bandLowCount : 0,
      bandHighCount: lasuoNUi ? lasuoNUi.bandHighCount : 0,
      bandReady: lasuoNUi ? lasuoNUi.bandReady : true,
      bandLowOdd: lasuoNUi ? !!lasuoNUi.bandLowOdd : false,
      bandHighOdd: lasuoNUi ? !!lasuoNUi.bandHighOdd : false,
      rewardOn: lasuoNUi ? lasuoNUi.rewardOn : true,
      lasuoNMulRows: lasuoNUi ? lasuoNUi.lasuoNMulRows : hydrateLasuoNMulRows(null),
      lasuoNRewardText: lasuoNUi
        ? lasuoNUi.lasuoNRewardText
        : lasuoNRewardTextOf(true, hydrateLasuoNMulRows(null)),
      showLandlordGroup: showLandlordGroup,
      multiplier:
        (existing &&
          (existing.pointPerHole != null && existing.pointPerHole !== ""
            ? String(existing.pointPerHole)
            : existing.multiplier != null && existing.multiplier !== ""
              ? String(existing.multiplier)
              : "")) ||
        "1",
      groupModes: groupModesOf(catalogId, showLandlordGroup),
      groupMode: groupMode,
      rankOptions: showLasuoFamily ? LASUO_N_RANK_OPTIONS : ranks.rankOptions,
      rankId: showLasuoFamily ? lasuoNRankId : ranks.rankId,
      rankFold: false,
      rankFoldText: showLasuoFamily
        ? labelOf(LASUO_N_RANK_OPTIONS, lasuoNRankId)
        : ranks.rankFoldText,
      sortMode: startOrder.sortMode,
      playerOrder: startOrder.playerOrder,
      orderedPlayers: startOrder.orderedPlayers,
      showFixedPairs: startOrder.showFixedPairs,
      pairRailSegs: startOrder.pairRailSegs || [],
      players: withScoreTones(players, defaultScoreCode),
      holes: holes,
      holeCount: holes.filter(function (item) {
        return item.on;
      }).length,
      holeOrder: normalizeHoleOrder(globalHoleOrder),
      holeOrderText: holeOrderTextOf(globalHoleOrder),
      showInstanceHoleOrder: showInstanceHoleOrder,
      showTwoParty: showTwoParty,
      allPairsOneVsOne: catalog.isAllPairsOneVsOneCatalog(catalogId),
      showThreeSet: showThreeSet,
      showHoleRange: showHoleRange,
      segmentValues: segmentValues,
      matchPlay: matchPlay,
      showPairHandicap: showPairHandicap,
      showMatchHandicap: showMatchHandicap,
      showPairHoleHandicap: showPairHoleHandicap,
      handicapMode: handicapMode,
      hcapNoHoles: hcapNoHoles,
      handicapInteger: handicapInteger,
      handicapHint: showThreeSet
        ? "点组合后的「让杆」设置前九 / 后九 / 全场有符号让杆。正数=左让右，负数=右让左，可 0.5。"
        : showMatchHandicap
        ? "按 3/4/5 杆洞分别让杆。正数=左侧让右侧，负数=右侧让左侧。"
        : handicapInteger
          ? "总杆让杆，整数。正数=左侧让右侧，负数=右侧让左侧。只进初始总分。"
          : "逐洞让杆，可 0.5。正数=左侧让右侧，负数=右侧让左侧。",
      kLabel: kLabel,
      showYoucai: showYoucai,
      defaultScoreCode: defaultScoreCode,
      showScoreMap: showScoreMap,
      showInstanceDeduct: showInstanceDeduct,
      pairs: pairs,
      pairCount: pairCount,
      rosterCompact: rosterCompact,
      pairFold: !!teamedPartyMode || catalog.isAllPairsOneVsOneCatalog(catalogId)
    });
    this._bootConfigGuard();
  },

  _bootConfigGuard() {
    var snapUtil = require("../../utils/sideGameConfigSnapshot.js");
    configGuard.attach(this, {
      getBusiness: function (page) {
        return snapUtil.buildInstanceConfigSnapshot(page.data || {});
      }
    });
    if (this._captureInitialSnapshot) this._captureInitialSnapshot();
  },

  onBack() {
    if (this._leaveIfClean) {
      this._leaveIfClean(function () {
        nav.navigateBackSafe(1);
      });
      return;
    }
    nav.navigateBackSafe(1);
  },

  onShow() {
    pageBoot.applyTheme(this);
    const players = (this.data.players || []).map(faceOf);
    const pairs = (this.data.pairs || []).map(pairFaces);
    const patch = Object.assign(
      {
        players: players,
        pairs: pairs
      },
      lasuoHcapPatch(players)
    );
    const libId = this.data.ruleLibId;
    if (libId && !(this._isDirty && this._isDirty())) {
      const rule = session.getMyRuleById(libId);
      if (rule) {
        patch.ruleName = rule.name || this.data.ruleName;
        patch.ruleSnapshot = session.cloneRule(
          session.unwrapGameplaySnapshot ? session.unwrapGameplaySnapshot(rule) : rule
        );
        patch.ruleSummary = ruleSummaryOf(patch.ruleSnapshot, rule.catalogId || this.data.ruleId);
      }
    }
    const self = this;
    this._guardHydrating = true;
    this.setData(patch, function () {
      try {
        if (self._rebuildInitialIfPristine) self._rebuildInitialIfPristine();
      } finally {
        self._guardHydrating = false;
      }
    });
  },

  openRuleEdit() {
    const libId = this.data.ruleLibId;
    const fromLib = session.getMyRuleById(libId);
    const snap = this.data.ruleSnapshot || {};
    const rule = fromLib || {
      id: libId,
      catalogId: this.data.ruleId || snap.catalogId,
      name: this.data.ruleName || snap.name,
      players: this.data.needPlayers || snap.players || 4,
      matchPlay: !!snap.matchPlay
    };
    if (!rule.catalogId && !fromLib) {
      wx.showToast({ title: "未找到该规则", icon: "none" });
      return;
    }
    wx.navigateTo({
      url: session.editRuleUrl(this.data.entry, this.data.maxPlayers, rule) + "&from=instance"
    });
  },

  onMultiplier(e) {
    this.setData({ multiplier: e.detail.value });
  },

  onSegmentValue(e) {
    const key = (e.currentTarget.dataset && e.currentTarget.dataset.key) || "";
    if (!key) return;
    const next = Object.assign({}, this.data.segmentValues || {});
    next[key] = e.detail.value;
    this.setData({ segmentValues: next });
  },

  onPlayerSegHandicap(e) {
    const ds = e.currentTarget.dataset || {};
    const id = ds.id != null ? String(ds.id) : "";
    const key = ds.key || "";
    if (!id || !key) return;
    const players = (this.data.players || []).slice();
    const idx = players.findIndex(function (p) {
      return p && String(p.id) === id;
    });
    if (idx < 0) return;
    const patch = {};
    if (key === "front") patch.segFront = e.detail.value;
    if (key === "back") patch.segBack = e.detail.value;
    if (key === "overall") patch.segOverall = e.detail.value;
    players[idx] = Object.assign({}, players[idx], patch);
    this.setData({ players: players });
  },

  setLasuoNSortUpdate(e) {
    const sortUpdate = e.currentTarget.dataset.id === "fixed" ? "fixed" : "dynamic";
    if (sortUpdate === "fixed") {
      const bandUi = lasuoNPatch(this.data.players, lasuoNCallOpts(this.data, { bandMode: "all" }));
      const opts = pageLasuoNOpts(
        Object.assign({}, this.data, {
          sortUpdate: "fixed",
          bandMode: "all",
          bandLow: bandUi.bandLow,
          bandHigh: bandUi.bandHigh
        })
      );
      this.setData(
        Object.assign(
          {
            sortUpdate: "fixed",
            lasuoNSortText: lasuoNSortTextOf("fixed"),
            lasuoNFoldSortRank: false,
            bandMode: "all",
            lasuoNBandText: lasuoNBandTextOf("all"),
            lasuoNFoldBand: false,
            lasuoNFoldBandSplit: false
          },
          bandUi,
          orderPatch(
            this.data.players,
            this.data.playerOrder,
            this.data.sortMode,
            this.data.groupMode,
            false,
            this.data.ruleId,
            this.data.dizhuboMode,
            this.data.formation,
            opts
          )
        )
      );
      return;
    }
    if (this.data.sortUpdate === "dynamic") {
      this.setData({ lasuoNFoldSortRank: !this.data.lasuoNFoldSortRank });
      return;
    }
    const opts = pageLasuoNOpts(Object.assign({}, this.data, { sortUpdate: "dynamic" }));
    this.setData(
      Object.assign(
        {
          sortUpdate: "dynamic",
          lasuoNSortText: lasuoNSortTextOf("dynamic", this.data.rankId),
          rankFoldText: labelOf(LASUO_N_RANK_OPTIONS, this.data.rankId || "gross-origin"),
          lasuoNFoldSortRank: true
        },
        orderPatch(
          this.data.players,
          this.data.playerOrder,
          this.data.sortMode,
          this.data.groupMode,
          false,
          this.data.ruleId,
          this.data.dizhuboMode,
          this.data.formation,
          opts
        )
      )
    );
  },

  toggleLasuoNSortFold() {
    this.setData(exclusiveFoldPatch(this.data, "lasuoNFoldSort"));
  },

  toggleLasuoNSortRankFold() {
    if (this.data.sortUpdate !== "dynamic") return;
    this.setData({ lasuoNFoldSortRank: !this.data.lasuoNFoldSortRank });
  },

  setLasuoNFormation(e) {
    const formation = e.currentTarget.dataset.id === "haidao" ? "haidao" : "jianghu";
    const bandUi = lasuoNPatch(
      this.data.players,
      lasuoNCallOpts(this.data, { formation: formation })
    );
    this.setData(
      Object.assign(
        {
          formation: formation,
          lasuoNFormationText: lasuoNFormationTextOf(formation)
        },
        bandUi,
        orderPatch(
          this.data.players,
          this.data.playerOrder,
          this.data.sortMode,
          this.data.groupMode,
          false,
          this.data.ruleId,
          this.data.dizhuboMode,
          formation,
          pageLasuoNOpts(this.data)
        )
      )
    );
  },

  toggleLasuoNFormationFold() {
    this.setData(exclusiveFoldPatch(this.data, "lasuoNFoldFormation"));
  },

  setLasuoNBandMode(e) {
    if (this.data.sortUpdate === "fixed") return;
    const bandMode = e.currentTarget.dataset.id === "split-high" ? "split-high" : "all";
    if (bandMode === "all") {
      const bandUi = lasuoNPatch(this.data.players, {
        pairCoeffs: this.data.pairCoeffs,
        bandLow: this.data.bandLow,
        bandHigh: this.data.bandHigh,
        lasuoNMulRows: this.data.lasuoNMulRows,
        rewardOn: this.data.rewardOn,
        totalPkKt: this.data.totalPkKt,
        bandMode: "all",
        formation: this.data.formation
      });
      const opts = {
        bandMode: "all",
        bandMap: {},
        bandLow: bandUi.bandLow,
        bandHigh: bandUi.bandHigh
      };
      this.setData(
        Object.assign(
          {
            bandMode: "all",
            lasuoNBandText: lasuoNBandTextOf("all"),
            lasuoNFoldBandSplit: false
          },
          bandUi,
          orderPatch(
            this.data.players,
            this.data.playerOrder,
            this.data.sortMode,
            this.data.groupMode,
            false,
            this.data.ruleId,
            this.data.dizhuboMode,
            this.data.formation,
            opts
          )
        )
      );
      return;
    }
    if (this.data.bandMode === "split-high") {
      this.setData({ lasuoNFoldBandSplit: !this.data.lasuoNFoldBandSplit });
      return;
    }
    const bandUi = lasuoNPatch(this.data.players, {
      pairCoeffs: this.data.pairCoeffs,
      bandLow: this.data.bandLow,
      bandHigh: this.data.bandHigh,
      lasuoNMulRows: this.data.lasuoNMulRows,
      rewardOn: this.data.rewardOn,
      totalPkKt: this.data.totalPkKt,
      bandMode: "split-high",
      formation: this.data.formation
    });
    const opts = {
      bandMode: "split-high",
      bandMap: {},
      bandLow: bandUi.bandLow,
      bandHigh: bandUi.bandHigh
    };
    this.setData(
      Object.assign(
        {
          bandMode: "split-high",
          lasuoNBandText: lasuoNBandTextOf("split-high"),
          lasuoNFoldBandSplit: true
        },
        bandUi,
        orderPatch(
          this.data.players,
          this.data.playerOrder,
          this.data.sortMode,
          this.data.groupMode,
          false,
          this.data.ruleId,
          this.data.dizhuboMode,
          this.data.formation,
          opts
        )
      )
    );
  },

  toggleLasuoNBandFold() {
    if (this.data.sortUpdate === "fixed") return;
    this.setData(exclusiveFoldPatch(this.data, "lasuoNFoldBand"));
  },

  toggleLasuoNBandSplitFold() {
    if (this.data.sortUpdate === "fixed") return;
    if (this.data.bandMode !== "split-high") return;
    this.setData({ lasuoNFoldBandSplit: !this.data.lasuoNFoldBandSplit });
  },

  onLasuoNBandLow(e) {
    if (this.data.sortUpdate === "fixed") return;
    const n = (this.data.players || []).filter(function (item) {
      return item.selected;
    }).length;
    const low = intClamp(e.detail.value, 2, Math.max(2, n - 2));
    const bandUi = lasuoNPatch(this.data.players, {
      pairCoeffs: this.data.pairCoeffs,
      bandLow: low,
      lasuoNMulRows: this.data.lasuoNMulRows,
      rewardOn: this.data.rewardOn,
      totalPkKt: this.data.totalPkKt,
      bandMode: "split-high",
      formation: this.data.formation
    });
    this.setData(
      Object.assign(
        bandUi,
        orderPatch(
          this.data.players,
          this.data.playerOrder,
          this.data.sortMode,
          this.data.groupMode,
          false,
          this.data.ruleId,
          this.data.dizhuboMode,
          this.data.formation,
          {
            bandMode: "split-high",
            bandMap: {},
            bandLow: bandUi.bandLow,
            bandHigh: bandUi.bandHigh
          }
        )
      )
    );
  },

  onLasuoNPairCoeff(e) {
    const id = e.currentTarget.dataset.id;
    const pairCoeffs = (this.data.pairCoeffs || []).map(function (item) {
      if (item.id !== id) return item;
      return Object.assign({}, item, { value: e.detail.value });
    });
    this.setData({
      pairCoeffs: pairCoeffs,
      lasuoNPkText: lasuoNPkTextOf(pairCoeffs, pagePkTrailOf(this.data))
    });
  },

  onLasuoNTotalPk(e) {
    this.setData({
      totalPkKt: e.detail.value,
      lasuoNPkText: lasuoNPkTextOf(this.data.pairCoeffs, e.detail.value)
    });
  },

  onFlowerK(e) {
    const flowerK = e.detail.value;
    this.setData({
      flowerK: flowerK,
      lasuoNPkText: lasuoNPkTextOf(this.data.pairCoeffs, flowerK == null || flowerK === "" ? "1" : String(flowerK))
    });
  },

  toggleLasuoNPkFold() {
    this.setData(exclusiveFoldPatch(this.data, "lasuoNFoldPk"));
  },

  toggleLasuoNRewardFold() {
    this.setData(exclusiveFoldPatch(this.data, "lasuoNFoldReward"));
  },

  toggleLasuoNPlayersFold() {
    this.setData(exclusiveFoldPatch(this.data, "lasuoNFoldPlayers"));
  },

  toggleLasuoNOrderFold() {
    this.setData(exclusiveFoldPatch(this.data, "lasuoNFoldOrder"));
  },

  setLasuoNRewardOn(e) {
    const rewardOn = e.currentTarget.dataset.value === "1";
    const rows = this.data.lasuoNMulRows || hydrateLasuoNMulRows(null);
    const patch = {
      rewardOn: rewardOn,
      lasuoNRewardText: lasuoNRewardTextOf(rewardOn, rows)
    };
    if (!rewardOn) patch.lasuoNFoldMul = false;
    else if (this.data.rewardOn) patch.lasuoNFoldMul = !this.data.lasuoNFoldMul;
    else patch.lasuoNFoldMul = true;
    this.setData(patch);
  },

  toggleLasuoNMulFold() {
    if (!this.data.rewardOn) return;
    this.setData({ lasuoNFoldMul: !this.data.lasuoNFoldMul });
  },

  onLasuoNMulRow(e) {
    const id = e.currentTarget.dataset.id;
    const lasuoNMulRows = (this.data.lasuoNMulRows || []).map(function (item) {
      if (item.id !== id) return item;
      return Object.assign({}, item, { value: e.detail.value });
    });
    this.setData({
      lasuoNMulRows: lasuoNMulRows,
      lasuoNRewardText: lasuoNRewardTextOf(this.data.rewardOn, lasuoNMulRows)
    });
  },

  setHornPush(e) {
    const pushRule = e.currentTarget.dataset.value === "none" ? "none" : "all-tie";
    this.setData({
      pushRule: pushRule,
      lasuoNFoldPushKind: false,
      lasuoNPushText: hornPushTextOf(pushRule)
    });
  },

  setLasuoNPushMode(e) {
    const value = e.currentTarget.dataset.value;
    if (this.data.showHorn) {
      const pushRule = value === "none" ? "none" : "all-tie";
      this.setData({
        pushRule: pushRule,
        lasuoNFoldPushKind: false,
        lasuoNPushText: hornPushTextOf(pushRule)
      });
      return;
    }
    if (value === "none") {
      this.setData({
        pushRule: "none",
        lasuoNFoldPushKind: false,
        lasuoNPushText: "无顶洞"
      });
      return;
    }
    if (this.data.pushRule !== "none") {
      this.setData({ lasuoNFoldPushKind: !this.data.lasuoNFoldPushKind });
      return;
    }
    this.setData({
      pushRule: "team-tie",
      lasuoNFoldPushKind: true,
      lasuoNPushText: lasuoNPushTextOf("team-tie")
    });
  },

  setLasuoNPush(e) {
    const pushRule = normalizeLasuoNPushRule(e.currentTarget.dataset.value);
    if (pushRule === "none") {
      this.setData({
        pushRule: "none",
        lasuoNFoldPushKind: false,
        lasuoNPushText: "无顶洞"
      });
      return;
    }
    this.setData({
      pushRule: pushRule,
      lasuoNPushText: lasuoNPushTextOf(pushRule)
    });
  },

  toggleLasuoNPushFold() {
    this.setData(exclusiveFoldPatch(this.data, "lasuoNFoldPush"));
  },

  toggleLasuoNPushKindFold() {
    if (this.data.pushRule === "none") return;
    this.setData({ lasuoNFoldPushKind: !this.data.lasuoNFoldPushKind });
  },

  openPlayerPick() {
    if (this.data.teamedPartyMode) {
      wx.showToast({ title: "编队组合不可拆分选人", icon: "none" });
      return;
    }
    if (this.data.playerPickLocked) {
      wx.showToast({ title: "本组须全部上场", icon: "none" });
      return;
    }
    // 两人玩法允许近百人；超过 8 人用摘要模式，不渲染逐场对决
    const maxSelect = this.data.isThreePlayer
      ? this.data.needPlayers
      : this.data.showTwoParty || this.data.showLasuoFamily
        ? 0
        : Number(this.data.maxPlayers) || Number(this.data.needPlayers) || 0;
    const minSelect = this.data.showHorn
      ? 5
      : this.data.showLasuoN
      ? 5
      : this.data.isThreePlayer
        ? this.data.needPlayers
        : 2;
    const selectedIds = (this.data.players || [])
      .filter(function (item) {
        return item.selected !== false;
      })
      .map(function (item) {
        return item.id;
      });
    const roster = session.listPlayers(this.data.entry).map(function (item) {
      return faceOf(item);
    });
    const self = this;
    wx.navigateTo({
      url: session.withHost(
        "/subpackages/game/pages/pick-players/index?entry=" +
          encodeURIComponent(this.data.entry || "hub") +
          "&max=" +
          maxSelect +
          "&min=" +
          minSelect +
          "&layoutMode=event-groups"
      ),
      events: {
        done: function (payload) {
          self.applyPlayerPick((payload && payload.selectedIds) || []);
        }
      },
      success: function (res) {
        if (res.eventChannel && res.eventChannel.emit) {
          res.eventChannel.emit("init", {
            entry: self.data.entry,
            players: roster,
            selectedIds: selectedIds,
            maxSelect: maxSelect,
            minSelect: minSelect,
            locked: false
          });
        }
      }
    });
  },

  openScoreConfig() {
    const selected = (this.data.players || []).filter(function (item) {
      return item.selected !== false;
    });
    if (selected.length < 1) {
      wx.showToast({ title: "请先选择参与人员", icon: "none" });
      return;
    }
    const self = this;
    wx.navigateTo({
      url: session.withHost("/subpackages/game/pages/score-config/index"),
      events: {
        done: function (payload) {
          self.applyScoreConfig((payload && payload.players) || []);
        }
      },
      success: function (res) {
        if (res.eventChannel && res.eventChannel.emit) {
          res.eventChannel.emit("init", {
            players: selected,
            defaultScoreCode: self.data.defaultScoreCode || "8421",
            showInstanceDeduct: !!self.data.showInstanceDeduct,
            scorePresets: self.data.scorePresets || [],
            ruleSnapshot: self.data.ruleSnapshot || null
          });
        }
      }
    }    );
  },

  persistExistingScorePlayers(players) {
    if (!this.data.gameId) return { ok: true };
    if (typeof session.persistLivePlayerScores !== "function") return { ok: true };
    const saved = session.persistLivePlayerScores(
      this.data.entry,
      this.data.gameId,
      players || this.data.players || [],
      this._repoRevision != null ? { expectedRevision: this._repoRevision } : {}
    );
    if (saved && saved.__fail) {
      wx.showToast({ title: saved.message || "保存失败", icon: "none" });
      return saved;
    }
    if (saved && saved.revision != null) this._repoRevision = Number(saved.revision);
    return saved;
  },

  applyScoreConfig(updated) {
    const byId = {};
    (updated || []).forEach(function (item) {
      if (item && item.id) byId[item.id] = item;
    });
    const players = (this.data.players || []).map(function (item) {
      const hit = byId[item.id];
      if (!hit) return item;
      return Object.assign({}, item, {
        scoreCode: hit.scoreCode != null && hit.scoreCode !== "" ? hit.scoreCode : item.scoreCode,
        scoreRows: takeScoreRows(hit, item),
        scoreOverrides: Object.prototype.hasOwnProperty.call(hit, "scoreOverrides")
          ? hit.scoreOverrides
          : item.scoreOverrides
      });
    });
    if (this.data.gameId) {
      const saved = this.persistExistingScorePlayers(players);
      if (saved && saved.__fail) return;
    }
    this.setData(
      Object.assign(
        {
          players: withScoreTones(players, this.data.defaultScoreCode)
        },
        rankFromPage(this, players, this.data.pairs),
        orderPatch(
          players,
          this.data.playerOrder,
          this.data.sortMode,
          this.data.groupMode,
          false,
          this.data.ruleId,
          this.data.dizhuboMode,
          this.data.formation,
          pageLasuoNOpts(this.data)
        )
      )
    );
  },

  applyPlayerPick(selectedIds, playerConfigs) {
    const ids = selectedIds || [];
    const configs = playerConfigs || {};
    const prevById = {};
    (this.data.players || []).forEach(function (item) {
      prevById[item.id] = item;
    });
    const rosterById = {};
    session.listPlayers(this.data.entry).forEach(function (item) {
      rosterById[item.id] = item;
    });
    const defaultScoreCode = this.data.defaultScoreCode || "8421";
    const players = ids
      .map(function (id) {
        const prev = prevById[id];
        const cfg = configs[id] || {};
        const person = rosterById[id] || prev;
        if (!person) return null;
        return faceOf(
          Object.assign(
          {},
          prev || {},
          cfg,
          pickPlayerScoreMeta(prev),
          pickPlayerScoreMeta(cfg),
          {
            id: person.id,
            selected: true,
            scoreCode: cfg.scoreCode || (prev && prev.scoreCode) || defaultScoreCode,
            hcp: (prev && prev.hcp) || person.hcp || "18",
            hcapPar3: (prev && prev.hcapPar3) || "0",
            hcapPar4: (prev && prev.hcapPar4) || "0",
            hcapPar5: (prev && prev.hcapPar5) || "0"
          }
        )
        );
      })
      .filter(Boolean);
    const selectedCount = players.length;
    const order = orderPatch(
      players,
      this.data.playerOrder,
      this.data.sortMode,
      this.data.groupMode,
      false,
      this.data.ruleId,
      this.data.dizhuboMode,
      this.data.formation,
      pageLasuoNOpts(this.data)
    );
    if (!this.data.showTwoParty) {
      this.setData(
        Object.assign(
          {
            players: withScoreTones(players, defaultScoreCode),
            selectedCount: selectedCount,
            lasuoNManyPlayers: lasuoNManyPlayersOf(this.data.showLasuoFamily, selectedCount),
            rosterCompact: false,
            showSetupRest: isSetupRestReady(
              this.data.isThreePlayer,
              this.data.playerPickLocked,
              players,
              this.data.needPlayers,
              this.data.usePagePick,
              this.data.showLasuoN,
              this.data.showHorn,
              this.data.teamedPartyMode,
              this.data.partyPickExact,
              this.data.ruleId,
              this.data.formationParties
            )
          },
          order,
          rankFromPage(this, players, this.data.pairs),
          lasuoHcapPatch(players),
          this.data.showLasuoFamily
            ? lasuoNPatch(players, lasuoNCallOpts(this.data))
            : {}
        )
      );
      return;
    }
    const pairUi = this.data.showThreeSet
      ? threeSetPairsPatch(this, players, this.data.pairs)
      : twoPartyPairsPatch(
          true,
          players,
          this.data.pairs,
          this.data.holes,
          this.data.hcapNoHoles,
          partyMatchupOptsFrom(
            this.data.teamedPartyMode,
            this.data.ruleId,
            this.data.formationParties,
            !!this.data.matchupLocked
          )
        );
    this.setData(
      Object.assign(
        {
          players: withScoreTones(players, defaultScoreCode),
          selectedCount: selectedCount,
          pairs: pairUi.pairs,
          pairCount: pairUi.pairCount,
          rosterCompact: pairUi.rosterCompact
        },
        order,
        rankFromPage(this, players, pairUi.pairs),
        lasuoHcapPatch(players)
      )
    );
  },

  togglePlayer(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const players = this.data.players.slice();
    const hit = players[idx];
    if (hit && hit.required) {
      return;
    }
    const selectedCount = players.filter(function (item) {
      return item.selected;
    }).length;
    if (this.data.playerPickLocked) {
      return;
    }
    if (this.data.teamedPartyMode) {
      const exact = Number(this.data.partyPickExact) || 0;
      const nextSelected = !players[idx].selected;
      const teamedAllPairs = catalog.isAllPairsOneVsOneCatalog(this.data.ruleId);
      if (!teamedAllPairs && nextSelected && exact && selectedCount >= exact) {
        wx.showToast({ title: "最多选择 " + exact + " 方", icon: "none" });
        return;
      }
      players[idx].selected = nextSelected;
      const trialIds = players
        .filter(function (item) {
          return item.selected;
        })
        .map(function (item) {
          return item.id;
        });
      if (
        trialIds.length === exact &&
        !partyFormation.isSelectionCompatible(
          this.data.formationParties,
          trialIds,
          this.data.ruleId
        )
      ) {
        players[idx].selected = !nextSelected;
        wx.showToast({ title: "该方组合与玩法结构不兼容", icon: "none" });
        return;
      }
      const order = orderPatch(
        players,
        this.data.playerOrder,
        this.data.sortMode,
        this.data.groupMode,
        false,
        this.data.ruleId,
        this.data.dizhuboMode,
        this.data.formation,
        pageLasuoNOpts(this.data)
      );
      const selectedN = players.filter(function (item) {
        return item.selected;
      }).length;
      let pairUi = { pairs: this.data.pairs || [], pairCount: this.data.pairCount || 0 };
      if (this.data.showTwoParty) {
        pairUi = this.data.showThreeSet
          ? threeSetPairsPatch(this, players, this.data.pairs)
          : twoPartyPairsPatch(
              true,
              players,
              this.data.pairs,
              this.data.holes,
              this.data.hcapNoHoles,
              partyMatchupOptsFrom(
                this.data.teamedPartyMode,
                this.data.ruleId,
                this.data.formationParties,
                !!this.data.matchupLocked
              )
            );
        if (!this.data.showThreeSet) {
          const faceById = {};
          (this.data.formationParties || []).forEach(function (p) {
            faceById[String(p.partyId)] = session.buildParticipantSubject(p, {
              selected: true,
              required: false
            });
          });
          pairUi.pairs = (pairUi.pairs || []).map(function (pair) {
            return pairFaces(
              Object.assign({}, pair, {
                leftSubject: faceById[String(pair.leftId || pair.leftPartyId)],
                rightSubject: faceById[String(pair.rightId || pair.rightPartyId)],
                leftPartyId: pair.leftPartyId || pair.leftId,
                rightPartyId: pair.rightPartyId || pair.rightId
              })
            );
          });
        }
      }
      this.setData(
        Object.assign(
          {
            players: withScoreTones(players, this.data.defaultScoreCode),
            selectedCount: selectedN,
            pairs: pairUi.pairs,
            pairCount: pairUi.pairCount,
            showSetupRest: isSetupRestReady(
              this.data.isThreePlayer,
              this.data.playerPickLocked,
              players,
              this.data.needPlayers,
              this.data.usePagePick,
              this.data.showLasuoN,
              this.data.showHorn,
              this.data.teamedPartyMode,
              this.data.partyPickExact,
              this.data.ruleId,
              this.data.formationParties
            )
          },
          order,
          rankFromPage(this, players, pairUi.pairs)
        )
      );
      return;
    }
    if (this.data.isThreePlayer) {
      if (!players[idx].selected && selectedCount >= this.data.needPlayers) {
        wx.showToast({ title: "最多选 " + this.data.needPlayers + " 人", icon: "none" });
        return;
      }
    } else if (!this.data.showLasuoFamily && players[idx].selected && selectedCount <= 2) {
      wx.showToast({ title: "至少选 2 人", icon: "none" });
      return;
    }
    if (
      !this.data.isThreePlayer &&
      !this.data.showTwoParty &&
      !this.data.showLasuoFamily &&
      !players[idx].selected
    ) {
      const cap = partySelectCap(this.data);
      if (cap && selectedCount >= cap) {
        wx.showToast({ title: "本组最多 " + cap + " 人", icon: "none" });
        return;
      }
    }
    players[idx].selected = !players[idx].selected;
    const order = orderPatch(
      players,
      this.data.playerOrder,
      this.data.sortMode,
      this.data.groupMode,
      false,
      this.data.ruleId,
      this.data.dizhuboMode,
      this.data.formation,
      pageLasuoNOpts(this.data)
    );
    if (!this.data.showTwoParty) {
      this.setData(
        Object.assign(
          {
            players: players,
            selectedCount: players.filter(function (item) {
              return item.selected;
            }).length,
            lasuoNManyPlayers: lasuoNManyPlayersOf(
              this.data.showLasuoFamily,
              players.filter(function (item) {
                return item.selected;
              }).length
            ),
            rosterCompact: false,
            showSetupRest: isSetupRestReady(
              this.data.isThreePlayer,
              this.data.playerPickLocked,
              players,
              this.data.needPlayers,
              this.data.usePagePick,
              this.data.showLasuoN,
              this.data.showHorn,
              this.data.teamedPartyMode,
              this.data.partyPickExact,
              this.data.ruleId,
              this.data.formationParties
            )
          },
          order,
          rankFromPage(this, players, this.data.pairs),
          lasuoHcapPatch(players),
          this.data.showLasuoFamily
            ? lasuoNPatch(players, lasuoNCallOpts(this.data))
            : {}
        )
      );
      return;
    }
    const pairUi = this.data.showThreeSet
      ? threeSetPairsPatch(this, players, this.data.pairs)
      : twoPartyPairsPatch(
          true,
          players,
          this.data.pairs,
          this.data.holes,
          this.data.hcapNoHoles,
          partyMatchupOptsFrom(
            this.data.teamedPartyMode,
            this.data.ruleId,
            this.data.formationParties,
            !!this.data.matchupLocked
          )
        );
    let nextPairs = pairUi.pairs;
    if (this.data.showYoucai) {
      const gameHoles = this.data.holes;
      nextPairs = (nextPairs || []).map(function (pair) {
        return migrateYoucaiPairToMatchHcap(pair, gameHoles);
      });
    }
    this.setData(
      Object.assign(
        {
          players: players,
          selectedCount: players.filter(function (item) {
            return item.selected;
          }).length,
          pairs: nextPairs,
          pairCount: pairUi.pairCount,
          rosterCompact: pairUi.rosterCompact
        },
        order,
        rankFromPage(this, players, nextPairs)
      )
    );
  },

  onPairStrokes(e) {
    const id = e.currentTarget.dataset.id;
    const pairs = (this.data.pairs || []).map(function (item) {
      if (item.id !== id) return item;
      return Object.assign({}, item, { strokes: e.detail.value });
    });
    this.setData(
      Object.assign(
        { pairs: pairs },
        rankFromPage(this, this.data.players, pairs)
      )
    );
  },

  togglePair(e) {
    if (this.data.matchupLocked) {
      return;
    }
    if (this.data.teamedPartyMode && !catalog.isAllPairsOneVsOneCatalog(this.data.ruleId)) {
      return;
    }
    const id = e.currentTarget.dataset.id;
    let pairs = (this.data.pairs || []).map(function (item) {
      if (item.id !== id) return item;
      return Object.assign({}, item, { on: !item.on });
    });
    if (this.data.showThreeSet) pairs = decorateThreeSetPairRows(pairs);
    if (this.data.showYoucai) {
      const gameHoles = this.data.holes;
      pairs = (pairs || []).map(function (pair) {
        return migrateYoucaiPairToMatchHcap(pair, gameHoles);
      });
    }
    this.setData({
      pairs: pairs,
      pairCount: pairs.filter(function (item) {
        return item.on;
      }).length
    });
  },

  stopTap() {},

  /** 组合逐洞让杆统一入口：比洞 / 油菜 → 同一弹窗 openHcapAdd */
  openPairHoleHcap(e) {
    this.openHcapAdd(e);
  },

  openHcapAdd(e) {
    const id = e.currentTarget.dataset.id;
    const hit = (this.data.pairs || []).find(function (item) {
      return item.id === id;
    });
    if (!hit || !hit.on) return;
    if (hit.hcapAddOff) {
      wx.showToast({ title: this.data.hcapNoHoles ? "已有让杆" : "有效洞已满，无法新增", icon: "none" });
      return;
    }
    const hcapHoles = holesForHcapForm(hit.hcapList || [], -1, null, this.data.holes);
    this.setData({
      showHcapSheet: true,
      hcapPersonal: false,
      hcapPairId: id,
      hcapEditIndex: -1,
      hcapCanDelete: false,
      hcapLeftName: pairFaces(hit).leftName,
      hcapLeftAvatar: pairFaces(hit).leftAvatar,
      hcapLeftFace: pairFaces(hit).leftFace,
      hcapRightName: pairFaces(hit).rightName,
      hcapRightAvatar: pairFaces(hit).rightAvatar,
      hcapRightFace: pairFaces(hit).rightFace,
      hcapPar3: "0",
      hcapPar4: "0",
      hcapPar5: "0",
      hcapHoles: hcapHoles,
      hcapHoleCount: hcapHoleCount(hcapHoles),
      hcapTag: detectHcapTag(hcapHoles, this.data.holeOrder) || "all",
      showHcapWheel: false
    });
  },

  openHcapEdit(e) {
    const id = e.currentTarget.dataset.id;
    const idx = Number(e.currentTarget.dataset.index);
    const hit = (this.data.pairs || []).find(function (item) {
      return item.id === id;
    });
    if (!hit) return;
    const cfg = (hit.hcapList || [])[idx];
    if (!cfg) return;
    const hcapHoles = holesForHcapForm(hit.hcapList || [], idx, cfg, this.data.holes);
    this.setData({
      showHcapSheet: true,
      hcapPersonal: false,
      hcapPairId: id,
      hcapEditIndex: idx,
      hcapCanDelete: true,
      hcapLeftName: pairFaces(hit).leftName,
      hcapLeftAvatar: pairFaces(hit).leftAvatar,
      hcapLeftFace: pairFaces(hit).leftFace,
      hcapRightName: pairFaces(hit).rightName,
      hcapRightAvatar: pairFaces(hit).rightAvatar,
      hcapRightFace: pairFaces(hit).rightFace,
      hcapPar3: HCAP_STEPS[hcapIndex(cfg.par3)],
      hcapPar4: HCAP_STEPS[hcapIndex(cfg.par4)],
      hcapPar5: HCAP_STEPS[hcapIndex(cfg.par5)],
      hcapHoles: hcapHoles,
      hcapHoleCount: hcapHoleCount(hcapHoles),
      hcapTag: detectHcapTag(hcapHoles, this.data.holeOrder) || "all",
      showHcapWheel: false
    });
  },

  closeHcap() {
    this.setData({
      showHcapSheet: false,
      showHcapWheel: false,
      hcapPersonal: false,
      hcapGroupRecv: false,
      hcapPickRecv: false,
      hcapPlayerId: "",
      threeSetHcapWheel: false
    });
  },

  openThreeSetHcap(e) {
    if (!this.data.showThreeSet) return;
    const id = e.currentTarget.dataset.id;
    const hit = (this.data.pairs || []).find(function (item) {
      return item.id === id;
    });
    if (!hit || !hit.on) return;
    const faces = pairFaces(hit);
    const segs = readPairSegmentHandicaps(hit);
    this.setData({
      showThreeSetHcapSheet: true,
      threeSetHcapPairId: id,
      hcapLeftFace: faces.leftFace,
      hcapRightFace: faces.rightFace,
      hcapLeftName: faces.leftName,
      hcapRightName: faces.rightName,
      threeSetDraftFront: segs.front,
      threeSetDraftBack: segs.back,
      threeSetDraftOverall: segs.overall,
      showHcapWheel: false,
      threeSetHcapWheel: false
    });
  },

  closeThreeSetHcap() {
    this.setData({
      showThreeSetHcapSheet: false,
      showHcapWheel: false,
      threeSetHcapWheel: false,
      threeSetHcapPairId: ""
    });
  },

  openThreeSetHcapWheel(e) {
    const ds = e.currentTarget.dataset || {};
    const key = ds.key === "back" ? "back" : ds.key === "overall" ? "overall" : "front";
    const field =
      key === "front"
        ? "threeSetDraftFront"
        : key === "back"
          ? "threeSetDraftBack"
          : "threeSetDraftOverall";
    const titles = { front: "前九让杆", back: "后九让杆", overall: "全场让杆" };
    const idx = hcapIndex(this.data[field]);
    this.setData({
      showHcapWheel: true,
      threeSetHcapWheel: true,
      hcapWheelKey: key,
      hcapWheelTitle: titles[key] || "让杆",
      hcapWheelIndex: [idx],
      hcapWheelDraft: HCAP_STEPS[idx]
    });
  },

  applyThreeSetHcap() {
    if (!this.data.showThreeSet) return;
    const pairId = String(this.data.threeSetHcapPairId || "");
    const segs = {
      front: normalizeSegHandicapValue(this.data.threeSetDraftFront),
      back: normalizeSegHandicapValue(this.data.threeSetDraftBack),
      overall: normalizeSegHandicapValue(this.data.threeSetDraftOverall)
    };
    if (!isHalfStrokes(segs.front) || !isHalfStrokes(segs.back) || !isHalfStrokes(segs.overall)) {
      wx.showToast({ title: "让杆须为 0.5 的倍数", icon: "none" });
      return;
    }
    const pairs = decorateThreeSetPairRows(
      (this.data.pairs || []).map(function (p) {
        if (!p || String(p.id) !== pairId) return p;
        return attachPairSegmentFields(p, segs);
      })
    );
    this.setData({
      pairs: pairs,
      showThreeSetHcapSheet: false,
      showHcapWheel: false,
      threeSetHcapWheel: false
    });
  },

  openHcapWheel(e) {
    if (this.data.showThreeSetHcapSheet) return;
    const key = e.currentTarget.dataset.key;
    const titles = this.data.hcapNoHoles && !this.data.hcapPersonal
      ? { par3: "前9洞", par4: "后9洞", par5: "18洞" }
      : { par3: "PAR3", par4: "PAR4", par5: "PAR5" };
    const field = key === "par3" ? "hcapPar3" : key === "par4" ? "hcapPar4" : "hcapPar5";
    const idx = hcapIndex(this.data[field]);
    this.setData({
      showHcapWheel: true,
      threeSetHcapWheel: false,
      hcapWheelKey: key,
      hcapWheelTitle: titles[key] || "让杆",
      hcapWheelIndex: [idx],
      hcapWheelDraft: HCAP_STEPS[idx]
    });
  },

  closeHcapWheel() {
    this.setData({ showHcapWheel: false, threeSetHcapWheel: false });
  },

  onHcapWheelChange(e) {
    const idx = Number((e.detail.value || [])[0] || 0);
    this.setData({
      hcapWheelIndex: [idx],
      hcapWheelDraft: HCAP_STEPS[idx] || "0"
    });
  },

  applyHcapWheel() {
    const key = this.data.hcapWheelKey;
    const value = this.data.hcapWheelDraft || "0";
    const patch = { showHcapWheel: false, threeSetHcapWheel: false };
    if (this.data.threeSetHcapWheel) {
      if (key === "front") patch.threeSetDraftFront = value;
      else if (key === "back") patch.threeSetDraftBack = value;
      else patch.threeSetDraftOverall = value;
      this.setData(patch);
      return;
    }
    if (key === "par3") patch.hcapPar3 = value;
    else if (key === "par4") patch.hcapPar4 = value;
    else patch.hcapPar5 = value;
    this.setData(patch);
  },

  toggleHcapHole(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const hcapHoles = this.data.hcapHoles.slice();
    if (!hcapHoles[idx] || hcapHoles[idx].locked) return;
    hcapHoles[idx].on = !hcapHoles[idx].on;
    this.setData({
      hcapHoles: hcapHoles,
      hcapHoleCount: hcapHoleCount(hcapHoles),
      hcapTag: detectHcapTag(hcapHoles, this.data.holeOrder)
    });
  },

  toggleHcapAll() {
    const holes = this.data.hcapHoles || [];
    if (this.data.hcapTag === "all") {
      const hcapHoles = holes.map(function (item) {
        if (item.locked) return item;
        return Object.assign({}, item, { on: false });
      });
      this.setData({
        hcapHoles: hcapHoles,
        hcapHoleCount: hcapHoleCount(hcapHoles),
        hcapTag: ""
      });
      return;
    }
    const hcapHoles = holes.map(function (item) {
      if (item.locked) return item;
      return Object.assign({}, item, { on: true });
    });
    this.setData({
      hcapHoles: hcapHoles,
      hcapHoleCount: hcapHoleCount(hcapHoles),
      hcapTag: "all"
    });
  },

  setHcapHoleGroup(e) {
    const group = e.currentTarget.dataset.group;
    if (this.data.hcapTag === group) {
      this.setData({ hcapTag: "" });
      return;
    }
    const hcapHoles = applyHcapGroup(this.data.hcapHoles, group, this.data.holeOrder);
    this.setData({
      hcapHoles: hcapHoles,
      hcapHoleCount: hcapHoleCount(hcapHoles),
      hcapTag: group
    });
  },

  openRecvHcapAdd(e) {
    const id = e.currentTarget.dataset.id;
    const hit = (this.data.players || []).find(function (item) {
      return item.id === id;
    });
    if (!hit || !hit.selected) return;
    if (hit.hcapAddOff) {
      wx.showToast({ title: "有效洞已满，无法新增", icon: "none" });
      return;
    }
    this.fillRecvHcapSheet(hit, -1);
  },

  toggleLasuoHcapFold() {
    this.setData(exclusiveFoldPatch(this.data, "lasuoFoldHcap"));
  },

  openLasuoHcapAdd() {
    if (!this.data.lasuoHcapCanAdd) {
      wx.showToast({ title: "有效洞已满，无法新增", icon: "none" });
      return;
    }
    const hcapRecvOptions = (this.data.players || [])
      .filter(function (item) {
        return item && item.selected !== false;
      })
      .map(faceOf);
    if (!hcapRecvOptions.length) {
      wx.showToast({ title: "请先选择球员", icon: "none" });
      return;
    }
    this.setData({
      showHcapSheet: true,
      hcapPickRecv: true,
      hcapPersonal: false,
      hcapGroupRecv: true,
      hcapRecvOptions: hcapRecvOptions,
      hcapPlayerId: "",
      hcapEditIndex: -1,
      hcapCanDelete: false,
      hcapLeftName: "",
      hcapLeftAvatar: "",
      hcapLeftFace: {},
      hcapRightName: "",
      hcapRightAvatar: "",
      hcapRightFace: {},
      showHcapWheel: false
    });
  },

  pickHcapRecv(e) {
    const id = e.currentTarget.dataset.id;
    const hit = (this.data.players || []).find(function (item) {
      return item.id === id;
    });
    if (!hit || !hit.selected) return;
    if (hit.hcapAddOff) {
      wx.showToast({ title: "该球员有效洞已满", icon: "none" });
      return;
    }
    this.fillRecvHcapSheet(hit, -1);
  },

  fillRecvHcapSheet(hit, editIndex) {
    const cfg = editIndex >= 0 ? (hit.hcapList || [])[editIndex] : null;
    const hcapHoles = holesForHcapForm(hit.hcapList || [], editIndex, cfg, this.data.holes);
    this.setData({
      showHcapSheet: true,
      hcapPickRecv: false,
      hcapPersonal: false,
      hcapGroupRecv: true,
      hcapPlayerId: hit.id,
      hcapEditIndex: editIndex,
      hcapCanDelete: editIndex >= 0,
      hcapLeftName: faceOf(hit).name,
      hcapLeftAvatar: faceOf(hit).avatar,
      hcapLeftFace: faceOf(hit),
      hcapRightName: "",
      hcapRightAvatar: "",
      hcapRightFace: {},
      hcapPar3: cfg ? HCAP_STEPS[hcapIndex(cfg.par3)] : "0",
      hcapPar4: cfg ? HCAP_STEPS[hcapIndex(cfg.par4)] : "0",
      hcapPar5: cfg ? HCAP_STEPS[hcapIndex(cfg.par5)] : "0",
      hcapHoles: hcapHoles,
      hcapHoleCount: hcapHoleCount(hcapHoles),
      hcapTag: detectHcapTag(hcapHoles, this.data.holeOrder) || "all",
      showHcapWheel: false
    });
  },

  openRecvHcapEdit(e) {
    const id = e.currentTarget.dataset.id;
    const idx = Number(e.currentTarget.dataset.index);
    const hit = (this.data.players || []).find(function (item) {
      return item.id === id;
    });
    if (!hit) return;
    const cfg = (hit.hcapList || [])[idx];
    if (!cfg) return;
    const hcapHoles = holesForHcapForm(hit.hcapList || [], idx, cfg, this.data.holes);
    this.setData({
      showHcapSheet: true,
      hcapPickRecv: false,
      hcapPersonal: false,
      hcapGroupRecv: true,
      hcapPlayerId: id,
      hcapEditIndex: idx,
      hcapCanDelete: true,
      hcapLeftName: faceOf(hit).name,
      hcapLeftAvatar: faceOf(hit).avatar,
      hcapLeftFace: faceOf(hit),
      hcapRightName: "",
      hcapRightAvatar: "",
      hcapRightFace: {},
      hcapPar3: HCAP_STEPS[hcapIndex(cfg.par3)],
      hcapPar4: HCAP_STEPS[hcapIndex(cfg.par4)],
      hcapPar5: HCAP_STEPS[hcapIndex(cfg.par5)],
      hcapHoles: hcapHoles,
      hcapHoleCount: hcapHoleCount(hcapHoles),
      hcapTag: detectHcapTag(hcapHoles, this.data.holeOrder) || "all",
      showHcapWheel: false
    });
  },

  patchPlayerHcapList(id, nextList) {
    const gameHoles = this.data.holes;
    const players = decoratePlayersHcap(
      (this.data.players || []).map(function (item) {
        if (item.id !== id) return item;
        return Object.assign({}, item, { hcapList: nextList });
      }),
      gameHoles
    );
    this.setData(
      Object.assign(
        {
          players: players,
          showHcapSheet: false,
          showHcapWheel: false,
          hcapGroupRecv: false,
          hcapPickRecv: false,
          hcapPlayerId: ""
        },
        orderPatch(players, this.data.playerOrder, this.data.sortMode, this.data.groupMode, false, this.data.ruleId, this.data.dizhuboMode, this.data.formation, pageLasuoNOpts(this.data)),
        rankFromPage(this, players, this.data.pairs),
        lasuoHcapPatch(players)
      )
    );
  },

  applyHcap() {
    if (this.data.hcapPickRecv) {
      wx.showToast({ title: "请先选择受让人", icon: "none" });
      return;
    }
    const par3 = HCAP_STEPS[hcapIndex(this.data.hcapPar3)];
    const par4 = HCAP_STEPS[hcapIndex(this.data.hcapPar4)];
    const par5 = HCAP_STEPS[hcapIndex(this.data.hcapPar5)];
    if (this.data.hcapPersonal) {
      const id = this.data.hcapPlayerId;
      const players = (this.data.players || []).map(function (item) {
        if (item.id !== id) return item;
        return Object.assign({}, item, {
          hcapPar3: par3,
          hcapPar4: par4,
          hcapPar5: par5
        });
      });
      this.setData({
        players: players,
        orderedPlayers: decorateOrderRows(players, this.data.playerOrder, this.data.groupMode, this.data.ruleId, this.data.dizhuboMode, this.data.formation, pageLasuoNOpts(this.data)),
        showHcapSheet: false,
        showHcapWheel: false,
        hcapPersonal: false,
        hcapPlayerId: ""
      });
      return;
    }
    const editIndex = this.data.hcapEditIndex;
    if (Number(par3) === 0 && Number(par4) === 0 && Number(par5) === 0) {
      if (editIndex >= 0) {
        this.deleteHcap();
        return;
      }
      this.setData({ showHcapSheet: false, showHcapWheel: false });
      return;
    }
    const noHoles = this.data.hcapNoHoles;
    const hcapHoles = noHoles
      ? []
      : (this.data.hcapHoles || []).map(function (item) {
          return { label: item.label, on: !!item.on && !item.locked };
        });
    if (!noHoles && hcapHoleCount(hcapHoles) < 1) {
      wx.showToast({ title: "请选择有效洞", icon: "none" });
      return;
    }
    const gameHoles = this.data.holes;
    const nextItem = makeHcapItem({ par3: par3, par4: par4, par5: par5, hcapHoles: hcapHoles }, gameHoles, noHoles);
    if (this.data.hcapGroupRecv) {
      const id = this.data.hcapPlayerId;
      const hit = (this.data.players || []).find(function (item) {
        return item.id === id;
      });
      const list = ((hit && hit.hcapList) || []).slice();
      if (editIndex >= 0) list[editIndex] = nextItem;
      else list.push(nextItem);
      this.patchPlayerHcapList(id, pruneHcapList(list, gameHoles));
      return;
    }
    const id = this.data.hcapPairId;
    const pairs = (this.data.pairs || []).map(function (item) {
      if (item.id !== id) return item;
      const list = (item.hcapList || []).slice();
      if (editIndex >= 0) list[editIndex] = nextItem;
      else list.push(nextItem);
      const nextList = noHoles ? list : pruneHcapList(list, gameHoles);
      return decoratePairHcap(item, { hcapList: nextList }, gameHoles, noHoles);
    });
    this.setData(
      Object.assign(
        { pairs: pairs, showHcapSheet: false, showHcapWheel: false },
        rankFromPage(this, this.data.players, pairs)
      )
    );
  },

  confirmDeleteHcap() {
    if (this.data.hcapEditIndex < 0) return;
    const self = this;
    wx.showModal({
      title: "删除让杆",
      content: "确定删除这条让杆配置？",
      success(res) {
        if (!res.confirm) return;
        self.deleteHcap();
      }
    });
  },

  deleteHcap() {
    const editIndex = this.data.hcapEditIndex;
    if (editIndex < 0) return;
    const gameHoles = this.data.holes;
    if (this.data.hcapGroupRecv) {
      const id = this.data.hcapPlayerId;
      const hit = (this.data.players || []).find(function (item) {
        return item.id === id;
      });
      const list = ((hit && hit.hcapList) || []).slice();
      list.splice(editIndex, 1);
      this.patchPlayerHcapList(id, pruneHcapList(list, gameHoles));
      return;
    }
    const id = this.data.hcapPairId;
    const noHoles = this.data.hcapNoHoles;
    const pairs = (this.data.pairs || []).map(function (item) {
      if (item.id !== id) return item;
      const list = (item.hcapList || []).slice();
      list.splice(editIndex, 1);
      const nextList = noHoles ? list : pruneHcapList(list, gameHoles);
      return decoratePairHcap(item, { hcapList: nextList }, gameHoles, noHoles);
    });
    this.setData(
      Object.assign(
        { pairs: pairs, showHcapSheet: false, showHcapWheel: false },
        rankFromPage(this, this.data.players, pairs)
      )
    );
  },

  openHoles() {
    const holeDraft = (this.data.holes || []).map(function (item) {
      return { label: item.label, on: !!item.on };
    });
    this.setData({
      showHoleSheet: true,
      holeDraft: holeDraft,
      holeDraftCount: hcapHoleCount(holeDraft),
      holeTag: detectHcapTag(holeDraft, this.data.holeOrder) || "all"
    });
  },

  closeHoles() {
    this.setData({ showHoleSheet: false });
  },

  openHoleOrder() {
    if (!this.data.showInstanceHoleOrder) return;
    const holeOrderDraft = session.getHoleOrder(this.data.entry);
    this.setData({
      showHoleOrderSheet: true,
      holeOrderDraft: holeOrderDraft,
      holeOrderDragging: false,
      holeOrderDragIndex: -1
    });
  },

  closeHoleOrder() {
    this._holeOrderDrag = null;
    this.setData({
      showHoleOrderSheet: false,
      holeOrderDragging: false,
      holeOrderDragIndex: -1
    });
  },

  applyHoleOrder() {
    if (!this.data.showInstanceHoleOrder) return;
    const holeOrder = session.setHoleOrder(this.data.entry, this.data.holeOrderDraft);
    const holes = holeOrderUtil.alignHolesToFullOrder(this.data.holes, holeOrder);
    this._holeOrderDrag = null;
    this.setData({
      holeOrder: holeOrder,
      holeOrderText: holeOrderTextOf(holeOrder),
      holes: holes,
      holeCount: holes.filter(function (item) {
        return item.on;
      }).length,
      showHoleOrderSheet: false,
      holeOrderDragging: false,
      holeOrderDragIndex: -1
    });
  },

  applyHoleOrderMove(from, to, extra) {
    const holeOrderDraft = moveHoleOrderIndex(this.data.holeOrderDraft, from, to);
    this.setData(Object.assign({ holeOrderDraft: holeOrderDraft }, extra || {}));
  },

  onHoleOrderTouchStart(e) {
    const index = Number(e.currentTarget.dataset.index);
    const touch = e.touches && e.touches[0];
    if (!touch || isNaN(index)) return;
    this._holeOrderDrag = {
      index: index,
      startX: touch.clientX,
      startY: touch.clientY,
      armed: false
    };
    const query = wx.createSelectorQuery().in(this);
    query.selectAll(".hole-order-cell").boundingClientRect();
    query.exec(
      function (res) {
        this._holeOrderRects = (res && res[0]) || [];
      }.bind(this)
    );
  },

  onHoleOrderTouchMove(e) {
    if (!this._holeOrderDrag) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    const dx = touch.clientX - this._holeOrderDrag.startX;
    const dy = touch.clientY - this._holeOrderDrag.startY;
    if (!this._holeOrderDrag.armed) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      this._holeOrderDrag.armed = true;
      this.setData({
        holeOrderDragging: true,
        holeOrderDragIndex: this._holeOrderDrag.index
      });
    }
    const rects = this._holeOrderRects || [];
    let to = this._holeOrderDrag.index;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (!r) continue;
      if (
        touch.clientX >= r.left &&
        touch.clientX <= r.right &&
        touch.clientY >= r.top &&
        touch.clientY <= r.bottom
      ) {
        to = i;
        break;
      }
    }
    if (to === this._holeOrderDrag.index) return;
    const from = this._holeOrderDrag.index;
    this._holeOrderDrag.index = to;
    this.applyHoleOrderMove(from, to, {
      holeOrderDragging: true,
      holeOrderDragIndex: to
    });
    const query = wx.createSelectorQuery().in(this);
    query.selectAll(".hole-order-cell").boundingClientRect();
    query.exec(
      function (res) {
        this._holeOrderRects = (res && res[0]) || [];
      }.bind(this)
    );
  },

  onHoleOrderTouchEnd(e) {
    if (!this._holeOrderDrag) return;
    const armed = !!this._holeOrderDrag.armed;
    const label = e.currentTarget.dataset.label;
    this._holeOrderDrag = null;
    if (!armed && label) {
      this.setData({
        holeOrderDraft: rotateHoleOrderToStart(this.data.holeOrderDraft, label),
        holeOrderDragging: false,
        holeOrderDragIndex: -1
      });
      return;
    }
    this.setData({
      holeOrderDragging: false,
      holeOrderDragIndex: -1
    });
  },

  applyHoles() {
    const holes = (this.data.holeDraft || []).map(function (item) {
      return { label: item.label, on: !!item.on };
    });
    if (hcapHoleCount(holes) < 1) {
      wx.showToast({ title: "请选择有效洞", icon: "none" });
      return;
    }
    this.setData(
      {
        holes: holes,
        holeCount: hcapHoleCount(holes),
        showHoleSheet: false
      },
      function () {
        this.refreshPairHcaps();
        this.refreshPlayerHcaps();
      }.bind(this)
    );
  },

  refreshPairHcaps() {
    if (!this.data.showMatchHandicap) return;
    const gameHoles = this.data.holes;
    const noHoles = this.data.hcapNoHoles;
    const pairs = (this.data.pairs || []).map(function (item) {
      return decoratePairHcap(item, item, gameHoles, noHoles);
    });
    this.setData(
      Object.assign(
        { pairs: pairs },
        rankFromPage(this, this.data.players, pairs)
      )
    );
  },

  refreshPlayerHcaps() {
    if (!this.data.showHcapRecv) return;
    const players = decoratePlayersHcap(this.data.players, this.data.holes);
    this.setData(
      Object.assign(
        { players: players },
        orderPatch(players, this.data.playerOrder, this.data.sortMode, this.data.groupMode, false, this.data.ruleId, this.data.dizhuboMode, this.data.formation, pageLasuoNOpts(this.data)),
        rankFromPage(this, players, this.data.pairs),
        lasuoHcapPatch(players)
      )
    );
  },

  toggleHole(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const holes = this.data.holeDraft.slice();
    if (!holes[idx]) return;
    holes[idx].on = !holes[idx].on;
    this.setData({
      holeDraft: holes,
      holeDraftCount: hcapHoleCount(holes),
      holeTag: detectHcapTag(holes, this.data.holeOrder)
    });
  },

  toggleHoleAll() {
    const holes = this.data.holeDraft || [];
    if (this.data.holeTag === "all") {
      const holeDraft = holes.map(function (item) {
        return Object.assign({}, item, { on: false });
      });
      this.setData({
        holeDraft: holeDraft,
        holeDraftCount: 0,
        holeTag: ""
      });
      return;
    }
    const holeDraft = holes.map(function (item) {
      return Object.assign({}, item, { on: true });
    });
    this.setData({
      holeDraft: holeDraft,
      holeDraftCount: holeDraft.length,
      holeTag: "all"
    });
  },

  setHoleGroup(e) {
    const group = e.currentTarget.dataset.group;
    if (this.data.holeTag === group) {
      this.setData({ holeTag: "" });
      return;
    }
    const holeDraft = applyHcapGroup(this.data.holeDraft, group, this.data.holeOrder);
    this.setData({
      holeDraft: holeDraft,
      holeDraftCount: hcapHoleCount(holeDraft),
      holeTag: group
    });
  },

  openScore(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const player = this.data.players[idx] || {};
    const code = player.scoreCode || this.data.defaultScoreCode || "8421";
    const isPreset = (this.data.scorePresets || []).indexOf(code) >= 0;
    const deduct = playerScoreCfg.resolve8421PlayerScoreConfig(this.data.ruleSnapshot, player);
    this._scoreSheetStart = Object.assign({}, deduct);
    this.setData({
      showScoreSheet: true,
      scorePlayerIndex: idx,
      scorePlayerName: faceOf(player).name,
      scorePlayerAvatar: faceOf(player).avatar,
      scorePlayerFace: faceOf(player),
      scoreDraft: isPreset ? code : "",
      scoreUsingCustom: !isPreset,
      customScore: "",
      customPlaceholder: "自定义",
      deductMode: deduct.deductMode,
      deductWay: deduct.deductWay,
      deductPlusN: deduct.deductPlusN,
      deductDoubleN: deduct.deductDoubleN,
      deductCap: deduct.deductCap,
      deductCapN: deduct.deductCapN,
      foldDeduct: false,
      deductText: deductThumb(deduct)
    });
  },

  closeScore() {
    this.setData({ showScoreSheet: false });
  },

  pickPreset(e) {
    this.setData({
      scoreDraft: e.currentTarget.dataset.value,
      scoreUsingCustom: false,
      customScore: "",
      customPlaceholder: "自定义"
    });
  },

  onCustomFocus() {
    this.setData({
      scoreUsingCustom: true,
      scoreDraft: "",
      customPlaceholder: ""
    });
  },

  onCustomBlur() {
    if (String(this.data.customScore || "").trim()) return;
    this.setData({ customPlaceholder: "自定义" });
  },

  onCustomScore(e) {
    this.setData({
      customScore: e.detail.value,
      scoreUsingCustom: true,
      scoreDraft: ""
    });
  },

  applyCustomScore() {
    const custom = String(this.data.customScore || "").trim();
    if (custom && !/^\d{4,5}$/.test(custom)) {
      wx.showToast({ title: "请输入4-5位数字", icon: "none" });
      return;
    }
    if (this.data.showInstanceDeduct && this.data.deductMode !== "none") {
      if (this.data.deductWay !== "doublepar-n" && !isNonNegInt(this.data.deductPlusN)) {
        wx.showToast({ title: "扣分起点须为非负整数", icon: "none" });
        return;
      }
      if (this.data.deductWay === "doublepar-n" && !isNonNegInt(this.data.deductDoubleN)) {
        wx.showToast({ title: "双帕加数须为非负整数", icon: "none" });
        return;
      }
      if (this.data.deductCap === "cap" && !isNonNegInt(this.data.deductCapN)) {
        wx.showToast({ title: "扣分封顶须为非负整数", icon: "none" });
        return;
      }
    }
    const idx = this.data.scorePlayerIndex;
    const players = (this.data.players || []).map(function (item, i) {
      return i === idx ? Object.assign({}, item) : item;
    });
    const player = players[idx];
    if (!player) {
      this.setData({ showScoreSheet: false });
      return;
    }
    let value = player.scoreCode;
    if (custom) value = custom;
    else if (!this.data.scoreUsingCustom && this.data.scoreDraft) value = this.data.scoreDraft;
    player.scoreCode = value;
    if (scoreMapUtil.isValidScoreCode(value)) player.scoreRows = null;
    if (this.data.showInstanceDeduct) {
      playerScoreCfg.applyScoreOverridesFromForm(
        player,
        playerScoreCfg.deductFormFromUi(this.data),
        this._scoreSheetStart || playerScoreCfg.deductFormFromUi(this.data)
      );
    }
    if (this.data.gameId) {
      const saved = this.persistExistingScorePlayers(players);
      if (saved && saved.__fail) {
        this.setData({ showScoreSheet: false });
        return;
      }
    }
    this.setData(
      Object.assign(
        {
          players: withScoreTones(players, this.data.defaultScoreCode),
          showScoreSheet: false
        },
        rankFromPage(this, players, this.data.pairs),
        orderPatch(
          players,
          this.data.playerOrder,
          this.data.sortMode,
          this.data.groupMode,
          false,
          this.data.ruleId,
          this.data.dizhuboMode,
          this.data.formation,
          pageLasuoNOpts(this.data)
        )
      )
    );
  },

  toggleFoldDeduct() {
    this.setData(exclusiveFoldPatch(this.data, "foldDeduct"));
  },

  refreshDeduct() {
    this.setData({ deductText: deductThumb(this.data) });
  },

  setDeductMode(e) {
    const value = e.currentTarget.dataset.value;
    const patch = { deductMode: value };
    if (value !== "on") patch.foldDeduct = false;
    this.setData(patch);
    this.refreshDeduct();
  },

  setDeductWay(e) {
    this.setData({ deductWay: e.currentTarget.dataset.value });
    this.refreshDeduct();
  },

  keepDeductWay(e) {
    this.setData({ deductWay: e.currentTarget.dataset.value });
    this.refreshDeduct();
  },

  onDeductPlusN(e) {
    this.setData({
      deductWay: "plus-n",
      deductPlusN: e.detail.value
    });
    this.refreshDeduct();
  },

  onDeductDoubleN(e) {
    this.setData({
      deductWay: "doublepar-n",
      deductDoubleN: e.detail.value
    });
    this.refreshDeduct();
  },

  setDeductCap(e) {
    this.setData({ deductCap: e.currentTarget.dataset.value });
    this.refreshDeduct();
  },

  keepDeductCap() {
    this.setData({ deductCap: "cap" });
    this.refreshDeduct();
  },

  onDeductCapN(e) {
    this.setData({
      deductCap: "cap",
      deductCapN: e.detail.value
    });
    this.refreshDeduct();
  },

  setGroupMode(e) {
    let groupMode = e.currentTarget.dataset.id;
    if (hideSplitHighGroup(this.data.ruleId) && groupMode === "split-high") {
      groupMode = "random";
    }
    this.setData(
      Object.assign(
        { groupMode: groupMode },
        orderPatch(this.data.players, this.data.playerOrder, this.data.sortMode, groupMode, false, this.data.ruleId, this.data.dizhuboMode, this.data.formation, pageLasuoNOpts(this.data))
      )
    );
  },

  setDizhuboMode(e) {
    const dizhuboMode = e.currentTarget.dataset.id === "mid" ? "mid" : "big";
    this.setData(
      Object.assign(
        { dizhuboMode: dizhuboMode },
        orderPatch(
          this.data.players,
          this.data.playerOrder,
          this.data.sortMode,
          this.data.groupMode,
          false,
          this.data.ruleId,
          dizhuboMode,
          this.data.formation,
          pageLasuoNOpts(this.data)
        )
      )
    );
  },

  onUnload() {
    this.stopOrderRoll(true);
  },

  onHide() {
    this.stopOrderRoll(true);
  },

  stopOrderRoll(silent) {
    if (this._orderRollTimer) {
      clearInterval(this._orderRollTimer);
      this._orderRollTimer = null;
    }
    if (!silent && this.data.orderRolling) {
      this.setData({ orderRolling: false, sortMode: "random" });
    } else if (this.data.orderRolling) {
      this.setData({ orderRolling: false });
    }
  },

  setSortMode(e) {
    const sortMode = e.currentTarget.dataset.id;
    if (sortMode === "random") {
      this.toggleRandomSort();
      return;
    }
    this.stopOrderRoll(true);
    this.setData(
      orderPatch(
        this.data.players,
        this.data.playerOrder,
        sortMode,
        this.data.groupMode,
        false,
        this.data.ruleId,
        this.data.dizhuboMode,
        this.data.formation,
        pageLasuoNOpts(this.data)
      )
    );
  },

  toggleRandomSort() {
    if (this.data.orderRolling) {
      this.stopOrderRoll();
      return;
    }
    const roll = function () {
      this.setData(
        Object.assign(
          { orderRolling: true, sortMode: "random" },
          orderPatch(
            this.data.players,
            this.data.playerOrder,
            "random",
            this.data.groupMode,
            true,
            this.data.ruleId,
            this.data.dizhuboMode,
            this.data.formation,
            pageLasuoNOpts(this.data)
          )
        )
      );
    }.bind(this);
    roll();
    this._orderRollTimer = setInterval(roll, 90);
  },

  reshuffleOrder() {
    this.setData(
      orderPatch(this.data.players, this.data.playerOrder, "random", this.data.groupMode, true, this.data.ruleId, this.data.dizhuboMode, this.data.formation, pageLasuoNOpts(this.data))
    );
  },

  applyOrderMove(from, to, extra) {
    const order = (this.data.playerOrder || []).slice();
    const patch = extra || {};
    if (from < 0 || to < 0 || from >= order.length || to >= order.length || from === to) {
      if (extra) this.setData(extra);
      return;
    }
    const item = order.splice(from, 1)[0];
    order.splice(to, 0, item);
    const opts = pageLasuoNOpts(this.data);
    const orderedPlayers = decorateOrderRows(
      this.data.players,
      order,
      this.data.groupMode,
      this.data.ruleId,
      this.data.dizhuboMode,
      this.data.formation,
      opts
    );
    const showFixedPairs = showFixedPairsOf(
      this.data.groupMode,
      orderedPlayers,
      this.data.ruleId,
      opts
    );
    this.setData(
      Object.assign(
        {
          sortMode: "manual",
          playerOrder: order,
          orderedPlayers: orderedPlayers,
          showFixedPairs: showFixedPairs,
          pairRailSegs: showFixedPairs
            ? buildPairRailSegs(orderedPlayers, this.data.ruleId, opts)
            : []
        },
        patch
      )
    );
  },

  moveOrder(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const dir = Number(e.currentTarget.dataset.dir);
    this.applyOrderMove(idx, idx + dir);
  },

  onOrderTouchStart(e) {
    if (!this.data.showOrderDrag || this.data.orderRolling) return;
    const index = Number(e.currentTarget.dataset.index);
    const id = e.currentTarget.dataset.id;
    const touch = e.touches && e.touches[0];
    if (!touch || isNaN(index)) return;
    this._orderDrag = {
      id: id,
      index: index,
      startY: touch.clientY,
      current: index,
      armed: false
    };
    const query = wx.createSelectorQuery().in(this);
    query.selectAll(".order-line").boundingClientRect();
    query.exec(
      function (res) {
        const rects = res && res[0];
        if (rects && rects.length && rects[0].height) {
          this._orderRowH = rects[0].height;
        }
      }.bind(this)
    );
  },

  onOrderTouchMove(e) {
    if (!this.data.showOrderDrag || !this._orderDrag) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    const dy = touch.clientY - this._orderDrag.startY;
    if (!this._orderDrag.armed) {
      if (Math.abs(dy) < 12) return;
      this._orderDrag.armed = true;
      this.setData({
        orderDragging: true,
        orderDragFrom: this._orderDrag.index,
        orderDragId: this._orderDrag.id
      });
    }
    const n = (this.data.orderedPlayers || []).length;
    const rowH = this._orderRowH || 56;
    let to = this._orderDrag.index + Math.round(dy / rowH);
    if (to < 0) to = 0;
    if (to > n - 1) to = n - 1;
    if (to !== this._orderDrag.index) {
      const from = this._orderDrag.index;
      this._orderDrag.index = to;
      this._orderDrag.current = to;
      this._orderDrag.startY += (to - from) * rowH;
      this.applyOrderMove(from, to, {
        orderDragging: true,
        orderDragFrom: to,
        orderDragId: this._orderDrag.id,
        orderDragOffset: touch.clientY - this._orderDrag.startY
      });
      return;
    }
    this._orderDrag.current = to;
    this.setData({ orderDragOffset: dy });
  },

  onOrderTouchEnd() {
    if (!this._orderDrag) return;
    const armed = !!this._orderDrag.armed;
    this._orderDrag = null;
    const patch = {
      orderDragging: false,
      orderDragFrom: -1,
      orderDragId: "",
      orderDragOffset: 0
    };
    if (armed) patch.sortMode = "manual";
    this.setData(patch);
  },

  openPlayerHcap(e) {
    const id = e.currentTarget.dataset.id;
    const hit = (this.data.players || []).find(function (item) {
      return item.id === id;
    });
    if (!hit) return;
    this.setData({
      showHcapSheet: true,
      hcapPersonal: true,
      hcapPlayerId: id,
      hcapCanDelete: false,
      hcapLeftName: faceOf(hit).name,
      hcapLeftAvatar: faceOf(hit).avatar,
      hcapLeftFace: faceOf(hit),
      hcapRightName: "",
      hcapRightAvatar: "",
      hcapRightFace: {},
      hcapPar3: HCAP_STEPS[hcapIndex(hit.hcapPar3)],
      hcapPar4: HCAP_STEPS[hcapIndex(hit.hcapPar4)],
      hcapPar5: HCAP_STEPS[hcapIndex(hit.hcapPar5)],
      showHcapWheel: false
    });
  },

  setRank(e) {
    const rankId = e.currentTarget.dataset.id;
    const rankFoldText = this.data.showLasuoFamily
      ? labelOf(LASUO_N_RANK_OPTIONS, rankId)
      : labelOf(this.data.rankOptions, rankId);
    const patch = {
      rankId: rankId,
      rankFoldText: rankFoldText
    };
    if (this.data.showLasuoFamily && this.data.sortUpdate !== "fixed") {
      patch.lasuoNSortText = lasuoNSortTextOf("dynamic", rankId);
    }
    this.setData(patch);
  },

  toggleRankFold() {
    this.setData(exclusiveFoldPatch(this.data, "rankFold"));
  },

  togglePairFold() {
    this.setData(exclusiveFoldPatch(this.data, "pairFold"));
  },

    confirmAdd() {
    if (this._confirmAdding) return;
    if (this._assertCanEdit && !this._assertCanEdit()) return;
    this._confirmAdding = true;
    try {
    let selected = (this.data.orderedPlayers && this.data.orderedPlayers.length
      ? this.data.orderedPlayers
      : this.data.players.filter(function (item) {
          return item.selected;
        }));
    selected = mergeScoreFields(selected, this.data.players);
    if (this.data.showHcapRecv) {
      selected = decoratePlayersHcap(selected, this.data.holes);
    }
    if (this.data.teamedPartyMode) {
      const allPairsRule = catalog.isAllPairsOneVsOneCatalog(this.data.ruleId);
      const exact = Number(this.data.partyPickExact) || 0;
      if (!allPairsRule && selected.length !== exact) {
        wx.showToast({ title: "请选择 " + exact + " 方参与", icon: "none" });
        return;
      }
      if (allPairsRule && selected.length < 2) {
        wx.showToast({ title: "请选择至少 2 方参与", icon: "none" });
        return;
      }
      if (
        !partyFormation.isSelectionCompatible(
          this.data.formationParties,
          selected.map(function (item) {
            return item.id;
          }),
          this.data.ruleId
        )
      ) {
        wx.showToast({ title: "参与方结构与玩法不兼容", icon: "none" });
        return;
      }
    }
    if (this.data.showHorn && selected.length < 5) {
      wx.showToast({ title: "喇叭花至少选 5 人", icon: "none" });
      return;
    }
    if (this.data.showLasuoN && selected.length < 5) {
      wx.showToast({ title: "多人拉丝至少选 5 人", icon: "none" });
      return;
    }
    if (this.data.isThreePlayer && selected.length !== this.data.needPlayers) {
      wx.showToast({ title: "请选择 " + this.data.needPlayers + " 名球员", icon: "none" });
      return;
    }
    const exactNeed = Number(this.data.needPlayers) || 0;
    const allPairs = catalog.isAllPairsOneVsOneCatalog(this.data.ruleId);
    if (
      !allPairs &&
      !this.data.showHorn &&
      !this.data.showLasuoN &&
      !this.data.teamedPartyMode &&
      !this.data.showTwoParty &&
      exactNeed >= 2 &&
      exactNeed <= 4 &&
      selected.length !== exactNeed
    ) {
      wx.showToast({
        title: "该规则需要恰好 " + exactNeed + " 个参与方",
        icon: "none"
      });
      return;
    }
    if (selected.length < 2) {
      wx.showToast({ title: "请选择至少 2 名球员", icon: "none" });
      return;
    }
    const partyCap = partySelectCap(this.data);
    if (
      !this.data.showTwoParty &&
      !this.data.showLasuoFamily &&
      partyCap &&
      selected.length > partyCap
    ) {
      wx.showToast({ title: "本组最多 " + partyCap + " 人", icon: "none" });
      return;
    }
    if (this.data.showThreeSet) {
      const orderLen = (session.getHoleOrder(this.data.entry) || []).length;
      if (orderLen !== 18) {
        wx.showToast({ title: "三局需全程 18 洞", icon: "none" });
        return;
      }
    }
    if (!this.data.showThreeSet && this.data.holeCount < 1) {
      wx.showToast({ title: "请选择有效洞", icon: "none" });
      return;
    }
    if (this.data.showLasuoN && this.data.bandMode === "split-high") {
      const n = selected.length;
      const low = Number(this.data.bandLow) || 0;
      const high = n - low;
      if (low < 2 || high < 2) {
        wx.showToast({ title: "低/高差点至少各 2 人", icon: "none" });
        return;
      }
    }
    let pairings = [];
    const thatTeamed = !!this.data.teamedPartyMode;
    const selfFormation = this.data.formationParties || [];
    if (this.data.showTwoParty) {
      if (this.data.rosterCompact || !(this.data.pairs || []).length) {
        const cpOpts = partyMatchupOptsFrom(
          thatTeamed,
          this.data.ruleId,
          selfFormation,
          !!this.data.matchupLocked
        );
        if (cpOpts) {
          pairings = buildPartyPairsFromSelection(
            selfFormation,
            selected.map(function (item) {
              return item.id;
            }),
            [],
            this.data.holes,
            this.data.hcapNoHoles
          ).filter(function (item) {
            return item.on;
          });
        } else {
          pairings = buildPairs(
            selected.map(function (item) {
              return Object.assign({}, item, { selected: true });
            }),
            [],
            this.data.holes,
            this.data.hcapNoHoles
          ).filter(function (item) {
            return item.on;
          });
        }
      } else {
        pairings = (this.data.pairs || []).filter(function (item) {
          return item.on;
        });
      }
      if (!pairings.length) {
        wx.showToast({ title: "请至少保留 1 场对决", icon: "none" });
        return;
      }
      if (this.data.showThreeSet) {
        const badSeg = pairings.some(function (item) {
          const segs = readPairSegmentHandicaps(item);
          return (
            !isHalfStrokes(segs.front) || !isHalfStrokes(segs.back) || !isHalfStrokes(segs.overall)
          );
        });
        if (badSeg) {
          wx.showToast({ title: "让杆须为 0.5 的倍数", icon: "none" });
          return;
        }
        const sv = this.data.segmentValues || {};
        if (
          !isHalfStrokes(sv.front == null || sv.front === "" ? "1" : sv.front) ||
          !isHalfStrokes(sv.back == null || sv.back === "" ? "1" : sv.back) ||
          !isHalfStrokes(sv.overall == null || sv.overall === "" ? "1" : sv.overall)
        ) {
          wx.showToast({ title: "分值须为 0.5 的倍数", icon: "none" });
          return;
        }
      }
      if (!this.data.rosterCompact && this.data.showPairHandicap) {
        const integer = this.data.handicapInteger;
        const bad = pairings.some(function (item) {
          const raw = String(item.strokes == null || item.strokes === "" ? "0" : item.strokes).trim();
          return integer ? !isIntStrokes(raw) : !isHalfStrokes(raw);
        });
        if (bad) {
          wx.showToast({
            title: integer ? "让杆须为整数" : "让杆须为 0.5 的倍数",
            icon: "none"
          });
          return;
        }
        pairings = pairings.map(function (item) {
          const raw = String(item.strokes == null || item.strokes === "" ? "0" : item.strokes).trim();
          return Object.assign({}, item, { strokes: raw || "0" });
        });
      }
      if (!this.data.rosterCompact && this.data.showMatchHandicap) {
        const gameHoles = this.data.holes;
        const noHoles = this.data.hcapNoHoles;
        pairings = pairings.map(function (item) {
          const hcapList = noHoles
            ? readHcapList(item, gameHoles, true)
            : pruneHcapList(readHcapList(item, gameHoles), gameHoles);
          return decoratePairHcap(item, { hcapList: hcapList }, gameHoles, noHoles);
        });
      }
    }
    if (allPairs && !pairings.length) {
      wx.showToast({ title: "请至少保留 1 场对决", icon: "none" });
      return;
    }
    let groupMode = this.data.groupMode;
    if (hideSplitHighGroup(this.data.ruleId) && groupMode === "split-high") {
      groupMode = "random";
    }
    const payload = {
      name: this.data.ruleName,
      catalogId: this.data.ruleId,
      ruleLibId: this.data.ruleLibId,
      ruleSnapshot: session.cloneRule(
        session.ensureStrokePlayReward
          ? session.ensureStrokePlayReward(
              this.data.ruleId,
              Object.assign({}, this.data.ruleSnapshot || {}, {
                scoreCode: this.data.defaultScoreCode || "8421"
              })
            )
          : Object.assign({}, this.data.ruleSnapshot || {}, {
              scoreCode: this.data.defaultScoreCode || "8421"
            })
      ),
      groupMode: groupMode,
      groupModeLabel: labelOf(groupModesOf(this.data.ruleId, this.data.showLandlordGroup), groupMode),
      dizhuboMode: this.data.showDizhubo ? this.data.dizhuboMode || "big" : "",
      dizhuboModeLabel: this.data.showDizhubo
        ? this.data.dizhuboMode === "mid"
          ? "斗二地主婆"
          : "斗大地主婆"
        : "",
      sortMode: this.data.sortMode || "random",
      playerOrder: this.data.playerOrder || [],
      playerCount: selected.length,
      players: selected,
      parties: (function () {
        if (!thatTeamed) return undefined;
        const byId = {};
        (selfFormation || []).forEach(function (p) {
          if (p && p.partyId) byId[String(p.partyId)] = p;
        });
        return selected.map(function (item, order) {
          const hit = byId[String(item.id)];
          return {
            partyId: String(item.id),
            playerIds: hit
              ? hit.playerIds.slice()
              : item.memberPlayerIds && item.memberPlayerIds.length
                ? item.memberPlayerIds.slice()
                : [String(item.id)],
            order: order
          };
        });
      })(),
      selectedPartyIds: thatTeamed
        ? selected.map(function (item) {
            return String(item.id);
          })
        : undefined,
      holeCount: this.data.holeCount,
      holes: this.data.holes.filter(function (item) {
        return item.on;
      }),
      holeOrder: session.getHoleOrder(this.data.entry),
      fullHoleOrder: session.getHoleOrder(this.data.entry),
      rankId: this.data.rankId,
      multiplier: this.data.multiplier,
      pairings: pairings,
      matchups: (pairings || []).map(function (item) {
        return {
          leftPartyId: item.leftPartyId || item.leftId,
          rightPartyId: item.rightPartyId || item.rightId,
          id: item.id,
          on: item.on !== false,
          handicap:
            item.handicap != null && item.handicap !== ""
              ? String(item.handicap)
              : item.strokes != null && item.strokes !== ""
                ? String(item.strokes)
                : "0",
          strokes:
            item.strokes != null && item.strokes !== ""
              ? String(item.strokes)
              : item.handicap != null && item.handicap !== ""
                ? String(item.handicap)
                : "0",
          hcapList: item.hcapList,
          segmentHandicaps: item.segmentHandicaps,
          segFront: item.segFront,
          segBack: item.segBack,
          segOverall: item.segOverall
        };
      })
    };
    if (this.data.showThreeSet) {
      const order = session.getHoleOrder(this.data.entry) || [];
      payload.holes = order.map(function (label) {
        return { label: label, on: true };
      });
      payload.holeCount = order.length;
      payload.holeOrder = order.slice();
      payload.fullHoleOrder = order.slice();
      const sv = this.data.segmentValues || {};
      payload.segmentValues = {
        front: String(sv.front == null || sv.front === "" ? "1" : sv.front),
        back: String(sv.back == null || sv.back === "" ? "1" : sv.back),
        overall: String(sv.overall == null || sv.overall === "" ? "1" : sv.overall)
      };
      payload.pairings = pairings.map(function (item) {
        const segs = readPairSegmentHandicaps(item);
        return Object.assign({}, item, {
          leftPartyId: item.leftPartyId || item.leftId,
          rightPartyId: item.rightPartyId || item.rightId,
          segFront: segs.front,
          segBack: segs.back,
          segOverall: segs.overall,
          segmentHandicaps: {
            front: segs.front,
            back: segs.back,
            overall: segs.overall
          }
        });
      });
      payload.matchups = payload.pairings.map(function (item) {
        return {
          leftPartyId: item.leftPartyId || item.leftId,
          rightPartyId: item.rightPartyId || item.rightId,
          id: item.id,
          on: item.on !== false,
          segmentHandicaps: item.segmentHandicaps,
          segFront: item.segFront,
          segBack: item.segBack,
          segOverall: item.segOverall
        };
      });
      payload.playerSegmentHandicaps = null;
      payload.multiplier = 1;
    }
    if (this.data.showYoucai) {
      payload.pointPerHole = String(
        this.data.multiplier == null || this.data.multiplier === "" ? "1" : this.data.multiplier
      );
      payload.multiplier = payload.pointPerHole;
      payload.handicapMode = "pair-hole";
      // 权威字段已写入 pairings.handicap；清掉结果快照强制重算
      payload.holeResults = null;
      payload.resultSnapshot = null;
    }
    if (this.data.showScoreMap) {
      payload.defaultScoreCode = this.data.defaultScoreCode || "8421";
    }
    if (this.data.showHorn || this.data.showLasuoN) {
      payload.sortUpdate = this.data.sortUpdate || "dynamic";
      payload.formation = this.data.formation || "jianghu";
      payload.pairCoeffs = (this.data.pairCoeffs || []).map(function (item) {
        return { id: item.id, index: item.index, value: String(item.value == null || item.value === "" ? "1" : item.value) };
      });
      payload.totalPkKt = String(this.data.totalPkKt == null || this.data.totalPkKt === "" ? "0" : this.data.totalPkKt);
      payload.rewardOn = this.data.rewardOn !== false;
      payload.lasuoNMulRows = (this.data.lasuoNMulRows || []).map(function (item) {
        return { id: item.id, label: item.label, value: String(item.value == null || item.value === "" ? "1" : item.value) };
      });
      if (this.data.showHorn) {
        payload.flowerK = String(
          this.data.flowerK == null || this.data.flowerK === "" ? "1" : this.data.flowerK
        );
        payload.totalPkKt = "0";
        payload.bandMode = "all";
        payload.bandLow = String(this.data.bandLow || "2");
        payload.bandHigh = String(this.data.bandHigh || "2");
        payload.bandMap = {};
        payload.pushRule = this.data.pushRule === "none" ? "none" : "all-tie";
        payload.pkCount = hornMeta(selected.length).lasuoCount;
        payload.groupModeLabel = catalog.lasuoNWayLabel({
          sortUpdate: payload.sortUpdate,
          formation: payload.formation
        });
      } else {
        payload.bandMode =
          payload.sortUpdate === "fixed" ? "all" : this.data.bandMode || "all";
        payload.bandLow = String(this.data.bandLow || "2");
        payload.bandHigh = String(this.data.bandHigh || "2");
        if (payload.bandMode === "split-high") {
          const masterN = Number(payload.bandLow) || 0;
          const orderIds = this.data.playerOrder || [];
          const bandMap = {};
          orderIds.forEach(function (id, i) {
            bandMap[id] = i < masterN ? "low" : "high";
          });
          selected.forEach(function (item) {
            if (!bandMap[item.id]) bandMap[item.id] = "high";
          });
          payload.bandMap = bandMap;
        } else {
          payload.bandMap = {};
        }
        payload.pushRule = normalizeLasuoNPushRule(this.data.pushRule);
        payload.pkCount = pkCountOf(selected.length);
        payload.groupModeLabel = catalog.lasuoNWayLabel({
          sortUpdate: payload.sortUpdate,
          formation: payload.formation,
          bandMode: payload.bandMode
        });
      }
    }
    if (this.data.gameId) {
      const prev = session.getGame(this.data.entry, this.data.gameId);
      const saved = session.updateGame(
        this.data.entry,
        this.data.gameId,
        payload,
        this._repoRevision != null ? { expectedRevision: this._repoRevision } : {}
      );
      if (!saved || saved.__fail) {
        wx.showToast({ title: (saved && saved.message) || "保存失败", icon: "none" });
        return;
      }
      if (saved.revision != null) this._repoRevision = Number(saved.revision);
      if (this._markSaved) this._markSaved();
      if (saved && (!prev || session.orderKey(prev) !== session.orderKey(saved))) {
        session.addOrderLog(this.data.entry, saved, prev && prev.playerOrder && prev.playerOrder.length ? "update" : "start");
      }
    } else {
      const saved = session.addGame(
        this.data.entry,
        Object.assign({ id: "g-" + Date.now() }, payload)
      );
      if (!saved || saved.__fail) {
        wx.showToast({ title: (saved && (saved.message || saved.reason)) || "保存失败", icon: "none" });
        return;
      }
      if (this._markSaved) this._markSaved();
      session.addOrderLog(this.data.entry, saved, "start");
    }
    this._confirmCommitted = true;
    nav.callOnPage("pages/list/index", "refreshGames");
    nav.navigateBackTo(
      "pages/list/index",
      session.withHost(
        "/subpackages/game/pages/list/index?entry=" +
          encodeURIComponent(this.data.entry || "score") +
          "&maxPlayers=" +
          encodeURIComponent(this.data.maxPlayers || 4)
      )
    );
    } finally {
      if (!this._confirmCommitted) this._confirmAdding = false;
    }
  }
}));
