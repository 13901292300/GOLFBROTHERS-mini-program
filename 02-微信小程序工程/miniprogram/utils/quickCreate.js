/**
 * 快捷创建：一键生成单组单人普通球局并进入记分流程
 */

const gameStore = require('./gameStore.js');
const matchStateUtil = require('./matchState.js');
const { locateNearestCourseWithHalves } = require('./courseDatabase.js');
const createTeeTimeNow = require('./createTeeTimeNow.js');

function buildQuickCreateGame(courseInfo, user, now) {
  const teeTime = createTeeTimeNow.formatChineseTeeText(
    createTeeTimeNow.roundDraftToTenMinutes(createTeeTimeNow.partsFromDate(now))
  );
  const creatorId = user.userId;
  const roundName = (user.name || '我') + '的球局';
  const playerSlot = {
    playerId: creatorId,
    name: user.name || '我',
    avatar: user.avatar || ''
  };
  const group = {
    groupId: 'g-1',
    name: '第1组',
    status: 'not_started',
    playersSlots: [playerSlot],
    scoresByPlayer: {}
  };
  const gameId = 'g-' + Date.now();
  const courseHalfText = courseInfo.halfText ? '（' + courseInfo.halfText + '）' : '';

  const game = {
    gameId: gameId,
    courseId: courseInfo.courseId,
    courseName: courseInfo.courseName,
    courseLocation: courseInfo.courseLocation || '',
    front9Course: courseInfo.front9Course || null,
    back9Course: courseInfo.back9Course || null,
    courseHalfText: courseHalfText,
    teeTime: teeTime,
    roundName: roundName,
    gameMode: '个人比杆赛',
    visibility: 'public',
    accessCode: null,
    playersSlots: group.playersSlots,
    groups: [group],
    status: 'active',
    currentRound: 1,
    createdBy: creatorId,
    creatorId: creatorId,
    creatorGroupIndex: 0,
    creatorInGame: true,
    createdAt: Date.now()
  };

  const matchState = {
    mode: 'game',
    gameId: gameId,
    groupIndex: 0,
    groupId: gameId + ':0',
    players: [playerSlot],
    course: {
      courseId: courseInfo.courseId,
      courseName: courseInfo.courseName,
      courseLocation: courseInfo.courseLocation || '',
      halfText: courseHalfText,
      teeTime: teeTime,
      roundName: roundName,
      front9Course: courseInfo.front9Course || null,
      back9Course: courseInfo.back9Course || null
    },
    formatType: 'individual_stroke',
    scores: matchStateUtil.emptyScores(),
    groupCount: 1,
    fromFlow: 'quickCreate',
    fromPage: 'home'
  };

  return { game, matchState };
}

/**
 * 快捷创建并进入记分页
 * @returns {Promise<boolean>}
 */
function quickCreateAndEnterScore() {
  return locateNearestCourseWithHalves().then((courseInfo) => {
    if (!courseInfo) {
      wx.showToast({ title: '暂无可用球场', icon: 'none' });
      return false;
    }
    const user = gameStore.getCurrentUser();
    const { game, matchState } = buildQuickCreateGame(courseInfo, user);
    gameStore.saveGame(game);
    matchStateUtil.setMatchState(matchState);
    return matchStateUtil.enterScorePage();
  });
}

module.exports = {
  buildQuickCreateGame,
  quickCreateAndEnterScore
};
