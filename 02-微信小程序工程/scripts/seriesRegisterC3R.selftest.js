/**
 * Patch C3-R：Series 报名阶段完整收口自测
 * - 身份契约 / 主页 ID 门闩
 * - CTA 几何门闩（C3-D：镜像 detail._calcHideRegisterCTA）
 * - 图文直播 https 复制
 * - closed 本人/代报名
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesRegisterC3R.selftest.js
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
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');

var registerVm = require(path.join(pageDir, 'seriesRegisterViewModel.js'));
var dock = require(path.join(pageDir, 'seriesBottomDockVisibility.js'));
var detailVm = require(path.join(pageDir, 'seriesDetailViewModel.js'));
var openPlayerProfile = require(path.join(utilsDir, 'openPlayerProfile.js'));
var seriesRegistrationSrc = fs.readFileSync(
  path.join(utilsDir, 'seriesRegistration.js'),
  'utf8'
);

var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var pageWxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');

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

function baseSeries(over) {
  return Object.assign(
    {
      seriesId: 's1',
      hostMode: 'organization',
      lifecycleStatus: 'published',
      registrationState: 'open',
      registrationRevision: 1,
      participants: [
        {
          seriesParticipantId: 'p-a',
          kind: 'team',
          nameSnapshot: '球队A',
          shortNameSnapshot: 'A'
        }
      ],
      roster: [
        {
          rosterEntryId: 're1',
          playerId: 'user_stable_1',
          userId: 'user_stable_1',
          seriesParticipantId: 'p-a',
          registrationStatus: 'registered',
          registrationSource: 'self',
          playerNameSnapshot: '张三很长很长很长很长昵称',
          playerAvatarSnapshot: 'https://example.com/a.png',
          genderSnapshot: 'male',
          handicapSnapshot: 8,
          floatCoefSnapshot: 8.2
        },
        {
          rosterEntryId: 're2',
          playerId: 'guest_abc',
          seriesParticipantId: 'p-a',
          registrationStatus: 'registered',
          registrationSource: 'proxy',
          playerNameSnapshot: '游客',
          genderSnapshot: '',
          handicapSnapshot: 12
        },
        {
          rosterEntryId: 're3',
          playerId: 'entity:pair:x',
          seriesParticipantId: 'p-a',
          registrationStatus: 'registered',
          playerNameSnapshot: '实体键',
          genderSnapshot: 'female'
        }
      ],
      eventInfoList: []
    },
    over || {}
  );
}

// ===== 身份契约 =====
(function identityContract() {
  var vm = registerVm.buildSeriesRegisterViewModel({
    series: baseSeries(),
    lifecycleAccess: { lifecycleStatus: 'published', isDraftPreview: false },
    activeParticipantId: 'p-a',
    registrationContext: {
      resolved: true,
      playerId: 'me',
      identityOk: true,
      eligibleParticipantIds: ['p-a'],
      ineligibleMessage: ''
    }
  });
  var u0 = vm.registerDisplayUsers[0];
  var u1 = vm.registerDisplayUsers[1];
  var u2 = vm.registerDisplayUsers[2];
  assert('名单长度 3', vm.registerDisplayUsers.length === 3);
  assert(
    '身份字段齐全',
    u0.playerId === 'user_stable_1' &&
      u0.userId === 'user_stable_1' &&
      u0.profileUserId === 'user_stable_1' &&
      u0.name &&
      u0.displayName &&
      u0.avatar &&
      u0.avatarUrl &&
      u0.genderIcon === '♂' &&
      u0.handicapFloat === 8.2 &&
      u0.seriesParticipantId === 'p-a' &&
      u0.registrationStatus === 'registered' &&
      u0.registrationSource === 'self' &&
      u0.profileAvailable === true
  );
  assert(
    'guest 无主页 ID',
    u1.profileUserId === '' &&
      u1.profileAvailable === false &&
      openPlayerProfile.resolveOpenableUserId({
        userId: u1.playerId,
        playerId: u1.playerId
      }) === ''
  );
  assert(
    'entityId 风格键不可作主页',
    u2.profileUserId === '' &&
      openPlayerProfile.resolveOpenableUserId({
        userId: 'entity:pair:x',
        playerId: 'entity:pair:x'
      }) === ''
  );
  assert(
    '未知性别无占位',
    u1.genderIcon === '' && u1.genderClass === ''
  );
  assert('女性符号', u2.genderIcon === '♀' && u2.genderClass === 'gender-female');
  assert(
    'projectDisplayUser 不用 seriesParticipantId 冒充 profileUserId',
    u0.profileUserId !== u0.seriesParticipantId &&
      registerVm.projectDisplayUser(
        {
          seriesParticipantId: 'p-a',
          rosterEntryId: 're-x',
          entityId: 'ent1',
          unitId: 'u1',
          registrationStatus: 'registered',
          playerNameSnapshot: '无球员'
        },
        0
      ).profileUserId === ''
  );
})();

// ===== CTA 几何门闩（C3-D，非仅 isStickyTab）=====
(function ctaGeomGate() {
  var reg = {
    cta: { label: '报名已关闭', disabled: true, action: 'none' }
  };
  var geo = {
    tabOffsetTop: 500,
    tabBarHeight: 50,
    headerTotalHeight: 92,
    screenHeight: 667
  };
  var hidden = dock.resolveSeriesBottomDockVisibility(
    Object.assign({}, geo, {
      activeTab: 'register',
      isStickyTab: false,
      scrollTop: 0,
      register: reg
    })
  );
  assert(
    '未达阈值 CTA 隐藏（含 disabled）',
    hidden.showRegisterBottomAction === false && hidden.hideBottomCta === true
  );
  var shown = dock.resolveSeriesBottomDockVisibility(
    Object.assign({}, geo, {
      activeTab: 'register',
      isStickyTab: true,
      scrollTop: 500,
      register: reg
    })
  );
  assert(
    '吸顶后 disabled CTA 仍可展示',
    shown.showRegisterBottomAction === true && shown.hideBottomCta === false
  );
  var other = dock.resolveSeriesBottomDockVisibility(
    Object.assign({}, geo, {
      activeTab: 'standings',
      isStickyTab: true,
      scrollTop: 500,
      register: reg
    })
  );
  assert('非报名 TAB CTA 立即隐藏', other.showRegisterBottomAction === false);
  assert(
    '页面接线 showRegisterBottomAction + detail 同构公式',
    pageJs.indexOf('showRegisterBottomAction') >= 0 &&
      pageJs.indexOf('resolveSeriesBottomDockVisibility') >= 0 &&
      pageWxml.indexOf('showRegisterBottomAction') >= 0 &&
      pageWxss.indexOf('register-cta-bar--hide') < 0 &&
      /wx:if="\{\{showRegisterBottomAction\}\}"/.test(pageWxml)
  );
})();

// ===== 头像主页事件链 =====
assert(
  'WXML 头像 catchtap + 行 bindtap',
  pageWxml.indexOf('catchtap="onRegisterAvatarTap"') >= 0 &&
    pageWxml.indexOf('bindtap="onRegisterRosterProfileTap"') >= 0 &&
    pageWxml.indexOf('data-profile-user-id') >= 0
);
assert(
  '页面 handler → resolveOpenableUserId → openPlayerProfile',
  pageJs.indexOf('_openRegisterRosterProfile') >= 0 &&
    pageJs.indexOf('resolveOpenableUserId') >= 0 &&
    pageJs.indexOf('该球员暂无主页') >= 0
);
assert(
  'C3-U 性别同行：name-line inline-flex；昵称非 flex:1；未知性别无占位',
  (function () {
    var nameRule = pageWxss.match(/\.roster-name\s*\{[\s\S]*?\}/);
    var nameCss = nameRule ? nameRule[0] : '';
    return (
      pageWxml.indexOf('roster-player-name-line') >= 0 &&
      /roster-player-name-line\s*\{[\s\S]*?display:\s*inline-flex/.test(pageWxss) &&
      /wx:if="\{\{item\.genderIcon\}\}"/.test(pageWxml) &&
      /roster-gender\s*\{[\s\S]*?flex:\s*none/.test(pageWxss) &&
      !/flex:\s*1(?!\s*0)/.test(nameCss)
    );
  })()
);

// ===== 图文直播 =====
(function photoLive() {
  var list = detailVm.buildEventInfoView(
    {
      eventInfoList: [
        { id: '1', title: '照片直播', type: 'text', content: 'https://live.example.com/x' },
        { id: '2', title: '照片直播', type: 'text', content: '' },
        { id: '3', title: '照片直播', type: 'text', content: 'http://insecure.example.com' },
        { id: '4', title: '交通说明', type: 'text', content: 'https://live.example.com/y' }
      ]
    },
    'bright'
  );
  assert('仅有效 https 图文直播入列', list.length === 2);
  assert('photoLiveValid', list[0].photoLiveValid === true && list[0].content.indexOf('https://') === 0);
  assert(
    'WXML/JS 复制链路',
    pageWxml.indexOf('onCopyPhotoLiveLink') >= 0 &&
      pageWxml.indexOf('photoLiveValid') >= 0 &&
      pageWxml.indexOf('点击复制链接') >= 0 &&
      pageJs.indexOf('onCopyPhotoLiveLink') >= 0 &&
      pageJs.indexOf('照片直播链接已复制，请在微信中打开查看') >= 0
  );
})();

// ===== closed 矩阵 =====
(function closedMatrix() {
  var closedCta = registerVm.resolveRegisterCta({
    lifecycleAccess: { lifecycleStatus: 'published' },
    registrationState: 'closed',
    identityOk: true,
    isRegistered: false,
    eligibleCount: 1
  });
  assert(
    '本人 closed CTA=报名已关闭',
    closedCta.disabled && closedCta.label === '报名已关闭' && closedCta.action === 'none'
  );

  assert(
    '领域 assertRegistrationOpen → registration_closed；registerForOther 调用该门闩',
    /function assertRegistrationOpen[\s\S]*?registration_closed/.test(
      seriesRegistrationSrc
    ) &&
      /function registerForOther[\s\S]*?assertRegistrationOpen\(series\)/.test(
        seriesRegistrationSrc
      ) &&
      seriesRegistrationSrc.indexOf('不写任何 managed 分站') >= 0
  );

  assert(
    '页面代报名 closed toast 报名通道已关闭',
    pageJs.indexOf("title: '报名通道已关闭'") >= 0 &&
      pageJs.indexOf('openProxyRegisterSheet') >= 0 &&
      /openProxyRegisterSheet:[\s\S]{0,800}报名通道已关闭/.test(pageJs)
  );
  assert(
    'M 代报名不在 VM 因 closed 置灰',
    fs
      .readFileSync(path.join(pageDir, 'seriesManageSheetViewModel.js'), 'utf8')
      .indexOf('closed 拦截放在点击入口') >= 0
  );
})();

// ===== 不写 managed registerInfo / 软取消无回归静态 =====
assert(
  '报名投影不写 registerInfo',
  fs.readFileSync(path.join(pageDir, 'seriesRegisterViewModel.js'), 'utf8').indexOf(
    'registerInfo'
  ) < 0
);
assert(
  'CTA 采用 wx:if 最终可见字段（C3-D）',
  pageWxml.indexOf('register-cta-bar--hide') < 0 &&
    /wx:if="\{\{showRegisterBottomAction\}\}"/.test(pageWxml)
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('FAILURES:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
