/**
 * 五处组合展示名实际调用：`张三/李四`，过滤内部标签，身份键与杆数不变。
 * 运行：node scripts/comboNameTournamentJoin.selftest.js
 */
var path = require('path');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

var root = path.join(__dirname, '..');
var passed = 0;
var failed = 0;

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
    return;
  }
  failed += 1;
  console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
}

function isJoin(s) {
  return s === '张三/李四';
}

function u1(extra) {
  return Object.assign({ userId: 'u1', matchTeamId: 'red', displayName: '张三', name: '旧甲', position: 1 }, extra || {});
}
function u2(extra) {
  return Object.assign({ userId: 'u2', matchTeamId: 'red', name: '李四', position: 2 }, extra || {});
}
function u3(label) {
  return { userId: 'u3', matchTeamId: 'red', name: label, nickname: label, position: 3 };
}

function g2Match(extra) {
  extra = extra || {};
  var entityId = extra.entityId || 'ent-red';
  var mem = extra.members || ['u1', 'u2'];
  var users = extra.users || [u1(), u2()];
  var scores = extra.scores;
  if (!scores && extra.scored) {
    scores = [5, 5, 5, 5, null, null, null, null, null, null, null, null, null, null, null, null, null, null];
  }
  return Object.assign(
    {
      matchId: extra.matchId || 'm-join',
      gameMode: extra.gameMode || '四人四球比杆赛',
      status: extra.status || 'ongoing',
      teamGroups: [{ id: 'red', name: '红队' }],
      registerInfo: { users: users },
      groups: [{ groupId: 'g1', players: extra.players || [u1(), u2()] }],
      scoreEntities: {
        g1: [
          {
            entityId: entityId,
            entityType: extra.entityType || 'group',
            teamGroupId: extra.teamGroupId != null ? extra.teamGroupId : 'red',
            members: mem,
            name: extra.entityName,
            displayName: extra.entityDisplayName
          }
        ]
      },
      scoreData: {
        g1: {
          teamScoresByEntity: [
            Object.assign(
              { entityId: entityId, scores: scores !== undefined ? scores : extra.scored ? [5, 5, 5, 5, null, null, null, null, null, null, null, null, null, null, null, null, null, null] : [4, 5, null] },
              extra.scoreRec || {}
            )
          ]
        }
      }
    },
    extra.patch || {}
  );
}

if (typeof global.getApp !== 'function') {
  global.getApp = function () {
    return { getTheme: function () { return 'bright'; }, globalData: {} };
  };
}
var editorPage = null;
global.Page = function (def) {
  if (!editorPage) editorPage = def;
  return def;
};
global.wx = {
  getStorageSync: function () { return null; },
  setStorageSync: function () {},
  showToast: function () {},
  showModal: function () {},
  navigateBack: function () {},
  navigateTo: function () {},
  getWindowInfo: function () { return { windowWidth: 375, windowHeight: 667 }; },
  getSystemInfoSync: function () { return { windowWidth: 375, windowHeight: 667 }; }
};
var nativeTimeout = global.setTimeout;
global.setTimeout = function (fn) {
  if (typeof fn === 'function') fn();
  return 0;
};
require(path.join(root, 'miniprogram/subpackages/tournament-manage/pages/group-editor/index.js'));
global.setTimeout = nativeTimeout;

var draft = require(seriesTestPaths.util('tournamentGroupDraft.js'));
var statisticsAdapter = require(seriesTestPaths.util('statisticsAdapter.js'));
var seriesResultAdapter = require(seriesTestPaths.util('seriesResultAdapter.js'));
var roundBoard = require(path.join(
  root,
  'miniprogram/subpackages/tournament/pages/series-detail/seriesStandingsRoundBoard.js'
));
var personalBoard = require(path.join(root, 'miniprogram/utils/personalLeaderboardBoard.js'));
var comboEntityProjection = require(path.join(root, 'miniprogram/utils/comboEntityProjection.js'));
var assembler = require(seriesTestPaths.util('seriesStandingsAssembler.js'));

var editorCtx = {
  data: { gameMode: '四人四球比杆赛' },
  _matchSnapshot: { gameMode: '四人四球比杆赛' },
  _registerInfo: { users: [] }
};
function pairingNames(group, ids) {
  var view = editorPage._buildPairingBlockView.call(editorCtx, group, {
    g1: [{ id: 'p1', playerIds: ids }]
  }, '组合');
  return view && view.pairings && view.pairings[0];
}

var pair = pairingNames({ groupId: 'g1', players: [u1({ name: '张三' }), u2(), u3('组合1')] }, ['u1', 'u2', 'u3']);
assert('group-editor namesText 为张三/李四且过滤组合1', pair && isJoin(pair.namesText) && pair.namesText.indexOf('组合1') < 0);
assert('group-editor playerIds 顺序不变', pair && String(pair.playerIds) === 'u1,u2,u3');
var emptyPair = pairingNames({ groupId: 'g1', players: [] }, []);
assert('group-editor 空成员为暂无球员', emptyPair && emptyPair.namesText === '暂无球员' && emptyPair.isEmpty === true);

var redReg = { users: [u1(), u2(), u3('Team1')] };
var mpMatch = { gameMode: '个人比洞赛', teamGroups: [{ id: 'red', name: '红队' }], registerInfo: redReg };
var mp = draft.buildMatchPlayTeamPreview({ players: [u1(), u2(), u3('Team1')] }, mpMatch);
assert('Match Play namesText 为张三/李四且过滤 Team1', mp && mp[0] && isJoin(mp[0].namesText) && mp[0].namesText.indexOf('Team1') < 0);
assert('Match Play 空组为 null', draft.buildMatchPlayTeamPreview({ players: [] }, mpMatch) == null);

var g4 = draft.buildG4CompositionPreviewFromSeats(
  { players: [u1(), u2()] },
  { gameMode: '四人两球比杆赛', teamGroups: [{ id: 'red', name: '红队' }] },
  { users: [u1(), u2()] }
);
assert('G4 预览为张三/李四且忽略旧甲', g4 && isJoin(g4.combo1Text) && g4.combo1Text.indexOf('旧甲') < 0);
assert(
  'G4 空座位为 null',
  draft.buildG4CompositionPreviewFromSeats({ players: [] }, { gameMode: '四人两球比杆赛' }, { users: [] }) == null
);

var g2 = draft.buildCompositionPreview(
  { gameMode: '四人四球比杆赛', strokeCompositionMode: '2+2', teamGroups: [{ id: 'red', name: '红队' }], registerInfo: { users: [u1(), u2()] } },
  { players: [u1(), u2()] }
);
assert('编成预览为张三/李四', g2 && isJoin(g2.combo1Text));

var stats = statisticsAdapter.buildEntityStatisticsRows(
  g2Match({ entityId: 'ent-join', members: ['u1', 'u2', 'u3'], users: [u1(), u2(), u3('组合1')], players: [] })
);
assert('statisticsAdapter 名为张三/李四且过滤组合1', stats[0] && isJoin(stats[0].name) && stats[0].name.indexOf('组合1') < 0);
assert('statisticsAdapter entityId/memberIds 顺序不变', stats[0] && stats[0].entityId === 'ent-join' && String(stats[0].memberIds) === 'u1,u2,u3');
assert(
  'statisticsAdapter 空 members 无分不进统计',
  statisticsAdapter.buildEntityStatisticsRows(
    g2Match({ entityId: 'ent-empty', members: [], users: [], players: [], scores: [] })
  ).length === 0
);
assert(
  'displayName 优先于 name',
  statisticsAdapter.buildEntityStatisticsRows(g2Match({ entityId: 'ent-dn', members: ['u1', 'u2'] }))[0].name === '张三/李四'
);

var board = roundBoard.buildSeriesRoundBoardViewModel({
  match: g2Match({
    matchId: 'm-board',
    entityId: 'ent-board',
    members: ['u1', 'u2', 'u3'],
    players: [u1({ nickname: '张三', displayName: undefined, name: undefined }), u2(), u3('组合1')],
    scores: []
  }),
  view: 'entity'
});
assert(
  'roundBoard 名为张三/李四且行身份为 entityId',
  board.listRows[0] && isJoin(board.listRows[0].name) && board.listRows[0].entityId === 'ent-board'
);
assert(
  'roundBoard 空 members 无分无行',
  roundBoard.buildSeriesRoundBoardViewModel({
    match: g2Match({ matchId: 'm-empty', entityId: 'ent-x', members: [], players: [], users: [], scores: [] }),
    view: 'entity'
  }).listRows.length === 0
);

var series = {
  seriesId: 'series-join-1',
  scoringRule: { scoreBasis: 'gross' },
  participants: [{ seriesParticipantId: 'team:red', kind: 'team', sourceTeamId: 'red' }]
};
var extracted = seriesResultAdapter.extractEntriesFromStation({
  series: series,
  round: { roundId: 'r-join', index: 1, matchId: 'm-join', gameMode: '四人四球比杆赛' },
  match: g2Match({ scored: true })
});
var entry = extracted.ok && extracted.entries[0];
assert('resultAdapter unitName 为张三/李四', entry && isJoin(entry.unitName), extracted.reason);
assert('stableEntryId=sre__m-join__ent-red', entry && entry.entryId === 'sre__m-join__ent-red');
assert('sourceEntityKey/memberUserIds 顺序不变', entry && entry.sourceEntityKey === 'ent-red' && String(entry.memberUserIds) === 'u1,u2');
assert('rankingValue/gross 仍为杆数 20', entry && entry.rankingValue === 20 && entry.gross === 20);
assert('展示名不是 identity 键', entry && entry.entryId.indexOf('张三') < 0 && entry.unitId === 'ent-red');
assert(
  'resultAdapter 空成员无分无 entry',
  seriesResultAdapter.extractEntriesFromStation({
    series: series,
    round: { roundId: 'r-join', index: 1, matchId: 'm-join', gameMode: '四人四球比杆赛' },
    match: g2Match({ members: [], scores: [], users: [], players: [] })
  }).entries.length === 0
);

function emptyNamed(id) {
  return {
    userId: id,
    matchTeamId: 'red',
    name: '',
    nickname: '',
    displayName: '',
    competitionName: '',
    matchNickname: '',
    position: id === 'u1' ? 1 : 2
  };
}

function extractOf(match) {
  return seriesResultAdapter.extractEntriesFromStation({
    series: series,
    round: { roundId: 'r-join', index: 1, matchId: match.matchId || 'm-join', gameMode: '四人四球比杆赛' },
    match: match
  });
}

function roundRows(match) {
  return roundBoard.buildSeriesRoundBoardViewModel({ match: match, view: 'entity' }).listRows;
}

var unnamedUsers = [emptyNamed('u1'), emptyNamed('u2')];
var unnamedMatch = g2Match({
  entityId: 'ent-empty-names',
  members: ['u1', 'u2'],
  users: unnamedUsers,
  players: unnamedUsers,
  scored: true
});
var unnamedStats = statisticsAdapter.buildEntityStatisticsRows(unnamedMatch);
var unnamedBoard = roundRows(unnamedMatch);
var unnamedPersonal = personalBoard.buildEntityLeaderboardRows(unnamedMatch);
var unnamedExtract = extractOf(unnamedMatch).entries[0];
assert('空成员名统计保留组合', unnamedStats[0] && unnamedStats[0].name === '组合' && unnamedStats[0].entityId === 'ent-empty-names');
assert('空成员名单轮榜保留组合', unnamedBoard[0] && unnamedBoard[0].name === '组合' && unnamedBoard[0].entityId === 'ent-empty-names');
assert('空成员名个人榜保留组合', unnamedPersonal[0] && unnamedPersonal[0].name === '组合' && unnamedPersonal[0].entityId === 'ent-empty-names');
assert(
  '空成员名总榜unitName为组合且身份键不变',
  unnamedExtract &&
    unnamedExtract.unitName === '组合' &&
    unnamedExtract.entryId === 'sre__m-join__ent-empty-names' &&
    unnamedExtract.sourceEntityKey === 'ent-empty-names' &&
    String(unnamedExtract.memberUserIds) === 'u1,u2'
);

var label1Match = g2Match({
  entityId: 'ent-c1',
  entityName: '组合1',
  members: ['u1', 'u2'],
  users: unnamedUsers,
  players: unnamedUsers,
  scored: true
});
assert('savedName组合1统计为组合', statisticsAdapter.buildEntityStatisticsRows(label1Match)[0].name === '组合');
assert('savedName组合1单轮榜为组合', roundRows(label1Match)[0].name === '组合');
assert('savedName组合1个人榜为组合', personalBoard.buildEntityLeaderboardRows(label1Match)[0].name === '组合');
assert('savedName组合1总榜unitName为组合', extractOf(label1Match).entries[0].unitName === '组合');

var ironMatch = g2Match({
  entityId: 'ent-iron',
  entityName: '铁三角',
  members: ['u1', 'u2'],
  scored: true
});
assert('铁三角统计保留自定义名', statisticsAdapter.buildEntityStatisticsRows(ironMatch)[0].name === '铁三角');
assert('铁三角单轮榜保留自定义名', roundRows(ironMatch)[0].name === '铁三角');
assert('铁三角个人榜保留自定义名', personalBoard.buildEntityLeaderboardRows(ironMatch)[0].name === '铁三角');
assert('铁三角总榜unitName自定义名', extractOf(ironMatch).entries[0].unitName === '铁三角');
assert('铁三角entryId不含展示名', extractOf(ironMatch).entries[0].entryId.indexOf('铁三角') < 0);

var emptyScored = g2Match({
  entityId: 'ent-hist',
  members: [],
  users: [],
  players: [],
  scored: true
});
assert('空members有分统计保留', statisticsAdapter.buildEntityStatisticsRows(emptyScored)[0].name === '组合' && statisticsAdapter.buildEntityStatisticsRows(emptyScored)[0].entityId === 'ent-hist');
assert('空members有分单轮榜保留', roundRows(emptyScored)[0].name === '组合' && roundRows(emptyScored)[0].entityId === 'ent-hist');
assert('空members有分个人榜保留', personalBoard.buildEntityLeaderboardRows(emptyScored)[0].name === '组合');
var histEntry = extractOf(emptyScored).entries[0];
assert(
  '空members有分总榜保留组合且memberUserIds空',
  histEntry && histEntry.unitName === '组合' && histEntry.sourceEntityKey === 'ent-hist' && String(histEntry.memberUserIds) === ''
);

var noIdMatch = g2Match({ entityId: '', members: ['u1', 'u2'], scored: true });
noIdMatch.scoreEntities.g1[0].entityId = '';
assert('无entityId统计过滤', statisticsAdapter.buildEntityStatisticsRows(noIdMatch).length === 0);
assert('无entityId单轮榜过滤', roundRows(noIdMatch).length === 0);
assert('无entityId个人榜过滤', personalBoard.buildEntityLeaderboardRows(noIdMatch).length === 0);
assert('无entityId总榜过滤', extractOf(noIdMatch).entries.length === 0);

assert('0杆洞算有成绩', comboEntityProjection.entityScoreRecordHasValue({ scores: [0] }) === true);
assert('平杆0算有成绩', comboEntityProjection.entityScoreRecordHasValue({ scores: [], toPar: 0 }) === true);
assert('0积分算有成绩', comboEntityProjection.entityScoreRecordHasValue({ scores: [], points: 0 }) === true);
assert('空对象不算有成绩', comboEntityProjection.entityScoreRecordHasValue({}) === false);
assert('空分数组不算有成绩', comboEntityProjection.entityScoreRecordHasValue({ scores: [null, '', undefined] }) === false);

var zeroMatch = g2Match({
  entityId: 'ent-zero',
  members: ['u1', 'u2'],
  scores: [0],
  users: unnamedUsers,
  players: unnamedUsers
});
var zeroEntry = extractOf(zeroMatch).entries[0];
assert('0杆仍抽取且rankingValue为0', zeroEntry && zeroEntry.gross === 0 && zeroEntry.rankingValue === 0 && zeroEntry.unitName === '组合');
assert('0杆单轮榜有行', roundRows(zeroMatch)[0] && roundRows(zeroMatch)[0].hasScore === true && roundRows(zeroMatch)[0].entityId === 'ent-zero');

var awaitingMatch = g2Match({
  entityId: 'ent-wait',
  members: ['u1', 'u2'],
  scores: [],
  status: 'ongoing'
});
var awaitingRows = roundRows(awaitingMatch);
assert(
  '有成员无分单轮榜保留AWAITING',
  awaitingRows[0] &&
    awaitingRows[0].entityId === 'ent-wait' &&
    awaitingRows[0].hasScore === false &&
    awaitingRows[0].statusLabel === 'AWAITING SCORE' &&
    awaitingRows[0].name === '张三/李四'
);
assert('有成员无分总榜仍不计', extractOf(awaitingMatch).entries.length === 0);

assert('assembler entity空名回退组合', comboEntityProjection.fallbackComboUnitName('entity', '') === '组合');
assert('assembler pair空名回退组合', comboEntityProjection.fallbackComboUnitName('pair', '  ') === '组合');
assert('assembler 保留已有unitName', comboEntityProjection.fallbackComboUnitName('entity', '铁三角') === '铁三角');
var merged = assembler.mergeLineupWithScores(
  [
    {
      roundId: 'r1',
      unitId: 'u-seat',
      playerId: 'u-seat',
      unitName: '',
      resultUnitType: 'player',
      memberUserIds: ['u-seat']
    }
  ],
  [
    {
      roundId: 'r1',
      unitId: 'ent-red',
      unitName: '',
      resultUnitType: 'entity',
      entryId: 'sre__m__ent-red',
      rankingValue: 72,
      memberUserIds: ['u-seat']
    }
  ]
);
assert(
  'assembler合并entity空名不泄露unitId',
  merged[0] && merged[0].unitName === '组合' && merged[0].entityId === 'ent-red' && merged[0].entryId === 'sre__m__ent-red'
);

var detailDef = null;
var prevPage = global.Page;
global.Page = function (def) {
  detailDef = def;
  return def;
};
var detailLoadErr = null;
try {
  require(path.join(root, 'miniprogram/subpackages/tournament/pages/detail/index.js'));
} catch (eDetail) {
  detailLoadErr = eDetail;
}
global.Page = prevPage;
assert('detail Page 可加载', !detailLoadErr && detailDef && typeof detailDef._buildEntityLeaderboardRows === 'function', detailLoadErr && String(detailLoadErr.message));
if (detailDef && typeof detailDef._buildEntityLeaderboardRows === 'function') {
  var detailCtx = {};
  Object.keys(detailDef).forEach(function (k) {
    if (typeof detailDef[k] === 'function') detailCtx[k] = detailDef[k];
  });
  detailCtx.data = { openIndex: -1, leaderboardScoreType: 'gross', matchId: '' };
  detailCtx._viewerRemarkCtx = { viewer: '', rev: 0, map: {} };
  function detailRows(match) {
    return detailCtx._buildEntityLeaderboardRows(match, -1) || [];
  }
  var dJoin = detailRows(g2Match({ entityId: 'ent-d1', members: ['u1', 'u2'], scored: true }));
  assert('detail 成员名完整为张三/李四', dJoin[0] && isJoin(dJoin[0].name) && dJoin[0].entityId === 'ent-d1');
  var dEmpty = detailRows(unnamedMatch);
  assert('detail 空成员名保留组合', dEmpty[0] && dEmpty[0].name === '组合' && dEmpty[0].entityId === 'ent-empty-names');
  var dLabel = detailRows(label1Match);
  assert('detail 组合1为组合', dLabel[0] && dLabel[0].name === '组合');
  var dIron = detailRows(ironMatch);
  assert('detail 铁三角保留', dIron[0] && dIron[0].name === '铁三角' && dIron[0].entityId === 'ent-iron');
  var dSlot = detailRows(g2Match({ entityId: 'ent-d-empty', members: [], users: [], players: [], scores: [] }));
  assert('detail 空槽无分过滤', dSlot.length === 0);
  var dHist = detailRows(emptyScored);
  assert('detail 空members有分保留组合', dHist[0] && dHist[0].name === '组合' && dHist[0].entityId === 'ent-hist');
  var dNoId = detailRows(noIdMatch);
  assert('detail 无entityId过滤', dNoId.length === 0);
  var dZero = detailRows(zeroMatch);
  assert('detail 0杆有行且entityId可点', dZero[0] && dZero[0].hasScore === true && dZero[0].entityId === 'ent-zero' && dZero[0].name === '组合');
  var dWait = detailRows(awaitingMatch);
  assert(
    'detail 有成员无分保留未开球',
    dWait[0] && dWait[0].entityId === 'ent-wait' && dWait[0].hasScore === false && dWait[0].name === '张三/李四'
  );
}

console.log('\ncomboNameTournamentJoin.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
