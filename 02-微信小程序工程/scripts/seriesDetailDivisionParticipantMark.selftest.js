/**
 * 队内多分队系列赛详情「参赛分队」列表：颜色圆圈 + 首字符
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesDetailDivisionParticipantMark.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var pageDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var createDir = path.join(mini, 'subpackages', 'create', 'pages', 'series');

var viewModel = require(path.join(pageDir, 'seriesDetailViewModel.js'));
var seriesColorMark = require(seriesTestPaths.util('seriesColorMark.js'));
var participantDraft = require(path.join(createDir, 'participantDraft.js'));
var seriesRyderCup = require(path.join(mini, 'utils', 'seriesRyderCup.js'));

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
    pageWxml.indexOf('series-division-logo-mark') >= 0 &&
    pageWxml.indexOf('hero-logo-stack__item--division') >= 0 &&
    pageWxml.indexOf('participant-row__name') >= 0 &&
    pageWxml.indexOf('hero-division-tag') > 0 &&
    !/participants\.items[\s\S]{0,400}hero-division-tag/.test(pageWxml) &&
    /flex-shrink:\s*0/.test(extractRule(pageWxss, '.participant-row__logo')) &&
    /width:\s*56rpx/.test(extractRule(pageWxss, '.participant-row__logo')) &&
    /font-size:\s*22rpx/.test(extractRule(pageWxss, '.series-division-logo-mark'))
);

var markRule = extractRule(pageWxss, '.series-division-logo-mark');
var heroItemRule = extractRule(pageWxss, '.hero-logo-stack__item');
var heroDivisionRule = extractRule(pageWxss, '.hero-logo-stack__item--division');
var infoLogoRule = extractRule(pageWxss, '.participant-row__logo');
var heroStackRule = extractRule(pageWxss, '.hero-logo-stack');
assert(
  'Hero 与信息卡分队圆外径 56rpx、颜色填充直径一致、无内部 border',
  /height:\s*56rpx/.test(heroStackRule) &&
    /width:\s*56rpx/.test(infoLogoRule) &&
    /height:\s*56rpx/.test(infoLogoRule) &&
    /border:\s*1\.5px/.test(heroItemRule) &&
    /border:\s*0/.test(heroDivisionRule) &&
    /border:\s*none/.test(infoLogoRule) &&
    /font-size:\s*22rpx/.test(markRule) &&
    /font-weight:\s*700/.test(markRule) &&
    /color:\s*#FFFFFF/i.test(markRule) &&
    !/font-size=/.test(pageWxml) &&
    !/transform:\s*scale/.test(pageWxss) &&
    (pageWxml.match(/series-division-logo-mark/g) || []).length >= 2 &&
    pageWxml.indexOf('wx:for="{{participants.items}}"') >= 0 &&
    pageWxml.indexOf('item.colorMark.fallbackText') >= 0 &&
    pageWxml.indexOf("item.color ? 'hero-logo-stack__item--division'") >= 0
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

var redBlue = [division('red', '红队', '#CE9224'), division('blue', '蓝队', '#002D62')];
var teamRyder = seriesOf({
  templateId: 'ryder',
  seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE,
  scoringRule: seriesRyderCup.createRyderCupScoringRule(),
  participants: freeze(redBlue)
});
var teamRyderBefore = freeze(teamRyder);
var teamRyderList = viewModel.buildParticipantsView(teamRyder);
var teamRyderHero = viewModel.buildHeroParticipantDisplay(teamRyder);
assert(
  '队内显式莱德杯与分队比杆共用颜色圆 Logo',
  viewModel.shouldUseDivisionLogoMarks(teamRyder) === true &&
    teamRyderHero.mode === 'team_logos' &&
    teamRyderHero.label === '分队' &&
    teamRyderList.kindLabel === '参赛分队' &&
    teamRyderList.items.length === 2 &&
    teamRyderHero.teamItems.length === 2 &&
    teamRyderList.items[0].seriesParticipantId === teamRyderHero.teamItems[0].participantId &&
    teamRyderList.items[1].seriesParticipantId === teamRyderHero.teamItems[1].participantId &&
    teamRyderList.items[0].colorMark.color === teamRyderHero.teamItems[0].color &&
    teamRyderList.items[0].colorMark.fallbackText === teamRyderHero.teamItems[0].fallbackText &&
    teamRyderList.items[1].colorMark.fallbackText === '蓝' &&
    JSON.stringify(teamRyder.participants) === JSON.stringify(teamRyderBefore.participants) &&
    vmSrc.indexOf('function shouldUseDivisionLogoMarks') >= 0 &&
    (vmSrc.match(/shouldUseDivisionLogoMarks\(series\)/g) || []).length >= 2 &&
    pageWxml.indexOf('templateId') < 0 &&
    pageWxml.indexOf('ryder-division-logo') < 0 &&
    pageWxss.indexOf('ryder-division-logo') < 0
);

var templateOnly = seriesOf({
  templateId: 'ryder',
  participants: freeze(redBlue)
});
assert(
  '仅 templateId:ryder 不按莱德杯推断',
  viewModel.shouldUseDivisionLogoMarks(templateOnly) === false &&
    viewModel.buildHeroParticipantDisplay(templateOnly).mode === 'division_tags' &&
    !viewModel.buildParticipantsView(templateOnly).items[0].colorMark
);

var orgRyder = viewModel.buildParticipantsView({
  hostMode: 'organization',
  templateId: 'ryder',
  seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE,
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
var orgRyderHero = viewModel.buildHeroParticipantDisplay({
  hostMode: 'organization',
  templateId: 'ryder',
  seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE,
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
  '队际莱德杯继续显示球队 Logo',
  viewModel.shouldUseDivisionLogoMarks({
    hostMode: 'organization',
    templateId: 'ryder',
    seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE
  }) === false &&
    orgRyderHero.mode === 'team_logos' &&
    orgRyderHero.label === '球队' &&
    orgRyderHero.teamItems[0].logo === '/a.png' &&
    !orgRyderHero.teamItems[0].color &&
    !orgRyder.items[0].colorMark &&
    orgRyder.items[0].logo === '/a.png'
);

var dualGate = seriesOf({
  templateId: 'division_series',
  seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE,
  participants: freeze(redBlue)
});
var dualHero = viewModel.buildHeroParticipantDisplay(dualGate);
var dualList = viewModel.buildParticipantsView(dualGate);
assert(
  'division_series + ryder_cup 只投影一次',
  dualHero.teamItems.length === 2 &&
    dualList.items.length === 2 &&
    dualHero.divisionItems.length === 0 &&
    dualList.items.every(function (it) {
      return !!it.colorMark;
    })
);

var emptyRyder = viewModel.buildHeroParticipantDisplay(
  seriesOf({
    templateId: 'ryder',
    seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE,
    participants: []
  })
);
var emptyRyderList = viewModel.buildParticipantsView(
  seriesOf({
    templateId: 'ryder',
    seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE,
    participants: []
  })
);
assert(
  '空分队安全显示既有空态文案',
  emptyRyder.mode === 'team_logos' &&
    emptyRyder.emptyText === '待创建分队' &&
    emptyRyderList.items.length === 0 &&
    emptyRyderList.kindLabel === '参赛分队'
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exit(1);
}
process.exit(0);
