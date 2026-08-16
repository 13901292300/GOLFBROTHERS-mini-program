/**
 * REG-P1：Series 本人报名 / 本人取消 与普通交互契约对齐
 * 不写生产 storage；不进 DevTools；不进入代报名 REG-P2。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesRegisterP1.selftest.js
 */

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

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var pageDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var detailDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');

var registrationInteractionModel = require(path.join(
  utilsDir,
  'registrationInteractionModel.js'
));
var seriesRegistration = require(path.join(utilsDir, 'seriesRegistration.js'));
var registerVm = require(path.join(pageDir, 'seriesRegisterViewModel.js'));
var eligibility = require(path.join(pageDir, 'seriesRegisterEligibility.js'));

var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var pageJson = JSON.parse(fs.readFileSync(path.join(pageDir, 'index.json'), 'utf8'));
var detailJs = fs.readFileSync(path.join(detailDir, 'index.js'), 'utf8');
var regSrc = fs.readFileSync(path.join(utilsDir, 'seriesRegistration.js'), 'utf8');

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

function freeze(o) {
  return JSON.parse(JSON.stringify(o));
}

function pickManagedSlice(match) {
  var m = match && typeof match === 'object' ? match : {};
  return {
    registerInfo: m.registerInfo || null,
    registrationStatus: m.registrationStatus || '',
    groups: m.groups || [],
    pairings: m.pairings || [],
    scores: m.scores || null,
    payment: m.payment || null
  };
}

function createMemoryStore(initial) {
  var mem = Object.create(null);
  if (initial && initial.seriesId) mem[initial.seriesId] = freeze(initial);
  return {
    getSeriesById: function (id) {
      return mem[id] ? freeze(mem[id]) : null;
    },
    upsertSeriesChecked: function (series, expected) {
      var id = series && series.seriesId;
      var cur = mem[id];
      var curRev = cur ? Number(cur.registrationRevision) || 0 : 0;
      if (cur && Number(expected) !== curRev) {
        return { ok: false, reason: 'registration_conflict', currentRevision: curRev };
      }
      mem[id] = freeze(series);
      return { ok: true, series: freeze(series) };
    }
  };
}

function basePublishedSeries(overrides) {
  return Object.assign(
    {
      seriesId: 'series-p1',
      lifecycleStatus: 'published',
      publishState: 'published',
      hostMode: 'organization',
      registrationState: 'open',
      registrationRevision: 1,
      competitionPhaseCache: 'registration',
      participants: [
        {
          seriesParticipantId: 'team:1',
          kind: 'team',
          sourceTeamId: '1',
          nameSnapshot: '甲队',
          shortNameSnapshot: '甲'
        },
        {
          seriesParticipantId: 'team:2',
          kind: 'team',
          sourceTeamId: '2',
          nameSnapshot: '乙队',
          shortNameSnapshot: '乙'
        }
      ],
      roster: []
    },
    overrides || {}
  );
}

function createService(store, eligibleIds) {
  var ids = Array.isArray(eligibleIds) ? eligibleIds : ['team:1', 'team:2'];
  return seriesRegistration.createSeriesRegistrationService({
    seriesStore: store,
    resolveEligibleParticipantIds: function () {
      return { ok: true, ids: ids.slice() };
    },
    canManageRegistration: function () {
      return { allowed: false };
    },
    now: function () {
      return '2026-08-14T00:00:00.000Z';
    }
  });
}

var selfStart = pageWxml.indexOf('<!-- 本人报名');
var sourceStart = pageWxml.indexOf('<!-- 替他人报名：人员来源');
var selfChunk =
  selfStart >= 0 && sourceStart > selfStart
    ? pageWxml.slice(selfStart, sourceStart)
    : '';

assert(
  'Sheet 标题为赛事报名，副文为 Series 唯一准确差异',
  registerVm.SERIES_SELF_REGISTER_SHEET_TITLE === '赛事报名' &&
    registerVm.SERIES_SELF_REGISTER_SHEET_SUB ===
      '比赛名将用于报名名单与成绩展示' &&
    pageJs.indexOf('SERIES_SELF_REGISTER_SHEET_TITLE') >= 0 &&
    pageJs.indexOf("registerSheetTitle: '系列赛报名'") < 0 &&
    selfChunk.indexOf('赛事报名') < 0 &&
    pageWxml.indexOf('{{registerSheetTitle}}') >= 0
);

assert(
  '字段顺序：球队/分队 → 比赛名 → 性别 → 手机号',
  (function () {
    var groupIdx = selfChunk.indexOf('registerSheetGroupLabel');
    var nameIdx = selfChunk.indexOf('比赛名');
    var genderIdx = selfChunk.indexOf('性别');
    var phoneIdx = selfChunk.indexOf('手机号');
    return (
      groupIdx >= 0 &&
      nameIdx > groupIdx &&
      genderIdx > nameIdx &&
      phoneIdx > genderIdx &&
      selfChunk.indexOf('register-sheet__readonly') >= 0 &&
      selfChunk.indexOf('{{registerPhone || \'未绑定手机号\'}}') >= 0
    );
  })()
);

assert(
  '有手机号显示权威号码；无值显示未绑定；不猜昵称',
  registerVm.resolveSelfRegisterPhone({ phone: '13800000000' }, {}) ===
    '13800000000' &&
    registerVm.resolveSelfRegisterPhone({ phone: '' }, { phone: '' }) === '' &&
    registerVm.resolveSelfRegisterPhone(
      { phone: '', name: '13900001111' },
      { nickname: '13700002222', phoneMasked: '138****0000', phoneBound: true }
    ) === '' &&
    pageJs.indexOf('resolveSelfRegisterPhone') >= 0 &&
    selfChunk.indexOf('未绑定手机号') >= 0 &&
    !/绑定手机号/.test(selfChunk.replace(/未绑定手机号/g, ''))
);

assert(
  'organization 单主体预选；多主体不默认；team 分队永不默认',
  (function () {
    var one = eligibility.resolveSeriesRegistrationEligibility(
      {
        series: basePublishedSeries({
          participants: [
            {
              seriesParticipantId: 'team:1',
              kind: 'team',
              sourceTeamId: '1',
              shortNameSnapshot: '甲'
            }
          ]
        }),
        playerId: 'me'
      },
      {
        getTeamsByUserId: function () {
          return [{ teamId: '1' }];
        }
      }
    );
    var many = eligibility.resolveSeriesRegistrationEligibility(
      { series: basePublishedSeries(), playerId: 'me' },
      {
        getTeamsByUserId: function () {
          return [{ teamId: '1' }, { teamId: '2' }];
        }
      }
    );
    var teamMode = eligibility.resolveSeriesRegistrationEligibility(
      {
        series: {
          hostMode: 'team',
          hostTeam: { teamId: 'host' },
          participants: [
            { seriesParticipantId: 'div:1', kind: 'division', shortNameSnapshot: 'A' }
          ]
        },
        playerId: 'me'
      },
      {
        getTeamsByUserId: function () {
          return [{ teamId: 'host' }];
        }
      }
    );
    var none = eligibility.resolveSeriesRegistrationEligibility(
      { series: basePublishedSeries(), playerId: 'me' },
      {
        getTeamsByUserId: function () {
          return [];
        }
      }
    );
    return (
      one.defaultSheetParticipantId === 'team:1' &&
      many.defaultSheetParticipantId === '' &&
      teamMode.defaultSheetParticipantId === '' &&
      none.eligibleParticipantIds.length === 0 &&
      /openRegisterSheet:[\s\S]{0,1800}eligibleParticipantIds/.test(pageJs)
    );
  })()
);

assert(
  '身份冲突 CTA 不开放报名',
  registerVm.resolveRegisterCta({
    lifecycleAccess: { lifecycleStatus: 'published' },
    registrationState: 'open',
    identityOk: false,
    isRegistered: false,
    eligibleCount: 0,
    ineligibleMessage: eligibility.MSG_IDENTITY
  }).label === eligibility.MSG_IDENTITY
);

var ctaDraft = registerVm.resolveRegisterCta({
  lifecycleAccess: { isDraftPreview: true, lifecycleStatus: 'draft' },
  registrationState: 'closed',
  identityOk: true,
  isRegistered: false,
  eligibleCount: 1
});
var ctaOpen = registerVm.resolveRegisterCta({
  lifecycleAccess: { lifecycleStatus: 'published' },
  registrationState: 'open',
  identityOk: true,
  isRegistered: false,
  eligibleCount: 1
});
var ctaCancel = registerVm.resolveRegisterCta({
  lifecycleAccess: { lifecycleStatus: 'published' },
  registrationState: 'open',
  identityOk: true,
  isRegistered: true,
  eligibleCount: 1
});
var ctaClosed = registerVm.resolveRegisterCta({
  lifecycleAccess: { lifecycleStatus: 'published' },
  registrationState: 'closed',
  identityOk: true,
  isRegistered: true,
  eligibleCount: 1
});
var ctaLive = registerVm.resolveRegisterCta({
  lifecycleAccess: { lifecycleStatus: 'published' },
  registrationState: 'open',
  identityOk: true,
  isRegistered: false,
  eligibleCount: 1,
  competitionPhaseCache: 'live'
});
var ctaCompleted = registerVm.resolveRegisterCta({
  lifecycleAccess: { lifecycleStatus: 'published' },
  registrationState: 'open',
  identityOk: true,
  isRegistered: true,
  eligibleCount: 1,
  competitionPhaseCache: 'completed'
});
var ctaCancelled = registerVm.resolveRegisterCta({
  lifecycleAccess: { lifecycleStatus: 'cancelled' },
  registrationState: 'open',
  identityOk: true,
  isRegistered: true,
  eligibleCount: 1
});
var ctaArchived = registerVm.resolveRegisterCta({
  lifecycleAccess: { lifecycleStatus: 'archived' },
  registrationState: 'open',
  identityOk: true,
  isRegistered: true,
  eligibleCount: 1
});

assert(
  'CTA draft / open / 已报名 / closed / live / completed / cancelled / archived',
  ctaDraft.label === '发布后开放报名' &&
    ctaDraft.disabled &&
    ctaOpen.label ===
      registrationInteractionModel.resolveRegistrationCtaCopy('register') &&
    ctaOpen.action === 'register' &&
    ctaCancel.label ===
      registrationInteractionModel.resolveRegistrationCtaCopy('cancel') &&
    ctaCancel.action === 'cancel' &&
    ctaClosed.label ===
      registrationInteractionModel.resolveRegistrationCtaCopy('closed') &&
    ctaClosed.disabled &&
    ctaClosed.action === 'none' &&
    ctaLive.action === 'register' &&
    ctaCompleted.disabled &&
    ctaCompleted.action === 'none' &&
    ctaCompleted.label === '' &&
    ctaCancelled.label === '赛事已取消' &&
    ctaArchived.label === '赛事已归档'
);

assert(
  'completed 只认 Series 整体 phase token，不看单轮结束',
  registerVm.isSeriesCompetitionPhaseCompleted('completed') === true &&
    registerVm.isSeriesCompetitionPhaseCompleted('live') === false &&
    registerVm.isSeriesCompetitionPhaseCompleted('settlement_pending') === false &&
    registerVm.isSeriesCompetitionPhaseCompleted('finished') === true &&
    /function resolveRegisterCta[\s\S]*?isSeriesCompetitionPhaseCompleted/.test(
      fs.readFileSync(path.join(pageDir, 'seriesRegisterViewModel.js'), 'utf8')
    )
);

var ungrouped = registrationInteractionModel.buildSelfCancelDialogModel({
  grouped: false
});
assert(
  '取消弹窗挂共享组件且始终未分组文案',
  pageJson.usingComponents['registration-cancel-dialog'] ===
    '/components/registration-cancel-dialog/index' &&
    pageWxml.indexOf('<registration-cancel-dialog') >= 0 &&
    pageWxml.indexOf('bind:cancel="closeCancelRegisterModal"') >= 0 &&
    pageWxml.indexOf('bind:confirm="confirmCancelRegistration"') >= 0 &&
    pageJs.indexOf('buildSelfCancelDialogModel') >= 0 &&
    pageJs.indexOf('grouped: false') >= 0 &&
    pageJs.indexOf('buildPaidCancellationWarningModel') < 0 &&
    /openCancelRegisterModal:[\s\S]{0,900}wx\.showModal/.test(pageJs) === false &&
    ungrouped.title === '确认取消报名？' &&
    ungrouped.desc === '取消后，你将从本场赛事报名名单中移除。' &&
    ungrouped.cancelText === '取消' &&
    ungrouped.confirmText === '确认取消' &&
    pageJs.indexOf('本场系列赛') < 0
);

assert(
  '遮罩/取消只关 dialog；确认走软取消 + success toast',
  (function () {
    var closeStart = pageJs.indexOf('closeCancelRegisterModal: function');
    var confirmStart = pageJs.indexOf('confirmCancelRegistration: function');
    var closeBody =
      closeStart >= 0 && confirmStart > closeStart
        ? pageJs.slice(closeStart, confirmStart)
        : '';
    return (
      closeBody.indexOf('cancelSelfRegistration') < 0 &&
      closeBody.indexOf('upsertSeriesChecked') < 0 &&
      /confirmCancelRegistration:[\s\S]{0,2200}cancelSelfRegistration/.test(pageJs) &&
      pageJs.indexOf("wx.showToast({ title: '已取消报名', icon: 'success' })") >= 0 &&
      /registrationStatus:\s*'cancelled'/.test(regSrc)
    );
  })()
);

var matches = {
  m1: {
    matchId: 'm1',
    registerInfo: { users: [{ userId: 'station-user' }] },
    registrationStatus: 'open',
    groups: [{ groupId: 'g1', playerIds: ['station-user'] }],
    pairings: [{ hole: 1, players: ['station-user'] }],
    scores: { 'station-user': { 1: 4 } },
    payment: { 'station-user': { status: 'paid', amount: 100 } }
  },
  m2: {
    matchId: 'm2',
    registerInfo: { users: [] },
    registrationStatus: 'closed',
    groups: [],
    pairings: [],
    scores: {},
    payment: {}
  }
};
var frozenMatches = freeze(matches);
var store = createMemoryStore(
  basePublishedSeries({
    rounds: [
      { roundId: 'r1', managedMatchId: 'm1', status: 'completed' },
      { roundId: 'r2', managedMatchId: 'm2', status: 'scheduled' }
    ]
  })
);
var svc = createService(store, ['team:1']);
var actor = { playerId: 'u1', userId: 'u1', name: '本人' };
var player = {
  playerId: 'u1',
  userId: 'u1',
  competitionName: '本人',
  gender: '男',
  phone: '13800000000',
  phoneSnapshot: '13800000000',
  avatar: 'a.png'
};

var reg = svc.registerSelf({
  seriesId: 'series-p1',
  seriesParticipantId: 'team:1',
  expectedRegistrationRevision: 1,
  actor: actor,
  player: player
});
assert(
  '本人报名成功：roster + revision+1 + 手机快照',
  reg.ok &&
    reg.series.registrationRevision === 2 &&
    reg.series.roster.length === 1 &&
    reg.series.roster[0].registrationStatus === 'registered' &&
    reg.series.roster[0].phoneSnapshot === '13800000000' &&
    reg.series.roster[0].playerId === 'u1'
);

var afterRegMatches = freeze(matches);
assert(
  '报名后 managed matches 深比较不变',
  JSON.stringify(pickManagedSlice(afterRegMatches.m1)) ===
    JSON.stringify(pickManagedSlice(frozenMatches.m1)) &&
    JSON.stringify(pickManagedSlice(afterRegMatches.m2)) ===
      JSON.stringify(pickManagedSlice(frozenMatches.m2))
);

var conflict = svc.registerSelf({
  seriesId: 'series-p1',
  seriesParticipantId: 'team:1',
  expectedRegistrationRevision: 1,
  actor: actor,
  player: player
});
assert(
  'revision 冲突不伪造成功',
  conflict.ok === false && conflict.reason === 'registration_conflict'
);

var cancel = svc.cancelSelfRegistration({
  seriesId: 'series-p1',
  playerId: 'u1',
  expectedRegistrationRevision: 2,
  actor: actor
});
assert(
  '确认软取消：状态/时间/revision，快照与身份保留',
  cancel.ok &&
    cancel.series.registrationRevision === 3 &&
    cancel.series.roster.length === 1 &&
    cancel.series.roster[0].registrationStatus === 'cancelled' &&
    !!cancel.series.roster[0].cancelledAt &&
    cancel.series.roster[0].rosterEntryId === reg.series.roster[0].rosterEntryId &&
    cancel.series.roster[0].playerId === 'u1' &&
    cancel.series.roster[0].phoneSnapshot === '13800000000' &&
    cancel.series.roster[0].playerNameSnapshot === '本人' &&
    cancel.series.roster[0].genderSnapshot === '男' &&
    cancel.series.roster[0].registrationSource ===
      reg.series.roster[0].registrationSource &&
    cancel.series.roster[0].registeredByUserId ===
      reg.series.roster[0].registeredByUserId &&
    cancel.series.roster[0].createdAt === reg.series.roster[0].createdAt
);

assert(
  '取消后 managed matches 仍完全不变',
  JSON.stringify(pickManagedSlice(matches.m1)) ===
    JSON.stringify(pickManagedSlice(frozenMatches.m1)) &&
    JSON.stringify(pickManagedSlice(matches.m2)) ===
      JSON.stringify(pickManagedSlice(frozenMatches.m2))
);

var closedStore = createMemoryStore(
  basePublishedSeries({
    registrationState: 'closed',
    roster: [
      {
        rosterEntryId: 'e-closed',
        seriesId: 'series-p1',
        seriesParticipantId: 'team:1',
        playerId: 'u1',
        registrationStatus: 'registered',
        createdAt: 't0'
      }
    ]
  })
);
var closedSvc = createService(closedStore, ['team:1']);
assert(
  'closed 领域层禁止本人取消',
  closedSvc.cancelSelfRegistration({
    seriesId: 'series-p1',
    playerId: 'u1',
    expectedRegistrationRevision: 1,
    actor: actor
  }).reason === 'registration_closed'
);

var doneStore = createMemoryStore(
  basePublishedSeries({
    competitionPhaseCache: 'completed',
    roster: [
      {
        rosterEntryId: 'e-done',
        seriesId: 'series-p1',
        seriesParticipantId: 'team:1',
        playerId: 'u1',
        registrationStatus: 'registered',
        createdAt: 't0'
      }
    ]
  })
);
var doneSvc = createService(doneStore, ['team:1']);
assert(
  'Series 整体 completed 领域层禁止本人报名/取消',
  doneSvc.registerSelf({
    seriesId: 'series-p1',
    seriesParticipantId: 'team:1',
    expectedRegistrationRevision: 1,
    actor: actor,
    player: player
  }).reason === 'series_completed' &&
    doneSvc.cancelSelfRegistration({
      seriesId: 'series-p1',
      playerId: 'u1',
      expectedRegistrationRevision: 1,
      actor: actor
    }).reason === 'series_completed'
);

var liveStore = createMemoryStore(
  basePublishedSeries({ competitionPhaseCache: 'live' })
);
var liveSvc = createService(liveStore, ['team:1']);
assert(
  'live+open 领域层仍允许本人报名',
  liveSvc.registerSelf({
    seriesId: 'series-p1',
    seriesParticipantId: 'team:1',
    expectedRegistrationRevision: 1,
    actor: actor,
    player: player
  }).ok === true
);

assert(
  'P1 本人路径仍有 completed 门闩；代取消留给 REG-P2',
  (function () {
    var selfStart = regSrc.indexOf('function registerSelf');
    var proxyStart = regSrc.indexOf('function registerForOther');
    var cancelStart = regSrc.indexOf('function cancelSelfRegistration');
    var selfBody =
      selfStart >= 0 && proxyStart > selfStart
        ? regSrc.slice(selfStart, proxyStart)
        : '';
    var cancelBody =
      cancelStart >= 0 ? regSrc.slice(cancelStart, cancelStart + 800) : '';
    return (
      selfBody.indexOf('assertCompetitionPhaseAllowsSelfMutation') >= 0 &&
      cancelBody.indexOf('assertCompetitionPhaseAllowsSelfMutation') >= 0
    );
  })()
);

assert(
  '普通 detail 接线本轮未改；Series 不写 teamMatchStore 报名',
  detailJs.indexOf('registrationInteractionModel') >= 0 &&
    detailJs.indexOf('teamMatchStore.cancelRegistration') >= 0 &&
    pageJs.indexOf('teamMatchStore.cancelRegistration') < 0 &&
    /function registerSelf[\s\S]*?teamMatchStore/.test(regSrc) === false &&
    /function cancelSelfRegistration[\s\S]*?teamMatchStore/.test(regSrc) === false
);

assert(
  '成功后重投影、不整页跳转',
  pageJs.indexOf('_applyRegisterWriteSuccess') >= 0 &&
    /_applyRegisterWriteSuccess:[\s\S]{0,900}_buildEnrichedRegisterViewModel/.test(
      pageJs
    ) &&
    /_applyRegisterWriteSuccess:[\s\S]{0,900}resetScroll:\s*false/.test(pageJs) &&
    /confirmRegister:[\s\S]{0,3600}reLaunch/.test(pageJs) === false &&
    /confirmCancelRegistration:[\s\S]{0,3600}reLaunch/.test(pageJs) === false
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exit(1);
}
