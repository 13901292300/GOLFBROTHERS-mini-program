/**
 * Series 讨论区 A 自测
 * - 时间节点纯投影规则
 * - 生命周期发言门闩
 * - seriesId 房间 / 不写 store
 * - discussion 组件 prop 默认关闭保回归
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesDiscussion.selftest.js
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
var componentsDir = path.join(__dirname, '..', 'miniprogram', 'components', 'discussion');

var timeline = require(path.join(utilsDir, 'discussionTimeline.js'));
var discussionVm = require(path.join(pageDir, 'seriesDiscussionViewModel.js'));
var detailVm = require(path.join(pageDir, 'seriesDetailViewModel.js'));
var dock = require(path.join(pageDir, 'seriesBottomDockVisibility.js'));

var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var pageJson = fs.readFileSync(path.join(pageDir, 'index.json'), 'utf8');
var compJs = fs.readFileSync(path.join(componentsDir, 'index.js'), 'utf8');
var compWxml = fs.readFileSync(path.join(componentsDir, 'index.wxml'), 'utf8');
var detailWxml = fs.readFileSync(
  path.join(pageDir, '..', 'detail', 'index.wxml'),
  'utf8'
);
var scoreWxml = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'miniprogram',
    'subpackages',
    'scoring',
    'pages',
    'score',
    'index.wxml'
  ),
  'utf8'
);
var hubWxml = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'pages', 'game', 'hub', 'index.wxml'),
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

function atLocal(y, m, d, hh, mm) {
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

// ===== Timeline =====
assert('空列表投影为空（无孤立今天）', timeline.projectDiscussionTimeline([]).length === 0);

var t1 = atLocal(2026, 8, 12, 10, 0);
var t2 = atLocal(2026, 8, 12, 10, 3); // +3min
var t3 = atLocal(2026, 8, 12, 10, 9); // +6min from t2
var t4 = atLocal(2026, 8, 13, 9, 0); // next day

var msgs = [
  { text: 'a', createdAt: t1 },
  { text: 'b', createdAt: t2 },
  { text: 'c', createdAt: t3 },
  { text: 'd', createdAt: t4 }
];
var frozen = JSON.stringify(msgs);
var view = timeline.projectDiscussionTimeline(msgs);
assert('投影不改写原 messages', JSON.stringify(msgs) === frozen);
assert(
  '首条前有时间节点',
  view[0] && view[0].rowType === 'time' && view[1] && view[1].rowType === 'message'
);
assert(
  '同日 <5 分钟不插时间',
  view[2] && view[2].rowType === 'message' && view[2].text === 'b'
);
assert(
  '同日 >5 分钟插时间（仅时刻）',
  view[3] &&
    view[3].rowType === 'time' &&
    view[3].label === '10:09' &&
    view[4] &&
    view[4].text === 'c'
);
assert(
  '跨日显示完整日期与时间',
  view[5] &&
    view[5].rowType === 'time' &&
    /2026年8月13日 09:00/.test(view[5].label) &&
    view[6] &&
    view[6].text === 'd'
);
assert(
  '时间行不是消息记录字段污染',
  view.every(function (r) {
    return r.rowType !== 'time' || (r.text == null && r.self == null);
  })
);

var noTs = timeline.projectDiscussionTimeline([{ text: 'x' }]);
assert(
  '无 createdAt 的消息不造假时间节点',
  noTs.length === 1 && noTs[0].rowType === 'message' && noTs[0].text === 'x'
);

// ===== Lifecycle gates =====
assert(
  'draft 不可发言',
  discussionVm.resolveDiscussionCanSpeak({
    ok: true,
    lifecycleStatus: 'draft',
    isDraftPreview: true,
    isHistorical: false
  }) === false
);
assert(
  'published 可发言',
  discussionVm.resolveDiscussionCanSpeak({
    ok: true,
    lifecycleStatus: 'published',
    isDraftPreview: false,
    isHistorical: false
  }) === true
);
assert(
  'cancelled 不可发言',
  discussionVm.resolveDiscussionCanSpeak({
    ok: true,
    lifecycleStatus: 'cancelled',
    isDraftPreview: false,
    isHistorical: true
  }) === false
);
assert(
  'archived 不可发言',
  discussionVm.resolveDiscussionCanSpeak({
    ok: true,
    lifecycleStatus: 'archived',
    isDraftPreview: false,
    isHistorical: true
  }) === false
);

var publishedAccess = detailVm.resolveLifecycleAccess(
  { lifecycleStatus: 'published' },
  {}
);
var draftAccess = detailVm.resolveLifecycleAccess(
  { lifecycleStatus: 'draft' },
  { preview: true }
);
var discPub = discussionVm.buildSeriesDiscussionViewModel({
  seriesId: 'series-disc-1',
  lifecycleAccess: publishedAccess
});
var discDraft = discussionVm.buildSeriesDiscussionViewModel({
  seriesId: 'series-disc-1',
  lifecycleAccess: draftAccess
});
var cancelledAccess = detailVm.resolveLifecycleAccess(
  { lifecycleStatus: 'cancelled' },
  {}
);
var discCancelled = discussionVm.buildSeriesDiscussionViewModel({
  seriesId: 'series-disc-1',
  lifecycleAccess: cancelledAccess
});
assert('房间 key = seriesId', discPub.roomKey === 'series-disc-1');
assert(
  'published：输入栏可见且可发言',
  discPub.showInputBar === true &&
    discPub.inputDisabled === false &&
    discPub.canSpeak === true &&
    discPub.inputPlaceholder === discussionVm.PLACEHOLDER_PUBLISHED
);
assert(
  'draft preview：输入栏可见但禁用 + 发布后文案',
  discDraft.showInputBar === true &&
    discDraft.inputDisabled === true &&
    discDraft.canSpeak === false &&
    discDraft.inputPlaceholder === discussionVm.PLACEHOLDER_DRAFT
);
assert(
  'cancelled：输入栏可见但禁用 + 只读文案',
  discCancelled.showInputBar === true &&
    discCancelled.inputDisabled === true &&
    discCancelled.canSpeak === false &&
    discCancelled.inputPlaceholder === discussionVm.PLACEHOLDER_HISTORICAL
);
var archivedAccess = detailVm.resolveLifecycleAccess(
  { lifecycleStatus: 'archived' },
  {}
);
var discArchived = discussionVm.buildSeriesDiscussionViewModel({
  seriesId: 'series-disc-1',
  lifecycleAccess: archivedAccess
});
assert(
  '滚动不改变业务权限；最终输入栏可见性走报名同源几何门闩',
  (function () {
    var discBlockStart = pageWxml.indexOf('id="series-discussion"');
    var discBlockEnd = pageWxml.indexOf('</discussion>', discBlockStart);
    var discBlock =
      discBlockStart >= 0 && discBlockEnd > discBlockStart
        ? pageWxml.slice(discBlockStart, discBlockEnd)
        : '';
    function inputKey(access) {
      var s = discussionVm.resolveDiscussionInputState(access);
      return [s.showInputBar, s.inputDisabled, s.canSpeak, s.inputPlaceholder].join('|');
    }
    var geoBase = {
      isStickyTab: false,
      tabOffsetTop: 500,
      tabBarHeight: 50,
      headerTotalHeight: 92,
      screenHeight: 667,
      discussion: { showInputBar: true }
    };
    function dockInput(over) {
      return dock.resolveSeriesBottomDockVisibility(
        Object.assign({ activeTab: 'discussion' }, geoBase, over || {})
      );
    }
    var hidden = dockInput({ scrollTop: 0, isStickyTab: false });
    var shown = dockInput({ scrollTop: 120, isStickyTab: false });
    var sticky = dockInput({ scrollTop: 500, isStickyTab: true });
    var back = dockInput({ scrollTop: 0, isStickyTab: false });
    var overlay = dockInput({
      scrollTop: 120,
      isStickyTab: false,
      isManageOverlayActive: true
    });
    var otherTab = dock.resolveSeriesBottomDockVisibility(
      Object.assign({}, geoBase, {
        activeTab: 'info',
        scrollTop: 120,
        discussion: { showInputBar: true }
      })
    );
    var noElig = dockInput({
      scrollTop: 120,
      discussion: { showInputBar: false }
    });
    var regHidden = dock.resolveSeriesBottomDockVisibility(
      Object.assign({}, geoBase, {
        activeTab: 'register',
        scrollTop: 0,
        register: { cta: { label: '立即报名' } }
      })
    );
    var regShown = dock.resolveSeriesBottomDockVisibility(
      Object.assign({}, geoBase, {
        activeTab: 'register',
        scrollTop: 120,
        register: { cta: { label: '立即报名' } }
      })
    );
    var pubKey = inputKey(publishedAccess);
    var draftKey = inputKey(draftAccess);
    var cancelledKey = inputKey(cancelledAccess);
    var archivedKey = inputKey(archivedAccess);
    var draftShown = dock.resolveSeriesBottomDockVisibility(
      Object.assign({}, geoBase, {
        activeTab: 'discussion',
        scrollTop: 120,
        discussion: { showInputBar: discDraft.showInputBar }
      })
    );
    return (
      pubKey === 'true|false|true|' + discussionVm.PLACEHOLDER_PUBLISHED &&
      draftKey === 'true|true|false|' + discussionVm.PLACEHOLDER_DRAFT &&
      cancelledKey === 'true|true|false|' + discussionVm.PLACEHOLDER_HISTORICAL &&
      archivedKey === 'true|true|false|' + discussionVm.PLACEHOLDER_HISTORICAL &&
      discPub.showInputBar === true &&
      discDraft.showInputBar === true &&
      discCancelled.showInputBar === true &&
      discArchived.showInputBar === true &&
      discArchived.inputDisabled === true &&
      hidden.hideBottomCta === regHidden.hideBottomCta &&
      shown.hideBottomCta === regShown.hideBottomCta &&
      hidden.showDiscussionInput === false &&
      shown.showDiscussionInput === true &&
      sticky.showDiscussionInput === true &&
      back.showDiscussionInput === false &&
      overlay.showDiscussionInput === false &&
      otherTab.showDiscussionInput === false &&
      noElig.showDiscussionInput === false &&
      draftShown.showDiscussionInput === true &&
      discDraft.inputDisabled === true &&
      discBlock.indexOf('show-input-bar="{{showDiscussionInput}}"') >= 0 &&
      discBlock.indexOf('input-disabled="{{discussionInputDisabled}}"') >= 0 &&
      discBlock.indexOf('scrollYState') < 0 &&
      discBlock.indexOf('discussionShowInputBar') < 0 &&
      /wx:if="\{\{[^}]*scrollYState/.test(discBlock) === false &&
      pageJs.indexOf('discussionShowInputBar: !!disc.showInputBar') >= 0 &&
      pageJs.indexOf('discussionCanSpeak && scrollTop >= 100') < 0 &&
      pageJs.indexOf("discussion: { showInputBar: !!discussionPatch.discussionShowInputBar }") >=
        0 &&
      detailWxml.indexOf('show-input-bar="{{scrollYState >= 100}}"') >= 0
    );
  })()
);

// ===== Page wiring / no store writes =====
assert(
  'series-detail 注册 discussion 组件',
  pageJson.indexOf('"/components/discussion/index"') >= 0
);
assert(
  'wxml 挂载 series-discussion 且开启时间节点/禁用 prop',
  pageWxml.indexOf('id="series-discussion"') >= 0 &&
    pageWxml.indexOf('enable-time-nodes="{{true}}"') >= 0 &&
    pageWxml.indexOf('input-disabled="{{discussionInputDisabled}}"') >= 0 &&
    pageWxml.indexOf('input-placeholder="{{discussionInputPlaceholder}}"') >= 0 &&
    pageWxml.indexOf('bind:send="onDiscussionSend"') >= 0
);
assert(
  '页面会话镜像 onDiscussionSend / _discussionChat',
  pageJs.indexOf('onDiscussionSend') >= 0 &&
    pageJs.indexOf('_discussionChat') >= 0 &&
    pageJs.indexOf('_discussionRoomSeriesId') >= 0
);
assert(
  '讨论区不写 seriesStore.save / teamMatchStore.save',
  !/onDiscussionSend[\s\S]{0,800}seriesStore\.(save|set)/.test(pageJs) &&
    !/onDiscussionSend[\s\S]{0,800}teamMatchStore\.(save|set)/.test(pageJs)
);
assert(
  '不按 round/matchId 拆讨论房',
  pageWxml.indexOf('discussion') >= 0 &&
    pageJs.indexOf('_discussionRoomSeriesId') >= 0 &&
    !/discussionRoomMatchId|discussion.*roundId/.test(pageJs)
);

// ===== Component regression gates =====
assert(
  'enableTimeNodes 默认 false',
  /enableTimeNodes:\s*\{\s*type:\s*Boolean,\s*value:\s*false\s*\}/.test(compJs)
);
assert(
  'inputDisabled 默认 false（旧宿主不受影响）',
  /inputDisabled:\s*\{\s*type:\s*Boolean,\s*value:\s*false\s*\}/.test(compJs)
);
assert(
  '禁用路径真正拦截 onSend/onDraftInput',
  compJs.indexOf('_isInputDisabled()') >= 0 &&
    /onSend\(\)\s*\{[\s\S]*?_isInputDisabled\(\)/.test(compJs) &&
    /onDraftInput\(e\)\s*\{[\s\S]*?_isInputDisabled\(\)/.test(compJs) &&
    compWxml.indexOf('disabled="{{inputDisabled}}"') >= 0
);
assert(
  '未开启时仍渲染硬编码今天',
  compWxml.indexOf('wx:if="{{!enableTimeNodes}}"') >= 0 &&
    compWxml.indexOf('>今天<') >= 0
);
assert(
  'detail/score/hub 未开启 enable-time-nodes',
  detailWxml.indexOf('enable-time-nodes') < 0 &&
    scoreWxml.indexOf('enable-time-nodes') < 0 &&
    hubWxml.indexOf('enable-time-nodes') < 0
);
assert(
  '发送写入 createdAt',
  /createdAt\s*=\s*Date\.now\(\)/.test(compJs) &&
    /triggerEvent\('send',\s*\{\s*text,\s*mentions,\s*createdAt,\s*message\s*\}\)/.test(
      compJs
    )
);

console.log('');
console.log('seriesDiscussion.selftest: ' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  console.log('Failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
