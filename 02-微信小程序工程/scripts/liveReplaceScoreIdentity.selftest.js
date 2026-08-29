/**
 * 普通单场 LIVE 换人继承成绩：权威口径回归 + Series 同构
 * - 新 userId 替换旧 userId
 * - 稳定 scorePlayerId 不变
 * - 展示当前 userId；成绩读取 scorePlayerId
 * - Series 只多 seriesId/roundId/matchId/publishToken
 *
 * 运行：node scripts/liveReplaceScoreIdentity.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

var tournamentGroupDraft = require(seriesTestPaths.util('tournamentGroupDraft.js'));
var playerManage = require(path.join(
  __dirname,
  '..',
  'miniprogram',
  'utils',
  'playerManage.js'
));
var teamMatchStore = require(path.join(
  __dirname,
  '..',
  'miniprogram',
  'utils',
  'teamMatchStore.js'
));
var tournamentGroupCardView = require(seriesTestPaths.util('tournamentGroupCardView.js'));

var editorSrc = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'miniprogram',
    'subpackages',
    'tournament',
    'pages',
    'group-editor',
    'index.js'
  ),
  'utf8'
);

var passed = 0;
var failed = 0;
var failures = [];

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    failures.push(name + (detail ? ' :: ' + detail : ''));
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function identityOf(player) {
  var p = player || {};
  return {
    userId: String(p.userId || ''),
    playerId: String(p.playerId || p.userId || ''),
    scorePlayerId: String(p.scorePlayerId || '')
  };
}

function groupsIdentity(groups) {
  return (Array.isArray(groups) ? groups : []).map(function (g) {
    return {
      groupId: String((g && g.groupId) || ''),
      players: (Array.isArray(g && g.players) ? g.players : []).map(identityOf)
    };
  });
}

var OLD_ID = 'u-old';
var NEW_ID = 'u-new';
var GROUP_ID = 'g-live-1';

var ordinaryOldGroups = [
  {
    groupId: GROUP_ID,
    groupName: '第1组',
    players: [
      {
        position: 1,
        userId: OLD_ID,
        playerId: OLD_ID,
        id: OLD_ID,
        scorePlayerId: OLD_ID,
        displayName: '旧球员'
      },
      { position: 2, userId: 'u-b', playerId: 'u-b', id: 'u-b' },
      { position: 3, userId: '', playerId: '', id: '' },
      { position: 4, userId: '', playerId: '', id: '' }
    ]
  }
];

var liveDraft = [
  {
    groupId: GROUP_ID,
    groupName: '第1组',
    players: [
      { position: 1, userId: NEW_ID, displayName: '新球员' },
      { position: 2, userId: 'u-b' },
      { position: 3, userId: '' },
      { position: 4, userId: '' }
    ]
  }
];

assert(
  'group-editor LIVE 保存走 applyLiveGroupsFromDraft',
  editorSrc.indexOf('applyLiveGroupsFromDraft(oldGroups, sanitized)') >= 0
);
assert(
  'group-editor LIVE 不改写 group-editor 业务分支',
  editorSrc.indexOf("if (this.data.mode === 'live')") >= 0 &&
    editorSrc.indexOf('this._confirmLiveGroups(match, rawDraft, pairingDraft)') >= 0
);

var addHistory = playerManage.verifySlotAddPlayerScenarios();
var addHistoryOk = addHistory.every(function (row) {
  return row && row.ok;
});
assert(
  '普通槽位加人事例（含历史成绩位继承 scorePlayerId）',
  addHistoryOk,
  JSON.stringify(addHistory.filter(function (r) { return !r.ok; }))
);

var inheritSeat = playerManage.addPlayerToGroupSlots(
  {
    groupId: 'verify-add-group-4',
    groupName: '第1组',
    players: [
      { position: 1, userId: 'A' },
      { position: 2, userId: 'B' },
      { position: 3, userId: '' },
      { position: 4, userId: '', scorePlayerId: 'D' }
    ]
  },
  { userId: 'E' },
  {
    scoreData: {
      'verify-add-group-4': {
        scoresByPlayer: { D: { scores: [4, 5, 4], putts: [2, 2, 1] } }
      }
    },
    slotPosition: 4
  }
);
var inheritEntry =
  inheritSeat &&
  inheritSeat.group &&
  inheritSeat.group.players.find(function (p) {
    return Number(p && p.position) === 4;
  });
assert(
  '普通加到历史位：userId=E 且 scorePlayerId=D',
  !!(inheritSeat && inheritSeat.ok) &&
    String(inheritEntry && inheritEntry.userId) === 'E' &&
    String(inheritEntry && inheritEntry.scorePlayerId) === 'D'
);

var ordinaryLive = tournamentGroupDraft.applyLiveGroupsFromDraft(
  clone(ordinaryOldGroups),
  clone(liveDraft)
);
var ordinarySeat = ordinaryLive[0].players[0];
assert(
  '普通 LIVE 换人：userId 换成新 ID',
  String(ordinarySeat.userId) === NEW_ID && String(ordinarySeat.playerId) === NEW_ID
);
assert(
  '普通 LIVE 换人：scorePlayerId 仍为旧成绩身份',
  String(ordinarySeat.scorePlayerId) === OLD_ID
);

var scoresByPlayer = {};
scoresByPlayer[OLD_ID] = { scores: [4, 5, 3] };
var readId = tournamentGroupDraft.resolveScorePlayerId(ordinarySeat) || ordinarySeat.userId;
assert(
  '成绩读取稳定成绩身份',
  readId === OLD_ID && !!(scoresByPlayer[readId] && scoresByPlayer[readId].scores)
);

var seriesOldGroups = clone(ordinaryOldGroups);
var seriesLive = tournamentGroupDraft.applyLiveGroupsFromDraft(seriesOldGroups, clone(liveDraft));
assert(
  'Series 同构：groups / score identity 与普通一致',
  JSON.stringify(groupsIdentity(seriesLive)) === JSON.stringify(groupsIdentity(ordinaryLive))
);

var ordinaryMatch = {
  matchId: 'm-ordinary',
  groups: ordinaryLive,
  scoreData: { 'g-live-1': { scoresByPlayer: scoresByPlayer } }
};
var seriesMatch = {
  matchId: 'm-series',
  groups: seriesLive,
  scoreData: { 'g-live-1': { scoresByPlayer: scoresByPlayer } },
  seriesContext: {
    managed: true,
    seriesId: 's-1',
    roundId: 'r-1',
    matchId: 'm-series',
    publishToken: 'tok-1'
  }
};

function displayIds(match) {
  var cards = tournamentGroupCardView.buildReadonlyGroupCards(match, {});
  return (cards[0] && (cards[0].displayPlayers || cards[0].players) || []).map(function (p) {
    return String(p.userId || p.playerId || '');
  });
}

assert(
  '普通投影当前 userId，不用成绩身份冒充展示',
  displayIds(ordinaryMatch)[0] === NEW_ID
);
assert(
  'Series 投影当前 userId，不用成绩身份冒充展示',
  displayIds(seriesMatch)[0] === NEW_ID
);

var extraKeys = Object.keys(seriesMatch).filter(function (k) {
  return !Object.prototype.hasOwnProperty.call(ordinaryMatch, k);
});
assert(
  'Series 只多 seriesContext（含稳定 seriesId/roundId/matchId/publishToken）',
  extraKeys.length === 1 &&
    extraKeys[0] === 'seriesContext' &&
    seriesMatch.seriesContext.seriesId === 's-1' &&
    seriesMatch.seriesContext.roundId === 'r-1' &&
    seriesMatch.seriesContext.matchId === 'm-series' &&
    seriesMatch.seriesContext.publishToken === 'tok-1'
);

var slots = teamMatchStore.resolveGroupSlots(ordinaryLive[0]);
assert(
  'slots 当前身份为新 userId，成绩身份仍为旧 ID',
  String(slots[0].userId) === NEW_ID && String(slots[0].scorePlayerId) === OLD_ID
);

var formal = tournamentGroupDraft.toFormalGroups(clone(ordinaryLive));
assert(
  'toFormalGroups 不再丢掉 LIVE scorePlayerId',
  String(formal[0].players[0].userId) === NEW_ID &&
    String(formal[0].players[0].scorePlayerId) === OLD_ID
);

console.log('');
console.log('liveReplaceScoreIdentity.selftest: ' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  console.log('Failures:');
  failures.forEach(function (f) {
    console.log('  - ' + f);
  });
  process.exit(1);
}
process.exit(0);
