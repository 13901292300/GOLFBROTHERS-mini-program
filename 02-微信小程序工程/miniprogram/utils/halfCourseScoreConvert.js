/**
 * 更换半场时按「原杆差 + 新 PAR」换算已记总杆。
 * 成绩绑定记分格索引 0–17：替换前九只动 0–8，替换后九只动 9–17；不按半场名/洞号字符串搬迁。
 * 已填推杆仅按新总杆上限钳制；不生成默认推杆，不依赖记分页 puttsManual 规则库。
 */

function sameHalfKey(a, b) {
  const left = a == null || a === '' ? '' : String(a);
  const right = b == null || b === '' ? '' : String(b);
  return left === right;
}

function nineParsEqual(a, b, start) {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  for (let i = 0; i < 9; i += 1) {
    if (Number(left[start + i]) !== Number(right[start + i])) return false;
  }
  return true;
}

/** 按前后九是否被替换，或该九洞 PAR 是否变化，返回记分格索引（0–17） */
function affectedHoleIndexes(beforeFront, beforeBack, afterFront, afterBack, oldPars, newPars) {
  const indexes = [];
  const frontKeyChanged = !sameHalfKey(beforeFront, afterFront);
  const backKeyChanged = !sameHalfKey(beforeBack, afterBack);
  const frontParChanged =
    Array.isArray(oldPars) && Array.isArray(newPars) && !nineParsEqual(oldPars, newPars, 0);
  const backParChanged =
    Array.isArray(oldPars) && Array.isArray(newPars) && !nineParsEqual(oldPars, newPars, 9);
  if (frontKeyChanged || frontParChanged) {
    for (let i = 0; i < 9; i += 1) indexes.push(i);
  }
  if (backKeyChanged || backParChanged) {
    for (let i = 9; i < 18; i += 1) indexes.push(i);
  }
  return indexes;
}

function isEmptyScore(value) {
  return value === null || value === undefined || value === '';
}

function isValidPar(value) {
  if (isEmptyScore(value)) return false;
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function isNumericStrokes(value) {
  if (isEmptyScore(value)) return false;
  if (typeof value === 'boolean') return false;
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return false;
    if (!/^-?\d+(\.\d+)?$/.test(t)) return false;
  }
  return Number.isFinite(Number(value));
}

function convertStrokes(oldStrokes, oldPar, newPar) {
  return Number(oldStrokes) - Number(oldPar) + Number(newPar);
}

function validatePars(oldPars, newPars, holeIndexes) {
  const oldArr = Array.isArray(oldPars) ? oldPars : [];
  const newArr = Array.isArray(newPars) ? newPars : [];
  const details = [];
  (holeIndexes || []).forEach((hi) => {
    const holeNo = hi + 1;
    if (!isValidPar(oldArr[hi])) {
      details.push('第' + holeNo + '格缺少有效更换前 PAR');
    }
    if (!isValidPar(newArr[hi])) {
      details.push('第' + holeNo + '格缺少有效更换后 PAR');
    }
  });
  if (details.length) {
    return { ok: false, message: '半场 PAR 无效，已取消更换', details: details };
  }
  return { ok: true };
}

function holeLabel(owner, holeIndex) {
  const who = owner ? String(owner) : '成绩';
  return who + ' · 第' + (holeIndex + 1) + '格';
}

function isFilledPutt(value) {
  if (isEmptyScore(value)) return false;
  if (typeof value === 'boolean') return false;
  return Number.isFinite(Number(value));
}

function clampPuttToScore(putt, newScore) {
  const maxPutts = Math.max(0, Number(newScore) - 1);
  var n = Math.floor(Number(putt));
  if (n < 0) n = 0;
  if (n > maxPutts) n = maxPutts;
  return n;
}

/** 仅钳制已填推杆；不补空值、不新建 putts / puttsManual 数组 */
function applyRecordedPutts(rec, holeIndex, newScore) {
  if (!rec || !Array.isArray(rec.putts)) return;
  const existing = rec.putts[holeIndex];
  if (!isFilledPutt(existing)) return;
  const next = clampPuttToScore(existing, newScore);
  const clampedAway = Number(next) !== Number(existing);
  rec.putts[holeIndex] = next;
  if (!Array.isArray(rec.puttsManual)) return;
  if (rec.puttsManual[holeIndex] === true || clampedAway) {
    rec.puttsManual[holeIndex] = true;
  }
}

function applyHolePutts(hole, newScore) {
  if (!hole || !isFilledPutt(hole.putts)) return;
  const existing = hole.putts;
  const next = clampPuttToScore(existing, newScore);
  const clampedAway = Number(next) !== Number(existing);
  hole.putts = next;
  if (hole.puttManual === true || clampedAway) {
    hole.puttManual = true;
  }
}

function convertScoreRecord(rec, holeIndexes, oldPars, newPars, owner, seen) {
  if (!rec || typeof rec !== 'object') return { ok: true };
  if (seen) {
    if (seen.has(rec)) return { ok: true };
    seen.add(rec);
  }
  if (Array.isArray(rec.holes)) {
    return convertHoles(rec.holes, holeIndexes, oldPars, newPars, owner, rec);
  }
  const scores = rec.scores;
  if (!Array.isArray(scores)) return { ok: true };
  const details = [];
  const planned = [];
  for (let i = 0; i < holeIndexes.length; i += 1) {
    const hi = holeIndexes[i];
    const raw = scores[hi];
    if (isEmptyScore(raw)) continue;
    if (!isNumericStrokes(raw)) continue;
    const next = convertStrokes(raw, oldPars[hi], newPars[hi]);
    if (!Number.isFinite(next) || next < 1) {
      details.push(holeLabel(owner, hi) + '换算后总杆数为 ' + String(next));
      continue;
    }
    planned.push({ hi: hi, next: next });
  }
  if (details.length) {
    return { ok: false, message: '换算后总杆数超出支持范围，已取消更换', details: details };
  }
  planned.forEach((item) => {
    applyRecordedPutts(rec, item.hi, item.next);
    scores[item.hi] = item.next;
  });
  return { ok: true };
}

function convertHoles(holes, holeIndexes, oldPars, newPars, owner, hostRec) {
  const details = [];
  const planned = [];
  for (let i = 0; i < holeIndexes.length; i += 1) {
    const hi = holeIndexes[i];
    const hole = holes[hi];
    if (!hole) continue;
    const raw = hole.score;
    if (isEmptyScore(raw)) continue;
    if (!isNumericStrokes(raw)) continue;
    const next = convertStrokes(raw, oldPars[hi], newPars[hi]);
    if (!Number.isFinite(next) || next < 1) {
      details.push(holeLabel(owner, hi) + '换算后总杆数为 ' + String(next));
      continue;
    }
    planned.push({ hi: hi, hole: hole, next: next });
  }
  if (details.length) {
    return { ok: false, message: '换算后总杆数超出支持范围，已取消更换', details: details };
  }
  planned.forEach((item) => {
    item.hole.score = item.next;
    applyHolePutts(item.hole, item.next);
    if (hostRec && Array.isArray(hostRec.putts) && isFilledPutt(item.hole.putts)) {
      hostRec.putts[item.hi] = item.hole.putts;
      if (Array.isArray(hostRec.puttsManual) && item.hole.puttManual === true) {
        hostRec.puttsManual[item.hi] = true;
      }
      applyRecordedPutts(hostRec, item.hi, item.next);
      if (isFilledPutt(hostRec.putts[item.hi])) {
        item.hole.putts = hostRec.putts[item.hi];
        if (Array.isArray(hostRec.puttsManual) && hostRec.puttsManual[item.hi] === true) {
          item.hole.puttManual = true;
        }
      }
    }
  });
  return { ok: true };
}

function mergeConvertResult(out, next) {
  if (!next || next.ok !== false) return out;
  out.ok = false;
  out.message = next.message || out.message;
  out.details = (out.details || []).concat(next.details || []);
  return out;
}

function convertScoreMap(map, holeIndexes, oldPars, newPars, seen, prefix) {
  const out = { ok: true, details: [] };
  if (!map || typeof map !== 'object' || Array.isArray(map)) return out;
  Object.keys(map).forEach((key) => {
    mergeConvertResult(
      out,
      convertScoreRecord(map[key], holeIndexes, oldPars, newPars, (prefix || '') + key, seen)
    );
  });
  return out;
}

function convertScoreList(list, holeIndexes, oldPars, newPars, seen, labelFor) {
  const out = { ok: true, details: [] };
  if (!Array.isArray(list)) return out;
  list.forEach((rec, index) => {
    if (!rec) return;
    const owner = typeof labelFor === 'function' ? labelFor(rec, index) : '组合' + (index + 1);
    mergeConvertResult(out, convertScoreRecord(rec, holeIndexes, oldPars, newPars, owner, seen));
  });
  return out;
}

function convertGameScores(game, holeIndexes, oldPars, newPars) {
  const out = { ok: true, details: [] };
  if (!game) return out;
  const seen = typeof WeakSet === 'function' ? new WeakSet() : null;
  const groups = Array.isArray(game.groups) && game.groups.length
    ? game.groups
    : [game];
  groups.forEach((group, gi) => {
    const tag = '第' + (gi + 1) + '组 ';
    mergeConvertResult(
      out,
      convertScoreMap(group.scoresByPlayer, holeIndexes, oldPars, newPars, seen, tag)
    );
    mergeConvertResult(
      out,
      convertScoreList(group.scoresBySlot, holeIndexes, oldPars, newPars, seen, function (_rec, si) {
        return tag + '槽位' + (si + 1);
      })
    );
    mergeConvertResult(
      out,
      convertScoreList(group.teamScoresByEntity, holeIndexes, oldPars, newPars, seen, function (rec, i) {
        return tag + '组合' + (rec && rec.teamId ? rec.teamId : i + 1);
      })
    );
  });
  if (game.scoresByPlayer && groups[0] !== game) {
    mergeConvertResult(out, convertScoreMap(game.scoresByPlayer, holeIndexes, oldPars, newPars, seen, ''));
  }
  if (Array.isArray(game.teamScoresByEntity) && groups[0] !== game) {
    mergeConvertResult(
      out,
      convertScoreList(game.teamScoresByEntity, holeIndexes, oldPars, newPars, seen, function (rec, i) {
        return '组合' + (rec && rec.teamId ? rec.teamId : i + 1);
      })
    );
  }
  if (!out.ok && !out.message) out.message = '换算后总杆数超出支持范围，已取消更换';
  return out;
}

function convertMatchScoreData(match, holeIndexes, oldPars, newPars) {
  const out = { ok: true, details: [] };
  if (!match || !match.scoreData || typeof match.scoreData !== 'object') return out;
  const seen = typeof WeakSet === 'function' ? new WeakSet() : null;
  Object.keys(match.scoreData).forEach((groupId) => {
    const bucket = match.scoreData[groupId];
    if (!bucket || typeof bucket !== 'object') return;
    const tag = String(groupId || '') + ' ';
    mergeConvertResult(
      out,
      convertScoreMap(bucket.scoresByPlayer, holeIndexes, oldPars, newPars, seen, tag)
    );
    mergeConvertResult(
      out,
      convertScoreList(bucket.teamScoresByEntity, holeIndexes, oldPars, newPars, seen, function (rec, i) {
        return tag + '组合' + (rec && rec.teamId ? rec.teamId : i + 1);
      })
    );
    mergeConvertResult(
      out,
      convertScoreMap(bucket.scoresBySide, holeIndexes, oldPars, newPars, seen, tag + 'Side ')
    );
  });
  if (!out.ok && !out.message) out.message = '换算后总杆数超出支持范围，已取消更换';
  return out;
}

function convertGroupsHoles(groups, holeIndexes, oldPars, newPars) {
  const out = { ok: true, details: [] };
  if (!Array.isArray(groups)) return out;
  const seen = typeof WeakSet === 'function' ? new WeakSet() : null;
  groups.forEach((group) => {
    if (!group) return;
    (group.players || []).forEach((player) => {
      if (!player) return;
      const owner = player.name || player.playerId || '球员';
      mergeConvertResult(
        out,
        convertScoreRecord(player, holeIndexes, oldPars, newPars, owner, seen)
      );
    });
    (group.slotCache || []).forEach((slot, si) => {
      if (!slot || !Array.isArray(slot.holes)) return;
      mergeConvertResult(
        out,
        convertHoles(slot.holes, holeIndexes, oldPars, newPars, '缓存槽位' + (si + 1), slot)
      );
    });
  });
  if (!out.ok && !out.message) out.message = '换算后总杆数超出支持范围，已取消更换';
  return out;
}

function prepareConvertedScores(opts) {
  const o = opts || {};
  const holeIndexes = affectedHoleIndexes(
    o.beforeFront,
    o.beforeBack,
    o.afterFront,
    o.afterBack,
    o.oldPars,
    o.newPars
  );
  if (!holeIndexes.length) {
    return { ok: true, skipped: true, holeIndexes: holeIndexes };
  }
  const parCheck = validatePars(o.oldPars, o.newPars, holeIndexes);
  if (!parCheck.ok) return parCheck;
  const game = o.game ? JSON.parse(JSON.stringify(o.game)) : null;
  const match = o.match ? JSON.parse(JSON.stringify(o.match)) : null;
  const groups = o.groups ? JSON.parse(JSON.stringify(o.groups)) : null;
  const details = [];
  let message = '';
  function take(next) {
    if (!next || next.ok !== false) return;
    message = next.message || message;
    (next.details || []).forEach((d) => details.push(d));
  }
  if (game) take(convertGameScores(game, holeIndexes, o.oldPars, o.newPars));
  if (match) take(convertMatchScoreData(match, holeIndexes, o.oldPars, o.newPars));
  if (groups) take(convertGroupsHoles(groups, holeIndexes, o.oldPars, o.newPars));
  if (details.length) {
    return {
      ok: false,
      message: message || '换算后总杆数超出支持范围，已取消更换',
      details: details,
      holeIndexes: holeIndexes
    };
  }
  if (game && o.game) Object.assign(o.game, game);
  if (match && o.match) Object.assign(o.match, match);
  if (groups && o.groups) {
    o.groups.splice(0, o.groups.length);
    groups.forEach((g) => o.groups.push(g));
  }
  return { ok: true, skipped: false, holeIndexes: holeIndexes };
}

module.exports = {
  sameHalfKey,
  affectedHoleIndexes,
  isEmptyScore,
  isValidPar,
  isNumericStrokes,
  convertStrokes,
  validatePars,
  convertScoreRecord,
  convertGameScores,
  convertMatchScoreData,
  convertGroupsHoles,
  prepareConvertedScores
};
