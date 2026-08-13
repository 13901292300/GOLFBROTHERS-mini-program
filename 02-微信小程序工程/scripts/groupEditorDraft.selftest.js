/**
 * tournamentGroupDraft 抽取回归自测
 * - sanitize / 重复球员校验
 * - group-editor 仍 require 同一 util，且无系列赛跳转改道
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/groupEditorDraft.selftest.js
 */

var path = require('path');
var fs = require('fs');

var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');
var groupEditorPath = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'group-editor',
  'index.js'
);

var tournamentGroupDraft = require(path.join(utilsDir, 'tournamentGroupDraft.js'));

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

// --- sanitize：过滤空组 ---
var sanitized = tournamentGroupDraft.sanitizeGroupDraft([
  {
    groupId: 'g-empty',
    groupName: '空组',
    players: [
      { position: 1, userId: '' },
      { position: 2, userId: '' },
      { position: 3, userId: '' },
      { position: 4, userId: '' }
    ]
  },
  {
    groupId: 'g-filled',
    groupName: '有人组',
    players: [
      { position: 1, userId: 'u1' },
      { position: 2, userId: '' },
      { position: 3, userId: '' },
      { position: 4, userId: '' }
    ]
  }
]);
assert(
  'sanitize filters empty groups',
  Array.isArray(sanitized) &&
    sanitized.length === 1 &&
    String(sanitized[0].groupId) === 'g-filled',
  'len=' + (sanitized && sanitized.length)
);

// --- 重复球员校验 ---
var dupErr = tournamentGroupDraft.validateGroupDraft(
  [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        { position: 1, userId: 'u1' },
        { position: 2, userId: 'u1' },
        { position: 3, userId: '' },
        { position: 4, userId: '' }
      ]
    }
  ],
  {},
  {
    gameMode: '个人比杆赛',
    registerInfo: { users: [{ userId: 'u1', matchTeamId: 't1', groupId: 't1' }] },
    showCompositionMode: false,
    showPairingSection: false
  }
);
assert(
  'duplicate player validation',
  typeof dupErr === 'string' && dupErr.indexOf('重复') >= 0,
  String(dupErr)
);

var crossDupErr = tournamentGroupDraft.validateGroupDraft(
  [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        { position: 1, userId: 'u1' },
        { position: 2, userId: '' },
        { position: 3, userId: '' },
        { position: 4, userId: '' }
      ]
    },
    {
      groupId: 'g2',
      groupName: '第2组',
      players: [
        { position: 1, userId: 'u1' },
        { position: 2, userId: '' },
        { position: 3, userId: '' },
        { position: 4, userId: '' }
      ]
    }
  ],
  {},
  {
    gameMode: '个人比杆赛',
    registerInfo: { users: [{ userId: 'u1', matchTeamId: 't1', groupId: 't1' }] },
    showCompositionMode: false,
    showPairingSection: false
  }
);
assert(
  'cross-group duplicate player validation',
  typeof crossDupErr === 'string' && crossDupErr.indexOf('重复') >= 0,
  String(crossDupErr)
);

// --- 导出仍在 ---
assert(
  'validatePlayersForRegisterGameMode still exported',
  typeof tournamentGroupDraft.validatePlayersForRegisterGameMode === 'function'
);

// --- group-editor 接线与路径未改道 ---
assert('group-editor index.js exists', fs.existsSync(groupEditorPath));
var editorSrc = fs.readFileSync(groupEditorPath, 'utf8');
assert(
  'group-editor requires tournamentGroupDraft',
  /require\(['"][^'"]*tournamentGroupDraft\.js['"]\)/.test(editorSrc) ||
    editorSrc.indexOf('tournamentGroupDraft') >= 0
);
assert(
  'group-editor keeps group-pick navigate path',
  editorSrc.indexOf('/subpackages/tournament/pages/group-pick/index') >= 0
);
assert(
  'group-editor does not navigate to series-detail',
  editorSrc.indexOf('series-detail') < 0 &&
    editorSrc.indexOf('seriesSchedule') < 0
);
assert(
  'group-editor does not introduce plaza redirect for save',
  editorSrc.indexOf('section=plaza&tab=tournament') < 0
);

console.log('');
console.log('groupEditorDraft.selftest: ' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  console.log('Failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
