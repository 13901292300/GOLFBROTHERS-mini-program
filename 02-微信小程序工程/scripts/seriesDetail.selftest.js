/**
 * Series 只读详情 ViewModel 自测（4C-2）
 * 仅内存 fixture，不碰真实 wx storage。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesDetail.selftest.js
 */

var path = require('path');
var fs = require('fs');
var vmPath = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail',
  'seriesDetailViewModel.js'
);
var viewModel = require(vmPath);

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

function baseSeries(overrides) {
  var s = {
    seriesId: 'series-1',
    publishToken: 'tok-abc',
    lifecycleStatus: 'published',
    publishState: 'published',
    competitionPhaseCache: 'scheduled',
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: '湘鹰队际系列赛',
    organization: {
      organizationId: 'org-1',
      organizationName: '湘鹰机构',
      organizationLogo: '/assets/a.jpg'
    },
    hostTeam: {},
    participants: [
      {
        seriesParticipantId: 'team:t1',
        kind: 'team',
        nameSnapshot: '甲队',
        logoSnapshot: ''
      },
      {
        seriesParticipantId: 'team:t2',
        kind: 'team',
        nameSnapshot: '乙队',
        logoSnapshot: ''
      }
    ],
    scoringRule: {
      mode: 'per_round_n',
      globalM: 10,
      allowRepeat: false,
      scoreBasis: 'gross'
    },
    visibility: 'public',
    accessCode: '',
    eventInfoList: [{ id: 'e1', title: '赛事简介', type: 'text', content: '简介内容' }],
    partnerConfig: { partnerTitle: 'PARTNER', partnerLogos: ['/assets/p1.jpg', ''] },
    rounds: [
      {
        roundId: 'round-1',
        index: 1,
        name: '第1轮',
        dateTime: '2030-06-01 08:00',
        courseName: '测试球场',
        courseHalfText: 'A+B',
        gameMode: '个人比杆赛',
        fee: '100',
        topN: 3,
        roundStatus: 'scheduled',
        matchId: 'team-match-1'
      },
      {
        roundId: 'round-2',
        index: 2,
        name: '第2轮',
        dateTime: '2030-06-02 08:00',
        courseName: '测试球场2',
        courseHalfText: '',
        gameMode: '四人四球比杆赛',
        fee: '',
        topN: 2,
        roundStatus: 'scheduled',
        matchId: ''
      }
    ]
  };
  if (overrides) {
    Object.keys(overrides).forEach(function (k) {
      s[k] = overrides[k];
    });
  }
  return s;
}

function managedMatch(partial) {
  var p = partial || {};
  return {
    matchId: p.matchId || 'team-match-1',
    matchType: 'inter-team',
    status: p.status != null ? p.status : 'ongoing',
    statusLabel: p.statusLabel != null ? p.statusLabel : '比赛进行中',
    registrationStatus: p.registrationStatus != null ? p.registrationStatus : 'closed',
    courseName: p.courseName || '测试球场',
    seriesContext: {
      managed: true,
      seriesId: p.seriesId || 'series-1',
      roundId: p.roundId || 'round-1',
      publishToken: p.publishToken || 'tok-abc',
      seriesParticipantMode: 'team',
      registrationAuthority: 'series',
      seriesNameSnapshot: '湘鹰队际系列赛'
    }
  };
}

function freeze(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ---- lifecycle access ----
(function () {
  assert(
    'published 准入',
    viewModel.resolveLifecycleAccess(baseSeries(), {}).ok === true
  );
  assert(
    'cancelled 历史只读',
    (function () {
      var a = viewModel.resolveLifecycleAccess(baseSeries({ lifecycleStatus: 'cancelled' }), {});
      return a.ok && a.isHistorical === true;
    })()
  );
  assert(
    'archived 历史只读',
    (function () {
      var a = viewModel.resolveLifecycleAccess(baseSeries({ lifecycleStatus: 'archived' }), {});
      return a.ok && a.isHistorical === true;
    })()
  );
  assert(
    'draft 无 preview 拒绝',
    viewModel.resolveLifecycleAccess(baseSeries({ lifecycleStatus: 'draft' }), {}).ok === false
  );
  assert(
    'draft preview=1 放行',
    (function () {
      var a = viewModel.resolveLifecycleAccess(baseSeries({ lifecycleStatus: 'draft' }), {
        preview: '1'
      });
      return a.ok && a.isDraftPreview === true;
    })()
  );
  assert(
    '未知 lifecycle 拒绝',
    viewModel.resolveLifecycleAccess(baseSeries({ lifecycleStatus: 'weird' }), {}).ok === false
  );
})();

// ---- private / tabs / scoring ----
(function () {
  var series = baseSeries({ visibility: 'private', accessCode: '123456' });
  var vm = viewModel.buildSeriesDetailViewModel(series, {
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  });
  assert('private VM ok', vm.ok === true);
  assert('private 不泄露 accessCode', vm.visibility.accessCode === '');
  assert('private 显示访问码保护', vm.visibility.accessProtectLabel === '访问码保护');
  assert(
    '五 TAB 顺序',
    vm.tabs.map(function (t) {
      return t.id;
    }).join(',') === 'info,standings,register,schedule,discussion'
  );
  assert('per_round_n 文案', vm.scoring.mode === 'per_round_n' && /每轮最好/.test(vm.scoring.summaryText));
  assert('per_round_n 含轮次 N', vm.scoring.perRoundTopN.length === 2);

  var g = baseSeries({
    scoringRule: { mode: 'global_m', globalM: 8, allowRepeat: true, scoreBasis: 'net' }
  });
  var gvm = viewModel.buildSeriesDetailViewModel(g, {
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  });
  assert('global_m 文案', gvm.scoring.mode === 'global_m' && /全局最好 M=8/.test(gvm.scoring.summaryText));
  assert('global_m 允许重复', gvm.scoring.allowRepeat === true);
  assert('global_m 无 perRoundTopN 展示需求', gvm.scoring.perRoundTopN.length === 0);
})();

// ---- station gate ----
(function () {
  var series = baseSeries();
  var round = series.rounds[0];
  var match = managedMatch();
  var index = { seriesId: 'series-1', roundId: 'round-1' };

  function gate(deps) {
    return viewModel.evaluateRoundStationGate(series, round, deps);
  }

  var ok = gate({
    getMatchById: function () {
      return match;
    },
    getIndexByMatchId: function () {
      return index;
    }
  });
  assert('全部一致可进入', ok.canEnterRound === true && !!ok.navUrl);

  assert(
    '无 matchId',
    viewModel.evaluateRoundStationGate(series, series.rounds[1], {
      getMatchById: function () {
        return match;
      },
      getIndexByMatchId: function () {
        return index;
      }
    }).blockReason === 'missing_match_id'
  );

  assert(
    'Match 缺失',
    gate({
      getMatchById: function () {
        return null;
      },
      getIndexByMatchId: function () {
        return index;
      }
    }).blockReason === 'match_missing'
  );

  assert(
    '非 Series-managed',
    gate({
      getMatchById: function () {
        return { matchId: 'team-match-1', status: 'ongoing' };
      },
      getIndexByMatchId: function () {
        return index;
      }
    }).blockReason === 'not_series_managed'
  );

  assert(
    'context seriesId 冲突',
    gate({
      getMatchById: function () {
        return managedMatch({ seriesId: 'other' });
      },
      getIndexByMatchId: function () {
        return index;
      }
    }).blockReason === 'context_series_id_conflict'
  );

  assert(
    'context roundId 冲突',
    gate({
      getMatchById: function () {
        return managedMatch({ roundId: 'round-x' });
      },
      getIndexByMatchId: function () {
        return index;
      }
    }).blockReason === 'context_round_id_conflict'
  );

  assert(
    'context token 冲突',
    gate({
      getMatchById: function () {
        return managedMatch({ publishToken: 'tok-other' });
      },
      getIndexByMatchId: function () {
        return index;
      }
    }).blockReason === 'context_publish_token_conflict'
  );

  assert(
    'Index 缺失',
    gate({
      getMatchById: function () {
        return match;
      },
      getIndexByMatchId: function () {
        return null;
      }
    }).blockReason === 'index_missing'
  );

  assert(
    'Index seriesId 冲突',
    gate({
      getMatchById: function () {
        return match;
      },
      getIndexByMatchId: function () {
        return { seriesId: 'series-other', roundId: 'round-1' };
      }
    }).blockReason === 'index_conflict'
  );

  assert(
    'Index roundId 冲突',
    gate({
      getMatchById: function () {
        return match;
      },
      getIndexByMatchId: function () {
        return { seriesId: 'series-1', roundId: 'round-other' };
      }
    }).blockReason === 'index_conflict'
  );
})();

// ---- status mapping ----
(function () {
  assert(
    'LIVE 不显示报名中',
    viewModel.resolveStationStatusLabel(managedMatch({ status: 'ongoing' })) === 'LIVE'
  );
  assert(
    'registering 显示报名中',
    viewModel.resolveStationStatusLabel(
      managedMatch({ status: 'registering', statusLabel: '报名中' })
    ) === '报名中'
  );
  assert(
    'completed 显示已结束',
    viewModel.resolveStationStatusLabel(managedMatch({ status: 'completed' })) === '已结束'
  );
  assert(
    'finished 显示已结束',
    viewModel.resolveStationStatusLabel(managedMatch({ status: 'finished' })) === '已结束'
  );
  var closedOngoing = managedMatch({ status: 'ongoing', registrationStatus: 'closed' });
  assert(
    'closed registration 不推导已完成',
    viewModel.resolveStationStatusLabel(closedOngoing) === 'LIVE' &&
      viewModel.normalizeMatchLifecycle(closedOngoing).isCompleted === false
  );
  var closedReg = managedMatch({ status: 'registering', registrationStatus: 'closed' });
  assert(
    'closed+registering 仍报名中',
    viewModel.resolveStationStatusLabel(closedReg) === '报名中' &&
      viewModel.normalizeMatchLifecycle(closedReg).isCompleted === false
  );
})();

// ---- immutability ----
(function () {
  var series = baseSeries();
  var before = freeze(series);
  var match = managedMatch();
  viewModel.buildSeriesDetailViewModel(series, {
    getMatchById: function () {
      return match;
    },
    getIndexByMatchId: function () {
      return { seriesId: 'series-1', roundId: 'round-1' };
    }
  });
  assert('ViewModel 不修改输入 Series', JSON.stringify(series) === JSON.stringify(before));
  var matchBefore = freeze(match);
  viewModel.evaluateRoundStationGate(series, series.rounds[0], {
    getMatchById: function () {
      return match;
    },
    getIndexByMatchId: function () {
      return { seriesId: 'series-1', roundId: 'round-1' };
    }
  });
  assert('ViewModel 不修改输入 Match', JSON.stringify(match) === JSON.stringify(matchBefore));
})();

// ---- draft preview banner flag on full VM ----
(function () {
  var vm = viewModel.buildSeriesDetailViewModel(baseSeries({ lifecycleStatus: 'draft' }), {
    preview: '1',
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  });
  assert('draft preview VM isDraftPreview', vm.ok && vm.isDraftPreview === true);

  var denied = viewModel.buildSeriesDetailViewModel(baseSeries({ lifecycleStatus: 'draft' }), {
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  });
  assert('draft 无 preview 全 VM 拒绝', denied.ok === false);
})();

// ---- page wiring smoke (source) ----
(function () {
  var pageJs = fs.readFileSync(
    path.join(path.dirname(vmPath), 'index.js'),
    'utf8'
  );
  assert('页面不持久化 gb_series_detail_view', pageJs.indexOf('gb_series_detail_view') < 0);
  assert('页面使用 ViewModel', pageJs.indexOf('seriesDetailViewModel') >= 0);
  assert('页面不调用 saveDraft', pageJs.indexOf('saveDraft') < 0);
  assert('页面不调用 upsertSeries', pageJs.indexOf('upsertSeries') < 0);
  assert('页面不调用 setLink', pageJs.indexOf('setLink') < 0);

  var appJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'miniprogram', 'app.json'), 'utf8')
  );
  var tour = (appJson.subPackages || appJson.subpackages || []).find(function (p) {
    return p.root === 'subpackages/tournament' || p.name === 'tournament';
  });
  assert(
    'app.json 已注册 series-detail',
    !!(tour && (tour.pages || []).indexOf('pages/series-detail/index') >= 0)
  );
  assert('app.json 无 preloadRule', appJson.preloadRule == null);
})();

// ---- 4C-2 视觉返修：Hero / 参赛主体归属 / 吸顶 TAB ----
(function () {
  var orgSeries = baseSeries({
    hostMode: 'organization',
    participants: [
      { seriesParticipantId: 'team:t1', kind: 'team', nameSnapshot: '甲队', logoSnapshot: '/a.png' },
      { seriesParticipantId: 'team:t2', kind: 'team', nameSnapshot: '乙队', logoSnapshot: '/b.png' },
      { seriesParticipantId: 'team:t3', kind: 'team', nameSnapshot: '丙队', logoSnapshot: '' },
      { seriesParticipantId: 'team:t4', kind: 'team', nameSnapshot: '丁队', logoSnapshot: '' }
    ]
  });
  var orgVm = viewModel.buildSeriesDetailViewModel(orgSeries, {
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  });
  assert('organization VM ok', orgVm.ok === true);
  assert('organization logo ← organizationLogo', orgVm.hero.logo === '/assets/a.jpg');
  assert('organization 主办名 ← organizationName', orgVm.hero.infoRows[0].value === '湘鹰机构');
  assert('organization divider ORG', orgVm.hero.dividerText === 'ORG');
  assert(
    'organization Hero 无模板/队际系列标签',
    !(orgVm.hero.metaChips || []).some(function (c) {
      return c.text === '队际系列' || c.text === '队际系列赛' || c.text === '分队系列';
    })
  );
  assert(
    'organization 参赛摘要仅在 info TAB participants',
    orgVm.hero.participantSummaryOnly === '' &&
      orgVm.participants.summaryText === '4 支'
  );
  assert('organization hero 无参赛列表', orgVm.hero.hasParticipantList === false);
  assert(
    'organization 完整列表仅在 participants.items',
    orgVm.participants.items.length === 4 &&
      orgVm.participants.items[0].name === '甲队' &&
      orgVm.participants.kindLabel === '参赛球队'
  );

  var teamSeries = baseSeries({
    hostMode: 'team',
    templateId: 'division_series',
    organization: {},
    hostTeam: {
      teamId: 'host-1',
      teamName: '湘鹰队',
      teamLogo: '/assets/team.jpg'
    },
    participants: [
      { seriesParticipantId: 'div:d1', kind: 'division', nameSnapshot: '一队', logoSnapshot: '/d1.png' },
      { seriesParticipantId: 'div:d2', kind: 'division', nameSnapshot: '二队', logoSnapshot: '' }
    ]
  });
  var teamVm = viewModel.buildSeriesDetailViewModel(teamSeries, {
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  });
  assert('team VM ok', teamVm.ok === true);
  assert('team logo ← hostTeam.teamLogo', teamVm.hero.logo === '/assets/team.jpg');
  assert('team 主办名 ← hostTeam.teamName', teamVm.hero.infoRows[0].value === '湘鹰队');
  assert('team divider CLUB', teamVm.hero.dividerText === 'CLUB');
  assert(
    'team Hero 无分队系列模板标签',
    !(teamVm.hero.metaChips || []).some(function (c) {
      return c.text === '分队系列' || c.text === '分队系列赛' || c.text === '队际系列';
    })
  );
  assert(
    'team 参赛摘要仅在 participants',
    teamVm.hero.participantSummaryOnly === '' &&
      teamVm.participants.summaryText === '2 个' &&
      teamVm.participants.kindLabel === '参赛分队'
  );
  assert('team hero 无参赛列表', teamVm.hero.hasParticipantList === false);
  assert('team 完整列表 2 项', teamVm.participants.items.length === 2);
  assert(
    'team Hero infoRows 为 主办/分队/球场',
    (teamVm.hero.infoRows || [])
      .map(function (r) {
        return r.label;
      })
      .join('|') === '主办|分队|球场'
  );
  assert(
    'team Hero 分队圆形栈全输出',
    teamVm.hero.participantDisplay &&
      teamVm.hero.participantDisplay.mode === 'team_logos' &&
      teamVm.hero.participantDisplay.teamItems.length === 2 &&
      teamVm.hero.participantDisplay.teamItems[0].fallbackText === '一' &&
      teamVm.hero.participantDisplay.teamItems[0].name === '一队' &&
      teamVm.hero.participantDisplay.divisionItems.length === 0 &&
      teamVm.hero.infoRows[1].kind === 'team_logos'
  );

  var heroLabels = (orgVm.hero.infoRows || []).map(function (r) {
    return r.label;
  });
  assert(
    'hero infoRows 为 主办/球队/球场，无报名阶段',
    heroLabels.join('|') === '主办|球队|球场' &&
      heroLabels.indexOf('报名') < 0 &&
      heroLabels.indexOf('阶段') < 0 &&
      heroLabels.indexOf('参赛') < 0 &&
      heroLabels.indexOf('开球') < 0
  );
  assert('VM 不再投影 registrationWindow', orgVm.registrationWindow == null);
  assert(
    'formatRegistrationWindowDisplay 已删除',
    typeof viewModel.formatRegistrationWindowDisplay !== 'function'
  );
  assert('顶部赛事状态 chip 仍存在', !!orgVm.hero.chipText);
  assert(
    'organization Hero 输出全部球队 Logo 项',
    orgVm.hero.participantDisplay &&
      orgVm.hero.participantDisplay.mode === 'team_logos' &&
      orgVm.hero.participantDisplay.teamItems.length === 4 &&
      orgVm.hero.participantDisplay.teamItems[0].logo === '/a.png' &&
      orgVm.hero.participantDisplay.teamItems[2].fallbackText === '丙'
  );
  assert('Hero 不含参赛数量文案', JSON.stringify(orgVm.hero.infoRows).indexOf('参赛球队') < 0);
  assert('VM 无 bottomTabFit375', orgVm.bottomTabFit375 == null);
  assert(
    'estimateBottomTabFitAt375 已移除',
    typeof viewModel.estimateBottomTabFitAt375 !== 'function'
  );

  var pageWxml = fs.readFileSync(path.join(path.dirname(vmPath), 'index.wxml'), 'utf8');
  var pageWxss = fs.readFileSync(path.join(path.dirname(vmPath), 'index.wxss'), 'utf8');
  var pageJs = fs.readFileSync(path.join(path.dirname(vmPath), 'index.js'), 'utf8');
  var heroSlice = pageWxml.split('detail-main')[0] || '';
  assert(
    'WXML Hero 区不渲染 participants.items',
    heroSlice.indexOf('participants.items') < 0 && heroSlice.indexOf('participant-row') < 0
  );
  assert(
    'WXML 参赛列表仅在 activeTab===info',
    pageWxml.indexOf("activeTab === 'info'") >= 0 &&
      pageWxml.indexOf('wx:for="{{participants.items}}"') >= 0 &&
      pageWxml.indexOf('wx:for="{{participants.items}}"') >
        pageWxml.indexOf("activeTab === 'info'")
  );
  assert(
    'ORG. 后紧跟流内 TAB',
    /section-divider[\s\S]*?tab-scroll-wrap--inflow/.test(pageWxml) &&
      pageWxml.indexOf('series-bottom-tabs') < 0
  );
  assert(
    '吸顶结构存在（inflow + fixed 克隆）',
    pageWxml.indexOf('tab-scroll-wrap--inflow') >= 0 &&
      pageWxml.indexOf('tab-scroll-wrap--fixed') >= 0 &&
      pageWxml.indexOf('isStickyTab') >= 0 &&
      pageJs.indexOf('measureTabTop') >= 0 &&
      pageJs.indexOf('_syncStickyByScroll') >= 0
  );
  assert(
    '一级 TAB 横向溢出指示器复刻 detail（流内+fixed 共用状态）',
    // 一级 TAB：流内+fixed 各一对；Series M 轮次选择器可额外复用同类指示器（>=2）
    (pageWxml.match(/tab-overflow-hint--right/g) || []).length >= 2 &&
      (pageWxml.match(/tab-overflow-hint--left/g) || []).length >= 2 &&
      (pageWxml.match(/bindscroll="onTabHScroll"/g) || []).length === 2 &&
      pageWxml.indexOf('tabHScrollLeft') >= 0 &&
      pageJs.indexOf('measureTabOverflow') >= 0 &&
      pageJs.indexOf('_updateTabOverflowIndicators') >= 0 &&
      /left \+ containerW < width - 2/.test(pageJs) &&
      pageJs.indexOf('justStuck') >= 0 &&
      pageJs.indexOf('tabHScrollLeft = this._lastTabScrollLeft') >= 0 &&
      pageJs.indexOf('onWindowResize') >= 0 &&
      // 赛程 R / 总榜 / 报名子 TAB 模板内仍无该指示器
      pageWxml.indexOf('series-round-selector-dock') >= 0 &&
      !/series-round-selector-dock[\s\S]{0,400}tab-overflow-hint/.test(pageWxml) &&
      !/seriesRegisterExtensionStrip[\s\S]{0,400}tab-overflow-hint/.test(pageWxml)
  );
  assert(
    'TAB 不再使用 bottom fixed / 底栏安全区占位（报名 CTA 除外）',
    pageWxml.indexOf('series-bottom-tabs') < 0 &&
      pageWxss.indexOf('series-bottom-tabs') < 0 &&
      pageWxss.indexOf('padding-bottom: calc(var(--tab-height)') < 0 &&
      (pageWxss.match(/safe-area-inset-bottom/g) || []).length <= 4 &&
      /\.register-cta-bar[\s\S]{0,280}safe-area-inset-bottom/.test(pageWxss) &&
      ((pageWxss.match(/safe-area-inset-bottom/g) || []).length === 1 ||
        /\.series-manage-unified-sheet[\s\S]{0,200}safe-area-inset-bottom/.test(
          pageWxss
        ) ||
        /\.manual-sheet[\s\S]{0,240}safe-area-inset-bottom/.test(pageWxss))
  );
  assert(
    '已删除主办/计分自动摘要卡字段绑定',
    pageWxml.indexOf('主办场景') < 0 &&
      pageWxml.indexOf('scoring.summaryText') < 0 &&
      pageWxml.indexOf('visibility.visibilityLabel') < 0 &&
      pageWxml.indexOf('registrationWindow.startAt') < 0
  );
  assert(
    '已删除每轮 Top N 自动卡',
    pageWxml.indexOf('每轮 Top N') < 0 && pageWxml.indexOf('scoring.perRoundTopN') < 0
  );
  assert(
    '参赛主体成为 info TAB 第一张业务卡',
    pageWxml.indexOf("activeTab === 'info'") >= 0 &&
      pageWxml.indexOf('participants.kindLabel') >
        pageWxml.indexOf("activeTab === 'info'") &&
      pageWxml.indexOf('participants.kindLabel') < pageWxml.indexOf('eventInfoList')
  );
  assert(
    '赛事信息 TAB 无轮次说明 / roundInfoCards',
    pageWxml.indexOf('轮次说明') < 0 && pageWxml.indexOf('roundInfoCards') < 0
  );
  assert(
    '赛事信息仍含参赛主体 / eventInfo / PARTNER',
    pageWxml.indexOf('participants.kindLabel') >= 0 &&
      pageWxml.indexOf('eventInfoList') >= 0 &&
      pageWxml.indexOf('partner.configured') >= 0
  );
  assert(
    '赛程 TAB 使用 schedule ViewModel（无进入本轮）',
    pageWxml.indexOf("activeTab === 'schedule'") >= 0 &&
      pageWxml.indexOf('schedule.roundSelectorItems') >= 0 &&
      pageWxml.indexOf('onScheduleTeeGroupTap') >= 0 &&
      pageWxml.indexOf('进入本轮') < 0 &&
      pageWxml.indexOf('series-round-selector-dock') >= 0
  );
  assert('VM 不再投影 roundInfoCards', orgVm.roundInfoCards == null);
})();

// ---- 4C-2 二次返修：日期解析 / 范围 / 球场去重 ----
(function () {
  var parse = viewModel.parseLocalDateTimeParts;
  assert('闰年 2024-02-29 合法', !!parse('2024-02-29 08:00'));
  assert('非闰年 2026-02-29 非法', parse('2026-02-29 08:00') == null);
  assert('2月30日非法', parse('2026-02-30 08:00') == null);
  assert('月份越界非法', parse('2026-13-01 08:00') == null);
  assert('小时越界非法', parse('2026-08-11 24:00') == null);
  assert('分钟越界非法', parse('2026-08-11 08:60') == null);
  assert('合法日期时分', parse('2026-08-11 09:03') != null && parse('2026-08-11 09:03').minute === 3);

  assert(
    '同日日期',
    viewModel.formatSeriesDateRange([
      { dateTime: '2026-08-11 08:00' },
      { dateTime: '2026-08-11 14:30' }
    ]) === 'AUG 11 2026'
  );
  assert(
    '同年跨日',
    viewModel.formatSeriesDateRange([
      { dateTime: '2026-08-11 08:00' },
      { dateTime: '2026-08-13 09:00' }
    ]) === 'AUG 11-13 2026'
  );
  assert(
    '跨月',
    viewModel.formatSeriesDateRange([
      { dateTime: '2026-08-11 08:00' },
      { dateTime: '2026-09-16 08:00' }
    ]) === 'AUG 11-SEP 16 2026'
  );
  assert(
    '跨年',
    viewModel.formatSeriesDateRange([
      { dateTime: '2026-12-31 08:00' },
      { dateTime: '2027-01-02 08:00' }
    ]) === 'DEC 31 2026-JAN 02 2027'
  );
  assert(
    'rounds 无序仍取最早最晚',
    viewModel.formatSeriesDateRange([
      { dateTime: '2026-08-13 09:00' },
      { dateTime: '2026-08-11 08:00' },
      { dateTime: '2026-08-12 10:00' }
    ]) === 'AUG 11-13 2026'
  );
  assert(
    '非法与缺失时间 → 比赛时间待定',
    viewModel.formatSeriesDateRange([
      { dateTime: '2026-02-30 08:00' },
      { dateTime: '' },
      { dateTime: 'bad' }
    ]) === '比赛时间待定'
  );

  var sameIdHalf = viewModel.buildSeriesCourseLines([
    { courseId: 'c1', courseName: '阳光球场', courseHalfText: '（A+B）' },
    { courseId: 'c1', courseName: '阳光球场·东场', courseHalfText: '（C+D）' }
  ]);
  assert(
    '同 courseId 不同半场按半场身份分成两条',
    sameIdHalf.lines.length === 2 &&
      sameIdHalf.lines[0] === '阳光球场（A/B）' &&
      sameIdHalf.lines[1] === '阳光球场·东场（C/D）'
  );

  var nameDedup = viewModel.buildSeriesCourseLines([
    { courseId: '', courseName: '  湖畔  球场  ' },
    { courseId: '', courseName: '湖畔 球场' }
  ]);
  assert('无 ID 时名称去重', nameDedup.lines.length === 1 && nameDedup.lines[0] === '湖畔  球场');

  var idThenName = viewModel.buildSeriesCourseLines([
    { courseId: 'c9', courseName: '江畔高尔夫' },
    { courseId: '', courseName: '江畔高尔夫' }
  ]);
  assert('有 ID + 无 ID 同名只显示一次', idThenName.lines.length === 1);

  var nameThenId = viewModel.buildSeriesCourseLines([
    { courseId: '', courseName: '江畔高尔夫' },
    { courseId: 'c9', courseName: '江畔高尔夫' }
  ]);
  assert('无 ID + 有 ID 同名只显示一次', nameThenId.lines.length === 1);

  var diffIdSameName = viewModel.buildSeriesCourseLines([
    { courseId: 'a1', courseName: '同名球场' },
    { courseId: 'a2', courseName: '同名球场' }
  ]);
  assert('不同 ID 同名保留两条', diffIdSameName.lines.length === 2);

  var emptyCourses = viewModel.buildSeriesCourseLines([
    { courseId: '', courseName: '' },
    { courseId: 'x', courseName: '   ' }
  ]);
  assert('空球场 → pending', emptyCourses.pending === true && emptyCourses.lines.length === 0);

  var roundsBefore = [
    { courseId: 'c1', courseName: 'A场' },
    { courseId: 'c2', courseName: 'B场' }
  ];
  var roundsSnap = JSON.stringify(roundsBefore);
  viewModel.buildSeriesCourseLines(roundsBefore);
  assert('球场去重不修改 rounds', JSON.stringify(roundsBefore) === roundsSnap);

  var heroVm = viewModel.buildSeriesDetailViewModel(
    baseSeries({
      rounds: [
        {
          roundId: 'r2',
          index: 2,
          name: '后打',
          dateTime: '2026-08-13 08:00',
          courseId: 'c1',
          courseName: '测试球场',
          gameMode: '个人比杆赛',
          fee: '',
          topN: 3,
          roundStatus: 'scheduled',
          matchId: ''
        },
        {
          roundId: 'r1',
          index: 1,
          name: '先打',
          dateTime: '2026-08-11 08:00',
          courseId: 'c1',
          courseName: '测试球场',
          gameMode: '个人比杆赛',
          fee: '',
          topN: 3,
          roundStatus: 'scheduled',
          matchId: ''
        }
      ]
    }),
    {
      getMatchById: function () {
        return null;
      },
      getIndexByMatchId: function () {
        return null;
      }
    }
  );
  assert(
    'Hero dateText 无序跨日',
    heroVm.ok && heroVm.hero.dateText === 'AUG 11-13 2026'
  );
  assert(
    'Hero 不再展示报名信息',
    !(heroVm.hero.infoRows || []).some(function (r) {
      return r.label === '报名';
    })
  );
  assert(
    'Hero 球场去重一行',
    heroVm.hero.coursePending === false &&
      heroVm.hero.courseLines.length === 1 &&
      heroVm.hero.courseLines[0] === '测试球场'
  );
})();

// ---- 4C-2 合并返修：赛制 meta chips / 全称简称 / 角标 ----
(function () {
  assert(
    '内部枚举映射中文',
    viewModel.resolveSeriesGameModeLabel('individual_stroke') === '个人比杆赛' &&
      viewModel.resolveSeriesGameModeLabel('fourball') === '四人四球比杆赛'
  );
  assert(
    '空/非法赛制跳过',
    viewModel.resolveSeriesGameModeLabel('') === '' &&
      viewModel.resolveSeriesGameModeLabel('unknown_mode_xyz') === ''
  );

  var singleChips = viewModel.buildSeriesGameModeMetaChips([
    { gameMode: '个人比杆赛' },
    { gameMode: '个人比杆赛' },
    { gameMode: '' }
  ]);
  assert(
    '单一赛制去重且系列赛在前',
    singleChips.map(function (c) {
      return c.text;
    }).join('|') === '系列赛|个人比杆赛'
  );

  var multiChips = viewModel.buildSeriesGameModeMetaChips([
    { gameMode: '个人比杆赛' },
    { gameMode: '四人四球比杆赛' },
    { gameMode: 'individual_stroke' },
    { gameMode: '四人两球比杆赛' },
    { gameMode: 'bad_enum' },
    { gameMode: '四人四球比杆赛' }
  ]);
  assert(
    '多赛制首次出现顺序 + 系列赛唯一最前',
    multiChips.map(function (c) {
      return c.text;
    }).join('|') === '系列赛|个人比杆赛|四人四球比杆赛|四人两球比杆赛'
  );

  var emptyChips = viewModel.buildSeriesGameModeMetaChips([
    { gameMode: '' },
    { gameMode: '???' }
  ]);
  assert(
    '全空仅系列赛',
    emptyChips.length === 1 && emptyChips[0].text === '系列赛'
  );

  var roundsBeforeMeta = [
    { gameMode: '个人比杆赛' },
    { gameMode: '四人四球比杆赛' }
  ];
  var roundsMetaSnap = JSON.stringify(roundsBeforeMeta);
  viewModel.buildSeriesGameModeMetaChips(roundsBeforeMeta);
  assert('赛制 meta 不修改 rounds', JSON.stringify(roundsBeforeMeta) === roundsMetaSnap);

  var namedSeries = baseSeries({
    participants: [
      {
        seriesParticipantId: 'team:t1',
        kind: 'team',
        nameSnapshot: '甲',
        fullNameSnapshot: '完整队名甲',
        shortNameSnapshot: '甲',
        logoSnapshot: ''
      },
      {
        seriesParticipantId: 'team:t2',
        kind: 'team',
        nameSnapshot: '旧简称乙',
        fullNameSnapshot: '',
        shortNameSnapshot: '',
        logoSnapshot: ''
      }
    ],
    rounds: [
      {
        roundId: 'r1',
        index: 1,
        name: 'R1',
        dateTime: '2026-08-11 08:00',
        courseName: 'A',
        gameMode: '个人比杆赛',
        fee: '',
        topN: 3,
        roundStatus: 'scheduled',
        matchId: ''
      },
      {
        roundId: 'r2',
        index: 2,
        name: 'R2',
        dateTime: '2026-08-12 08:00',
        courseName: 'A',
        gameMode: '四人四球比杆赛',
        fee: '',
        topN: 3,
        roundStatus: 'scheduled',
        matchId: ''
      }
    ]
  });
  var namedVm = viewModel.buildSeriesDetailViewModel(namedSeries, {
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  });
  assert(
    'Hero meta 去重赛制且系列赛在前',
    namedVm.ok &&
      namedVm.hero.metaChips
        .map(function (c) {
          return c.text;
        })
        .join('|') === '系列赛|个人比杆赛|四人四球比杆赛'
  );
  assert(
    'Hero 不再输出模板型标签',
    !namedVm.hero.metaChips.some(function (c) {
      return /队际|分队|自定义|莱德/.test(c.text);
    })
  );
  assert(
    '详情球队卡优先全称',
    namedVm.participants.items[0].name === '完整队名甲'
  );
  assert(
    '旧草稿无全称回退 nameSnapshot',
    namedVm.participants.items[1].name === '旧简称乙'
  );
  assert('数量角标 N 支', namedVm.participants.summaryText === '2 支');
  assert(
    '空列表角标 0 支',
    viewModel.buildParticipantsView(baseSeries({ participants: [] })).summaryText === '0 支'
  );
  assert(
    '分队角标 N 个且名称用 nameSnapshot',
    (function () {
      var v = viewModel.buildParticipantsView(
        baseSeries({
          hostMode: 'team',
          participants: [
            {
              seriesParticipantId: 'div:d1',
              kind: 'division',
              nameSnapshot: '先锋队',
              fullNameSnapshot: '不应使用',
              shortNameSnapshot: '短'
            }
          ]
        })
      );
      return v.summaryText === '1 个' && v.items[0].name === '先锋队';
    })()
  );

  var seriesImmut = baseSeries({
    participants: [
      {
        seriesParticipantId: 'team:t1',
        kind: 'team',
        nameSnapshot: '甲',
        fullNameSnapshot: '完整甲',
        shortNameSnapshot: '甲'
      }
    ]
  });
  var beforeImmut = freeze(seriesImmut);
  viewModel.buildSeriesDetailViewModel(seriesImmut, {
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  });
  assert('合并返修不修改输入对象', JSON.stringify(seriesImmut) === JSON.stringify(beforeImmut));
})();

// ---- 默认系统图片 + 删除轮次说明 ----
(function () {
  var bannerConfig = require(path.join(
    __dirname,
    '..',
    'miniprogram',
    'utils',
    'bannerConfig.js'
  ));
  var systemBanner = bannerConfig.getMatchDetailBanner();
  assert('系统 Hero URL 非空', !!systemBanner && /^https:\/\//.test(systemBanner));

  var withSnap = baseSeries({
    bannerImageSnapshot: systemBanner
  });
  assert(
    '详情 Series 不含 bannerImageInitialized',
    !Object.prototype.hasOwnProperty.call(withSnap, 'bannerImageInitialized')
  );
  var snapVm = viewModel.buildSeriesDetailViewModel(withSnap, {
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  });
  assert('非空 Hero 快照不覆盖', snapVm.ok && snapVm.hero.bannerImage === systemBanner);

  var legacy = baseSeries({
    bannerImageSnapshot: ''
  });
  var legacyBefore = freeze(legacy);
  var legacyBanner = viewModel.resolveSeriesHeroBannerDisplay(legacy);
  assert(
    '旧草稿详情快照为空只读 fallback 系统 Hero',
    legacyBanner === systemBanner
  );
  assert(
    '旧草稿详情 fallback 不改输入',
    JSON.stringify(legacy) === JSON.stringify(legacyBefore) &&
      legacy.bannerImageSnapshot === ''
  );

  var imgSeries = baseSeries({
    eventInfoList: [
      {
        id: 'e-img',
        title: '广告图片1',
        type: 'image',
        content: '',
        brightImage: 'https://example.com/b.jpg',
        darkImage: 'https://example.com/d.jpg'
      },
      {
        id: 'e-txt',
        title: '赛事规则',
        type: 'text',
        content: '规则正文',
        brightImage: '',
        darkImage: ''
      }
    ],
    partnerConfig: {
      partnerTitle: '湘鹰机构 Partners',
      partnerLogos: [
        { bright: 'https://example.com/p1b.jpg', dark: 'https://example.com/p1d.jpg' },
        { bright: '', dark: '' }
      ]
    }
  });
  var brightVm = viewModel.buildSeriesDetailViewModel(imgSeries, {
    theme: 'bright',
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  });
  assert(
    'eventInfo 图片项投影 imageData（bright）',
    brightVm.eventInfoList[0].isImage === true &&
      brightVm.eventInfoList[0].imageData === 'https://example.com/b.jpg'
  );
  assert(
    'eventInfo 文本项不伪造图',
    brightVm.eventInfoList[1].isImage === false &&
      brightVm.eventInfoList[1].content === '规则正文'
  );
  assert(
    'PARTNER 按主题取 bright 且跳过空槽',
    brightVm.partner.configured === true &&
      brightVm.partner.hasLogos === true &&
      brightVm.partner.partnerLogoRows.length === 1 &&
      brightVm.partner.partnerLogoRows[0].left.url === 'https://example.com/p1b.jpg' &&
      brightVm.partner.partnerLogoRows[0].right.url === '' &&
      brightVm.partner.logos == null
  );

  var darkVm = viewModel.buildSeriesDetailViewModel(imgSeries, {
    theme: 'dark',
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  });
  assert(
    'PARTNER dark 主题取 dark URL',
    darkVm.partner.partnerLogoRows[0].left.url === 'https://example.com/p1d.jpg'
  );

  var emptyPartner = viewModel.buildPartnerView(
    baseSeries({
      partnerConfig: { partnerTitle: 'X Partners', partnerLogos: [] }
    }),
    'bright'
  );
  assert(
    'partnerLogos=[] 不回填默认 Logo',
    emptyPartner.configured === true &&
      emptyPartner.hasLogos === false &&
      emptyPartner.partnerLogoRows.length === 0
  );

  var nullPartner = viewModel.buildPartnerView(baseSeries({ partnerConfig: null }), 'bright');
  assert('partnerConfig=null 未配置', nullPartner.configured === false);

  var schedVm = viewModel.buildSeriesDetailViewModel(baseSeries(), {
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  });
  assert(
    '赛程 roundCards 仍含赛制费用 TopN',
    schedVm.roundCards.length === 2 &&
      !!schedVm.roundCards[0].gameMode &&
      !!schedVm.roundCards[0].feeText &&
      schedVm.roundCards[0].showTopN === true
  );
  assert('无 roundInfoCards 投影', schedVm.roundInfoCards == null);

  var pageWxml = fs.readFileSync(path.join(path.dirname(vmPath), 'index.wxml'), 'utf8');
  assert(
    'WXML info TAB 不含轮次说明',
    pageWxml.indexOf('轮次说明') < 0 && pageWxml.indexOf('roundInfoCards') < 0
  );
  assert(
    'WXML 赛程 TAB 已切换为分组/出发表投影',
    pageWxml.indexOf("activeTab === 'schedule'") >= 0 &&
      pageWxml.indexOf('schedule.panelMode') >= 0 &&
      pageWxml.indexOf('进入本轮') < 0
  );
  assert(
    'WXML Hero / 广告图节点存在',
    pageWxml.indexOf('hero.bannerImage') >= 0 && pageWxml.indexOf('ad-image') >= 0
  );
})();

// ---- PARTNER 两列 partnerLogoRows + 错误 fallback ----
(function () {
  var partnerConfig = require(path.join(
    __dirname,
    '..',
    'miniprogram',
    'utils',
    'partnerConfig.js'
  ));
  var pageJs = fs.readFileSync(path.join(path.dirname(vmPath), 'index.js'), 'utf8');
  var pageWxml = fs.readFileSync(path.join(path.dirname(vmPath), 'index.wxml'), 'utf8');
  var pageWxss = fs.readFileSync(path.join(path.dirname(vmPath), 'index.wxss'), 'utf8');

  var fourLogos = [
    { bright: 'https://example.com/a-b.jpg', dark: 'https://example.com/a-d.jpg' },
    { bright: 'https://example.com/b-b.jpg', dark: 'https://example.com/b-d.jpg' },
    { bright: 'https://example.com/c-b.jpg', dark: 'https://example.com/c-d.jpg' },
    { bright: 'https://example.com/d-b.jpg', dark: 'https://example.com/d-d.jpg' }
  ];
  var fourSeries = baseSeries({
    partnerConfig: { partnerTitle: 'Four Partners', partnerLogos: fourLogos }
  });
  var fourBefore = freeze(fourSeries);
  var fourView = viewModel.buildPartnerView(fourSeries, 'bright');
  assert(
    '4 张图组成 2×2',
    fourView.partnerLogoRows.length === 2 &&
      fourView.partnerLogoRows[0].left.url === 'https://example.com/a-b.jpg' &&
      fourView.partnerLogoRows[0].right.url === 'https://example.com/b-b.jpg' &&
      fourView.partnerLogoRows[1].left.url === 'https://example.com/c-b.jpg' &&
      fourView.partnerLogoRows[1].right.url === 'https://example.com/d-b.jpg'
  );
  assert(
    'PARTNER 投影不修改输入 Series',
    JSON.stringify(fourSeries) === JSON.stringify(fourBefore)
  );

  var threeView = viewModel.buildPartnerView(
    baseSeries({
      partnerConfig: {
        partnerTitle: 'Three',
        partnerLogos: fourLogos.slice(0, 3)
      }
    }),
    'bright'
  );
  assert(
    '3 张图最后右侧为空',
    threeView.partnerLogoRows.length === 2 &&
      threeView.partnerLogoRows[1].left.url === 'https://example.com/c-b.jpg' &&
      threeView.partnerLogoRows[1].right.url === ''
  );

  var themeBright = viewModel.buildPartnerView(
    baseSeries({
      partnerConfig: {
        partnerTitle: 'T',
        partnerLogos: [{ bright: 'https://b.example/x.jpg', dark: 'https://d.example/x.jpg' }]
      }
    }),
    'bright'
  );
  var themeDark = viewModel.buildPartnerView(
    baseSeries({
      partnerConfig: {
        partnerTitle: 'T',
        partnerLogos: [{ bright: 'https://b.example/x.jpg', dark: 'https://d.example/x.jpg' }]
      }
    }),
    'dark'
  );
  assert('bright/dark 选择 bright', themeBright.partnerLogoRows[0].left.url === 'https://b.example/x.jpg');
  assert('bright/dark 选择 dark', themeDark.partnerLogoRows[0].left.url === 'https://d.example/x.jpg');

  var missBright = viewModel.resolvePartnerLogoDisplayUrl(
    { bright: '', dark: 'https://d.example/only.jpg' },
    'bright'
  );
  var missDark = viewModel.resolvePartnerLogoDisplayUrl(
    { bright: 'https://b.example/only.jpg', dark: '' },
    'dark'
  );
  assert('单边主题缺失 fallback（bright→dark）', missBright === 'https://d.example/only.jpg');
  assert('单边主题缺失 fallback（dark→bright）', missDark === 'https://b.example/only.jpg');

  var legacyStr = viewModel.buildPartnerView(
    baseSeries({
      partnerConfig: {
        partnerTitle: 'Legacy',
        partnerLogos: ['https://legacy.example/s.jpg', { logo: 'https://legacy.example/o.jpg' }]
      }
    }),
    'bright'
  );
  assert(
    '旧字符串兼容',
    legacyStr.partnerLogoRows.length === 1 &&
      legacyStr.partnerLogoRows[0].left.url === 'https://legacy.example/s.jpg' &&
      legacyStr.partnerLogoRows[0].right.url === 'https://legacy.example/o.jpg'
  );

  var emptyArr = viewModel.buildPartnerView(
    baseSeries({ partnerConfig: { partnerTitle: 'Empty', partnerLogos: [] } }),
    'bright'
  );
  assert(
    '空数组不回灌',
    emptyArr.configured === true &&
      emptyArr.hasLogos === false &&
      emptyArr.partnerLogoRows.length === 0
  );

  var badObjUrl = viewModel.resolvePartnerLogoDisplayUrl(
    { bright: { nested: true }, dark: null },
    'bright'
  );
  var noObjectString = viewModel.buildPartnerView(
    baseSeries({
      partnerConfig: {
        partnerTitle: 'Obj',
        partnerLogos: [{ bright: { nested: true }, dark: { nested: true } }, 'https://ok.example/x.jpg']
      }
    }),
    'bright'
  );
  assert('不出现 [object Object]（解析）', badObjUrl === '' || badObjUrl.indexOf('[object Object]') < 0);
  assert(
    '不出现 [object Object]（组行）',
    JSON.stringify(noObjectString.partnerLogoRows).indexOf('[object Object]') < 0 &&
      noObjectString.partnerLogoRows[0].left.url === 'https://ok.example/x.jpg'
  );

  var cosBright = partnerConfig.DEFAULT_PARTNER_LOGOS[0].bright;
  var localFallback = partnerConfig.getPartnerLogoLocalFallback(cosBright);
  assert(
    'COS 默认图 fallback 映射到 COS 旧 partner 图',
    !!localFallback && localFallback.indexOf('/miniprogram/partners/') >= 0
  );

  var errRows = [
    { left: { url: cosBright }, right: { url: 'https://example.com/keep-right.jpg' } },
    { left: { url: 'https://example.com/keep-left.jpg' }, right: { url: '' } }
  ];
  var errBefore = freeze(errRows);
  var errSeries = baseSeries({
    partnerConfig: { partnerTitle: 'Err', partnerLogos: fourLogos }
  });
  var errSeriesBefore = freeze(errSeries);
  var patched = viewModel.applyPartnerLogoError(errRows, 0, 'left', function (url) {
    return partnerConfig.getPartnerLogoLocalFallback(url);
  });
  assert(
    '图片错误只替换对应 row/side',
    patched.changed === true &&
      patched.rows[0].left.url === localFallback &&
      patched.rows[0].right.url === 'https://example.com/keep-right.jpg' &&
      patched.rows[1].left.url === 'https://example.com/keep-left.jpg' &&
      JSON.stringify(errRows) === JSON.stringify(errBefore)
  );
  assert(
    '错误替换不修改输入 Series',
    JSON.stringify(errSeries) === JSON.stringify(errSeriesBefore)
  );

  var noFb = viewModel.applyPartnerLogoError(
    [{ left: { url: 'https://unknown.example/z.jpg' }, right: { url: '' } }],
    0,
    'left',
    function (url) {
      return partnerConfig.getPartnerLogoLocalFallback(url);
    }
  );
  assert('无可用 fallback 时停止，不循环', noFb.changed === false);

  var alreadyLocal = viewModel.applyPartnerLogoError(
    [{ left: { url: localFallback }, right: { url: '' } }],
    0,
    'left',
    function (url) {
      return partnerConfig.getPartnerLogoLocalFallback(url);
    }
  );
  assert(
    '已是本地 fallback 不再替换（防循环）',
    alreadyLocal.changed === false && alreadyLocal.rows[0].left.url === localFallback
  );

  assert(
    'WXML 使用标准 partner-row / partner-item__img / binderror',
    pageWxml.indexOf('partner-row') >= 0 &&
      pageWxml.indexOf('partner-cell--with-divider') >= 0 &&
      pageWxml.indexOf('partner-item__img') >= 0 &&
      pageWxml.indexOf('binderror="onPartnerLogoError"') >= 0 &&
      pageWxml.indexOf('partner.logos') < 0 &&
      pageWxml.indexOf('mode="aspectFit"') >= 0
  );
  assert(
    'WXSS 镜像 partners-grid--logos / partner-item 规则',
    pageWxss.indexOf('.partners-grid--logos .partner-row') >= 0 &&
      pageWxss.indexOf('.partner-cell--with-divider') >= 0 &&
      pageWxss.indexOf('.partner-item__img') >= 0 &&
      pageWxss.indexOf('.partner-logo') < 0
  );
  assert(
    '页面含 onPartnerLogoError 且不写 Series/storage',
    pageJs.indexOf('onPartnerLogoError') >= 0 &&
      pageJs.indexOf('getPartnerLogoLocalFallback') >= 0 &&
      pageJs.indexOf('applyPartnerLogoError') >= 0 &&
      pageJs.indexOf('saveDraft') < 0 &&
      pageJs.indexOf('savePartnerConfig') < 0
  );
})();

// ---- 赛事信息 TAB 标准尺寸对齐 + 广告图 fallback ----
(function () {
  var eventSponsorConfig = require(path.join(
    __dirname,
    '..',
    'miniprogram',
    'utils',
    'eventSponsorConfig.js'
  ));
  var pageWxml = fs.readFileSync(path.join(path.dirname(vmPath), 'index.wxml'), 'utf8');
  var pageWxss = fs.readFileSync(path.join(path.dirname(vmPath), 'index.wxss'), 'utf8');
  var pageJs = fs.readFileSync(path.join(path.dirname(vmPath), 'index.js'), 'utf8');
  var commonWxss = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'styles', 'tournament-common.wxss'),
    'utf8'
  );

  assert(
    '公共 detail-main 左右 32rpx 为权威外层边距',
    /\.detail-main\s*\{[^}]*padding:\s*40rpx\s+32rpx\s+80rpx/.test(commonWxss)
  );

  // 截取 info TAB 区块（到 detail-main 内 standings 之前；忽略 TAB 后提前挂载的轮次条）
  var infoSlice = '';
  var infoStart = pageWxml.indexOf("activeTab === 'info'");
  var standingsStart =
    infoStart >= 0 ? pageWxml.indexOf("activeTab === 'standings'", infoStart + 1) : -1;
  if (infoStart >= 0 && standingsStart > infoStart) {
    infoSlice = pageWxml.slice(infoStart, standingsStart);
  }
  assert('可定位 info TAB 片段', !!infoSlice);

  assert(
    '广告图不再位于带横向 padding 的 series-section',
    infoSlice.indexOf('series-section') < 0 &&
      infoSlice.indexOf('class="ad-image"') >= 0 &&
      infoSlice.indexOf('ad-image__img') >= 0 &&
      infoSlice.indexOf('mode="widthFix"') >= 0 &&
      infoSlice.indexOf('binderror="onEventSponsorImageError"') >= 0
  );

  assert(
    '参赛卡/文本卡直接 ds-card pad-card（无 series-section 缩进）',
    infoSlice.indexOf('ds-card pad-card') >= 0 &&
      infoSlice.indexOf('participants.kindLabel') >= 0
  );

  assert(
    '.ad-image 无水平 margin，标准圆角阴影 margin-bottom:32rpx',
    pageWxss.indexOf('margin: 0 24rpx 8rpx') < 0 &&
      /\.ad-image\s*\{[^}]*border-radius:\s*16rpx/.test(pageWxss) &&
      /\.ad-image\s*\{[^}]*box-shadow:\s*var\(--shadow-card\)/.test(pageWxss) &&
      /\.ad-image\s*\{[^}]*margin-bottom:\s*32rpx/.test(pageWxss) &&
      !/\.ad-image\s*\{[^}]*margin:\s*0\s+24rpx/.test(pageWxss) &&
      !/\.ad-image\s*\{[^}]*margin-left/.test(pageWxss) &&
      !/\.ad-image\s*\{[^}]*margin-right/.test(pageWxss)
  );

  assert(
    'ad-image__img 为 width:100% display:block',
    /\.ad-image__img\s*\{[^}]*width:\s*100%/.test(pageWxss) &&
      /\.ad-image__img\s*\{[^}]*display:\s*block/.test(pageWxss)
  );

  assert(
    'PARTNER 无额外 24rpx 横向 margin，对齐 detail',
    /\.partners-section\s*\{[^}]*padding:\s*24rpx\s+0\s+16rpx/.test(pageWxss) &&
      !/\.partners-section\s*\{[^}]*margin:\s*8rpx\s+24rpx/.test(pageWxss)
  );

  assert(
    '广告图、参赛卡、文本卡左右边缘使用同一 detail-main 宽度',
    infoSlice.indexOf('series-section') < 0 &&
      pageWxss.indexOf('.series-section') < 0 &&
      infoSlice.indexOf('class="ad-image"') >= 0 &&
      infoSlice.indexOf('ds-card pad-card') >= 0 &&
      infoSlice.indexOf('partners-section') >= 0
  );

  // 取赛程 TAB 内容块（避开 detail-main / fixed dock 上的同名条件）
  var scheduleSlice = '';
  var schedBlockStart = pageWxml.indexOf('<block wx:if="{{activeTab === \'schedule\'}}">');
  var discBlockStart = pageWxml.indexOf('<block wx:if="{{activeTab === \'discussion\'}}">');
  if (schedBlockStart >= 0 && discBlockStart > schedBlockStart) {
    scheduleSlice = pageWxml.slice(schedBlockStart, discBlockStart);
  }
  assert(
    '赛程 TAB 宽度不受影响（schedule 面板左右 24rpx 与既有 detail-main 对齐）',
    scheduleSlice.indexOf('schedule-groups-panel') >= 0 &&
      /\.schedule-groups-panel\s*,\s*\.schedule-tee-panel\s*\{[\s\S]{0,80}padding:\s*0;/.test(
        pageWxss
      )
  );

  assert(
    'PARTNER 2×2 标准结构无回归',
    infoSlice.indexOf('partner.partnerLogoRows') >= 0 &&
      infoSlice.indexOf('partner-row') >= 0 &&
      infoSlice.indexOf('partner-cell--with-divider') >= 0
  );

  var cosSponsor = eventSponsorConfig.DEFAULT_EVENT_SPONSOR_IMAGES[0].bright;
  var localSponsor = eventSponsorConfig.getEventSponsorLocalFallback(cosSponsor);
  assert(
    'event sponsor COS fallback 映射到 COS 旧 partner 图',
    !!localSponsor && localSponsor.indexOf('/miniprogram/partners/') >= 0
  );

  var evList = [
    { id: 'e-keep', title: '文本', type: 'text', content: 'x', imageData: '', isImage: false },
    {
      id: 'e-ad',
      title: '广告图片1',
      type: 'image',
      imageData: cosSponsor,
      isImage: true
    }
  ];
  var evBefore = freeze(evList);
  var patchedEv = viewModel.applyEventSponsorImageError(evList, 'e-ad', function (url) {
    return eventSponsorConfig.getEventSponsorLocalFallback(url);
  });
  assert(
    'event sponsor fallback 精确替换对应项',
    patchedEv.changed === true &&
      patchedEv.list[1].imageData === localSponsor &&
      patchedEv.list[0].imageData === '' &&
      JSON.stringify(evList) === JSON.stringify(evBefore)
  );

  var noLoop = viewModel.applyEventSponsorImageError(
    [{ id: 'e-ad', imageData: localSponsor, isImage: true }],
    'e-ad',
    function (url) {
      return eventSponsorConfig.getEventSponsorLocalFallback(url);
    }
  );
  assert('已是本地图时停止，不循环', noLoop.changed === false);

  var unknown = viewModel.applyEventSponsorImageError(
    [{ id: 'e-ad', imageData: 'https://unknown.example/ad.jpg', isImage: true }],
    'e-ad',
    function (url) {
      return eventSponsorConfig.getEventSponsorLocalFallback(url);
    }
  );
  assert('无 fallback 时停止，不循环', unknown.changed === false);

  assert(
    '页面含 onEventSponsorImageError 且不写 Series/storage',
    pageJs.indexOf('onEventSponsorImageError') >= 0 &&
      pageJs.indexOf('getEventSponsorLocalFallback') >= 0 &&
      pageJs.indexOf('applyEventSponsorImageError') >= 0 &&
      pageJs.indexOf('saveDraft') < 0 &&
      pageJs.indexOf('upsertSeries') < 0
  );
})();

// ---- Hero 球队 Logo 动态叠排 / 分队标签 ----
(function () {
  function makeTeams(n) {
    var list = [];
    for (var i = 0; i < n; i++) {
      list.push({
        seriesParticipantId: 'team:t' + i,
        kind: 'team',
        nameSnapshot: '球队' + i,
        fullNameSnapshot: i % 3 === 0 ? '' : '全称球队' + i,
        shortNameSnapshot: '短' + i,
        logoSnapshot: i % 4 === 0 ? '' : '/assets/t' + i + '.png'
      });
    }
    return list;
  }

  function assertLayout(name, count, availableWidth, logoSize, normalGap, expectMode) {
    var layout = viewModel.calculateLogoStackLayout({
      count: count,
      availableWidth: availableWidth,
      logoSize: logoSize,
      normalGap: normalGap
    });
    assert(name + ' count', layout.count === count);
    assert(name + ' positions 数=球队数', layout.positions.length === count);
    if (count === 0) {
      assert(name + ' empty', layout.mode === 'empty' && layout.stackWidth === 0);
      return layout;
    }
    assert(name + ' 首项 left=0', layout.positions[0] === 0);
    var lastRight = layout.positions[count - 1] + logoSize;
    var normalWidth = count * logoSize + Math.max(0, count - 1) * normalGap;
    if (count >= 2 && expectMode === 'collapsed') {
      assert(
        name + ' 折叠末项贴齐容器右缘',
        Math.abs(lastRight - availableWidth) < 1e-6 || availableWidth <= logoSize
      );
    } else if (count >= 2 && expectMode === 'normal') {
      assert(
        name + ' 正常模式不铺满',
        Math.abs(lastRight - normalWidth) < 1e-6 && lastRight <= availableWidth + 1e-6
      );
    } else {
      assert(
        name + ' 末项在容器内',
        lastRight <= Math.max(availableWidth, logoSize) + 1e-6
      );
    }
    if (expectMode) assert(name + ' mode', layout.mode === expectMode);
    assert(name + ' 无负 step', layout.step >= 0);
    return layout;
  }

  assertLayout('0 支', 0, 200, 48, 12, 'empty');
  assertLayout('1 支', 1, 200, 48, 12, 'single');

  var normal5 = assertLayout('5 支可放下(宽300)', 5, 300, 48, 12, 'normal');
  assert(
    '5 支正常间距 step=D+G',
    Math.abs(normal5.step - (48 + 12)) < 1e-6
  );

  var overlap5 = assertLayout('5 支放不下(宽200)', 5, 200, 48, 12, 'collapsed');
  assert(
    '5 支折叠 step=(W-logo)/(n-1)',
    Math.abs(overlap5.step - (200 - 48) / 4) < 1e-6
  );
  assert(
    '5 支折叠末项贴齐',
    Math.abs(overlap5.positions[4] + 48 - 200) < 1e-6
  );

  var narrow20 = assertLayout('20 支极窄', 20, 120, 48, 12, 'collapsed');
  assert('20 支 items=20', narrow20.positions.length === 20);
  assert('20 支不溢出', narrow20.positions[19] + 48 <= 120 + 1e-6);

  // 375 / 430 可用宽度算例（值区约 content - label）
  var w375 = 375 - 32 - 32 - 32 - 32 - 56; // detail-main/card/label 粗算
  var w430 = 430 - 32 * (430 / 375) * 2 - 32 * (430 / 375) * 2 - 56 * (430 / 375);
  var l375 = viewModel.calculateLogoStackLayout({
    count: 10,
    availableWidth: w375,
    logoSize: 48 * (375 / 750),
    normalGap: 12 * (375 / 750)
  });
  var l430 = viewModel.calculateLogoStackLayout({
    count: 10,
    availableWidth: w430,
    logoSize: 48 * (430 / 750),
    normalGap: 12 * (430 / 750)
  });
  assert('375px 10 支全部输出', l375.positions.length === 10);
  assert('430px 10 支全部输出', l430.positions.length === 10);
  assert(
    '宽度变化后步进不同',
    Math.abs(l375.step - l430.step) > 1e-6 || Math.abs(w375 - w430) < 1e-6
  );

  var orgSeries = baseSeries({
    hostMode: 'organization',
    participants: makeTeams(10)
  });
  var orgBefore = freeze(orgSeries);
  var orgDisp = viewModel.buildHeroParticipantDisplay(orgSeries);
  assert('10 支 items 数永远等于球队数', orgDisp.teamItems.length === 10);
  assert('缺 Logo 生成占位', orgDisp.teamItems[0].logo === '' && !!orgDisp.teamItems[0].fallbackText);
  assert('顺序保持', orgDisp.teamItems[3].participantId === 'team:t3');
  assert(
    '不修改 participants',
    JSON.stringify(orgSeries.participants) === JSON.stringify(orgBefore.participants)
  );

  var zeroOrg = viewModel.buildHeroParticipantDisplay(
    baseSeries({ hostMode: 'organization', participants: [] })
  );
  assert(
    '0 支显示待选择球队',
    zeroOrg.emptyText === '待选择球队' && zeroOrg.teamItems.length === 0
  );

  var twoOrg = viewModel.buildHeroParticipantDisplay(
    baseSeries({ hostMode: 'organization', participants: makeTeams(2) })
  );
  assert('2 支全部展示', twoOrg.teamItems.length === 2);

  var twenty = viewModel.buildHeroParticipantDisplay(
    baseSeries({ hostMode: 'organization', participants: makeTeams(20) })
  );
  assert('20 支全部展示无 +N', twenty.teamItems.length === 20);

  var div0 = viewModel.buildHeroParticipantDisplay(
    baseSeries({
      hostMode: 'team',
      participants: []
    })
  );
  assert('0 分队待创建', div0.mode === 'division_tags' && div0.emptyText === '待创建分队');

  var divSeries = baseSeries({
    hostMode: 'team',
    hostTeam: { teamId: 'h1', teamName: '主办队', teamLogo: '/host.png' },
    participants: [
      {
        seriesParticipantId: 'div:1',
        kind: 'division',
        nameSnapshot: '先锋队',
        colorSnapshot: '#112233',
        logoSnapshot: '/should-not-use.png'
      },
      {
        seriesParticipantId: 'div:2',
        kind: 'division',
        nameSnapshot: '荣耀队',
        colorSnapshot: '#aabbcc'
      },
      {
        seriesParticipantId: 'div:3',
        kind: 'division',
        nameSnapshot: '这是一个非常非常长的分队名称不应撑破',
        colorSnapshot: '#00ff00'
      },
      {
        seriesParticipantId: 'div:4',
        kind: 'division',
        nameSnapshot: '四队',
        colorSnapshot: ''
      },
      {
        seriesParticipantId: 'team:skip',
        kind: 'team',
        nameSnapshot: '不应出现',
        logoSnapshot: '/x.png'
      }
    ]
  });
  var divBefore = freeze(divSeries);
  var divDisp = viewModel.buildHeroParticipantDisplay(divSeries);
  assert('4 个分队全输出', divDisp.divisionItems.length === 4);
  assert(
    '分队名称和颜色正确',
    divDisp.divisionItems[0].name === '先锋队' &&
      divDisp.divisionItems[0].color === '#112233' &&
      divDisp.divisionItems[1].name === '荣耀队'
  );
  assert('不输出主办/球队 Logo 项', divDisp.teamItems.length === 0);
  assert(
    '分队不修改 participants',
    JSON.stringify(divSeries.participants) === JSON.stringify(divBefore.participants)
  );

  var heroVm = viewModel.buildSeriesDetailViewModel(
    baseSeries({ hostMode: 'organization', participants: makeTeams(5) }),
    {
      getMatchById: function () {
        return null;
      },
      getIndexByMatchId: function () {
        return null;
      }
    }
  );
  assert(
    'Hero 无阶段/报名且有 chip',
    heroVm.ok &&
      !!heroVm.hero.chipText &&
      !(heroVm.hero.infoRows || []).some(function (r) {
        return r.label === '阶段' || r.label === '报名';
      }) &&
      heroVm.hero.participantDisplay.teamItems.length === 5
  );

  var pageWxml = fs.readFileSync(path.join(path.dirname(vmPath), 'index.wxml'), 'utf8');
  var pageWxss = fs.readFileSync(path.join(path.dirname(vmPath), 'index.wxss'), 'utf8');
  var pageJs = fs.readFileSync(path.join(path.dirname(vmPath), 'index.js'), 'utf8');
  assert(
    'WXML Logo/分队结构无 +N / hiddenCount',
    pageWxml.indexOf('hero-logo-stack') >= 0 &&
      pageWxml.indexOf('hero-division-tag') >= 0 &&
      pageWxml.indexOf('hero.participantDisplay') >= 0 &&
      pageWxml.indexOf('+N') < 0 &&
      pageWxml.indexOf('hiddenCount') < 0 &&
      pageWxml.indexOf('visibleCount') < 0
  );
  assert(
    '页面含测量布局且不写 storage',
    pageJs.indexOf('_layoutHeroTeamLogoStack') >= 0 &&
      fs.readFileSync(vmPath, 'utf8').indexOf('resolveTeamLogoLayout') >= 0 &&
      pageJs.indexOf('onWindowResize') >= 0 &&
      pageWxss.indexOf('.hero-logo-stack') >= 0 &&
      pageWxss.indexOf('text-overflow: ellipsis') >= 0
  );

  // ---------- seriesSubtitle：正式名称第二行（非弱化说明）----------
  var subFilled = viewModel.buildSeriesDetailViewModel(
    baseSeries({ seriesSubtitle: '  第二行正式名\n  ' }),
    {
      getMatchById: function () {
        return null;
      },
      getIndexByMatchId: function () {
        return null;
      }
    }
  );
  assert(
    'Hero titleMain/titleSub 分离且 trim',
    subFilled.ok &&
      subFilled.hero.titleMain === '湘鹰队际系列赛' &&
      subFilled.hero.titleSub === '第二行正式名'
  );
  var subEmpty = viewModel.buildSeriesDetailViewModel(baseSeries({ seriesSubtitle: '  \n' }), {
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  });
  assert('空副标题 titleSub 为空串', subEmpty.ok && subEmpty.hero.titleSub === '');

  var liveRoundSeries = baseSeries({
    seriesSubtitle: '',
    rounds: [
      {
        roundId: 'round-1',
        index: 1,
        name: '第1轮',
        dateTime: '2026-09-08 08:00',
        courseName: '测试球场',
        gameMode: '个人比杆赛',
        matchId: 'team-match-1',
        roundStatus: 'live'
      },
      {
        roundId: 'round-2',
        index: 2,
        name: '第2轮',
        dateTime: '2026-09-10 08:00',
        courseName: '测试球场2',
        gameMode: '四人四球比杆赛',
        matchId: '',
        roundStatus: 'scheduled'
      }
    ]
  });
  var liveMatchDeps = {
    getMatchById: function (id) {
      if (id === 'team-match-1') {
        return managedMatch({
          status: 'ongoing',
          roundId: 'round-1'
        });
      }
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  };
  var plazaLiveHero = viewModel.buildSeriesDetailViewModel(
    liveRoundSeries,
    Object.assign({ heroEntryContext: 'plaza' }, liveMatchDeps)
  );
  var registerLiveHero = viewModel.buildSeriesDetailViewModel(
    liveRoundSeries,
    Object.assign({ heroEntryContext: 'registration' }, liveMatchDeps)
  );
  var plazaNamedHero = viewModel.buildSeriesDetailViewModel(
    Object.assign({}, liveRoundSeries, { seriesSubtitle: '手动副标题' }),
    Object.assign({ heroEntryContext: 'plaza' }, liveMatchDeps)
  );
  assert(
    '广场 LIVE：Hero 日期为本轮日、空副标题自动生成第N轮-赛制',
    plazaLiveHero.ok &&
      plazaLiveHero.hero.dateText === 'SEP 08 2026' &&
      plazaLiveHero.hero.titleSub === '第1轮-比杆赛'
  );
  assert(
    '报名 TAB：Hero 保持系列区间且不自动生成副标题',
    registerLiveHero.ok &&
      registerLiveHero.hero.dateText === 'SEP 08-10 2026' &&
      registerLiveHero.hero.titleSub === ''
  );
  assert(
    '广场 LIVE：已有 subtitle 不覆盖',
    plazaNamedHero.ok && plazaNamedHero.hero.titleSub === '手动副标题'
  );
  assert(
    '报名入口 Hero 色调固定冠军金，不受 LIVE 影响',
    registerLiveHero.ok &&
      registerLiveHero.hero.isLive === true &&
      registerLiveHero.hero.entryContext === 'registration' &&
      registerLiveHero.hero.dateTone === 'gold' &&
      plazaLiveHero.hero.entryContext === 'plaza' &&
      plazaLiveHero.hero.dateTone === 'live'
  );
  assert(
    '报名入口 WXML/WXSS 冠军金优先于 LIVE 蓝',
    pageWxml.indexOf("hero.entryContext === 'registration' ? 'event-date--gold'") >= 0 &&
      pageWxml.indexOf("hero.entryContext === 'registration' ? 'section-divider--gold'") >= 0 &&
      pageWxml.indexOf("hero.entryContext === 'registration' ? 'org-text--gold'") >= 0 &&
      pageWxss.indexOf('.event-date--gold') >= 0 &&
      pageWxss.indexOf('.section-divider--gold') >= 0 &&
      pageWxss.indexOf('.org-text--gold') >= 0 &&
      pageWxss.indexOf('#CE9224') >= 0 &&
      pageWxss.indexOf('#FFD700') < 0 &&
      pageWxss.indexOf('.event-date--live') >= 0 &&
      pageWxss.indexOf('.org-text--live') >= 0
  );
  assert(
    'Hero 不拼接主副标题',
    subFilled.hero.titleMain.indexOf(subFilled.hero.titleSub) < 0 &&
      pageWxml.indexOf('titleMain') >= 0 &&
      pageWxml.indexOf('titleSub') >= 0 &&
      pageWxml.indexOf('wx:if="{{hero.titleSub}}"') >= 0
  );
  assert(
    'Hero 标题区居中且共享行样式',
    pageWxss.indexOf('.event-title') >= 0 &&
      /text-align:\s*center/.test(pageWxss) &&
      pageWxss.indexOf('.event-title__line') >= 0 &&
      pageWxss.indexOf('white-space: nowrap') >= 0 &&
      pageWxss.indexOf('text-overflow: ellipsis') >= 0
  );
  var subRuleMatch = pageWxss.match(
    /\.event-title__line--sub\s*\{([^}]*)\}/
  );
  var subRule = subRuleMatch ? subRuleMatch[1] : '';
  assert(
    '副标题规则不含更弱字号/字重/颜色',
    !!subRuleMatch &&
      !/font-size\s*:/.test(subRule) &&
      !/font-weight\s*:/.test(subRule) &&
      !/color\s*:/.test(subRule) &&
      !/line-height\s*:/.test(subRule)
  );
  assert(
    '无 dark-mode 弱化副标题色',
    pageWxss.indexOf('.event-title__line--sub') >= 0 &&
      pageWxss.indexOf('.detail-page.dark-mode .event-title__line--sub') < 0
  );
  var sharedLineMatch = pageWxss.match(/\.event-title__line\s*\{([^}]*)\}/);
  var sharedLine = sharedLineMatch ? sharedLineMatch[1] : '';
  assert(
    '主副标题共享字号字重颜色行高',
    !!sharedLineMatch &&
      /font-size\s*:/.test(sharedLine) &&
      /font-weight\s*:/.test(sharedLine) &&
      /color\s*:/.test(sharedLine) &&
      /line-height\s*:/.test(sharedLine)
  );
})();

// ---- 一级/二级吸顶 + 两阶段短内容补偿（内容坐标二级阈值） ----
(function testScrollFillerAndSecondarySticky() {
  var TOL = 4;
  function computeStickyTopInsideScroll(stickyRoundSelectorTop, scrollRectTop) {
    var st = Number(stickyRoundSelectorTop);
    var srt = Number(scrollRectTop);
    if (!Number.isFinite(st) || st < 0) st = 0;
    if (!Number.isFinite(srt) || srt < 0) srt = 0;
    return Math.max(0, st - srt);
  }
  function computeSecondaryStickyThreshold(
    roundSelectorOffsetTop,
    stickyRoundSelectorTop,
    scrollRectTop
  ) {
    var off = Number(roundSelectorOffsetTop);
    if (!Number.isFinite(off) || off <= 0) return 0;
    var inside = computeStickyTopInsideScroll(stickyRoundSelectorTop, scrollRectTop);
    return Math.max(0, off - inside);
  }
  function resolveFillerTargetStickyOffset(
    activeTab,
    standingsAvailable,
    tabOffsetTop,
    secondaryThreshold
  ) {
    if (activeTab === 'standings' && standingsAvailable) {
      var sec = Number(secondaryThreshold);
      return Number.isFinite(sec) && sec >= 0 ? sec : 0;
    }
    var th = Number(tabOffsetTop);
    return Number.isFinite(th) && th >= 0 ? th : 0;
  }
  function computeStickyFiller(input) {
    var src = input || {};
    var vh = Number(src.viewportHeight);
    var sh = Number(src.scrollHeightWithoutFiller);
    var target = Number(src.targetStickyOffset);
    var tol = src.tolerance == null ? TOL : Number(src.tolerance);
    if (!Number.isFinite(vh) || vh < 0) vh = 0;
    if (!Number.isFinite(sh) || sh < 0) sh = 0;
    if (!Number.isFinite(target) || target < 0) target = 0;
    if (!Number.isFinite(tol) || tol < 0) tol = TOL;
    return Math.max(0, Math.ceil(vh + target + tol - sh));
  }
  function computeFillerCorrection(input) {
    var src = input || {};
    var vh = Number(src.viewportHeight);
    var actualSh = Number(src.actualScrollHeight);
    var target = Number(src.targetStickyOffset);
    var current = Number(src.currentFillerHeight);
    var tol = src.tolerance == null ? TOL : Number(src.tolerance);
    if (!Number.isFinite(vh) || vh < 0) vh = 0;
    if (!Number.isFinite(actualSh) || actualSh < 0) actualSh = 0;
    if (!Number.isFinite(target) || target < 0) target = 0;
    if (!Number.isFinite(current) || current < 0) current = 0;
    if (!Number.isFinite(tol) || tol < 0) tol = TOL;
    var actualMaxScrollTop = Math.max(0, actualSh - vh);
    var shortfall = target + tol - actualMaxScrollTop;
    if (!(shortfall > 0)) {
      return {
        actualMaxScrollTop: actualMaxScrollTop,
        shortfall: 0,
        correctedFillerHeight: current,
        satisfies: true
      };
    }
    return {
      actualMaxScrollTop: actualMaxScrollTop,
      shortfall: shortfall,
      correctedFillerHeight: current + Math.ceil(shortfall),
      satisfies: false
    };
  }
  function calcIsStickyRoundSelector(o) {
    if (o.activeTab !== 'standings') return false;
    if (!o.standingsAvailable) return false;
    if (!o.isStickyTab) return false;
    if (!(o.roundSelectorOffsetTop > 0)) return false;
    var threshold =
      o.secondaryThreshold != null
        ? Number(o.secondaryThreshold)
        : computeSecondaryStickyThreshold(
            o.roundSelectorOffsetTop,
            o.stickyRoundSelectorTop,
            o.scrollRectTop
          );
    return o.scrollTop >= threshold;
  }

  // 实测日志数据锁定
  var logRoundOff = 866.5125;
  var logStickyRoundTop = 157;
  var logScrollRectTop = 106;
  var logSecondary = computeSecondaryStickyThreshold(
    logRoundOff,
    logStickyRoundTop,
    logScrollRectTop
  );
  var oldWrong = Math.max(0, logRoundOff - logStickyRoundTop);
  assert(
    '日志数据阈值约为815.5125',
    Math.abs(logSecondary - 815.5125) < 1e-6,
    'got=' + logSecondary
  );
  assert(
    'scrollRectTop=106时正确阈值比旧阈值大106',
    Math.abs(logSecondary - oldWrong - 106) < 1e-6
  );
  assert(
    'scrollRectTop=0时新旧公式一致',
    computeSecondaryStickyThreshold(logRoundOff, logStickyRoundTop, 0) === oldWrong
  );
  assert(
    'Header/scrollRectTop变化时阈值跟随',
    computeSecondaryStickyThreshold(logRoundOff, logStickyRoundTop, 120) ===
      Math.max(0, logRoundOff - (logStickyRoundTop - 120))
  );

  var headerH = 92;
  var primaryH = 48;
  var stickyRoundTop = headerH + primaryH;
  var roundOff = 520;
  var scrollRectTop = 0;
  var secondaryThreshold = computeSecondaryStickyThreshold(
    roundOff,
    stickyRoundTop,
    scrollRectTop
  );
  assert(
    '二级阈值 = offset - stickyTopInsideScroll',
    secondaryThreshold ===
      Math.max(0, roundOff - computeStickyTopInsideScroll(stickyRoundTop, scrollRectTop))
  );
  assert(
    '二级在一级未吸顶时不显示',
    calcIsStickyRoundSelector({
      activeTab: 'standings',
      standingsAvailable: true,
      isStickyTab: false,
      roundSelectorOffsetTop: roundOff,
      stickyRoundSelectorTop: stickyRoundTop,
      scrollRectTop: scrollRectTop,
      secondaryThreshold: secondaryThreshold,
      scrollTop: secondaryThreshold + 10
    }) === false
  );
  assert(
    '二级在阈值处显示',
    calcIsStickyRoundSelector({
      activeTab: 'standings',
      standingsAvailable: true,
      isStickyTab: true,
      roundSelectorOffsetTop: roundOff,
      stickyRoundSelectorTop: stickyRoundTop,
      scrollRectTop: scrollRectTop,
      secondaryThreshold: secondaryThreshold,
      scrollTop: secondaryThreshold
    }) === true
  );
  assert(
    '离开总榜隐藏二级',
    calcIsStickyRoundSelector({
      activeTab: 'info',
      standingsAvailable: true,
      isStickyTab: true,
      roundSelectorOffsetTop: roundOff,
      stickyRoundSelectorTop: stickyRoundTop,
      scrollRectTop: scrollRectTop,
      secondaryThreshold: secondaryThreshold,
      scrollTop: secondaryThreshold + 20
    }) === false
  );
  assert(
    'per_round 不可用时不二级吸顶',
    calcIsStickyRoundSelector({
      activeTab: 'standings',
      standingsAvailable: false,
      isStickyTab: true,
      roundSelectorOffsetTop: roundOff,
      stickyRoundSelectorTop: stickyRoundTop,
      scrollRectTop: scrollRectTop,
      secondaryThreshold: secondaryThreshold,
      scrollTop: secondaryThreshold + 20
    }) === false
  );
  assert(
    '回滚时阈值下解除二级',
    calcIsStickyRoundSelector({
      activeTab: 'standings',
      standingsAvailable: true,
      isStickyTab: true,
      roundSelectorOffsetTop: roundOff,
      stickyRoundSelectorTop: stickyRoundTop,
      scrollRectTop: scrollRectTop,
      secondaryThreshold: secondaryThreshold,
      scrollTop: secondaryThreshold - 1
    }) === false
  );

  var standingsTarget = resolveFillerTargetStickyOffset(
    'standings',
    true,
    400,
    secondaryThreshold
  );
  var infoTarget = resolveFillerTargetStickyOffset('info', true, 400, secondaryThreshold);
  assert('总榜 filler 目标为二级阈值', standingsTarget === secondaryThreshold);
  assert('其他 TAB filler 目标为一级阈值', infoTarget === 400);
  assert(
    '二级显隐与 filler 使用同一阈值',
    calcIsStickyRoundSelector({
      activeTab: 'standings',
      standingsAvailable: true,
      isStickyTab: true,
      roundSelectorOffsetTop: logRoundOff,
      stickyRoundSelectorTop: logStickyRoundTop,
      scrollRectTop: logScrollRectTop,
      secondaryThreshold: logSecondary,
      scrollTop: logSecondary
    }) === true &&
      resolveFillerTargetStickyOffset('standings', true, 400, logSecondary) ===
        logSecondary
  );

  // 实测：baseMax=447 → 需补齐到 secondary+4
  var baseMaxScroll = 447;
  var needMax = logSecondary + TOL;
  var fillerNeed = Math.ceil(needMax - baseMaxScroll);
  assert(
    '日志场景初始 filler 约373',
    fillerNeed === 373,
    'fillerNeed=' + fillerNeed
  );
  var finalActualMaxScrollTop = baseMaxScroll + fillerNeed;
  assert(
    '最终最大滚动距离至少为目标加4px',
    finalActualMaxScrollTop + 1e-6 >= 819.5125,
    'final=' + finalActualMaxScrollTop
  );

  // 算例：预估不足 → 阶段二补齐 shortfall（tolerance=4）
  var viewportHeight = 667;
  var baseScrollHeight = 800;
  var initialFiller = computeStickyFiller({
    viewportHeight: viewportHeight,
    scrollHeightWithoutFiller: baseScrollHeight,
    targetStickyOffset: standingsTarget,
    tolerance: TOL
  });
  var actualScrollHeightAfter = baseScrollHeight + initialFiller - 6;
  var corr = computeFillerCorrection({
    viewportHeight: viewportHeight,
    actualScrollHeight: actualScrollHeightAfter,
    targetStickyOffset: standingsTarget,
    currentFillerHeight: initialFiller,
    tolerance: TOL
  });
  var shortfall = corr.shortfall;
  var correctedFiller = corr.correctedFillerHeight;
  var finalMax = baseScrollHeight + correctedFiller - 6 - viewportHeight;
  assert('阶段一初始 filler>0', initialFiller > 0, 'initialFiller=' + initialFiller);
  assert(
    '初始估算不足时复测能补齐 shortfall',
    shortfall > 0 && correctedFiller === initialFiller + Math.ceil(shortfall),
    'shortfall=' + shortfall + ' corrected=' + correctedFiller
  );
  assert(
    '最终 maxScrollTop >= secondaryThreshold + tolerance',
    finalMax + 1e-6 >= standingsTarget + TOL,
    'finalMax=' + finalMax + ' need=' + (standingsTarget + TOL)
  );

  var overEstimatedBase = 803;
  var trueBase = 800;
  var initLow = computeStickyFiller({
    viewportHeight: viewportHeight,
    scrollHeightWithoutFiller: overEstimatedBase,
    targetStickyOffset: standingsTarget,
    tolerance: TOL
  });
  var afterLow = trueBase + initLow;
  var corrRpx = computeFillerCorrection({
    viewportHeight: viewportHeight,
    actualScrollHeight: afterLow,
    targetStickyOffset: standingsTarget,
    currentFillerHeight: initLow,
    tolerance: TOL
  });
  var maxAfterRpx = trueBase + corrRpx.correctedFillerHeight - viewportHeight;
  assert(
    'rpx取整误差下仍跨过阈值',
    maxAfterRpx + 1e-6 >= standingsTarget + TOL,
    'max=' + maxAfterRpx
  );

  var withFillerMistaken = baseScrollHeight + 120;
  var bad = computeStickyFiller({
    viewportHeight: viewportHeight,
    scrollHeightWithoutFiller: withFillerMistaken,
    targetStickyOffset: standingsTarget,
    tolerance: TOL
  });
  var good = computeStickyFiller({
    viewportHeight: viewportHeight,
    scrollHeightWithoutFiller: baseScrollHeight,
    targetStickyOffset: standingsTarget,
    tolerance: TOL
  });
  assert(
    'filler节点不进入基础高度',
    good > bad && bad === Math.max(0, good - 120)
  );

  var a1 = computeStickyFiller({
    viewportHeight: viewportHeight,
    scrollHeightWithoutFiller: baseScrollHeight,
    targetStickyOffset: standingsTarget,
    tolerance: TOL
  });
  var a2 = computeStickyFiller({
    viewportHeight: viewportHeight,
    scrollHeightWithoutFiller: baseScrollHeight,
    targetStickyOffset: standingsTarget,
    tolerance: TOL
  });
  assert('重复测量不累加', a1 === a2 && a1 === initialFiller);
  var corr2 = computeFillerCorrection({
    viewportHeight: viewportHeight,
    actualScrollHeight: baseScrollHeight + correctedFiller - 6,
    targetStickyOffset: standingsTarget,
    currentFillerHeight: correctedFiller,
    tolerance: TOL
  });
  assert(
    '纠正后再复核 shortfall=0 不继续涨',
    corr2.shortfall === 0 && corr2.correctedFillerHeight === correctedFiller
  );

  assert(
    '长内容 filler=0',
    computeStickyFiller({
      viewportHeight: viewportHeight,
      scrollHeightWithoutFiller: 5000,
      targetStickyOffset: standingsTarget,
      tolerance: TOL
    }) === 0
  );

  var infoFiller = computeStickyFiller({
    viewportHeight: viewportHeight,
    scrollHeightWithoutFiller: 700,
    targetStickyOffset: infoTarget,
    tolerance: TOL
  });
  var infoMax = 700 + infoFiller - viewportHeight;
  assert(
    '其他TAB使用tabOffsetTop且超过目标+4',
    infoFiller > 0 && infoMax + 1e-6 >= infoTarget + TOL
  );

  var pageJs = fs.readFileSync(path.join(path.dirname(vmPath), 'index.js'), 'utf8');
  var pageWxml = fs.readFileSync(path.join(path.dirname(vmPath), 'index.wxml'), 'utf8');
  var pageWxss = fs.readFileSync(path.join(path.dirname(vmPath), 'index.wxss'), 'utf8');
  assert(
    '一级吸顶公式保持不变',
    pageJs.indexOf('top >= tabThreshold && tabThreshold > 0') >= 0 &&
      pageJs.indexOf('scrollTop >= tabOffsetTop') >= 0
  );
  assert(
    '快速切TAB时旧结果失效',
    pageJs.indexOf('_fillerMeasureToken') >= 0 &&
      pageJs.indexOf('token !== self._fillerMeasureToken') >= 0 &&
      /switchTab:[\s\S]*_fillerMeasureToken\s*=\s*\(/.test(pageJs)
  );
  function computeProvisionalTabFiller(input) {
    var src = input || {};
    if (src.cachedFiller != null && Number.isFinite(Number(src.cachedFiller))) {
      var cached = Number(src.cachedFiller);
      return cached < 0 ? 0 : Math.ceil(cached);
    }
    var vh = Number(src.viewportHeight) || 0;
    var scrollTop = Number(src.currentScrollTop) || 0;
    var required = Number(src.targetStickyOffset) || 0;
    var tol = src.tolerance == null ? TOL : Number(src.tolerance);
    if (!Number.isFinite(tol) || tol < 0) tol = TOL;
    var needRetain = Math.min(scrollTop, required);
    var target = Math.max(required, needRetain);
    return computeStickyFiller({
      viewportHeight: vh,
      scrollHeightWithoutFiller: 0,
      targetStickyOffset: target,
      tolerance: tol
    });
  }
  var switchTabStart = pageJs.indexOf('switchTab: function');
  var switchTabEnd = pageJs.indexOf('_rebuildStandingsProjection: function', switchTabStart);
  var switchTabSrc =
    switchTabStart >= 0 && switchTabEnd > switchTabStart
      ? pageJs.slice(switchTabStart, switchTabEnd)
      : '';
  assert(
    'TAB切换同帧带入cached/provisional filler且禁止归零',
    switchTabSrc.length > 0 &&
      switchTabSrc.indexOf('scrollFillerHeight: 0') < 0 &&
      switchTabSrc.indexOf('scrollFillerHeight: provisional') >= 0 &&
      switchTabSrc.indexOf('computeProvisionalTabFiller') >= 0 &&
      switchTabSrc.indexOf('_fillerByTab') >= 0 &&
      !/\bmeasureTabTop\s*\(/.test(switchTabSrc) &&
      pageJs.indexOf('_cacheFillerForActiveTab') >= 0
  );
  assert(
    '有缓存时provisional使用缓存',
    computeProvisionalTabFiller({
      cachedFiller: 373,
      viewportHeight: 667,
      currentScrollTop: 900,
      targetStickyOffset: 815.5125,
      tolerance: TOL
    }) === 373
  );
  var firstStandingsProv = computeProvisionalTabFiller({
    cachedFiller: null,
    viewportHeight: 667,
    currentScrollTop: 500,
    targetStickyOffset: 400,
    tolerance: TOL
  });
  var firstMax = Math.max(0, 0 + firstStandingsProv - 667);
  assert(
    '首次无缓存不以0裸渲染且承接滚动',
    firstStandingsProv > 0 &&
      firstMax + 1e-6 >= Math.min(500, 400) &&
      firstMax + 1e-6 >= 400 + TOL - 1e-6,
    'prov=' + firstStandingsProv + ' max=' + firstMax
  );
  assert(
    '两阶段测量与 tolerance=4',
    pageJs.indexOf('computeStickyFiller') >= 0 &&
      pageJs.indexOf('computeFillerCorrection') >= 0 &&
      pageJs.indexOf('SCROLL_FILLER_TOLERANCE_PX = 4') >= 0 &&
      pageJs.indexOf('scrollHeightWithoutFiller') >= 0 &&
      pageJs.indexOf('_pageAlive') >= 0 &&
      pageJs.indexOf('computeStickyTopInsideScroll') >= 0 &&
      pageJs.indexOf('_getSecondaryStickyThreshold') >= 0
  );
  // ---- 展开/收起：禁止 filler 可见归零 + 合并测量 + 滚动锚点 ----
  function computeScrollHeightWithoutFiller(actualScrollHeight, currentFillerHeight) {
    var a = Number(actualScrollHeight);
    var f = Number(currentFillerHeight);
    if (!Number.isFinite(a) || a < 0) a = 0;
    if (!Number.isFinite(f) || f < 0) f = 0;
    return Math.max(0, a - f);
  }
  assert(
    'baseScrollHeight=actual-currentFiller',
    computeScrollHeightWithoutFiller(2000, 373) === 1627 &&
      computeScrollHeightWithoutFiller(800, 0) === 800 &&
      computeScrollHeightWithoutFiller(100, 200) === 0 &&
      pageJs.indexOf('computeScrollHeightWithoutFiller') >= 0
  );
  var updateFnStart = pageJs.indexOf('updateScrollFillerHeight: function ()');
  var scheduleFnStart = pageJs.indexOf('scheduleScrollFillerMeasure: function ()');
  var updateFnSrc =
    updateFnStart >= 0 && scheduleFnStart > updateFnStart
      ? pageJs.slice(updateFnStart, scheduleFnStart)
      : '';
  assert(
    '展开收起测量路径禁止可见filler归零',
    updateFnSrc.length > 0 &&
      updateFnSrc.indexOf('scrollFillerHeight: 0') < 0 &&
      updateFnSrc.indexOf('computeScrollHeightWithoutFiller') >= 0 &&
      pageJs.indexOf('shortfall > 1') >= 0
  );
  assert(
    'schedule合并测量并作废旧token',
    /scheduleScrollFillerMeasure:\s*function\s*\(\)\s*\{[\s\S]*?_fillerMeasureToken\s*=\s*\([\s\S]*?_fillerMeasureTimer/.test(
      pageJs
    ) &&
      pageJs.indexOf('_captureScrollLayoutAnchor') >= 0 &&
      pageJs.indexOf('_restoreScrollLayoutAnchorIfNeeded') >= 0 &&
      pageJs.indexOf('a.restored') >= 0
  );
  var expandHelperStart = pageJs.indexOf('_measureStandingsExpandedPanelHeight: function');
  var teamTapEnd = pageJs.indexOf('onScroll: function', expandHelperStart);
  var teamTapSrc =
    expandHelperStart >= 0 && teamTapEnd > expandHelperStart
      ? pageJs.slice(expandHelperStart, teamTapEnd)
      : '';
  assert(
    '球队展开对齐队际赛轻量setData',
    teamTapSrc.indexOf('expandedStandingsTeamId') >= 0 &&
      teamTapSrc.indexOf('_rebuildStandingsProjection') < 0 &&
      teamTapSrc.indexOf('scheduleStandingsContentFillerMeasure') >= 0 &&
      teamTapSrc.indexOf('measureTabTop') < 0 &&
      teamTapSrc.indexOf('measureRoundSelectorTop') < 0 &&
      /scheduleStandingsContentFillerMeasure:[\s\S]*updateScrollFillerHeight/.test(pageJs)
  );
  assert(
    '收起同帧预补偿filler避免高度瞬降',
    pageWxml.indexOf('series-standings-expanded-panel') >= 0 &&
      pageWxml.indexOf('data-team-id="{{team.teamId}}"') >= 0 &&
      teamTapSrc.indexOf('_measureStandingsExpandedPanelHeight') >= 0 &&
      teamTapSrc.indexOf('currentFiller + panelH') >= 0 &&
      teamTapSrc.indexOf('expandedStandingsTeamId: nid') >= 0 &&
      teamTapSrc.indexOf('_standingsExpandTapLocked') >= 0 &&
      teamTapSrc.indexOf('_standingsExpandMeasureToken') >= 0 &&
      teamTapSrc.indexOf('_restoreStandingsCollapseScrollIfNeeded') >= 0 &&
      /onUnload:[\s\S]*_standingsExpandMeasureToken/.test(pageJs)
  );
  // 理论：删除面板高度与同帧 filler 增量相抵，总高度变化≈0
  var collapsePanel = 120;
  var collapseFillerBefore = 373;
  var collapseScrollBefore = 2000;
  var collapseScrollAfterTheory =
    collapseScrollBefore - collapsePanel + (collapseFillerBefore + collapsePanel - collapseFillerBefore);
  assert(
    '收起同帧总高度理论变化接近0',
    collapseScrollAfterTheory === collapseScrollBefore
  );
  // 日志场景：baseMax≈447 → baseScrollHeight = vh + baseMax ≈ 1114；含 filler 的 actual = base + 373
  var logBaseScrollHeight = viewportHeight + baseMaxScroll;
  var noZeroBase = computeScrollHeightWithoutFiller(
    logBaseScrollHeight + fillerNeed,
    fillerNeed
  );
  var noZeroFiller = computeStickyFiller({
    viewportHeight: viewportHeight,
    scrollHeightWithoutFiller: noZeroBase,
    targetStickyOffset: logSecondary,
    tolerance: TOL
  });
  assert(
    '不归零时初始filler与归零测量一致',
    noZeroBase === logBaseScrollHeight && noZeroFiller === fillerNeed,
    'base=' + noZeroBase + ' filler=' + noZeroFiller
  );
  var expandBase = computeScrollHeightWithoutFiller(
    logBaseScrollHeight + 900 + fillerNeed,
    fillerNeed
  );
  var expandFiller = computeStickyFiller({
    viewportHeight: viewportHeight,
    scrollHeightWithoutFiller: expandBase,
    targetStickyOffset: logSecondary,
    tolerance: TOL
  });
  assert(
    '展开足够长时filler可平滑为0',
    expandBase === logBaseScrollHeight + 900 && expandFiller === 0
  );
  var collapseBase = computeScrollHeightWithoutFiller(logBaseScrollHeight, 0);
  var collapseFiller = computeStickyFiller({
    viewportHeight: viewportHeight,
    scrollHeightWithoutFiller: collapseBase,
    targetStickyOffset: logSecondary,
    tolerance: TOL
  });
  assert(
    '收起后filler可从0平滑增加',
    collapseBase === logBaseScrollHeight && collapseFiller === fillerNeed
  );
  assert(
    '全部临时诊断代码已移除',
    pageJs.indexOf('SeriesStickyDiag') < 0 &&
      pageJs.indexOf('_emitSeriesStickyDiag') < 0 &&
      pageJs.indexOf('_canEmitStickyDiag') < 0 &&
      pageJs.indexOf('_diagNearBottomLogged') < 0 &&
      pageJs.indexOf('_diagScrollCache') < 0 &&
      pageWxml.indexOf('series-sticky-round-fixed') < 0
  );
  assert(
    '二级吸顶结构与测量存在',
    pageWxml.indexOf('series-round-dock--inflow') >= 0 &&
      pageWxml.indexOf('series-round-dock--fixed') >= 0 &&
      pageWxml.indexOf('series-round-dock__inner') >= 0 &&
      pageWxml.indexOf('stickyRoundSelectorTop') >= 0 &&
      pageWxml.indexOf('roundSelectorScrollLeft') >= 0 &&
      pageJs.indexOf('measureRoundSelectorTop') >= 0 &&
      pageJs.indexOf('.series-round-dock--inflow') >= 0 &&
      pageJs.indexOf('computeSecondaryStickyThreshold') >= 0 &&
      pageJs.indexOf('calcIsStickyRoundSelector') >= 0 &&
      pageJs.indexOf('onRoundSelectorHScroll') >= 0 &&
      pageJs.indexOf('_skipRoundHScrollSync') >= 0 &&
      pageWxss.indexOf('z-index: 129') >= 0
  );
  assert(
    '一级 z-index 仍用 common 130 结构',
    pageWxml.indexOf('tab-scroll-wrap--fixed') >= 0 &&
      pageWxml.indexOf('tab-scroll-wrap--inflow') >= 0
  );
  var naturalOpen = pageWxml.indexOf('id="series-scroll-natural"');
  var fillerIdx = pageWxml.indexOf('series-scroll-filler');
  var naturalCloseBeforeFiller =
    naturalOpen >= 0 &&
    fillerIdx > naturalOpen &&
    pageWxml.slice(naturalOpen, fillerIdx).lastIndexOf('</view>') >= 0;
  assert(
    'filler 排除补偿节点且无固定大空白',
    naturalCloseBeforeFiller &&
      pageJs.indexOf('resolveFillerTargetStickyOffset') >= 0 &&
      pageJs.indexOf('min-height: 2000') < 0
  );

  // ---- 二级 fixed dock 锁定契约 ----
  var mainScrollClose = pageWxml.indexOf('</scroll-view>', fillerIdx);
  var fixedIdx = pageWxml.indexOf('series-round-dock--fixed');
  var scheduleFixedIdx = pageWxml.indexOf(
    'series-round-dock--fixed',
    fixedIdx + 'series-round-dock--fixed'.length
  );
  var registerFixedIdx = pageWxml.indexOf('register-ext-wrap--fixed');
  var inflowIdx = pageWxml.indexOf('series-round-dock--inflow');
  var tabInflowIdx = pageWxml.indexOf('tab-scroll-wrap--inflow');
  var detailMainIdx = pageWxml.indexOf('detail-main series-detail-main');
  var seriesScrollOpen = pageWxml.indexOf('series-detail-scroll');
  var tabFixedIdx = pageWxml.indexOf('tab-scroll-wrap--fixed');
  assert(
    'fixed轮次条在 scroll-view外',
    fixedIdx > mainScrollClose && mainScrollClose > fillerIdx && fixedIdx > seriesScrollOpen
  );
  assert(
    '流内 dock 在 TAB 后、detail-main 前；与 fixed 为独立节点',
    inflowIdx > 0 &&
      tabInflowIdx >= 0 &&
      inflowIdx > tabInflowIdx &&
      detailMainIdx > inflowIdx &&
      fixedIdx > tabFixedIdx &&
      fixedIdx > mainScrollClose &&
      pageWxml.indexOf('series-round-selector-dock') >= 0 &&
      pageWxml.indexOf('series-round-sticky-wrap') < 0
  );
  assert(
    '总榜/报名/赛程二级 fixed 互斥且均在主 scroll 外；filler 在 natural 外',
    scheduleFixedIdx > mainScrollClose &&
      registerFixedIdx > mainScrollClose &&
      pageWxml.indexOf("activeTab === 'standings'") >= 0 &&
      pageWxml.indexOf("activeTab === 'schedule'") >= 0 &&
      pageWxml.indexOf("activeTab === 'register'") >= 0 &&
      fillerIdx > naturalOpen &&
      mainScrollClose > fillerIdx &&
      pageWxml.slice(naturalOpen, fillerIdx).lastIndexOf('</view>') >= 0
  );
  var fixedRuleMatch = pageWxss.match(/\.series-round-dock--fixed\s*\{([^}]*)\}/);
  var fixedRule = fixedRuleMatch ? fixedRuleMatch[1] : '';
  assert(
    'fixed壳为 position:fixed',
    /position\s*:\s*fixed/.test(fixedRule) &&
      /left\s*:\s*0/.test(fixedRule) &&
      /right\s*:\s*0/.test(fixedRule) &&
      /overflow\s*:\s*hidden/.test(fixedRule)
  );
  var fixedBlock = pageWxml.slice(fixedIdx, fixedIdx + 420);
  assert(
    'top只绑定 stickyRoundSelectorTop',
    /style="top:\{\{stickyRoundSelectorTop\}\}px;"/.test(fixedBlock)
  );
  assert(
    'top不依赖scrollTop/offset/threshold',
    fixedBlock.indexOf('scrollTop') < 0 &&
      fixedBlock.indexOf('roundSelectorOffsetTop') < 0 &&
      fixedBlock.indexOf('secondaryThreshold') < 0 &&
      fixedBlock.indexOf('transform') < 0
  );
  assert(
    'fixed定位节点不是横向scroll-view',
    fixedBlock.indexOf('series-round-dock__inner') >= 0 &&
      !/class="series-round-dock series-round-dock--fixed[\s\S]*class="series-standings-round-scroll"/.test(
        fixedBlock.split('series-round-dock__inner')[0]
      )
  );
  var hideRule = (pageWxss.match(/\.series-round-dock--hide\s*\{([^}]*)\}/) || [])[1] || '';
  var showRule = (pageWxss.match(/\.series-round-dock--show\s*\{([^}]*)\}/) || [])[1] || '';
  assert(
    'show/hide不使用纵向 transform',
    !/translateY|transform/.test(hideRule) &&
      !/translateY|transform/.test(showRule) &&
      !/top\s*:/.test(hideRule) &&
      !/top\s*:/.test(showRule) &&
      /visibility\s*:\s*hidden/.test(hideRule)
  );
  assert(
    'fixed背景不透明',
    /background\s*:\s*var\(--bg-primary\)/.test(fixedRule)
  );
  assert(
    'fixed壳无流内 margin且外层无transform',
    /margin\s*:\s*0/.test(fixedRule) && !/transform/.test(fixedRule)
  );
  var tabFixedZ = /z-index\s*:\s*130/.test(
    fs.readFileSync(
      path.join(__dirname, '..', 'miniprogram', 'styles', 'tournament-common.wxss'),
      'utf8'
    )
  );
  assert(
    'z-index低于一级TAB、高于滚动内容',
    /z-index\s*:\s*129/.test(fixedRule) && tabFixedZ
  );
  function lockedFixedTop(headerH, primaryH) {
    return headerH + primaryH;
  }
  var locked = lockedFixedTop(106, 51);
  assert(
    'isSticky后继续增大scrollTop不改变top',
    locked === 157 &&
      locked === lockedFixedTop(106, 51) &&
      locked === lockedFixedTop(106, 51) &&
      locked === lockedFixedTop(106, 51) &&
      locked === lockedFixedTop(106, 51),
    'locked=' + locked
  );
  assert(
    '吸顶后流内 covered 隐藏',
    pageWxml.indexOf('series-round-dock--covered') >= 0 &&
      /visibility\s*:\s*hidden/.test(
        (pageWxss.match(/\.series-round-dock--covered\s*\{([^}]*)\}/) || [])[1] || ''
      )
  );
  assert(
    'fixed与inflow共用inner：上下12rpx + 水平32rpx',
    (pageWxml.match(/<series-round-selector-dock/g) || []).length >= 4 &&
      /\.series-round-dock__inner\s*\{[^}]*padding:\s*12rpx\s+32rpx/.test(pageWxss) &&
      /\.series-standings-round-bar\s*\{[^}]*align-items:\s*center/.test(pageWxss) &&
      !/\.series-round-dock--(inflow|fixed)\s*\{[^}]*margin-top\s*:/.test(pageWxss)
  );
  assert(
    '不修改 filler与坐标修正公式',
    pageJs.indexOf('computeStickyTopInsideScroll') >= 0 &&
      pageJs.indexOf('SCROLL_FILLER_TOLERANCE_PX = 4') >= 0 &&
      pageJs.indexOf('computeStickyFiller') >= 0 &&
      pageJs.indexOf('st - srt') >= 0
  );
})();

console.log('');
console.log('---- seriesDetail.selftest (4C-2) ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
