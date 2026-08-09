/**
 * 共享球员互动动画层（记分页 / 赛事详情讨论区共用）。
 * 播放逻辑自记分页抽取；不读写成绩。
 */

const scoreReactionController = require('../../utils/scoreReactionController.js');
const reactionPanelConfig = require('../../../../utils/reactionPanelConfig.js');
const reactionSounds = require('../../utils/reactionSounds.js');
const gameStore = require('../../../../utils/gameStore.js');
const demoWeekendAmateurGame = require('../../../../utils/demoWeekendAmateurGame.js');
const playerActionModalUtil = require('../../../../utils/playerActionModal.js');
const rocketReactionTimeline = require('../../utils/rocketReactionTimeline.js');
const boxingReactionTimeline = require('../../utils/boxingReactionTimeline.js');
const flowerReactionTimeline = require('../../utils/flowerReactionTimeline.js');
const beerReactionTimeline = require('../../utils/beerReactionTimeline.js');
const kissReactionTimeline = require('../../utils/kissReactionTimeline.js');
const eggReactionTimeline = require('../../utils/eggReactionTimeline.js');
const tomatoReactionTimeline = require('../../utils/tomatoReactionTimeline.js');
const bucketReactionTimeline = require('../../utils/bucketReactionTimeline.js');

const isSameUserIdentity = playerActionModalUtil.isSameUserIdentity;
function scoreDebugLog() {}

Component({
  options: {
    styleIsolation: 'isolated',
    pureDataPattern: /^_/
  },

  properties: {},

  data: {
    playerActionTarget: null,
    /** Demo：🍅 飞行动画层（旧：命中头像；现 demo 改撞屏，保留字段以免残留） */
    playerActionTomatoVisible: false,
    playerActionTomatoAnimating: false,
    playerActionTomatoStyle: '',
    /** Demo：命中反馈（爆裂 / 汁水 / 震动；不写头像数据） */
    playerActionBurstVisible: false,
    playerActionBurstStyle: '',
    /** Demo：🍅 汁液 — fixed 锚定目标头像（不进成绩列表，避免邻头像闪白） */
    playerActionJuiceVisible: false,
    playerActionJuiceStyle: '',
    playerActionHitPlayerId: '',
    /** Demo：第一视角 reaction-screen-layer（tomato | flower） */
    reactionScreenVisible: false,
    reactionScreenFading: false,
    reactionScreenMode: '', // tomato | flower | egg | boxing | kiss | beer | rocket
    /** Demo：🚀 Self 终极火箭（双爆炸 + 飞天 + 变形） */
    reactionRocketFlyVisible: false,
    reactionRocketFlyStyle: '',
    reactionRocketBlastVisible: false,
    reactionRocketBlastStyle: '',
    reactionRocketBlastBurst: false,
    /** large | small */
    reactionRocketBlastSize: '',
    reactionRocketShaking: false,
    reactionRocketAvatarVisible: false,
    reactionRocketAvatarUrl: '',
    reactionRocketAvatarStyle: '',
    /** center|hit|launch|fall|final_face|return|land|land_smoke|restore */
    reactionRocketAvatarPhase: '',
    reactionRocketBlastFace: false,
    reactionRocketHairPop: false,
    reactionRocketSmokeCover: false,
    reactionRocketSmokeClearing: false,
    reactionRocketFaceShake: false,
    reactionRocketSmokeActive: false,
    /** 飞天烟雾尾迹 */
    reactionRocketTrailVisible: false,
    /** 落座后头顶青烟 */
    reactionRocketLandSmoke: false,
    reactionRocketLandSmokeFading: false,
    /** normal | black | eyes_only | restore — 独立卡通脸，不改原头像 */
    rocketFaceMode: 'normal',
    rocketBlackFaceSrc: '/subpackages/reaction/assets/reaction/rocket_black_face.png',
    rocketEyesOnlyFaceSrc:
      '/subpackages/reaction/assets/reaction/rocket_eyes_only_face.png',
    /** Demo：🍺 干杯（beer-screen-reaction；self 第一视角 / observer 第三视角） */
    reactionBeerMainVisible: false,
    reactionBeerMainPhase: '', // fly | hold | clash | fade | ready
    reactionBeerMainStyle: '',
    reactionBeerLeftVisible: false,
    reactionBeerLeftPhase: '',
    reactionBeerLeftStyle: '',
    reactionBeerRightVisible: false,
    reactionBeerRightPhase: '',
    reactionBeerRightStyle: '',
    reactionBeerSplashVisible: false,
    reactionBeerSplashStyle: '',
    reactionBeerFlashVisible: false,
    reactionBeerFlashStyle: '',
    reactionBeerShaking: false,
    reactionBeerBubbles: [],
    /** Demo：🍺 Self 第一视角双杯碰杯标记 */
    reactionBeerIsSelf: false,
    /** Demo：👄 亲吻（kiss-screen-reaction；原 🚗 入口） */
    reactionKissLipsVisible: false,
    reactionKissLipsStyle: '',
    reactionKissLipsPhase: '', // fly | hit | hold | fade
    /** Demo：👄 嘴唇开合：idle | close | open（同 kiss_lips.png，CSS 形变） */
    reactionKissLipsMouth: 'idle',
    /** Demo：👄 接触压力缩放脉冲（1 → 1.1 → 1） */
    reactionKissLipsPress: false,
    reactionKissHearts: [],
    /** Demo：👄 Self 近镜头增强（不影响 observer） */
    reactionKissIsSelf: false,
    /** Demo：👄 Self 中央临时头像 + 害羞卡通脸（与 Observer 分离） */
    reactionKissSelfAvatarVisible: false,
    reactionKissSelfAvatarUrl: '',
    reactionKissSelfAvatarStyle: '',
    reactionKissSelfAvatarPhase: '', // seat|center|kiss|shy|return|seat|restore
    reactionKissSelfShyVisible: false,
    /** Demo：👄 Self 临时层模式：normal | kissShy | restore（独立卡通脸，不改原头像） */
    reactionAvatarMode: 'normal',
    showKissShyFace: false,
    kissShyFaceSrc: '/subpackages/reaction/assets/reaction/kiss_shy_face.png',
    /** Demo：👄 Self 纯嘟嘴亲吻素材（非 emoji） */
    kissLipsSrc: '/subpackages/reaction/assets/reaction/kiss_lips.png',
    reactionKissSelfHeartsFading: false,
    /** @deprecated reaction-view-model-v2：kiss Observer 层已移除 */
    reactionKissTargetVisible: false,
    reactionKissTargetStyle: '',
    reactionKissTargetLipsStyle: '',
    reactionKissTargetHearts: [],
    reactionTomatoFlyVisible: false,
    reactionTomatoFlyStyle: '',
    reactionTomatoSplashVisible: false,
    reactionTomatoImpactPhase: '', // impact | burst | flow
    reactionTomatoJuiceActive: false,
    reactionTomatoDripActive: false,
    /** Demo：🍅 Observer 头像挂汁层样式 / 淡出 */
    reactionTomatoJuiceStyle: '',
    reactionTomatoJuiceFading: false,
    reactionTomatoHitStyle: '',
    reactionTomatoAnchorMode: '', // self | avatar（Self/Observer 分离）
    /** Demo：🍅 Self 中央临时头像 + cartoon tomato face */
    reactionTomatoSelfAvatarVisible: false,
    reactionTomatoSelfAvatarUrl: '',
    reactionTomatoSelfAvatarStyle: '',
    reactionTomatoSelfAvatarPhase: '', // seat|center|hit|hold|return|restore
    reactionTomatoSelfShake: false,
    reactionTomatoSelfFaceVisible: false,
    reactionTomatoSelfDripHold: false,
    /** Demo：🪣 Self 中央头像浇水（与 Observer 座位倒水分离） */
    reactionBucketScreenActive: false,
    reactionBucketScreenPouring: false,
    reactionBucketSelfAvatarVisible: false,
    reactionBucketSelfAvatarUrl: '',
    reactionBucketSelfAvatarStyle: '',
    reactionBucketSelfAvatarPhase: '', // seat|center|wet|return|restore
    reactionBucketSelfBucketVisible: false,
    reactionBucketSelfBucketStyle: '',
    reactionBucketSelfBucketDropping: false,
    reactionBucketSelfBucketPouring: false,
    reactionBucketSelfStreamVisible: false,
    reactionBucketSelfStreamStyle: '',
    reactionBucketSelfWetVisible: false,
    reactionBucketSelfCartoonWet: false,
    reactionBucketSelfDripHold: false,
    /** Demo：🌹 第一视角花雨（flower-screen-reaction；随机花束） */
    reactionFlowerFlyVisible: false,
    reactionFlowerFlyStyle: '',
    reactionFlowerFlyEmoji: '🌹',
    reactionFlowerItems: [],
    reactionFlowerPetals: [],
    /** Demo：🥚 第一视角连击砸屏（egg-screen-reaction；不改头像连击） */
    reactionEggFlies: [],
    reactionEggHitLevel: 0,
    reactionEggBurstVisible: false,
    reactionEggBurstFinale: false,
    reactionEggBurstStyle: '',
    reactionEggFinaleActive: false,
    reactionEggShake: false,
    /** Demo：🥚 Self 中央临时头像 + cartoon egg face（与 Observer 座位层分离） */
    reactionEggSelfAvatarVisible: false,
    reactionEggSelfAvatarUrl: '',
    reactionEggSelfAvatarStyle: '',
    reactionEggSelfAvatarPhase: '', // seat|center|hit|overlay|hold|return|restore
    reactionEggSelfFaceVisible: false,
    reactionEggSelfDripHold: false,
    reactionEggSelfDirection: 'right',
    /** Demo：👊 第三人称卡通拳击（boxing-reaction-layer；克隆头像变形，不改原头像/成绩） */
    reactionBoxingAvatarUrl: '',
    reactionBoxingShellStyle: '',
    reactionBoxingBodyStyle: '',
    reactionBoxingMaskStyle: '',
    reactionBoxingGloveLeftPhase: '', // punch | ''
    reactionBoxingGloveRightPhase: '', // punch | charge | strike | ''
    reactionBoxingImpactVisible: false,
    reactionBoxingImpactWord: '',
    reactionBoxingImpactSide: '', // left | right | finale
    reactionBoxingShake: false,
    /** Demo：👊 临时层：normal | boxing_sad | boxing_dizzy | restore */
    boxingFaceMode: 'normal',
    boxingSadFaceSrc: '/subpackages/reaction/assets/reaction/boxing_sad_face_blue.png',
    /** Demo：👊 @螺旋眼睛 / 落座后转 2 圈 */
    reactionBoxingSpiralEyes: false,
    reactionBoxingEyesSpinning: false,
    /** Demo：👊 击晕阶段（boxing-dizzy-layer 头顶星星环） */
    reactionBoxingDizzy: false,
    reactionBoxingDizzyStarCount: 3,
    /** Demo：👊 boxing 离位 — 记分行原头像暂隐（占位尺寸保留） */
    reactionAvatarDetached: false,
    reactionAvatarDetachedPlayerId: '',
    /** 当前播放 Reaction Mode：self | observer | ''（与 reactionPanelConfig.mode 对齐） */
    reactionActiveMode: '',
    /** Demo：🪣 水桶动画（独立于🍅轨迹） */
    playerActionBucketVisible: false,
    playerActionBucketDropping: false,
    playerActionBucketPouring: false,
    playerActionBucketStyle: '',
    /** Demo：🪣 湿水 — fixed 锚定目标头像 */
    playerActionWaterVisible: false,
    playerActionWaterStyle: '',
    playerActionWaterDripVisible: false,
    playerActionWaterDripStyle: '',
    playerActionWaterFloodVisible: false,
    playerActionWaterFloodStyle: '',
    /** Demo：🌹 送花动画（独立于🍅/🪣；随机花束） */
    playerActionFlowerVisible: false,
    playerActionFlowerBloom: false,
    playerActionFlowerStyle: '',
    playerActionFlowerEmoji: '🌹',
    playerActionPetalVisible: false,
    playerActionPetalStyle: '',
    playerActionPetalItems: [],
    /** Demo：🌹 仅目标头像轻缩放（局部，无全局 glow/flash） */
    playerActionFlowerScalePlayerId: '',
    /** Demo：🌹 命中后自然花环（围绕头像） */
    playerActionWreathVisible: false,
    playerActionWreathAppear: false,
    playerActionWreathExpand: false,
    playerActionWreathFading: false,
    playerActionWreathStyle: '',
    playerActionWreathItems: [],
    /** Demo：🥚 连击（独立于🍅/🪣/🌹；糊脸层 fixed 锚定头像，不写盘） */
    playerActionEggs: [],
    playerActionEggSplatVisible: false,
    /** 结束清理：先隐藏卸合成层，再 wx:if 销毁（防乳白残留） */
    playerActionEggSplatHiding: false,
    playerActionEggSplatStyle: '',
    playerActionEggLevel: 0,
    playerActionEggFinale: false,

  },

  lifetimes: {
    attached() {
      this._reactionHost = null;
      this._reactionTarget = null;
      try { reactionSounds.warmReactionSounds(); } catch (e) {}
      // 通知宿主：跨分包 placeholder 已替换为真实组件，可 selectComponent / playReaction
      try {
        this.triggerEvent('ready');
      } catch (e) {
        /* ignore */
      }
      const self = this;
      const rawSetData = this.setData.bind(this);
      this.setData = function (patch, cb) {
        if (patch && typeof patch === 'object') {
          if (patch.playerActionSheetVisible === false) {
            try { self.triggerEvent('closemodal'); } catch (e) {}
            delete patch.playerActionSheetVisible;
          }
          // 记分行座位视觉（detach / flower pulse）在页面侧，需同步
          const host = self._reactionHost || {};
          const seat = {};
          if ('reactionAvatarDetached' in patch) {
            seat.reactionAvatarDetached = patch.reactionAvatarDetached;
          }
          if ('reactionAvatarDetachedPlayerId' in patch) {
            seat.reactionAvatarDetachedPlayerId = patch.reactionAvatarDetachedPlayerId;
          }
          if ('reactionActiveMode' in patch) {
            seat.reactionActiveMode = patch.reactionActiveMode;
          }
          if ('playerActionFlowerScalePlayerId' in patch) {
            seat.playerActionFlowerScalePlayerId = patch.playerActionFlowerScalePlayerId;
          }
          if (Object.keys(seat).length) {
            if (typeof host.onSeatVisualState === 'function') {
              try { host.onSeatVisualState(seat); } catch (e) {}
            }
            // 跨分包可靠通知：WXML bind:seatvisualstate（勿靠属性传函数）
            try { self.triggerEvent('seatvisualstate', seat); } catch (e) {}
            if ('reactionAvatarDetached' in seat) {
              if (seat.reactionAvatarDetached) {
                try {
                  // 透传当前播放 key，供讨论区宿主按 shouldDetachDiscussionReaction 判断
                  self._emitSeatDetachEvent(
                    self._playingReactionKey ||
                      self.data.reactionScreenMode ||
                      '',
                    seat.reactionAvatarDetachedPlayerId
                  );
                } catch (e) {}
              } else {
                try { self._emitSeatRestoreEvent(); } catch (e) {}
              }
            }
          }
        }
        return rawSetData(patch, cb);
      };
    },
    detached() {
      this.clearAllReactions();
      try { reactionSounds.destroyReactionSounds(); } catch (e) {}
    }
  },

  pageLifetimes: {
    hide() { this.clearAllReactions(); }
  },

  methods: {
    /** 宿主注入：queryAvatarRect / canOpenReaction / getReactionCtx / ... */
    setReactionHost(host) {
      this._reactionHost = host && typeof host === 'object' ? host : null;
    },

    _hostGameId() {
      const host = this._reactionHost || {};
      if (host.gameId != null && String(host.gameId).trim()) {
        return String(host.gameId).trim();
      }
      return '';
    },

    /**
     * 讨论区/宿主：目标头像 detach（任意可播动画都通知；不按 self/observer 过滤）。
     * 使用 triggerEvent，供页面 bind:seatdetach。
     */
    _emitSeatDetachEvent(reactionKey, playerIdOverride) {
      const target =
        this._reactionTarget || this.data.playerActionTarget || null;
      const pidFromTarget =
        target && (target.playerId || target.userId) != null
          ? String(target.playerId || target.userId).trim()
          : '';
      const playerId =
        playerIdOverride != null && String(playerIdOverride).trim()
          ? String(playerIdOverride).trim()
          : pidFromTarget;
      const detail = {
        playerId: playerId,
        reactionKey: reactionKey != null ? String(reactionKey).trim() : '',
        target: target,
        messageIndex:
          target && target.index != null && target.index !== ''
            ? target.index
            : null
      };
      try {
        this.triggerEvent('seatdetach', detail);
      } catch (e) {
        /* ignore */
      }
    },

    /** 讨论区/宿主：恢复目标头像。bind:seatrestore */
    _emitSeatRestoreEvent() {
      try {
        this.triggerEvent('seatrestore', {});
      } catch (e) {
        /* ignore */
      }
    },

    /**
     * 统一播放入口。
     * @param {string} key
     * @param {object} target playerActionTarget
     * @param {object=} host
     */
    playReaction(key, target, host) {
      if (host) this.setReactionHost(host);
      const k = key != null ? String(key).trim() : '';
      const t = target && typeof target === 'object' ? target : null;
      this._reactionTarget = t;
      this._playingReactionKey = k;
      this.setData({ playerActionTarget: t });
      // 播放真正开始：通知宿主；是否隐藏由宿主 shouldDetachDiscussionReaction(key) 决定
      if (k && t) {
        this._emitSeatDetachEvent(k, t.playerId || t.userId);
      }
      const fakeEvent = { detail: { key: k } };
      this.onPlayerActionReactionItemTap(fakeEvent);
    },

    clearAllReactions() {
      try { this._clearRocketReactionTimers(); } catch (e) {}
      try { this._clearKissReactionTimers(); } catch (e) {}
      try { this._clearBeerReactionTimers(); } catch (e) {}
      try { this._clearPlayerActionBoxingTimers(); } catch (e) {}
      try { this._clearPlayerActionTomatoTimers(); } catch (e) {}
      try { this._clearPlayerActionBucketTimers(); } catch (e) {}
      try { this._clearPlayerActionEggTimers(); } catch (e) {}
      try { this._clearPlayerActionFlowerTimers(); } catch (e) {}
      try { this._cleanupRocketReactionLayer(); } catch (e) {}
      try { this._cleanupBeerReactionLayer(); } catch (e) {}
      const clearPatch = this._buildReactionAvatarDetachedClearPatch
        ? this._buildReactionAvatarDetachedClearPatch()
        : {};
      this.setData(
        Object.assign(
          {
            reactionScreenVisible: false,
            reactionScreenFading: false,
            reactionScreenMode: '',
            playerActionFlowerVisible: false,
            playerActionPetalVisible: false,
            playerActionWreathVisible: false,
            playerActionTarget: null
          },
          clearPatch || {}
        )
      );
      this._emitSeatRestoreEvent();
      this._playingReactionKey = '';
      this._playerActionRocketBusy = false;
      this._playerActionBoxingBusy = false;
      this._playerActionKissBusy = false;
      this._playerActionBeerBusy = false;
      this._playerActionTomatoBusy = false;
      this._playerActionBucketBusy = false;
      this._playerActionEggBusy = false;
      this._playerActionFlowerBusy = false;
    },

  onPlayerActionReactionItemTap(e) {
    const fromDetail =
      e && e.detail && e.detail.key != null ? String(e.detail.key).trim() : '';
    const fromDataset =
      e &&
      e.currentTarget &&
      e.currentTarget.dataset &&
      e.currentTarget.dataset.key != null
        ? String(e.currentTarget.dataset.key).trim()
        : '';
    const key = fromDetail || fromDataset;
    if (key === 'flower') {
      this.onPlayerActionFlowerTap();
      return;
    }
    if (key === 'beer') {
      this.onPlayerActionBeerTap();
      return;
    }
    if (key === 'bucket') {
      this.onPlayerActionBucketTap();
      return;
    }
    if (key === 'tomato') {
      this.onPlayerActionTomatoTap();
      return;
    }
    if (key === 'kiss') {
      this.onPlayerActionKissTap();
      return;
    }
    if (key === 'egg') {
      this.onPlayerActionEggTap();
      return;
    }
    if (key === 'rocket') {
      this.onPlayerActionRocketTap();
      return;
    }
    if (key === 'boxing') {
      this.onPlayerActionBoxingTap();
    }
  },

  /** 中央弹窗「进入主页」；与 reaction 同门控 */
  /**
   * Demo：🚀 入口 — Self / Observer 完全隔离。
   * - TIGERHOODS / currentUser → rocketSelfReaction（中央，拳击尺寸）
   * - 其他玩家 → rocketObserverReaction（目标头像座位炸飞）
   * 仅 demo-weekend-amateur；不改正式身份逻辑。
   */
  onPlayerActionRocketTap() {
    if (this._playerActionRocketBusy) return;
    if (!scoreReactionController.canPlayReaction(this._hostGameId(), 'rocket', this._getScoreReactionCtx())) {
      return;
    }
    const target = this.data.playerActionTarget;
    const playerId =
      target && (target.playerId || target.userId) != null
        ? String(target.playerId || target.userId).trim()
        : '';
    if (!playerId) {
      scoreDebugLog('[player-action-rocket] missing playerId');
      return;
    }
    this._playerActionRocketBusy = true;
    // reaction-view-model-v2：火箭统一目标头像中央舞台（所有人同效果）
    this._playSelfReaction('rocket', {
      playerId: playerId,
      avatarUrl:
        (target && (target.avatar || target.avatarUrl || target.headimgurl)) ||
        '',
      target: target
    });
  },

  /** @deprecated 占位已改为 onPlayerActionRocketTap */
  onPlayerActionPlaceholderTap() {
    this.onPlayerActionRocketTap();
  },

  /**
   * Demo：🚀 SELF final-return-smoke-v5 —
   * 二次超级爆炸 → final 黑脸+爆炸头 → 黑脸滚回座位 → 落座
   * → 头顶青烟约1s → 消散 → 恢复正常头像。
   */
  _playSelfRocketReaction(rect, avatarUrl, playerId) {
    const hitPlayerId = playerId != null ? String(playerId).trim() : '';
    const norm =
      this._normalizePlayerActionAvatarRect(rect) ||
      this._fallbackPlayerActionAvatarRect() ||
      rect;
    const left = Number(norm.left);
    const top = Number(norm.top);
    const width = Number(norm.width);
    const height = Number(norm.height);
    if (
      !Number.isFinite(left) ||
      !Number.isFinite(top) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      this._playerActionRocketBusy = false;
      return;
    }

    const seatX = left + width / 2;
    const seatY = top + height / 2;
    const win = this._getReactionWindowSize();
    const centerX = win.winW / 2;
    const centerY = win.winH * 0.42;
    const selfTiming = rocketReactionTimeline.ROCKET_SELF_TIMING || {};
    // 与拳击 Self 一致，勿与 Observer 原头像尺寸共用
    const centerScale =
      selfTiming.centerScale != null ? selfTiming.centerScale : 4;
    const centerW = width * centerScale;
    const centerH = height * centerScale;
    // rocket-front-hit-fix-v2：固定从屏幕上方进入（正面命中，不走侧/后方）
    const topPad = Math.max(88, Math.round(Math.min(win.winW, win.winH) * 0.22));
    const entry = {
      key: 'top',
      x: centerX + (Math.random() - 0.5) * 24,
      y: -topPad
    };
    const impactRatio =
      selfTiming.impactOffsetYRatio != null
        ? selfTiming.impactOffsetYRatio
        : 0.12;
    // 命中点：头像中心偏上（额/鼻），爆炸仍覆盖整脸
    const impactX = centerX;
    const impactY = centerY - centerH * impactRatio;
    const flyMs = selfTiming.flyMs != null ? selfTiming.flyMs : 900;
    const toCenterMs =
      selfTiming.toCenterMs != null ? selfTiming.toCenterMs : 420;
    const returnMs = selfTiming.returnMs != null ? selfTiming.returnMs : 860;
    const spinMin =
      selfTiming.returnSpinMin != null ? selfTiming.returnSpinMin : 180;
    const spinMax =
      selfTiming.returnSpinMax != null ? selfTiming.returnSpinMax : 360;
    const returnSpinAbs =
      spinMin + Math.floor(Math.random() * (spinMax - spinMin + 1));
    const returnSpin = (Math.random() > 0.5 ? 1 : -1) * returnSpinAbs;
    const url = avatarUrl != null ? String(avatarUrl) : '';

    this._clearRocketReactionTimers();
    try {
      reactionSounds.stopReactionSound('rocket');
    } catch (err) {
      /* ignore */
    }

    const selfTimingFull = rocketReactionTimeline.ROCKET_SELF_TIMING || {};
    const launchUpRatio =
      selfTimingFull.launchUpRatio != null ? selfTimingFull.launchUpRatio : 0.22;
    const launchY = Math.max(36, win.winH * launchUpRatio);

    this._rocketTimelineCtx = {
      mode: 'self',
      seatX: seatX,
      seatY: seatY,
      cx: centerX,
      cy: centerY,
      impactX: impactX,
      impactY: impactY,
      launchY: launchY,
      winW: win.winW,
      winH: win.winH,
      left: left,
      top: top,
      width: width,
      height: height,
      centerW: centerW,
      centerH: centerH,
      centerScale: centerScale,
      startX: entry.x,
      startY: entry.y,
      entryKey: entry.key || 'top',
      flyMs: flyMs,
      toCenterMs: toCenterMs,
      returnMs: returnMs,
      returnSpin: returnSpin,
      playerId: hitPlayerId,
      avatarUrl: url
    };

    this.setData({
      playerActionSheetVisible: false,
      playerActionTarget: null,
      reactionScreenVisible: true,
      reactionScreenFading: false,
      reactionScreenMode: 'rocket',
      reactionRocketFlyVisible: false,
      reactionRocketFlyStyle: '',
      reactionRocketBlastVisible: false,
      reactionRocketBlastStyle: '',
      reactionRocketBlastBurst: false,
      reactionRocketBlastSize: '',
      reactionRocketShaking: false,
      reactionRocketAvatarVisible: false,
      reactionRocketAvatarUrl: url,
      reactionRocketAvatarStyle: this._buildRocketAvatarStyle({
        x: seatX,
        y: seatY,
        w: width,
        h: height,
        rise: 0,
        sway: 0,
        rot: 0,
        scaleX: 1,
        scaleY: 1,
        ms: 0
      }),
      reactionRocketAvatarPhase: '',
      reactionRocketBlastFace: false,
      reactionRocketHairPop: false,
      reactionRocketSmokeCover: false,
      reactionRocketSmokeClearing: false,
      reactionRocketFaceShake: false,
      reactionRocketSmokeActive: false,
      reactionRocketTrailVisible: false,
      reactionRocketLandSmoke: false,
      reactionRocketLandSmokeFading: false,
      rocketFaceMode: 'normal',
      rocketBlackFaceSrc: '/subpackages/reaction/assets/reaction/rocket_black_face.png',
      rocketEyesOnlyFaceSrc:
        '/subpackages/reaction/assets/reaction/rocket_eyes_only_face.png',
      reactionAvatarDetached: false,
      reactionAvatarDetachedPlayerId: '',
      reactionActiveMode: ''
    });

    const timeline = rocketReactionTimeline.buildRocketSelfTimeline({
      returnSpin: returnSpin
    });
    this._runRocketReactionTimeline(timeline);
  },

  _clearRocketReactionTimers() {
    if (this._rocketArcTimer) {
      clearTimeout(this._rocketArcTimer);
      this._rocketArcTimer = null;
    }
    const tl = this._rocketTimelineTimers;
    if (tl && tl.length) {
      for (let i = 0; i < tl.length; i++) clearTimeout(tl[i]);
    }
    this._rocketTimelineTimers = [];
  },

  _rocketTimeout(fn, ms) {
    const self = this;
    if (!this._rocketTimelineTimers) this._rocketTimelineTimers = [];
    const id = setTimeout(function () {
      const list = self._rocketTimelineTimers || [];
      const idx = list.indexOf(id);
      if (idx >= 0) list.splice(idx, 1);
      try {
        fn();
      } catch (err) {
        scoreDebugLog('[rocket-timeline] handler error', err);
      }
    }, ms);
    this._rocketTimelineTimers.push(id);
    return id;
  },

  _runRocketReactionTimeline(timeline) {
    const self = this;
    const list = timeline || [];
    for (let i = 0; i < list.length; i++) {
      (function (ev) {
        self._rocketTimeout(function () {
          self._dispatchRocketTimelineEvent(ev);
        }, ev.time);
      })(list[i]);
    }
  },

  _buildRocketAvatarStyle(opts) {
    const o = opts || {};
    const x = o.x != null ? o.x : 0;
    const y = o.y != null ? o.y : 0;
    const w = o.w != null ? o.w : 44;
    const h = o.h != null ? o.h : 44;
    const rise = o.rise != null ? o.rise : 0;
    const sway = o.sway != null ? o.sway : 0;
    const rot = o.rot != null ? o.rot : 0;
    const scaleX = o.scaleX != null ? o.scaleX : 1;
    const scaleY = o.scaleY != null ? o.scaleY : 1;
    const ms = o.ms != null ? Number(o.ms) : 0;
    const ease = o.ease || 'cubic-bezier(0.22, 0.7, 0.28, 1)';
    const transition =
      ms > 0
        ? 'left ' +
          ms +
          'ms ' +
          ease +
          ',top ' +
          ms +
          'ms ' +
          ease +
          ',width ' +
          ms +
          'ms ' +
          ease +
          ',height ' +
          ms +
          'ms ' +
          ease +
          ',transform ' +
          ms +
          'ms ' +
          ease
        : 'none';
    return (
      'left:' +
      x +
      'px;top:' +
      y +
      'px;width:' +
      w +
      'px;height:' +
      h +
      'px;transform:translate(-50%,-50%) translate(' +
      sway +
      'px,' +
      rise +
      'px) rotate(' +
      rot +
      'deg) scale(' +
      scaleX +
      ',' +
      scaleY +
      ');transition:' +
      transition +
      ';'
    );
  },

  _dispatchRocketTimelineEvent(ev) {
    const e = ev || {};
    const action = e.action != null ? String(e.action) : '';
    const ctx = this._rocketTimelineCtx || {};
    const mode = ctx.mode != null ? String(ctx.mode) : '';
    // reaction-view-model-v2：火箭仅目标中央舞台 Self
    if (mode !== 'self') return;
    const page = this;
    const isSelf = true;

    // —— Self：进中央 ——
    if (action === 'avatar_to_center') {
      if (!isSelf) return;
      const ms = e.duration != null ? e.duration : ctx.toCenterMs || 420;
      this.setData({
        reactionAvatarDetached: true,
        reactionAvatarDetachedPlayerId: ctx.playerId || '',
        reactionActiveMode: 'self',
        reactionRocketAvatarVisible: true,
        reactionRocketAvatarPhase: 'center',
        reactionRocketBlastFace: false,
        reactionRocketHairPop: false,
        reactionRocketSmokeCover: false,
        reactionRocketSmokeClearing: false,
        reactionRocketFaceShake: false,
        reactionRocketSmokeActive: false,
        reactionRocketTrailVisible: false,
        rocketFaceMode: 'normal',
        reactionRocketAvatarStyle: this._buildRocketAvatarStyle({
          x: ctx.seatX,
          y: ctx.seatY,
          w: ctx.width,
          h: ctx.height,
          rise: 0,
          sway: 0,
          rot: 0,
          scaleX: 1,
          scaleY: 1,
          ms: 0
        })
      });
      this._rocketTimeout(function () {
        if (!page._rocketTimelineCtx || page._rocketTimelineCtx.mode !== 'self') {
          return;
        }
        page.setData({
          reactionRocketAvatarStyle: page._buildRocketAvatarStyle({
            x: ctx.cx,
            y: ctx.cy,
            w: ctx.centerW || ctx.width * 4,
            h: ctx.centerH || ctx.height * 4,
            rise: 0,
            sway: 0,
            rot: 0,
            scaleX: 1,
            scaleY: 1,
            ms: ms
          })
        });
      }, 24);
      return;
    }

    if (action === 'rocket_enter' || action === 'rocket_fly') {
      // 尖端朝下：从屏上俯冲正面；初始旋转约 180°
      this.setData({
        reactionRocketFlyVisible: true,
        reactionRocketFlyStyle: this._buildRocketProjectileStyle(
          ctx.startX,
          ctx.startY,
          180,
          0.32,
          0.82,
          0
        )
      });
      this._startRocketProjectileFlight(ctx);
      return;
    }

    // —— rocket_hit：正面命中（停飞 + 音效；爆炸视觉走 explosion_1）——
    if (action === 'rocket_hit' || action === 'rocket_hit_front') {
      if (this._rocketArcTimer) {
        clearTimeout(this._rocketArcTimer);
        this._rocketArcTimer = null;
      }
      const peakMs =
        (rocketReactionTimeline.ROCKET_AUDIO &&
          rocketReactionTimeline.ROCKET_AUDIO.peakMs) ||
        660;
      const seekMs = e.seekMs != null ? e.seekMs : peakMs;
      this._playReactionSound(e.sound || 'rocket', {
        volume: e.volume != null ? e.volume : 1,
        seekMs: seekMs
      });
      this.setData({
        reactionRocketFlyVisible: false,
        reactionRocketFlyStyle: '',
        reactionRocketAvatarVisible: true,
        reactionRocketAvatarPhase: 'hit',
        reactionRocketAvatarStyle: this._buildRocketAvatarStyle({
          x: ctx.cx,
          y: ctx.cy,
          w: ctx.centerW || ctx.width * 4,
          h: ctx.centerH || ctx.height * 4,
          rise: 0,
          sway: 0,
          rot: 0,
          scaleX: 1,
          scaleY: 1,
          ms: 0
        })
      });
      return;
    }

    // —— explosion_first / explosion_1：第一次巨大爆炸 ——
    if (
      action === 'explosion_first' ||
      action === 'explosion_1' ||
      action === 'explosion' ||
      action === 'rocket_explosion'
    ) {
      this._triggerRocketExplosionBurst({
        size: 'large',
        duration:
          e.duration != null
            ? e.duration
            : (rocketReactionTimeline.ROCKET_SELF_TIMING &&
                rocketReactionTimeline.ROCKET_SELF_TIMING.explosion1Ms) ||
              800,
        shakeMs: 480,
        smokeCover: true
      });
      return;
    }

    // —— black_face：卡通爆炸黑脸（独立资源，不改原头像）——
    if (
      action === 'black_face' ||
      action === 'black_face_show' ||
      action === 'blast_face_reveal'
    ) {
      this.setData({
        rocketFaceMode: 'black',
        rocketBlackFaceSrc:
          '/subpackages/reaction/assets/reaction/rocket_black_face.png',
        reactionRocketAvatarPhase: 'face',
        reactionRocketSmokeActive: true,
        reactionRocketSmokeCover: true,
        reactionRocketSmokeClearing: true,
        reactionRocketFaceShake: true
      });
      this._rocketTimeout(function () {
        if (!page._rocketTimelineCtx) return;
        page.setData({
          reactionRocketFaceShake: false,
          reactionRocketSmokeCover: false,
          reactionRocketSmokeClearing: false
        });
      }, 420);
      return;
    }

    // —— launch_up：炸飞上天 scale 1→0.3 + 旋转 + 烟雾尾迹 ——
    if (action === 'launch_up') {
      const ms = e.duration != null ? e.duration : 1700;
      const scaleEnd =
        e.scaleEnd != null
          ? e.scaleEnd
          : (rocketReactionTimeline.ROCKET_SELF_TIMING &&
              rocketReactionTimeline.ROCKET_SELF_TIMING.launchScaleEnd) ||
            0.3;
      const spin = e.spin != null ? e.spin : 540;
      if (this._rocketTimelineCtx) {
        this._rocketTimelineCtx.launchSpin = spin;
        this._rocketTimelineCtx.launchScaleEnd = scaleEnd;
      }
      const launchY =
        ctx.launchY != null
          ? ctx.launchY
          : Math.max(36, (ctx.winH || 640) * 0.22);
      this.setData({
        reactionRocketAvatarPhase: 'launch',
        rocketFaceMode: 'black',
        reactionRocketTrailVisible: true,
        reactionRocketSmokeActive: true,
        reactionRocketSmokeCover: false,
        reactionRocketAvatarStyle: this._buildRocketAvatarStyle({
          x: ctx.cx,
          y: launchY,
          w: ctx.centerW || ctx.width * 4,
          h: ctx.centerH || ctx.height * 4,
          rise: 0,
          sway: 0,
          rot: spin,
          scaleX: scaleEnd,
          scaleY: scaleEnd,
          ms: ms,
          ease: 'cubic-bezier(0.18, 0.72, 0.22, 1)'
        })
      });
      return;
    }

    // —— fall_down：从上落回中央（保持黑脸）——
    if (action === 'fall_down') {
      const ms = e.duration != null ? e.duration : 950;
      const prevSpin =
        ctx.launchSpin != null ? ctx.launchSpin : 540;
      this.setData({
        reactionRocketAvatarPhase: 'fall',
        rocketFaceMode: 'black',
        reactionRocketTrailVisible: true,
        reactionRocketSmokeActive: true,
        reactionRocketAvatarStyle: this._buildRocketAvatarStyle({
          x: ctx.cx,
          y: ctx.cy,
          w: ctx.centerW || ctx.width * 4,
          h: ctx.centerH || ctx.height * 4,
          rise: 0,
          sway: 0,
          rot: prevSpin + (prevSpin >= 0 ? 180 : -180),
          scaleX: 1,
          scaleY: 1,
          ms: ms,
          ease: 'cubic-bezier(0.36, 0.08, 0.28, 1)'
        })
      });
      return;
    }

    // —— explosion_second_ultimate：第二次超级爆炸 ——
    if (
      action === 'explosion_second_ultimate' ||
      action === 'explosion_2'
    ) {
      const peakMs =
        (rocketReactionTimeline.ROCKET_AUDIO &&
          rocketReactionTimeline.ROCKET_AUDIO.peakMs) ||
        660;
      if (e.sound) {
        this._playReactionSound(e.sound, {
          volume: e.volume != null ? e.volume : 1,
          seekMs: e.seekMs != null ? e.seekMs : peakMs
        });
      }
      this.setData({
        reactionRocketTrailVisible: false,
        reactionRocketLandSmoke: false,
        reactionRocketLandSmokeFading: false,
        reactionRocketAvatarStyle: this._buildRocketAvatarStyle({
          x: ctx.cx,
          y: ctx.cy,
          w: ctx.centerW || ctx.width * 4,
          h: ctx.centerH || ctx.height * 4,
          rise: 0,
          sway: 0,
          rot: 0,
          scaleX: 1,
          scaleY: 1,
          ms: 120
        })
      });
      this._triggerRocketExplosionBurst({
        size: 'super',
        duration:
          e.duration != null
            ? e.duration
            : (rocketReactionTimeline.ROCKET_SELF_TIMING &&
                rocketReactionTimeline.ROCKET_SELF_TIMING.explosion2Ms) ||
              900,
        shakeMs: 560,
        smokeCover: true
      });
      return;
    }

    // —— final_black_face：全黑双眼 + 爆炸头（贯穿返回/落座）——
    if (
      action === 'final_black_face' ||
      action === 'rocket_final_black_face' ||
      action === 'eyes_only' ||
      action === 'transform_face'
    ) {
      this.setData({
        reactionRocketAvatarPhase: 'final_face',
        rocketFaceMode: 'eyes_only',
        rocketEyesOnlyFaceSrc:
          '/subpackages/reaction/assets/reaction/rocket_eyes_only_face.png',
        reactionRocketHairPop: true,
        reactionRocketTrailVisible: false,
        reactionRocketLandSmoke: false,
        reactionRocketLandSmokeFading: false,
        reactionRocketSmokeActive: true,
        reactionRocketSmokeCover: true,
        reactionRocketSmokeClearing: true,
        reactionRocketFaceShake: false,
        reactionRocketAvatarStyle: this._buildRocketAvatarStyle({
          x: ctx.cx,
          y: ctx.cy,
          w: ctx.centerW || ctx.width * 4,
          h: ctx.centerH || ctx.height * 4,
          rise: 0,
          sway: 0,
          rot: 0,
          scaleX: 1,
          scaleY: 1,
          ms: 160
        })
      });
      this._rocketTimeout(function () {
        if (!page._rocketTimelineCtx) return;
        page.setData({
          reactionRocketSmokeCover: false,
          reactionRocketSmokeClearing: false
        });
      }, 380);
      return;
    }

    // —— black_face_return：保持黑脸+爆炸头，旋转滚回座位 ——
    if (
      action === 'black_face_return' ||
      action === 'return' ||
      action === 'avatar_return'
    ) {
      const ms = e.duration != null ? e.duration : ctx.returnMs || 860;
      const spin =
        e.spin != null
          ? e.spin
          : ctx.returnSpin != null
            ? ctx.returnSpin
            : 240;
      if (this._rocketTimelineCtx) {
        this._rocketTimelineCtx.returnSpin = spin;
      }
      this.setData({
        reactionRocketAvatarPhase: 'return',
        rocketFaceMode: 'eyes_only',
        reactionRocketHairPop: true,
        reactionRocketSmokeActive: false,
        reactionRocketSmokeCover: false,
        reactionRocketTrailVisible: false,
        reactionRocketLandSmoke: false,
        reactionRocketLandSmokeFading: false,
        reactionRocketFaceShake: false,
        reactionRocketAvatarStyle: this._buildRocketAvatarStyle({
          x: ctx.seatX,
          y: ctx.seatY,
          w: ctx.width,
          h: ctx.height,
          rise: 0,
          sway: 0,
          rot: spin,
          scaleX: 1,
          scaleY: 1,
          ms: ms,
          ease: 'cubic-bezier(0.28, 0.65, 0.32, 1)'
        })
      });
      return;
    }

    // —— rocket_land：坐回座位，仍保持 final 黑脸 ——
    if (action === 'rocket_land') {
      this.setData({
        reactionRocketAvatarPhase: 'land',
        rocketFaceMode: 'eyes_only',
        reactionRocketHairPop: true,
        reactionRocketFaceShake: false,
        reactionRocketLandSmoke: false,
        reactionRocketLandSmokeFading: false,
        reactionRocketAvatarStyle: this._buildRocketAvatarStyle({
          x: ctx.seatX,
          y: ctx.seatY,
          w: ctx.width,
          h: ctx.height,
          rise: 0,
          sway: 0,
          rot: 0,
          scaleX: 1,
          scaleY: 1,
          ms: 120
        })
      });
      return;
    }

    // —— smoke_after_land：头顶 2–4 缕青烟 ——
    if (
      action === 'smoke_after_land' ||
      action === 'rocket_smoke_after_land'
    ) {
      this.setData({
        reactionRocketAvatarPhase: 'land_smoke',
        rocketFaceMode: 'eyes_only',
        reactionRocketHairPop: true,
        reactionRocketLandSmoke: true,
        reactionRocketLandSmokeFading: false
      });
      return;
    }

    // —— smoke_fade：青烟消散 ——
    if (action === 'smoke_fade') {
      this.setData({
        reactionRocketLandSmoke: true,
        reactionRocketLandSmokeFading: true,
        rocketFaceMode: 'eyes_only',
        reactionRocketHairPop: true
      });
      return;
    }

    // —— restore_avatar：青烟消散后才恢复正常头像 ——
    if (
      action === 'restore_avatar' ||
      action === 'restore' ||
      action === 'avatar_restore'
    ) {
      this.setData({
        reactionRocketAvatarPhase: 'restore',
        rocketFaceMode: 'restore',
        reactionRocketTrailVisible: false,
        reactionRocketSmokeActive: false,
        reactionRocketSmokeCover: false,
        reactionRocketSmokeClearing: false,
        reactionRocketFaceShake: false,
        reactionRocketBlastFace: false,
        reactionRocketHairPop: false,
        reactionRocketLandSmoke: false,
        reactionRocketLandSmokeFading: false,
        reactionRocketAvatarStyle: this._buildRocketAvatarStyle({
          x: ctx.seatX,
          y: ctx.seatY,
          w: ctx.width,
          h: ctx.height,
          rise: 0,
          sway: 0,
          rot: 0,
          scaleX: 1,
          scaleY: 1,
          ms: 220
        })
      });
      this._rocketTimeout(function () {
        if (!page._rocketTimelineCtx) return;
        page.setData({ rocketFaceMode: 'normal' });
      }, 200);
      return;
    }

    if (action === 'cleanup') {
      this._cleanupRocketReactionLayer();
    }
  },

  /** Self 火箭双爆炸视觉：large / small */
  _triggerRocketExplosionBurst(opts) {
    const o = opts || {};
    const page = this;
    const ctx = this._rocketTimelineCtx || {};
    const blastX = ctx.impactX != null ? ctx.impactX : ctx.cx;
    const blastY = ctx.impactY != null ? ctx.impactY : ctx.cy;
    const size =
      o.size === 'super' ? 'super' : o.size === 'small' ? 'small' : 'large';
    const duration = o.duration != null ? o.duration : 800;
    const shakeMs = o.shakeMs != null ? o.shakeMs : 420;
    // 重启 burst 动画：先关再开
    this.setData({
      reactionRocketBlastVisible: false,
      reactionRocketBlastBurst: false,
      reactionRocketBlastSize: size
    });
    this._rocketTimeout(function () {
      if (!page._rocketTimelineCtx) return;
      const patch = {
        reactionRocketBlastVisible: true,
        reactionRocketBlastBurst: true,
        reactionRocketBlastSize: size,
        reactionRocketBlastStyle: 'left:' + blastX + 'px;top:' + blastY + 'px;',
        reactionRocketShaking: true,
        reactionRocketSmokeActive: true
      };
      if (o.smokeCover) {
        patch.reactionRocketSmokeCover = true;
        patch.reactionRocketSmokeClearing = false;
      }
      page.setData(patch);
    }, 16);
    this._rocketTimeout(function () {
      if (!page._rocketTimelineCtx) return;
      page.setData({ reactionRocketShaking: false });
    }, shakeMs);
    this._rocketTimeout(function () {
      if (!page._rocketTimelineCtx) return;
      page.setData({
        reactionRocketBlastVisible: false,
        reactionRocketBlastBurst: false
      });
    }, duration);
  },

  _buildRocketProjectileStyle(x, y, rot, scale, opacity, ms) {
    const transition =
      ms > 0
        ? 'left ' +
          ms +
          'ms linear,top ' +
          ms +
          'ms linear,transform ' +
          ms +
          'ms linear'
        : 'none';
    return (
      'left:' +
      x +
      'px;top:' +
      y +
      'px;opacity:' +
      opacity +
      ';transform:translate(-50%,-50%) rotate(' +
      rot +
      'deg) scale(' +
      scale +
      ');transition:' +
      transition +
      ';'
    );
  },

  _startRocketProjectileFlight(ctx) {
    const self = this;
    const c = ctx || this._rocketTimelineCtx || {};
    const startX = c.startX;
    const startY = c.startY;
    // Self 正面命中：落点优先 impact（额/鼻），默认头像中心
    const endX = c.impactX != null ? c.impactX : c.cx;
    const endY = c.impactY != null ? c.impactY : c.cy;
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const key = String(c.entryKey || '');
    let ctrlX;
    let ctrlY;
    if (c.mode === 'self' || key === 'top') {
      // 自上而下俯冲：经过头像顶部再落到正面中心偏上（不绕到后方）
      const avatarTop =
        (c.cy != null ? c.cy : endY) -
        (c.centerH != null ? c.centerH : 160) * 0.5;
      ctrlX = midX + (Math.random() - 0.5) * 18;
      ctrlY = Math.min(midY, avatarTop - 12);
    } else {
      const sideSign =
        key.indexOf('left') >= 0
          ? 1
          : key.indexOf('right') >= 0
            ? -1
            : startX < endX
              ? 1
              : -1;
      ctrlX = midX + sideSign * (48 + Math.random() * 60);
      ctrlY = midY - (40 + Math.random() * 50);
    }
    const flyMs = c.flyMs != null ? c.flyMs : 920;
    const easeIn = function (t) {
      return t * t * t;
    };
    const t0 = Date.now();

    const tick = function () {
      if (!self._rocketTimelineCtx) return;
      const elapsed = Date.now() - t0;
      let raw = elapsed / flyMs;
      if (raw >= 1) raw = 1;
      const t = easeIn(raw);
      const u = 1 - t;
      const x = u * u * startX + 2 * u * t * ctrlX + t * t * endX;
      const y = u * u * startY + 2 * u * t * ctrlY + t * t * endY;
      // 局部切线朝向（俯冲朝下 ≈ 180°）
      const dx = 2 * (1 - t) * (ctrlX - startX) + 2 * t * (endX - ctrlX);
      const dy = 2 * (1 - t) * (ctrlY - startY) + 2 * t * (endY - ctrlY);
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      const scale = 0.32 + 0.95 * t;
      const opacity = 0.82 + 0.18 * t;
      self.setData({
        reactionRocketFlyStyle: self._buildRocketProjectileStyle(
          x,
          y,
          ang,
          scale,
          opacity,
          0
        )
      });
      if (raw < 1) {
        self._rocketArcTimer = setTimeout(tick, 16);
        return;
      }
      self._rocketArcTimer = null;
    };
    tick();
  },

  _cleanupRocketReactionLayer() {
    try {
      reactionSounds.stopReactionSound('rocket');
    } catch (err) {
      /* ignore */
    }
    this._clearRocketReactionTimers();
    this.setData({
      reactionScreenVisible: false,
      reactionScreenFading: false,
      reactionScreenMode: '',
      reactionRocketFlyVisible: false,
      reactionRocketFlyStyle: '',
      reactionRocketBlastVisible: false,
      reactionRocketBlastStyle: '',
      reactionRocketBlastBurst: false,
      reactionRocketBlastSize: '',
      reactionRocketShaking: false,
      reactionRocketAvatarVisible: false,
      reactionRocketAvatarUrl: '',
      reactionRocketAvatarStyle: '',
      reactionRocketAvatarPhase: '',
      reactionRocketBlastFace: false,
      reactionRocketHairPop: false,
      reactionRocketSmokeCover: false,
      reactionRocketSmokeClearing: false,
      reactionRocketFaceShake: false,
      reactionRocketSmokeActive: false,
      reactionRocketTrailVisible: false,
      reactionRocketLandSmoke: false,
      reactionRocketLandSmokeFading: false,
      rocketFaceMode: 'normal',
      reactionAvatarDetached: false,
      reactionAvatarDetachedPlayerId: '',
      reactionActiveMode: ''
    });
    this._rocketTimelineCtx = null;
    this._playerActionRocketBusy = false;
  },

  /** Demo：reaction 窗口尺寸 */
  _getReactionWindowSize() {
    let winW = 375;
    let winH = 667;
    try {
      const info = (wx.getWindowInfo && wx.getWindowInfo()) || wx.getSystemInfoSync();
      winW = (info && (info.windowWidth || info.screenWidth)) || 375;
      winH = (info && (info.windowHeight || info.screenHeight)) || 667;
    } catch (err) {
      winW = 375;
      winH = 667;
    }
    return { winW: winW, winH: winH };
  },

  /** Demo：当前操作用户 id（用于第一视角 / 第三方分流） */
  _getCurrentReactionUserId() {
    const host = this._reactionHost || {};
    if (typeof host.getCurrentUserId === 'function') {
      const id = host.getCurrentUserId();
      if (id != null && String(id).trim()) return String(id).trim();
    }
    return this._getCurrentReactionUserIdLocal();
  },

  _getCurrentReactionUserIdLocal() {
    try {
      const user = gameStore.getCurrentUser() || {};
      const id = String(user.userId || user.id || '').trim();
      if (id) return id;
    } catch (e) {
      /* ignore */
    }
    return 'me';
  },

  /** Demo：target === 当前用户 → 第一视角（正式身份判断，勿改） */
  _isSelfReactionTarget(targetUserId) {
    const tid = targetUserId != null ? String(targetUserId).trim() : '';
    if (!tid) return false;
    if (isSameUserIdentity(tid, 'me')) return true;
    return isSameUserIdentity(tid, this._getCurrentReactionUserId());
  },

  /**
   * 正式记分页头像互动门控（普通/队内/队际/系列/demo 共用同一 score 页）。
   * 不复用 isDemoWeekendAmateurGameId。
   */
  _getScoreReactionCtx() {
    const host = this._reactionHost || {};
    if (typeof host.getReactionCtx === 'function') {
      return host.getReactionCtx() || {};
    }
    return {
      matchId: (host.matchId != null ? host.matchId : '') || ''
    };
  },

  _isScoreReactionEnabled() {
    const host = this._reactionHost || {};
    if (typeof host.canOpenReaction === 'function') {
      return !!host.canOpenReaction();
    }
    const ctx = this._getScoreReactionCtx();
    return scoreReactionController.canOpenReaction(this._hostGameId(), ctx);
  },

  /**
   * 记分行座位 detach（仍按 self/observer；讨论区隐藏走 seatdetach 事件，不经此门控）。
   */
  _buildReactionAvatarDetachedPatch(playerId, reactionKey) {
    const host = this._reactionHost || {};
    if (typeof host.onSeatDetach === 'function') {
      host.onSeatDetach(playerId, reactionKey);
    }
    try {
      this._emitSeatDetachEvent(reactionKey, playerId);
    } catch (e) {
      /* ignore */
    }
    return this._buildReactionAvatarDetachedPatchLocal(playerId, reactionKey);
  },

  _buildReactionAvatarDetachedPatchLocal(playerId, reactionKey) {
    const pid = playerId != null ? String(playerId).trim() : '';
    const mode = reactionPanelConfig.getReactionMode(reactionKey);
    const detach = mode === 'self' && !!pid;
    return {
      reactionAvatarDetached: detach,
      reactionAvatarDetachedPlayerId: detach ? pid : '',
      reactionActiveMode: detach ? 'self' : mode === 'observer' ? 'observer' : ''
    };
  },

  _buildReactionAvatarDetachedClearPatch() {
    const host = this._reactionHost || {};
    if (typeof host.onSeatRestore === 'function') {
      host.onSeatRestore();
    }
    try {
      this._emitSeatRestoreEvent();
    } catch (e) {
      /* ignore */
    }
    return this._buildReactionAvatarDetachedClearPatchLocal();
  },

  _buildReactionAvatarDetachedClearPatchLocal() {
    return {
      reactionAvatarDetached: false,
      reactionAvatarDetachedPlayerId: '',
      reactionActiveMode: ''
    };
  },

  /**
   * Demo-only：TIGERHOODS 第一视角测试入口。
   * 不修改 _isSelfReactionTarget / 真实 currentUser 判断；仅 demo-weekend-amateur。
   */
  _isDemoSelfPlayer(playerOrId) {
    return demoWeekendAmateurGame.isDemoSelfPlayer(this._hostGameId(), playerOrId);
  },

  /**
   * Demo：SELF 专用 — 随机屏幕边缘入场。
   * 不读头像 rect；不用远距离入场原则（该原则仅 observer）。
   */
  _getRandomSelfReactionEntryPoint(winW, winH) {
    const w = Number(winW) || 375;
    const h = Number(winH) || 667;
    const pad = Math.max(72, Math.round(Math.min(w, h) * 0.2));
    const candidates = [
      { key: 'top', x: w * 0.5, y: -pad },
      { key: 'bottom', x: w * 0.5, y: h + pad },
      { key: 'left', x: -pad, y: h * 0.5 },
      { key: 'right', x: w + pad, y: h * 0.5 },
      { key: 'top-left', x: -pad, y: -pad },
      { key: 'top-right', x: w + pad, y: -pad },
      { key: 'bottom-left', x: -pad, y: h + pad },
      { key: 'bottom-right', x: w + pad, y: h + pad }
    ];
    return candidates[Math.floor(Math.random() * candidates.length)] || candidates[0];
  },

  /**
   * Demo：OBSERVER 专用 — 远距离入场点（仅第三方）。
   * 从 8 边缘候选选距目标头像最远点，增加飞行距离/空间感。
   * 禁止用于 self：self 请用 _getRandomSelfReactionEntryPoint，落点永远在屏中。
   * 不考虑成绩区/其它 UI（reaction layer 最高层）。
   */
  _getReactionEntryPoint(targetRect) {
    const size = this._getReactionWindowSize();
    const winW = size.winW;
    const winH = size.winH;
    const rect =
      this._normalizePlayerActionAvatarRect(targetRect) ||
      this._fallbackPlayerActionAvatarRect();
    const tx = rect.left + rect.width / 2;
    const ty = rect.top + rect.height / 2;
    const pad = Math.max(80, Math.round(Math.min(winW, winH) * 0.2));
    const candidates = [
      { key: 'top', x: winW * 0.5, y: -pad },
      { key: 'bottom', x: winW * 0.5, y: winH + pad },
      { key: 'left', x: -pad, y: winH * 0.5 },
      { key: 'right', x: winW + pad, y: winH * 0.5 },
      { key: 'top-left', x: -pad, y: -pad },
      { key: 'top-right', x: winW + pad, y: -pad },
      { key: 'bottom-left', x: -pad, y: winH + pad },
      { key: 'bottom-right', x: winW + pad, y: winH + pad }
    ];
    let best = candidates[0];
    let bestD = -1;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const dx = c.x - tx;
      const dy = c.y - ty;
      const d = dx * dx + dy * dy;
      if (d > bestD) {
        bestD = d;
        best = c;
      }
    }
    return {
      x: best.x,
      y: best.y,
      key: best.key,
      winW: winW,
      winH: winH,
      targetX: tx,
      targetY: ty
    };
  },

  /**
   * Demo：SELF / 第一视角统一入口（targetUserId === currentUserId）。
   * - 最终效果永远在屏幕中央（flower 屏中开放、tomato 屏中撞击等）
   * - 入场方向可随机（_getRandomSelfReactionEntryPoint）
   * - 不根据头像位置计算；不适用远距离入场原则
   */
  _playSelfReaction(type, ctx) {
    if (!this._isScoreReactionEnabled()) {
      return;
    }
    const t = type != null ? String(type).trim() : '';
    const context = ctx && typeof ctx === 'object' ? ctx : {};
    if (t === 'tomato') {
      // 西红柿：目标头像中央舞台（拳击尺寸）+ 边缘飞砸
      const playerId = String(context.playerId || '').trim();
      const avatarUrl =
        context.avatarUrl ||
        (context.target &&
          (context.target.avatar ||
            context.target.avatarUrl ||
            context.target.headimgurl)) ||
        '';
      const self = this;
      this._queryPlayerActionAvatarRect(playerId, function (rect) {
        if (!rect) {
          self._playerActionTomatoBusy = false;
          try {
            self._emitSeatRestoreEvent();
          } catch (e) {
            /* ignore */
          }
          return;
        }
        self._playSelfTomatoReaction(rect, avatarUrl, playerId);
      });
      return;
    }
    if (t === 'flower') {
      this._playScreenFlowerReaction();
      return;
    }
    if (t === 'egg') {
      // 鸡蛋：目标头像中央舞台（拳击尺寸）+ 固定方向连击
      const playerId = String(context.playerId || '').trim();
      const avatarUrl =
        context.avatarUrl ||
        (context.target &&
          (context.target.avatar ||
            context.target.avatarUrl ||
            context.target.headimgurl)) ||
        '';
      const self = this;
      this._queryPlayerActionAvatarRect(playerId, function (rect) {
        if (!rect) {
          self._playerActionEggBusy = false;
          try {
            self._emitSeatRestoreEvent();
          } catch (e) {
            /* ignore */
          }
          return;
        }
        self._playSelfEggReaction(rect, avatarUrl, playerId);
      });
      return;
    }
    if (t === 'bucket') {
      // 水桶：目标头像中央舞台（拳击尺寸）+ 桶口倒水
      const playerId = String(context.playerId || '').trim();
      const avatarUrl =
        context.avatarUrl ||
        (context.target &&
          (context.target.avatar ||
            context.target.avatarUrl ||
            context.target.headimgurl)) ||
        '';
      const self = this;
      this._queryPlayerActionAvatarRect(playerId, function (rect) {
        if (!rect) {
          self._playerActionBucketBusy = false;
          try {
            self._emitSeatRestoreEvent();
          } catch (e) {
            /* ignore */
          }
          return;
        }
        self._playSelfBucketScreenReaction(rect, avatarUrl, playerId);
      });
      return;
    }
    if (t === 'boxing') {
      // boxing 仍以克隆头像做中央演出，但不走远距离入场原则
      const playerId = String(context.playerId || '').trim();
      const avatarUrl = context.avatarUrl || '';
      const self = this;
      this._queryPlayerActionAvatarRect(playerId, function (rect) {
        if (!rect) {
          self._playerActionBoxingBusy = false;
          try {
            self._emitSeatRestoreEvent();
          } catch (e) {
            /* ignore */
          }
          return;
        }
        self._playScreenBoxingReaction(rect, avatarUrl, playerId);
      });
      return;
    }
    if (t === 'kiss') {
      // 亲吻：目标头像中央舞台（拳击尺寸）+ 嘴唇飞入 + 害羞脸 + 红心回座
      const playerId = String(context.playerId || '').trim();
      const avatarUrl =
        context.avatarUrl ||
        (context.target &&
          (context.target.avatar ||
            context.target.avatarUrl ||
            context.target.headimgurl)) ||
        '';
      const self = this;
      this._queryPlayerActionAvatarRect(playerId, function (rect) {
        if (!rect) {
          self._playerActionKissBusy = false;
          try {
            self._emitSeatRestoreEvent();
          } catch (e) {
            /* ignore */
          }
          return;
        }
        self._playSelfKissReaction(rect, avatarUrl, playerId);
      });
      return;
    }
    if (t === 'beer') {
      this._playSelfBeerReaction();
      return;
    }
    if (t === 'rocket') {
      // 火箭：目标头像中央舞台（拳击尺寸）
      const playerId = String(context.playerId || '').trim();
      const avatarUrl = context.avatarUrl || '';
      const self = this;
      this._queryPlayerActionAvatarRect(playerId, function (rect) {
        if (!rect) {
          self._playerActionRocketBusy = false;
          try {
            self._emitSeatRestoreEvent();
          } catch (e) {
            /* ignore */
          }
          return;
        }
        self._playSelfRocketReaction(rect, avatarUrl, playerId);
      });
      return;
    }
  },

  /**
   * Demo：OBSERVER 入口（reaction-view-model-v2）。
   * 仅 flower / beer 保留双视角；其余类型回退目标头像中央舞台 Self。
   */
  _playObserverReaction(type, targetPlayer) {
    if (!this._isScoreReactionEnabled()) {
      return;
    }
    const target = targetPlayer && typeof targetPlayer === 'object' ? targetPlayer : {};
    const playerId = String(target.playerId || target.userId || '').trim();
    const avatarUrl =
      target.avatar || target.avatarUrl || target.headimgurl || '';
    const t = type != null ? String(type).trim() : '';
    if (!playerId) {
      scoreDebugLog('[reaction-observer] missing playerId', t);
      return;
    }
    // 6 个统一中央舞台：误走 Observer 时回退 Self
    if (
      t === 'tomato' ||
      t === 'egg' ||
      t === 'bucket' ||
      t === 'boxing' ||
      t === 'kiss' ||
      t === 'rocket'
    ) {
      this._playSelfReaction(t, {
        playerId: playerId,
        avatarUrl: avatarUrl,
        target: target
      });
      return;
    }
    // 防误调：currentUser self 不得走 Observer
    if (this._isSelfReactionTarget(playerId)) {
      this._playSelfReaction(t, {
        playerId: playerId,
        avatarUrl: avatarUrl,
        target: target
      });
      return;
    }
    const self = this;
    this._queryPlayerActionAvatarRect(playerId, function (rect) {
      if (!rect) {
        if (t === 'flower') self._playerActionFlowerBusy = false;
        else if (t === 'beer') self._playerActionBeerBusy = false;
        try {
          self._emitSeatRestoreEvent();
        } catch (e) {
          /* ignore */
        }
        return;
      }
      if (t === 'flower') {
        self._playPlayerActionFlower(rect, playerId);
        return;
      }
      if (t === 'beer') {
        self._playObserverBeerReaction(rect, playerId);
        return;
      }
    });
  },

  /**
   * Demo：👊 → 拳击 reaction（目标头像中央舞台；所有人同效果）。
   * 仅 demo-weekend-amateur；复用 player-action-modal；不改成绩。
   */
  onPlayerActionBoxingTap() {
    if (this._playerActionBoxingBusy) return;
    if (!scoreReactionController.canPlayReaction(this._hostGameId(), 'boxing', this._getScoreReactionCtx())) {
      return;
    }
    const target = this.data.playerActionTarget;
    const playerId =
      target && (target.playerId || target.userId) != null
        ? String(target.playerId || target.userId).trim()
        : '';
    if (!playerId) {
      scoreDebugLog('[player-action-boxing] missing playerId');
      return;
    }
    const avatarUrl =
      (target && (target.avatar || target.avatarUrl || target.headimgurl)) || '';
    this._playerActionBoxingBusy = true;
    this._playSelfReaction('boxing', {
      playerId: playerId,
      avatarUrl: avatarUrl,
      target: target
    });
  },

  /**
   * Demo：👄 → 亲吻 reaction（目标头像中央舞台；所有人同效果）。
   * 仅 demo-weekend-amateur；不改成绩 / modal 结构。
   */
  onPlayerActionKissTap() {
    if (this._playerActionKissBusy) return;
    if (!scoreReactionController.canPlayReaction(this._hostGameId(), 'kiss', this._getScoreReactionCtx())) {
      return;
    }
    const target = this.data.playerActionTarget;
    const playerId =
      target && (target.playerId || target.userId) != null
        ? String(target.playerId || target.userId).trim()
        : '';
    if (!playerId) {
      scoreDebugLog('[player-action-kiss] missing playerId');
      return;
    }
    this._playerActionKissBusy = true;
    this._playSelfReaction('kiss', {
      playerId: playerId,
      target: target,
      avatarUrl:
        (target && (target.avatar || target.avatarUrl || target.headimgurl)) ||
        ''
    });
  },

  /**
   * Demo：👄 SELF 入口 — 克隆头像到中央（拳击尺寸），嘴唇从远处飞入亲吻，
   * 害羞卡通脸 + 红心升起，带着红心旋回座位后继续漂浮再淡出。
   */
  _playSelfKissReaction(rect, avatarUrl, playerId) {
    const hitPlayerId = playerId != null ? String(playerId).trim() : '';
    // 兼容旧无参调用
    if (rect == null || typeof rect !== 'object') {
      const target = this.data.playerActionTarget || {};
      const pid = String(
        hitPlayerId || target.playerId || target.userId || ''
      ).trim();
      const url =
        (avatarUrl != null ? String(avatarUrl) : '') ||
        target.avatar ||
        target.avatarUrl ||
        target.headimgurl ||
        '';
      const self = this;
      if (!pid) {
        this._playerActionKissBusy = false;
        return;
      }
      this._queryPlayerActionAvatarRect(pid, function (r) {
        if (!r) {
          self._playerActionKissBusy = false;
          return;
        }
        self._playSelfKissReaction(r, url, pid);
      });
      return;
    }

    const norm =
      this._normalizePlayerActionAvatarRect(rect) ||
      this._fallbackPlayerActionAvatarRect() ||
      rect;
    const left = Number(norm.left);
    const top = Number(norm.top);
    const width = Number(norm.width);
    const height = Number(norm.height);
    if (
      !Number.isFinite(left) ||
      !Number.isFinite(top) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      this._playerActionKissBusy = false;
      return;
    }

    const selfTiming = kissReactionTimeline.SELF_KISS_TIMING || {};
    const centerScale =
      selfTiming.centerScale != null ? selfTiming.centerScale : 4;
    const win = this._getReactionWindowSize();
    const seatX = left + width / 2;
    const seatY = top + height / 2;
    const centerX = win.winW / 2;
    const centerY = win.winH * 0.42;
    const centerW = width * centerScale;
    const centerH = height * centerScale;
    const origin = this._getRandomSelfReactionEntryPoint(win.winW, win.winH);
    const startX = origin.x;
    const startY = origin.y;
    const midX = (startX + centerX) / 2;
    const midY = (startY + centerY) / 2;
    const key = String(origin.key || '');
    const sideSign =
      key.indexOf('left') >= 0 ? 1 : key.indexOf('right') >= 0 ? -1 : 1;
    const ctrlX = midX + sideSign * (40 + Math.random() * 48);
    const ctrlY =
      key.indexOf('top') >= 0
        ? midY - (32 + Math.random() * 40)
        : key.indexOf('bottom') >= 0
          ? midY + (32 + Math.random() * 40)
          : midY - sideSign * (28 + Math.random() * 36);
    const flyMs = selfTiming.flyMs != null ? selfTiming.flyMs : 980;
    const toCenterMs =
      selfTiming.toCenterMs != null ? selfTiming.toCenterMs : 420;
    const returnMs = selfTiming.returnMs != null ? selfTiming.returnMs : 720;
    const returnSpin = Math.random() > 0.5 ? 360 : -360;
    /** Self 到达中央：相对素材基准 1.2–1.5，略大于旧 emoji 视觉 */
    const arriveScale = 1.2 + Math.random() * 0.3;
    const url = avatarUrl != null ? String(avatarUrl) : '';

    this._clearKissReactionTimers();
    this._stopKissReactionSounds();
    this._kissTimelineCtx = {
      mode: 'self',
      seatX: seatX,
      seatY: seatY,
      cx: centerX,
      cy: centerY,
      endX: centerX,
      endY: centerY,
      startX: startX,
      startY: startY,
      ctrlX: ctrlX,
      ctrlY: ctrlY,
      left: left,
      top: top,
      width: width,
      height: height,
      centerW: centerW,
      centerH: centerH,
      centerScale: centerScale,
      flyMs: flyMs,
      toCenterMs: toCenterMs,
      returnMs: returnMs,
      returnSpin: returnSpin,
      arriveScale: arriveScale,
      entryKey: key,
      playerId: hitPlayerId,
      avatarUrl: url
    };

    this.setData({
      playerActionSheetVisible: false,
      playerActionTarget: null,
      reactionScreenVisible: true,
      reactionScreenFading: false,
      reactionScreenMode: 'kiss',
      reactionKissIsSelf: true,
      reactionKissLipsVisible: false,
      reactionKissLipsPhase: '',
      reactionKissLipsStyle: '',
      reactionKissLipsMouth: 'idle',
      reactionKissLipsPress: false,
      reactionKissHearts: [],
      reactionKissTargetVisible: false,
      reactionKissTargetStyle: '',
      reactionKissTargetLipsStyle: '',
      reactionKissTargetHearts: [],
      reactionKissSelfAvatarVisible: true,
      reactionKissSelfAvatarUrl: url,
      reactionKissSelfAvatarPhase: 'seat',
      reactionKissSelfShyVisible: false,
      reactionAvatarMode: 'normal',
      showKissShyFace: false,
      kissShyFaceSrc: '/subpackages/reaction/assets/reaction/kiss_shy_face.png',
      kissLipsSrc: '/subpackages/reaction/assets/reaction/kiss_lips.png',
      reactionKissSelfHeartsFading: false,
      reactionKissSelfAvatarStyle: this._buildKissSelfAvatarStyle({
        x: seatX,
        y: seatY,
        w: width,
        h: height,
        rot: 0,
        ms: 0
      }),
      reactionAvatarDetached: !!hitPlayerId,
      reactionAvatarDetachedPlayerId: hitPlayerId,
      reactionActiveMode: hitPlayerId ? 'self' : ''
    });

    const timeline =
      kissReactionTimeline.buildKissSelfReactionTimeline
        ? kissReactionTimeline.buildKissSelfReactionTimeline()
        : kissReactionTimeline.buildKissReactionTimeline({ mode: 'self' });
    this._runKissReactionTimeline(timeline);
  },

  _buildKissSelfAvatarStyle(opts) {
    const o = opts || {};
    const x = o.x != null ? o.x : 0;
    const y = o.y != null ? o.y : 0;
    const w = o.w != null ? o.w : 44;
    const h = o.h != null ? o.h : 44;
    const rot = o.rot != null ? o.rot : 0;
    const ms = o.ms != null ? Number(o.ms) : 0;
    const ease = o.ease || 'cubic-bezier(0.22, 0.7, 0.28, 1)';
    const transition =
      ms > 0
        ? 'left ' +
          ms +
          'ms ' +
          ease +
          ',top ' +
          ms +
          'ms ' +
          ease +
          ',width ' +
          ms +
          'ms ' +
          ease +
          ',height ' +
          ms +
          'ms ' +
          ease +
          ',transform ' +
          ms +
          'ms ' +
          ease
        : 'none';
    return (
      'left:' +
      x +
      'px;top:' +
      y +
      'px;width:' +
      w +
      'px;height:' +
      h +
      'px;transform:translate(-50%,-50%) rotate(' +
      rot +
      'deg);transition:' +
      transition +
      ';'
    );
  },

  /**
   * Demo：👄 Self — 隐藏临时层原头像，切换为独立卡通害羞脸整图。
   * 不分析/不修改用户真实头像。
   */
  _showKissShyFace() {
    this.setData({
      reactionAvatarMode: 'kissShy',
      showKissShyFace: true,
      reactionKissSelfShyVisible: true,
      reactionKissSelfAvatarPhase: 'shy',
      kissShyFaceSrc: '/subpackages/reaction/assets/reaction/kiss_shy_face.png'
    });
  },

  /** Demo：👄 Self — 恢复临时层为原头像模式（清理卡通脸） */
  _hideKissShyFace() {
    this.setData({
      reactionAvatarMode: 'restore',
      showKissShyFace: false,
      reactionKissSelfShyVisible: false
    });
  },

  /** Demo：👄 Self 红心相对临时头像层中心（随头像回座一起移动） */
  _buildKissSelfAttachedHearts() {
    const count = 5 + Math.floor(Math.random() * 3); // 5–7
    const hearts = [];
    for (let i = 0; i < count; i++) {
      const scale = (0.65 + Math.random() * 0.7).toFixed(2);
      const delay = (0.02 + i * 0.08 + Math.random() * 0.05).toFixed(2);
      const dur = (1.1 + Math.random() * 0.7).toFixed(2);
      const drift = Math.round(-36 + Math.random() * 72);
      const rise = Math.round(-(70 + Math.random() * 80));
      const ox = Math.round(-16 + Math.random() * 32);
      const oy = Math.round(-22 + Math.random() * 18);
      hearts.push({
        id: 'skh-' + i + '-' + Date.now(),
        pop: true,
        attached: true,
        style:
          'left:calc(50% + ' +
          ox +
          'px);top:calc(50% + ' +
          oy +
          'px);--kiss-heart-scale:' +
          scale +
          ';--kiss-heart-drift:' +
          drift +
          'px;--kiss-heart-rise:' +
          rise +
          'px;animation-duration:' +
          dur +
          's;animation-delay:' +
          delay +
          's;'
      });
    }
    return hearts;
  },

  /** Demo：👄 Self 回座后：红心改绝对定位在座位继续漂浮 */
  _buildKissSelfSeatHearts(seatX, seatY) {
    const count = 4 + Math.floor(Math.random() * 3);
    const hearts = [];
    for (let i = 0; i < count; i++) {
      const scale = (0.55 + Math.random() * 0.65).toFixed(2);
      const delay = (0.05 + i * 0.12).toFixed(2);
      const dur = (1.35 + Math.random() * 0.7).toFixed(2);
      const drift = Math.round(-30 + Math.random() * 60);
      const rise = Math.round(-(90 + Math.random() * 70));
      const ox = Math.round(seatX + (-14 + Math.random() * 28));
      const oy = Math.round(seatY + (-10 + Math.random() * 14));
      hearts.push({
        id: 'ssh-' + i + '-' + Date.now(),
        pop: false,
        attached: false,
        style:
          'left:' +
          ox +
          'px;top:' +
          oy +
          'px;--kiss-heart-scale:' +
          scale +
          ';--kiss-heart-drift:' +
          drift +
          'px;--kiss-heart-rise:' +
          rise +
          'px;animation-duration:' +
          dur +
          's;animation-delay:' +
          delay +
          's;'
      });
    }
    return hearts;
  },

  _clearKissReactionTimers() {
    const keys = ['_kissArcTimer', '_kissFlyStartTimer'];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (this[k]) {
        clearTimeout(this[k]);
        this[k] = null;
      }
    }
    const tl = this._kissTimelineTimers;
    if (tl && tl.length) {
      for (let j = 0; j < tl.length; j++) {
        clearTimeout(tl[j]);
      }
    }
    this._kissTimelineTimers = [];
  },

  _kissTimeout(fn, ms) {
    const self = this;
    if (!this._kissTimelineTimers) this._kissTimelineTimers = [];
    const id = setTimeout(function () {
      const list = self._kissTimelineTimers || [];
      const idx = list.indexOf(id);
      if (idx >= 0) list.splice(idx, 1);
      try {
        fn();
      } catch (err) {
        scoreDebugLog('[kiss-timeline] handler error', err);
      }
    }, ms);
    this._kissTimelineTimers.push(id);
    return id;
  },

  _stopKissReactionSounds() {
    try {
      reactionSounds.stopReactionSound('kiss');
    } catch (err) {
      /* ignore */
    }
  },

  _buildKissLipsStyle(x, y, rot, scale, opacity) {
    return (
      'left:' +
      x +
      'px;top:' +
      y +
      'px;opacity:' +
      opacity +
      ';transform:translate(-50%,-50%) rotate(' +
      rot +
      'deg) scale(' +
      scale +
      ');'
    );
  },

  /**
   * @param {number} endX
   * @param {number} endY
   * @param {{ count?: number, selfPop?: boolean, delayBase?: number }=} opts
   */
  _buildKissHearts(endX, endY, opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const selfPop = !!o.selfPop;
    const count =
      o.count != null
        ? Math.max(1, o.count | 0)
        : selfPop
          ? 3 + Math.floor(Math.random() * 6) // self 3–8
          : 3 + Math.floor(Math.random() * 4); // observer 3–6
    const delayBase = o.delayBase != null ? o.delayBase : 0.05;
    const hearts = [];
    for (let i = 0; i < count; i++) {
      const scale = selfPop
        ? (0.7 + Math.random() * 0.95).toFixed(2)
        : (0.55 + Math.random() * 0.75).toFixed(2);
      const delay = selfPop
        ? (delayBase + Math.random() * 0.04).toFixed(2)
        : (0.05 + i * (0.12 + Math.random() * 0.1) + Math.random() * 0.08).toFixed(2);
      const dur = selfPop
        ? (1.05 + Math.random() * 0.95).toFixed(2)
        : (1.15 + Math.random() * 0.85).toFixed(2);
      const drift = Math.round(
        selfPop ? -42 + Math.random() * 84 : -28 + Math.random() * 56
      );
      const rise = Math.round(
        selfPop ? -(110 + Math.random() * 90) : -(90 + Math.random() * 70)
      );
      const ox = Math.round(endX + (selfPop ? -18 + Math.random() * 36 : -10 + Math.random() * 20));
      const oy = Math.round(endY + (selfPop ? -14 + Math.random() * 18 : -6 + Math.random() * 10));
      hearts.push({
        id: 'kh-' + i + '-' + Date.now() + '-' + Math.floor(Math.random() * 999),
        pop: selfPop,
        style:
          'left:' +
          ox +
          'px;top:' +
          oy +
          'px;--kiss-heart-scale:' +
          scale +
          ';--kiss-heart-drift:' +
          drift +
          'px;--kiss-heart-rise:' +
          rise +
          'px;animation-duration:' +
          dur +
          's;animation-delay:' +
          delay +
          's;'
      });
    }
    return hearts;
  },

  /** Demo：👄 Self — 连续弹出 3–8 颗红心（非一次全出） */
  _startSelfKissHeartSpawn(endX, endY) {
    const total = 3 + Math.floor(Math.random() * 6);
    const self = this;
    let spawned = 0;
    const spawnOne = function () {
      if (!self._kissTimelineCtx || self._kissTimelineCtx.mode !== 'self') return;
      if (spawned >= total) return;
      const next = (self.data.reactionKissHearts || []).concat(
        self._buildKissHearts(endX, endY, { count: 1, selfPop: true, delayBase: 0 })
      );
      self.setData({ reactionKissHearts: next.slice(-8) });
      spawned += 1;
      if (spawned < total) {
        self._kissTimeout(spawnOne, 70 + Math.floor(Math.random() * 110));
      }
    };
    spawnOne();
  },

  _runKissReactionTimeline(timeline) {
    const self = this;
    const list = timeline || [];
    for (let i = 0; i < list.length; i++) {
      (function (ev) {
        self._kissTimeout(function () {
          self._dispatchKissTimelineEvent(ev);
        }, ev.time);
      })(list[i]);
    }
  },

  _dispatchKissTimelineEvent(ev) {
    const e = ev || {};
    const action = e.action != null ? String(e.action) : '';
    const ctx = this._kissTimelineCtx || {};
    // reaction-view-model-v2：kiss 仅目标中央舞台
    if (ctx.mode !== 'self') return;
    const isSelf = true;
    const page = this;

    if (action === 'self_avatar_center') {
      if (!isSelf) return;
      const ms = e.duration != null ? e.duration : ctx.toCenterMs || 420;
      this.setData({
        reactionAvatarDetached: true,
        reactionAvatarDetachedPlayerId: ctx.playerId || '',
        reactionActiveMode: 'self',
        reactionKissSelfAvatarVisible: true,
        reactionKissSelfAvatarPhase: 'seat',
        reactionKissSelfShyVisible: false,
        reactionAvatarMode: 'normal',
        showKissShyFace: false,
        reactionKissSelfHeartsFading: false,
        reactionKissHearts: [],
        reactionKissSelfAvatarStyle: this._buildKissSelfAvatarStyle({
          x: ctx.seatX,
          y: ctx.seatY,
          w: ctx.width,
          h: ctx.height,
          rot: 0,
          ms: 0
        })
      });
      this._kissTimeout(function () {
        if (!page._kissTimelineCtx || page._kissTimelineCtx.mode !== 'self') return;
        page.setData({
          reactionKissSelfAvatarPhase: 'center',
          reactionKissSelfAvatarStyle: page._buildKissSelfAvatarStyle({
            x: ctx.cx,
            y: ctx.cy,
            w: ctx.centerW || ctx.width * 4,
            h: ctx.centerH || ctx.height * 4,
            rot: 0,
            ms: ms
          })
        });
      }, 24);
      return;
    }

    if (action === 'kiss_self_fly' || (action === 'kiss_fly' && isSelf)) {
      if (!isSelf) return;
      this.setData({
        reactionKissLipsVisible: true,
        reactionKissLipsPhase: 'fly',
        reactionKissLipsMouth: 'idle',
        reactionKissLipsPress: false,
        reactionKissLipsStyle: this._buildKissLipsStyle(
          ctx.startX,
          ctx.startY,
          -14,
          0.34,
          0.68
        )
      });
      this._startKissArcFlight(ctx);
      return;
    }

    // 害羞脸：kiss_hit +50~100ms；不在此节点淡出嘴唇
    if (action === 'shy_face_show') {
      if (!isSelf) return;
      this._showKissShyFace();
      return;
    }

    // 嘴唇闭合亲吻（CSS scaleY 形变，不换资源）
    if (action === 'kiss_close') {
      if (!isSelf) return;
      const arriveScale = ctx.arriveScale != null ? ctx.arriveScale : 1.35;
      const press = e.press !== false;
      this.setData({
        reactionKissLipsVisible: true,
        reactionKissLipsPhase: 'kiss',
        reactionKissLipsMouth: 'close',
        reactionKissLipsPress: !!press,
        reactionKissLipsStyle:
          'left:' +
          (ctx.cx != null ? ctx.cx : ctx.endX) +
          'px;top:' +
          (ctx.cy != null ? ctx.cy : ctx.endY) +
          'px;opacity:1;--kiss-arrive-scale:' +
          arriveScale.toFixed(2) +
          ';'
      });
      if (press) {
        const pageClose = this;
        this._kissTimeout(function () {
          if (!pageClose._kissTimelineCtx || pageClose._kissTimelineCtx.mode !== 'self') {
            return;
          }
          pageClose.setData({ reactionKissLipsPress: false });
        }, 280);
      }
      return;
    }

    // 嘴唇轻微打开
    if (action === 'kiss_open') {
      if (!isSelf) return;
      const arriveScale = ctx.arriveScale != null ? ctx.arriveScale : 1.35;
      this.setData({
        reactionKissLipsVisible: true,
        reactionKissLipsPhase: 'kiss',
        reactionKissLipsMouth: 'open',
        reactionKissLipsPress: false,
        reactionKissLipsStyle:
          'left:' +
          (ctx.cx != null ? ctx.cx : ctx.endX) +
          'px;top:' +
          (ctx.cy != null ? ctx.cy : ctx.endY) +
          'px;opacity:1;--kiss-arrive-scale:' +
          arriveScale.toFixed(2) +
          ';'
      });
      return;
    }

    // 亲吻音效：与首次 kiss_close 同步
    if (action === 'kiss_sound') {
      if (!isSelf) return;
      if (e.sound) {
        this._playReactionSound(e.sound, {
          volume: e.volume != null ? e.volume : 1,
          seekMs: e.seekMs != null ? e.seekMs : 0
        });
      } else {
        this._playReactionSound('kiss', {
          volume:
            (kissReactionTimeline.SELF_KISS_TIMING &&
              kissReactionTimeline.SELF_KISS_TIMING.hitVolume) ||
            1,
          seekMs: 0
        });
      }
      return;
    }

    // 嘴唇停留：贴合中央 + 轻微开合；保持卡通害羞脸
    if (action === 'kiss_hold' || action === 'lip_hold') {
      if (!isSelf) return;
      const arriveScale = ctx.arriveScale != null ? ctx.arriveScale : 1.35;
      if (this.data.reactionAvatarMode !== 'kissShy') {
        this._showKissShyFace();
      }
      this.setData({
        reactionKissLipsVisible: true,
        reactionKissLipsPhase: 'hold',
        reactionKissLipsMouth: 'idle',
        reactionKissLipsPress: false,
        reactionAvatarMode: 'kissShy',
        showKissShyFace: true,
        reactionKissSelfShyVisible: true,
        reactionKissLipsStyle:
          'left:' +
          (ctx.cx != null ? ctx.cx : ctx.endX) +
          'px;top:' +
          (ctx.cy != null ? ctx.cy : ctx.endY) +
          'px;opacity:1;--kiss-arrive-scale:' +
          arriveScale.toFixed(2) +
          ';'
      });
      return;
    }

    // 停留结束：嘴唇先离开；卡通害羞脸保持
    if (action === 'lips_leave') {
      if (!isSelf) return;
      this.setData({
        reactionKissLipsPhase: 'fade',
        reactionKissLipsMouth: 'idle',
        reactionKissLipsPress: false,
        reactionAvatarMode: 'kissShy',
        showKissShyFace: true,
        reactionKissSelfShyVisible: true
      });
      const leaveMs =
        e.duration != null
          ? e.duration
          : (kissReactionTimeline.SELF_KISS_TIMING &&
              kissReactionTimeline.SELF_KISS_TIMING.lipsLeaveMs) ||
            420;
      this._kissTimeout(function () {
        if (!page._kissTimelineCtx || page._kissTimelineCtx.mode !== 'self') {
          return;
        }
        page.setData({
          reactionKissLipsVisible: false,
          reactionKissLipsStyle: '',
          reactionKissLipsPhase: '',
          reactionKissLipsMouth: 'idle',
          reactionKissLipsPress: false
        });
      }, leaveMs);
      return;
    }

    if (action === 'avatar_return' || action === 'avatar_return_with_hearts') {
      if (!isSelf) return;
      const ms = e.duration != null ? e.duration : ctx.returnMs || 720;
      const spin = ctx.returnSpin != null ? ctx.returnSpin : 360;
      // 回座全程保持卡通害羞脸，中途不切回原头像
      this.setData({
        reactionKissSelfAvatarPhase: 'return',
        reactionAvatarMode: 'kissShy',
        showKissShyFace: true,
        reactionKissSelfShyVisible: true,
        reactionKissLipsVisible: false,
        reactionKissLipsStyle: '',
        reactionKissLipsPhase: '',
        reactionKissLipsMouth: 'idle',
        reactionKissLipsPress: false,
        reactionKissSelfAvatarStyle: this._buildKissSelfAvatarStyle({
          x: ctx.seatX,
          y: ctx.seatY,
          w: ctx.width,
          h: ctx.height,
          rot: spin,
          ms: ms,
          ease: 'cubic-bezier(0.28, 0.65, 0.32, 1)'
        })
      });
      return;
    }

    if (action === 'seat_hearts_float') {
      if (!isSelf) return;
      // 回座后：卡通脸仍在座位短暂保留 → 红心漂浮 → 延迟恢复原头像
      this.setData({
        reactionKissSelfAvatarPhase: 'seat',
        reactionAvatarMode: 'kissShy',
        showKissShyFace: true,
        reactionKissSelfShyVisible: true,
        reactionKissHearts: this._buildKissSelfSeatHearts(ctx.seatX, ctx.seatY),
        reactionKissSelfHeartsFading: false
      });
      const clearMs =
        (kissReactionTimeline.SELF_KISS_TIMING &&
          kissReactionTimeline.SELF_KISS_TIMING.shySeatClearMs) ||
        900;
      this._kissTimeout(function () {
        if (!page._kissTimelineCtx || page._kissTimelineCtx.mode !== 'self') {
          return;
        }
        page.setData({
          reactionKissSelfAvatarVisible: false,
          reactionAvatarMode: 'restore',
          showKissShyFace: false,
          reactionKissSelfShyVisible: false,
          reactionAvatarDetached: false,
          reactionAvatarDetachedPlayerId: '',
          reactionActiveMode: ''
        });
      }, clearMs);
      return;
    }

    if (action === 'hearts_fade' || action === 'heart_fade') {
      if (!isSelf) return;
      this.setData({ reactionKissSelfHeartsFading: true });
      return;
    }

    if (action === 'restore') {
      if (!isSelf) return;
      this._stopKissReactionSounds();
      this._clearKissReactionTimers();
      this.setData({
        reactionScreenVisible: false,
        reactionScreenFading: false,
        reactionScreenMode: '',
        reactionKissLipsVisible: false,
        reactionKissLipsStyle: '',
        reactionKissLipsPhase: '',
        reactionKissLipsMouth: 'idle',
        reactionKissLipsPress: false,
        reactionKissHearts: [],
        reactionKissIsSelf: false,
        reactionKissTargetVisible: false,
        reactionKissTargetStyle: '',
        reactionKissTargetLipsStyle: '',
        reactionKissTargetHearts: [],
        reactionKissSelfAvatarVisible: false,
        reactionKissSelfAvatarUrl: '',
        reactionKissSelfAvatarStyle: '',
        reactionKissSelfAvatarPhase: '',
        reactionKissSelfShyVisible: false,
        reactionAvatarMode: 'normal',
        showKissShyFace: false,
        reactionKissSelfHeartsFading: false,
        reactionAvatarDetached: false,
        reactionAvatarDetachedPlayerId: '',
        reactionActiveMode: ''
      });
      this._kissTimelineCtx = null;
      this._playerActionKissBusy = false;
      return;
    }

    if (action === 'kiss_hit') {
      if (!isSelf) return;
      const arriveScale = ctx.arriveScale != null ? ctx.arriveScale : 1.35;
      if (this._kissArcTimer) {
        clearTimeout(this._kissArcTimer);
        this._kissArcTimer = null;
      }
      // 命中：贴合中央 + 轻微放大；开合/音效由 kiss_close + kiss_sound 驱动
      this.setData({
        reactionKissLipsVisible: true,
        reactionKissLipsPhase: 'hit',
        reactionKissLipsMouth: 'idle',
        reactionKissLipsPress: false,
        reactionKissSelfAvatarPhase: 'kiss',
        reactionKissLipsStyle:
          'left:' +
          (ctx.cx != null ? ctx.cx : ctx.endX) +
          'px;top:' +
          (ctx.cy != null ? ctx.cy : ctx.endY) +
          'px;opacity:1;--kiss-arrive-scale:' +
          arriveScale.toFixed(2) +
          ';'
      });
      // 兼容旧 timeline：若仍挂 sound 则播放；正式路径用 kiss_sound
      if (e.sound) {
        this._playReactionSound(e.sound, {
          volume: e.volume != null ? e.volume : 1,
          seekMs: e.seekMs != null ? e.seekMs : 0
        });
      }
      return;
    }

    if (action === 'hearts_start' || action === 'heart_spawn') {
      if (!isSelf) return;
      this.setData({
        reactionKissHearts: this._buildKissSelfAttachedHearts(),
        reactionKissSelfHeartsFading: false
      });
      return;
    }

    if (action === 'cleanup') {
      this._stopKissReactionSounds();
      this._clearKissReactionTimers();
      this.setData({
        reactionScreenVisible: false,
        reactionScreenFading: false,
        reactionScreenMode: '',
        reactionKissLipsVisible: false,
        reactionKissLipsStyle: '',
        reactionKissLipsPhase: '',
        reactionKissLipsMouth: 'idle',
        reactionKissLipsPress: false,
        reactionKissHearts: [],
        reactionKissIsSelf: false,
        reactionKissTargetVisible: false,
        reactionKissTargetStyle: '',
        reactionKissTargetLipsStyle: '',
        reactionKissTargetHearts: [],
        reactionKissSelfAvatarVisible: false,
        reactionKissSelfAvatarUrl: '',
        reactionKissSelfAvatarStyle: '',
        reactionKissSelfAvatarPhase: '',
        reactionKissSelfShyVisible: false,
        reactionAvatarMode: 'normal',
        showKissShyFace: false,
        reactionKissSelfHeartsFading: false,
        reactionAvatarDetached: false,
        reactionAvatarDetachedPlayerId: '',
        reactionActiveMode: ''
      });
      this._kissTimelineCtx = null;
      this._playerActionKissBusy = false;
    }
  },

  /** Demo：👄 贝塞尔飞行；Self 近镜头 / Observer 飞向头像中心 */
  _startKissArcFlight(ctx) {
    const self = this;
    const c = ctx || this._kissTimelineCtx || {};
    const isSelf = c.mode === 'self';
    const startX = c.startX;
    const startY = c.startY;
    const endX = c.endX;
    const endY = c.endY;
    const ctrlX = c.ctrlX;
    const ctrlY = c.ctrlY;
    const flyMs = c.flyMs != null ? c.flyMs : isSelf ? 1080 : 980;
    const arriveScale =
      c.arriveScale != null ? c.arriveScale : isSelf ? 1.35 : 1;
    const easeIn = function (t) {
      return t * t * t;
    };
    // Observer：小 → 放大，终点刚好盖住头像中心尺度
    const scaleAtObserver = function (t) {
      if (t <= 0.5) return 0.32 + (0.7 - 0.32) * (t / 0.5);
      return 0.7 + (1.05 - 0.7) * ((t - 0.5) / 0.5);
    };
    // Self：飞近放大 → arriveScale 1.2–1.5（纯嘟嘴素材基准更大）
    const scaleAtSelf = function (t) {
      if (t <= 0.42) return 0.4 + (0.85 - 0.4) * (t / 0.42);
      if (t <= 0.72) return 0.85 + (1.05 - 0.85) * ((t - 0.42) / 0.3);
      return 1.05 + (arriveScale - 1.05) * ((t - 0.72) / 0.28);
    };
    const t0 = Date.now();

    const tick = function () {
      if (!self._kissTimelineCtx) return;
      const elapsed = Date.now() - t0;
      let raw = elapsed / flyMs;
      if (raw >= 1) raw = 1;
      const t = easeIn(raw);
      const u = 1 - t;
      const x = u * u * startX + 2 * u * t * ctrlX + t * t * endX;
      const bob = isSelf
        ? Math.sin(raw * Math.PI * 2.4) * (14 * (1 - raw * 0.35))
        : Math.sin(raw * Math.PI * 1.8) * (8 * (1 - raw * 0.5));
      const y = u * u * startY + 2 * u * t * ctrlY + t * t * endY + bob;
      const rot = isSelf
        ? -18 + 36 * t + Math.sin(raw * Math.PI * 1.6) * 14
        : -16 + 30 * t + Math.sin(raw * Math.PI) * 12;
      const scale = isSelf ? scaleAtSelf(t) : scaleAtObserver(t);
      const opacity = isSelf ? 0.68 + 0.32 * t : 0.72 + 0.28 * t;
      self.setData({
        reactionKissLipsPhase: 'fly',
        reactionKissLipsStyle: self._buildKissLipsStyle(x, y, rot, scale, opacity)
      });
      if (raw < 1) {
        self._kissArcTimer = setTimeout(tick, 16);
        return;
      }
      self._kissArcTimer = null;
      // 落点视觉由 kiss_hit 对齐；此处兜底定位到头像/屏中心
      if (isSelf) {
        self.setData({
          reactionKissLipsStyle:
            'left:' +
            endX +
            'px;top:' +
            endY +
            'px;opacity:1;--kiss-arrive-scale:' +
            arriveScale.toFixed(2) +
            ';'
        });
      } else {
        self.setData({
          reactionKissLipsStyle:
            'left:' + endX + 'px;top:' + endY + 'px;opacity:1;'
        });
      }
    };

    tick();
  },

  /**
   * Demo：🍺 → 干杯 reaction。
   * Self（demo TIGERHOODS / 当前用户）→ 第一视角；他人 → Observer 第三视角。
   * 仅 demo-weekend-amateur。
   */
  onPlayerActionBeerTap() {
    if (this._playerActionBeerBusy) return;
    if (!scoreReactionController.canPlayReaction(this._hostGameId(), 'beer', this._getScoreReactionCtx())) {
      return;
    }
    const target = this.data.playerActionTarget;
    const playerId =
      target && (target.playerId || target.userId) != null
        ? String(target.playerId || target.userId).trim()
        : '';
    if (!playerId) {
      scoreDebugLog('[player-action-beer] missing playerId');
      return;
    }
    this._playerActionBeerBusy = true;
    // demo TIGERHOODS → Self；正式 currentUser 判断保持 _isSelfReactionTarget 不变
    if (this._isDemoSelfPlayer(target || playerId) || this._isSelfReactionTarget(playerId)) {
      this._playSelfReaction('beer', { playerId: playerId, target: target });
      return;
    }
    this._playObserverReaction('beer', target);
  },

  /**
   * Demo：🍺 SELF — 第一视角双杯碰杯。
   * 第一杯边缘入场 → 第二杯对向入场 → 屏中碰杯 → 增强啤酒花；不读头像 rect。
   */
  _playSelfBeerReaction() {
    const size = this._getReactionWindowSize();
    const winW = size.winW;
    const winH = size.winH;
    const firstEntry = this._getRandomSelfReactionEntryPoint(winW, winH);
    const secondEntry = this._getOppositeSelfReactionEntryPoint(
      firstEntry,
      winW,
      winH
    );
    const cx = winW / 2;
    const cy = winH / 2;
    const selfTiming = beerReactionTimeline.BEER_SELF_TIMING || {};
    const audioClip = beerReactionTimeline.BEER_AUDIO_CLIP || {};
    const firstFlyMs = selfTiming.firstFlyMs != null ? selfTiming.firstFlyMs : 780;
    const secondFlyMs = selfTiming.secondFlyMs != null ? selfTiming.secondFlyMs : 520;
    const finalScale = selfTiming.finalScale != null ? selfTiming.finalScale : 1.75;
    const clashScale =
      selfTiming.clashScalePeak != null ? selfTiming.clashScalePeak : 1.18;
    const cheersPath =
      (reactionSounds.SOUND_SRC && reactionSounds.SOUND_SRC.cheers) ||
      '/subpackages/reaction/assets/sounds/cheers.mp3';
    const cheersDuration = audioClip.durationMs != null ? audioClip.durationMs : 2135;
    const peakMs = audioClip.peakMs != null ? audioClip.peakMs : 1520;
    // 大杯落点：略分左右，视觉中心仍在屏中
    const cupGap = Math.max(38, Math.round(28 * finalScale));

    this._clearBeerReactionTimers();
    this._stopBeerSelfHoldBubbles();
    try {
      reactionSounds.stopReactionSound('cheers');
    } catch (err) {
      /* ignore */
    }

    scoreDebugLog('[beer] beer reaction start', {
      mode: 'self',
      dual: true,
      audioSync: true,
      peakMs: peakMs,
      finalScale: finalScale
    });
    scoreDebugLog('[beer] cheers duration', cheersDuration);

    this._beerTimelineCtx = {
      mode: 'self',
      cx: cx,
      cy: cy,
      firstEndX: cx - cupGap,
      firstEndY: cy,
      secondEndX: cx + cupGap,
      secondEndY: cy,
      startX: firstEntry.x,
      startY: firstEntry.y,
      entryKey: firstEntry.key || '',
      secondStartX: secondEntry.x,
      secondStartY: secondEntry.y,
      secondEntryKey: secondEntry.key || '',
      firstFlyMs: firstFlyMs,
      secondFlyMs: secondFlyMs,
      finalScale: finalScale,
      clashScale: clashScale,
      mainFlyMs: firstFlyMs,
      sideFlyMs: 0,
      cheersPath: cheersPath,
      cheersDuration: cheersDuration,
      peakMs: peakMs
    };

    this.setData({
      playerActionSheetVisible: false,
      playerActionTarget: null,
      reactionScreenVisible: true,
      reactionScreenFading: false,
      reactionScreenMode: 'beer',
      reactionBeerIsSelf: true,
      reactionBeerMainVisible: false,
      reactionBeerMainPhase: '',
      reactionBeerMainStyle: '',
      reactionBeerLeftVisible: false,
      reactionBeerLeftPhase: '',
      reactionBeerLeftStyle: '',
      reactionBeerRightVisible: false,
      reactionBeerRightPhase: '',
      reactionBeerRightStyle: '',
      reactionBeerSplashVisible: false,
      reactionBeerSplashStyle: '',
      reactionBeerFlashVisible: false,
      reactionBeerFlashStyle: '',
      reactionBeerShaking: false,
      reactionBeerBubbles: []
    });

    const timeline = beerReactionTimeline.buildBeerSelfReactionTimeline
      ? beerReactionTimeline.buildBeerSelfReactionTimeline()
      : beerReactionTimeline.buildBeerReactionTimeline({ mode: 'self' });
    this._runBeerReactionTimeline(timeline);
  },

  /** Demo：🍺 Self — 与第一杯入口对向的边缘点 */
  _getOppositeSelfReactionEntryPoint(firstEntry, winW, winH) {
    const w = Number(winW) || 375;
    const h = Number(winH) || 667;
    const pad = Math.max(72, Math.round(Math.min(w, h) * 0.2));
    const key = String((firstEntry && firstEntry.key) || '');
    const map = {
      top: { key: 'bottom', x: w * 0.5, y: h + pad },
      bottom: { key: 'top', x: w * 0.5, y: -pad },
      left: { key: 'right', x: w + pad, y: h * 0.5 },
      right: { key: 'left', x: -pad, y: h * 0.5 },
      'top-left': { key: 'bottom-right', x: w + pad, y: h + pad },
      'top-right': { key: 'bottom-left', x: -pad, y: h + pad },
      'bottom-left': { key: 'top-right', x: w + pad, y: -pad },
      'bottom-right': { key: 'top-left', x: -pad, y: -pad }
    };
    if (map[key]) return map[key];
    // 兜底：镜像坐标
    const fx = Number(firstEntry && firstEntry.x);
    const fy = Number(firstEntry && firstEntry.y);
    return {
      key: 'mirror',
      x: Number.isFinite(fx) ? w - fx : w + pad,
      y: Number.isFinite(fy) ? h - fy : -pad
    };
  },

  /** Demo：🍺 OBSERVER — 锚定目标头像中心干杯 */
  _playObserverBeerReaction(rect, playerId) {
    const hitPlayerId = playerId != null ? String(playerId).trim() : '';
    if (this._isDemoSelfPlayer(hitPlayerId) || this._isSelfReactionTarget(hitPlayerId)) {
      this._playSelfBeerReaction();
      return;
    }
    const norm =
      this._normalizePlayerActionAvatarRect(rect) ||
      this._fallbackPlayerActionAvatarRect() ||
      rect;
    const left = Number(norm.left);
    const top = Number(norm.top);
    const width = Number(norm.width);
    const height = Number(norm.height);
    if (
      !Number.isFinite(left) ||
      !Number.isFinite(top) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      this._playerActionBeerBusy = false;
      return;
    }
    const cx = left + width / 2;
    const cy = top + height / 2;
    const entry = this._getReactionEntryPoint(norm);
    const mainFlyMs = beerReactionTimeline.BEER_TIMING.mainFlyMs;
    const sideFlyMs = beerReactionTimeline.BEER_TIMING.sideFlyMs;
    const sidePad = Math.max(72, Math.round(Math.max(width, height) * 2.2));
    const cheersPath =
      (reactionSounds.SOUND_SRC && reactionSounds.SOUND_SRC.cheers) ||
      '/subpackages/reaction/assets/sounds/cheers.mp3';
    const cheersDuration =
      (beerReactionTimeline.BEER_AUDIO_CLIP &&
        beerReactionTimeline.BEER_AUDIO_CLIP.durationMs) ||
      2135;

    this._clearBeerReactionTimers();
    try {
      reactionSounds.stopReactionSound('cheers');
    } catch (err) {
      /* ignore */
    }

    scoreDebugLog('[beer] beer reaction start', { mode: 'observer' });
    scoreDebugLog('[beer] cheers duration', cheersDuration);

    this._beerTimelineCtx = {
      mode: 'observer',
      cx: cx,
      cy: cy,
      left: left,
      top: top,
      width: width,
      height: height,
      startX: entry.x,
      startY: entry.y,
      entryKey: entry.key || '',
      mainFlyMs: mainFlyMs,
      sideFlyMs: sideFlyMs,
      cheersPath: cheersPath,
      cheersDuration: cheersDuration,
      sideLeftStartX: cx - sidePad,
      sideLeftStartY: cy + (-18 + Math.random() * 36),
      sideRightStartX: cx + sidePad,
      sideRightStartY: cy + (-18 + Math.random() * 36)
    };

    this.setData({
      playerActionSheetVisible: false,
      playerActionTarget: null,
      reactionScreenVisible: true,
      reactionScreenFading: false,
      reactionScreenMode: 'beer',
      reactionBeerIsSelf: false,
      reactionBeerMainVisible: true,
      reactionBeerMainPhase: 'fly',
      reactionBeerMainStyle: this._buildBeerCupStyle(entry.x, entry.y, -10, 0.32, 0.7),
      reactionBeerLeftVisible: false,
      reactionBeerLeftPhase: '',
      reactionBeerLeftStyle: '',
      reactionBeerRightVisible: false,
      reactionBeerRightPhase: '',
      reactionBeerRightStyle: '',
      reactionBeerSplashVisible: false,
      reactionBeerSplashStyle: '',
      reactionBeerFlashVisible: false,
      reactionBeerFlashStyle: '',
      reactionBeerShaking: false,
      reactionBeerBubbles: this._buildBeerHoldBubbles()
    });

    const timeline = beerReactionTimeline.buildBeerReactionTimeline({ mode: 'observer' });
    this._runBeerReactionTimeline(timeline);
  },

  _clearBeerReactionTimers() {
    this._stopBeerSelfHoldBubbles();
    const keys = [
      '_beerArcTimer',
      '_beerSideLeftTimer',
      '_beerSideRightTimer',
      '_beerSelfSecondTimer'
    ];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (this[k]) {
        clearTimeout(this[k]);
        this[k] = null;
      }
    }
    const tl = this._beerTimelineTimers;
    if (tl && tl.length) {
      for (let j = 0; j < tl.length; j++) {
        clearTimeout(tl[j]);
      }
    }
    this._beerTimelineTimers = [];
  },

  _beerTimeout(fn, ms) {
    const self = this;
    if (!this._beerTimelineTimers) this._beerTimelineTimers = [];
    const id = setTimeout(function () {
      const list = self._beerTimelineTimers || [];
      const idx = list.indexOf(id);
      if (idx >= 0) list.splice(idx, 1);
      try {
        fn();
      } catch (err) {
        scoreDebugLog('[beer-timeline] handler error', err);
      }
    }, ms);
    this._beerTimelineTimers.push(id);
    return id;
  },

  _runBeerReactionTimeline(timeline) {
    const self = this;
    const list = timeline || [];
    const isSelf =
      this._beerTimelineCtx && this._beerTimelineCtx.mode === 'self';
    for (let i = 0; i < list.length; i++) {
      (function (ev) {
        self._beerTimeout(function () {
          if (isSelf) {
            self._dispatchBeerSelfTimelineEvent(ev);
          } else {
            self._dispatchBeerTimelineEvent(ev);
          }
        }, ev.time);
      })(list[i]);
    }
  },

  _buildBeerCupStyle(x, y, rot, scale, opacity) {
    return (
      'left:' +
      x +
      'px;top:' +
      y +
      'px;opacity:' +
      opacity +
      ';transform:translate(-50%,-50%) rotate(' +
      rot +
      'deg) scale(' +
      scale +
      ');'
    );
  },

  _buildBeerHoldBubbles() {
    const list = [];
    for (let i = 0; i < 5; i++) {
      list.push({
        id: 'bb-' + i,
        style:
          'left:' +
          (28 + Math.random() * 44).toFixed(1) +
          '%;animation-delay:' +
          (i * 0.14 + Math.random() * 0.2).toFixed(2) +
          's;animation-duration:' +
          (0.85 + Math.random() * 0.55).toFixed(2) +
          's;--beer-bubble-size:' +
          (3 + Math.floor(Math.random() * 4)) +
          'px;'
      });
    }
    return list;
  },

  /** Demo：🍺 Observer timeline 调度（与 Self 分离） */
  _dispatchBeerTimelineEvent(ev) {
    const e = ev || {};
    const action = e.action != null ? String(e.action) : '';
    const ctx = this._beerTimelineCtx || {};
    if (ctx.mode === 'self') return;

    if (action === 'beer_main_fly') {
      const cheersPath =
        ctx.cheersPath ||
        (reactionSounds.SOUND_SRC && reactionSounds.SOUND_SRC.cheers) ||
        '/subpackages/reaction/assets/sounds/cheers.mp3';
      const cheersDuration =
        ctx.cheersDuration != null
          ? ctx.cheersDuration
          : (beerReactionTimeline.BEER_AUDIO_CLIP &&
              beerReactionTimeline.BEER_AUDIO_CLIP.durationMs) ||
            2135;
      scoreDebugLog('[beer] cheers play start', {
        sound: e.sound || 'cheers',
        seekMs: 0,
        path: cheersPath,
        mode: 'observer'
      });
      scoreDebugLog('[beer] cheers duration', cheersDuration);
      if (e.sound) {
        this._playReactionSound(e.sound, {
          volume: e.volume != null ? e.volume : 0.95,
          seekMs: 0
        });
      } else {
        this._playReactionSound('cheers', { volume: 0.95, seekMs: 0 });
      }
      this._startBeerMainFlight(ctx);
      return;
    }

    if (action === 'beer_main_hold') {
      this.setData({
        reactionBeerMainPhase: 'hold',
        reactionBeerMainStyle: this._buildBeerCupStyle(ctx.cx, ctx.cy, 0, 1.05, 1),
        reactionBeerBubbles: this._buildBeerHoldBubbles()
      });
      return;
    }

    if (action === 'beer_side_enter') {
      this.setData({
        reactionBeerLeftVisible: true,
        reactionBeerLeftPhase: 'fly',
        reactionBeerLeftStyle: this._buildBeerCupStyle(
          ctx.sideLeftStartX,
          ctx.sideLeftStartY,
          -18,
          0.45,
          0.8
        ),
        reactionBeerRightVisible: true,
        reactionBeerRightPhase: 'fly',
        reactionBeerRightStyle: this._buildBeerCupStyle(
          ctx.sideRightStartX,
          ctx.sideRightStartY,
          18,
          0.45,
          0.8
        )
      });
      this._startBeerSideFlight('left', ctx);
      this._startBeerSideFlight('right', ctx);
      return;
    }

    if (action === 'beer_clash') {
      scoreDebugLog('[beer] beer clash start', { mode: 'observer' });
      this.setData({
        reactionBeerMainPhase: 'clash',
        reactionBeerMainStyle: this._buildBeerCupStyle(ctx.cx, ctx.cy - 2, 0, 1.12, 1),
        reactionBeerLeftPhase: 'clash',
        reactionBeerLeftStyle: this._buildBeerCupStyle(ctx.cx - 10, ctx.cy + 3, -12, 1.1, 1),
        reactionBeerRightPhase: 'clash',
        reactionBeerRightStyle: this._buildBeerCupStyle(ctx.cx + 10, ctx.cy + 3, 12, 1.1, 1),
        reactionBeerShaking: true,
        reactionBeerFlashVisible: true,
        reactionBeerFlashStyle: 'left:' + ctx.cx + 'px;top:' + ctx.cy + 'px;'
      });
      const page = this;
      this._beerTimeout(function () {
        if (!page._beerTimelineCtx) return;
        page.setData({ reactionBeerFlashVisible: false, reactionBeerShaking: false });
      }, 380);
      return;
    }

    if (action === 'beer_splash') {
      this.setData({
        reactionBeerSplashVisible: true,
        reactionBeerSplashStyle: 'left:' + ctx.cx + 'px;top:' + ctx.cy + 'px;'
      });
      return;
    }

    if (action === 'beer_fade') {
      this.setData({
        reactionBeerMainPhase: 'fade',
        reactionBeerLeftPhase: 'fade',
        reactionBeerRightPhase: 'fade',
        reactionScreenFading: true
      });
      return;
    }

    if (action === 'cleanup') {
      this._cleanupBeerReactionLayer();
    }
  },

  /**
   * Demo：🍺 Self timeline 调度。
   * cheers 在 beer_self_first_fly 从 0ms 起播；碰杯对齐音频 peak。
   */
  _dispatchBeerSelfTimelineEvent(ev) {
    const e = ev || {};
    const action = e.action != null ? String(e.action) : '';
    const ctx = this._beerTimelineCtx || {};
    if (ctx.mode !== 'self') return;
    const finalScale = ctx.finalScale != null ? ctx.finalScale : 1.75;
    const clashScale = ctx.clashScale != null ? ctx.clashScale : 1.18;

    if (action === 'beer_self_first_fly') {
      const cheersPath =
        ctx.cheersPath ||
        (reactionSounds.SOUND_SRC && reactionSounds.SOUND_SRC.cheers) ||
        '/subpackages/reaction/assets/sounds/cheers.mp3';
      scoreDebugLog('[beer] cheers play start', {
        sound: e.sound || 'cheers',
        seekMs: 0,
        path: cheersPath,
        mode: 'self',
        at: 'beer_self_first_fly',
        peakMs: ctx.peakMs || 1520
      });
      scoreDebugLog('[beer] cheers duration', ctx.cheersDuration || 2135);
      // 完整轨从 0ms 起播（不 seek）；动画对齐 mid / peak
      if (e.sound) {
        this._playReactionSound(e.sound, {
          volume: e.volume != null ? e.volume : 0.98,
          seekMs: 0
        });
      } else {
        this._playReactionSound('cheers', { volume: 0.98, seekMs: 0 });
      }
      this.setData({
        reactionBeerMainVisible: true,
        reactionBeerMainPhase: 'fly',
        reactionBeerMainStyle: this._buildBeerCupStyle(
          ctx.startX,
          ctx.startY,
          -14,
          finalScale * 0.38,
          0.78
        ),
        reactionBeerBubbles: this._buildBeerHoldBubbles()
      });
      this._startBeerSelfFirstFlight(ctx);
      return;
    }

    if (action === 'beer_self_first_hold') {
      const ex = ctx.firstEndX != null ? ctx.firstEndX : ctx.cx - 38;
      const ey = ctx.firstEndY != null ? ctx.firstEndY : ctx.cy;
      this.setData({
        reactionBeerMainPhase: 'hold',
        reactionBeerMainStyle: this._buildBeerCupStyle(ex, ey, -4, finalScale, 1),
        reactionBeerBubbles: this._buildBeerHoldBubbles()
      });
      return;
    }

    if (action === 'beer_self_second_fly') {
      if (e.secondFlyMs != null) {
        ctx.secondFlyMs = Number(e.secondFlyMs) || ctx.secondFlyMs;
      }
      this.setData({
        reactionBeerRightVisible: true,
        reactionBeerRightPhase: 'fly',
        reactionBeerRightStyle: this._buildBeerCupStyle(
          ctx.secondStartX,
          ctx.secondStartY,
          16,
          finalScale * 0.36,
          0.82
        )
      });
      this._startBeerSelfSecondFlight(ctx);
      return;
    }

    if (action === 'beer_self_clash') {
      scoreDebugLog('[beer] beer clash start', {
        mode: 'self',
        peakMs: ctx.peakMs || 1520,
        audioSynced: true
      });
      const leftX = ctx.firstEndX != null ? ctx.firstEndX : ctx.cx - 38;
      const rightX = ctx.secondEndX != null ? ctx.secondEndX : ctx.cx + 38;
      const cy = ctx.cy;
      const peak = finalScale * clashScale;
      this.setData({
        reactionBeerMainPhase: 'clash',
        reactionBeerMainStyle: this._buildBeerCupStyle(
          leftX + 10,
          cy - 4,
          -8,
          peak,
          1
        ),
        reactionBeerRightPhase: 'clash',
        reactionBeerRightStyle: this._buildBeerCupStyle(
          rightX - 10,
          cy - 4,
          8,
          peak,
          1
        ),
        reactionBeerShaking: true,
        reactionBeerFlashVisible: true,
        reactionBeerFlashStyle: 'left:' + ctx.cx + 'px;top:' + cy + 'px;',
        reactionBeerBubbles: this._buildBeerHoldBubbles()
      });
      const page = this;
      this._beerTimeout(function () {
        if (!page._beerTimelineCtx) return;
        page.setData({
          reactionBeerMainStyle: page._buildBeerCupStyle(
            leftX + 6,
            cy,
            -5,
            finalScale,
            1
          ),
          reactionBeerRightStyle: page._buildBeerCupStyle(
            rightX - 6,
            cy,
            5,
            finalScale,
            1
          ),
          reactionBeerFlashVisible: false,
          reactionBeerShaking: false
        });
      }, 340);
      return;
    }

    if (action === 'beer_self_splash') {
      this.setData({
        reactionBeerSplashVisible: true,
        reactionBeerSplashStyle: 'left:' + ctx.cx + 'px;top:' + ctx.cy + 'px;'
      });
      return;
    }

    if (action === 'beer_self_hold') {
      const leftX = ctx.firstEndX != null ? ctx.firstEndX : ctx.cx - 38;
      const rightX = ctx.secondEndX != null ? ctx.secondEndX : ctx.cx + 38;
      const cy = ctx.cy;
      this.setData({
        reactionBeerMainPhase: 'celebrate',
        reactionBeerMainStyle: this._buildBeerCupStyle(
          leftX + 6,
          cy,
          -4,
          finalScale,
          1
        ),
        reactionBeerRightPhase: 'celebrate',
        reactionBeerRightStyle: this._buildBeerCupStyle(
          rightX - 6,
          cy,
          4,
          finalScale,
          1
        ),
        reactionBeerBubbles: this._buildBeerHoldBubbles()
      });
      this._startBeerSelfHoldBubbles();
      return;
    }

    if (action === 'beer_self_fade') {
      this._stopBeerSelfHoldBubbles();
      this.setData({
        reactionBeerMainPhase: 'fade',
        reactionBeerRightPhase: 'fade',
        reactionScreenFading: true
      });
      return;
    }

    if (action === 'cleanup') {
      this._cleanupBeerReactionLayer();
    }
  },

  /** Demo：🍺 Self — 停留期持续冒泡 */
  _startBeerSelfHoldBubbles() {
    this._stopBeerSelfHoldBubbles();
    const self = this;
    const tick = function () {
      if (!self._beerTimelineCtx || self._beerTimelineCtx.mode !== 'self') return;
      const phase = self.data.reactionBeerMainPhase;
      if (phase !== 'celebrate' && phase !== 'clash' && phase !== 'hold') return;
      self.setData({ reactionBeerBubbles: self._buildBeerHoldBubbles() });
      self._beerSelfHoldBubbleTimer = setTimeout(tick, 420);
    };
    this._beerSelfHoldBubbleTimer = setTimeout(tick, 420);
  },

  _stopBeerSelfHoldBubbles() {
    if (this._beerSelfHoldBubbleTimer) {
      clearTimeout(this._beerSelfHoldBubbleTimer);
      this._beerSelfHoldBubbleTimer = null;
    }
  },

  _cleanupBeerReactionLayer() {
    try {
      reactionSounds.stopReactionSound('cheers');
    } catch (err) {
      /* ignore */
    }
    this._stopBeerSelfHoldBubbles();
    this._clearBeerReactionTimers();
    this.setData({
      reactionScreenVisible: false,
      reactionScreenFading: false,
      reactionScreenMode: '',
      reactionBeerIsSelf: false,
      reactionBeerMainVisible: false,
      reactionBeerMainPhase: '',
      reactionBeerMainStyle: '',
      reactionBeerLeftVisible: false,
      reactionBeerLeftPhase: '',
      reactionBeerLeftStyle: '',
      reactionBeerRightVisible: false,
      reactionBeerRightPhase: '',
      reactionBeerRightStyle: '',
      reactionBeerSplashVisible: false,
      reactionBeerSplashStyle: '',
      reactionBeerFlashVisible: false,
      reactionBeerFlashStyle: '',
      reactionBeerShaking: false,
      reactionBeerBubbles: []
    });
    this._beerTimelineCtx = null;
    this._playerActionBeerBusy = false;
    try {
      this._emitSeatRestoreEvent();
    } catch (e) {
      /* ignore */
    }
  },

  /** Demo：🍺 Self — 第一杯：边缘 → 屏中（小→大 + 轻旋） */
  _startBeerSelfFirstFlight(ctx) {
    const self = this;
    const c = ctx || this._beerTimelineCtx || {};
    const finalScale = c.finalScale != null ? c.finalScale : 1.75;
    const startScale = finalScale * 0.38;
    const startX = c.startX;
    const startY = c.startY;
    const endX = c.firstEndX != null ? c.firstEndX : c.cx - 38;
    const endY = c.firstEndY != null ? c.firstEndY : c.cy;
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const key = String(c.entryKey || '');
    const sideSign =
      key.indexOf('left') >= 0 ? 1 : key.indexOf('right') >= 0 ? -1 : startX < endX ? 1 : -1;
    const ctrlX = midX + sideSign * (40 + Math.random() * 52);
    const ctrlY = midY - (32 + Math.random() * 44);
    const flyMs = c.firstFlyMs != null ? c.firstFlyMs : 780;
    const easeOut = function (t) {
      return 1 - Math.pow(1 - t, 2.4);
    };
    const t0 = Date.now();

    const tick = function () {
      if (!self._beerTimelineCtx || self._beerTimelineCtx.mode !== 'self') return;
      const elapsed = Date.now() - t0;
      let raw = elapsed / flyMs;
      if (raw >= 1) raw = 1;
      const t = easeOut(raw);
      const u = 1 - t;
      const x = u * u * startX + 2 * u * t * ctrlX + t * t * endX;
      const bob = Math.sin(raw * Math.PI * 1.6) * (14 * (1 - raw * 0.35));
      const y = u * u * startY + 2 * u * t * ctrlY + t * t * endY + bob;
      const rot = -18 + 22 * t + Math.sin(raw * Math.PI) * 8;
      const scale = startScale + (finalScale - startScale) * t;
      const opacity = 0.78 + 0.22 * t;
      self.setData({
        reactionBeerMainPhase: 'fly',
        reactionBeerMainStyle: self._buildBeerCupStyle(x, y, rot, scale, opacity)
      });
      if (raw < 1) {
        self._beerArcTimer = setTimeout(tick, 16);
        return;
      }
      self._beerArcTimer = null;
      self.setData({
        reactionBeerMainStyle: self._buildBeerCupStyle(endX, endY, -4, finalScale, 1)
      });
    };
    tick();
  },

  /** Demo：🍺 Self — 第二杯：对向加速入场，近中心减速（到达 = 音频 peak） */
  _startBeerSelfSecondFlight(ctx) {
    const self = this;
    const c = ctx || this._beerTimelineCtx || {};
    const finalScale = c.finalScale != null ? c.finalScale : 1.75;
    const startScale = finalScale * 0.36;
    const startX = c.secondStartX;
    const startY = c.secondStartY;
    const endX = c.secondEndX != null ? c.secondEndX : c.cx + 38;
    const endY = c.secondEndY != null ? c.secondEndY : c.cy;
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const key = String(c.secondEntryKey || '');
    const sideSign =
      key.indexOf('left') >= 0 ? 1 : key.indexOf('right') >= 0 ? -1 : startX < endX ? 1 : -1;
    const ctrlX = midX + sideSign * (28 + Math.random() * 40);
    const ctrlY = midY - (20 + Math.random() * 36);
    const flyMs = c.secondFlyMs != null ? c.secondFlyMs : 520;
    const easeAccelDecel = function (t) {
      if (t < 0.55) {
        const u = t / 0.55;
        return 0.62 * (u * u);
      }
      const u = (t - 0.55) / 0.45;
      return 0.62 + 0.38 * (1 - Math.pow(1 - u, 2.8));
    };
    const t0 = Date.now();

    const tick = function () {
      if (!self._beerTimelineCtx || self._beerTimelineCtx.mode !== 'self') return;
      const elapsed = Date.now() - t0;
      let raw = elapsed / flyMs;
      if (raw >= 1) raw = 1;
      const t = easeAccelDecel(raw);
      const u = 1 - t;
      const x = u * u * startX + 2 * u * t * ctrlX + t * t * endX;
      const y = u * u * startY + 2 * u * t * ctrlY + t * t * endY;
      const rot = 18 - 24 * t + Math.sin(raw * Math.PI) * 7;
      const scale = startScale + (finalScale - startScale) * t;
      const opacity = 0.82 + 0.18 * t;
      self.setData({
        reactionBeerRightPhase: 'fly',
        reactionBeerRightStyle: self._buildBeerCupStyle(x, y, rot, scale, opacity)
      });
      if (raw < 1) {
        self._beerSelfSecondTimer = setTimeout(tick, 16);
        return;
      }
      self._beerSelfSecondTimer = null;
      self.setData({
        reactionBeerRightStyle: self._buildBeerCupStyle(endX, endY, 5, finalScale, 1)
      });
    };
    tick();
  },

  /** Demo：🍺 Observer — 主杯贝塞尔飞向头像中心 */
  _startBeerMainFlight(ctx) {
    const self = this;
    const c = ctx || this._beerTimelineCtx || {};
    const startX = c.startX;
    const startY = c.startY;
    const endX = c.cx;
    const endY = c.cy;
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const key = String(c.entryKey || '');
    const sideSign =
      key.indexOf('left') >= 0 ? 1 : key.indexOf('right') >= 0 ? -1 : startX < endX ? 1 : -1;
    const ctrlX = midX + sideSign * (34 + Math.random() * 48);
    const ctrlY = midY - (28 + Math.random() * 40);
    const flyMs = c.mainFlyMs != null ? c.mainFlyMs : 920;
    const easeIn = function (t) {
      return t * t * t;
    };
    const t0 = Date.now();

    const tick = function () {
      if (!self._beerTimelineCtx) return;
      const elapsed = Date.now() - t0;
      let raw = elapsed / flyMs;
      if (raw >= 1) raw = 1;
      const t = easeIn(raw);
      const u = 1 - t;
      const x = u * u * startX + 2 * u * t * ctrlX + t * t * endX;
      const bob = Math.sin(raw * Math.PI * 2) * (10 * (1 - raw * 0.4));
      const y = u * u * startY + 2 * u * t * ctrlY + t * t * endY + bob;
      const rot = -12 + 26 * t + Math.sin(raw * Math.PI) * 10;
      const scale = 0.32 + 0.73 * t;
      const opacity = 0.7 + 0.3 * t;
      self.setData({
        reactionBeerMainPhase: 'fly',
        reactionBeerMainStyle: self._buildBeerCupStyle(x, y, rot, scale, opacity)
      });
      if (raw < 1) {
        self._beerArcTimer = setTimeout(tick, 16);
        return;
      }
      self._beerArcTimer = null;
      self.setData({
        reactionBeerMainStyle: self._buildBeerCupStyle(endX, endY, 0, 1.05, 1)
      });
    };
    tick();
  },

  /** Demo：🍺 侧杯从头像左/右远处汇入中心（ease-out 减速） */
  _startBeerSideFlight(side, ctx) {
    const self = this;
    const c = ctx || this._beerTimelineCtx || {};
    const isLeft = side === 'left';
    const startX = isLeft ? c.sideLeftStartX : c.sideRightStartX;
    const startY = isLeft ? c.sideLeftStartY : c.sideRightStartY;
    const endX = c.cx + (isLeft ? -10 : 10);
    const endY = c.cy + 3;
    const ctrlX = (startX + endX) / 2 + (isLeft ? -12 : 12);
    const ctrlY = (startY + endY) / 2 - 22;
    const flyMs = c.sideFlyMs != null ? c.sideFlyMs : 520;
    const easeOut = function (t) {
      return 1 - Math.pow(1 - t, 2.6);
    };
    const t0 = Date.now();
    const timerKey = isLeft ? '_beerSideLeftTimer' : '_beerSideRightTimer';
    const phaseKey = isLeft ? 'reactionBeerLeftPhase' : 'reactionBeerRightPhase';
    const styleKey = isLeft ? 'reactionBeerLeftStyle' : 'reactionBeerRightStyle';

    const tick = function () {
      if (!self._beerTimelineCtx) return;
      const elapsed = Date.now() - t0;
      let raw = elapsed / flyMs;
      if (raw >= 1) raw = 1;
      const t = easeOut(raw);
      const u = 1 - t;
      const x = u * u * startX + 2 * u * t * ctrlX + t * t * endX;
      const y = u * u * startY + 2 * u * t * ctrlY + t * t * endY;
      const rot = (isLeft ? -18 : 18) * (1 - t * 0.55);
      const scale = 0.45 + 0.65 * t;
      const opacity = 0.8 + 0.2 * t;
      const patch = {};
      patch[phaseKey] = 'fly';
      patch[styleKey] = self._buildBeerCupStyle(x, y, rot, scale, opacity);
      self.setData(patch);
      if (raw < 1) {
        self[timerKey] = setTimeout(tick, 16);
        return;
      }
      self[timerKey] = null;
      const done = {};
      done[styleKey] = self._buildBeerCupStyle(endX, endY, isLeft ? -12 : 12, 1.1, 1);
      self.setData(done);
    };
    tick();
  },

  _clearPlayerActionBoxingTimers() {
    const list = this._playerActionBoxingTimers;
    if (list && list.length) {
      for (let i = 0; i < list.length; i++) {
        clearTimeout(list[i]);
      }
    }
    this._playerActionBoxingTimers = [];
  },

  _boxingTimeout(fn, ms) {
    const self = this;
    if (!this._playerActionBoxingTimers) this._playerActionBoxingTimers = [];
    const tid = setTimeout(function () {
      const arr = self._playerActionBoxingTimers || [];
      const idx = arr.indexOf(tid);
      if (idx >= 0) arr.splice(idx, 1);
      fn();
    }, ms);
    this._playerActionBoxingTimers.push(tid);
    return tid;
  },

  /** Demo：拳击壳层只负责位移（不承载变形，避免 transform 冲突） */
  _buildBoxingShellStyle(cx, cy, w, h, flyMs) {
    const transition =
      flyMs > 0
        ? 'left ' +
          flyMs +
          'ms cubic-bezier(0.22, 0.61, 0.36, 1),top ' +
          flyMs +
          'ms cubic-bezier(0.22, 0.61, 0.36, 1)'
        : 'none';
    return (
      'left:' +
      cx +
      'px;top:' +
      cy +
      'px;width:' +
      w +
      'px;height:' +
      h +
      'px;transform:translate(-50%,-50%);transition:' +
      transition +
      ';'
    );
  },

  /**
   * Demo：头像本体变形（scale/scaleX/Y/rotate/skew）— 罩在 mask+image 外，二者一起变
   * deform: { base, sx, sy, rot, skew, r1..r4, ry1..ry4 }
   */
  _buildBoxingBodyStyle(deform, transitionMs) {
    const d = deform || {};
    const base = d.base != null ? d.base : 1;
    const sx = d.sx != null ? d.sx : 1;
    const sy = d.sy != null ? d.sy : 1;
    const rot = d.rot != null ? d.rot : 0;
    const skew = d.skew != null ? d.skew : 0;
    const ms = transitionMs != null ? transitionMs : 0;
    const transition =
      ms > 0 ? 'transform ' + ms + 'ms cubic-bezier(0.2, 0.75, 0.3, 1)' : 'none';
    return (
      'transform:scale(' +
      base +
      ') scaleX(' +
      sx +
      ') scaleY(' +
      sy +
      ') rotate(' +
      rot +
      'deg) skewX(' +
      skew +
      'deg);transition:' +
      transition +
      ';'
    );
  },

  /** Demo：橡皮泥遮罩圆角（与 image 同层裁切，随累积态继承） */
  _buildBoxingMaskStyle(deform, transitionMs) {
    const d = deform || {};
    const r1 = d.r1 != null ? d.r1 : 50;
    const r2 = d.r2 != null ? d.r2 : 50;
    const r3 = d.r3 != null ? d.r3 : 50;
    const r4 = d.r4 != null ? d.r4 : 50;
    const ry1 = d.ry1 != null ? d.ry1 : 50;
    const ry2 = d.ry2 != null ? d.ry2 : 50;
    const ry3 = d.ry3 != null ? d.ry3 : 50;
    const ry4 = d.ry4 != null ? d.ry4 : 50;
    const ms = transitionMs != null ? transitionMs : 0;
    const transition = ms > 0 ? 'border-radius ' + ms + 'ms ease' : 'none';
    return (
      'border-radius:' +
      r1 +
      '% ' +
      r2 +
      '% ' +
      r3 +
      '% ' +
      r4 +
      '% / ' +
      ry1 +
      '% ' +
      ry2 +
      '% ' +
      ry3 +
      '% ' +
      ry4 +
      '%;transition:' +
      transition +
      ';'
    );
  },

  _applyBoxingDeformStyles(deform, transitionMs, extra) {
    const patch = {
      reactionBoxingBodyStyle: this._buildBoxingBodyStyle(deform, transitionMs),
      reactionBoxingMaskStyle: this._buildBoxingMaskStyle(deform, transitionMs)
    };
    if (extra && typeof extra === 'object') {
      const keys = Object.keys(extra);
      for (let i = 0; i < keys.length; i++) {
        patch[keys[i]] = extra[keys[i]];
      }
    }
    this.setData(patch);
  },

  _cloneBoxingDeform(src) {
    const d = src || {};
    return {
      base: d.base != null ? d.base : 1,
      sx: d.sx != null ? d.sx : 1,
      sy: d.sy != null ? d.sy : 1,
      rot: d.rot != null ? d.rot : 0,
      skew: d.skew != null ? d.skew : 0,
      r1: d.r1 != null ? d.r1 : 50,
      r2: d.r2 != null ? d.r2 : 50,
      r3: d.r3 != null ? d.r3 : 50,
      r4: d.r4 != null ? d.r4 : 50,
      ry1: d.ry1 != null ? d.ry1 : 50,
      ry2: d.ry2 != null ? d.ry2 : 50,
      ry3: d.ry3 != null ? d.ry3 : 50,
      ry4: d.ry4 != null ? d.ry4 : 50
    };
  },

  /**
   * Demo：每拳累积橡皮泥偏移（状态继承，不回正圆）
   * punchIndex 0-based：越往后挤扁/歪斜越强 → 约第6拳呈土豆形
   */
  _accumulateBoxingDeform(prev, side, finale, punchIndex) {
    const d = this._cloneBoxingDeform(prev);
    const fromLeft = side === 'left';
    const idx = punchIndex != null ? punchIndex : 0;
    const intensity = 0.7 + Math.min(1.4, idx * 0.18);
    if (finale) {
      d.sx = Math.max(0.52, d.sx * 0.8);
      d.sy = Math.min(1.58, d.sy * 1.2);
      d.rot += fromLeft ? -16 : 18;
      d.skew += fromLeft ? 9 : -11;
      d.r1 = Math.min(80, d.r1 + 12);
      d.r2 = Math.max(24, d.r2 - 10);
      d.r3 = Math.min(76, d.r3 + 10);
      d.r4 = Math.max(26, d.r4 - 8);
      d.ry1 = Math.max(28, d.ry1 - 8);
      d.ry2 = Math.min(78, d.ry2 + 12);
      d.ry3 = Math.max(30, d.ry3 - 10);
      d.ry4 = Math.min(74, d.ry4 + 10);
      return d;
    }
    if (fromLeft) {
      d.sx = Math.max(0.58, d.sx * (1 - 0.07 * intensity));
      d.sy = Math.min(1.48, d.sy * (1 + 0.06 * intensity));
      d.rot += (-5 - Math.random() * 4) * intensity;
      d.skew += (2.5 + Math.random() * 2.5) * intensity;
      d.r1 = Math.min(74, d.r1 + (3 + Math.random() * 3) * intensity);
      d.r2 = Math.max(28, d.r2 - (2.5 + Math.random() * 2.5) * intensity);
      d.r3 = Math.min(70, d.r3 + (2.5 + Math.random() * 2.5) * intensity);
      d.r4 = Math.max(30, d.r4 - (2 + Math.random() * 2) * intensity);
      d.ry1 = Math.max(32, d.ry1 - (2 + Math.random() * 2) * intensity);
      d.ry2 = Math.min(72, d.ry2 + (3 + Math.random() * 3) * intensity);
      d.ry3 = Math.max(34, d.ry3 - (2 + Math.random() * 2) * intensity);
      d.ry4 = Math.min(70, d.ry4 + (2 + Math.random() * 2.5) * intensity);
    } else {
      d.sx = Math.min(1.42, d.sx * (1 + 0.055 * intensity));
      d.sy = Math.max(0.58, d.sy * (1 - 0.07 * intensity));
      d.rot += (5 + Math.random() * 4) * intensity;
      d.skew += (-2.5 - Math.random() * 2.5) * intensity;
      d.r1 = Math.max(28, d.r1 - (2.5 + Math.random() * 2.5) * intensity);
      d.r2 = Math.min(74, d.r2 + (3 + Math.random() * 3) * intensity);
      d.r3 = Math.max(30, d.r3 - (2 + Math.random() * 2) * intensity);
      d.r4 = Math.min(72, d.r4 + (2.5 + Math.random() * 2.5) * intensity);
      d.ry1 = Math.min(72, d.ry1 + (2.5 + Math.random() * 2.5) * intensity);
      d.ry2 = Math.max(32, d.ry2 - (2 + Math.random() * 2) * intensity);
      d.ry3 = Math.min(70, d.ry3 + (2 + Math.random() * 2.5) * intensity);
      d.ry4 = Math.max(34, d.ry4 - (2 + Math.random() * 2) * intensity);
    }
    return d;
  },

  /** Demo：命中瞬间更夸张的冲击形（随后落到累积态，不恢复正圆） */
  _buildBoxingImpactDeform(settled, side, finale) {
    const d = this._cloneBoxingDeform(settled);
    const fromLeft = side === 'left';
    if (finale) {
      d.sx = Math.max(0.42, d.sx * 0.72);
      d.sy = Math.min(1.7, d.sy * 1.22);
      d.rot += fromLeft ? -10 : 12;
      d.skew += fromLeft ? 6 : -8;
      return d;
    }
    if (fromLeft) {
      d.sx = Math.max(0.48, d.sx * 0.78);
      d.sy = Math.min(1.55, d.sy * 1.16);
      d.rot -= 8;
      d.skew += 5;
    } else {
      d.sx = Math.min(1.5, d.sx * 1.14);
      d.sy = Math.max(0.5, d.sy * 0.78);
      d.rot += 8;
      d.skew -= 5;
    }
    return d;
  },

  _resetBoxingReactionVisuals(extra) {
    const patch = {
      reactionBoxingAvatarUrl: '',
      reactionBoxingShellStyle: '',
      reactionBoxingBodyStyle: '',
      reactionBoxingMaskStyle: '',
      reactionBoxingGloveLeftPhase: '',
      reactionBoxingGloveRightPhase: '',
      reactionBoxingImpactVisible: false,
      reactionBoxingImpactWord: '',
      reactionBoxingImpactSide: '',
      reactionBoxingShake: false,
      boxingFaceMode: 'normal',
      boxingSadFaceSrc: '/subpackages/reaction/assets/reaction/boxing_sad_face_blue.png',
      reactionBoxingSpiralEyes: false,
      reactionBoxingEyesSpinning: false,
      reactionBoxingDizzy: false,
      reactionBoxingDizzyStarCount: 3,
      reactionAvatarDetached: false,
      reactionAvatarDetachedPlayerId: '',
      reactionActiveMode: ''
    };
    if (extra && typeof extra === 'object') {
      const keys = Object.keys(extra);
      for (let i = 0; i < keys.length; i++) {
        patch[keys[i]] = extra[keys[i]];
      }
    }
    this.setData(patch);
  },

  /** Demo：恢复正圆（飞回落座后） */
  _buildBoxingCircleDeform(base) {
    return {
      base: base != null ? base : 1,
      sx: 1,
      sy: 1,
      rot: 0,
      skew: 0,
      r1: 50,
      r2: 50,
      r3: 50,
      r4: 50,
      ry1: 50,
      ry2: 50,
      ry3: 50,
      ry4: 50
    };
  },

  /**
   * Demo：👊 boxing Self —
   * 第一拳立即卡通脸 → 二三拳 → 金星⭐ → 再打几拳
   * → 最后一拳 @@ → 打回座位 → 落座@转2圈 → 恢复。
   */
  _playScreenBoxingReaction(rect, avatarUrl, playerId) {
    let winW = 375;
    let winH = 667;
    try {
      const info = (wx.getWindowInfo && wx.getWindowInfo()) || wx.getSystemInfoSync();
      winW = (info && (info.windowWidth || info.screenWidth)) || 375;
      winH = (info && (info.windowHeight || info.screenHeight)) || 667;
    } catch (err) {
      winW = 375;
      winH = 667;
    }

    const seat = this._normalizePlayerActionAvatarRect(rect) || this._fallbackPlayerActionAvatarRect();
    const seatCx = seat.left + seat.width / 2;
    const seatCy = seat.top + seat.height / 2;
    const seatW = seat.width;
    const seatH = seat.height;
    const centerCx = winW / 2;
    const centerCy = winH * 0.42;
    const centerScale = 4;
    const flyInMs = boxingReactionTimeline.FLY_IN_MS || 420;
    const flyBackMs = 620;
    const url = avatarUrl != null ? String(avatarUrl) : '';
    const dizzyStars = 3 + Math.floor(Math.random() * 3);
    const detachedId = playerId != null ? String(playerId).trim() : '';

    this._boxingDeform = this._buildBoxingCircleDeform(1);
    this._boxingTimelineCtx = {
      seatCx: seatCx,
      seatCy: seatCy,
      seatW: seatW,
      seatH: seatH,
      centerCx: centerCx,
      centerCy: centerCy,
      centerScale: centerScale,
      winW: winW,
      flyInMs: flyInMs,
      flyBackMs: flyBackMs
    };

    this._clearPlayerActionBoxingTimers();
    this.setData({
      playerActionSheetVisible: false,
      playerActionTarget: null,
      reactionTomatoFlyVisible: false,
      reactionTomatoSplashVisible: false,
      reactionTomatoJuiceActive: false,
      reactionTomatoDripActive: false,
      reactionFlowerFlyVisible: false,
      reactionFlowerItems: [],
      reactionFlowerPetals: [],
      reactionEggFlies: [],
      reactionEggHitLevel: 0,
      reactionEggBurstVisible: false,
      reactionEggFinaleActive: false,
      reactionScreenVisible: true,
      reactionScreenFading: false,
      reactionScreenMode: 'boxing',
      reactionAvatarDetached: !!detachedId,
      reactionAvatarDetachedPlayerId: detachedId,
      reactionActiveMode: detachedId ? 'self' : '',
      reactionBoxingAvatarUrl: url,
      reactionBoxingShellStyle: this._buildBoxingShellStyle(
        seatCx,
        seatCy,
        seatW,
        seatH,
        0
      ),
      reactionBoxingBodyStyle: this._buildBoxingBodyStyle(this._boxingDeform, 0),
      reactionBoxingMaskStyle: this._buildBoxingMaskStyle(this._boxingDeform, 0),
      reactionBoxingGloveLeftPhase: '',
      reactionBoxingGloveRightPhase: '',
      reactionBoxingImpactVisible: false,
      reactionBoxingImpactWord: '',
      reactionBoxingImpactSide: '',
      reactionBoxingShake: false,
      boxingFaceMode: 'normal',
      boxingSadFaceSrc: '/subpackages/reaction/assets/reaction/boxing_sad_face_blue.png',
      reactionBoxingSpiralEyes: false,
      reactionBoxingEyesSpinning: false,
      reactionBoxingDizzy: false,
      reactionBoxingDizzyStarCount: dizzyStars
    });

    const timeline = boxingReactionTimeline.buildBoxingReactionTimeline({
      chargeMs: 380,
      flyBackMs: flyBackMs,
      eyesSpinMs: boxingReactionTimeline.EYES_SPIN_2_MS || 1100,
      comboHitCount: 6,
      starsAfterHit: 3
    });
    this._runBoxingReactionTimeline(timeline);
  },

  /** Demo：按 boxing timeline 统一调度动画与 boxing.mp3 */
  _runBoxingReactionTimeline(timeline) {
    const self = this;
    const list = timeline || [];
    for (let i = 0; i < list.length; i++) {
      (function (ev) {
        self._boxingTimeout(function () {
          self._dispatchBoxingTimelineEvent(ev);
        }, ev.time);
      })(list[i]);
    }
  },

  _dispatchBoxingTimelineEvent(ev) {
    const e = ev || {};
    const action = e.action != null ? String(e.action) : '';
    const ctx = this._boxingTimelineCtx || {};
    if (action === 'boxing_enter' || action === 'fly_in') {
      const next = this._cloneBoxingDeform(this._boxingDeform);
      next.base = ctx.centerScale != null ? ctx.centerScale : 4;
      this._boxingDeform = next;
      this.setData({
        reactionBoxingSpiralEyes: false,
        reactionBoxingEyesSpinning: false,
        reactionBoxingDizzy: false,
        boxingFaceMode: 'normal',
        reactionBoxingShellStyle: this._buildBoxingShellStyle(
          ctx.centerCx,
          ctx.centerCy,
          ctx.seatW,
          ctx.seatH,
          ctx.flyInMs || 420
        )
      });
      this._applyBoxingDeformStyles(next, ctx.flyInMs || 420);
      return;
    }
    if (action === 'audio_start') {
      this._playReactionSound(e.sound || 'boxing', {
        volume: e.volume != null ? e.volume : 0.92,
        seekMs: e.seekMs != null ? e.seekMs : 0
      });
      return;
    }
    if (action === 'glove_enter') {
      this._boxingGloveEnter({
        side: e.side,
        finale: false
      });
      return;
    }
    // 连续拳 hit_1..hit_6（卡通脸；金星后仍可继续；全程无 @眼）
    if (
      action === 'hit' ||
      action === 'hit_1' ||
      action === 'hit_2' ||
      action === 'hit_3' ||
      action === 'hit_4' ||
      action === 'hit_5' ||
      action === 'hit_6'
    ) {
      this._boxingHitImpact({
        side: e.side,
        punchIndex: e.punchIndex,
        finale: false
      });
      // 连击震动；不出现 @眼；若已出金星则保持金星环
      this.setData({
        reactionBoxingShake: true,
        reactionBoxingSpiralEyes: false,
        reactionBoxingEyesSpinning: false,
        reactionBoxingDizzy: !!this.data.reactionBoxingDizzy
      });
      return;
    }
    if (
      action === 'show_boxing_face' ||
      action === 'boxing_sad_face_show'
    ) {
      // 第一拳命中瞬间：隐藏原头像副本，显示卡通脸（全程保持至最终晕眩）
      this.setData({
        boxingFaceMode: 'boxing_sad',
        boxingSadFaceSrc:
          '/subpackages/reaction/assets/reaction/boxing_sad_face_blue.png',
        reactionBoxingSpiralEyes: false,
        reactionBoxingEyesSpinning: false
      });
      return;
    }
    if (action === 'show_star_ring' || action === 'dizzy_start') {
      // 金星环：被打晕前兆；仍无 @眼，保持卡通表情
      this.setData({
        reactionBoxingDizzy: true,
        reactionBoxingSpiralEyes: false,
        reactionBoxingEyesSpinning: false,
        boxingFaceMode: 'boxing_sad',
        reactionBoxingGloveLeftPhase: '',
        reactionBoxingGloveRightPhase: '',
        reactionBoxingImpactVisible: false,
        reactionBoxingShake: false
      });
      this._applyBoxingDeformStyles(this._boxingDeform, 120);
      return;
    }
    if (action === 'finale_charge') {
      this.setData({
        reactionBoxingDizzy: true,
        reactionBoxingSpiralEyes: false,
        boxingFaceMode: 'boxing_sad',
        reactionBoxingGloveRightPhase: 'charge',
        reactionBoxingGloveLeftPhase: ''
      });
      this._applyBoxingDeformStyles(this._boxingDeform, 80);
      return;
    }
    if (action === 'finale_glove') {
      this._boxingGloveEnter({
        side: 'right',
        finale: true,
        keepDizzy: true
      });
      return;
    }
    if (action === 'final_hit' || action === 'finale_hit') {
      try {
        reactionSounds.stopReactionSound('boxing');
      } catch (err) {
        /* ignore */
      }
      if (e.sound) {
        this._playReactionSound(e.sound, {
          volume: e.volume != null ? e.volume : 1,
          seekMs: e.seekMs != null ? e.seekMs : 0
        });
      }
      this._boxingHitImpact({
        side: 'right',
        punchIndex: 99,
        finale: true
      });
      return;
    }
    if (
      action === 'show_at_eye' ||
      action === 'spiral_eyes_show'
    ) {
      // 最后一拳后：真正晕眩 boxing_dizzy_face + @@
      this.setData({
        boxingFaceMode: 'boxing_dizzy',
        boxingSadFaceSrc:
          '/subpackages/reaction/assets/reaction/boxing_sad_face_blue.png',
        reactionBoxingSpiralEyes: true,
        reactionBoxingEyesSpinning: false,
        reactionBoxingDizzy: false,
        reactionBoxingShake: false
      });
      return;
    }
    if (action === 'return_to_seat' || action === 'fly_back_start') {
      const potato = this._cloneBoxingDeform(this._boxingDeform);
      potato.base = Math.max(1.35, potato.base * 0.55);
      potato.rot += 140;
      this._boxingDeform = potato;
      this.setData({
        boxingFaceMode: 'boxing_dizzy',
        reactionBoxingSpiralEyes: true,
        reactionBoxingEyesSpinning: false,
        reactionBoxingDizzy: false,
        reactionBoxingGloveLeftPhase: '',
        reactionBoxingGloveRightPhase: '',
        reactionBoxingImpactVisible: false,
        reactionBoxingImpactWord: '',
        reactionBoxingImpactSide: '',
        reactionBoxingShake: false,
        reactionBoxingShellStyle: this._buildBoxingShellStyle(
          Math.max(24, ctx.centerCx - (ctx.winW || 375) * 0.22),
          ctx.centerCy - 12,
          ctx.seatW,
          ctx.seatH,
          140
        )
      });
      this._applyBoxingDeformStyles(potato, 160);
      return;
    }
    if (action === 'fly_back_seat') {
      const mid = this._cloneBoxingDeform(this._boxingDeform);
      mid.base = 1.05;
      mid.rot += 80;
      this._boxingDeform = mid;
      this.setData({
        boxingFaceMode: 'boxing_dizzy',
        reactionBoxingSpiralEyes: true,
        reactionBoxingShellStyle: this._buildBoxingShellStyle(
          ctx.seatCx,
          ctx.seatCy,
          ctx.seatW,
          ctx.seatH,
          (ctx.flyBackMs || 620) - 140
        )
      });
      this._applyBoxingDeformStyles(mid, (ctx.flyBackMs || 620) - 140);
      return;
    }
    if (
      action === 'land_dizzy_rotate' ||
      action === 'land_dizzy' ||
      action === 'eyes_spin_2'
    ) {
      const spinMs = e.duration != null ? e.duration : 1100;
      const circle = this._buildBoxingCircleDeform(1);
      this._boxingDeform = circle;
      // 落座：保持晕眩脸+@眼转 2 圈；轻微晃动（无金星）
      this._applyBoxingDeformStyles(circle, 220, {
        boxingFaceMode: 'boxing_dizzy',
        reactionBoxingSpiralEyes: true,
        reactionBoxingEyesSpinning: true,
        reactionBoxingDizzy: false,
        reactionBoxingShake: false,
        reactionAvatarDetached: false,
        reactionAvatarDetachedPlayerId: '',
        reactionActiveMode: ''
      });
      this.setData({
        boxingFaceMode: 'boxing_dizzy',
        reactionBoxingSpiralEyes: true,
        reactionBoxingEyesSpinning: true,
        reactionBoxingDizzy: false
      });
      const self = this;
      this._boxingTimeout(function () {
        if (!self._boxingTimelineCtx) return;
        self.setData({ reactionBoxingEyesSpinning: false });
      }, spinMs);
      return;
    }
    if (
      action === 'restore' ||
      action === 'boxing_face_restore'
    ) {
      this.setData({
        boxingFaceMode: 'restore',
        reactionBoxingSpiralEyes: false,
        reactionBoxingEyesSpinning: false,
        reactionBoxingDizzy: false,
        reactionBoxingShake: false
      });
      const self = this;
      this._boxingTimeout(function () {
        self.setData({ boxingFaceMode: 'normal' });
      }, 40);
      return;
    }
    if (action === 'fade_out') {
      this.setData({ reactionScreenFading: true });
      return;
    }
    if (action === 'cleanup') {
      try {
        reactionSounds.stopReactionSound('boxing');
        reactionSounds.stopReactionSound('boxing_hit_first');
      } catch (err) {
        /* ignore */
      }
      this._resetBoxingReactionVisuals({
        reactionScreenVisible: false,
        reactionScreenFading: false,
        reactionScreenMode: ''
      });
      this._boxingDeform = null;
      this._boxingTimelineCtx = null;
      this._playerActionBoxingBusy = false;
    }
  },

  /** Demo：拳套冲入（命中前 GLOVE_LEAD；声音由 timeline 对齐峰值） */
  _boxingGloveEnter(opts) {
    const o = opts || {};
    const finale = !!o.finale;
    const keepDizzy = !!o.keepDizzy;
    const side = o.side === 'left' ? 'left' : 'right';
    const patch = {
      reactionBoxingImpactVisible: false
    };
    if (finale) {
      patch.reactionBoxingGloveRightPhase = '';
      patch.reactionBoxingGloveLeftPhase = '';
    } else {
      patch.reactionBoxingGloveLeftPhase = '';
      patch.reactionBoxingGloveRightPhase = '';
    }
    this.setData(patch);
    const self = this;
    this._boxingTimeout(function () {
      if (finale) {
        const strikePatch = {
          reactionBoxingGloveRightPhase: 'strike',
          reactionBoxingGloveLeftPhase: '',
          boxingFaceMode: 'boxing_sad',
          // 终结拳命中前仍无 @眼；show_at_eye 再切换
          reactionBoxingSpiralEyes: false
        };
        if (!keepDizzy) {
          strikePatch.reactionBoxingDizzy = false;
        }
        self.setData(strikePatch);
        return;
      }
      if (side === 'left') {
        self.setData({
          reactionBoxingGloveLeftPhase: 'punch',
          reactionBoxingGloveRightPhase: ''
        });
      } else {
        self.setData({
          reactionBoxingGloveRightPhase: 'punch',
          reactionBoxingGloveLeftPhase: ''
        });
      }
    }, 16);
  },

  /** Demo：命中瞬间 — 变形 + 震动 + 冲击字（与 boxing 峰值同步） */
  _boxingHitImpact(opts) {
    const o = opts || {};
    const finale = !!o.finale;
    const side = o.side === 'left' ? 'left' : 'right';
    const punchIndex = o.punchIndex != null ? o.punchIndex : 0;
    const words = finale
      ? ['BOOM!', '嘭！！', 'KO!']
      : ['砰!', '嘭!', 'BAM!', '啪!', '咚!'];
    const word = words[Math.floor(Math.random() * words.length)];
    const settled = this._accumulateBoxingDeform(
      this._boxingDeform,
      side,
      finale,
      punchIndex
    );
    const impact = this._buildBoxingImpactDeform(settled, side, finale);
    this._boxingDeform = settled;
    // 金星阶段继续连击时保持星环；终结拳由后续 show_at_eye 接管
    const keepStarRing = !finale && !!this.data.reactionBoxingDizzy;
    this.setData({
      reactionBoxingImpactVisible: true,
      reactionBoxingImpactWord: word,
      reactionBoxingImpactSide: finale ? 'finale' : side,
      reactionBoxingShake: true,
      reactionBoxingDizzy: keepStarRing
    });
    this._applyBoxingDeformStyles(impact, finale ? 60 : 70);
    const self = this;
    this._boxingTimeout(function () {
      self._applyBoxingDeformStyles(settled, finale ? 140 : 160, {
        reactionBoxingShake: false
      });
    }, finale ? 120 : 110);
    this._boxingTimeout(function () {
      // 仅收冲击层；拳套由下一拍 glove_enter / finale 流程接管（避免快节奏互清）
      self.setData({ reactionBoxingImpactVisible: false });
    }, finale ? 280 : 200);
  },

  /** Demo：互动动画目标头像定位（记分 #fb-player-avatar → 讨论区缓存/节点 → 屏中回退） */
  _normalizePlayerActionAvatarRect(rect) {
    if (!rect || typeof rect !== 'object') return null;
    const left = Number(rect.left);
    const top = Number(rect.top);
    const width = Number(rect.width);
    const height = Number(rect.height);
    if (
      !Number.isFinite(left) ||
      !Number.isFinite(top) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return null;
    }
    return { left: left, top: top, width: width, height: height };
  },

  _fallbackPlayerActionAvatarRect() {
    let winW = 375;
    let winH = 667;
    try {
      const info = (wx.getWindowInfo && wx.getWindowInfo()) || wx.getSystemInfoSync();
      winW = (info && (info.windowWidth || info.screenWidth)) || 375;
      winH = (info && (info.windowHeight || info.screenHeight)) || 667;
    } catch (err) {
      winW = 375;
      winH = 667;
    }
    const size = 40;
    return {
      left: (winW - size) / 2,
      top: winH * 0.36,
      width: size,
      height: size
    };
  },

  _queryPlayerActionAvatarRect(playerId, done) {
    const cb = typeof done === 'function' ? done : function () {};
    const host = this._reactionHost || {};
    if (typeof host.queryAvatarRect === 'function') {
      host.queryAvatarRect(playerId, cb);
      return;
    }
    const target = this.data.playerActionTarget || this._reactionTarget || {};
    const cached = target.avatarRect;
    if (cached && cached.width > 0 && cached.height > 0) {
      cb({
        left: Number(cached.left) || 0,
        top: Number(cached.top) || 0,
        width: Number(cached.width) || 0,
        height: Number(cached.height) || 0
      });
      return;
    }
    cb(this._fallbackPlayerActionAvatarRect());
  },

  /**
   * Demo：🍅 → 按目标分流第一视角撞屏 / 第三方飞向头像。
   * 纯视觉：无写盘。
   */
  onPlayerActionTomatoTap() {
    if (this._playerActionTomatoBusy) return;
    if (!scoreReactionController.canPlayReaction(this._hostGameId(), 'tomato', this._getScoreReactionCtx())) {
      return;
    }
    const target = this.data.playerActionTarget;
    const playerId =
      target && (target.playerId || target.userId) != null
        ? String(target.playerId || target.userId).trim()
        : '';
    if (!playerId) {
      scoreDebugLog('[player-action-tomato] missing playerId');
      return;
    }
    this._playerActionTomatoBusy = true;
    // reaction-view-model-v2：西红柿统一目标头像中央舞台
    this._playSelfReaction('tomato', {
      playerId: playerId,
      target: target,
      avatarUrl:
        (target && (target.avatar || target.avatarUrl || target.headimgurl)) ||
        ''
    });
  },

  /**
   * Demo：🍅 SELF 入口 — 克隆头像到 reaction-screen-layer，放大至拳击 Self 尺寸，
   * 边缘飞入砸中中央头像 + cartoon tomato face（不改真实头像 / 不走 Observer）。
   */
  _playSelfTomatoReaction(rect, avatarUrl, playerId) {
    const hitPlayerId = playerId != null ? String(playerId).trim() : '';
    const norm =
      this._normalizePlayerActionAvatarRect(rect) ||
      this._fallbackPlayerActionAvatarRect() ||
      rect;
    const left = Number(norm.left);
    const top = Number(norm.top);
    const width = Number(norm.width);
    const height = Number(norm.height);
    if (
      !Number.isFinite(left) ||
      !Number.isFinite(top) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      this._playerActionTomatoBusy = false;
      return;
    }

    const selfTiming =
      tomatoReactionTimeline.TOMATO_SELF_TIMING ||
      tomatoReactionTimeline.TOMATO_TIMING.self ||
      {};
    const centerScale =
      selfTiming.centerScale != null ? selfTiming.centerScale : 4;
    const win = this._getReactionWindowSize();
    const seatX = left + width / 2;
    const seatY = top + height / 2;
    const centerX = win.winW / 2;
    const centerY = win.winH * 0.42;
    const centerW = width * centerScale;
    const centerH = height * centerScale;
    const origin = this._getRandomSelfReactionEntryPoint(win.winW, win.winH);
    const startX = origin.x;
    const startY = origin.y;
    const midX = (startX + centerX) / 2;
    const midY = (startY + centerY) / 2;
    const sideSign = String(origin.key || '').indexOf('left') >= 0 ? 1 : -1;
    const ctrlX = midX + sideSign * (40 + Math.random() * 56);
    const ctrlY =
      String(origin.key || '').indexOf('top') >= 0
        ? midY - (36 + Math.random() * 48)
        : String(origin.key || '').indexOf('bottom') >= 0
          ? midY + (36 + Math.random() * 48)
          : midY - sideSign * (28 + Math.random() * 40);
    const flyMs = selfTiming.flyMs != null ? selfTiming.flyMs : 900;
    const toCenterMs =
      selfTiming.toCenterMs != null ? selfTiming.toCenterMs : 420;
    const returnMs = selfTiming.returnMs != null ? selfTiming.returnMs : 720;
    const returnSpin = Math.random() > 0.5 ? 360 : -360;
    const url = avatarUrl != null ? String(avatarUrl) : '';
    const startOpacity = 0.55 + Math.random() * 0.2;

    this._clearPlayerActionTomatoTimers();
    this._tomatoTimelineCtx = {
      mode: 'self',
      seatX: seatX,
      seatY: seatY,
      cx: centerX,
      cy: centerY,
      left: left,
      top: top,
      width: width,
      height: height,
      centerW: centerW,
      centerH: centerH,
      centerScale: centerScale,
      startX: startX,
      startY: startY,
      ctrlX: ctrlX,
      ctrlY: ctrlY,
      flyMs: flyMs,
      toCenterMs: toCenterMs,
      returnMs: returnMs,
      returnSpin: returnSpin,
      startOpacity: startOpacity,
      entryKey: origin.key || '',
      playerId: hitPlayerId,
      avatarUrl: url
    };

    this.setData({
      playerActionSheetVisible: false,
      playerActionTarget: null,
      playerActionTomatoVisible: false,
      playerActionTomatoAnimating: false,
      playerActionTomatoStyle: '',
      playerActionBurstVisible: false,
      playerActionBurstStyle: '',
      playerActionJuiceVisible: false,
      playerActionJuiceStyle: '',
      playerActionHitPlayerId: '',
      reactionScreenVisible: true,
      reactionScreenFading: false,
      reactionScreenMode: 'tomato',
      reactionTomatoAnchorMode: 'self',
      reactionTomatoFlyVisible: false,
      reactionTomatoFlyStyle: '',
      reactionTomatoSplashVisible: false,
      reactionTomatoImpactPhase: '',
      reactionTomatoJuiceActive: false,
      reactionTomatoDripActive: false,
      reactionTomatoJuiceFading: false,
      reactionTomatoJuiceStyle: '',
      reactionTomatoHitStyle:
        'left:' +
        centerX +
        'px;top:' +
        centerY +
        'px;transform:translate(-50%,-50%) scale(1);',
      reactionTomatoSelfAvatarVisible: true,
      reactionTomatoSelfAvatarUrl: url,
      reactionTomatoSelfAvatarPhase: 'seat',
      reactionTomatoSelfShake: false,
      reactionTomatoSelfFaceVisible: false,
      reactionTomatoSelfDripHold: false,
      reactionTomatoSelfAvatarStyle: this._buildTomatoSelfAvatarStyle({
        x: seatX,
        y: seatY,
        w: width,
        h: height,
        rot: 0,
        ms: 0
      }),
      reactionAvatarDetached: !!hitPlayerId,
      reactionAvatarDetachedPlayerId: hitPlayerId,
      reactionActiveMode: hitPlayerId ? 'self' : '',
      reactionFlowerFlyVisible: false,
      reactionFlowerFlyStyle: '',
      reactionFlowerItems: [],
      reactionFlowerPetals: []
    });

    const timeline =
      tomatoReactionTimeline.buildTomatoSelfReactionTimeline
        ? tomatoReactionTimeline.buildTomatoSelfReactionTimeline()
        : tomatoReactionTimeline.buildTomatoReactionTimeline('self');
    this._runTomatoSelfReactionTimeline(timeline);
  },

  /** 兼容旧调用名 → Self */
  _playScreenTomatoReaction() {
    const target = this.data.playerActionTarget || {};
    const playerId = String(target.playerId || target.userId || '').trim();
    const avatarUrl =
      target.avatar || target.avatarUrl || target.headimgurl || '';
    const self = this;
    if (!playerId) {
      this._playerActionTomatoBusy = false;
      return;
    }
    this._queryPlayerActionAvatarRect(playerId, function (rect) {
      if (!rect) {
        self._playerActionTomatoBusy = false;
        return;
      }
      self._playSelfTomatoReaction(rect, avatarUrl, playerId);
    });
  },

  _buildTomatoSelfAvatarStyle(opts) {
    const o = opts || {};
    const x = o.x != null ? o.x : 0;
    const y = o.y != null ? o.y : 0;
    const w = o.w != null ? o.w : 44;
    const h = o.h != null ? o.h : 44;
    const rot = o.rot != null ? o.rot : 0;
    const ms = o.ms != null ? Number(o.ms) : 0;
    const ease = o.ease || 'cubic-bezier(0.22, 0.7, 0.28, 1)';
    const transition =
      ms > 0
        ? 'left ' +
          ms +
          'ms ' +
          ease +
          ',top ' +
          ms +
          'ms ' +
          ease +
          ',width ' +
          ms +
          'ms ' +
          ease +
          ',height ' +
          ms +
          'ms ' +
          ease +
          ',transform ' +
          ms +
          'ms ' +
          ease
        : 'none';
    return (
      'left:' +
      x +
      'px;top:' +
      y +
      'px;width:' +
      w +
      'px;height:' +
      h +
      'px;transform:translate(-50%,-50%) rotate(' +
      rot +
      'deg);transition:' +
      transition +
      ';'
    );
  },

  _tomatoSelfTimeout(fn, ms) {
    const self = this;
    if (!this._tomatoTimelineTimers) this._tomatoTimelineTimers = [];
    const id = setTimeout(function () {
      const list = self._tomatoTimelineTimers || [];
      const idx = list.indexOf(id);
      if (idx >= 0) list.splice(idx, 1);
      try {
        fn();
      } catch (err) {
        scoreDebugLog('[tomato-self-timeline] handler error', err);
      }
    }, ms);
    this._tomatoTimelineTimers.push(id);
    return id;
  },

  _runTomatoSelfReactionTimeline(timeline) {
    const self = this;
    const list = timeline || [];
    for (let i = 0; i < list.length; i++) {
      (function (ev) {
        self._tomatoSelfTimeout(function () {
          self._dispatchTomatoTimelineEvent(ev);
        }, ev.time);
      })(list[i]);
    }
  },

  _buildTomatoFlyStyle(x, y, rot, scale, opacity) {
    return (
      'left:' +
      x +
      'px;top:' +
      y +
      'px;opacity:' +
      opacity +
      ';transform:translate(-50%,-50%) rotate(' +
      rot +
      'deg) scale(' +
      scale +
      ');transition:none;'
    );
  },

  /** Demo：🍅 Self 西红柿加速飞向中央头像（由小变大 + 旋转） */
  _startTomatoSelfFlight(ctx) {
    const page = this;
    const c = ctx || this._tomatoTimelineCtx || {};
    const flyMs = c.flyMs != null ? c.flyMs : 900;
    const startX = c.startX;
    const startY = c.startY;
    const endX = c.cx;
    const endY = c.cy;
    const ctrlX = c.ctrlX;
    const ctrlY = c.ctrlY;
    const startOpacity = c.startOpacity != null ? c.startOpacity : 0.6;
    const easeIn = function (t) {
      return t * t * t;
    };
    const scaleAt = function (t) {
      if (t <= 0.5) return 0.28 + 0.72 * (t / 0.5);
      return 1 + 1.15 * ((t - 0.5) / 0.5);
    };

    if (this._playerActionTomatoArcTimer) {
      clearTimeout(this._playerActionTomatoArcTimer);
      this._playerActionTomatoArcTimer = null;
    }

    this.setData({
      reactionTomatoFlyVisible: true,
      reactionTomatoFlyStyle: this._buildTomatoFlyStyle(
        startX,
        startY,
        -24,
        0.28,
        startOpacity
      )
    });

    const t0 = Date.now();
    const tick = function () {
      if (!page._tomatoTimelineCtx || page._tomatoTimelineCtx.mode !== 'self') {
        return;
      }
      const elapsed = Date.now() - t0;
      let raw = elapsed / flyMs;
      if (raw >= 1) raw = 1;
      const t = easeIn(raw);
      const u = 1 - t;
      const x = u * u * startX + 2 * u * t * ctrlX + t * t * endX;
      const y = u * u * startY + 2 * u * t * ctrlY + t * t * endY;
      page.setData({
        reactionTomatoFlyStyle: page._buildTomatoFlyStyle(
          x,
          y,
          -24 + 780 * t,
          scaleAt(t),
          startOpacity + (1 - startOpacity) * t
        )
      });
      if (raw < 1) {
        page._playerActionTomatoArcTimer = setTimeout(tick, 16);
        return;
      }
      page._playerActionTomatoArcTimer = null;
    };
    tick();
  },

  _resetTomatoSelfVisuals(extra) {
    const patch = {
      reactionTomatoFlyVisible: false,
      reactionTomatoFlyStyle: '',
      reactionTomatoSplashVisible: false,
      reactionTomatoImpactPhase: '',
      reactionTomatoJuiceActive: false,
      reactionTomatoDripActive: false,
      reactionTomatoJuiceFading: false,
      reactionTomatoJuiceStyle: '',
      reactionTomatoHitStyle: '',
      reactionTomatoAnchorMode: '',
      reactionTomatoSelfAvatarVisible: false,
      reactionTomatoSelfAvatarUrl: '',
      reactionTomatoSelfAvatarStyle: '',
      reactionTomatoSelfAvatarPhase: '',
      reactionTomatoSelfShake: false,
      reactionTomatoSelfFaceVisible: false,
      reactionTomatoSelfDripHold: false,
      playerActionHitPlayerId: ''
    };
    if (extra && typeof extra === 'object') {
      const keys = Object.keys(extra);
      for (let i = 0; i < keys.length; i++) {
        patch[keys[i]] = extra[keys[i]];
      }
    }
    this.setData(patch);
  },

  /**
   * Demo：🍅 tomato timeline 调度。
   * Self：目标头像中央舞台视觉节点（reaction-view-model-v2）。
   */
  _dispatchTomatoTimelineEvent(ev) {
    const e = ev || {};
    const action = e.action != null ? String(e.action) : '';
    const ctx = this._tomatoTimelineCtx || {};
    const isSelf = ctx.mode === 'self';
    const page = this;

    // —— Self-only（tomatoSelfReactionTimeline）——
    if (action === 'self_avatar_center') {
      if (!isSelf) return;
      const ms = e.duration != null ? e.duration : ctx.toCenterMs || 420;
      this.setData({
        reactionAvatarDetached: true,
        reactionAvatarDetachedPlayerId: ctx.playerId || '',
        reactionActiveMode: 'self',
        reactionTomatoSelfAvatarVisible: true,
        reactionTomatoSelfAvatarPhase: 'seat',
        reactionTomatoSelfFaceVisible: false,
        reactionTomatoSelfShake: false,
        reactionTomatoSelfDripHold: false,
        reactionTomatoSelfAvatarStyle: this._buildTomatoSelfAvatarStyle({
          x: ctx.seatX,
          y: ctx.seatY,
          w: ctx.width,
          h: ctx.height,
          rot: 0,
          ms: 0
        })
      });
      this._tomatoSelfTimeout(function () {
        if (!page._tomatoTimelineCtx || page._tomatoTimelineCtx.mode !== 'self') {
          return;
        }
        page.setData({
          reactionTomatoSelfAvatarPhase: 'center',
          reactionTomatoSelfAvatarStyle: page._buildTomatoSelfAvatarStyle({
            x: ctx.cx,
            y: ctx.cy,
            w: ctx.centerW || ctx.width * 4,
            h: ctx.centerH || ctx.height * 4,
            rot: 0,
            ms: ms
          })
        });
      }, 24);
      return;
    }

    if (action === 'tomato_self_fly') {
      if (!isSelf) return;
      this._startTomatoSelfFlight(ctx);
      return;
    }

    if (action === 'tomato_self_hit' || (action === 'tomato_hit' && isSelf)) {
      if (!isSelf && action === 'tomato_self_hit') return;
      if (this._playerActionTomatoArcTimer) {
        clearTimeout(this._playerActionTomatoArcTimer);
        this._playerActionTomatoArcTimer = null;
      }
      if (e.sound || action === 'tomato_self_hit') {
        this._playReactionSound(e.sound || 'tomato_hit', {
          volume: e.volume != null ? e.volume : 0.95,
          seekMs: e.seekMs != null ? e.seekMs : 0
        });
      }
      if (!isSelf) return;
      this.setData({
        reactionTomatoFlyVisible: false,
        reactionTomatoFlyStyle: '',
        reactionTomatoSplashVisible: true,
        reactionTomatoImpactPhase: 'impact',
        reactionTomatoSelfAvatarPhase: 'hit',
        reactionTomatoSelfShake: true,
        reactionTomatoHitStyle:
          'left:' +
          ctx.cx +
          'px;top:' +
          ctx.cy +
          'px;transform:translate(-50%,-50%) scale(1);'
      });
      this._tomatoSelfTimeout(function () {
        if (!page._tomatoTimelineCtx || page._tomatoTimelineCtx.mode !== 'self') {
          return;
        }
        page.setData({ reactionTomatoSelfShake: false });
      }, 420);
      return;
    }

    if (action === 'tomato_splash') {
      if (!isSelf) return;
      this.setData({
        reactionTomatoImpactPhase: 'burst',
        reactionTomatoSplashVisible: true
      });
      return;
    }

    if (action === 'tomato_face_overlay') {
      if (!isSelf) return;
      this.setData({
        reactionTomatoImpactPhase: 'flow',
        reactionTomatoSelfFaceVisible: true,
        reactionTomatoSelfDripHold: false,
        reactionTomatoSelfAvatarPhase: 'hit'
      });
      return;
    }

    if (action === 'tomato_drip_hold') {
      if (!isSelf) return;
      this.setData({
        reactionTomatoSelfDripHold: true,
        reactionTomatoSelfFaceVisible: true,
        reactionTomatoSelfShake: true,
        reactionTomatoSplashVisible: false,
        reactionTomatoImpactPhase: 'flow',
        reactionTomatoSelfAvatarPhase: 'hold'
      });
      this._tomatoSelfTimeout(function () {
        if (!page._tomatoTimelineCtx || page._tomatoTimelineCtx.mode !== 'self') {
          return;
        }
        // 停留期轻微晃动：间歇开关
        page.setData({ reactionTomatoSelfShake: false });
      }, 380);
      this._tomatoSelfTimeout(function () {
        if (!page._tomatoTimelineCtx || page._tomatoTimelineCtx.mode !== 'self') {
          return;
        }
        page.setData({ reactionTomatoSelfShake: true });
      }, 900);
      this._tomatoSelfTimeout(function () {
        if (!page._tomatoTimelineCtx || page._tomatoTimelineCtx.mode !== 'self') {
          return;
        }
        page.setData({ reactionTomatoSelfShake: false });
      }, 1280);
      return;
    }

    if (action === 'avatar_return') {
      if (!isSelf) return;
      const ms = e.duration != null ? e.duration : ctx.returnMs || 720;
      const spin = ctx.returnSpin != null ? ctx.returnSpin : 360;
      this.setData({
        reactionTomatoSelfAvatarPhase: 'return',
        reactionTomatoSelfFaceVisible: true,
        reactionTomatoSelfDripHold: true,
        reactionTomatoSelfShake: false,
        reactionTomatoSplashVisible: false,
        reactionTomatoFlyVisible: false,
        reactionTomatoSelfAvatarStyle: this._buildTomatoSelfAvatarStyle({
          x: ctx.seatX,
          y: ctx.seatY,
          w: ctx.width,
          h: ctx.height,
          rot: spin,
          ms: ms,
          ease: 'cubic-bezier(0.28, 0.65, 0.32, 1)'
        })
      });
      return;
    }

    if (action === 'restore' || (action === 'cleanup' && isSelf)) {
      if (!isSelf && action === 'restore') return;
      try {
        reactionSounds.stopReactionSound('tomato_hit');
      } catch (err) {
        /* ignore */
      }
      this._resetTomatoSelfVisuals({
        reactionScreenVisible: false,
        reactionScreenFading: false,
        reactionScreenMode: '',
        reactionAvatarDetached: false,
        reactionAvatarDetachedPlayerId: '',
        reactionActiveMode: ''
      });
      this._tomatoTimelineCtx = null;
      this._playerActionTomatoBusy = false;
      return;
    }

  },

  /** Demo：清理🍅 / 撞屏 reaction 延时器 */
  _clearPlayerActionTomatoTimers() {
    const keys = [
      '_playerActionTomatoFlyTimer',
      '_playerActionTomatoArcTimer',
      '_playerActionTomatoClearTimer',
      '_playerActionTomatoHitTimer',
      '_playerActionTomatoBurstTimer',
      '_playerActionTomatoShakeTimer',
      '_playerActionTomatoJuiceTimer',
      '_playerActionTomatoFadeTimer'
    ];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (this[k]) {
        clearTimeout(this[k]);
        this[k] = null;
      }
    }
    const tl = this._tomatoTimelineTimers;
    if (tl && tl.length) {
      for (let j = 0; j < tl.length; j++) {
        clearTimeout(tl[j]);
      }
    }
    this._tomatoTimelineTimers = [];
    try {
      reactionSounds.stopReactionSound('tomato_hit');
    } catch (err) {
      /* ignore */
    }
  },

  /** 旧：头像命中番茄（转第一视角） */
  _playPlayerActionTomatoFly() {
    this._playScreenTomatoReaction();
  },
  _playPlayerActionTomatoHit() {
    /* deprecated: screen reaction */
  },

  /**
   * Demo：🪣 → 目标头像中央舞台（所有人同效果）。
   */
  onPlayerActionBucketTap() {
    if (this._playerActionBucketBusy) return;
    if (!scoreReactionController.canPlayReaction(this._hostGameId(), 'bucket', this._getScoreReactionCtx())) {
      return;
    }
    const target = this.data.playerActionTarget;
    const playerId =
      target && (target.playerId || target.userId) != null
        ? String(target.playerId || target.userId).trim()
        : '';
    if (!playerId) {
      scoreDebugLog('[player-action-bucket] missing playerId');
      return;
    }
    this._playerActionBucketBusy = true;
    this._playSelfReaction('bucket', {
      playerId: playerId,
      target: target,
      avatarUrl:
        (target && (target.avatar || target.avatarUrl || target.headimgurl)) ||
        ''
    });
  },

  /**
   * Demo：🪣 SELF 入口 — 克隆头像到 reaction-screen-layer，放大至拳击 Self 尺寸，
   * 桶在头像正上方倾斜，水流从桶口浇下（不改真实头像 / 不走 Observer 路径）。
   */
  _playSelfBucketScreenReaction(rect, avatarUrl, playerId) {
    const hitPlayerId = playerId != null ? String(playerId).trim() : '';
    const norm =
      this._normalizePlayerActionAvatarRect(rect) ||
      this._fallbackPlayerActionAvatarRect() ||
      rect;
    const left = Number(norm.left);
    const top = Number(norm.top);
    const width = Number(norm.width);
    const height = Number(norm.height);
    if (
      !Number.isFinite(left) ||
      !Number.isFinite(top) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      this._playerActionBucketBusy = false;
      return;
    }

    const selfTiming = bucketReactionTimeline.SELF_TIMING || {};
    const centerScale =
      selfTiming.centerScale != null ? selfTiming.centerScale : 4;
    const bucketScale =
      selfTiming.bucketScale != null ? selfTiming.bucketScale : 1.75;
    const win = this._getReactionWindowSize();
    const seatX = left + width / 2;
    const seatY = top + height / 2;
    const centerX = win.winW / 2;
    const centerY = win.winH * 0.42;
    const centerW = width * centerScale;
    const centerH = height * centerScale;
    const bucketBase = 40;
    const bucketSize = Math.round(bucketBase * bucketScale);
    // 桶口正对头像顶部：avatarCx + (avatarTop - bucketHeight/2)
    const avatarTop = centerY - centerH / 2;
    const hoverX = centerX;
    const hoverY = avatarTop - bucketSize / 2;
    const enterX = centerX;
    const enterY = hoverY - Math.round(bucketSize * 0.55);
    const returnSpin = Math.random() > 0.5 ? 360 : -360;
    const url = avatarUrl != null ? String(avatarUrl) : '';
    const toCenterMs =
      selfTiming.toCenterMs != null ? selfTiming.toCenterMs : 420;
    const returnMs = selfTiming.returnMs != null ? selfTiming.returnMs : 720;

    // 尺寸已含 bucketScale（≈ Observer 1.75×）；enter 用 scale 做弹出，稳定态 scale=1
    const buildSelfBucketStyle = function (x, y, rot, popScale, ms) {
      const s = popScale != null ? popScale : 1;
      const transition =
        ms > 0
          ? 'left ' +
            ms +
            'ms cubic-bezier(0.22, 0.61, 0.36, 1),top ' +
            ms +
            'ms cubic-bezier(0.22, 0.61, 0.36, 1),transform ' +
            Math.min(ms, 320) +
            'ms ease-out'
          : 'none';
      return (
        'left:' +
        x +
        'px;top:' +
        y +
        'px;width:' +
        bucketSize +
        'px;height:' +
        bucketSize +
        'px;transform:translate(-50%,-50%) rotate(' +
        (rot || 0) +
        'deg) scale(' +
        s +
        ');transition:' +
        transition +
        ';'
      );
    };

    this._clearPlayerActionBucketTimers();
    this._stopBucketReactionSounds();
    this._resetPlayerActionBucketVisuals({
      playerActionSheetVisible: false,
      playerActionTarget: null
    });

    this._bucketTimelineCtx = {
      mode: 'self',
      seatX: seatX,
      seatY: seatY,
      cx: centerX,
      cy: centerY,
      left: left,
      top: top,
      width: width,
      height: height,
      centerW: centerW,
      centerH: centerH,
      centerScale: centerScale,
      bucketScale: bucketScale,
      bucketSize: bucketSize,
      hoverX: hoverX,
      hoverY: hoverY,
      enterX: enterX,
      enterY: enterY,
      toCenterMs: toCenterMs,
      returnMs: returnMs,
      returnSpin: returnSpin,
      playerId: hitPlayerId,
      avatarUrl: url,
      buildSelfBucketStyle: buildSelfBucketStyle,
      timing: selfTiming
    };

    this.setData({
      reactionScreenVisible: true,
      reactionScreenFading: false,
      reactionScreenMode: 'bucket',
      reactionBucketScreenActive: true,
      reactionBucketScreenPouring: false,
      reactionAvatarDetached: !!hitPlayerId,
      reactionAvatarDetachedPlayerId: hitPlayerId,
      reactionActiveMode: hitPlayerId ? 'self' : '',
      reactionBucketSelfAvatarVisible: true,
      reactionBucketSelfAvatarUrl: url,
      reactionBucketSelfAvatarPhase: 'seat',
      reactionBucketSelfAvatarStyle: this._buildBucketSelfAvatarStyle({
        x: seatX,
        y: seatY,
        w: width,
        h: height,
        rot: 0,
        ms: 0
      }),
      reactionBucketSelfBucketVisible: false,
      reactionBucketSelfBucketStyle: buildSelfBucketStyle(enterX, enterY, 0, 0.35, 0),
      reactionBucketSelfBucketDropping: false,
      reactionBucketSelfBucketPouring: false,
      reactionBucketSelfStreamVisible: false,
      reactionBucketSelfStreamStyle: '',
      reactionBucketSelfWetVisible: false,
      reactionBucketSelfCartoonWet: false,
      reactionBucketSelfDripHold: false,
      // Self 不用 Observer 的 fixed 桶层
      playerActionBucketVisible: false,
      playerActionBucketDropping: false,
      playerActionBucketPouring: false,
      playerActionBucketStyle: ''
    });

    this._runBucketReactionTimeline(
      bucketReactionTimeline.buildBucketSelfReactionTimeline
        ? bucketReactionTimeline.buildBucketSelfReactionTimeline()
        : bucketReactionTimeline.buildBucketReactionTimeline('self')
    );
  },

  /** Demo：🪣 Self 临时头像层样式（座位 ↔ 中央拳击尺寸） */
  _buildBucketSelfAvatarStyle(opts) {
    const o = opts || {};
    const x = o.x != null ? o.x : 0;
    const y = o.y != null ? o.y : 0;
    const w = o.w != null ? o.w : 44;
    const h = o.h != null ? o.h : 44;
    const rot = o.rot != null ? o.rot : 0;
    const ms = o.ms != null ? Number(o.ms) : 0;
    const ease = o.ease || 'cubic-bezier(0.22, 0.7, 0.28, 1)';
    const transition =
      ms > 0
        ? 'left ' +
          ms +
          'ms ' +
          ease +
          ',top ' +
          ms +
          'ms ' +
          ease +
          ',width ' +
          ms +
          'ms ' +
          ease +
          ',height ' +
          ms +
          'ms ' +
          ease +
          ',transform ' +
          ms +
          'ms ' +
          ease
        : 'none';
    return (
      'left:' +
      x +
      'px;top:' +
      y +
      'px;width:' +
      w +
      'px;height:' +
      h +
      'px;transform:translate(-50%,-50%) rotate(' +
      rot +
      'deg);transition:' +
      transition +
      ';'
    );
  },

  /** Demo：🪣 Self 水流层 — 起点固定在桶口，向下浇过头像 */
  _buildBucketSelfStreamStyle(ctx, pouring) {
    const c = ctx || {};
    const bucketSize = c.bucketSize != null ? c.bucketSize : 70;
    const cx = c.hoverX != null ? c.hoverX : c.cx;
    const bucketY = c.hoverY != null ? c.hoverY : c.cy;
    // 桶口约在桶底附近；倾斜后仍以口为原点
    const mouthY = bucketY + bucketSize * 0.28;
    const avatarBottom =
      (c.cy != null ? c.cy : 0) + (c.centerH != null ? c.centerH : 0) / 2;
    const streamH = Math.max(48, Math.round(avatarBottom - mouthY + 12));
    const streamW = Math.round(bucketSize * 0.55);
    return (
      'left:' +
      cx +
      'px;top:' +
      mouthY +
      'px;width:' +
      streamW +
      'px;height:' +
      (pouring ? streamH : 0) +
      'px;'
    );
  },

  /** Demo：bucket timeline 定时器 */
  _bucketTimeout(fn, ms) {
    const self = this;
    if (!this._bucketTimelineTimers) this._bucketTimelineTimers = [];
    const id = setTimeout(function () {
      const list = self._bucketTimelineTimers || [];
      const idx = list.indexOf(id);
      if (idx >= 0) list.splice(idx, 1);
      try {
        fn();
      } catch (err) {
        scoreDebugLog('[bucket-timeline] handler error', err);
      }
    }, ms);
    this._bucketTimelineTimers.push(id);
    return id;
  },

  _runBucketReactionTimeline(timeline) {
    const self = this;
    const list = timeline || [];
    for (let i = 0; i < list.length; i++) {
      (function (ev) {
        self._bucketTimeout(function () {
          self._dispatchBucketTimelineEvent(ev);
        }, ev.time);
      })(list[i]);
    }
  },

  _stopBucketReactionSounds() {
    try {
      reactionSounds.stopReactionSound('bucket_water_new');
    } catch (err) {
      /* ignore */
    }
  },

  _dispatchBucketTimelineEvent(ev) {
    const e = ev || {};
    const action = e.action != null ? String(e.action) : '';
    const ctx = this._bucketTimelineCtx || {};
    const page = this;
    const isSelf = ctx.mode === 'self';
    const build =
      typeof ctx.buildBucketStyle === 'function'
        ? ctx.buildBucketStyle
        : function () {
            return '';
          };
    const buildSelf =
      typeof ctx.buildSelfBucketStyle === 'function'
        ? ctx.buildSelfBucketStyle
        : function () {
            return '';
          };

    // —— Self-only timeline（bucketSelfReactionTimeline）——
    if (action === 'self_avatar_center') {
      if (!isSelf) return;
      const ms = e.duration != null ? e.duration : ctx.toCenterMs || 420;
      this.setData({
        reactionAvatarDetached: true,
        reactionAvatarDetachedPlayerId: ctx.playerId || '',
        reactionActiveMode: 'self',
        reactionBucketSelfAvatarVisible: true,
        reactionBucketSelfAvatarPhase: 'seat',
        reactionBucketSelfWetVisible: false,
        reactionBucketSelfCartoonWet: false,
        reactionBucketSelfAvatarStyle: this._buildBucketSelfAvatarStyle({
          x: ctx.seatX,
          y: ctx.seatY,
          w: ctx.width,
          h: ctx.height,
          rot: 0,
          ms: 0
        })
      });
      this._bucketTimeout(function () {
        if (!page._bucketTimelineCtx || page._bucketTimelineCtx.mode !== 'self') {
          return;
        }
        page.setData({
          reactionBucketSelfAvatarPhase: 'center',
          reactionBucketSelfAvatarStyle: page._buildBucketSelfAvatarStyle({
            x: ctx.cx,
            y: ctx.cy,
            w: ctx.centerW || ctx.width * 4,
            h: ctx.centerH || ctx.height * 4,
            rot: 0,
            ms: ms
          })
        });
      }, 24);
      return;
    }

    if (action === 'bucket_self_enter') {
      if (!isSelf) return;
      const ms = e.duration != null ? e.duration : 380;
      // 桶进入：无声；出现在中央头像上方
      this.setData({
        reactionBucketSelfBucketVisible: true,
        reactionBucketSelfBucketDropping: true,
        reactionBucketSelfBucketPouring: false,
        reactionBucketSelfBucketStyle: buildSelf(
          ctx.enterX,
          ctx.enterY,
          -8,
          0.4,
          0
        )
      });
      this._bucketTimeout(function () {
        if (!page._bucketTimelineCtx || page._bucketTimelineCtx.mode !== 'self') {
          return;
        }
        page.setData({
          reactionBucketSelfBucketStyle: buildSelf(
            ctx.hoverX,
            ctx.hoverY,
            0,
            1,
            ms
          )
        });
      }, 24);
      return;
    }

    if (action === 'bucket_tilt') {
      if (!isSelf) return;
      this.setData({
        reactionBucketSelfBucketDropping: false,
        reactionBucketSelfBucketPouring: true,
        reactionBucketSelfBucketStyle: buildSelf(
          ctx.hoverX,
          ctx.hoverY,
          118,
          1,
          e.duration != null ? e.duration : 280
        )
      });
      if (e.sound) {
        this._playReactionSound(e.sound, {
          volume: e.volume != null ? e.volume : 0.95,
          seekMs: e.seekMs != null ? e.seekMs : 0
        });
      }
      return;
    }

    if (action === 'water_pour_start') {
      if (!isSelf) return;
      this.setData({
        reactionBucketScreenPouring: true,
        reactionBucketSelfStreamVisible: true,
        reactionBucketSelfStreamStyle: this._buildBucketSelfStreamStyle(
          ctx,
          true
        ),
        reactionBucketSelfBucketPouring: true
      });
      // 音效已在 bucket_tilt；此处不重复起轨
      if (e.sound) {
        this._playReactionSound(e.sound, {
          volume: e.volume != null ? e.volume : 0.95,
          seekMs: e.seekMs != null ? e.seekMs : 0
        });
      }
      return;
    }

    if (action === 'wet_avatar_show') {
      if (!isSelf) return;
      this.setData({
        reactionBucketSelfAvatarPhase: 'wet',
        reactionBucketSelfWetVisible: true,
        reactionBucketSelfCartoonWet: true
      });
      return;
    }

    if (action === 'water_drip_hold') {
      if (!isSelf) return;
      this.setData({
        reactionBucketSelfDripHold: true,
        reactionBucketSelfWetVisible: true,
        reactionBucketSelfCartoonWet: true,
        // 浇完后收起桶，水流变细滴落
        reactionBucketSelfBucketVisible: false,
        reactionBucketSelfBucketPouring: false,
        reactionBucketSelfStreamVisible: true,
        reactionBucketSelfStreamStyle: this._buildBucketSelfStreamStyle(
          ctx,
          true
        )
      });
      return;
    }

    if (action === 'avatar_return') {
      if (!isSelf) return;
      const ms = e.duration != null ? e.duration : ctx.returnMs || 720;
      const spin = ctx.returnSpin != null ? ctx.returnSpin : 360;
      this.setData({
        reactionBucketSelfAvatarPhase: 'return',
        reactionBucketSelfDripHold: true,
        reactionBucketSelfWetVisible: true,
        reactionBucketSelfCartoonWet: true,
        reactionBucketSelfStreamVisible: false,
        reactionBucketSelfStreamStyle: '',
        reactionBucketSelfBucketVisible: false,
        reactionBucketSelfAvatarStyle: this._buildBucketSelfAvatarStyle({
          x: ctx.seatX,
          y: ctx.seatY,
          w: ctx.width,
          h: ctx.height,
          rot: spin,
          ms: ms,
          ease: 'cubic-bezier(0.28, 0.65, 0.32, 1)'
        })
      });
      return;
    }

    if (action === 'restore' || (action === 'cleanup' && isSelf)) {
      if (!isSelf && action === 'restore') return;
      this._stopBucketReactionSounds();
      this._resetPlayerActionBucketVisuals({
        reactionScreenVisible: false,
        reactionScreenFading: false,
        reactionScreenMode: '',
        reactionBucketScreenActive: false,
        reactionBucketScreenPouring: false,
        reactionAvatarDetached: false,
        reactionAvatarDetachedPlayerId: '',
        reactionActiveMode: ''
      });
      this._bucketTimelineCtx = null;
      this._playerActionBucketBusy = false;
      return;
    }

  },

  /** Demo：清理🪣相关延时器 */
  _clearPlayerActionBucketTimers() {
    const keys = [
      '_playerActionBucketDropTimer',
      '_playerActionBucketPauseTimer',
      '_playerActionBucketPourTimer',
      '_playerActionBucketHideTimer',
      '_playerActionBucketWaterTimer',
      '_playerActionBucketDripTimer',
      '_playerActionBucketFloodTimer'
    ];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (this[k]) {
        clearTimeout(this[k]);
        this[k] = null;
      }
    }
    const tl = this._bucketTimelineTimers;
    if (tl && tl.length) {
      for (let j = 0; j < tl.length; j++) {
        clearTimeout(tl[j]);
      }
    }
    this._bucketTimelineTimers = [];
  },

  /**
   * Demo：互动反应音效（独立模块；不改动画 / 记分）。
   * @param {string} key 如 'bucket_water_new' | 'boxing'
   * @param {{ volume?: number, seekMs?: number }=} opts
   */
  _playReactionSound(key, opts) {
    reactionSounds.playReactionSound(key, opts);
  },

  /**
   * Demo：彻底移除🪣相关视觉层（避免 opacity:0 / transform 合成层残留白线）。
   * 一次 setData 清掉水桶 / 水流 / 水滴 / 头像湿水 overlay。
   */
  _resetPlayerActionBucketVisuals(extra) {
    const patch = {
      playerActionBucketVisible: false,
      playerActionBucketDropping: false,
      playerActionBucketPouring: false,
      playerActionBucketStyle: '',
      playerActionWaterVisible: false,
      playerActionWaterStyle: '',
      playerActionWaterDripVisible: false,
      playerActionWaterDripStyle: '',
      playerActionWaterFloodVisible: false,
      playerActionWaterFloodStyle: '',
      reactionBucketSelfAvatarVisible: false,
      reactionBucketSelfAvatarUrl: '',
      reactionBucketSelfAvatarStyle: '',
      reactionBucketSelfAvatarPhase: '',
      reactionBucketSelfBucketVisible: false,
      reactionBucketSelfBucketStyle: '',
      reactionBucketSelfBucketDropping: false,
      reactionBucketSelfBucketPouring: false,
      reactionBucketSelfStreamVisible: false,
      reactionBucketSelfStreamStyle: '',
      reactionBucketSelfWetVisible: false,
      reactionBucketSelfCartoonWet: false,
      reactionBucketSelfDripHold: false
    };
    if (extra && typeof extra === 'object') {
      const keys = Object.keys(extra);
      for (let i = 0; i < keys.length; i++) {
        patch[keys[i]] = extra[keys[i]];
      }
    }
    this.setData(patch);
  },

  /**
   * Demo：🥚 → 目标头像中央舞台（所有人同效果）。
   * 仅 demo-weekend-amateur。
   */
  onPlayerActionEggTap() {
    if (this._playerActionEggBusy) return;
    if (!scoreReactionController.canPlayReaction(this._hostGameId(), 'egg', this._getScoreReactionCtx())) {
      return;
    }
    const target = this.data.playerActionTarget;
    const playerId =
      target && (target.playerId || target.userId) != null
        ? String(target.playerId || target.userId).trim()
        : '';
    if (!playerId) {
      scoreDebugLog('[player-action-egg] missing playerId');
      return;
    }
    this._playerActionEggBusy = true;
    this._playSelfReaction('egg', {
      playerId: playerId,
      target: target,
      avatarUrl:
        (target && (target.avatar || target.avatarUrl || target.headimgurl)) ||
        ''
    });
  },

  /**
   * Demo：🥚 SELF 入口 — 克隆头像到中央（拳击尺寸），固定右侧连击，
   * 累积蛋液 → cartoon egg face → 旋回（不改真实头像 / 不走 Observer）。
   */
  _playSelfEggReaction(rect, avatarUrl, playerId) {
    const hitPlayerId = playerId != null ? String(playerId).trim() : '';
    const norm =
      this._normalizePlayerActionAvatarRect(rect) ||
      this._fallbackPlayerActionAvatarRect() ||
      rect;
    const left = Number(norm.left);
    const top = Number(norm.top);
    const width = Number(norm.width);
    const height = Number(norm.height);
    if (
      !Number.isFinite(left) ||
      !Number.isFinite(top) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      this._playerActionEggBusy = false;
      return;
    }

    const selfTiming = eggReactionTimeline.EGG_SELF_TIMING || {};
    const centerScale =
      selfTiming.centerScale != null ? selfTiming.centerScale : 4;
    const win = this._getReactionWindowSize();
    const seatX = left + width / 2;
    const seatY = top + height / 2;
    const centerX = win.winW / 2;
    const centerY = win.winH * 0.42;
    const centerW = width * centerScale;
    const centerH = height * centerScale;
    const direction = selfTiming.direction || 'right';
    const flyMs =
      selfTiming.normalFlyMs != null ? selfTiming.normalFlyMs : 320;
    const finaleFlyMs =
      selfTiming.finaleFlyMs != null ? selfTiming.finaleFlyMs : 520;
    const toCenterMs =
      selfTiming.toCenterMs != null ? selfTiming.toCenterMs : 420;
    const returnMs = selfTiming.returnMs != null ? selfTiming.returnMs : 720;
    const returnSpin = Math.random() > 0.5 ? 360 : -360;
    const url = avatarUrl != null ? String(avatarUrl) : '';

    this._clearPlayerActionEggTimers();
    try {
      reactionSounds.stopReactionSound('egg_combo');
      reactionSounds.stopReactionSound('egg_hit_final');
      for (let s = 1; s <= 6; s++) reactionSounds.stopReactionSound('egg_hit_' + s);
    } catch (err) {
      /* ignore */
    }

    this._eggTimelineCtx = {
      mode: 'self',
      seatX: seatX,
      seatY: seatY,
      cx: centerX,
      cy: centerY,
      left: left,
      top: top,
      width: width,
      height: height,
      centerW: centerW,
      centerH: centerH,
      centerScale: centerScale,
      winW: win.winW,
      winH: win.winH,
      direction: direction,
      flyMs: flyMs,
      finaleFlyMs: finaleFlyMs,
      toCenterMs: toCenterMs,
      returnMs: returnMs,
      returnSpin: returnSpin,
      playerId: hitPlayerId,
      avatarUrl: url
    };

    this.setData({
      playerActionSheetVisible: false,
      playerActionTarget: null,
      playerActionEggs: [],
      playerActionEggSplatVisible: false,
      playerActionEggSplatHiding: false,
      playerActionEggSplatStyle: '',
      playerActionEggLevel: 0,
      playerActionEggFinale: false,
      reactionTomatoFlyVisible: false,
      reactionTomatoSplashVisible: false,
      reactionTomatoJuiceActive: false,
      reactionTomatoDripActive: false,
      reactionFlowerFlyVisible: false,
      reactionFlowerItems: [],
      reactionFlowerPetals: [],
      reactionScreenVisible: true,
      reactionScreenFading: false,
      reactionScreenMode: 'egg',
      reactionEggFlies: [],
      reactionEggHitLevel: 0,
      reactionEggBurstVisible: false,
      reactionEggBurstFinale: false,
      reactionEggBurstStyle: '',
      reactionEggFinaleActive: false,
      reactionEggShake: false,
      reactionEggSelfAvatarVisible: true,
      reactionEggSelfAvatarUrl: url,
      reactionEggSelfAvatarPhase: 'seat',
      reactionEggSelfFaceVisible: false,
      reactionEggSelfDripHold: false,
      reactionEggSelfDirection: direction,
      reactionEggSelfAvatarStyle: this._buildEggSelfAvatarStyle({
        x: seatX,
        y: seatY,
        w: width,
        h: height,
        rot: 0,
        ms: 0
      }),
      reactionAvatarDetached: !!hitPlayerId,
      reactionAvatarDetachedPlayerId: hitPlayerId,
      reactionActiveMode: hitPlayerId ? 'self' : ''
    });

    const timeline =
      eggReactionTimeline.buildEggSelfReactionTimeline
        ? eggReactionTimeline.buildEggSelfReactionTimeline()
        : eggReactionTimeline.buildEggReactionTimeline('self');
    const self = this;
    for (let i = 0; i < timeline.length; i++) {
      (function (ev) {
        self._eggTimeout(function () {
          self._dispatchEggTimelineEvent(ev, self._eggTimelineCtx);
        }, ev.time);
      })(timeline[i]);
    }
  },

  /** 兼容旧调用名 → Self */
  _playScreenEggComboReaction() {
    const target = this.data.playerActionTarget || {};
    const playerId = String(target.playerId || target.userId || '').trim();
    const avatarUrl =
      target.avatar || target.avatarUrl || target.headimgurl || '';
    const self = this;
    if (!playerId) {
      this._playerActionEggBusy = false;
      return;
    }
    this._queryPlayerActionAvatarRect(playerId, function (rect) {
      if (!rect) {
        self._playerActionEggBusy = false;
        return;
      }
      self._playSelfEggReaction(rect, avatarUrl, playerId);
    });
  },

  _buildEggSelfAvatarStyle(opts) {
    const o = opts || {};
    const x = o.x != null ? o.x : 0;
    const y = o.y != null ? o.y : 0;
    const w = o.w != null ? o.w : 44;
    const h = o.h != null ? o.h : 44;
    const rot = o.rot != null ? o.rot : 0;
    const ms = o.ms != null ? Number(o.ms) : 0;
    const ease = o.ease || 'cubic-bezier(0.22, 0.7, 0.28, 1)';
    const transition =
      ms > 0
        ? 'left ' +
          ms +
          'ms ' +
          ease +
          ',top ' +
          ms +
          'ms ' +
          ease +
          ',width ' +
          ms +
          'ms ' +
          ease +
          ',height ' +
          ms +
          'ms ' +
          ease +
          ',transform ' +
          ms +
          'ms ' +
          ease
        : 'none';
    return (
      'left:' +
      x +
      'px;top:' +
      y +
      'px;width:' +
      w +
      'px;height:' +
      h +
      'px;transform:translate(-50%,-50%) rotate(' +
      rot +
      'deg);transition:' +
      transition +
      ';'
    );
  },

  _resetEggSelfVisuals(extra) {
    const patch = {
      reactionEggFlies: [],
      reactionEggHitLevel: 0,
      reactionEggBurstVisible: false,
      reactionEggBurstFinale: false,
      reactionEggBurstStyle: '',
      reactionEggFinaleActive: false,
      reactionEggShake: false,
      reactionEggSelfAvatarVisible: false,
      reactionEggSelfAvatarUrl: '',
      reactionEggSelfAvatarStyle: '',
      reactionEggSelfAvatarPhase: '',
      reactionEggSelfFaceVisible: false,
      reactionEggSelfDripHold: false,
      reactionEggSelfDirection: 'right'
    };
    if (extra && typeof extra === 'object') {
      const keys = Object.keys(extra);
      for (let i = 0; i < keys.length; i++) {
        patch[keys[i]] = extra[keys[i]];
      }
    }
    this.setData(patch);
  },

  /**
   * Demo：🥚 Self timeline 调度。
   * 目标头像中央舞台（reaction-view-model-v2）。
   */
  _dispatchEggTimelineEvent(ev, ctx) {
    const e = ev || {};
    const c = ctx || this._eggTimelineCtx || {};
    const action = e.action != null ? String(e.action) : '';
    const page = this;
    const isSelf = c.mode === 'self';
    if (!isSelf) return;

    if (action === 'self_avatar_center') {
      const ms = e.duration != null ? e.duration : c.toCenterMs || 420;
      this.setData({
        reactionAvatarDetached: true,
        reactionAvatarDetachedPlayerId: c.playerId || '',
        reactionActiveMode: 'self',
        reactionEggSelfAvatarVisible: true,
        reactionEggSelfAvatarPhase: 'seat',
        reactionEggSelfFaceVisible: false,
        reactionEggSelfDripHold: false,
        reactionEggSelfAvatarStyle: this._buildEggSelfAvatarStyle({
          x: c.seatX,
          y: c.seatY,
          w: c.width,
          h: c.height,
          rot: 0,
          ms: 0
        })
      });
      this._eggTimeout(function () {
        if (!page._eggTimelineCtx || page._eggTimelineCtx.mode !== 'self') return;
        page.setData({
          reactionEggSelfAvatarPhase: 'center',
          reactionEggSelfAvatarStyle: page._buildEggSelfAvatarStyle({
            x: c.cx,
            y: c.cy,
            w: c.centerW || c.width * 4,
            h: c.centerH || c.height * 4,
            rot: 0,
            ms: ms
          })
        });
      }, 24);
      return;
    }

    if (action === 'egg_self_fly' || action === 'egg_hit_sequence') {
      // 标记节点：方向已写入 ctx；实际发射由 egg_launch 驱动
      if (e.direction) {
        this._eggTimelineCtx = Object.assign({}, c, {
          direction: String(e.direction)
        });
        this.setData({ reactionEggSelfDirection: String(e.direction) });
      }
      return;
    }

    if (action === 'egg_launch' || action === 'egg_final_launch') {
      const idx = e.index != null ? e.index : 0;
      const finale = !!e.finale;
      this._launchSelfEggHit({
        index: idx,
        finale: finale,
        flyMs: finale ? c.finaleFlyMs : c.flyMs,
        soundKey: finale ? 'egg_hit_final' : 'egg_hit_' + (idx + 1),
        volume: finale ? 1 : 0.92,
        direction: e.direction || c.direction || 'right'
      });
      return;
    }

    // 命中文档节点：音效已在飞行到达时播放，避免双播
    if (
      action.indexOf('egg_hit_') === 0 ||
      action === 'egg_final' ||
      action === 'egg_final_hit'
    ) {
      return;
    }

    if (action === 'egg_overlay_show') {
      this.setData({
        reactionEggSelfFaceVisible: true,
        reactionEggSelfDripHold: false,
        reactionEggSelfAvatarPhase: 'overlay',
        reactionEggFinaleActive: true,
        reactionEggHitLevel: Math.max(6, this.data.reactionEggHitLevel || 0)
      });
      return;
    }

    if (action === 'egg_drip_hold') {
      this.setData({
        reactionEggSelfDripHold: true,
        reactionEggSelfFaceVisible: true,
        reactionEggSelfAvatarPhase: 'hold',
        reactionEggShake: true
      });
      this._eggTimeout(function () {
        if (!page._eggTimelineCtx || page._eggTimelineCtx.mode !== 'self') return;
        page.setData({ reactionEggShake: false });
      }, 360);
      this._eggTimeout(function () {
        if (!page._eggTimelineCtx || page._eggTimelineCtx.mode !== 'self') return;
        page.setData({ reactionEggShake: true });
      }, 900);
      this._eggTimeout(function () {
        if (!page._eggTimelineCtx || page._eggTimelineCtx.mode !== 'self') return;
        page.setData({ reactionEggShake: false });
      }, 1300);
      return;
    }

    if (action === 'avatar_return') {
      const ms = e.duration != null ? e.duration : c.returnMs || 720;
      const spin = c.returnSpin != null ? c.returnSpin : 360;
      this.setData({
        reactionEggSelfAvatarPhase: 'return',
        reactionEggSelfFaceVisible: true,
        reactionEggSelfDripHold: true,
        reactionEggShake: false,
        reactionEggBurstVisible: false,
        reactionEggFlies: [],
        reactionEggSelfAvatarStyle: this._buildEggSelfAvatarStyle({
          x: c.seatX,
          y: c.seatY,
          w: c.width,
          h: c.height,
          rot: spin,
          ms: ms,
          ease: 'cubic-bezier(0.28, 0.65, 0.32, 1)'
        })
      });
      return;
    }

    if (action === 'restore' || action === 'cleanup') {
      try {
        reactionSounds.stopReactionSound('egg_hit_final');
        for (let s = 1; s <= 6; s++) {
          reactionSounds.stopReactionSound('egg_hit_' + s);
        }
      } catch (err) {
        /* ignore */
      }
      this._resetEggSelfVisuals({
        reactionScreenVisible: false,
        reactionScreenFading: false,
        reactionScreenMode: '',
        reactionAvatarDetached: false,
        reactionAvatarDetachedPlayerId: '',
        reactionActiveMode: ''
      });
      this._eggTimelineCtx = null;
      this._playerActionEggBusy = false;
    }
  },

  /**
   * Demo：🥚 Self 单枚 — 固定方向（默认 right→center）飞向中央头像。
   * 命中时播音；覆盖层累加不重置。
   */
  _launchSelfEggHit(opts) {
    const o = opts || {};
    const ctx = this._eggTimelineCtx || {};
    const winW = Number(ctx.winW) || 375;
    const finale = !!o.finale;
    const direction = String(o.direction || ctx.direction || 'right');
    const idx = o.index != null ? o.index : 0;
    const endX = ctx.cx != null ? ctx.cx : winW / 2;
    const endY = ctx.cy != null ? ctx.cy : 280;
    // 固定入场：右侧（或左侧）屏外 → 中央；Y 仅按序号固定微偏，不随机方向
    const ySpread = [-18, -8, 0, 8, 14, -12, 6];
    const yOff = ySpread[idx % ySpread.length] || 0;
    let startX;
    let startY;
    if (direction === 'left') {
      startX = -48;
      startY = endY + yOff;
    } else {
      startX = winW + 48;
      startY = endY + yOff;
    }
    const flyMs =
      o.flyMs != null
        ? Number(o.flyMs)
        : finale
          ? 520
          : 320;
    const startScale = finale ? 1.2 : 0.78;
    const endScale = finale ? 2.35 : 1.2 + idx * 0.04;
    const startRot = direction === 'left' ? 28 : -28;
    const endRot = startRot + (finale ? 520 : 300 + idx * 12);
    const eggId = 'self-egg-' + Date.now() + '-' + idx + (finale ? '-f' : '');
    const soundKey =
      o.soundKey != null
        ? String(o.soundKey)
        : finale
          ? 'egg_hit_final'
          : 'egg_hit_' + (idx + 1);

    const buildStyle = function (x, y, rot, scale, ms) {
      const transition =
        ms > 0
          ? 'left ' +
            ms +
            'ms cubic-bezier(0.22, 0.55, 0.3, 1),top ' +
            ms +
            'ms cubic-bezier(0.22, 0.55, 0.3, 1),transform ' +
            ms +
            'ms cubic-bezier(0.2, 0.6, 0.28, 1)'
          : 'none';
      return (
        'left:' +
        x +
        'px;top:' +
        y +
        'px;transform:translate(-50%,-50%) rotate(' +
        rot +
        'deg) scale(' +
        scale +
        ');transition:' +
        transition +
        ';'
      );
    };

    const flies = (this.data.reactionEggFlies || []).slice();
    while (flies.length >= 2) flies.shift();
    flies.push({
      id: eggId,
      finale: finale,
      style: buildStyle(startX, startY, startRot, startScale, 0)
    });
    this.setData({ reactionEggFlies: flies });

    const self = this;
    this._eggTimeout(function () {
      if (!self._eggTimelineCtx || self._eggTimelineCtx.mode !== 'self') return;
      const list = (self.data.reactionEggFlies || []).slice();
      for (let i = 0; i < list.length; i++) {
        if (list[i] && list[i].id === eggId) {
          list[i] = {
            id: eggId,
            finale: finale,
            style: buildStyle(endX, endY, endRot, endScale, flyMs)
          };
          break;
        }
      }
      self.setData({ reactionEggFlies: list });
    }, 24);

    this._eggTimeout(function () {
      if (!self._eggTimelineCtx || self._eggTimelineCtx.mode !== 'self') return;
      const nextFlies = (self.data.reactionEggFlies || []).filter(function (egg) {
        return egg && egg.id !== eggId;
      });
      // 覆盖层累加，不在每次命中重置
      const prev = self.data.reactionEggHitLevel || 0;
      const level = finale ? Math.max(6, prev) : Math.min(6, prev + 1);
      self.setData({
        reactionEggFlies: nextFlies,
        reactionEggHitLevel: level,
        reactionEggBurstVisible: true,
        reactionEggBurstFinale: finale,
        reactionEggBurstStyle:
          'left:' + endX + 'px;top:' + endY + 'px;',
        reactionEggShake: true,
        reactionEggSelfAvatarPhase: 'hit',
        reactionEggFinaleActive: finale
          ? true
          : !!self.data.reactionEggFinaleActive
      });
      try {
        self._playReactionSound(soundKey, {
          volume: o.volume != null ? o.volume : finale ? 1 : 0.92,
          seekMs: 0
        });
      } catch (err) {
        /* ignore */
      }
      self._eggTimeout(function () {
        if (!self._eggTimelineCtx) return;
        self.setData({ reactionEggShake: false });
      }, finale ? 220 : 110);
      self._eggTimeout(function () {
        if (!self._eggTimelineCtx) return;
        self.setData({
          reactionEggBurstVisible: false,
          reactionEggBurstFinale: false,
          reactionEggBurstStyle: ''
        });
      }, finale ? 480 : 260);
    }, flyMs);
  },

  /** Demo：清理🥚相关延时器 */
  _clearPlayerActionEggTimers() {
    const list = this._playerActionEggTimers;
    if (list && list.length) {
      for (let i = 0; i < list.length; i++) {
        clearTimeout(list[i]);
      }
    }
    this._playerActionEggTimers = [];
  },

  _eggTimeout(fn, ms) {
    const self = this;
    if (!this._playerActionEggTimers) this._playerActionEggTimers = [];
    const tid = setTimeout(function () {
      const arr = self._playerActionEggTimers || [];
      const idx = arr.indexOf(tid);
      if (idx >= 0) arr.splice(idx, 1);
      fn();
    }, ms);
    this._playerActionEggTimers.push(tid);
    return tid;
  },

  /** Demo：彻底移除🥚飞行层 / 糊脸层（wx:if 销毁，非仅 opacity:0） */
  _resetPlayerActionEggVisuals(extra) {
    if (this._playerActionEggTeardownTimer) {
      clearTimeout(this._playerActionEggTeardownTimer);
      this._playerActionEggTeardownTimer = null;
    }
    const patch = {
      playerActionEggs: [],
      playerActionEggSplatVisible: false,
      playerActionEggSplatHiding: false,
      playerActionEggSplatStyle: '',
      playerActionEggLevel: 0,
      playerActionEggFinale: false
    };
    if (extra && typeof extra === 'object') {
      const keys = Object.keys(extra);
      for (let i = 0; i < keys.length; i++) {
        patch[keys[i]] = extra[keys[i]];
      }
    }
    this.setData(patch);
  },

  /**
   * Demo：🥚 fixed reaction layer 两阶段清理
   * 1) is-hiding：opacity/visibility/transform 卸掉 GPU 合成（DOM 仍在）
   * 2) ~160ms 后 wx:if 销毁 shell/white/yolk/finale 全部子层
   */
  _teardownPlayerActionEggSplat() {
    if (this._playerActionEggTeardownTimer) {
      clearTimeout(this._playerActionEggTeardownTimer);
      this._playerActionEggTeardownTimer = null;
    }
    const hasSplat = !!this.data.playerActionEggSplatVisible;
    const hasFlies = (this.data.playerActionEggs || []).length > 0;
    if (!hasSplat && !hasFlies) {
      this._resetPlayerActionEggVisuals();
      return;
    }
    // 阶段 1：先藏层 + 清飞行壳，避免带 transform 的乳白层被瞬间拆掉残留白块
    this.setData({
      playerActionEggSplatHiding: true,
      playerActionEggs: []
    });
    const self = this;
    this._playerActionEggTeardownTimer = setTimeout(function () {
      self._playerActionEggTeardownTimer = null;
      // 阶段 2：彻底移除（Visible=false → 整棵 splat DOM 销毁）
      self._resetPlayerActionEggVisuals();
    }, 160);
  },

  _buildEggFlyStyle(x, y, rot, scale, flyMs) {
    const transition =
      flyMs > 0
        ? 'left ' +
          flyMs +
          'ms cubic-bezier(0.22, 0.61, 0.36, 1),top ' +
          flyMs +
          'ms cubic-bezier(0.22, 0.61, 0.36, 1),transform ' +
          flyMs +
          'ms cubic-bezier(0.22, 0.61, 0.36, 1)'
        : 'none';
    return (
      'left:' +
      x +
      'px;top:' +
      y +
      'px;transform:translate(-50%,-50%) rotate(' +
      rot +
      'deg) scale(' +
      scale +
      ');transition:' +
      transition +
      ';'
    );
  },

  _setEggItemStyle(eggId, style) {
    const eggs = this.data.playerActionEggs || [];
    for (let i = 0; i < eggs.length; i++) {
      if (eggs[i] && eggs[i].id === eggId) {
        // 路径更新：只改单枚 style，降低整页 diff 闪白
        const patch = {};
        patch['playerActionEggs[' + i + '].style'] = style;
        this.setData(patch);
        return;
      }
    }
  },

  _removeEggItem(eggId) {
    const eggs = (this.data.playerActionEggs || []).filter(function (e) {
      return e && e.id !== eggId;
    });
    this.setData({ playerActionEggs: eggs });
  },

  /**
   * Demo：单枚鸡蛋沿固定轨迹屏外 → 头像中心（origin/旋转由连击层统一传入）。
   */
  _spawnPlayerActionEggFly(opts, onArrive) {
    const self = this;
    const endX = Number(opts && opts.endX);
    const endY = Number(opts && opts.endY);
    const flyMs = Number(opts && opts.flyMs) || 360;
    const finale = !!(opts && opts.finale);
    const originX = Number(opts && opts.originX);
    const originY = Number(opts && opts.originY);
    const startRot = Number(opts && opts.startRot);
    const endRot = Number(opts && opts.endRot);
    if (
      !Number.isFinite(endX) ||
      !Number.isFinite(endY) ||
      !Number.isFinite(originX) ||
      !Number.isFinite(originY)
    ) {
      if (typeof onArrive === 'function') onArrive();
      return;
    }
    const eggId =
      'egg-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
    const rot0 = Number.isFinite(startRot) ? startRot : -18;
    const rot1 = Number.isFinite(endRot) ? endRot : rot0 + 480;
    // 最后一击也不做 scale 放大，避免命中瞬间合成闪白
    const eggs = (this.data.playerActionEggs || []).slice();
    eggs.push({
      id: eggId,
      finale: finale,
      style: this._buildEggFlyStyle(originX, originY, rot0, 1, 0)
    });
    this.setData({ playerActionEggs: eggs });

    this._eggTimeout(function () {
      self._setEggItemStyle(
        eggId,
        self._buildEggFlyStyle(endX, endY, rot1, 1, flyMs)
      );
    }, 24);

    this._eggTimeout(function () {
      self._removeEggItem(eggId);
      if (typeof onArrive === 'function') onArrive();
    }, 24 + flyMs);
  },

  /** Demo：命中只叠加 level / 最后一击流淌层（糊脸层已 fixed，无 flash） */
  _applyPlayerActionEggHit(playerId, level, isFinale, soundKey) {
    const nextLevel = Math.max(0, Number(level) || 0);
    const key = soundKey != null ? String(soundKey) : '';
    if (isFinale) {
      this.setData({
        playerActionEggLevel: nextLevel,
        playerActionEggFinale: true
      });
      if (key) {
        this._playReactionSound(key, { volume: 1, seekMs: 0 });
      }
      return;
    }
    this.setData({
      playerActionEggSplatVisible: true,
      playerActionEggLevel: nextLevel
    });
    if (key) {
      this._playReactionSound(key, { volume: 0.92, seekMs: 0 });
    }
  },

  /**
   * Demo：🌹 → 第一视角花雨 / 第三方飞向头像送花。
   * 仅 demo-weekend-amateur；仍追加讨论区系统消息。
   */
  onPlayerActionFlowerTap() {
    if (this._playerActionFlowerBusy) return;
    if (!scoreReactionController.canPlayReaction(this._hostGameId(), 'flower', this._getScoreReactionCtx())) {
      return;
    }
    const target = this.data.playerActionTarget;
    const playerId =
      target && (target.playerId || target.userId) != null
        ? String(target.playerId || target.userId).trim()
        : '';
    if (!playerId) {
      scoreDebugLog('[player-action-flower] missing playerId');
      return;
    }
    this._playerActionFlowerBusy = true;
    if (this._isSelfReactionTarget(playerId)) {
      this._playSelfReaction('flower', { playerId: playerId, target: target });
    } else {
      this._playObserverReaction('flower', target);
    }
    this._appendDemoFlowerSystemMessage(target);
  },

  /**
   * 演示赛送花：讨论区系统消息「A 给 B 送了一朵花」。
   * 与 reaction 同门控；仅页面实时 chatMessages，不写 game/match/score。
   */
  _appendDemoFlowerSystemMessage(target) {
    const host = this._reactionHost || {};
    if (typeof host.appendFlowerSystemMessage === 'function') {
      host.appendFlowerSystemMessage(target);
      return;
    }
    return this._appendDemoFlowerSystemMessageLocal(target);
  },

  _appendDemoFlowerSystemMessageLocal(target) {
    if (
      !scoreReactionController.shouldAppendFlowerSystemMessage(
        this._hostGameId(),
        this._getScoreReactionCtx()
      )
    ) {
      return;
    }
    const toName =
      (target && (target.name || target.displayName || target.nickname)) ||
      '球员';
    const fromName = this._resolveDemoInteractionActorName();
    const text = fromName + ' 给 ' + String(toName).trim() + ' 送了一朵🌹';
    const msg = {
      type: 'system',
      action: 'flower',
      text: text,
      timestamp: Date.now()
    };
    const chatMessages = (this.data.chatMessages || []).concat(msg);
    this.setData({ chatMessages: chatMessages });
    try {
      const disc = this.selectComponent('#score-discussion');
      if (disc && typeof disc.appendSystemMessage === 'function') {
        disc.appendSystemMessage(msg);
      }
    } catch (e) {
      /* 讨论区未挂载（非讨论 Tab）时仅靠 chatMessages，切回 Tab 时由 messages 同步 */
    }
  },

  /** 互动系统消息：当前操作用户展示名（优先昵称，缺省「我」） */
  _resolveDemoInteractionActorName() {
    const host = this._reactionHost || {};
    if (typeof host.resolveActorName === 'function') {
      const n = host.resolveActorName();
      if (n) return n;
    }
    return this._resolveDemoInteractionActorNameLocal();
  },

  _resolveDemoInteractionActorNameLocal() {
    const user = gameStore.getCurrentUser() || {};
    const name = String(
      user.nickname || user.name || user.displayName || ''
    ).trim();
    return name || '我';
  },

  /** Demo：清理🌹 / 花雨 reaction 延时器 */
  _clearPlayerActionFlowerTimers() {
    const keys = [
      '_playerActionFlowerFlyTimer',
      '_playerActionFlowerArcTimer',
      '_playerActionFlowerBloomTimer',
      '_playerActionFlowerWreathTimer',
      '_playerActionFlowerExpandTimer',
      '_playerActionFlowerPetalTimer',
      '_playerActionFlowerFadeTimer',
      '_playerActionFlowerClearTimer',
      '_playerActionFlowerSpawnTimer',
      '_playerActionFlowerDriftTimer',
      '_playerActionFlowerBatch2Timer',
      '_playerActionFlowerBatch3Timer'
    ];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (this[k]) {
        clearTimeout(this[k]);
        this[k] = null;
      }
    }
    const petalTimers = this._flowerPetalAnimTimers;
    if (petalTimers && petalTimers.length) {
      for (let p = 0; p < petalTimers.length; p++) clearTimeout(petalTimers[p]);
    }
    this._flowerPetalAnimTimers = [];
    const spawnTimers = this._flowerSpawnTimers;
    if (spawnTimers && spawnTimers.length) {
      for (let s = 0; s < spawnTimers.length; s++) clearTimeout(spawnTimers[s]);
    }
    this._flowerSpawnTimers = [];
  },

  _flowerSchedule(fn, ms) {
    if (!this._flowerSpawnTimers) this._flowerSpawnTimers = [];
    const self = this;
    const id = setTimeout(function () {
      const list = self._flowerSpawnTimers || [];
      const idx = list.indexOf(id);
      if (idx >= 0) list.splice(idx, 1);
      try {
        fn();
      } catch (err) {
        scoreDebugLog('[flower] timer error', err);
      }
    }, ms);
    this._flowerSpawnTimers.push(id);
    return id;
  },

  /**
   * Demo：🌹 SELF — 随机花束边缘入场 → 屏中开放（多批冒出 + 花瓣飘落）。
   * 不改 Self/Observer 分流逻辑。
   */
  _playScreenFlowerReaction() {
    const size = this._getReactionWindowSize();
    const winW = size.winW;
    const winH = size.winH;

    const endX = winW / 2;
    const endY = winH * 0.46;
    const origin = this._getRandomSelfReactionEntryPoint(winW, winH);
    const startX = origin.x;
    const startY = origin.y;
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const ctrlX = midX + (startX < endX ? 36 : -36);
    const ctrlY = midY - 40;
    const flyMs = flowerReactionTimeline.FLOWER_TIMING.self.flyMs || 1200;
    // v3：先定花束组合模式，颜色走权重（红色系为主）
    const bouquetMode =
      typeof flowerReactionTimeline.pickBouquetMode === 'function'
        ? flowerReactionTimeline.pickBouquetMode()
        : 'red_main';
    this._flowerBouquetMode = bouquetMode;
    const leadFlower = flowerReactionTimeline.pickRandomFlower({
      mode: bouquetMode,
      isLead: true,
      forceRed: bouquetMode !== 'special',
      scaleMin: 0.9,
      scaleMax: 1.25
    });
    const bundle = flowerReactionTimeline.buildRandomFlowerBundle({
      mode: bouquetMode,
      minCount: 20,
      maxCount: 40
    });

    const easeOut = function (t) {
      return 1 - Math.pow(1 - t, 2.4);
    };
    const buildFlyStyle = function (x, y, rot, scale, opacity, filter) {
      return (
        'left:' +
        x +
        'px;top:' +
        y +
        'px;opacity:' +
        opacity +
        ';transform:translate(-50%,-50%) rotate(' +
        rot +
        'deg) scale(' +
        scale +
        ');filter:' +
        (filter || 'none') +
        ';transition:none;'
      );
    };

    this._clearPlayerActionFlowerTimers();
    this._flowerScreenSpawnMeta = [];
    this._flowerScreenBundle = bundle;
    this.setData({
      playerActionSheetVisible: false,
      playerActionTarget: null,
      playerActionFlowerVisible: false,
      playerActionFlowerBloom: false,
      playerActionFlowerStyle: '',
      playerActionFlowerEmoji: leadFlower.emoji,
      playerActionPetalVisible: false,
      playerActionPetalStyle: '',
      playerActionPetalItems: [],
      playerActionFlowerScalePlayerId: '',
      playerActionWreathVisible: false,
      playerActionWreathAppear: false,
      playerActionWreathExpand: false,
      playerActionWreathFading: false,
      playerActionWreathStyle: '',
      playerActionWreathItems: [],
      reactionTomatoFlyVisible: false,
      reactionTomatoSplashVisible: false,
      reactionTomatoJuiceActive: false,
      reactionTomatoDripActive: false,
      reactionTomatoImpactPhase: '',
      reactionScreenVisible: true,
      reactionScreenFading: false,
      reactionScreenMode: 'flower',
      reactionFlowerFlyVisible: true,
      reactionFlowerFlyEmoji: leadFlower.emoji,
      reactionFlowerFlyStyle: buildFlyStyle(
        startX,
        startY,
        leadFlower.rotate,
        0.2,
        0.5,
        leadFlower.filter
      ),
      reactionFlowerItems: [],
      reactionFlowerPetals: []
    });

    const self = this;
    this._playerActionFlowerFlyTimer = setTimeout(function () {
      self._playerActionFlowerFlyTimer = null;
      const t0 = Date.now();
      const tick = function () {
        const elapsed = Date.now() - t0;
        let raw = elapsed / flyMs;
        if (raw >= 1) raw = 1;
        const t = easeOut(raw);
        const u = 1 - t;
        const x = u * u * startX + 2 * u * t * ctrlX + t * t * endX;
        const bob = Math.sin(raw * Math.PI * 1.8) * 8 * (1 - raw);
        const y = u * u * startY + 2 * u * t * ctrlY + t * t * endY + bob;
        const rot = leadFlower.rotate - 16 + 40 * t + 18 * Math.sin(raw * Math.PI);
        const scale = 0.22 + 1.05 * t;
        const opacity = 0.45 + 0.55 * t;
        self.setData({
          reactionFlowerFlyVisible: true,
          reactionFlowerFlyStyle: buildFlyStyle(
            x,
            y,
            rot,
            scale,
            opacity,
            leadFlower.filter
          )
        });
        if (raw < 1) {
          self._playerActionFlowerArcTimer = setTimeout(tick, 16);
          return;
        }
        self._playerActionFlowerArcTimer = null;
        self._dispatchFlowerTimelineEvent({ action: 'flower_hit_avatar' });
        // flower_bloom：到达屏中瞬间播送花音
        self._dispatchFlowerTimelineEvent({
          action: 'flower_bloom',
          sound: 'flower_send',
          volume: 0.92,
          seekMs: 0
        });
        self.setData({
          reactionFlowerFlyVisible: false,
          reactionFlowerFlyStyle: ''
        });
        self._startScreenFlowerBloomSpawn({
          cx: endX,
          cy: endY,
          winW: winW,
          winH: winH,
          bundle: bundle
        });
      };
      tick();
    }, flowerReactionTimeline.FLOWER_TIMING.self.flyAt);
  },

  /**
   * Demo：🌹 flower timeline 节点（bloom 播音；enter/fly 无声）。
   * @param {{ action:string, sound?:string, volume?:number, seekMs?:number }} ev
   */
  _dispatchFlowerTimelineEvent(ev) {
    const e = ev || {};
    const action = e.action != null ? String(e.action) : '';
    // flower_enter / flower_fly / flower_hit_avatar：飞入由页面 tick 驱动，此处不跳过视觉
    if (
      action === 'flower_enter' ||
      action === 'flower_fly' ||
      action === 'flower_hit_avatar'
    ) {
      return;
    }
    if (action === 'flower_bloom' || action === 'flower_arrive') {
      if (e.sound) {
        this._playReactionSound(e.sound, {
          volume: e.volume != null ? e.volume : 0.92,
          seekMs: e.seekMs != null ? e.seekMs : 0
        });
      }
      return;
    }
    if (action === 'flower_ring' || action === 'flower_ring_expand') {
      return;
    }
    if (action === 'cleanup') {
      try {
        reactionSounds.stopReactionSound('flower_send');
      } catch (err) {
        /* ignore */
      }
    }
  },

  /**
   * Demo：中心多批开放 —— 第一批快环绕、第二批继续冒出、第三批花瓣飘落。
   */
  _startScreenFlowerBloomSpawn(opts) {
    const o = opts || {};
    const cx = Number(o.cx);
    const cy = Number(o.cy);
    const winW = Number(o.winW) || 375;
    const winH = Number(o.winH) || 667;
    const bundle =
      o.bundle && o.bundle.length
        ? o.bundle
        : flowerReactionTimeline.buildRandomFlowerBundle({
            minCount: 20,
            maxCount: 40
          });
    const maxDist = Math.min(winW, winH) * 0.42;
    const self = this;
    this._flowerScreenSpawnMeta = [];

    const n = bundle.length;
    const batch1End = Math.ceil(n * 0.42);
    const batch2End = Math.ceil(n * 0.78);

    const spawnOne = function (flower, seq, batch) {
      self._spawnScreenFlowerBloom({
        cx: cx,
        cy: cy,
        maxDist: maxDist,
        maxFlowers: n,
        flower: flower,
        seq: seq,
        batch: batch
      });
    };

    // 第一批：快速环绕
    for (let i = 0; i < batch1End; i++) {
      (function (idx) {
        const delay = Math.round(idx * 28 + Math.random() * 20);
        self._flowerSchedule(function () {
          spawnOne(bundle[idx], idx, 1);
        }, delay);
      })(i);
    }

    // 第二批：中心继续冒出
    this._flowerSchedule(function () {
      self._dispatchFlowerTimelineEvent({ action: 'flower_ring_expand' });
      for (let j = batch1End; j < batch2End; j++) {
        (function (idx) {
          const delay = Math.round((idx - batch1End) * 55 + Math.random() * 40);
          self._flowerSchedule(function () {
            if (
              !self.data.reactionScreenVisible ||
              self.data.reactionScreenMode !== 'flower'
            ) {
              return;
            }
            spawnOne(bundle[idx], idx, 2);
          }, delay);
        })(j);
      }
    }, 420);

    // 第三批：少量再冒
    this._flowerSchedule(function () {
      for (let k = batch2End; k < n; k++) {
        (function (idx) {
          const delay = Math.round((idx - batch2End) * 70 + Math.random() * 50);
          self._flowerSchedule(function () {
            if (
              !self.data.reactionScreenVisible ||
              self.data.reactionScreenMode !== 'flower'
            ) {
              return;
            }
            spawnOne(bundle[idx], idx, 3);
          }, delay);
        })(k);
      }
    }, 980);

    // 花瓣飘落 1–2s
    this._flowerSchedule(function () {
      self._dispatchFlowerTimelineEvent({ action: 'flower_petals_fall' });
      self._spawnScreenFlowerPetals({ cx: cx, cy: cy });
      self._finishScreenFlowerRain({ holdMs: 1600, fadeMs: 700 });
    }, 2100);
  },

  _spawnScreenFlowerBloom(opts) {
    const o = opts || {};
    const cx = Number(o.cx);
    const cy = Number(o.cy);
    const maxDist = Number(o.maxDist) || 120;
    const maxFlowers = o.maxFlowers || 40;
    const flower =
      o.flower ||
      flowerReactionTimeline.pickRandomFlower({
        scaleMin: 0.6,
        scaleMax: 1.4
      });
    const seq = o.seq != null ? o.seq : 0;
    const batch = o.batch != null ? o.batch : 1;
    const rad = Math.random() * Math.PI * 2;
    const distFactor = batch === 1 ? 1 : batch === 2 ? 0.78 : 0.55;
    const dist =
      (36 + Math.random() * Math.max(36, maxDist - 36)) * distFactor;
    const dx = Math.cos(rad) * dist;
    const dy = Math.sin(rad) * dist * 0.92;
    const fall = 36 + Math.random() * 90;
    const rot = flower.rotate != null ? flower.rotate : -28 + Math.random() * 56;
    const scale =
      flower.scale != null ? flower.scale : 0.6 + Math.random() * 0.8;
    const burstMs = 1.5 + Math.random() * 0.9;
    const emoji = flower.emoji || '🌹';
    const filter = flower.filter || 'none';
    const id = flower.id || 'ff-' + Date.now() + '-' + seq;
    const base = 'left:' + cx + 'px;top:' + cy + 'px;filter:' + filter + ';';
    const item = {
      id: id,
      emoji: emoji,
      type: flower.type || '',
      color: flower.color || '',
      style:
        base +
        'opacity:0.8;transform:translate(-50%,-50%) translate(0px,0px) rotate(0deg) scale(0.22);transition:none;'
    };

    let items = (this.data.reactionFlowerItems || []).slice();
    items.push(item);
    if (items.length > maxFlowers) {
      items = items.slice(items.length - maxFlowers);
      this._flowerScreenSpawnMeta = (this._flowerScreenSpawnMeta || []).slice(
        -(maxFlowers - 1)
      );
    }
    this._flowerScreenSpawnMeta = (this._flowerScreenSpawnMeta || []).concat({
      id: id,
      dx: dx,
      dy: dy,
      fall: fall,
      rot: rot,
      scale: scale,
      base: base,
      emoji: emoji
    });
    this.setData({ reactionFlowerItems: items });

    const self = this;
    this._flowerSchedule(function () {
      if (
        !self.data.reactionScreenVisible ||
        self.data.reactionScreenMode !== 'flower'
      ) {
        return;
      }
      const list = (self.data.reactionFlowerItems || []).slice();
      for (let i = 0; i < list.length; i++) {
        if (list[i] && list[i].id === id) {
          list[i] = {
            id: id,
            emoji: emoji,
            type: flower.type || '',
            color: flower.color || '',
            style:
              base +
              'opacity:1;transform:translate(-50%,-50%) translate(' +
              dx.toFixed(1) +
              'px,' +
              dy.toFixed(1) +
              'px) rotate(' +
              rot.toFixed(1) +
              'deg) scale(' +
              scale.toFixed(2) +
              ');transition:transform ' +
              burstMs.toFixed(2) +
              's cubic-bezier(0.16, 0.72, 0.28, 1), opacity ' +
              burstMs.toFixed(2) +
              's ease;'
          };
          break;
        }
      }
      self.setData({ reactionFlowerItems: list });
    }, 24);
  },

  _spawnScreenFlowerPetals(opts) {
    const o = opts || {};
    const cx = Number(o.cx) || 0;
    const cy = Number(o.cy) || 0;
    const petals = flowerReactionTimeline.buildFallingPetals(
      10 + Math.floor(Math.random() * 9),
      { mode: this._flowerBouquetMode || 'red_main' }
    );
    const items = petals.map(function (p) {
      return {
        id: p.id,
        style:
          'left:' +
          cx +
          'px;top:' +
          cy +
          'px;width:' +
          p.w +
          'px;height:' +
          p.h +
          'px;margin-left:-' +
          (p.w / 2).toFixed(1) +
          'px;margin-top:-' +
          (p.h / 2).toFixed(1) +
          'px;background:' +
          p.petalColor +
          ';opacity:0.9;transform:translate(0,0) rotate(0deg) scale(0.7);transition:none;'
      };
    });
    this.setData({ reactionFlowerPetals: items });

    const self = this;
    if (!this._flowerPetalAnimTimers) this._flowerPetalAnimTimers = [];
    for (let i = 0; i < petals.length; i++) {
      (function (p, idx) {
        const tid = setTimeout(function () {
          if (
            !self.data.reactionScreenVisible ||
            self.data.reactionScreenMode !== 'flower'
          ) {
            return;
          }
          const list = (self.data.reactionFlowerPetals || []).slice();
          if (!list[idx]) return;
          list[idx] = {
            id: p.id,
            style:
              'left:' +
              cx +
              'px;top:' +
              cy +
              'px;width:' +
              p.w +
              'px;height:' +
              p.h +
              'px;margin-left:-' +
              (p.w / 2).toFixed(1) +
              'px;margin-top:-' +
              (p.h / 2).toFixed(1) +
              'px;background:' +
              p.petalColor +
              ';opacity:0;transform:translate(' +
              p.dx +
              'px,' +
              p.dy +
              'px) rotate(' +
              p.rot +
              'deg) scale(0.35);transition:transform ' +
              (p.fallMs / 1000).toFixed(2) +
              's cubic-bezier(0.22,0.55,0.3,1), opacity ' +
              (p.fallMs / 1000).toFixed(2) +
              's ease;'
          };
          self.setData({ reactionFlowerPetals: list });
        }, 30 + p.delay);
        self._flowerPetalAnimTimers.push(tid);
      })(petals[i], i);
    }
  },

  _finishScreenFlowerRain(opts) {
    const holdMs = (opts && opts.holdMs) || 1600;
    const fadeMs = (opts && opts.fadeMs) || 700;
    const meta = this._flowerScreenSpawnMeta || [];
    const list = (this.data.reactionFlowerItems || []).slice();
    const map = {};
    for (let i = 0; i < meta.length; i++) {
      if (meta[i] && meta[i].id) map[meta[i].id] = meta[i];
    }
    for (let j = 0; j < list.length; j++) {
      const it = list[j];
      if (!it) continue;
      const m = map[it.id];
      if (!m) continue;
      const fallMs = 2.2 + Math.random() * 1.1;
      list[j] = {
        id: it.id,
        emoji: it.emoji,
        type: it.type || '',
        color: it.color || '',
        style:
          m.base +
          'opacity:0.88;transform:translate(-50%,-50%) translate(' +
          m.dx.toFixed(1) +
          'px,' +
          (m.dy + m.fall).toFixed(1) +
          'px) rotate(' +
          (m.rot + 12).toFixed(1) +
          'deg) scale(' +
          (m.scale * 0.9).toFixed(2) +
          ');transition:transform ' +
          fallMs.toFixed(2) +
          's cubic-bezier(0.2, 0.55, 0.3, 1), opacity ' +
          fallMs.toFixed(2) +
          's ease;'
      };
    }
    this.setData({ reactionFlowerItems: list });

    const self = this;
    this._playerActionFlowerDriftTimer = setTimeout(function () {
      self._playerActionFlowerDriftTimer = null;
      self._dispatchFlowerTimelineEvent({ action: 'flower_fade' });
      self.setData({ reactionScreenFading: true });
      self._playerActionFlowerClearTimer = setTimeout(function () {
        self._playerActionFlowerClearTimer = null;
        self._flowerScreenSpawnMeta = [];
        self._flowerScreenBundle = null;
        self._dispatchFlowerTimelineEvent({ action: 'cleanup' });
        self.setData({
          reactionScreenVisible: false,
          reactionScreenFading: false,
          reactionScreenMode: '',
          reactionFlowerFlyVisible: false,
          reactionFlowerFlyStyle: '',
          reactionFlowerFlyEmoji: '🌹',
          reactionFlowerItems: [],
          reactionFlowerPetals: []
        });
        self._playerActionFlowerBusy = false;
        try {
          self._emitSeatRestoreEvent();
        } catch (e) {
          /* ignore */
        }
      }, fadeMs);
    }, holdMs);
  },

  /** Demo：🌹 OBSERVER — 远距离入场 → 目标头像自然花环（误传 self 则回退屏中花雨） */
  _playPlayerActionFlower(rect, playerId) {
    const hitPlayerId = playerId != null ? String(playerId).trim() : '';
    if (this._isSelfReactionTarget(hitPlayerId)) {
      this._playScreenFlowerReaction();
      return;
    }
    const left = Number(rect && rect.left);
    const top = Number(rect && rect.top);
    const width = Number(rect && rect.width);
    const height = Number(rect && rect.height);
    if (
      !hitPlayerId ||
      !Number.isFinite(left) ||
      !Number.isFinite(top) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      this._playerActionFlowerBusy = false;
      return;
    }

    const endX = left + width / 2 + 6;
    const endY = top + height / 2 - 4;
    const entry = this._getReactionEntryPoint(rect);
    const startX = entry.x;
    const startY = entry.y;
    const ctrlX = (startX + endX) / 2 + (startX < endX ? 18 : -18);
    const ctrlY = (startY + endY) / 2 - 32;
    const flyMs = flowerReactionTimeline.FLOWER_TIMING.observer.flyMs || 1400;
    // v3：Observer 同样红色主视觉；先定组合模式
    const bouquetMode =
      typeof flowerReactionTimeline.pickBouquetMode === 'function'
        ? flowerReactionTimeline.pickBouquetMode()
        : 'red_main';
    this._flowerBouquetMode = bouquetMode;
    const leadFlower = flowerReactionTimeline.pickRandomFlower({
      mode: bouquetMode,
      isLead: true,
      forceRed: bouquetMode !== 'special',
      scaleMin: 0.85,
      scaleMax: 1.2
    });

    const easeInOut = function (t) {
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    };
    const buildFlowerStyle = function (x, y, rot, scale, filter, opacity) {
      const op = opacity != null ? Number(opacity) : 1;
      return (
        'left:' +
        x +
        'px;top:' +
        y +
        'px;opacity:' +
        (Number.isFinite(op) ? op : 1) +
        ';transform:translate(-50%,-50%) rotate(' +
        rot +
        'deg) scale(' +
        scale +
        ');filter:' +
        (filter || 'none') +
        ';transition:none;'
      );
    };

    this._clearPlayerActionFlowerTimers();
    // flower_enter：边缘小尺寸起步，飞行中放大（不可跳过）
    const enterScale = 0.28;
    const arriveScale = 1.18;
    this.setData({
      playerActionSheetVisible: false,
      playerActionTarget: null,
      playerActionFlowerVisible: true,
      playerActionFlowerBloom: false,
      playerActionFlowerEmoji: leadFlower.emoji,
      playerActionFlowerStyle: buildFlowerStyle(
        startX,
        startY,
        leadFlower.rotate - 18,
        enterScale,
        leadFlower.filter,
        0.55
      ),
      playerActionPetalVisible: false,
      playerActionPetalStyle: '',
      playerActionPetalItems: [],
      playerActionFlowerScalePlayerId: '',
      playerActionWreathVisible: false,
      playerActionWreathAppear: false,
      playerActionWreathExpand: false,
      playerActionWreathFading: false,
      playerActionWreathStyle: '',
      playerActionWreathItems: []
    });

    const self = this;
    this._playerActionFlowerFlyTimer = setTimeout(function () {
      self._playerActionFlowerFlyTimer = null;
      const t0 = Date.now();

      const tick = function () {
        const elapsed = Date.now() - t0;
        let raw = elapsed / flyMs;
        if (raw >= 1) raw = 1;
        const t = easeInOut(raw);
        const u = 1 - t;
        const x = u * u * startX + 2 * u * t * ctrlX + t * t * endX;
        const bob = Math.sin(raw * Math.PI * 2.2) * 12 * (1 - raw * 0.35);
        const y = u * u * startY + 2 * u * t * ctrlY + t * t * endY + bob;
        const rot = leadFlower.rotate - 18 + 46 * t + 22 * Math.sin(raw * Math.PI * 1.6);
        const scale = enterScale + (arriveScale - enterScale) * t;
        const opacity = 0.55 + 0.45 * t;
        self.setData({
          playerActionFlowerStyle: buildFlowerStyle(
            x,
            y,
            rot,
            scale,
            leadFlower.filter,
            opacity
          )
        });
        if (raw < 1) {
          self._playerActionFlowerArcTimer = setTimeout(tick, 16);
          return;
        }
        self._playerActionFlowerArcTimer = null;
        self._dispatchFlowerTimelineEvent({
          action: 'flower_hit_avatar'
        });
        self._dispatchFlowerTimelineEvent({
          action: 'flower_bloom',
          sound: 'flower_send',
          volume: 0.92,
          seekMs: 0
        });
        self._playPlayerActionFlowerWreath({
          playerId: hitPlayerId,
          avatarCx: left + width / 2,
          avatarCy: top + height / 2,
          avatarSize: Math.max(width, height),
          arriveX: endX,
          arriveY: endY,
          leadFlower: leadFlower,
          buildFlowerStyle: buildFlowerStyle
        });
      };

      tick();
    }, flowerReactionTimeline.FLOWER_TIMING.observer.flyAt);
  },

  /**
   * Demo：🌹 Observer bloom-flower-ring-final-v7 —
   * 花束到达 → 盛开完整花朵圆周花环（flowerRingConfig）→ 轻微外扩 → 少量花瓣辅助。
   */
  _playPlayerActionFlowerWreath(opts) {
    const o = opts || {};
    const hitPlayerId = o.playerId != null ? String(o.playerId).trim() : '';
    const avatarCx = Number(o.avatarCx);
    const avatarCy = Number(o.avatarCy);
    const avatarSize = Number(o.avatarSize);
    const arriveX = Number(o.arriveX);
    const arriveY = Number(o.arriveY);
    const leadFlower =
      o.leadFlower ||
      flowerReactionTimeline.pickRandomFlower({ scaleMin: 0.9, scaleMax: 1.2 });
    const buildFlowerStyle =
      typeof o.buildFlowerStyle === 'function'
        ? o.buildFlowerStyle
        : function (x, y, rot, scale, filter) {
            return (
              'left:' +
              x +
              'px;top:' +
              y +
              'px;transform:translate(-50%,-50%) rotate(' +
              rot +
              'deg) scale(' +
              scale +
              ');filter:' +
              (filter || 'none') +
              ';transition:none;'
            );
          };

    if (!Number.isFinite(avatarCx) || !Number.isFinite(avatarCy)) {
      this.setData({
        playerActionFlowerVisible: false,
        playerActionFlowerBloom: false,
        playerActionFlowerStyle: ''
      });
      this._playerActionFlowerBusy = false;
      return;
    }

    const obsTiming = flowerReactionTimeline.FLOWER_TIMING.observer || {};
    const avatarW = Number.isFinite(avatarSize) && avatarSize > 0 ? avatarSize : 40;
    const avatarR = avatarW / 2;
    const countMin = obsTiming.wreathCountMin != null ? obsTiming.wreathCountMin : 8;
    const countMax = obsTiming.wreathCountMax != null ? obsTiming.wreathCountMax : 12;
    const flowerCount =
      countMin + Math.floor(Math.random() * (countMax - countMin + 1));
    const spread =
      obsTiming.flowerSpread != null ? Number(obsTiming.flowerSpread) : 1.05;

    const ring =
      flowerReactionTimeline.buildOpenFlowerRing
        ? flowerReactionTimeline.buildOpenFlowerRing({
            avatarSize: avatarW,
            avatarR: avatarR,
            count: flowerCount,
            countMin: countMin,
            countMax: countMax,
            spread: 1,
            gapFill: obsTiming.flowerGapFill,
            edgeClearance:
              obsTiming.wreathEdgePad != null ? obsTiming.wreathEdgePad : 2,
            mode: this._flowerBouquetMode || 'red_main'
          })
        : {
            items: flowerReactionTimeline.buildNaturalWreathItems({
              baseR: avatarR + 14,
              count: flowerCount,
              countMin: countMin,
              countMax: countMax,
              mode: this._flowerBouquetMode || 'red_main'
            }),
            layout: { radius: avatarR + 14, size: avatarW * 0.25, count: flowerCount },
            flowerRingConfig: null
          };
    const rawItems = ring.items || [];
    this._flowerOpenRingLayout = ring.layout || null;
    this._flowerRingConfig = ring.flowerRingConfig || null;

    const mapFlowerItem = function (it, radiusScale) {
      const r = Number(it.radius) * (radiusScale != null ? radiusScale : 1);
      const size = it.size != null ? Number(it.size) : avatarW * 0.25;
      const half = (size / 2).toFixed(1);
      const petalColor = it.petalColor || '#e11d48';
      const centerColor = it.centerColor || '#fff7ed';
      const petalCount = it.petalCount === 6 ? 6 : 5;
      return {
        id: it.id,
        isPetal: false,
        isOpenFlower: true,
        hasSixPetals: petalCount === 6,
        emoji: it.emoji || '🌹',
        type: it.type || 'rose',
        color: it.color,
        family: it.family || 'red',
        filter: it.filter || 'none',
        petalColor: petalColor,
        centerColor: centerColor,
        petalCount: petalCount,
        delay: it.delay,
        batch: it.batch,
        deg: it.deg,
        radius: r,
        size: size,
        style:
          'width:' +
          size +
          'px;height:' +
          size +
          'px;margin:-' +
          half +
          'px 0 0 -' +
          half +
          'px;transform:rotate(' +
          it.deg +
          'deg) translateY(-' +
          r.toFixed(1) +
          'px) rotate(' +
          (-it.deg + (it.rotate || 0)) +
          'deg);',
        bloomStyle: 'animation-delay:' + (it.delay || '0s') + ';',
        petalStyle: 'background:' + petalColor + ';',
        centerStyle: 'background:' + centerColor + ';'
      };
    };

    const items = rawItems.map(function (it) {
      return mapFlowerItem(it, 1);
    });
    this._flowerBloomRingRaw = rawItems;
    this._flowerBloomRingMap = mapFlowerItem;

    this.setData({
      playerActionFlowerBloom: true,
      playerActionFlowerEmoji: leadFlower.emoji,
      playerActionFlowerStyle: buildFlowerStyle(
        arriveX,
        arriveY,
        leadFlower.rotate || 0,
        1.05,
        leadFlower.filter
      ),
      playerActionFlowerScalePlayerId: hitPlayerId
    });

    const self = this;
    const ringExpandMs = obsTiming.ringExpandMs != null ? obsTiming.ringExpandMs : 340;
    const petalsAtMs = obsTiming.petalsAtMs != null ? obsTiming.petalsAtMs : 900;
    const fadeAtMs = obsTiming.fadeAtMs != null ? obsTiming.fadeAtMs : 1800;
    const cleanupAfterFadeMs =
      obsTiming.cleanupAfterFadeMs != null ? obsTiming.cleanupAfterFadeMs : 420;

    // flower_bloom：飞入花消失 → 多朵开放花逐朵开放成环
    this._playerActionFlowerBloomTimer = setTimeout(function () {
      self._playerActionFlowerBloomTimer = null;
      self.setData({
        playerActionFlowerVisible: false,
        playerActionFlowerBloom: false,
        playerActionFlowerStyle: '',
        playerActionWreathVisible: true,
        playerActionWreathAppear: false,
        playerActionWreathExpand: false,
        playerActionWreathFading: false,
        playerActionWreathStyle: 'left:' + avatarCx + 'px;top:' + avatarCy + 'px;',
        playerActionWreathItems: items,
        playerActionPetalVisible: false,
        playerActionPetalItems: []
      });
      self._playerActionFlowerWreathTimer = setTimeout(function () {
        self._playerActionFlowerWreathTimer = null;
        self.setData({ playerActionWreathAppear: true });
      }, 24);
    }, 180);

    // flower_ring：花环轻微外扩（保持连续，不拉开断裂）
    this._playerActionFlowerExpandTimer = setTimeout(function () {
      self._playerActionFlowerExpandTimer = null;
      self._dispatchFlowerTimelineEvent({ action: 'flower_ring' });
      self._dispatchFlowerTimelineEvent({ action: 'flower_ring_expand' });
      const raw = self._flowerBloomRingRaw || [];
      const mapper = self._flowerBloomRingMap || mapFlowerItem;
      const expanded = raw.map(function (it) {
        return mapper(it, spread);
      });
      self.setData({
        playerActionWreathExpand: true,
        playerActionWreathItems: expanded
      });
    }, 180 + ringExpandMs);

    // flower_petal：少量缓慢飘落（辅助）
    this._playerActionFlowerPetalTimer = setTimeout(function () {
      self._playerActionFlowerPetalTimer = null;
      self._dispatchFlowerTimelineEvent({ action: 'flower_petals_fall' });
      self._playObserverFlowerPetals(avatarCx, avatarCy);
    }, 180 + petalsAtMs);

    // 停留约 1.5–2s → 淡出
    this._playerActionFlowerFadeTimer = setTimeout(function () {
      self._playerActionFlowerFadeTimer = null;
      self._dispatchFlowerTimelineEvent({ action: 'flower_fade' });
      self.setData({
        playerActionWreathFading: true,
        playerActionPetalVisible: false,
        playerActionPetalStyle: '',
        playerActionPetalItems: []
      });
      self._playerActionFlowerClearTimer = setTimeout(function () {
        self._playerActionFlowerClearTimer = null;
        self._dispatchFlowerTimelineEvent({ action: 'cleanup' });
        self._flowerBloomRingRaw = null;
        self._flowerBloomRingMap = null;
        self._flowerOpenRingLayout = null;
        self._flowerRingConfig = null;
        self.setData({
          playerActionWreathVisible: false,
          playerActionWreathAppear: false,
          playerActionWreathExpand: false,
          playerActionWreathFading: false,
          playerActionWreathStyle: '',
          playerActionWreathItems: [],
          playerActionFlowerEmoji: '🌹',
          playerActionFlowerScalePlayerId: ''
        });
        self._playerActionFlowerBusy = false;
        try {
          self._emitSeatRestoreEvent();
        } catch (e) {
          /* ignore */
        }
      }, cleanupAfterFadeMs);
    }, 180 + fadeAtMs);
  },

  /** Demo：Observer 结束阶段少量花瓣缓慢飘落（3–8） */
  _playObserverFlowerPetals(cx, cy) {
    const obsTiming = flowerReactionTimeline.FLOWER_TIMING.observer || {};
    const pMin = obsTiming.petalCountMin != null ? obsTiming.petalCountMin : 3;
    const pMax = obsTiming.petalCountMax != null ? obsTiming.petalCountMax : 8;
    const petalCount = pMin + Math.floor(Math.random() * (pMax - pMin + 1));
    const petals = flowerReactionTimeline.buildFallingPetals(petalCount, {
      mode: this._flowerBouquetMode || 'red_main',
      slow: true
    });
    const items = petals.map(function (p) {
      return {
        id: p.id,
        style:
          'left:0;top:0;width:' +
          p.w +
          'px;height:' +
          p.h +
          'px;margin-left:-' +
          (p.w / 2).toFixed(1) +
          'px;margin-top:-' +
          (p.h / 2).toFixed(1) +
          'px;background:' +
          p.petalColor +
          ';opacity:0.92;transform:translate(0,0) rotate(0deg) scale(0.75);transition:none;'
      };
    });
    this.setData({
      playerActionPetalVisible: true,
      playerActionPetalStyle: 'left:' + cx + 'px;top:' + cy + 'px;',
      playerActionPetalItems: items
    });

    const self = this;
    if (!this._flowerPetalAnimTimers) this._flowerPetalAnimTimers = [];
    for (let i = 0; i < petals.length; i++) {
      (function (p, idx) {
        const tid = setTimeout(function () {
          if (!self.data.playerActionPetalVisible) return;
          const list = (self.data.playerActionPetalItems || []).slice();
          if (!list[idx]) return;
          list[idx] = {
            id: p.id,
            style:
              'left:0;top:0;width:' +
              p.w +
              'px;height:' +
              p.h +
              'px;margin-left:-' +
              (p.w / 2).toFixed(1) +
              'px;margin-top:-' +
              (p.h / 2).toFixed(1) +
              'px;background:' +
              p.petalColor +
              ';opacity:0;transform:translate(' +
              p.dx +
              'px,' +
              p.dy +
              'px) rotate(' +
              p.rot +
              'deg) scale(0.3);transition:transform ' +
              (p.fallMs / 1000).toFixed(2) +
              's cubic-bezier(0.22,0.55,0.3,1), opacity ' +
              (p.fallMs / 1000).toFixed(2) +
              's ease;'
          };
          self.setData({ playerActionPetalItems: list });
        }, 30 + p.delay);
        self._flowerPetalAnimTimers.push(tid);
      })(petals[i], i);
    }
  },

  }
});
