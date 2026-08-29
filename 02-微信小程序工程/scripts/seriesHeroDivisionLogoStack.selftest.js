/**
 * 队内多分队系列赛 Hero：复用队际圆形 Logo 栈，色块 + 首字符
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesHeroDivisionLogoStack.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var pageDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var createDir = path.join(mini, 'subpackages', 'create', 'pages', 'series');
var ordinaryDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');

var viewModel = require(path.join(pageDir, 'seriesDetailViewModel.js'));

var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var pageWxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');
var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var vmSrc = fs.readFileSync(path.join(pageDir, 'seriesDetailViewModel.js'), 'utf8');
var createWxml = fs.readFileSync(path.join(createDir, 'index.wxml'), 'utf8');
var ordinaryWxml = fs.readFileSync(path.join(ordinaryDir, 'index.wxml'), 'utf8');

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

function seriesOf(overrides) {
  var s = {
    seriesId: 's-div',
    publishToken: 'tok',
    lifecycleStatus: 'published',
    publishState: 'published',
    competitionPhaseCache: 'scheduled',
    hostMode: 'team',
    templateId: 'division_series',
    seriesName: '湘鹰分队系列赛',
    seriesSubtitle: '',
    hostTeam: { teamId: 'h1', teamName: '湘鹰队', teamLogo: '/host.png' },
    organization: {},
    participants: [],
    rounds: [
      {
        roundId: 'r1',
        index: 1,
        dateTime: '2026-08-11 08:00',
        courseId: 'c1',
        courseName: '东球场',
        front9Course: 'A',
        back9Course: 'B',
        gameMode: '个人比杆赛'
      }
    ]
  };
  Object.keys(overrides || {}).forEach(function (k) {
    s[k] = overrides[k];
  });
  return s;
}

function division(id, name, color, extra) {
  return Object.assign(
    {
      seriesParticipantId: 'div:' + id,
      divisionId: id,
      kind: 'division',
      nameSnapshot: name,
      colorSnapshot: color,
      logoSnapshot: '/should-not-use-' + id + '.png'
    },
    extra || {}
  );
}

assert(
  '中文、英文、小写英文、空白名称和 emoji 的首字符',
  viewModel.firstDisplayGrapheme('先锋队', '未命名分队') === '先' &&
    viewModel.firstDisplayGrapheme('Eagle', '未命名分队') === 'E' &&
    viewModel.firstDisplayGrapheme('alpha', '未命名分队') === 'A' &&
    viewModel.firstDisplayGrapheme('  bravo  ', '未命名分队') === 'B' &&
    viewModel.firstDisplayGrapheme('   ', '未命名分队') === '未' &&
    viewModel.firstDisplayGrapheme('', '未命名分队') === '未' &&
    viewModel.firstDisplayGrapheme(null, '未命名分队') === '未' &&
    viewModel.firstDisplayGrapheme('😀先锋', '未命名分队') === '😀' &&
    viewModel.takeFirstGrapheme('👨‍👩‍👧‍👦队') === '👨‍👩‍👧‍👦' &&
    viewModel.firstDisplayGrapheme('undefined', '未命名分队') !== 'undefined' &&
    String(viewModel.firstDisplayGrapheme('', '未命名分队')).indexOf('undefined') < 0
);

var ordered = seriesOf({
  participants: [
    division('d1', '先锋队', '#112233'),
    division('d2', '荣耀队', '#aabbcc'),
    division('d3', 'alpha', '#00aeef'),
    division('d4', '  ', '#ef4444')
  ]
});
var before = freeze(ordered);
var disp = viewModel.buildHeroParticipantDisplay(ordered);
assert(
  '多个分队按原顺序显示',
  disp.mode === 'team_logos' &&
    disp.label === '分队' &&
    disp.teamItems.length === 4 &&
    disp.teamItems[0].participantId === 'div:d1' &&
    disp.teamItems[1].participantId === 'div:d2' &&
    disp.teamItems[2].participantId === 'div:d3' &&
    disp.teamItems[3].participantId === 'div:d4' &&
    disp.teamItems[0].fallbackText === '先' &&
    disp.teamItems[1].fallbackText === '荣' &&
    disp.teamItems[2].fallbackText === 'A' &&
    disp.teamItems[3].fallbackText === '未' &&
    disp.divisionItems.length === 0
);
assert(
  '圆形颜色正确且不使用 logoSnapshot',
  disp.teamItems[0].color === '#112233' &&
    disp.teamItems[1].color === '#aabbcc' &&
    disp.teamItems[2].color === '#00aeef' &&
    disp.teamItems[3].color === '#ef4444' &&
    disp.teamItems.every(function (it) {
      return it.logo === '';
    })
);
assert(
  '不修改分队数据结构',
  JSON.stringify(ordered.participants) === JSON.stringify(before.participants)
);

var stack = viewModel.buildHeroTeamLogoStackState({
  mode: disp.mode,
  emptyText: disp.emptyText,
  teamItems: disp.teamItems,
  containerWidth: 200,
  logoDiameter: 28,
  normalGap: 12
});
assert(
  '复用队际栈投影含色块背景',
  stack.visible === true &&
    stack.items.length === 4 &&
    stack.items[0].backgroundStyle === 'background:#112233;' &&
    stack.items[0].fallbackText === '先' &&
    stack.items[2].fallbackText === 'A'
);

var emptyDisp = viewModel.buildHeroParticipantDisplay(seriesOf({ participants: [] }));
assert(
  '无分队时空文案仍为待创建分队',
  emptyDisp.mode === 'team_logos' &&
    emptyDisp.emptyText === '待创建分队' &&
    emptyDisp.teamItems.length === 0
);

var plainTeam = viewModel.buildHeroParticipantDisplay(
  seriesOf({
    templateId: 'individual_tour',
    participants: [division('x', '红队', '#111111'), division('y', '蓝队', '#222222')]
  })
);
assert(
  '普通队内系列赛不进入该投影',
  plainTeam.mode === 'division_tags' &&
    plainTeam.teamItems.length === 0 &&
    plainTeam.divisionItems.length === 2 &&
    plainTeam.divisionItems[0].name === '红队'
);

var orgTeams = viewModel.buildHeroParticipantDisplay({
  hostMode: 'organization',
  templateId: 'inter_team_series',
  participants: [
    {
      seriesParticipantId: 't1',
      kind: 'team',
      fullNameSnapshot: '甲队',
      logoSnapshot: '/a.png'
    },
    {
      seriesParticipantId: 't2',
      kind: 'team',
      fullNameSnapshot: '丙组',
      logoSnapshot: ''
    }
  ]
});
assert(
  '队际系列赛 Hero 回归不退化',
  orgTeams.mode === 'team_logos' &&
    orgTeams.label === '球队' &&
    orgTeams.teamItems.length === 2 &&
    orgTeams.teamItems[0].logo === '/a.png' &&
    orgTeams.teamItems[1].fallbackText === '丙' &&
    !orgTeams.teamItems[0].color
);

var vm = viewModel.buildSeriesDetailViewModel(ordered, {
  getMatchById: function () {
    return null;
  },
  getIndexByMatchId: function () {
    return null;
  }
});
assert(
  'Hero 标题、日期、场地仍投影',
  vm.ok &&
    vm.hero.titleMain === '湘鹰分队系列赛' &&
    !!vm.hero.dateText &&
    (vm.hero.infoRows || [])
      .map(function (r) {
        return r.label + ':' + r.kind;
      })
      .join('|') === '主办:text|分队:team_logos|球场:courses' &&
    (vm.hero.infoRows || []).some(function (r) {
      return r.kind === 'courses' && (r.courseLines || []).length > 0;
    })
);

assert(
  '不再输出旧标签结构或标签样式类（多分队走 Logo 栈）',
  pageWxml.indexOf('hero-logo-stack') >= 0 &&
    pageWxml.indexOf('{{item.backgroundStyle}}') >= 0 &&
    pageWxml.indexOf('hero-logo-stack__fallback') >= 0 &&
    vmSrc.indexOf('shouldUseDivisionLogoMarks') >= 0 &&
    vmSrc.indexOf('isDivisionSeriesHero') < 0 &&
    vmSrc.indexOf('firstDisplayGrapheme') >= 0 &&
    pageWxml.indexOf('hero-division-swatch') < 0 &&
    createWxml.indexOf('hero-logo-stack') < 0
);

assert(
  '未复制一套独立分队 Hero 样式',
  (pageWxml.match(/class="hero-logo-stack"/g) || []).length === 1 &&
    pageWxss.indexOf('.hero-logo-stack__fallback') >= 0 &&
    pageWxss.indexOf('.hero-division-logo') < 0 &&
    pageJs.indexOf('_layoutHeroTeamLogoStack') >= 0 &&
    ordinaryWxml.indexOf('hero-logo-stack') < 0
);

var layoutA = viewModel.resolveTeamLogoLayout({
  containerWidth: 80,
  logoDiameter: 28,
  normalGap: 12,
  count: 8
});
var layoutB = viewModel.resolveTeamLogoLayout({
  containerWidth: 80,
  logoDiameter: 28,
  normalGap: 12,
  count: 8
});
assert(
  '多分队沿用队际折叠布局（不长高）',
  layoutA.mode === 'collapsed' &&
    layoutA.groupWidth === layoutB.groupWidth &&
    layoutA.groupWidth <= 80 &&
    pageWxss.indexOf('.hero-logo-stack') >= 0 &&
    /flex-wrap:\s*nowrap/.test(
      (pageWxss.match(/\.hero-division-tags\s*\{[^}]*\}/) || [''])[0]
    )
);

var seriesRyderCup = require(path.join(mini, 'utils', 'seriesRyderCup.js'));
var ryderDivisions = [
  division('red', '红队', '#CE9224'),
  division('blue', '蓝队', '#002D62')
];
var teamRyderHero = viewModel.buildHeroParticipantDisplay(
  seriesOf({
    templateId: 'ryder',
    seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE,
    scoringRule: seriesRyderCup.createRyderCupScoringRule(),
    participants: ryderDivisions
  })
);
assert(
  '队内显式莱德杯 Hero 走分队颜色圆 Logo 栈',
  teamRyderHero.mode === 'team_logos' &&
    teamRyderHero.label === '分队' &&
    teamRyderHero.teamItems.length === 2 &&
    teamRyderHero.teamItems[0].color === '#CE9224' &&
    teamRyderHero.teamItems[1].fallbackText === '蓝' &&
    teamRyderHero.divisionItems.length === 0 &&
    pageWxml.indexOf('series-division-logo-mark') >= 0 &&
    pageWxml.indexOf('ryder-division-logo') < 0
);

assert(
  '仅 templateId:ryder 的队内 Series 不进入颜色圆栈',
  viewModel.buildHeroParticipantDisplay(
    seriesOf({
      templateId: 'ryder',
      participants: ryderDivisions
    })
  ).mode === 'division_tags'
);

var orgRyderHero = viewModel.buildHeroParticipantDisplay({
  hostMode: 'organization',
  templateId: 'ryder',
  seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE,
  participants: [
    {
      seriesParticipantId: 't1',
      kind: 'team',
      fullNameSnapshot: '甲队',
      logoSnapshot: '/a.png'
    },
    {
      seriesParticipantId: 't2',
      kind: 'team',
      fullNameSnapshot: '乙队',
      logoSnapshot: '/b.png'
    }
  ]
});
assert(
  '队际莱德杯 Hero 仍是两支球队 Logo',
  orgRyderHero.mode === 'team_logos' &&
    orgRyderHero.label === '球队' &&
    orgRyderHero.teamItems[0].logo === '/a.png' &&
    orgRyderHero.teamItems[1].logo === '/b.png' &&
    !orgRyderHero.teamItems[0].color
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exit(1);
}
process.exit(0);
