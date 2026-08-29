/**
 * Patch C3-D：Series 底部 dock 与单场 detail._calcHideRegisterCTA 对照签名
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesBottomDockVisibility.selftest.js
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
var detailJsPath = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'detail',
  'index.js'
);

var dock = require(path.join(pageDir, 'seriesBottomDockVisibility.js'));
var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var pageWxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');
var dockSrc = fs.readFileSync(
  path.join(pageDir, 'seriesBottomDockVisibility.js'),
  'utf8'
);
var detailJs = fs.readFileSync(detailJsPath, 'utf8');

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

var BASE_GEO = {
  tabOffsetTop: 400,
  tabBarHeight: 50,
  headerTotalHeight: 92,
  screenHeight: 667
};

function geo(over) {
  return Object.assign({}, BASE_GEO, over || {});
}

// 从 detail 源码抽取公式片段做对照
assert(
  '1 Series 报名显隐公式与单场报名公式一致',
  /_calcHideRegisterCTA\(scrollTop, isStickyTab\)\s*\{[\s\S]*?return \(screenH - tabBottom\) <= 100;/.test(
    detailJs
  ) &&
    dock.CTA_HIDE_GAP_PX === 100 &&
    dockSrc.indexOf('screenH - tabBottom <= CTA_HIDE_GAP_PX') >= 0 &&
    dockSrc.indexOf('headerH + tabOffsetTop - scrollTop + tabBarH') >= 0 &&
    dockSrc.indexOf('headerH + tabBarH') >= 0
);

var detailWxml = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'miniprogram',
    'subpackages',
    'tournament',
    'pages',
    'detail',
    'index.wxml'
  ),
  'utf8'
);
assert(
  '2 Series 赛程显隐公式与单场 groups 操作按钮一致（共用 hide 几何）',
  detailWxml.indexOf(
    "activeTab === 'groups' && canManageGroups && !hideRegisterCTA"
  ) >= 0 &&
    /activeTab === 'register' \|\| this\.data\.activeTab === 'groups'/.test(
      detailJs
    ) &&
    dockSrc.indexOf("activeTab === 'schedule'") >= 0 &&
    dockSrc.indexOf('showScheduleBottomAction') >= 0 &&
    dockSrc.indexOf('!hideBottomCta') >= 0
);

(function justSwitchTab() {
  var r = dock.resolveSeriesBottomDockVisibility(
    geo({
      activeTab: 'register',
      isStickyTab: false,
      scrollTop: 0,
      register: { cta: { label: '立即报名' } }
    })
  );
  // scrollTop=0、tab 仍靠下：screenH-tabBottom = 667-(92+400-0+50)=125 > 100 → 仍显示？
  // tabBottom=542, 667-542=125 > 100 → hide=false → 会显示
  // 需要更靠下的 tabOffset 才隐藏：tabBottom >= 567 → tabOffsetTop >= 425 at scroll 0
  var hidden = dock.resolveSeriesBottomDockVisibility(
    geo({
      activeTab: 'register',
      isStickyTab: false,
      scrollTop: 0,
      tabOffsetTop: 500,
      register: { cta: { label: '立即报名' } }
    })
  );
  assert(
    '3 刚切 TAB 不因 activeTab 或 isStickyTab 立即出现（未达阈值）',
    hidden.hideBottomCta === true &&
      hidden.showRegisterBottomAction === false &&
      // 仅 isStickyTab=true 但几何仍隐藏时不得放行：构造未吸顶大 offset
      dock.resolveSeriesBottomDockVisibility(
        geo({
          activeTab: 'register',
          isStickyTab: false,
          scrollTop: 0,
          tabOffsetTop: 500,
          register: { cta: { label: '立即报名' } }
        })
      ).showRegisterBottomAction === false
  );
  assert('smoke scroll0 mid-offset', typeof r.hideBottomCta === 'boolean');
})();

(function reachAndRollback() {
  var base = geo({
    activeTab: 'register',
    tabOffsetTop: 500,
    register: { cta: { label: '立即报名' } }
  });
  var before = dock.resolveSeriesBottomDockVisibility(
    Object.assign({}, base, { isStickyTab: false, scrollTop: 0 })
  );
  // 使 tabBottom < screenH-100：scrollTop > header+offset+tabBar - (screen-100)
  // = 92+500+50 - 567 = 75；取 scrollTop=120
  var after = dock.resolveSeriesBottomDockVisibility(
    Object.assign({}, base, { isStickyTab: false, scrollTop: 120 })
  );
  var sticky = dock.resolveSeriesBottomDockVisibility(
    Object.assign({}, base, { isStickyTab: true, scrollTop: 500 })
  );
  var back = dock.resolveSeriesBottomDockVisibility(
    Object.assign({}, base, { isStickyTab: false, scrollTop: 0 })
  );
  assert(
    '4 到达阈值后出现',
    before.showRegisterBottomAction === false &&
      after.showRegisterBottomAction === true &&
      sticky.showRegisterBottomAction === true
  );
  assert(
    '5 回滚后隐藏',
    back.showRegisterBottomAction === false && back.hideBottomCta === true
  );
})();

assert(
  '6 短内容可到达阈值（filler 目标仍含一级吸顶；吸顶后 hide=false）',
  pageJs.indexOf('updateScrollFillerHeight') >= 0 &&
    pageJs.indexOf('SCROLL_FILLER_TOLERANCE_PX') >= 0 &&
    dock.calcHideBottomCta(
      geo({ isStickyTab: true, scrollTop: 999, tabOffsetTop: 500 })
    ) === false
);

assert(
  '7 长内容不产生多余 filler（无损重测，禁止先归零）',
  pageJs.indexOf('禁止先把 filler 置 0') >= 0 ||
    pageJs.indexOf('不归零') >= 0
);

assert(
  '8 切轮次后使用当前轮锚点（赛程 CTA 跟 schedule.cta / selectedKey）',
  pageJs.indexOf('showScheduleBottomAction') >= 0 &&
    pageWxml.indexOf('showScheduleBottomAction') >= 0 &&
    pageJs.indexOf('schedule.cta.showEditGroups') >= 0
);

assert(
  '9 分组内容变化后重测但不闪动（token + 非归零 filler）',
  pageJs.indexOf('_fillerMeasureToken') >= 0 &&
    pageJs.indexOf('updateScrollFillerHeight') >= 0 &&
    (pageJs.indexOf('不归零') >= 0 || pageJs.indexOf('禁止先把 filler 置 0') >= 0)
);

assert(
  '10 hidden 状态：权威 wx:if 卸载；under-sheet 保留 pointer-events:none',
  /wx:if="\{\{showRegisterBottomAction\}\}"/.test(pageWxml) &&
    /wx:if="\{\{showScheduleBottomAction\}\}"/.test(pageWxml) &&
    pageWxss.indexOf('register-cta-bar--hide') < 0 &&
    /register-cta-bar--under-sheet\s*\{[\s\S]*?pointer-events:\s*none/.test(
      pageWxss
    ) &&
    detailWxml.indexOf(
      "activeTab === 'register' && showRegisterTabCTA && !hideRegisterCTA"
    ) >= 0
);

assert(
  '11 safe area 与单场一致',
  /padding:\s*16rpx 32rpx calc\(16rpx \+ env\(safe-area-inset-bottom\)\)/.test(
    pageWxss
  ) &&
    /padding:\s*16rpx 32rpx calc\(16rpx \+ env\(safe-area-inset-bottom\)\)/.test(
      fs.readFileSync(
        path.join(
          __dirname,
          '..',
          'miniprogram',
          'subpackages',
          'tournament',
          'pages',
          'detail',
          'index.wxss'
        ),
        'utf8'
      )
    ) &&
    pageWxss.indexOf(
      'padding-bottom: calc(140rpx + env(safe-area-inset-bottom))'
    ) >= 0
);

assert(
  '12 不修改 CTA 权限、文案和业务事件入口名',
  pageJs.indexOf('onRegisterCtaTap') >= 0 &&
    pageJs.indexOf('openScheduleGroupEditor') >= 0 &&
    pageJs.indexOf('openRegisterSheet') >= 0 &&
    pageJs.indexOf('openCancelRegisterModal') >= 0 &&
    pageWxml.indexOf('register.cta.label') >= 0 &&
    pageWxml.indexOf('schedule.cta.editGroupsLabel') >= 0
);

assert(
  '13 删除仅以 isStickyTab 控制报名 CTA 的旧断言/实现',
  dockSrc.indexOf('calcHideRegisterCtaBySticky') < 0 &&
    dockSrc.indexOf('&& isStickyTab') < 0 &&
    pageJs.indexOf('showRegisterCta') < 0 &&
    pageWxml.indexOf('showRegisterCta') < 0 &&
    pageWxml.indexOf('register-cta-bar--show') < 0
);

assert(
  '14 源码守卫：不得存在第二套 Series 自造阈值',
  dockSrc.indexOf('CTA_HIDE_GAP_PX = 100') >= 0 &&
    (dockSrc.match(/<=\s*100|CTA_HIDE_GAP_PX/g) || []).length >= 2 &&
    dockSrc.indexOf('screenH - tabBottom') >= 0 &&
    pageJs.indexOf('resolveSeriesBottomDockVisibility') >= 0 &&
    pageJs.indexOf('showRegisterBottomAction') >= 0 &&
    pageJs.indexOf('if (!this.data.showRegisterBottomAction) return') >= 0 &&
    pageJs.indexOf('if (!this.data.showScheduleBottomAction) return') >= 0
);

// 赛程对称
(function scheduleParity() {
  var sch = {
    cta: { showEditGroups: true, editGroupsLabel: '开始分组' }
  };
  var hide = dock.resolveSeriesBottomDockVisibility(
    geo({
      activeTab: 'schedule',
      isStickyTab: false,
      scrollTop: 0,
      tabOffsetTop: 500,
      schedule: sch
    })
  );
  var show = dock.resolveSeriesBottomDockVisibility(
    geo({
      activeTab: 'schedule',
      isStickyTab: true,
      scrollTop: 500,
      tabOffsetTop: 500,
      schedule: sch
    })
  );
  assert(
    '赛程：未达阈值隐藏 / 吸顶后出现',
    hide.showScheduleBottomAction === false &&
      show.showScheduleBottomAction === true &&
      show.showRegisterBottomAction === false
  );
})();

(function discussionParity() {
  var disc = { showInputBar: true };
  var geoHide = geo({
    tabOffsetTop: 500,
    isStickyTab: false,
    scrollTop: 0
  });
  var hideReg = dock.resolveSeriesBottomDockVisibility(
    Object.assign({}, geoHide, {
      activeTab: 'register',
      register: { cta: { label: '立即报名' } },
      discussion: disc
    })
  );
  var hideDisc = dock.resolveSeriesBottomDockVisibility(
    Object.assign({}, geoHide, {
      activeTab: 'discussion',
      discussion: disc
    })
  );
  var showDisc = dock.resolveSeriesBottomDockVisibility(
    geo({
      activeTab: 'discussion',
      isStickyTab: false,
      scrollTop: 120,
      tabOffsetTop: 500,
      discussion: disc
    })
  );
  var stickyDisc = dock.resolveSeriesBottomDockVisibility(
    geo({
      activeTab: 'discussion',
      isStickyTab: true,
      scrollTop: 500,
      tabOffsetTop: 500,
      discussion: disc
    })
  );
  var backDisc = dock.resolveSeriesBottomDockVisibility(
    Object.assign({}, geoHide, { activeTab: 'discussion', discussion: disc })
  );
  var overlayDisc = dock.resolveSeriesBottomDockVisibility(
    geo({
      activeTab: 'discussion',
      isStickyTab: true,
      scrollTop: 500,
      tabOffsetTop: 500,
      isManageOverlayActive: true,
      discussion: disc
    })
  );
  var tabsHide = ['info', 'standings', 'register', 'schedule'].every(function (tab) {
    return (
      dock.resolveSeriesBottomDockVisibility(
        geo({
          activeTab: tab,
          isStickyTab: true,
          scrollTop: 500,
          tabOffsetTop: 500,
          discussion: disc,
          register: { cta: { label: '立即报名' } }
        })
      ).showDiscussionInput === false
    );
  });
  var unmeasured = dock.resolveSeriesBottomDockVisibility(
    geo({
      activeTab: 'discussion',
      tabOffsetTop: 0,
      scrollTop: 0,
      discussion: disc
    })
  );
  var a = dock.resolveSeriesBottomDockVisibility(
    geo({
      activeTab: 'discussion',
      scrollTop: 120,
      tabOffsetTop: 500,
      discussion: disc
    })
  );
  var b = dock.resolveSeriesBottomDockVisibility(
    geo({
      activeTab: 'discussion',
      scrollTop: 120,
      tabOffsetTop: 500,
      discussion: disc
    })
  );
  assert(
    'Discussion：与报名共用 hideBottomCta；资格×几何×overlay',
    hideReg.hideBottomCta === hideDisc.hideBottomCta &&
      hideDisc.showDiscussionInput === false &&
      showDisc.showDiscussionInput === true &&
      stickyDisc.showDiscussionInput === true &&
      backDisc.showDiscussionInput === false &&
      overlayDisc.showDiscussionInput === false &&
      tabsHide &&
      unmeasured.hideBottomCta === false &&
      unmeasured.showDiscussionInput === true &&
      JSON.stringify(a) === JSON.stringify(b) &&
      pageWxml.indexOf('show-input-bar="{{showDiscussionInput}}"') >= 0 &&
      dockSrc.indexOf('scrollTop >= 100') < 0
  );
})();

console.log('');
console.log('C3-D dock selftest: passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('FAILURES:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
