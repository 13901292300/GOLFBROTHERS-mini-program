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
var seriesTestPaths = require('./lib/seriesTestPaths.js');

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

var tournamentGroupDraft = require(seriesTestPaths.util('tournamentGroupDraft.js'));

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
  'group-editor requires main-package unique tournamentGroupDraft',
  /require\(['"][^'"]*utils\/tournament\/tournamentGroupDraft\.js['"]\)/.test(editorSrc)
);
assert(
  'group-editor keeps group-pick navigate path',
  editorSrc.indexOf('/subpackages/tournament/pages/group-pick/index') >= 0
);
assert(
  'group-editor may require seriesGroupPickRoster',
  /require\(['"]\.\.\/series-detail\/seriesGroupPickRoster\.js['"]\)/.test(editorSrc)
);

function wxNavUrlHitsSeriesDetail(src) {
  return /wx\.(navigateTo|redirectTo|reLaunch)\s*\(\s*\{[\s\S]{0,400}?url\s*:[\s\S]{0,300}?series-detail/.test(
    src
  );
}

assert(
  'group-editor does not navigateTo/redirectTo/reLaunch series-detail',
  !wxNavUrlHitsSeriesDetail(editorSrc)
);

(function assertSaveDoesNotJumpSeriesDetail() {
  var key = 'teamMatchStore.saveMatch';
  var idx = 0;
  var ok = true;
  while ((idx = editorSrc.indexOf(key, idx)) >= 0) {
    var window = editorSrc.slice(idx, idx + 900);
    if (
      wxNavUrlHitsSeriesDetail(window) ||
      /wx\.(navigateTo|redirectTo|reLaunch)\s*\([\s\S]{0,400}series-detail/.test(window)
    ) {
      ok = false;
      break;
    }
    idx += key.length;
  }
  assert('save success does not jump to Series detail', ok);
})();
assert(
  'group-editor does not introduce plaza redirect for save',
  editorSrc.indexOf('section=plaza&tab=tournament') < 0
);

(function assertUniqueMainDomainModules() {
  var mini = path.join(__dirname, '..', 'miniprogram');
  var names = [
    'tournamentGroupDraft.js',
    'seriesScheduleGroupWrite.js',
    'seriesScheduleCandidates.js'
  ];
  var expectedExports = {
    'tournamentGroupDraft.js': [
      'PLAYER_SLOTS',
      'DEFAULT_REGISTER_GROUPS',
      'STROKE_ENTITY_INVALID_TIP',
      'resolveSideUnitLabel',
      'resolveScorePlayerId',
      'withScorePlayerFields',
      'createEmptyGroupPlayer',
      'createEmptyGroup',
      'buildRegisterPlayerLookup',
      'hydrateDraftPlayers',
      'cloneTournamentGroups',
      'toFormalGroups',
      'findPlayerEntryByPosition',
      'buildLivePlayerEntry',
      'buildLiveGroupFromDraft',
      'applyLiveGroupsFromDraft',
      'bindLiveScoreIdentityToSeats',
      'rebindLiveScoreDataToSeatPlayers',
      'remapLiveScoreIdentityByPlayerId',
      'rematerializeLivePlayersAfterNormalize',
      'pickSeatAffiliationFields',
      'buildG4RegisterTeamMap',
      'listG4TeamOrder',
      'hasFormalGroups',
      'buildInitialGroupDraft',
      'resolvePlayerDisplayName',
      'shouldShowAvatarTeamLabel',
      'mapPlayersForCard',
      'resolveRegisterInfo',
      'buildRegisterTeamGroupMap',
      'resolvePlayerTeamGroupId',
      'listFilledPickPlayers',
      'ensurePlayersHaveTeam',
      'allMembersSameTeam',
      'generatePairCompositionsByTeam',
      'validateGeneratedCompositions',
      'validateG2G3TwoPlusTwoPlayers',
      'validateStrokeCompositionPlayers',
      'validateG4GroupStructurePlayers',
      'validatePlayersForRegisterGameMode',
      'resolveRegisterTeamId',
      'buildPreviewRegisterMaps',
      'buildMatchPlayTeamPreview',
      'buildCompositionPreview',
      'buildG4CompositionPreviewFromSeats',
      'resolveRegisterSubTabs',
      'buildPairingSlotId',
      'resolvePairingSlotNo',
      'createEmptyPairing',
      'buildAutoPairingsForGroup',
      'sanitizeGroupDraft',
      'validatePairingDraft',
      'validateGroupDraft'
    ],
    'seriesScheduleGroupWrite.js': [
      'STATION_DATA_INVALID_MSG',
      'verifySeriesContext',
      'buildSyntheticRegisterInfoFromDraft',
      'validateSeriesSeatAffiliation',
      'saveStationGroups',
      'startStationRound'
    ],
    'seriesScheduleCandidates.js': [
      'listScheduleCandidatePlayers',
      'listAffiliationOptions',
      'assertAffiliationChoice',
      'resolveHostParticipantKind'
    ]
  };

  function walkNamed(dir, fileName, acc) {
    acc = acc || [];
    if (!fs.existsSync(dir)) return acc;
    fs.readdirSync(dir).forEach(function (n) {
      if (n === 'node_modules') return;
      var abs = path.join(dir, n);
      var st = fs.statSync(abs);
      if (st.isDirectory()) {
        walkNamed(abs, fileName, acc);
        return;
      }
      if (n === fileName) acc.push(abs);
    });
    return acc;
  }

  names.forEach(function (name) {
    var mainPath = seriesTestPaths.util(name);
    var expected = path.join(seriesTestPaths.MAIN_TOURNAMENT_UTILS, name);
    assert(name + ' util() resolves only to miniprogram/utils/tournament', mainPath === expected);
    assert(name + ' exists in main tournament utils', fs.existsSync(mainPath));
    assert(
      name + ' old tournament/utils copy gone',
      !fs.existsSync(path.join(mini, 'subpackages', 'tournament', 'utils', name))
    );
    assert(
      name + ' old series-detail copy gone',
      !fs.existsSync(
        path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail', name)
      )
    );
    var hits = walkNamed(mini, name, []);
    assert(name + ' has exactly one production copy', hits.length === 1, hits.join(' | '));
    var src = fs.readFileSync(mainPath, 'utf8');
    assert(
      name + ' requires stay in main package',
      src.indexOf('subpackages/tournament') < 0
    );
    var mod = require(mainPath);
    (expectedExports[name] || []).forEach(function (key) {
      assert(
        name + ' still exports ' + key,
        mod[key] != null,
        typeof (mod && mod[key])
      );
    });
  });
})();

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
