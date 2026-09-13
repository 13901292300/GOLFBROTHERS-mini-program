/**
 * 修改半场 — 比赛级统一逻辑（单组记分页 / Game Hub / 球队赛详情共用）
 * 成绩绑定记分格索引 0-17。半场变更更新 course 与 PAR，并按更换前杆差换算受影响洞总杆。
 * 球场/半场实际变化时，原子重建 side-game 全程洞序（created/full + revision）。
 */

const halfCourse = require('./halfCourse.js');
const gameStore = require('./gameStore.js');
const groupsStore = require('./groupsStore.js');
const teamMatchStore = require('./teamMatchStore.js');
const teamMatchFinish = require('./teamMatchFinish.js');
const matchState = require('./matchState.js');
const holeLayout = require('./holeLayout.js');
const matchHoleOrderRebuild = require('./matchHoleOrderRebuild.js');
const halfCourseScoreConvert = require('./halfCourseScoreConvert.js');
const courseDatabase = require('./courseDatabase.js');
const temporaryCourse = require('./temporaryCourse.js');

function readMatchState() {
  try {
    const ms = wx.getStorageSync(matchState.MATCH_STATE_KEY || 'matchState');
    return ms && typeof ms === 'object' ? ms : null;
  } catch (e) {
    return null;
  }
}

/** 从球队赛记录解析前九/后九（优先显式字段，其次 courseHalfText） */
function resolveTeamMatchHalves(match) {
  if (!match) return { front9Course: null, back9Course: null };
  let front9 = match.front9Course || null;
  let back9 = match.back9Course || null;
  if (!front9 && !back9) {
    const parsed = halfCourse.parseCourseHalfText(match.courseHalfText);
    front9 = parsed.front9Course;
    back9 = parsed.back9Course;
  }
  return { front9Course: front9, back9Course: back9 };
}

function assignCourseIdentity(target, rec, overwrite) {
  if (!target || !rec) return target;
  if (overwrite || !target.courseSource) {
    if (rec.courseSource) target.courseSource = rec.courseSource;
  }
  if (overwrite || !target.temporaryCourseId) {
    if (rec.temporaryCourseId) target.temporaryCourseId = rec.temporaryCourseId;
  }
  if (overwrite || !Array.isArray(target.holePars)) {
    if (Array.isArray(rec.holePars)) target.holePars = rec.holePars.slice();
  }
  if (overwrite || target.courseLayoutRevision === undefined) {
    if (Object.prototype.hasOwnProperty.call(rec, 'courseLayoutRevision')) {
      target.courseLayoutRevision = rec.courseLayoutRevision;
    }
  }
  if (overwrite || !target.courseHalfText) {
    if (rec.courseHalfText) target.courseHalfText = rec.courseHalfText;
  }
  return target;
}

function isTemporaryCourseCtx(ctx) {
  return temporaryCourse.isTemporarySource(ctx);
}

/** 解析当前比赛的半场编辑上下文 */
function buildContext(opts) {
  const o = opts || {};
  if (o.gameId) {
    const game = gameStore.getGame(o.gameId);
    if (game) {
      return assignCourseIdentity(
        {
          gameId: o.gameId,
          matchId: '',
          mode: 'game',
          source: 'game',
          courseId: game.courseId,
          courseName: game.courseName,
          courseLocation: game.courseLocation,
          front9Course: game.front9Course,
          back9Course: game.back9Course,
          courseHalfText: game.courseHalfText
        },
        game,
        true
      );
    }
  }
  // 球队赛详情：以 teamMatchStore 为真源（须优先于演示用 tournament meta）
  if (o.matchId) {
    const match = teamMatchStore.getMatchById(o.matchId);
    if (match) {
      const halves = resolveTeamMatchHalves(match);
      return assignCourseIdentity(
        {
          gameId: '',
          matchId: o.matchId,
          mode: 'team_match',
          source: 'team_match',
          courseId: match.courseId,
          courseName: match.courseName,
          courseLocation: match.courseLocation,
          front9Course: halves.front9Course,
          back9Course: halves.back9Course,
          courseHalfText: match.courseHalfText
        },
        match,
        true
      );
    }
  }
  if (o.source === 'tournament' || o.mode === 'individual_stroke') {
    const meta = groupsStore.getTournamentCourseMeta();
    return assignCourseIdentity(
      {
        gameId: '',
        matchId: '',
        mode: 'individual_stroke',
        source: 'tournament',
        courseId: meta.courseId,
        courseName: meta.courseName,
        courseLocation: meta.courseLocation,
        front9Course: meta.front9Course,
        back9Course: meta.back9Course,
        courseHalfText: meta.courseHalfText
      },
      meta,
      true
    );
  }
  const ms = readMatchState();
  const c = (ms && ms.course) || {};
  return assignCourseIdentity(
    {
      gameId: (ms && ms.gameId) || o.gameId || '',
      matchId: o.matchId || '',
      mode: (ms && ms.mode) || o.mode || '',
      source: o.source || 'matchState',
      courseId: c.courseId,
      courseName: c.courseName,
      courseLocation: c.courseLocation,
      front9Course: c.front9Course,
      back9Course: c.back9Course,
      courseHalfText: c.courseHalfText || c.halfText || ''
    },
    c,
    true
  );
}

/** 打开弹窗前：校验球场并回显当前前九/后九 */
function prepareSheet(ctx) {
  if (isTemporaryCourseCtx(ctx)) {
    if (!temporaryCourse.isValidHolePars(ctx && ctx.holePars)) {
      return { ok: false, message: '临时球场缺少有效标准杆，无法更换半场' };
    }
    const keys = temporaryCourse.VALID_COURSES || ['A', 'B', 'C', 'D', 'E', 'F'];
    const halves = keys.map((key) => ({
      key: key,
      label: key + '场',
      name: '',
      par: [],
      parTotal: 0
    }));
    return {
      ok: true,
      data: {
        halfCourse: {
          id: (ctx && ctx.temporaryCourseId) || '',
          name: temporaryCourse.displayCourseName(ctx && ctx.courseName),
          location: ''
        },
        halves: halves,
        front9: (ctx && ctx.front9Course) || 'A',
        back9: (ctx && ctx.back9Course) || 'B'
      }
    };
  }
  const course = halfCourse.resolveHalfCourseRecord(ctx.courseId, ctx.courseName);
  if (!course) return { ok: false, message: '未找到球场数据' };
  const halves = halfCourse.buildHalves(course);
  if (halves.length < 2) return { ok: false, message: '当前球场无可调整的半场' };
  const front9 = ctx.front9Course || (halves[0] && halves[0].key) || null;
  const back9 = ctx.back9Course || (halves[1] && halves[1].key) || null;
  return {
    ok: true,
    data: {
      halfCourse: {
        id: course.courseId,
        name: course.courseName,
        location: course.location || ''
      },
      halves: halves,
      front9: front9,
      back9: back9
    }
  };
}

function snapshotCourseFields(ctx) {
  const c = ctx || {};
  return {
    courseId: c.courseId || '',
    courseName: c.courseName || '',
    courseLocation: c.courseLocation || '',
    front9Course: c.front9Course || null,
    back9Course: c.back9Course || null,
    courseHalfText: c.courseHalfText || '',
    courseSource: c.courseSource || '',
    temporaryCourseId: c.temporaryCourseId || '',
    holePars: Array.isArray(c.holePars) ? c.holePars.slice() : undefined,
    courseLayoutRevision: Object.prototype.hasOwnProperty.call(c, 'courseLayoutRevision')
      ? c.courseLayoutRevision
      : undefined
  };
}

function cloneJson(v) {
  if (v == null) return v;
  try {
    return JSON.parse(JSON.stringify(v));
  } catch (e) {
    return v;
  }
}

function cloneLayout(layout) {
  if (!layout) return null;
  return {
    holePars: (layout.holePars || []).slice(),
    columnLabels: (layout.columnLabels || []).slice(),
    columnPars: (layout.columnPars || []).slice(),
    front9Key: layout.front9Key,
    back9Key: layout.back9Key,
    specialIdx: (layout.specialIdx || []).slice()
  };
}

const CONFLICT_MESSAGE = '比赛数据已更新，请重新进入后再试';
const SIDE_SETTINGS_KEY = matchHoleOrderRebuild.SETTINGS_KEY;
const sideGameRepositoryPort = require('./sideGameRepositoryPort.js');

function restoreSideEffects(msSnap, layoutSnap) {
  if (msSnap) matchState.setMatchState(cloneJson(msSnap));
  else matchState.clearMatchState();
  if (layoutSnap) holeLayout.applyLayout(cloneLayout(layoutSnap));
}

function snapshotWx(key) {
  try {
    const v = wx.getStorageSync(key);
    return v === undefined ? undefined : cloneJson(v);
  } catch (e) {
    return undefined;
  }
}

function restoreWx(key, snap) {
  try {
    if (snap === undefined) {
      if (typeof wx.removeStorageSync === 'function') wx.removeStorageSync(key);
      return;
    }
    wx.setStorageSync(key, snap);
  } catch (e) {
    throw e;
  }
}

function nextSaveToken(prevUpdatedAt) {
  const n = Date.now();
  const p = Number(prevUpdatedAt);
  const prev = isFinite(p) ? p : 0;
  return n <= prev ? prev + 1 : n;
}

function gameTokenOf(game) {
  if (!game) return '';
  if (game.revision != null && String(game.revision) !== '') return 'r:' + String(game.revision);
  return 't:' + String(game.updatedAt == null ? '' : game.updatedAt);
}

function sameSaveToken(game, expected) {
  if (expected == null || expected === '') return false;
  if (!game) return false;
  return String(gameTokenOf(game)) === String(expected) || String(game.updatedAt) === String(expected);
}

function alreadyRestored(cur, beforeGame) {
  if (!cur || !beforeGame) return false;
  if (String(cur.gameId) !== String(beforeGame.gameId)) return false;
  if (beforeGame.updatedAt != null && beforeGame.updatedAt !== '') {
    return sameSaveToken(cur, beforeGame.updatedAt);
  }
  return String(cur.roundName || '') === String(beforeGame.roundName || '') &&
    String(cur.courseId || '') === String(beforeGame.courseId || '') &&
    String(cur.front9Course || '') === String(beforeGame.front9Course || '');
}

function restoreGroupsSnapshot(snap) {
  if (!snap || !groupsStore.getGroups) return;
  const live = groupsStore.getGroups();
  if (!Array.isArray(live)) return;
  live.splice(0, live.length);
  (snap || []).forEach((g) => live.push(g));
}

function snapshotSideGameRows(matchId) {
  if (!matchId) return [];
  const listed = sideGameRepositoryPort.listByMatchId({ matchId: matchId, includeDeleted: true });
  if (listed && listed.ok && listed.data && Array.isArray(listed.data.items)) {
    return cloneJson(listed.data.items);
  }
  return [];
}

function restoreSideGameRows(rows) {
  sideGameRepositoryPort.restoreExactRecords(Array.isArray(rows) ? rows : []);
}

function restoreProjectionSnapshot(job) {
  const j = job || {};
  if (j.matchSnap) teamMatchStore.saveMatch(j.matchSnap);
  restoreWx(SIDE_SETTINGS_KEY, j.sideGameSettingsSnap);
  restoreSideGameRows(j.sideGameRowsSnap);
  if (j.restoreTournamentMeta) {
    if (Array.isArray(j.groupsSnap)) restoreGroupsSnapshot(j.groupsSnap);
    if (j.holeParsSnap && groupsStore.setHolePars) groupsStore.setHolePars(j.holeParsSnap);
    if (j.tournamentMetaSnap && groupsStore.setTournamentCourseHalf) {
      groupsStore.setTournamentCourseHalf(j.tournamentMetaSnap);
    }
  }
  restoreSideEffects(j.matchStateSnap, j.layoutSnap);
}

function reconcileProjectionsFromGame(game, msHint) {
  if (!game || !game.gameId) return false;
  let gi = 0;
  if (msHint && String(msHint.gameId) === String(game.gameId) && msHint.groupIndex != null) {
    gi = Number(msHint.groupIndex) || 0;
  }
  matchState.setMatchState(matchState.buildFromGame(game, gi));
  const layout = holeLayout.resolveLayoutFromContext({
    gameId: game.gameId,
    courseId: game.courseId,
    courseName: game.courseName,
    courseHalfText: game.courseHalfText,
    front9Course: game.front9Course,
    back9Course: game.back9Course,
    courseSource: game.courseSource,
    holePars: game.holePars,
    temporaryCourseId: game.temporaryCourseId,
    courseLayoutRevision: game.courseLayoutRevision
  });
  holeLayout.applyLayout(layout);
  return true;
}

/**
 * 创建/编辑比赛半场事务的唯一回滚入口。
 * restore：仅当存储仍是本次写入版本时恢复 beforeGame + 事务前投影。
 * delete：仅删除本次仍持有所有权的 gameId。
 * conflict：发现后续更新时不写回旧比赛、不恢复旧投影，按最新 game 重建 matchState/layout。
 */
function runGameSaveRollback(job) {
  const j = job || {};
  const policy = j.policy;
  const gameId = j.gameId || (j.beforeGame && j.beforeGame.gameId) || '';
  try {
    const cur = gameId ? gameStore.getGame(gameId) : null;
    if (policy === 'delete') {
      if (!cur) {
        restoreProjectionSnapshot(j);
        return { ok: true, outcome: 'rolledBack' };
      }
      if (!sameSaveToken(cur, j.expectedUpdatedAt)) {
        try {
          reconcileProjectionsFromGame(cur, j.matchStateSnap);
        } catch (e) {}
        return { ok: true, outcome: 'conflict' };
      }
      gameStore.removeGame(gameId);
      restoreProjectionSnapshot(j);
      return { ok: true, outcome: 'rolledBack' };
    }
    if (policy === 'restore' && j.beforeGame) {
      if (alreadyRestored(cur, j.beforeGame)) {
        return { ok: true, outcome: 'rolledBack' };
      }
      if (cur && String(cur.gameId) === String(j.beforeGame.gameId) && sameSaveToken(cur, j.expectedUpdatedAt)) {
        gameStore.saveGame(cloneJson(j.beforeGame));
        restoreProjectionSnapshot(j);
        return { ok: true, outcome: 'rolledBack' };
      }
      if (cur) {
        try {
          reconcileProjectionsFromGame(cur, j.matchStateSnap);
        } catch (e) {}
        return { ok: true, outcome: 'conflict' };
      }
      restoreProjectionSnapshot(j);
      return { ok: true, outcome: 'conflict' };
    }
    if (j.legacyGameSnap) gameStore.saveGame(j.legacyGameSnap);
    restoreProjectionSnapshot(j);
    return { ok: true, outcome: 'rolledBack' };
  } catch (err) {
    return {
      ok: false,
      outcome: 'rollbackFailed',
      error: (err && err.message) || '回滚失败'
    };
  }
}

/**
 * 确认修改半场：更新 course / PAR 与受影响洞的总杆（原杆差 + 新 PAR），同一次保存。
 * 成绩仍绑定记分格索引 0-17，不按洞号字符串搬迁。
 * 若球场/半场/洞集合实际变化：原子重建 created/fullHoleOrder 并 +revision
 */
function apply(ctx, front9, back9) {
  // beforeCourse：编辑页可能已先写入新 course，须由调用方传入修改前快照
  const beforeCtx = Object.assign({}, ctx || {}, ctx && ctx.beforeCourse ? ctx.beforeCourse : null);
  if (ctx && ctx.gameId) {
    const g0 = gameStore.getGame(ctx.gameId);
    if (g0) {
      assignCourseIdentity(beforeCtx, g0, !(ctx && ctx.beforeCourse));
      if (!(ctx && ctx.beforeCourse)) {
        beforeCtx.courseId = g0.courseId;
        beforeCtx.courseName = g0.courseName;
        beforeCtx.front9Course = g0.front9Course;
        beforeCtx.back9Course = g0.back9Course;
        beforeCtx.courseHalfText = g0.courseHalfText;
      }
    }
  } else if (ctx && ctx.matchId) {
    const m0 = teamMatchStore.getMatchById(ctx.matchId);
    if (m0) {
      assignCourseIdentity(beforeCtx, m0, !(ctx && ctx.beforeCourse));
      if (!(ctx && ctx.beforeCourse)) {
        const halves0 = resolveTeamMatchHalves(m0);
        beforeCtx.courseId = m0.courseId;
        beforeCtx.courseName = m0.courseName;
        beforeCtx.front9Course = halves0.front9Course;
        beforeCtx.back9Course = halves0.back9Course;
        beforeCtx.courseHalfText = m0.courseHalfText;
      }
    }
  }

  const combo = halfCourse.formatHalfCombo(front9, back9);
  const courseHalfText = halfCourse.formatCourseHalfText(combo);
  const afterFields = {
    courseId: (ctx && ctx.courseId) || beforeCtx.courseId || '',
    courseName: (ctx && ctx.courseName) || beforeCtx.courseName || '',
    front9Course: front9 || null,
    back9Course: back9 || null,
    courseHalfText: courseHalfText
  };

  const gameSnap =
    (ctx && ctx.rollbackGame) || (ctx && ctx.gameId ? cloneJson(gameStore.getGame(ctx.gameId)) : null);
  const matchSnap =
    (ctx && ctx.rollbackMatch) || (ctx && ctx.matchId ? cloneJson(teamMatchStore.getMatchById(ctx.matchId)) : null);
  const msSnap = cloneJson(readMatchState());
  const layoutSnap = holeLayout.getLayout ? cloneLayout(holeLayout.getLayout()) : null;
  const sideGameSettingsSnap = snapshotWx(SIDE_SETTINGS_KEY);
  const holeParsSnap = groupsStore.getHolePars ? groupsStore.getHolePars() : null;
  const groupsSnap = groupsStore.getGroups ? cloneJson(groupsStore.getGroups()) : null;
  const tournamentMetaSnap = groupsStore.getTournamentCourseMeta
    ? groupsStore.getTournamentCourseMeta()
    : null;
  const gameRollback = ctx && ctx.gameRollback;

  const needsRebuild = matchHoleOrderRebuild.needsHoleOrderRebuild(beforeCtx, afterFields);
  const matchId = matchHoleOrderRebuild.resolveMatchId({
    matchId: (ctx && ctx.matchId) || '',
    gameId: (ctx && ctx.gameId) || (msSnap && msSnap.gameId) || ''
  });
  const sideGameRowsSnap = snapshotSideGameRows(matchId);

  function buildRollbackJob() {
    const job = {
      matchStateSnap: msSnap,
      layoutSnap: layoutSnap,
      matchSnap: matchSnap,
      sideGameSettingsSnap: sideGameSettingsSnap,
      sideGameRowsSnap: sideGameRowsSnap,
      holeParsSnap: holeParsSnap,
      groupsSnap: groupsSnap,
      tournamentMetaSnap: tournamentMetaSnap,
      restoreTournamentMeta: !!(
        ctx &&
        !ctx.matchId &&
        (ctx.mode === 'individual_stroke' || ctx.source === 'tournament')
      )
    };
    if (gameRollback && (gameRollback.policy === 'restore' || gameRollback.policy === 'delete')) {
      job.policy = gameRollback.policy;
      job.gameId = gameRollback.gameId || (ctx && ctx.gameId) || '';
      job.beforeGame = gameRollback.beforeGame;
      job.expectedUpdatedAt = gameRollback.expectedUpdatedAt;
    } else {
      job.legacyGameSnap = gameSnap;
    }
    return job;
  }

  function rollback() {
    return runGameSaveRollback(buildRollbackJob());
  }

  function failResult(message, extra) {
    const msg = message || '保存失败';
    return Object.assign({ ok: false, error: msg, message: msg }, extra || {});
  }

  try {
    if (ctx.matchId) {
      const matchGuard = teamMatchStore.getMatchById(ctx.matchId);
      if (matchGuard) {
        const halfGuard = teamMatchFinish.assertWritable(matchGuard);
        if (!halfGuard.ok) {
          return failResult(halfGuard.message);
        }
      }
    }

    const isCreate = !!(ctx.gameRollback && ctx.gameRollback.policy === 'delete');
    const isTemporary = isTemporaryCourseCtx(beforeCtx) || isTemporaryCourseCtx(ctx);
    const courseChanged =
      courseDatabase.canonicalCourseId(beforeCtx.courseId) !==
        courseDatabase.canonicalCourseId(afterFields.courseId) ||
      String(beforeCtx.courseName || '') !== String(afterFields.courseName || '');
    const halvesChanged =
      String(beforeCtx.front9Course || '') !== String(front9 || '') ||
      String(beforeCtx.back9Course || '') !== String(back9 || '');
    const useCatalog =
      !isTemporary &&
      (isCreate ||
        courseDatabase.usesCatalogPars(beforeCtx) ||
        courseDatabase.usesCatalogPars(ctx) ||
        courseChanged ||
        halvesChanged);
    const afterCtx = {
      courseId: afterFields.courseId,
      courseName: afterFields.courseName,
      front9Course: front9 || null,
      back9Course: back9 || null,
      courseHalfText: courseHalfText,
      courseSource: isTemporary
        ? 'temporary'
        : beforeCtx.courseSource || (ctx && ctx.courseSource) || '',
      temporaryCourseId: isTemporary
        ? beforeCtx.temporaryCourseId || (ctx && ctx.temporaryCourseId) || ''
        : '',
      holePars: isTemporary
        ? Array.isArray(beforeCtx.holePars)
          ? beforeCtx.holePars.slice()
          : Array.isArray(ctx.holePars)
            ? ctx.holePars.slice()
            : undefined
        : undefined,
      courseLayoutRevision: isTemporary
        ? null
        : useCatalog
          ? courseDatabase.COURSE_LAYOUT_REVISION
          : beforeCtx.courseLayoutRevision
    };
    afterFields.courseSource = afterCtx.courseSource;
    afterFields.temporaryCourseId = afterCtx.temporaryCourseId;
    afterFields.courseLayoutRevision = afterCtx.courseLayoutRevision;
    if (isTemporary && Array.isArray(afterCtx.holePars)) {
      afterFields.holePars = afterCtx.holePars;
    }
    if (isTemporary && !temporaryCourse.isValidHolePars(afterCtx.holePars)) {
      return failResult('临时球场缺少有效标准杆，已取消更换');
    }
    const oldLayout = holeLayout.resolveLayoutFromContext(beforeCtx);
    const layout = holeLayout.resolveLayoutFromContext(afterCtx);
    const nextGame = ctx.gameId ? cloneJson(gameStore.getGame(ctx.gameId)) : null;
    const nextMatch = ctx.matchId ? cloneJson(teamMatchStore.getMatchById(ctx.matchId)) : null;
    const convertGroups =
      !ctx.matchId && (ctx.mode === 'individual_stroke' || ctx.source === 'tournament');
    const nextGroups = convertGroups && groupsStore.getGroups ? cloneJson(groupsStore.getGroups()) : null;
    const converted = halfCourseScoreConvert.prepareConvertedScores({
      beforeFront: beforeCtx.front9Course,
      beforeBack: beforeCtx.back9Course,
      afterFront: front9 || null,
      afterBack: back9 || null,
      oldPars: oldLayout && oldLayout.holePars,
      newPars: layout && layout.holePars,
      game: nextGame,
      match: nextMatch,
      groups: nextGroups
    });
    if (!converted.ok) {
      return failResult(converted.message, { details: converted.details || [] });
    }

    if (ctx.gameId && nextGame) {
      const gamePatch = {
        front9Course: front9 || null,
        back9Course: back9 || null,
        courseHalfText: courseHalfText,
        courseId: afterFields.courseId || nextGame.courseId,
        courseName: afterFields.courseName || nextGame.courseName
      };
      if (isTemporary) {
        gamePatch.courseSource = 'temporary';
        gamePatch.courseLayoutRevision = null;
        if (afterCtx.temporaryCourseId) gamePatch.temporaryCourseId = afterCtx.temporaryCourseId;
        if (Array.isArray(afterCtx.holePars)) gamePatch.holePars = afterCtx.holePars;
      } else if (useCatalog) {
        gamePatch.courseLayoutRevision = courseDatabase.COURSE_LAYOUT_REVISION;
      }
      gameStore.saveGame(Object.assign({}, nextGame, gamePatch));
    }

    if (ctx.matchId && nextMatch) {
      const matchPatch = {
        front9Course: front9 || null,
        back9Course: back9 || null,
        courseHalfText: courseHalfText,
        courseId: afterFields.courseId || nextMatch.courseId,
        courseName: afterFields.courseName || nextMatch.courseName
      };
      if (isTemporary) {
        matchPatch.courseSource = 'temporary';
        matchPatch.courseLayoutRevision = null;
        if (afterCtx.temporaryCourseId) matchPatch.temporaryCourseId = afterCtx.temporaryCourseId;
        if (Array.isArray(afterCtx.holePars)) matchPatch.holePars = afterCtx.holePars;
      } else if (useCatalog) {
        matchPatch.courseLayoutRevision = courseDatabase.COURSE_LAYOUT_REVISION;
      }
      teamMatchStore.saveMatch(Object.assign({}, nextMatch, matchPatch));
    } else if (ctx.mode === 'individual_stroke' || ctx.source === 'tournament') {
      const meta = groupsStore.getTournamentCourseMeta();
      groupsStore.setTournamentCourseHalf({
        courseId: afterFields.courseId || meta.courseId,
        courseName: afterFields.courseName || meta.courseName,
        courseLocation: meta.courseLocation,
        front9Course: front9 || null,
        back9Course: back9 || null,
        courseHalfText: courseHalfText
      });
      if (Array.isArray(nextGroups)) restoreGroupsSnapshot(nextGroups);
    }

    let holeOrderSync = { ok: true, rebuilt: false, skipped: true };
    if (needsRebuild && matchId) {
      holeOrderSync = matchHoleOrderRebuild.syncAfterCourseHalfChange({
        matchId: matchId,
        before: beforeCtx,
        after: afterFields,
        createdHoleOrder: matchHoleOrderRebuild.buildHoleLabelsFromHalves(front9, back9)
      });
      if (!holeOrderSync.ok) {
        const rb = rollback();
        return failResult(holeOrderSync.message || '洞序同步失败', {
          rollback: rb && rb.outcome,
          holeOrderSync: holeOrderSync
        });
      }
    }

    const ms = readMatchState();
    if (ms) {
      const c = Object.assign({}, ms.course || {}, {
        halfText: courseHalfText,
        front9Course: front9 || null,
        back9Course: back9 || null
      });
      if (isTemporary) {
        c.courseSource = 'temporary';
        c.courseLayoutRevision = null;
        if (afterCtx.temporaryCourseId) c.temporaryCourseId = afterCtx.temporaryCourseId;
        if (Array.isArray(afterCtx.holePars)) c.holePars = afterCtx.holePars;
      } else if (useCatalog) {
        c.courseLayoutRevision = courseDatabase.COURSE_LAYOUT_REVISION;
      }
      if (ctx.gameId) {
        const game = gameStore.getGame(ctx.gameId);
        if (game) {
          c.courseId = game.courseId || c.courseId;
          c.courseName = game.courseName || c.courseName;
          c.courseLocation = game.courseLocation || c.courseLocation;
        }
      }
      if (ctx.matchId) {
        const match = teamMatchStore.getMatchById(ctx.matchId);
        if (match) {
          c.courseId = match.courseId || c.courseId;
          c.courseName = match.courseName || c.courseName;
          c.courseLocation = match.courseLocation || c.courseLocation;
        }
      }
      matchState.setMatchState(Object.assign({}, ms, { course: c }));
    }

    holeLayout.applyLayout(layout);
    if (!ctx.matchId && (ctx.mode === 'individual_stroke' || ctx.source === 'tournament')) {
      groupsStore.setHolePars(layout.holePars);
    }

    const parsChanged =
      JSON.stringify((oldLayout && oldLayout.holePars) || []) !==
      JSON.stringify((layout && layout.holePars) || []);
    const hostStructureChanged =
      courseChanged ||
      halvesChanged ||
      parsChanged ||
      !!(holeOrderSync && holeOrderSync.rebuilt);
    if (hostStructureChanged && !(holeOrderSync && holeOrderSync.rebuilt)) {
      try {
        require('./sideGameDerivedNotify.js').notifyAllGamesReplay('course-half');
      } catch (eNotify) {}
    }

    return {
      ok: true,
      combo: combo,
      courseHalfText: courseHalfText,
      layout: layout,
      holeOrderSync: holeOrderSync,
      beforeCourse: snapshotCourseFields(beforeCtx),
      afterCourse: afterFields
    };
  } catch (err) {
    const rb = rollback();
    return failResult((err && err.message) || '保存失败', { rollback: rb && rb.outcome });
  }
}

module.exports = {
  buildContext,
  prepareSheet,
  apply,
  readMatchState,
  resolveTeamMatchHalves,
  runGameSaveRollback,
  nextSaveToken,
  CONFLICT_MESSAGE
};
