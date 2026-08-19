var mockAvatars = require("./mockAvatars.js");

function buildMatchPlayHoleTimeline(startHole) {
  const n = Number(startHole);
  let start = 1;
  if (Number.isFinite(n)) {
    const h = Math.floor(n);
    if (h >= 1 && h <= 18) start = h;
  }
  const timeline = [];
  for (let i = 0; i < 18; i++) {
    timeline.push(((start - 1 + i) % 18) + 1);
  }
  return timeline;
}

/** actualHole 1–9 → A1–A9；10–18 → B1–B9（仅 HOLE 行文案） */
function formatMatchPlayDisplayHole(actualHole) {
  const h = Number(actualHole);
  if (!Number.isFinite(h) || h < 1 || h > 18) return '';
  if (h <= 9) return 'A' + h;
  return 'B' + (h - 9);
}

/**
 * UI 层列定义：displayHole（HOLE 行）+ actualHole（读成绩/PAR/胜负）
 * @returns {Array<{ displayHole: string, actualHole: number }>}
 */
function buildMatchPlayHoleTimelineColumns(startHole) {
  return buildMatchPlayHoleTimeline(startHole).map((actualHole) => ({
    displayHole: formatMatchPlayDisplayHole(actualHole),
    actualHole: actualHole
  }));
}

/**
 * G5–G8 得分榜 UI 演示数据（仅展示，禁止读 scoreData / leaderboard）
 * 结构对齐原型「比洞赛得分榜展示界面.html」TAB 以下区域
 */
function buildMockMatchPlayScoreboard() {
  const holeNums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const holeLabelsDefault = holeNums.map((n) => formatMatchPlayDisplayHole(n));
  const pars = [4, 5, 4, 3, 4, 4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 3, 4, 5];
  const mkDot = (n, result) => ({
    n: n,
    result: result || '',
    cls:
      result === 'A'
        ? 'mp-sb-dot--a'
        : result === 'B'
          ? 'mp-sb-dot--b'
          : result === 'AS'
            ? 'mp-sb-dot--as'
            : 'empty'
  });
  const mkStatus = (text, lead) => ({
    text: text === 'A/S' ? 'TIED' : text,
    cls:
      lead === 'A' ? 'mp-sb-st--up' : lead === 'B' ? 'mp-sb-st--dn' : lead === 'AS' ? 'mp-sb-st--as' : ''
  });
  const mkScore = (a, b, result) => {
    const pending = a == null && b == null;
    return {
      a: pending ? '-' : String(a),
      b: pending ? '-' : String(b),
      result: result || '',
      splitCls: pending
        ? 'mp-sb-split--pending'
        : result === 'A'
          ? 'mp-sb-split--a'
          : result === 'B'
            ? 'mp-sb-split--b'
            : result === 'AS'
              ? 'mp-sb-split--tie'
              : '',
      empty: false,
      pending: pending
    };
  };

  return {
    teamA: {
      name: '红队',
      score: 13,
      flagUrl: 'https://flagcdn.com/w40/cn.png'
    },
    teamB: {
      name: '蓝队',
      score: 15,
      flagUrl: 'https://flagcdn.com/w40/us.png'
    },
    progressAPercent: 46,
    finishedMatches: 2,
    totalMatches: 3,
    matchesCompleteText: '2/3 MATCHES COMPLETE',
    matches: [
      {
        id: 'mock-mp-1',
        expanded: false,
        winner: 'A',
        phaseLabel: 'FINAL',
        statusMain: '1',
        statusSub: 'UP',
        statusLeadClass: 'mp-sb-lead--a',
        statusLayerClass: 'winner-a',
        sideA: {
          kind: 'single',
          members: [
            {
              userId: 'mock-a1',
              displayName: 'Cameron Young',
              nickname: 'Cameron Young',
              name: 'Cameron Young',
              avatar: mockAvatars.avatarByIndex(0)
            }
          ]
        },
        sideB: {
          kind: 'single',
          members: [
            {
              userId: 'mock-b1',
              displayName: 'Justin Rose',
              nickname: 'Justin Rose',
              name: 'Justin Rose',
              avatar: mockAvatars.avatarByIndex(1)
            }
          ]
        },
        holeDots: [
          mkDot(1, 'A'), mkDot(2, 'AS'), mkDot(3, 'B'), mkDot(4, 'AS'),
          mkDot(5, 'B'), mkDot(6, 'A'), mkDot(7, 'A'), mkDot(8, 'AS'),
          mkDot(9, 'AS'), mkDot(10, 'A'), mkDot(11, 'AS'), mkDot(12, 'A'),
          mkDot(13, 'B'), mkDot(14, 'B'), mkDot(15, 'AS'), mkDot(16, 'B'),
          mkDot(17, 'AS'), mkDot(18, 'A')
        ],
        holeLabels: holeLabelsDefault.slice(),
        pars: pars.slice(),
        statusCells: [
          mkStatus('1UP', 'A'), mkStatus('1UP', 'A'), mkStatus('A/S', 'AS'),
          mkStatus('1UP', 'A'), mkStatus('1UP', 'A'), mkStatus('2UP', 'A'),
          mkStatus('3UP', 'A'), mkStatus('2UP', 'A'), mkStatus('A/S', 'AS'),
          mkStatus('1DN', 'B'), mkStatus('2DN', 'B'), mkStatus('A/S', 'AS'),
          mkStatus('1UP', 'A'), mkStatus('1UP', 'A'), mkStatus('1UP', 'A'),
          mkStatus('2UP', 'A'), mkStatus('1UP', 'A'), mkStatus('1UP', 'A')
        ],
        scoreCells: [
          mkScore(4, 5, 'A'), mkScore(5, 5, 'AS'), mkScore(5, 4, 'B'),
          mkScore(3, 4, 'A'), mkScore(4, 4, 'AS'), mkScore(4, 5, 'A'),
          mkScore(3, 4, 'A'), mkScore(4, 3, 'B'), mkScore(4, 4, 'AS'),
          mkScore(5, 4, 'B'), mkScore(5, 4, 'B'), mkScore(3, 4, 'A'),
          mkScore(4, 5, 'A'), mkScore(4, 3, 'B'), mkScore(4, 4, 'AS'),
          mkScore(3, 4, 'A'), mkScore(4, 4, 'AS'), mkScore(5, 4, 'A')
        ]
      },
      {
        id: 'mock-mp-2',
        expanded: false,
        winner: 'B',
        phaseLabel: 'FINAL',
        statusMain: '3',
        statusSub: '&2',
        statusLeadClass: 'mp-sb-lead--b',
        statusLayerClass: 'winner-b',
        sideA: {
          kind: 'pair',
          members: [
            {
              userId: 'mock-a2',
              displayName: '大雷',
              nickname: '大雷',
              name: '大雷',
              avatar: mockAvatars.avatarByIndex(2)
            },
            {
              userId: 'mock-a3',
              displayName: 'Alex',
              nickname: 'Alex',
              name: 'Alex',
              avatar: mockAvatars.avatarByIndex(3)
            }
          ]
        },
        sideB: {
          kind: 'pair',
          members: [
            {
              userId: 'mock-b2',
              displayName: 'Rahm',
              nickname: 'Rahm',
              name: 'Rahm',
              avatar: mockAvatars.avatarByIndex(4)
            },
            {
              userId: 'mock-b3',
              displayName: 'Scheffler',
              nickname: 'Scheffler',
              name: 'Scheffler',
              avatar: mockAvatars.avatarByIndex(5)
            }
          ]
        },
        holeDots: [
          mkDot(1, 'B'), mkDot(2, 'B'), mkDot(3, 'AS'), mkDot(4, 'B'),
          mkDot(5, 'A'), mkDot(6, 'B'), mkDot(7, 'B'), mkDot(8, 'AS'),
          mkDot(9, 'AS'), mkDot(10, 'B'), mkDot(11, 'B'), mkDot(12, 'B'),
          mkDot(13, 'A'), mkDot(14, 'B'), mkDot(15, 'B'), mkDot(16, 'B'),
          mkDot(17, ''), mkDot(18, '')
        ],
        holeLabels: holeLabelsDefault.slice(),
        pars: pars.slice(),
        statusCells: [
          mkStatus('1DN', 'B'), mkStatus('2DN', 'B'), mkStatus('2DN', 'B'),
          mkStatus('3DN', 'B'), mkStatus('2DN', 'B'), mkStatus('3DN', 'B'),
          mkStatus('4DN', 'B'), mkStatus('4DN', 'B'), mkStatus('4DN', 'B'),
          mkStatus('5DN', 'B'), mkStatus('6DN', 'B'), mkStatus('7DN', 'B'),
          mkStatus('6DN', 'B'), mkStatus('5DN', 'B'), mkStatus('4DN', 'B'),
          mkStatus('3DN', 'B'), mkStatus('-', ''), mkStatus('-', '')
        ],
        scoreCells: [
          mkScore(5, 4, 'B'), mkScore(6, 5, 'B'), mkScore(4, 4, 'AS'),
          mkScore(4, 3, 'B'), mkScore(4, 5, 'A'), mkScore(5, 4, 'B'),
          mkScore(5, 4, 'B'), mkScore(3, 3, 'AS'), mkScore(4, 4, 'AS'),
          mkScore(6, 5, 'B'), mkScore(5, 4, 'B'), mkScore(4, 3, 'B'),
          mkScore(3, 4, 'A'), mkScore(5, 4, 'B'), mkScore(5, 4, 'B'),
          mkScore(4, 3, 'B'), mkScore(null, null, ''), mkScore(null, null, '')
        ]
      },
      {
        id: 'mock-mp-3',
        expanded: false,
        winner: 'AS',
        phaseLabel: 'THRU 12',
        statusMain: 'TIED',
        statusSub: '',
        statusLeadClass: 'mp-sb-lead--as',
        statusLayerClass: 'all-square',
        sideA: {
          kind: 'single',
          members: [
            {
              userId: 'mock-a4',
              displayName: 'Brooks Koepka',
              nickname: 'Brooks Koepka',
              name: 'Brooks Koepka',
              avatar: mockAvatars.avatarByIndex(6)
            }
          ]
        },
        sideB: {
          kind: 'single',
          members: [
            {
              userId: 'mock-b4',
              displayName: 'Ludvig Aberg',
              nickname: 'Ludvig Aberg',
              name: 'Ludvig Aberg',
              avatar: mockAvatars.avatarByIndex(7)
            }
          ]
        },
        holeDots: holeNums.map((n) =>
          n <= 12 ? mkDot(n, n % 3 === 0 ? 'AS' : n % 2 === 0 ? 'B' : 'A') : mkDot(n, '')
        ),
        holeLabels: holeLabelsDefault.slice(),
        pars: pars.slice(),
        statusCells: holeNums.map((n) =>
          n <= 12 ? mkStatus(n % 4 === 0 ? 'A/S' : '1UP', n % 4 === 0 ? 'AS' : 'A') : mkStatus('-', '')
        ),
        scoreCells: holeNums.map((n) =>
          n <= 12
            ? mkScore(4, n % 2 === 0 ? 5 : 4, n % 3 === 0 ? 'AS' : n % 2 === 0 ? 'A' : 'B')
            : mkScore(null, null, '')
        )
      }
    ]
  };
}

module.exports = {
  buildMatchPlayHoleTimeline: buildMatchPlayHoleTimeline,
  formatMatchPlayDisplayHole: formatMatchPlayDisplayHole,
  buildMatchPlayHoleTimelineColumns: buildMatchPlayHoleTimelineColumns,
  buildMockMatchPlayScoreboard: buildMockMatchPlayScoreboard
};
