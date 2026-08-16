/**
 * 队内多分队系列赛详情「参赛分队」列表：颜色圆圈 + 首字符
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesDetailDivisionParticipantMark.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var pageDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var createDir = path.join(mini, 'subpackages', 'create', 'pages', 'series');

var viewModel = require(path.join(pageDir, 'seriesDetailViewModel.js'));
var seriesColorMark = require(path.join(mini, 'utils', 'seriesColorMark.js'));
var participantDraft = require(path.join(createDir, 'participantDraft.js'));

var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var pageWxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');
var vmSrc = fs.readFileSync(path.join(pageDir, 'seriesDetailViewModel.js'), 'utf8');
var scheduleSrc = fs.readFileSync(path.join(pageDir, 'seriesScheduleViewModel.js'), 'utf8');
var manageSrc = fs.readFileSync(path.join(pageDir, 'seriesManageRoundPicker.js'), 'utf8');
var createWxml = fs.readFileSync(path.join(createDir, 'index.wxml'), 'utf8');

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

function freeze(v) {
  return JSON.parse(JSON.stringify(v));
}

function extractRule(wxss, selector) {
  var re = new RegExp(
    selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'
  );
  var m = wxss.match(re);
  return m ? m[1] : '';
}

function seriesOf(overrides) {
  var s = {
    seriesId: 's-div',
    publishToken: 'tok',
    lifecycleStatus: 'published',
    hostMode: 'team',
    templateId: 'division_series',
    seriesName: '湘鹰分队系列赛',
    hostTeam: { teamId: 'h1', teamName: '湘鹰队', teamLogo: '/host.png' },
    participants: [],
    rounds: []
  };
  Object.keys(overrides || {}).forEach(function (k) {
    s[k] = overrides[k];
  });
  return s;
}

function division(id, name, color) {
  return {
    seriesParticipantId: 'div:' + id,
    divisionId: id,
    kind: 'division',
    nameSnapshot: name,
    colorSnapshot: color,
    logoSnapshot: '/ignore-' + id + '.png'
  };
}

var host = { teamId: 'ht1', teamName: '主办', teamLogo: '' };
var created = participantDraft.createDefaultDivisions(host);
created[0].nameSnapshot = '先锋队';
created[1].nameSnapshot = 'alpha';
var createdSeries = seriesOf({ participants: freeze(created) });
var createdView = viewModel.buildParticipantsView(createdSeries);
assert(
  '分队颜色与创建数据一致',
  createdView.items.length === 2 &&
    createdView.items[0].colorMark.color === created[0].colorSnapshot &&
    createdView.items[0].colorMark.color === participantDraft.DIVISION_COLOR_PALETTE[0] &&
    createdView.items[1].colorMark.color === created[1].colorSnapshot &&
    createdView.items[1].colorMark.color === participantDraft.DIVISION_COLOR_PALETTE[1] &&
    createdView.items[0].colorMark.fallbackText === '先' &&
    createdView.items[1].colorMark.fallbackText === 'A'
);

var mixed = seriesOf({
  participants: [
    division('d1', '先锋队', '#112233'),
    division('d2', 'Eagle', '#aabbcc'),
    division('d3', 'bravo', '#00aeef'),
    division('d4', '😀红队', '#ef4444'),
    division('d5', '   ', '#10b981')
  ]
});
var before = freeze(mixed);
var list = viewModel.buildParticipantsView(mixed);
assert(
  '中文、英文、小写英文、emoji 和空名称',
  list.items[0].colorMark.fallbackText === '先' &&
    list.items[1].colorMark.fallbackText === 'E' &&
    list.items[2].colorMark.fallbackText === 'B' &&
    list.items[3].colorMark.fallbackText === '😀' &&
    list.items[4].colorMark.fallbackText === '未' &&
    list.items[4].name === '未命名分队' &&
    String(list.items[4].colorMark.fallbackText).indexOf('undefined') < 0
);
assert(
  '多分队顺序不变',
  list.items
    .map(function (it) {
      return it.seriesParticipantId;
    })
    .join(',') === 'div:d1,div:d2,div:d3,div:d4,div:d5' &&
    list.items[0].name === '先锋队' &&
    JSON.stringify(mixed.participants) === JSON.stringify(before.participants)
);

var bad = seriesOf({
  participants: [
    division('ok', '红队', '#002d62'),
    division('empty', '蓝队', ''),
    division('bad', '绿队', 'not-a-color'),
    division('inject', '黄队', '#112233;width:99')
  ]
});
var badView = viewModel.buildParticipantsView(bad);
assert(
  '缺失或非法颜色安全降级',
  badView.items[0].colorMark.color === '#002d62' &&
    badView.items[0].colorMark.backgroundStyle === 'background:#002d62;' &&
    badView.items[1].colorMark.color === '' &&
    badView.items[1].colorMark.backgroundStyle === '' &&
    badView.items[1].colorMark.fallbackText === '蓝' &&
    badView.items[2].colorMark.color === '' &&
    badView.items[3].colorMark.color === '' &&
    seriesColorMark.sanitizePersistedColor('#ce9224') === '#ce9224' &&
    seriesColorMark.sanitizePersistedColor(participantDraft.DIVISION_COLOR_PALETTE[3]) ===
      participantDraft.DIVISION_COLOR_PALETTE[3]
);

var hero = viewModel.buildHeroParticipantDisplay(mixed);
assert(
  'Hero 与详情列表使用相同首字符和颜色规则',
  hero.teamItems.length === list.items.length &&
    hero.teamItems.every(function (t, i) {
      return (
        t.fallbackText === list.items[i].colorMark.fallbackText &&
        t.color === list.items[i].colorMark.color &&
        t.participantId === list.items[i].seriesParticipantId
      );
    }) &&
    vmSrc.indexOf('seriesColorMark.buildColorMark') >= 0
);

assert(
  '不再使用旧标签式分队标识',
  pageWxml.indexOf('item.colorMark') >= 0 &&
    pageWxml.indexOf('hero-logo-stack__fallback') >= 0 &&
    pageWxml.indexOf('participant-row__name') >= 0 &&
    pageWxml.indexOf('hero-division-tag') > 0 &&
    !/participants\.items[\s\S]{0,400}hero-division-tag/.test(pageWxml) &&
    /flex-shrink:\s*0/.test(extractRule(pageWxss, '.participant-row__logo')) &&
    /width:\s*56rpx/.test(extractRule(pageWxss, '.participant-row__logo')) &&
    /font-size:\s*22rpx/.test(extractRule(pageWxss, '.hero-logo-stack__fallback'))
);

var plain = viewModel.buildParticipantsView(
  seriesOf({
    templateId: 'individual_tour',
    participants: [division('x', '红队', '#111111'), division('y', '蓝队', '#222222')]
  })
);
assert(
  '普通队内系列赛回归不受影响',
  !plain.items[0].colorMark &&
    !plain.items[1].colorMark &&
    plain.items[0].logo === '/ignore-x.png' &&
    plain.items[0].name === '红队'
);

var org = viewModel.buildParticipantsView({
  hostMode: 'organization',
  templateId: 'inter_team_series',
  participants: [
    {
      seriesParticipantId: 't1',
      kind: 'team',
      fullNameSnapshot: '甲队',
      logoSnapshot: '/a.png',
      colorSnapshot: '#ff0000'
    }
  ]
});
assert(
  '队际系列赛回归不受影响',
  !org.items[0].colorMark &&
    org.items[0].logo === '/a.png' &&
    org.items[0].name === '甲队' &&
    createWxml.indexOf('item.colorMark') < 0 &&
    scheduleSrc.indexOf('colorMark') < 0 &&
    manageSrc.indexOf('colorMark') < 0
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exit(1);
}
process.exit(0);
