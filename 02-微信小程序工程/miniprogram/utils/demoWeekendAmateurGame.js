/**
 * 首页演示 GAME「周末业余挑战赛」
 * 源数据：开发者工具 Storage 中 g-1785683242181（演示范例）深拷贝固化；
 * 仅改 gameId / roundName，不重算组合与成绩。
 */

const gameStore = require('./gameStore.js');

const DEMO_WEEKEND_AMATEUR_GAME_ID = 'demo-weekend-amateur';
const DEMO_WEEKEND_AMATEUR_TITLE = '周末业余挑战赛';

/** 固化种子（深拷贝自源 GAME；运行时 ensure 再深拷贝一份写入 Storage） */
const DEMO_WEEKEND_AMATEUR_GAME_SEED = {
  "gameId": "demo-weekend-amateur",
  "courseId": "c-qhw",
  "courseName": "北京清河湾高尔夫乡村俱乐部 A&B",
  "courseLocation": "北京 · 昌平",
  "front9Course": "A",
  "back9Course": "B",
  "courseHalfText": "（A/B）",
  "teeTime": "2026年05月04日 周一 09:40",
  "roundName": "周末业余挑战赛",
  "gameMode": "最佳球位赛",
  "groupCompositionMap": {
    "grp-1": {
      "groupId": "grp-1",
      "groupIndex": 0,
      "playerCount": 4,
      "compositionType": "2+2",
      "teamMode": "split_team",
      "teams": [
        {
          "teamIndex": 1,
          "teamId": "team-1",
          "name": "队伍 1",
          "type": "pair",
          "players": [
            {
              "playerId": "me",
              "userId": "me",
              "name": "TIGERHOODS",
              "avatar": "/assets/mock-avatars/mock-avatar-01.jpg",
              "gender": "",
              "tPosition": "",
              "tee": ""
            },
            {
              "playerId": "fr-1003",
              "userId": "fr-1003",
              "name": "阿杰",
              "avatar": "/assets/mock-avatars/mock-avatar-03.jpg",
              "gender": "male",
              "tPosition": "BLUE_T",
              "tee": "BLUE_T"
            }
          ],
          "members": [
            {
              "playerId": "me",
              "userId": "me",
              "name": "TIGERHOODS",
              "avatar": "/assets/mock-avatars/mock-avatar-01.jpg",
              "gender": "",
              "tPosition": "",
              "tee": ""
            },
            {
              "playerId": "fr-1003",
              "userId": "fr-1003",
              "name": "阿杰",
              "avatar": "/assets/mock-avatars/mock-avatar-03.jpg",
              "gender": "male",
              "tPosition": "BLUE_T",
              "tee": "BLUE_T"
            }
          ]
        },
        {
          "teamIndex": 2,
          "teamId": "team-2",
          "name": "队伍 2",
          "type": "pair",
          "players": [
            {
              "playerId": "fr-1005",
              "userId": "fr-1005",
              "name": "老张",
              "avatar": "/assets/mock-avatars/mock-avatar-05.jpg",
              "gender": "",
              "tPosition": "",
              "tee": ""
            },
            {
              "playerId": "fr-1008",
              "userId": "fr-1008",
              "name": "陈浩",
              "avatar": "/assets/mock-avatars/mock-avatar-08.jpg",
              "gender": "",
              "tPosition": "",
              "tee": ""
            }
          ],
          "members": [
            {
              "playerId": "fr-1005",
              "userId": "fr-1005",
              "name": "老张",
              "avatar": "/assets/mock-avatars/mock-avatar-05.jpg",
              "gender": "",
              "tPosition": "",
              "tee": ""
            },
            {
              "playerId": "fr-1008",
              "userId": "fr-1008",
              "name": "陈浩",
              "avatar": "/assets/mock-avatars/mock-avatar-08.jpg",
              "gender": "",
              "tPosition": "",
              "tee": ""
            }
          ]
        }
      ],
      "seats": [
        {
          "seatIndex": 1,
          "teamId": "team-1",
          "playerId": "me",
          "name": "TIGERHOODS",
          "avatar": "/assets/mock-avatars/mock-avatar-01.jpg",
          "gender": "",
          "tPosition": "",
          "tee": ""
        },
        {
          "seatIndex": 2,
          "teamId": "team-1",
          "playerId": "fr-1003",
          "name": "阿杰",
          "avatar": "/assets/mock-avatars/mock-avatar-03.jpg",
          "gender": "male",
          "tPosition": "BLUE_T",
          "tee": "BLUE_T"
        },
        {
          "seatIndex": 3,
          "teamId": "team-2",
          "playerId": "fr-1005",
          "name": "老张",
          "avatar": "/assets/mock-avatars/mock-avatar-05.jpg",
          "gender": "",
          "tPosition": "",
          "tee": ""
        },
        {
          "seatIndex": 4,
          "teamId": "team-2",
          "playerId": "fr-1008",
          "name": "陈浩",
          "avatar": "/assets/mock-avatars/mock-avatar-08.jpg",
          "gender": "",
          "tPosition": "",
          "tee": ""
        }
      ],
      "scoringTemplate": "team_best"
    }
  },
  "composition": {
    "type": "2+2",
    "single": false,
    "teams": [
      {
        "teamIndex": 1,
        "teamId": "team-1",
        "name": "队伍 1",
        "type": "pair",
        "players": [
          {
            "playerId": "me",
            "userId": "me",
            "name": "TIGERHOODS",
            "avatar": "/assets/mock-avatars/mock-avatar-01.jpg",
            "gender": "",
            "tPosition": "",
            "tee": ""
          },
          {
            "playerId": "fr-1003",
            "userId": "fr-1003",
            "name": "阿杰",
            "avatar": "/assets/mock-avatars/mock-avatar-03.jpg",
            "gender": "male",
            "tPosition": "BLUE_T",
            "tee": "BLUE_T"
          }
        ],
        "members": [
          {
            "playerId": "me",
            "userId": "me",
            "name": "TIGERHOODS",
            "avatar": "/assets/mock-avatars/mock-avatar-01.jpg",
            "gender": "",
            "tPosition": "",
            "tee": ""
          },
          {
            "playerId": "fr-1003",
            "userId": "fr-1003",
            "name": "阿杰",
            "avatar": "/assets/mock-avatars/mock-avatar-03.jpg",
            "gender": "male",
            "tPosition": "BLUE_T",
            "tee": "BLUE_T"
          }
        ]
      },
      {
        "teamIndex": 2,
        "teamId": "team-2",
        "name": "队伍 2",
        "type": "pair",
        "players": [
          {
            "playerId": "fr-1005",
            "userId": "fr-1005",
            "name": "老张",
            "avatar": "/assets/mock-avatars/mock-avatar-05.jpg",
            "gender": "",
            "tPosition": "",
            "tee": ""
          },
          {
            "playerId": "fr-1008",
            "userId": "fr-1008",
            "name": "陈浩",
            "avatar": "/assets/mock-avatars/mock-avatar-08.jpg",
            "gender": "",
            "tPosition": "",
            "tee": ""
          }
        ],
        "members": [
          {
            "playerId": "fr-1005",
            "userId": "fr-1005",
            "name": "老张",
            "avatar": "/assets/mock-avatars/mock-avatar-05.jpg",
            "gender": "",
            "tPosition": "",
            "tee": ""
          },
          {
            "playerId": "fr-1008",
            "userId": "fr-1008",
            "name": "陈浩",
            "avatar": "/assets/mock-avatars/mock-avatar-08.jpg",
            "gender": "",
            "tPosition": "",
            "tee": ""
          }
        ]
      }
    ],
    "scoringTemplate": "team_best",
    "seats": [
      {
        "seatIndex": 1,
        "teamId": "team-1",
        "playerId": "me",
        "name": "TIGERHOODS",
        "avatar": "/assets/mock-avatars/mock-avatar-01.jpg",
        "gender": "",
        "tPosition": "",
        "tee": ""
      },
      {
        "seatIndex": 2,
        "teamId": "team-1",
        "playerId": "fr-1003",
        "name": "阿杰",
        "avatar": "/assets/mock-avatars/mock-avatar-03.jpg",
        "gender": "male",
        "tPosition": "BLUE_T",
        "tee": "BLUE_T"
      },
      {
        "seatIndex": 3,
        "teamId": "team-2",
        "playerId": "fr-1005",
        "name": "老张",
        "avatar": "/assets/mock-avatars/mock-avatar-05.jpg",
        "gender": "",
        "tPosition": "",
        "tee": ""
      },
      {
        "seatIndex": 4,
        "teamId": "team-2",
        "playerId": "fr-1008",
        "name": "陈浩",
        "avatar": "/assets/mock-avatars/mock-avatar-08.jpg",
        "gender": "",
        "tPosition": "",
        "tee": ""
      }
    ]
  },
  "scoringTemplate": "team_best",
  "visibility": "public",
  "accessCode": null,
  "playersSlots": [
    {
      "playerId": "me",
      "name": "TIGERHOODS",
      "avatar": "/assets/mock-avatars/mock-avatar-01.jpg",
      "gender": "",
      "tPosition": ""
    },
    {
      "playerId": "fr-1003",
      "name": "阿杰",
      "avatar": "/assets/mock-avatars/mock-avatar-03.jpg",
      "gender": "",
      "tPosition": ""
    },
    {
      "playerId": "fr-1005",
      "name": "老张",
      "avatar": "/assets/mock-avatars/mock-avatar-05.jpg",
      "gender": "",
      "tPosition": ""
    },
    {
      "playerId": "fr-1008",
      "name": "陈浩",
      "avatar": "/assets/mock-avatars/mock-avatar-08.jpg",
      "gender": "",
      "tPosition": ""
    }
  ],
  "groups": [
    {
      "groupId": "grp-1",
      "name": "第1组",
      "status": "not_started",
      "playersSlots": [
        {
          "playerId": "me",
          "name": "TIGERHOODS",
          "avatar": "/assets/mock-avatars/mock-avatar-01.jpg",
          "gender": "",
          "tPosition": ""
        },
        {
          "playerId": "fr-1003",
          "name": "阿杰",
          "avatar": "/assets/mock-avatars/mock-avatar-03.jpg",
          "gender": "",
          "tPosition": ""
        },
        {
          "playerId": "fr-1005",
          "name": "老张",
          "avatar": "/assets/mock-avatars/mock-avatar-05.jpg",
          "gender": "",
          "tPosition": ""
        },
        {
          "playerId": "fr-1008",
          "name": "陈浩",
          "avatar": "/assets/mock-avatars/mock-avatar-08.jpg",
          "gender": "",
          "tPosition": ""
        }
      ],
      "scoresByPlayer": {
        "me": {
          "scores": [],
          "putts": [],
          "fairways": [],
          "penalties": [],
          "sands": []
        },
        "fr-1003": {
          "scores": [],
          "putts": [],
          "fairways": [],
          "penalties": [],
          "sands": []
        },
        "fr-1005": {
          "scores": [],
          "putts": [],
          "fairways": [],
          "penalties": [],
          "sands": []
        },
        "fr-1008": {
          "scores": [],
          "putts": [],
          "fairways": [],
          "penalties": [],
          "sands": []
        }
      },
      "composition": {
        "groupId": "grp-1",
        "groupIndex": 0,
        "playerCount": 4,
        "compositionType": "2+2",
        "teamMode": "split_team",
        "teams": [
          {
            "teamIndex": 1,
            "teamId": "team-1",
            "name": "队伍 1",
            "type": "pair",
            "players": [
              {
                "playerId": "me",
                "userId": "me",
                "name": "TIGERHOODS",
                "avatar": "/assets/mock-avatars/mock-avatar-01.jpg",
                "gender": "",
                "tPosition": "",
                "tee": ""
              },
              {
                "playerId": "fr-1003",
                "userId": "fr-1003",
                "name": "阿杰",
                "avatar": "/assets/mock-avatars/mock-avatar-03.jpg",
                "gender": "male",
                "tPosition": "BLUE_T",
                "tee": "BLUE_T"
              }
            ],
            "members": [
              {
                "playerId": "me",
                "userId": "me",
                "name": "TIGERHOODS",
                "avatar": "/assets/mock-avatars/mock-avatar-01.jpg",
                "gender": "",
                "tPosition": "",
                "tee": ""
              },
              {
                "playerId": "fr-1003",
                "userId": "fr-1003",
                "name": "阿杰",
                "avatar": "/assets/mock-avatars/mock-avatar-03.jpg",
                "gender": "male",
                "tPosition": "BLUE_T",
                "tee": "BLUE_T"
              }
            ]
          },
          {
            "teamIndex": 2,
            "teamId": "team-2",
            "name": "队伍 2",
            "type": "pair",
            "players": [
              {
                "playerId": "fr-1005",
                "userId": "fr-1005",
                "name": "老张",
                "avatar": "/assets/mock-avatars/mock-avatar-05.jpg",
                "gender": "",
                "tPosition": "",
                "tee": ""
              },
              {
                "playerId": "fr-1008",
                "userId": "fr-1008",
                "name": "陈浩",
                "avatar": "/assets/mock-avatars/mock-avatar-08.jpg",
                "gender": "",
                "tPosition": "",
                "tee": ""
              }
            ],
            "members": [
              {
                "playerId": "fr-1005",
                "userId": "fr-1005",
                "name": "老张",
                "avatar": "/assets/mock-avatars/mock-avatar-05.jpg",
                "gender": "",
                "tPosition": "",
                "tee": ""
              },
              {
                "playerId": "fr-1008",
                "userId": "fr-1008",
                "name": "陈浩",
                "avatar": "/assets/mock-avatars/mock-avatar-08.jpg",
                "gender": "",
                "tPosition": "",
                "tee": ""
              }
            ]
          }
        ],
        "seats": [
          {
            "seatIndex": 1,
            "teamId": "team-1",
            "playerId": "me",
            "name": "TIGERHOODS",
            "avatar": "/assets/mock-avatars/mock-avatar-01.jpg",
            "gender": "",
            "tPosition": "",
            "tee": ""
          },
          {
            "seatIndex": 2,
            "teamId": "team-1",
            "playerId": "fr-1003",
            "name": "阿杰",
            "avatar": "/assets/mock-avatars/mock-avatar-03.jpg",
            "gender": "male",
            "tPosition": "BLUE_T",
            "tee": "BLUE_T"
          },
          {
            "seatIndex": 3,
            "teamId": "team-2",
            "playerId": "fr-1005",
            "name": "老张",
            "avatar": "/assets/mock-avatars/mock-avatar-05.jpg",
            "gender": "",
            "tPosition": "",
            "tee": ""
          },
          {
            "seatIndex": 4,
            "teamId": "team-2",
            "playerId": "fr-1008",
            "name": "陈浩",
            "avatar": "/assets/mock-avatars/mock-avatar-08.jpg",
            "gender": "",
            "tPosition": "",
            "tee": ""
          }
        ],
        "scoringTemplate": "team_best"
      },
      "scoresBySlot": [],
      "teamScoresByEntity": [
        {
          "teamId": "team-1",
          "scores": [],
          "putts": []
        },
        {
          "teamId": "team-2",
          "scores": [],
          "putts": []
        }
      ]
    }
  ],
  "status": "active",
  "currentRound": 1,
  "createdBy": "me",
  "creatorId": "me",
  "creatorGroupIndex": 0,
  "creatorInGame": true,
  "createdAt": 1785683242181,
  "scoresBySlot": []
};

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** 返回演示 GAME 深拷贝（不写 Storage） */
function getDemoWeekendAmateurGame() {
  return deepClone(DEMO_WEEKEND_AMATEUR_GAME_SEED);
}

/**
 * 确保 demo-weekend-amateur 已在 gameStore：
 * - 不存在 → saveGame 写入种子深拷贝
 * - 已存在 → 不覆盖（保留用户测试数据）
 */
function ensureDemoWeekendAmateurGame() {
  const existing = gameStore.getGame(DEMO_WEEKEND_AMATEUR_GAME_ID);
  if (existing) return existing;
  const next = getDemoWeekendAmateurGame();
  gameStore.saveGame(next);
  return next;
}

function isDemoWeekendAmateurGameId(gameId) {
  return String(gameId || '') === DEMO_WEEKEND_AMATEUR_GAME_ID;
}

module.exports = {
  DEMO_WEEKEND_AMATEUR_GAME_ID,
  DEMO_WEEKEND_AMATEUR_TITLE,
  getDemoWeekendAmateurGame,
  ensureDemoWeekendAmateurGame,
  isDemoWeekendAmateurGameId
};
