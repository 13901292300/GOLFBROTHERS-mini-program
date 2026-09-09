/**
 * 普通创建页 — 编辑已有 GAME 的数据转换（不影响创建流程）
 */

const gameStore = require('../../../utils/gameStore.js');
const halfCourse = require('../../../utils/halfCourse.js');
const temporaryCourse = require('../../../utils/temporaryCourse.js');
const { resolveFirstTwoCourses } = require('../../../utils/courseDatabase.js');

const COMPOSITION_MODES = { '最好成绩赛': true, '最佳球位赛': true };

/** 普通局面四人两球赛：自动 composition（不进组合弹窗，但需落盘 groupCompositionMap） */
function isFourball2BallGameMode(mode) {
  return mode === '四人两球赛';
}

/** 需要把 composition 写入 GAME 的赛制（含自动生成的四人两球） */
function isCompositionPersistMode(mode) {
  return isCompositionGameMode(mode) || isFourball2BallGameMode(mode);
}

const MINUTE_VALUES = [0, 10, 20, 30, 40, 50];

function parseTeeTimeText(text) {
  const raw = (text || '').trim();
  if (!raw) return null;
  const m = raw.match(/(\d{4})年(\d{1,2})月(\d{1,2})日[^\d]*(\d{1,2}):(\d{1,2})/);
  if (!m) return null;
  const minute = Number(m[5]);
  const snapped = MINUTE_VALUES.reduce((best, v) =>
    Math.abs(v - minute) < Math.abs(best - minute) ? v : best
  , MINUTE_VALUES[0]);
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: snapped
  };
}

function slotsToCreatePlayers(groupId, slots) {
  const list = Array.isArray(slots) ? slots : [];
  return [0, 1, 2, 3].map((i) => {
    const key = groupId + '-p' + (i + 1);
    const p = list[i];
    if (p && p.playerId) {
      return {
        key: key,
        filled: true,
        playerId: p.playerId,
        name: p.name || '球员',
        avatar: p.avatar || ''
      };
    }
    return { key: key, filled: false, name: '玩家' + (i + 1) };
  });
}

function resolveCompositionMap(game, groups) {
  const raw = (game && game.groupCompositionMap) || {};
  const out = {};
  (groups || []).forEach((g) => {
    if (raw[g.id]) {
      out[g.id] = raw[g.id];
      return;
    }
    const comp = (game.groups || []).find((sg) => sg.groupId === g.id);
    if (comp && comp.composition) {
      out[g.id] = comp.composition;
    }
  });
  if (!Object.keys(out).length && game && game.composition && groups[0]) {
    out[groups[0].id] = game.composition;
  }
  return out;
}

/** 将已存 GAME 转为普通创建页表单初始值 */
function hydrateCreateFormFromGame(game) {
  if (!game) return null;
  const storeGroups = gameStore.listGroups(game);
  const groups = storeGroups.map((sg, gi) => {
    const id = sg.groupId || 'grp-' + (gi + 1);
    return {
      id: id,
      players: slotsToCreatePlayers(id, sg.playersSlots || [])
    };
  });
  if (!groups.length) {
    groups.push({ id: 'grp-1', players: slotsToCreatePlayers('grp-1', []) });
  }
  const halfResolved = temporaryCourse.isTemporarySource(game)
    ? { front9Course: game.front9Course || 'A', back9Course: game.back9Course || 'B' }
    : resolveHalfCourses(
        game.courseId,
        game.courseName,
        game.front9Course,
        game.back9Course,
        game.courseHalfText
      );
  return {
    roundName: game.roundName || '',
    courseId: game.courseId || '',
    courseName: game.courseName || '',
    courseLocation: game.courseLocation || '',
    front9Course: halfResolved.front9Course,
    back9Course: halfResolved.back9Course,
    courseHalfText: game.courseHalfText || '',
    courseLayoutRevision: game.courseLayoutRevision,
    courseSource: game.courseSource || '',
    temporaryCourseId: game.temporaryCourseId || '',
    holePars: Array.isArray(game.holePars) ? game.holePars.slice() : null,
    teeTimeText: game.teeTime || '',
    gameMode: game.gameMode || '个人比杆赛',
    visibility: game.visibility === 'private' ? 'private' : 'public',
    accessCode: game.accessCode || '',
    groups: groups,
    groupCompositionMap: resolveCompositionMap(game, groups)
  };
}

/** 从 courseHalfText（如「（A/B）」）解析前9/后9 COURSE 代码 */
function parseHalfFromComboText(text) {
  const raw = (text || '').trim();
  if (!raw) return { front9: null, back9: null };
  const inner = raw.replace(/^[（(]/, '').replace(/[）)]$/, '');
  const parts = inner.split('/').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { front9: parts[0], back9: parts[1] };
  }
  if (parts.length === 1) {
    return { front9: parts[0], back9: null };
  }
  return { front9: null, back9: null };
}

/** 补全半场：显式字段 → courseHalfText → 球场默认前两个 COURSE */
function resolveHalfCourses(courseId, courseName, front9, back9, courseHalfText) {
  let f = front9 || null;
  let b = back9 || null;
  if (!f && !b) {
    const parsed = parseHalfFromComboText(courseHalfText);
    f = parsed.front9;
    b = parsed.back9;
  }
  if (!f && !b) {
    const course = halfCourse.resolveHalfCourseRecord(courseId, courseName);
    if (course && halfCourse.buildHalves(course).length >= 2) {
      const halves = resolveFirstTwoCourses(course);
      f = halves.front9Course;
      b = halves.back9Course;
    }
  }
  return { front9Course: f, back9Course: b };
}

/**
 * 编辑模式：原 GAME 数据 + 当前表单合并（未改动的字段沿用原值）
 */
function mergeFormWithExistingGame(existing, form) {
  if (!existing) return form || {};
  const f = form || {};
  var isTemporary;
  if (temporaryCourse.isTemporarySource(f)) isTemporary = true;
  else if (f.courseId) isTemporary = false;
  else isTemporary = temporaryCourse.isTemporarySource(existing);
  const courseId = isTemporary ? '' : f.courseId || existing.courseId || '';
  const courseName = (f.courseName || existing.courseName || '').trim();
  const halfResolved = isTemporary
    ? { front9Course: 'A', back9Course: 'B' }
    : resolveHalfCourses(
        courseId,
        courseName,
        f.front9Course || existing.front9Course,
        f.back9Course || existing.back9Course,
        f.courseHalfText || existing.courseHalfText
      );
  return {
    courseId: courseId,
    courseName: courseName,
    courseLocation: f.courseLocation || existing.courseLocation || '',
    front9Course: halfResolved.front9Course,
    back9Course: halfResolved.back9Course,
    courseHalfText: f.courseHalfText || existing.courseHalfText || '',
    courseLayoutRevision: f.courseLayoutRevision != null ? f.courseLayoutRevision : existing.courseLayoutRevision,
    courseSource: isTemporary ? 'temporary' : '',
    temporaryCourseId: isTemporary
      ? f.temporaryCourseId || existing.temporaryCourseId || ''
      : '',
    holePars: isTemporary
      ? temporaryCourse.cloneHolePars(f.holePars || existing.holePars)
      : null,
    teeTimeText: (f.teeTimeText || '').trim() || existing.teeTime || '',
    roundName: f.roundName != null && f.roundName !== '' ? f.roundName : (existing.roundName || ''),
    gameMode: f.gameMode || existing.gameMode || '',
    visibility: f.visibility || existing.visibility || 'public',
    accessCode: f.accessCode != null ? f.accessCode : (existing.accessCode || ''),
    groups: f.groups && f.groups.length ? f.groups : gameStore.listGroups(existing).map((sg, gi) => {
      const id = sg.groupId || 'grp-' + (gi + 1);
      return {
        id: id,
        players: slotsToCreatePlayers(id, sg.playersSlots || [])
      };
    }),
    groupCompositionMap: f.groupCompositionMap || existing.groupCompositionMap || {}
  };
}

function isCompositionGameMode(mode) {
  return !!COMPOSITION_MODES[mode];
}

function compositionRecordValid(rec, count) {
  if (!rec || rec.playerCount !== count || !rec.compositionType) return false;
  const total = rec.compositionType.split('+').reduce((s, n) => s + Number(n), 0);
  if (total !== count) return false;
  if (!Array.isArray(rec.teams) || !rec.teams.length) return false;
  const roster = rec.teams.reduce((s, t) => s + ((t.members || t.players) || []).length, 0);
  if (roster !== count) return false;
  if (rec.teamMode === 'single_team') return rec.teams.length === 1;
  if (rec.teamMode === 'split_team') return rec.teams.length >= 2;
  return false;
}

/**
 * 提交前校验（创建 / 修改比赛共用）
 * @returns {string|null} 错误文案，通过则 null
 */
function validateSubmitForm(form, helpers) {
  const h = helpers || {};
  if (temporaryCourse.isTemporarySource(form)) {
    if (!temporaryCourse.isValidHolePars(form && form.holePars)) {
      return '请完成18洞标准杆（每洞3/4/5）';
    }
  } else {
    const courseId = form.courseId;
    const courseName = (form.courseName || '').trim();
    if (!courseId || !courseName) {
      return '尚未选择球场，请选择后才可确认';
    }
  }

  const teeTimeText = (form.teeTimeText || '').trim();
  if (!teeTimeText) {
    return '请设置开球时间';
  }

  if (!temporaryCourse.isTemporarySource(form) && !h.skipHalfCourse) {
    const courseId = form.courseId;
    const courseName = (form.courseName || '').trim();
    const course = halfCourse.resolveHalfCourseRecord(courseId, courseName);
    if (course && halfCourse.buildHalves(course).length >= 2) {
      const halfResolved = resolveHalfCourses(
        courseId,
        courseName,
        form.front9Course,
        form.back9Course,
        form.courseHalfText
      );
      if (!halfResolved.front9Course && !halfResolved.back9Course) {
        return '请选择球场前9/后9半场';
      }
    }
  }

  if (form.visibility === 'private') {
    const code = String(form.accessCode || '').trim();
    if (code.length !== 6) {
      return '私密比赛需设置6位围观密码';
    }
  }

  const gameMode = form.gameMode || '';
  if (!gameMode) {
    return '请选择赛制';
  }

  const groups = form.groups || [];
  if (!groups.length) {
    return '请至少保留一个分组';
  }

  const filledInGroup = h.filledInGroup || function (g) {
    return ((g && g.players) || []).filter((p) => p && p.filled).length;
  };

  let totalPlayers = 0;
  groups.forEach((g) => {
    totalPlayers += filledInGroup(g);
  });
  if (totalPlayers < 1) {
    return '请至少选择一名球员';
  }

  // 最好成绩 / 最佳球位：每组至少 2 人；须完成 composition（含自动 2+0）
  const compMode = isCompositionGameMode(gameMode);
  if (compMode && !(h.skipComposition)) {
    const map = form.groupCompositionMap || {};
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const count = filledInGroup(g);
      if (count > 0 && count < 2) {
        return '第' + (i + 1) + '组：组合赛制每组至少需要2名球员';
      }
      if (count >= 2) {
        const rec = map[g.id];
        if (!compositionRecordValid(rec, count)) {
          return '第' + (i + 1) + '组：请完成组合分配';
        }
      }
    }
  }

  // 四人两球赛：每组仅 2 或 4 人（禁止 3）；composition 由创建页自动生成后校验
  if (isFourball2BallGameMode(gameMode)) {
    const map = form.groupCompositionMap || {};
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const count = filledInGroup(g);
      if (count === 0) continue;
      if (count === 3) {
        return '第' + (i + 1) + '组：四人两球赛不支持3人，请保留2人或4人';
      }
      if (count !== 2 && count !== 4) {
        return '第' + (i + 1) + '组：四人两球赛每组须为2人或4人';
      }
      if (!(h.skipComposition)) {
        const rec = map[g.id];
        if (!compositionRecordValid(rec, count)) {
          return '第' + (i + 1) + '组：四人两球组合未生成';
        }
      }
    }
  }

  return null;
}

function buildSlotsFromPlayers(players) {
  return (players || []).map((p, i) => {
    if (!p || !p.filled) return null;
    return {
      playerId: p.playerId || 'host-' + (p.key || i),
      name: p.name,
      avatar: p.avatar || ''
    };
  });
}

function mergeScoresForSlots(oldScores, newSlots) {
  const prev = oldScores || {};
  const next = {};
  (newSlots || []).filter(Boolean).forEach((p) => {
    if (prev[p.playerId]) {
      next[p.playerId] = {
        scores: (prev[p.playerId].scores || []).slice(),
        putts: (prev[p.playerId].putts || []).slice()
      };
    }
  });
  return next;
}

/**
 * 根据创建页表单更新已有 GAME（保留 gameId / 状态 / 已有成绩）
 */
function buildUpdatedGame(existing, form, helpers) {
  const h = helpers || {};
  const compMode = isCompositionPersistMode(form.gameMode);
  const compositionMap = compMode ? (form.groupCompositionMap || {}) : {};
  const existingGroups = gameStore.listGroups(existing);
  const buildSlots = h.buildSlots || buildSlotsFromPlayers;

  const groups = (form.groups || []).map((g, gi) => {
    const oldGroup = existingGroups[gi] || {};
    const playersSlots = buildSlots(g.players);
    const comp = compMode ? (compositionMap[g.id] || null) : null;
    const next = Object.assign({}, oldGroup, {
      groupId: oldGroup.groupId || g.id || 'g-' + (gi + 1),
      name: oldGroup.name || '第' + (gi + 1) + '组',
      status: oldGroup.status || 'not_started',
      playersSlots: playersSlots,
      scoresByPlayer: mergeScoresForSlots(oldGroup.scoresByPlayer, playersSlots),
      composition: comp
    });
    if (!compMode) {
      delete next.teamScoresByEntity;
      delete next.composition;
    }
    return next;
  });

  const creatorId = existing.createdBy || existing.creatorId || gameStore.getCurrentUser().userId;
  const creatorGroupIndex = gameStore.findCreatorGroupIndex({
    groups: groups,
    creatorId: creatorId,
    createdBy: creatorId
  });
  const creatorInGame = creatorGroupIndex >= 0;
  const firstGroup = groups[0] || { playersSlots: [] };
  const firstComp = compMode && form.groups[0] ? compositionMap[form.groups[0].id] : null;
  const finalRoundName = h.resolveRoundName ? h.resolveRoundName() : (form.roundName || existing.roundName || '');

  return Object.assign({}, existing, {
    courseId: form.courseId,
    courseName: (form.courseName || '').trim(),
    courseLocation: form.courseLocation || '',
    front9Course: form.front9Course || null,
    back9Course: form.back9Course || null,
    courseHalfText: form.courseHalfText || '',
    courseLayoutRevision: form.courseLayoutRevision != null ? form.courseLayoutRevision : existing.courseLayoutRevision,
    courseSource: temporaryCourse.isTemporarySource(form) ? 'temporary' : '',
    temporaryCourseId: temporaryCourse.isTemporarySource(form)
      ? form.temporaryCourseId || existing.temporaryCourseId || ''
      : '',
    holePars: temporaryCourse.isTemporarySource(form)
      ? temporaryCourse.cloneHolePars(form.holePars || existing.holePars)
      : null,
    teeTime: form.teeTimeText || '',
    roundName: finalRoundName,
    gameMode: form.gameMode || '',
    groupCompositionMap: compMode ? compositionMap : {},
    composition: firstComp
      ? (function () {
          const top = {
            type: firstComp.compositionType,
            single: firstComp.teamMode === 'single_team',
            teams: firstComp.teams || [],
            scoringTemplate: firstComp.scoringTemplate || ''
          };
          // Seat Model 双写透传；无 seats 的旧 composition 不回填
          if (Array.isArray(firstComp.seats)) top.seats = firstComp.seats;
          return top;
        })()
      : null,
    scoringTemplate: compMode && firstComp ? (firstComp.scoringTemplate || '') : '',
    visibility: form.visibility,
    accessCode: form.visibility === 'private' ? form.accessCode : null,
    playersSlots: firstGroup.playersSlots,
    groups: groups,
    creatorGroupIndex: creatorInGame ? creatorGroupIndex : -1,
    creatorInGame: creatorInGame
  });
}

module.exports = {
  COMPOSITION_MODES,
  isCompositionGameMode,
  isFourball2BallGameMode,
  isCompositionPersistMode,
  compositionRecordValid,
  parseHalfFromComboText,
  resolveHalfCourses,
  mergeFormWithExistingGame,
  validateSubmitForm,
  parseTeeTimeText,
  hydrateCreateFormFromGame,
  buildUpdatedGame,
  buildSlotsFromPlayers
};
