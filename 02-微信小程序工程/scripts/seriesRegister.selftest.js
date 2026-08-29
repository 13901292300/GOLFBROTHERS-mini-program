/**
 * 系列赛报名 TAB B2 自测（投影 + eligibility + 页面接线契约）
 * 不写生产 storage；不进 DevTools。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesRegister.selftest.js
 */

var path = require('path');
var fs = require('fs');

var pageDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);
var registerVm = require(path.join(pageDir, 'seriesRegisterViewModel.js'));
var eligibility = require(path.join(pageDir, 'seriesRegisterEligibility.js'));
var detailVm = require(path.join(pageDir, 'seriesDetailViewModel.js'));

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

function freezeClone(o) {
  return JSON.parse(JSON.stringify(o));
}

function baseOrgSeries(overrides) {
  var s = {
    seriesId: 'series-reg-org',
    lifecycleStatus: 'draft',
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: '报名审计杯',
    registrationState: 'closed',
    registrationRevision: 0,
    participants: [
      {
        seriesParticipantId: 'p-team-a',
        kind: 'team',
        sourceTeamId: 't1',
        nameSnapshot: '阿尔法高尔夫俱乐部',
        shortNameSnapshot: '阿尔法',
        logoSnapshot: 'https://example.com/a.png'
      },
      {
        seriesParticipantId: 'p-team-b',
        kind: 'team',
        sourceTeamId: 't2',
        nameSnapshot: '贝塔高尔夫俱乐部',
        shortNameSnapshot: '贝塔',
        logoSnapshot: 'https://example.com/b.png'
      }
    ],
    roster: [],
    rounds: [],
    scoringRule: { mode: 'global_m', topM: 2, scoreBasis: 'gross', allowRepeat: false }
  };
  return Object.assign(s, overrides || {});
}

function baseTeamSeries(overrides) {
  return baseOrgSeries(
    Object.assign(
      {
        seriesId: 'series-reg-team',
        hostMode: 'team',
        templateId: 'division_series',
        hostTeam: { teamId: 'host-1', teamName: '主办', teamLogo: '' },
        participants: [
          {
            seriesParticipantId: 'p-div-a',
            kind: 'division',
            divisionId: 'd1',
            nameSnapshot: '红队',
            shortNameSnapshot: '',
            logoSnapshot: 'https://example.com/should-not-show.png'
          },
          {
            seriesParticipantId: 'p-div-b',
            kind: 'division',
            divisionId: 'd2',
            nameSnapshot: '蓝队',
            shortNameSnapshot: '',
            logoSnapshot: ''
          }
        ]
      },
      overrides || {}
    )
  );
}

function fakeTeamsByUserId(map) {
  return function (userId) {
    var list = map[String(userId)] || [];
    return list.map(function (teamId) {
      return { teamId: teamId, name: teamId };
    });
  };
}

(function testIdentityMatrix() {
  assert(
    'identity 双方相同',
    eligibility.resolvePagePlayerIdentity({ userId: 'me' }, { userId: 'me' }).ok &&
      eligibility.resolvePagePlayerIdentity({ userId: 'me' }, { userId: 'me' }).playerId ===
        'me'
  );
  assert(
    'identity 仅 profile',
    eligibility.resolvePagePlayerIdentity({ userId: 'p1' }, {}).ok &&
      eligibility.resolvePagePlayerIdentity({ userId: 'p1' }, {}).playerId === 'p1'
  );
  assert(
    'identity 仅 currentUser',
    eligibility.resolvePagePlayerIdentity({}, { userId: 'u1' }).ok &&
      eligibility.resolvePagePlayerIdentity({}, { userId: 'u1' }).playerId === 'u1'
  );
  assert(
    'identity 双方缺失',
    !eligibility.resolvePagePlayerIdentity({}, {}).ok &&
      eligibility.resolvePagePlayerIdentity({}, {}).reason === 'identity_unresolved'
  );
  assert(
    'identity 双方不一致',
    !eligibility.resolvePagePlayerIdentity({ userId: 'a' }, { userId: 'b' }).ok &&
      eligibility.resolvePagePlayerIdentity({ userId: 'a' }, { userId: 'b' }).reason ===
        'identity_unresolved'
  );
})();

(function testOrgEligibility() {
  var series = baseOrgSeries({ lifecycleStatus: 'published', registrationState: 'open' });
  var none = eligibility.resolveSeriesRegistrationEligibility(
    { series: series, playerId: 'me' },
    { getTeamsByUserId: fakeTeamsByUserId({ me: [] }) }
  );
  assert(
    'org 无俱乐部球队仍可选全部参赛队',
    none.eligibleParticipantIds.length === 2 &&
      none.ineligibleMessage === '' &&
      none.defaultSheetParticipantId === ''
  );

  var singleTeamSeries = baseOrgSeries({
    lifecycleStatus: 'published',
    registrationState: 'open',
    participants: [
      {
        seriesParticipantId: 'p-team-a',
        kind: 'team',
        sourceTeamId: 't1',
        nameSnapshot: '阿尔法高尔夫俱乐部',
        shortNameSnapshot: '阿尔法'
      }
    ]
  });
  var one = eligibility.resolveSeriesRegistrationEligibility(
    { series: singleTeamSeries, playerId: 'me' },
    { getTeamsByUserId: fakeTeamsByUserId({ me: ['t1'] }) }
  );
  assert(
    'org 单一参赛队默认选中',
    one.eligibleParticipantIds.join(',') === 'p-team-a' &&
      one.defaultSheetParticipantId === 'p-team-a' &&
      one.options.length === 1
  );

  var multi = eligibility.resolveSeriesRegistrationEligibility(
    { series: series, playerId: 'me' },
    { getTeamsByUserId: fakeTeamsByUserId({ me: ['t1', 't2', 't9'] }) }
  );
  assert(
    'org 多参赛队必须手选',
    multi.eligibleParticipantIds.length === 2 &&
      multi.defaultSheetParticipantId === '' &&
      multi.options.every(function (o) {
        return o.id === 'p-team-a' || o.id === 'p-team-b';
      })
  );
})();

(function testTeamEligibility() {
  var series = baseTeamSeries({ lifecycleStatus: 'published', registrationState: 'open' });
  var notHost = eligibility.resolveSeriesRegistrationEligibility(
    { series: series, playerId: 'me' },
    { getTeamsByUserId: fakeTeamsByUserId({ me: ['other'] }) }
  );
  assert(
    'team 非主办仍可选全部分队',
    notHost.eligibleParticipantIds.length === 2 &&
      notHost.reason === '' &&
      notHost.ineligibleMessage === ''
  );

  var host = eligibility.resolveSeriesRegistrationEligibility(
    { series: series, playerId: 'me' },
    { getTeamsByUserId: fakeTeamsByUserId({ me: ['host-1'] }) }
  );
  assert(
    'team 主办可选全部分队且不默认',
    host.eligibleParticipantIds.length === 2 &&
      host.defaultSheetParticipantId === '' &&
      host.options[0].id === 'p-div-a'
  );

  var singleDiv = eligibility.resolveSeriesRegistrationEligibility(
    {
      series: baseTeamSeries({
        participants: [
          {
            seriesParticipantId: 'p-only',
            kind: 'division',
            nameSnapshot: '独队'
          }
        ]
      }),
      playerId: 'me'
    },
    { getTeamsByUserId: fakeTeamsByUserId({ me: ['host-1'] }) }
  );
  assert(
    'team 单分队默认选中',
    singleDiv.eligibleParticipantIds.length === 1 &&
      singleDiv.defaultSheetParticipantId === 'p-only'
  );

  var withCancelled = eligibility.resolveSeriesRegistrationEligibility({
    series: baseOrgSeries({
      participants: [
        {
          seriesParticipantId: 'p-team-a',
          kind: 'team',
          nameSnapshot: '阿尔法'
        },
        {
          seriesParticipantId: 'p-dead',
          kind: 'team',
          nameSnapshot: '已取消',
          cancelled: true
        }
      ]
    }),
    playerId: 'me'
  });
  assert(
    'cancelled 主体不进入 eligible IDs',
    withCancelled.eligibleParticipantIds.join(',') === 'p-team-a' &&
      withCancelled.defaultSheetParticipantId === 'p-team-a'
  );
})();

(function testOrgSubTabs() {
  var series = baseOrgSeries();
  var before = freezeClone(series);
  var vm = registerVm.buildSeriesRegisterViewModel({
    series: series,
    lifecycleAccess: { ok: true, lifecycleStatus: 'draft', isDraftPreview: true },
    activeParticipantId: ''
  });
  assert('organization → participantMode=team', vm.participantMode === 'team');
  assert(
    'organization 子 TAB 仅简称+人数（无 logo）',
    vm.registerSubTabs.length === 2 &&
      vm.registerSubTabs[0].name === '阿尔法' &&
      vm.registerSubTabs[0].count === 0 &&
      vm.registerSubTabs[0].logo == null &&
      vm.registerSubTabs[0].showLogo == null
  );
  assert(
    '首次进入默认第一个主体',
    vm.activeParticipantId === 'p-team-a' && vm.registerSubTabs[0].isActive
  );
  assert('空 roster 总人数为0', vm.registerTotalCount === 0 && vm.countsSumEqualsTotal);
  assert('输入 series 不被修改', JSON.stringify(series) === JSON.stringify(before));
})();

(function testTeamSubTabs() {
  var vm = registerVm.buildSeriesRegisterViewModel({
    series: baseTeamSeries({
      lifecycleStatus: 'published',
      registrationState: 'open',
      registrationRevision: 1
    }),
    lifecycleAccess: { ok: true, lifecycleStatus: 'published', isDraftPreview: false },
    activeParticipantId: '',
    registrationContext: {
      resolved: true,
      identityOk: true,
      playerId: 'me',
      eligibleParticipantIds: ['p-div-a', 'p-div-b'],
      ineligibleMessage: ''
    }
  });
  assert('team → participantMode=division', vm.participantMode === 'division');
  assert(
    'team 子 TAB 仅分队名+人数（无 logo）',
    vm.registerSubTabs.length === 2 &&
      vm.registerSubTabs[0].name === '红队' &&
      vm.registerSubTabs[0].count === 0 &&
      vm.registerSubTabs.every(function (t) {
        return t.logo == null && t.showLogo == null;
      })
  );
  assert(
    'published+open+eligible CTA=立即报名',
    !vm.cta.disabled && vm.cta.label === '立即报名' && vm.cta.action === 'register'
  );
})();

(function testFilterViewSameRoster() {
  var series = baseOrgSeries({
    lifecycleStatus: 'published',
    registrationState: 'open',
    registrationRevision: 2,
    roster: [
      {
        rosterEntryId: 'e1',
        seriesParticipantId: 'p-team-a',
        playerId: 'u1',
        playerNameSnapshot: '甲',
        handicapSnapshot: 5,
        genderSnapshot: 'male',
        registrationStatus: 'registered'
      },
      {
        rosterEntryId: 'e2',
        seriesParticipantId: 'p-team-b',
        playerId: 'u2',
        playerNameSnapshot: '乙',
        handicapSnapshot: 8,
        genderSnapshot: 'female',
        registrationStatus: 'registered'
      },
      {
        rosterEntryId: 'e3',
        seriesParticipantId: 'p-team-a',
        playerId: 'u3',
        playerNameSnapshot: '丙',
        registrationStatus: 'cancelled'
      },
      {
        rosterEntryId: 'e4',
        seriesParticipantId: 'unknown-p',
        playerId: 'u4',
        playerNameSnapshot: '丁',
        registrationStatus: 'registered'
      }
    ]
  });
  var a = registerVm.buildSeriesRegisterViewModel({
    series: series,
    lifecycleAccess: { lifecycleStatus: 'published' },
    activeParticipantId: 'p-team-a',
    registrationContext: {
      resolved: true,
      identityOk: true,
      playerId: 'me',
      eligibleParticipantIds: ['p-team-a'],
      ineligibleMessage: ''
    }
  });
  var b = registerVm.buildSeriesRegisterViewModel({
    series: series,
    lifecycleAccess: { lifecycleStatus: 'published' },
    activeParticipantId: 'p-team-b',
    registrationContext: {
      resolved: true,
      identityOk: true,
      playerId: 'u1',
      eligibleParticipantIds: ['p-team-a'],
      ineligibleMessage: ''
    }
  });
  assert(
    'cancelled 与无法归属条目不计入',
    a.registerTotalCount === 2 &&
      a.registerSubTabs[0].count === 1 &&
      a.registerSubTabs[1].count === 1 &&
      a.countsSumEqualsTotal
  );
  assert(
    'registerTotalCount 等于子 TAB count 之和',
    a.registerTotalCount ===
      a.registerSubTabs.reduce(function (s, t) {
        return s + t.count;
      }, 0)
  );
  assert(
    '切换主体只改过滤结果，总人数不变',
    a.registerTotalCount === b.registerTotalCount &&
      a.registerDisplayUsers.length === 1 &&
      a.registerDisplayUsers[0].competitionName === '甲' &&
      b.registerDisplayUsers.length === 1 &&
      b.registerDisplayUsers[0].competitionName === '乙'
  );
  assert(
    '展示含差点与性别',
    a.registerDisplayUsers[0].handicap === '5' &&
      a.registerDisplayUsers[0].genderIcon === '♂' &&
      b.registerDisplayUsers[0].genderIcon === '♀'
  );
  assert(
    '本人已报名 CTA=取消报名',
    b.currentUserRegistration.isRegistered &&
      b.cta.action === 'cancel' &&
      b.cta.label === '取消报名' &&
      !b.cta.disabled
  );
})();

(function testCtaMatrix() {
  assert(
    'draft preview CTA',
    registerVm.resolveRegisterCta({
      lifecycleAccess: { isDraftPreview: true, lifecycleStatus: 'draft' },
      registrationState: 'closed',
      identityOk: true,
      isRegistered: false,
      eligibleCount: 1
    }).label === '发布后开放报名'
  );
  assert(
    'cancelled CTA',
    registerVm.resolveRegisterCta({
      lifecycleAccess: { lifecycleStatus: 'cancelled' },
      registrationState: 'open',
      identityOk: true,
      isRegistered: false,
      eligibleCount: 1
    }).label === '赛事已取消'
  );
  assert(
    'archived CTA',
    registerVm.resolveRegisterCta({
      lifecycleAccess: { lifecycleStatus: 'archived' },
      registrationState: 'open',
      identityOk: true,
      isRegistered: false,
      eligibleCount: 1
    }).label === '赛事已归档'
  );
  assert(
    'published+closed CTA',
    registerVm.resolveRegisterCta({
      lifecycleAccess: { lifecycleStatus: 'published' },
      registrationState: 'closed',
      identityOk: true,
      isRegistered: false,
      eligibleCount: 1
    }).label === '报名通道已关闭'
  );
  assert(
    'published+open+无资格 CTA',
    registerVm.resolveRegisterCta({
      lifecycleAccess: { lifecycleStatus: 'published' },
      registrationState: 'open',
      identityOk: true,
      isRegistered: false,
      eligibleCount: 0,
      ineligibleMessage: eligibility.MSG_NOT_PARTICIPANT_TEAM
    }).label === eligibility.MSG_NOT_PARTICIPANT_TEAM
  );
  assert(
    'published+open+身份失败 CTA',
    registerVm.resolveRegisterCta({
      lifecycleAccess: { lifecycleStatus: 'published' },
      registrationState: 'open',
      identityOk: false,
      isRegistered: false,
      eligibleCount: 0,
      ineligibleMessage: eligibility.MSG_IDENTITY
    }).label === eligibility.MSG_IDENTITY
  );
  assert(
    'published+open+无参赛主体 CTA',
    registerVm.resolveRegisterCta({
      lifecycleAccess: { lifecycleStatus: 'published' },
      registrationState: 'open',
      identityOk: true,
      isRegistered: false,
      eligibleCount: 0,
      ineligibleMessage: eligibility.MSG_NO_TEAM_PARTICIPANTS
    }).label === eligibility.MSG_NO_TEAM_PARTICIPANTS
  );
  assert(
    'published+open+有资格 CTA',
    registerVm.resolveRegisterCta({
      lifecycleAccess: { lifecycleStatus: 'published' },
      registrationState: 'open',
      identityOk: true,
      isRegistered: false,
      eligibleCount: 2
    }).action === 'register'
  );
  assert(
    'published+open+已报名 CTA',
    registerVm.resolveRegisterCta({
      lifecycleAccess: { lifecycleStatus: 'published' },
      registrationState: 'open',
      identityOk: true,
      isRegistered: true,
      eligibleCount: 0
    }).action === 'cancel'
  );
  assert(
    'live+open 仍可立即报名',
    registerVm.resolveRegisterCta({
      lifecycleAccess: { lifecycleStatus: 'published' },
      registrationState: 'open',
      identityOk: true,
      isRegistered: false,
      eligibleCount: 1,
      competitionPhaseCache: 'live'
    }).action === 'register'
  );
  assert(
    'Series 整体 completed 隐藏可操作 CTA',
    (function () {
      var cta = registerVm.resolveRegisterCta({
        lifecycleAccess: { lifecycleStatus: 'published' },
        registrationState: 'open',
        identityOk: true,
        isRegistered: true,
        eligibleCount: 1,
        competitionPhaseCache: 'completed'
      });
      return cta.disabled && cta.action === 'none' && cta.label === '';
    })()
  );
  assert(
    'settlement_pending 不视为 Series 完赛',
    registerVm.resolveRegisterCta({
      lifecycleAccess: { lifecycleStatus: 'published' },
      registrationState: 'open',
      identityOk: true,
      isRegistered: false,
      eligibleCount: 1,
      competitionPhaseCache: 'settlement_pending'
    }).action === 'register'
  );
})();

(function testDetailAssembly() {
  var built = detailVm.buildSeriesDetailViewModel(baseOrgSeries(), {
    preview: true,
    theme: 'bright',
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    },
    registerActiveParticipantId: ''
  });
  assert(
    'Detail 装配 register 投影',
    built.ok &&
      built.register &&
      built.register.registerTotalCount === 0 &&
      built.register.cta.label === '发布后开放报名' &&
      built.registerEmpty == null
  );
})();

(function testPageSourceGuards() {
  var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
  var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
  var pageWxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');
  var registerSrc = fs.readFileSync(path.join(pageDir, 'seriesRegisterViewModel.js'), 'utf8');
  var eligibilitySrc = fs.readFileSync(
    path.join(pageDir, 'seriesRegisterEligibility.js'),
    'utf8'
  );

  var naturalStart = pageWxml.indexOf('id="series-scroll-natural"');
  var mainStart = pageWxml.indexOf('detail-main series-detail-main', naturalStart);
  var naturalSlice =
    naturalStart >= 0 && mainStart > naturalStart
      ? pageWxml.slice(naturalStart, mainStart)
      : '';
  var regPanelStart = pageWxml.indexOf('register-tab-panel');
  var regPanelEnd = pageWxml.indexOf("activeTab === 'schedule'", regPanelStart);
  var regPanelWxml =
    regPanelStart >= 0 && regPanelEnd > regPanelStart
      ? pageWxml.slice(regPanelStart, regPanelEnd)
      : '';
  var tplStart = pageWxml.indexOf('template name="seriesRegisterExtensionStrip"');
  var tplEnd = pageWxml.indexOf('</template>', tplStart);
  var tplWxml =
    tplStart >= 0 && tplEnd > tplStart ? pageWxml.slice(tplStart, tplEnd) : '';

  assert(
    '扩展区在 #series-scroll-natural 内且位于 detail-main 前',
    naturalSlice.indexOf('register-ext-wrap--inflow') >= 0 &&
      naturalSlice.indexOf('tab-scroll-wrap--inflow') >= 0 &&
      naturalSlice.indexOf('register-ext-wrap--inflow') >
        naturalSlice.indexOf('tab-scroll-wrap--inflow') &&
      pageWxml.indexOf('register-ext-wrap--inflow') <
        pageWxml.indexOf('detail-main series-detail-main')
  );
  assert(
    'inflow/fixed 共用同一 template',
    tplWxml.indexOf('register-ext__summary') >= 0 &&
      (pageWxml.match(/is="seriesRegisterExtensionStrip"/g) || []).length === 2 &&
      pageWxml.indexOf('register-ext-wrap--fixed') >= 0
  );
  assert(
    'WXML 消费统一 register 投影且无支付列',
    tplWxml.indexOf('register.registerTotalCount') >= 0 &&
      tplWxml.indexOf('register.registerSubTabs') >= 0 &&
      regPanelWxml.indexOf('register.registerDisplayUsers') >= 0 &&
      pageWxml.indexOf('register.cta.label') >= 0 &&
      pageWxml.indexOf('roster-col--payment') < 0 &&
      pageWxml.indexOf('roster-paid-badge') < 0 &&
      pageWxml.indexOf('已付') < 0
  );
  assert(
    'C3-U 报名名单：昵称+性别同 inline-flex 容器；昵称不得 flex:1 推开性别',
    (function () {
      // 过期 600 字窗口会因头像 data-* 主页接线截断；直接锚定已验收的 name-line
      var nameLineIdx = regPanelWxml.indexOf('roster-player-name-line');
      if (nameLineIdx < 0) return false;
      var block = regPanelWxml.slice(nameLineIdx, nameLineIdx + 400);
      var nameRule = pageWxss.match(/\.roster-name\s*\{[\s\S]*?\}/);
      var nameCss = nameRule ? nameRule[0] : '';
      return (
        regPanelWxml.indexOf('roster-player-main') >= 0 &&
        block.indexOf('roster-name') >= 0 &&
        /roster-name[\s\S]{0,200}roster-gender/.test(block) &&
        /wx:if="\{\{item\.genderIcon\}\}"/.test(block) &&
        block.indexOf('roster-name-wrap') < 0 &&
        block.indexOf('roster-col--gender') < 0 &&
        pageWxss.indexOf('.roster-name-wrap') < 0 &&
        /roster-player-name-line\s*\{[\s\S]*?display:\s*inline-flex/.test(pageWxss) &&
        /roster-gender\s*\{[\s\S]*?flex:\s*none/.test(pageWxss) &&
        /roster-name\s*\{[\s\S]*?min-width:\s*0/.test(pageWxss) &&
        /roster-name\s*\{[\s\S]*?text-overflow:\s*ellipsis/.test(pageWxss) &&
        !/flex:\s*1(?!\s*0)/.test(nameCss) &&
        pageWxss.indexOf('grid-template-columns: 15% minmax(0, 61%) 24%') >= 0
      );
    })()
  );
  assert(
    '无轮次选择器；有报名二级吸顶（非报名轮次 R）',
    tplWxml.indexOf('roundSelector') < 0 &&
      regPanelWxml.indexOf('roundSelector') < 0 &&
      pageJs.indexOf('measureRegisterExtTop') >= 0 &&
      pageJs.indexOf('isStickyRegisterExt') >= 0 &&
      pageJs.indexOf('calcIsStickyRegisterExt') >= 0
  );
  assert(
    '子 TAB 横向 scroll-left 同步与防回写锁',
    tplWxml.indexOf('registerSubTabScrollLeft') >= 0 &&
      tplWxml.indexOf('onRegisterSubTabHScroll') >= 0 &&
      pageJs.indexOf('onRegisterSubTabHScroll') >= 0 &&
      pageJs.indexOf('_skipRegisterSubTabHScrollSync') >= 0 &&
      pageJs.indexOf('registerSubTabScrollLeft') >= 0
  );
  assert(
    'rosterMinHeight 仅为页面态且带 token 防过期',
    pageJs.indexOf('rosterMinHeight') >= 0 &&
      pageJs.indexOf('computeRosterMinHeight') >= 0 &&
      pageJs.indexOf('_rosterMeasureToken') >= 0 &&
      registerSrc.indexOf('rosterMinHeight') < 0 &&
      pageWxml.indexOf('rosterMinHeight') >= 0
  );
  assert(
    'CTA 安全区与行按压反馈',
    pageWxss.indexOf('safe-area-inset-bottom') >= 0 &&
      /\.register-cta-bar[\s\S]*?safe-area-inset-bottom/.test(pageWxss) &&
      pageWxml.indexOf('hover-class="roster-row--active"') >= 0 &&
      pageWxss.indexOf('.roster-row--active') >= 0
  );
  assert(
    'B2 本人报名走 registerSelf/cancelSelf；M 管理路径可调 setRegistrationState/registerForOther',
    pageJs.indexOf('registerSelf') >= 0 &&
      pageJs.indexOf('cancelSelfRegistration') >= 0 &&
      pageJs.indexOf('createSeriesRegistrationService') >= 0 &&
      pageJs.indexOf('_registerWriteLock') >= 0 &&
      pageJs.indexOf('confirmRegister') >= 0 &&
      pageJs.indexOf('setRegistrationState') >= 0 &&
      pageJs.indexOf('registerForOther') >= 0 &&
      pageJs.indexOf('toggleSeriesRegistrationState') >= 0 &&
      pageJs.indexOf('openProxyRegisterSheet') >= 0 &&
      !/\bupsertSeries\s*\(/.test(pageJs) &&
      pageJs.indexOf('upsertSeriesChecked') < 0 &&
      // Series M 可对当前轮 finish 写 saveMatch；报名路径仍禁止 cancelRegistration
      pageJs.indexOf('teamMatchStore.cancelRegistration') < 0
  );
  assert(
    '普通 CTA 不伪装代报名；proxy 仅 M 面板入口（common 能力）',
    (function () {
      var ctaStart = pageJs.indexOf('onRegisterCtaTap: function');
      var ctaEnd = pageJs.indexOf('\n  openRegisterSheet: function', ctaStart);
      var ctaBody =
        ctaStart >= 0 && ctaEnd > ctaStart ? pageJs.slice(ctaStart, ctaEnd) : '';
      var confirmStart = pageJs.indexOf('confirmRegister: function');
      var confirmEnd = pageJs.indexOf('\n  openCancelRegisterModal: function', confirmStart);
      var confirmBody =
        confirmStart >= 0 && confirmEnd > confirmStart
          ? pageJs.slice(confirmStart, confirmEnd)
          : '';
      return (
        ctaBody.indexOf('openRegisterSheet') >= 0 &&
        ctaBody.indexOf('openProxyRegisterSheet') < 0 &&
        /openRegisterSheet:[\s\S]{0,2500}_registerSheetMode = 'self'/.test(pageJs) &&
        /openRegisterSheet:[\s\S]{0,2500}registerSheetMode:\s*'self'/.test(pageJs) &&
        /openProxyRegisterSheet:[\s\S]{0,2200}registerForOtherSheetVisible:\s*true/.test(
          pageJs
        ) &&
        // 对齐队际赛：入口点击 closed → 共享 Modal，不进选人 sheet
        /openProxyRegisterSheet:[\s\S]{0,1200}_showRegistrationClosedModal/.test(pageJs) &&
        /openProxyRegisterSheet:[\s\S]{0,900}registrationState[\s\S]{0,120}!==\s*'open'/.test(
          pageJs
        ) &&
        /confirmProxyGroupSheet:[\s\S]{0,1800}_showRegistrationClosedModal/.test(pageJs) &&
        confirmBody.indexOf('registerForOther') < 0 &&
        confirmBody.indexOf('registerSelf') >= 0 &&
        /confirmProxyGroupSheet:[\s\S]{0,2400}_applySeriesProxyCommitPlan/.test(pageJs) &&
        /_applySeriesProxyCommitPlan:[\s\S]{0,4500}applyProxyCommitPlan/.test(pageJs)
      );
    })()
  );
  assert(
    '报名写路径禁止改分站 registerInfo / 同步各轮；代报名复用好友页',
    pageJs.indexOf('match.registrationStatus') < 0 &&
      pageJs.indexOf('registerInfo.users') < 0 &&
      (pageJs.indexOf('teamMatchStore.saveMatch') >= 0 ||
        pageJs.indexOf('saveMatchIfWritable') >= 0) &&
      !/teamMatchStore\.saveMatch\([\s\S]{0,200}register/.test(pageJs) &&
      pageJs.indexOf('syncProxy') < 0 &&
      pageJs.indexOf('proxyToStations') < 0 &&
      pageJs.indexOf('openFriendPicker') < 0 &&
      pageJs.indexOf('proxy_register') >= 0 &&
      pageJs.indexOf('/subpackages/player/pages/friends/index') >= 0 &&
      !/_applySeriesProxyAdds:[\s\S]{0,3500}teamMatchStore\.saveMatch/.test(pageJs)
  );
  assert(
    '邀请 path 指向 series-detail 且含 tab=register、无 matchId/preview/访问码',
    (function () {
      var sheetVm = require(path.join(pageDir, 'seriesManageSheetViewModel.js'));
      var invitePath = sheetVm.buildSeriesInviteSharePath('series-invite-1');
      var pathOk =
        invitePath.indexOf('/subpackages/tournament/pages/series-detail/index') === 0 &&
        invitePath.indexOf('seriesId=series-invite-1') >= 0 &&
        invitePath.indexOf('tab=register') >= 0 &&
        invitePath.indexOf('matchId') < 0 &&
        invitePath.indexOf('preview') < 0 &&
        invitePath.indexOf('accessCode') < 0 &&
        invitePath.indexOf('access') < 0;
      return (
        pageJs.indexOf('onShareAppMessage') >= 0 &&
        pageJs.indexOf('buildSeriesInviteSharePath') >= 0 &&
        pageJs.indexOf('shareSeriesInvite') >= 0 &&
        pageJs.indexOf('hero.bannerImage') >= 0 &&
        pathOk
      );
    })()
  );
  assert(
    '报名开关只写 Series registrationState，并刷新面板与报名投影',
    /toggleSeriesRegistrationState:[\s\S]*?setRegistrationState\(/.test(pageJs) &&
      /toggleSeriesRegistrationState:[\s\S]*?expectedRegistrationRevision/.test(pageJs) &&
      /toggleSeriesRegistrationState:[\s\S]*?_rebuildRegisterProjection/.test(pageJs) &&
      /toggleSeriesRegistrationState:[\s\S]*?_refreshSeriesManageSheet/.test(pageJs) &&
      /toggleSeriesRegistrationState:[\s\S]*?registration_conflict/.test(pageJs) &&
      pageJs.indexOf('match.registrationStatus') < 0 &&
      pageJs.indexOf("registrationStatus: 'open'") < 0 &&
      pageJs.indexOf("registrationStatus: 'closed'") < 0
  );
  assert(
    '本人 sheet 只读手机号对齐普通字段序；代报名手工含手机号',
    (function () {
      var selfStart = pageWxml.indexOf('<!-- 本人报名');
      var sourceStart = pageWxml.indexOf('<!-- 替他人报名：人员来源');
      var selfChunk =
        selfStart >= 0 && sourceStart > selfStart
          ? pageWxml.slice(selfStart, sourceStart)
          : '';
      var manualStart = pageWxml.indexOf('<!-- 替他人报名 · 手工添加');
      var manualChunk =
        manualStart >= 0 ? pageWxml.slice(manualStart, manualStart + 1800) : '';
      var groupIdx = selfChunk.indexOf('registerSheetGroupLabel');
      var nameIdx = selfChunk.indexOf('比赛名');
      var genderIdx = selfChunk.indexOf('性别');
      var phoneIdx = selfChunk.indexOf('手机号');
      return (
        selfChunk.indexOf('registerPhone') >= 0 &&
        selfChunk.indexOf('未绑定手机号') >= 0 &&
        selfChunk.indexOf('register-sheet__readonly') >= 0 &&
        groupIdx >= 0 &&
        nameIdx > groupIdx &&
        genderIdx > nameIdx &&
        phoneIdx > genderIdx &&
        !/绑定手机号/.test(selfChunk.replace(/未绑定手机号/g, '')) &&
        selfChunk.indexOf('registerSheetOptions') >= 0 &&
        manualChunk.indexOf('手机号码（选填）') >= 0 &&
        pageWxml.indexOf('selectRegisterSheetParticipant') >= 0 &&
        pageWxml.indexOf('registerForOtherSheetVisible') >= 0 &&
        pageWxml.indexOf('player-source-sheet') >= 0 &&
        pageWxml.indexOf('proxyGroupSheetVisible') >= 0 &&
        pageWxml.indexOf('manual-sheet') >= 0
      );
    })()
  );
  assert(
    'M2 代报名投影：好友/成员/手工入口与无默认第一主体',
    (function () {
      var proxyVm = require(path.join(pageDir, 'seriesProxyRegisterViewModel.js'));
      var opts = proxyVm.buildRegisterForOtherSourceOptions(true);
      var keys = opts.map(function (o) {
        return o.key;
      });
      var aff = proxyVm.buildProxyAffiliationOptions({
        hostMode: 'organization',
        participants: [
          { seriesParticipantId: 't1', shortNameSnapshot: '甲', sourceTeamId: 'c1' },
          { seriesParticipantId: 't2', shortNameSnapshot: '乙', sourceTeamId: 'c2' }
        ]
      });
      return (
        keys.indexOf('friends') >= 0 &&
        keys.indexOf('team_members') >= 0 &&
        keys.indexOf('manual') >= 0 &&
        aff.options.length === 2 &&
        pageJs.indexOf('proxyGroupId: hasDefault ? defaultRegId : \'\'') >= 0 &&
        pageJs.indexOf('built.options[0].id') < 0 &&
        pageWxss.indexOf('.manual-sheet') >= 0 &&
        pageJs.indexOf('teamMatchStore.getMatchById') >= 0 &&
        !/_applySeriesProxyAdds:[\s\S]{0,3000}teamMatchStore\.saveMatch/.test(pageJs) &&
        !/_applySeriesProxyAdds:[\s\S]{0,3000}registerInfo/.test(pageJs)
      );
    })()
  );
  assert(
    'eligibility 生产路径用 listActiveClubTeamsForUser，禁用 isMine/固定 me',
    eligibilitySrc.indexOf('listActiveClubTeamsForUser') >= 0 &&
      // 允许注释声明「不使用 isMine」；禁止可执行路径依赖 isMine
      !/\bisMine\b/.test(eligibilitySrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')) &&
      !/playerId:\s*['"]me['"]/.test(eligibilitySrc) &&
      !/sourceTeamId:\s*['"][123]['"]/.test(eligibilitySrc) &&
      eligibilitySrc.indexOf('seriesRegistration') < 0 &&
      eligibilitySrc.indexOf(eligibility.MSG_IDENTITY) >= 0 &&
      eligibilitySrc.indexOf(eligibility.MSG_NOT_PARTICIPANT_TEAM) >= 0 &&
      eligibilitySrc.indexOf(eligibility.MSG_NOT_HOST_MEMBER) >= 0
  );
  assert(
    '成功路径无损重测与 conflict 处理',
    pageJs.indexOf('_applyRegisterWriteSuccess') >= 0 &&
      pageJs.indexOf('_handleRegistrationConflict') >= 0 &&
      pageJs.indexOf('报名状态已变化，请重新操作') >= 0 &&
      pageJs.indexOf('measureRegisterExtTop') >= 0 &&
      pageJs.indexOf('_safeSetData') >= 0 &&
      pageJs.indexOf('finally') >= 0
  );
  assert(
    'WXSS 无支付列样式依赖',
    pageWxss.indexOf('.roster-paid-badge') < 0 &&
      pageWxss.indexOf('roster-col--payment') < 0 &&
      pageWxss.indexOf('.register-subtab__logo') < 0 &&
      pageWxss.indexOf('grid-template-columns: 15% minmax(0, 61%) 24%') >= 0
  );
  assert(
    '报名子 TAB 无 image/Logo 节点且 org/team 共用纯文字结构',
    tplWxml.length > 0 &&
      tplWxml.indexOf('register-subtab__logo') < 0 &&
      tplWxml.indexOf('<image') < 0 &&
      tplWxml.indexOf('showLogo') < 0 &&
      tplWxml.indexOf('register-subtab__label') >= 0 &&
      tplWxml.indexOf('（{{item.count}}）') >= 0
  );
  assert(
    'VM 声明不写 storage',
    registerSrc.indexOf('不写 Series') >= 0 &&
      registerSrc.indexOf('buildSeriesRegisterViewModel') >= 0
  );
  // CTA 必须保有 safe-area；M / 手工 sheet / 赛程分组 CTA 可另有（不得扩散到 TAB 底栏）
  assert(
    'page wxss safe-area 仅 CTA + 可选 M/手工 sheet',
    (function () {
      var hits = pageWxss.match(/safe-area-inset-bottom/g) || [];
      var ctaHas = /\.register-cta-bar[\s\S]{0,280}safe-area-inset-bottom/.test(
        pageWxss
      );
      var mHas = /\.series-manage-unified-sheet[\s\S]{0,200}safe-area-inset-bottom/.test(
        pageWxss
      );
      var manualHas = /\.manual-sheet[\s\S]{0,240}safe-area-inset-bottom/.test(
        pageWxss
      );
      var scheduleCtaHas =
        /groups-tab-panel--with-cta[\s\S]{0,160}safe-area-inset-bottom/.test(
          pageWxss
        ) ||
        /series-manage-unified-sheet[\s\S]{0,200}safe-area-inset-bottom/.test(
          pageWxss
        );
      return (
        ctaHas &&
        hits.length >= 1 &&
        hits.length <= 4 &&
        (hits.length === 1 || mHas || manualHas || scheduleCtaHas)
      );
    })()
  );
})();

console.log('');
console.log('---- seriesRegister.selftest (报名 B2) ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
