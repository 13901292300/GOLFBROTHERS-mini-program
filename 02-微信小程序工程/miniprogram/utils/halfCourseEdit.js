/**
 * 修改半场 — 比赛级统一逻辑（单组记分页 / Game Hub / 球队赛详情共用）
 * 成绩绑定记分格索引 0-17，半场变更只更新 course 配置与 HOLE/PAR 显示，禁止搬迁成绩。
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

/** 解析当前比赛的半场编辑上下文 */
function buildContext(opts) {
  const o = opts || {};
  if (o.gameId) {
    const game = gameStore.getGame(o.gameId);
    if (game) {
      return {
        gameId: o.gameId,
        matchId: '',
        mode: 'game',
        source: 'game',
        courseId: game.courseId,
        courseName: game.courseName,
        courseLocation: game.courseLocation,
        front9Course: game.front9Course,
        back9Course: game.back9Course
      };
    }
  }
  // 球队赛详情：以 teamMatchStore 为真源（须优先于演示用 tournament meta）
  if (o.matchId) {
    const match = teamMatchStore.getMatchById(o.matchId);
    if (match) {
      const halves = resolveTeamMatchHalves(match);
      return {
        gameId: '',
        matchId: o.matchId,
        mode: 'team_match',
        source: 'team_match',
        courseId: match.courseId,
        courseName: match.courseName,
        courseLocation: match.courseLocation,
        front9Course: halves.front9Course,
        back9Course: halves.back9Course
      };
    }
  }
  if (o.source === 'tournament' || o.mode === 'individual_stroke') {
    const meta = groupsStore.getTournamentCourseMeta();
    return {
      gameId: '',
      matchId: '',
      mode: 'individual_stroke',
      source: 'tournament',
      courseId: meta.courseId,
      courseName: meta.courseName,
      courseLocation: meta.courseLocation,
      front9Course: meta.front9Course,
      back9Course: meta.back9Course
    };
  }
  const ms = readMatchState();
  const c = (ms && ms.course) || {};
  return {
    gameId: (ms && ms.gameId) || o.gameId || '',
    matchId: o.matchId || '',
    mode: (ms && ms.mode) || o.mode || '',
    source: o.source || 'matchState',
    courseId: c.courseId,
    courseName: c.courseName,
    courseLocation: c.courseLocation,
    front9Course: c.front9Course,
    back9Course: c.back9Course
  };
}

/** 打开弹窗前：校验球场并回显当前前九/后九 */
function prepareSheet(ctx) {
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
    courseHalfText: c.courseHalfText || ''
  };
}

/**
 * 确认修改半场：更新 game / 球队赛 / 赛事 meta / matchState + 全局 holeLayout
 * 不触碰 scores / putts 数组
 * 若球场/半场/洞集合实际变化：原子重建 created/fullHoleOrder 并 +revision
 */
function apply(ctx, front9, back9) {
  // beforeCourse：编辑页可能已先写入新 course，须由调用方传入修改前快照
  const beforeCtx = Object.assign({}, ctx || {}, ctx && ctx.beforeCourse ? ctx.beforeCourse : null);
  if (!(ctx && ctx.beforeCourse)) {
    if (ctx && ctx.gameId) {
      const g0 = gameStore.getGame(ctx.gameId);
      if (g0) {
        beforeCtx.courseId = g0.courseId;
        beforeCtx.courseName = g0.courseName;
        beforeCtx.front9Course = g0.front9Course;
        beforeCtx.back9Course = g0.back9Course;
        beforeCtx.courseHalfText = g0.courseHalfText;
      }
    } else if (ctx && ctx.matchId) {
      const m0 = teamMatchStore.getMatchById(ctx.matchId);
      if (m0) {
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
    (ctx && ctx.rollbackGame) || (ctx && ctx.gameId ? gameStore.getGame(ctx.gameId) : null);
  const matchSnap =
    (ctx && ctx.rollbackMatch) || (ctx && ctx.matchId ? teamMatchStore.getMatchById(ctx.matchId) : null);
  const msSnap = readMatchState();
  const layoutSnap = holeLayout.getLayout && holeLayout.getLayout();

  const needsRebuild = matchHoleOrderRebuild.needsHoleOrderRebuild(beforeCtx, afterFields);
  const matchId = matchHoleOrderRebuild.resolveMatchId({
    matchId: (ctx && ctx.matchId) || '',
    gameId: (ctx && ctx.gameId) || (msSnap && msSnap.gameId) || ''
  });

  function rollback() {
    if (gameSnap) gameStore.saveGame(gameSnap);
    if (matchSnap) teamMatchStore.saveMatch(matchSnap);
    if (msSnap) matchState.setMatchState(msSnap);
    if (layoutSnap) holeLayout.applyLayout(layoutSnap);
  }

  if (ctx.gameId) {
    const game = gameStore.getGame(ctx.gameId);
    if (game) {
      gameStore.saveGame(
        Object.assign({}, game, {
          front9Course: front9 || null,
          back9Course: back9 || null,
          courseHalfText: courseHalfText,
          courseId: afterFields.courseId || game.courseId,
          courseName: afterFields.courseName || game.courseName
        })
      );
    }
  }

  if (ctx.matchId) {
    const match = teamMatchStore.getMatchById(ctx.matchId);
    if (match) {
      var halfGuard = teamMatchFinish.assertWritable(match);
      if (!halfGuard.ok) {
        return { ok: false, message: halfGuard.message };
      }
      teamMatchStore.saveMatch(
        Object.assign({}, match, {
          front9Course: front9 || null,
          back9Course: back9 || null,
          courseHalfText: courseHalfText,
          courseId: afterFields.courseId || match.courseId,
          courseName: afterFields.courseName || match.courseName
        })
      );
    }
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
  }

  const ms = readMatchState();
  if (ms) {
    const c = Object.assign({}, ms.course || {}, {
      halfText: courseHalfText,
      front9Course: front9 || null,
      back9Course: back9 || null
    });
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

  const layoutCtx = Object.assign({}, ctx, {
    courseId: afterFields.courseId,
    courseName: afterFields.courseName,
    front9Course: front9 || null,
    back9Course: back9 || null
  });
  const layout = holeLayout.resolveLayoutFromContext(layoutCtx);
  holeLayout.applyLayout(layout);
  if (!ctx.matchId && (ctx.mode === 'individual_stroke' || ctx.source === 'tournament')) {
    groupsStore.setHolePars(layout.holePars);
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
      rollback();
      return {
        ok: false,
        message: holeOrderSync.message || '洞序同步失败',
        holeOrderSync: holeOrderSync
      };
    }
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
}

module.exports = {
  buildContext,
  prepareSheet,
  apply,
  readMatchState,
  resolveTeamMatchHalves
};
