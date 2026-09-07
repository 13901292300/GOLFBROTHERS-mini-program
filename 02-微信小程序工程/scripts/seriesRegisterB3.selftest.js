/**
 * 系列赛报名 B3 自测：真实身份 / 球队归属 / CTA 文案 / 接线契约
 * 不写生产 storage；不进 DevTools。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesRegisterB3.selftest.js
 */

global.__TEAM_CLUB_REPO_MODE = 'local';

var path = require('path');
var fs = require('fs');

if (typeof global.wx === 'undefined') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {},
    removeStorageSync: function () {}
  };
}

var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');
var pageDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);

var teamDirectory = require(path.join(utilsDir, 'teamDirectory.js'));
var seriesRegistration = require(path.join(utilsDir, 'seriesRegistration.js'));
var eligibility = require(path.join(pageDir, 'seriesRegisterEligibility.js'));
var registerVm = require(path.join(pageDir, 'seriesRegisterViewModel.js'));

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

function teamIdsOf(list) {
  return (list || [])
    .map(function (t) {
      return String(t.teamId || '');
    })
    .filter(Boolean)
    .sort()
    .join(',');
}

function fakeTeamsByUserId(map) {
  return function (userId) {
    var list = map[String(userId)] || [];
    return list.map(function (teamId) {
      return { teamId: teamId, name: teamId };
    });
  };
}

function baseOrgSeries(overrides) {
  return Object.assign(
    {
      seriesId: 'series-b3-org',
      lifecycleStatus: 'published',
      hostMode: 'organization',
      registrationState: 'open',
      registrationRevision: 1,
      participants: [
        {
          seriesParticipantId: 'team:1',
          kind: 'team',
          sourceTeamId: '1',
          nameSnapshot: '湘鹰',
          shortNameSnapshot: '湘鹰'
        },
        {
          seriesParticipantId: 'team:2',
          kind: 'team',
          sourceTeamId: '2',
          nameSnapshot: '星途',
          shortNameSnapshot: '星途'
        },
        {
          seriesParticipantId: 'team:4',
          kind: 'team',
          sourceTeamId: '4',
          nameSnapshot: '银河',
          shortNameSnapshot: '银河'
        }
      ],
      roster: []
    },
    overrides || {}
  );
}

(function testAuthMembershipAdapter() {
  var identity = require(path.join(utilsDir, 'teamClub', 'identity.js'));
  var repo = require(path.join(utilsDir, 'teamClub', 'repository.js'));
  identity.setTestSession({ userId: 'user_owner', displayName: 'Owner' });
  repo.resetForTests();
  repo.createTeam({ name: '湘鹰', teamId: '1' });
  repo.createTeam({ name: '星途', teamId: '2' });
  repo.addMember('1', 'tm-1001', { displayName: '周启明' });

  var adminTeams = teamDirectory.listActiveClubTeamsForUser('user_owner');
  assert(
    '创建者命中自己创建的俱乐部球队 1/2',
    teamIdsOf(adminTeams) === '1,2'
  );

  var memberTeams = teamDirectory.listActiveClubTeamsForUser('tm-1001');
  assert(
    '花名册普通成员 tm-1001 命中球队 1',
    teamIdsOf(memberTeams) === '1' &&
      memberTeams[0] &&
      memberTeams[0].role === 'member'
  );

  var none = teamDirectory.listActiveClubTeamsForUser('nobody-xyz');
  assert('无关用户无球队', none.length === 0);

  var meDenied = teamDirectory.listActiveClubTeamsForUser('me');
  assert('正式查询拒绝 me 作为身份', meDenied.length === 0);
  var withCompat = teamDirectory.getTeamsByUserId('me');
  assert('getTeamsByUserId 不再把 me/isMine 补成球队', withCompat.length === 0);
  identity.setTestSession(null);
  repo.resetForTests();
})();

(function testOrgEligibilityRealAdapter() {
  var series = baseOrgSeries();
  var asAdmin = eligibility.resolveSeriesRegistrationEligibility({
    series: series,
    playerId: 'me'
  });
  assert(
    'org+管理员：全部参赛队，多队不默认',
    asAdmin.eligibleParticipantIds.length === 3 &&
      asAdmin.defaultSheetParticipantId === '' &&
      asAdmin.eligibleParticipantIds.indexOf('team:1') >= 0 &&
      asAdmin.eligibleParticipantIds.indexOf('team:2') >= 0 &&
      asAdmin.eligibleParticipantIds.indexOf('team:4') >= 0
  );

  var asMember = eligibility.resolveSeriesRegistrationEligibility({
    series: series,
    playerId: 'tm-1001'
  });
  assert(
    'org+普通成员：全部参赛队，多队不默认',
    asMember.eligibleParticipantIds.length === 3 &&
      asMember.defaultSheetParticipantId === '' &&
      asMember.eligibleParticipantIds.indexOf('team:1') >= 0 &&
      asMember.eligibleParticipantIds.indexOf('team:2') >= 0 &&
      asMember.eligibleParticipantIds.indexOf('team:4') >= 0
  );

  var outsider = eligibility.resolveSeriesRegistrationEligibility({
    series: series,
    playerId: 'tm-2001'
  });
  // 不按花名册过滤：3 个配置参赛队均可选
  assert(
    'org+另一队成员可选全部参赛队',
    outsider.eligibleParticipantIds.length === 3 &&
      outsider.eligibleParticipantIds.indexOf('team:2') >= 0 &&
      outsider.eligibleParticipantIds.indexOf('team:4') >= 0 &&
      outsider.defaultSheetParticipantId === ''
  );

  var noHit = eligibility.resolveSeriesRegistrationEligibility({
    series: series,
    playerId: 'tm-9999'
  });
  assert(
    'org 无俱乐部球队仍可选全部参赛队',
    noHit.eligibleParticipantIds.length === 3 &&
      noHit.ineligibleMessage === '' &&
      noHit.defaultSheetParticipantId === ''
  );
})();

(function testTeamHostEligibility() {
  var series = {
    seriesId: 'series-b3-team',
    hostMode: 'team',
    lifecycleStatus: 'published',
    registrationState: 'open',
    hostTeam: { teamId: '1', teamName: '湘鹰' },
    participants: [
      {
        seriesParticipantId: 'division:d1',
        kind: 'division',
        divisionId: 'd1',
        nameSnapshot: '红'
      },
      {
        seriesParticipantId: 'division:d2',
        kind: 'division',
        divisionId: 'd2',
        nameSnapshot: '蓝'
      }
    ],
    roster: []
  };
  var host = eligibility.resolveSeriesRegistrationEligibility({
    series: series,
    playerId: 'me'
  });
  assert(
    'team 主办成员可选分队且不默认',
    host.eligibleParticipantIds.length === 2 && host.defaultSheetParticipantId === ''
  );

  var guest = eligibility.resolveSeriesRegistrationEligibility({
    series: series,
    playerId: 'tm-2001'
  });
  assert(
    'team 非主办仍可选分队',
    guest.eligibleParticipantIds.length === 2 &&
      guest.reason === '' &&
      guest.ineligibleMessage === ''
  );
})();

(function testIdentitySources() {
  assert(
    '双源一致',
    eligibility.resolvePagePlayerIdentity({ userId: 'u-a' }, { userId: 'u-a' })
      .playerId === 'u-a'
  );
  assert(
    '仅 profile',
    eligibility.resolvePagePlayerIdentity({ userId: 'u-p' }, {}).playerId === 'u-p'
  );
  assert(
    '仅 currentUser',
    eligibility.resolvePagePlayerIdentity({}, { userId: 'u-g' }).playerId === 'u-g'
  );
  assert(
    '双源冲突',
    !eligibility.resolvePagePlayerIdentity({ userId: 'a' }, { userId: 'b' }).ok
  );
  assert(
    '双源皆空',
    !eligibility.resolvePagePlayerIdentity({}, {}).ok &&
      eligibility.resolvePagePlayerIdentity({}, {}).reason === 'identity_unresolved'
  );
})();

(function testCtaAndVmMessages() {
  var series = baseOrgSeries();
  var vmOk = registerVm.buildSeriesRegisterViewModel({
    series: series,
    lifecycleAccess: { ok: true, lifecycleStatus: 'published', isDraftPreview: false },
    registrationContext: {
      resolved: true,
      identityOk: true,
      playerId: 'me',
      eligibleParticipantIds: ['team:1', 'team:2'],
      ineligibleMessage: ''
    }
  });
  assert(
    '多资格 CTA 仍为立即报名',
    !vmOk.cta.disabled && vmOk.cta.label === '立即报名' && vmOk.cta.action === 'register'
  );

  var vmClosed = registerVm.buildSeriesRegisterViewModel({
    series: Object.assign({}, series, { registrationState: 'closed' }),
    lifecycleAccess: { ok: true, lifecycleStatus: 'published', isDraftPreview: false },
    registrationContext: {
      resolved: true,
      identityOk: true,
      playerId: 'me',
      eligibleParticipantIds: ['team:1', 'team:2'],
      ineligibleMessage: ''
    }
  });
  assert(
    'published+closed 本人 CTA 仍禁用「报名通道已关闭」',
    vmClosed.cta.disabled &&
      vmClosed.cta.label === '报名通道已关闭' &&
      vmClosed.cta.action === 'none'
  );

  var vmNo = registerVm.buildSeriesRegisterViewModel({
    series: series,
    lifecycleAccess: { ok: true, lifecycleStatus: 'published', isDraftPreview: false },
    registrationContext: {
      resolved: true,
      identityOk: true,
      playerId: 'x',
      eligibleParticipantIds: [],
      ineligibleMessage: eligibility.MSG_NOT_PARTICIPANT_TEAM
    }
  });
  assert(
    '无资格 CTA 使用具体文案',
    vmNo.cta.disabled && vmNo.cta.label === eligibility.MSG_NOT_PARTICIPANT_TEAM
  );

  var vmId = registerVm.buildSeriesRegisterViewModel({
    series: series,
    lifecycleAccess: { ok: true, lifecycleStatus: 'published', isDraftPreview: false },
    registrationContext: {
      resolved: true,
      identityOk: false,
      playerId: '',
      eligibleParticipantIds: [],
      ineligibleMessage: eligibility.MSG_IDENTITY
    }
  });
  assert(
    '身份失败 CTA 使用具体文案',
    vmId.cta.disabled && vmId.cta.label === eligibility.MSG_IDENTITY
  );
})();

(function testB1UnchangedAndStationZeroWrite() {
  var regSrc = fs.readFileSync(
    path.join(utilsDir, 'seriesRegistration.js'),
    'utf8'
  );
  var eligSrc = fs.readFileSync(
    path.join(pageDir, 'seriesRegisterEligibility.js'),
    'utf8'
  );
  var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
  assert(
    'B1 仍要求 resolveEligibleParticipantIds 注入',
    regSrc.indexOf('resolveEligibleParticipantIds') >= 0 &&
      regSrc.indexOf('expectedRegistrationRevision') >= 0 &&
      regSrc.indexOf('upsertSeriesChecked') >= 0
  );
  assert(
    'eligibility 不放宽 B1 / 不写分站',
    eligSrc.indexOf('seriesStationMatch') < 0 &&
      eligSrc.indexOf('registrationStatus') < 0 &&
      eligSrc.indexOf('teamMatchStore') < 0
  );
  assert(
    '页面仍走 registerSelf + writeLock + conflict toast',
    pageJs.indexOf('registerSelf') >= 0 &&
      pageJs.indexOf('cancelSelfRegistration') >= 0 &&
      pageJs.indexOf('_registerWriteLock') >= 0 &&
      pageJs.indexOf('报名状态已变化，请重新操作') >= 0
  );

  // 软取消 + revision 冲突最小链路（内存 store）
  var mem = Object.create(null);
  var store = {
    getSeriesById: function (id) {
      return mem[id] ? JSON.parse(JSON.stringify(mem[id])) : null;
    },
    upsertSeriesChecked: function (series, expected) {
      var id = series && series.seriesId;
      var cur = mem[id];
      var curRev = cur ? Number(cur.registrationRevision) || 0 : 0;
      if (cur && Number(expected) !== curRev) {
        return { ok: false, reason: 'registration_conflict' };
      }
      mem[id] = JSON.parse(JSON.stringify(series));
      return { ok: true, series: JSON.parse(JSON.stringify(series)) };
    }
  };
  var service = seriesRegistration.createSeriesRegistrationService({
    seriesStore: store,
    resolveEligibleParticipantIds: function (ctx) {
      return eligibility.resolveEligibleParticipantIdsForService(ctx, {
        getTeamsByUserId: fakeTeamsByUserId({ me: ['1'] })
      });
    },
    canManageRegistration: function () {
      return false;
    }
  });
  var series = baseOrgSeries({
    participants: [
      {
        seriesParticipantId: 'team:1',
        kind: 'team',
        sourceTeamId: '1',
        nameSnapshot: '湘鹰',
        shortNameSnapshot: '湘鹰'
      }
    ]
  });
  mem[series.seriesId] = JSON.parse(JSON.stringify(series));
  var reg = service.registerSelf({
    seriesId: series.seriesId,
    seriesParticipantId: 'team:1',
    expectedRegistrationRevision: 1,
    actor: { playerId: 'me', userId: 'me', name: '测' },
    player: {
      playerId: 'me',
      userId: 'me',
      competitionName: '测',
      playerNameSnapshot: '测'
    }
  });
  assert('报名成功写 roster', !!(reg && reg.ok && reg.series.roster.length === 1));
  var revAfter = Number(reg.series.registrationRevision);
  var cancel = service.cancelSelfRegistration({
    seriesId: series.seriesId,
    expectedRegistrationRevision: revAfter,
    playerId: 'me',
    actor: { playerId: 'me', userId: 'me' }
  });
  assert(
    '软取消保留条目',
    cancel.ok &&
      cancel.series.roster.length === 1 &&
      cancel.series.roster[0].registrationStatus === 'cancelled'
  );
  mem[series.seriesId].registrationRevision = Number(cancel.series.registrationRevision) + 9;
  var conflict = service.registerSelf({
    seriesId: series.seriesId,
    seriesParticipantId: 'team:1',
    expectedRegistrationRevision: Number(cancel.series.registrationRevision),
    actor: { playerId: 'me', userId: 'me', name: '测' },
    player: {
      playerId: 'me',
      userId: 'me',
      competitionName: '测',
      playerNameSnapshot: '测'
    }
  });
  assert(
    'revision 冲突不得伪造成功',
    conflict && conflict.ok === false && conflict.reason === 'registration_conflict'
  );
})();

function restoreTeamClubTestIsolation() {
  try {
    var identity = require(path.join(utilsDir, 'teamClub', 'identity.js'));
    identity.setTestSession(null);
  } catch (e) { /* ignore */ }
  try {
    var repo = require(path.join(utilsDir, 'teamClub', 'repository.js'));
    repo.resetForTests();
  } catch (e2) { /* ignore */ }
  delete global.__TEAM_CLUB_REPO_MODE;
  Object.keys(require.cache).forEach(function (k) {
    var n = String(k).replace(/\\/g, '/');
    if (n.indexOf('/teamClub/') >= 0 || /\/teamDirectory\.js$/.test(n)) delete require.cache[k];
  });
}

console.log('');
console.log('---- seriesRegisterB3.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  restoreTeamClubTestIsolation();
  process.exit(1);
}
restoreTeamClubTestIsolation();
process.exit(0);
