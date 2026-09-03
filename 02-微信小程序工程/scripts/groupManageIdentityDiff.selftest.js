/**
 * 人员调整：删除 A + 添加 B 折成身份纠错，并同步 side-game。
 * 运行：node scripts/groupManageIdentityDiff.selftest.js
 */
var path = require('path');
var diffUtil = require('../miniprogram/subpackages/scoring/utils/groupManageIdentityDiff.js');

var passed = 0;
var failed = 0;

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

function makeWx(list) {
  var bag = { gb_side_games_v1: JSON.parse(JSON.stringify(list || [])) };
  return {
    getStorageSync: function (key) {
      return bag[key];
    },
    setStorageSync: function (key, value) {
      bag[key] = JSON.parse(JSON.stringify(value));
    },
    _bag: bag
  };
}

var folded = diffUtil.foldIdentityCorrection({
  added: [{ type: 'add', slotIndex: 2, toPlayerId: 'B', to: { name: 'Bee' } }],
  removed: [{ type: 'remove', slotIndex: 0, fromPlayerId: 'A', from: { name: 'Aye' } }],
  replaced: [],
  unchanged: []
});
assert('1:1 删除A+添加B 折成 replace', folded.replaced.length === 1 && folded.added.length === 0 && folded.removed.length === 0);
assert('replace 映射 A→B 且 preserveScores', folded.replaced[0].fromPlayerId === 'A' && folded.replaced[0].toPlayerId === 'B' && folded.replaced[0].preserveScores === true);
assert('toSlotIndex 为添加槽', folded.replaced[0].slotIndex === 0 && folded.replaced[0].toSlotIndex === 2);

var onlyRemove = diffUtil.foldIdentityCorrection({
  added: [],
  removed: [{ type: 'remove', slotIndex: 0, fromPlayerId: 'A' }],
  replaced: [],
  unchanged: []
});
assert('纯删除不折成 replace', onlyRemove.removed.length === 1 && onlyRemove.replaced.length === 0);

var sameSlot = diffUtil.foldIdentityCorrection({
  added: [],
  removed: [],
  replaced: [{ type: 'replace', slotIndex: 1, fromPlayerId: 'A', toPlayerId: 'B', preserveScores: true }],
  unchanged: []
});
assert('已有 replace 不再二次折叠', sameSlot.replaced.length === 1 && sameSlot.added.length === 0);

var gameRow = {
  sideGameId: 'sg1',
  matchId: 'm1',
  status: 'active',
  participantParties: [
    { partyId: 'A', partyType: 'player', displayName: 'Aye', memberPlayerIds: ['A'] },
    { partyId: 'C', partyType: 'player', displayName: 'Cee', memberPlayerIds: ['C'] }
  ],
  config: { instance: { players: [{ playerId: 'A' }, { playerId: 'C' }] } },
  resultSnapshot: { ranking: { A: 1, C: 2 }, scores: { A: 72 } }
};

var conflictRow = Object.assign({}, gameRow, {
  participantParties: [
    { partyId: 'A', partyType: 'player', memberPlayerIds: ['A'] },
    { partyId: 'B', partyType: 'player', memberPlayerIds: ['B'] }
  ]
});
var conflict = diffUtil.inspectStorageRemap([conflictRow], 'm1', [
  { fromPlayerId: 'A', toPlayerId: 'B' }
]);
assert('B 已在同场游戏中冲突', conflict.ok === false && conflict.message === '目标球员已在本场比赛中');

var wxApi = makeWx([gameRow]);
var applied = diffUtil.applyGroupManageStorageDiff(
  wxApi,
  'm1',
  { replaced: folded.replaced, removed: [], added: [] },
  { profiles: { B: { displayName: 'Bee', name: 'Bee', avatar: 'b.png' } }, stillPresentIds: { B: true, C: true } }
);
var stored = wxApi._bag.gb_side_games_v1[0];
assert('纠错后游戏仍存在', applied.ok === true && stored.status !== 'deleted');
assert('参与方 A 改为 B', stored.participantParties[0].partyId === 'B' && stored.participantParties[0].memberPlayerIds[0] === 'B');
assert('结果归属改挂 B 且杆数不变', stored.resultSnapshot.ranking.B === 1 && stored.resultSnapshot.scores.B === 72 && stored.resultSnapshot.scores.A == null);

var comboGame = {
  sideGameId: 'sg-combo',
  matchId: 'm1',
  status: 'active',
  participantParties: [
    {
      partyId: 'combo1',
      partyType: 'combination',
      displayName: 'Aye + Pal',
      memberPlayerIds: ['A', 'C']
    }
  ],
  config: {
    instance: {
      players: [
        {
          id: 'combo1',
          partyType: 'combination',
          useSubjectName: true,
          name: 'Aye + Pal',
          displayName: 'Aye + Pal',
          members: [
            { playerId: 'A', displayName: 'Aye' },
            { playerId: 'C', displayName: 'Pal' }
          ]
        }
      ]
    }
  },
  resultSnapshot: {
    ranking: { combo1: 1 },
    parties: [
      {
        partyType: 'combination',
        name: 'Aye + Pal',
        members: [
          { playerId: 'A', displayName: 'Aye' },
          { playerId: 'C', displayName: 'Pal' }
        ]
      }
    ]
  }
};
var wxCombo = makeWx([comboGame]);
diffUtil.applyGroupManageStorageDiff(
  wxCombo,
  'm1',
  { replaced: folded.replaced, removed: [], added: [] },
  { profiles: { B: { displayName: 'Bee', name: 'Bee' } }, stillPresentIds: { B: true, C: true } }
);
var comboStored = wxCombo._bag.gb_side_games_v1[0];
assert(
  '纠错后实例组合名为 / 且 A→B',
  comboStored.config.instance.players[0].displayName === 'Bee/Pal' &&
    comboStored.config.instance.players[0].members[0].playerId === 'B'
);
assert(
  '纠错后结果快照组合名不用 +',
  comboStored.resultSnapshot.parties[0].displayName === 'Bee/Pal' &&
    String(comboStored.resultSnapshot.parties[0].name).indexOf(' + ') < 0
);
assert(
  '自定义组合名保留',
  (function () {
    var named = JSON.parse(JSON.stringify(comboGame));
    named.config.instance.players[0].name = '铁三角';
    named.config.instance.players[0].displayName = '铁三角';
    named.resultSnapshot.parties[0].name = '铁三角';
    var wxNamed = makeWx([named]);
    diffUtil.applyGroupManageStorageDiff(
      wxNamed,
      'm1',
      { replaced: folded.replaced, removed: [], added: [] },
      { profiles: { B: { displayName: 'Bee', name: 'Bee' } }, stillPresentIds: { B: true, C: true } }
    );
    return wxNamed._bag.gb_side_games_v1[0].config.instance.players[0].displayName === '铁三角';
  })()
);

var wxDel = makeWx([gameRow]);
var deleted = diffUtil.applyGroupManageStorageDiff(
  wxDel,
  'm1',
  { replaced: [], removed: [{ fromPlayerId: 'A' }], added: [] },
  { stillPresentIds: { C: true } }
);
assert('纯删除 A 时删除触及 A 的游戏', deleted.ok === true && wxDel._bag.gb_side_games_v1[0].status === 'deleted');

var wxKeep = makeWx([gameRow]);
var kept = diffUtil.applyGroupManageStorageDiff(
  wxKeep,
  'm1',
  { replaced: [], removed: [{ fromPlayerId: 'A' }], added: [] },
  { stillPresentIds: { A: true, C: true } }
);
assert('A 仍在其他组时不删游戏', kept.ok === true && wxKeep._bag.gb_side_games_v1[0].status !== 'deleted');

var fourball = {
  sideGameId: 'sg-22',
  matchId: 'm1',
  status: 'active',
  participantParties: [
    {
      partyId: 'combo-ab',
      partyType: 'combination',
      displayName: 'Aye/Bee',
      memberPlayerIds: ['A', 'B']
    },
    {
      partyId: 'combo-cd',
      partyType: 'combination',
      displayName: 'Cee/Dee',
      memberPlayerIds: ['C', 'D']
    }
  ],
  config: {
    instance: {
      players: [
        {
          id: 'combo-ab',
          partyType: 'combination',
          useSubjectName: true,
          name: 'Aye/Bee',
          displayName: 'Aye/Bee',
          members: [
            { playerId: 'A', displayName: 'Aye' },
            { playerId: 'B', displayName: 'Bee' }
          ]
        },
        {
          id: 'combo-cd',
          partyType: 'combination',
          useSubjectName: true,
          name: 'Cee/Dee',
          displayName: 'Cee/Dee',
          members: [
            { playerId: 'C', displayName: 'Cee' },
            { playerId: 'D', displayName: 'Dee' }
          ]
        }
      ]
    }
  },
  resultSnapshot: {
    ranking: { 'combo-ab': 1, 'combo-cd': 2 },
    scores: { 'combo-ab': 70, 'combo-cd': 72 },
    parties: [
      {
        partyType: 'combination',
        name: 'Aye/Bee',
        members: [
          { playerId: 'A', displayName: 'Aye' },
          { playerId: 'B', displayName: 'Bee' }
        ]
      },
      {
        partyType: 'combination',
        name: 'Cee/Dee',
        members: [
          { playerId: 'C', displayName: 'Cee' },
          { playerId: 'D', displayName: 'Dee' }
        ]
      }
    ]
  }
};
var swapReplaced = [
  { fromPlayerId: 'B', toPlayerId: 'C' },
  { fromPlayerId: 'C', toPlayerId: 'B' }
];
assert(
  '2+2 A/B、C/D→A/C、B/D 最终名单不重复',
  diffUtil.inspectFinalOccupiedIds(['A', 'C', 'B', 'D']).ok === true
);
assert(
  '2+2 互换不因旧结构占用误报',
  diffUtil.inspectStorageRemap([fourball], 'm1', swapReplaced).ok === true
);
var wx22 = makeWx([fourball]);
var applied22 = diffUtil.applyGroupManageStorageDiff(
  wx22,
  'm1',
  { replaced: swapReplaced, removed: [], added: [] },
  {
    profiles: {
      B: { displayName: 'Bee', name: 'Bee' },
      C: { displayName: 'Cee', name: 'Cee' }
    },
    stillPresentIds: { A: true, B: true, C: true, D: true }
  }
);
var stored22 = wx22._bag.gb_side_games_v1[0];
assert('2+2 互换保存成功且游戏仍在', applied22.ok === true && stored22.status !== 'deleted');
assert(
  '2+2 组合成员变为 A/C 与 B/D',
  stored22.participantParties[0].memberPlayerIds.join(',') === 'A,C' &&
    stored22.participantParties[1].memberPlayerIds.join(',') === 'B,D'
);
assert(
  '2+2 自动组合名使用 / 且成绩数值不变',
  stored22.config.instance.players[0].displayName === 'Aye/Cee' &&
    stored22.config.instance.players[1].displayName === 'Bee/Dee' &&
    stored22.resultSnapshot.scores['combo-ab'] === 70 &&
    stored22.resultSnapshot.scores['combo-cd'] === 72 &&
    String(stored22.config.instance.players[0].displayName).indexOf('+') < 0 &&
    String(stored22.config.instance.players[0].displayName).indexOf('Team') < 0
);
var realDup = diffUtil.inspectStorageRemap([fourball], 'm1', [{ fromPlayerId: 'C', toPlayerId: 'B' }]);
assert(
  '最终结构真重复 ID 仍冲突',
  realDup.ok === false && realDup.reason === 'identity_conflict' && realDup.message === '目标球员已在本场比赛中'
);
assert(
  '最终两个位置都选 B 被拦截',
  diffUtil.inspectFinalOccupiedIds(['A', 'B', 'B', 'D']).ok === false &&
    diffUtil.inspectFinalOccupiedIds(['A', 'B', 'B', 'D']).message === '目标球员已在本场比赛中'
);

var wxFail = makeWx([gameRow]);
var snap = wxFail._bag.gb_side_games_v1;
diffUtil.applyGroupManageStorageDiff(
  wxFail,
  'm1',
  { replaced: folded.replaced, removed: [], added: [] },
  { profiles: { B: { displayName: 'Bee' } }, stillPresentIds: { B: true } }
);
diffUtil.restoreSideGameSnapshot(wxFail, snap);
assert('保存失败可回滚 side-game', wxFail._bag.gb_side_games_v1[0].participantParties[0].partyId === 'A');

var fs = require('fs');
var scoreJs = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/scoring/pages/score/index.js'),
  'utf8'
);
assert(
  '确认链路不再因 require.async 提前 return',
  scoreJs.indexOf('_groupManageIdentityInspected') < 0
);
assert(
  '确认按钮仍绑定 _onConfirmGroupManage',
  fs
    .readFileSync(
      path.join(__dirname, '../miniprogram/subpackages/scoring/pages/score/index.wxml'),
      'utf8'
    )
    .indexOf('bindtap="_onConfirmGroupManage"') >= 0
);
assert('提交锁存在', scoreJs.indexOf('_groupManageCommitBusy') >= 0);
assert('冲突校验改为最终结构', scoreJs.indexOf('inspectFinalOccupiedIds') >= 0);
assert('成绩一次映射入口', scoreJs.indexOf('rekeyGroupPlayerScoresMap') >= 0 && scoreJs.indexOf('_rebindTeamMatchScoreOwners') >= 0);
assert('ID纠错入口 foldIdentityCorrection', scoreJs.indexOf('foldIdentityCorrection') >= 0);
assert('ID纠错入口 applyGroupManageStorageDiff', scoreJs.indexOf('applyGroupManageStorageDiff') >= 0);

console.log('\ngroupManageIdentityDiff.selftest passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
