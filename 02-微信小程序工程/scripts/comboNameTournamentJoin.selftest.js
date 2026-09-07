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
      status: 'ongoing',
      teamGroups: [{ id: 'red', name: '红队' }],
      registerInfo: { users: users },
      groups: [{ groupId: 'g1', players: extra.players || [u1(), u2()] }],
      scoreEntities: {
        g1: [{ entityId: entityId, entityType: 'group', teamGroupId: 'red', members: mem }]
      },
      scoreData: {
        g1: { teamScoresByEntity: [{ entityId: entityId, scores: scores || [4, 5, null] }] }
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
  'statisticsAdapter 空 members 不进统计',
  statisticsAdapter.buildEntityStatisticsRows(g2Match({ entityId: 'ent-empty', members: [], users: [], players: [] })).length === 0
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
  'roundBoard 空 members 无行',
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
  'resultAdapter 空成员无 entry',
  seriesResultAdapter.extractEntriesFromStation({
    series: series,
    round: { roundId: 'r-join', index: 1, matchId: 'm-join', gameMode: '四人四球比杆赛' },
    match: g2Match({ members: [], scored: true })
  }).entries.length === 0
);

console.log('\ncomboNameTournamentJoin.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
