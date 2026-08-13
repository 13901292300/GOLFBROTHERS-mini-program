/**
 * 领先榜展开身份卡。
 * avatarBadge：
 * - auto：有本场球队 LOGO 显示 LOGO，否则显示国旗（默认，兼容普通球局）
 * - team：仅显示本场球队 LOGO（队际赛）
 * - none：不显示角标（队内赛不展示国旗）
 * - flag：仅显示国旗
 *
 * 关系展示由页面注入（组件不读 store）：
 * - relationStatus / relationshipLabel / canFollow / followLoading / isSelf
 */
const playerIdentityGuard = require('../../utils/playerIdentityGuard.js');
const { DEFAULT_ORG_LOGO } = require('../../utils/teamMatchCapabilities.js');

Component({
  options: {
    styleIsolation: 'isolated'
  },

  properties: {
    player: {
      type: Object,
      value: {}
    },
    /** 队际赛角标 LOGO 页级 map：key=badgeTeamId */
    teamGroupLogoById: {
      type: Object,
      value: {}
    },
    /**
     * 头像右下角角标能力：auto | team | none | flag
     * 勿删节点；由 showAvatarBadge 控制显隐，避免误伤队际赛 LOGO。
     * team：优先 teamGroupLogoById[badgeTeamId]；无 LOGO 时可读 player.badgeText / badgeColor（分队）。
     */
    avatarBadge: {
      type: String,
      value: 'auto'
    },
    /**
     * 辅助信息行：
     * - countryAge（默认 COUNTRY/AGE）
     * - handicapFloat（球队赛：江湖差点　浮动系数）
     * - handicapFloatHub（普通多组 Hub：江湖差点 · 浮动系数）
     * 默认 countryAge；须由页面显式开启差点模式，禁止改默认牵动全局。
     */
    metaMode: {
      type: String,
      value: 'countryAge'
    },
    /**
     * 昵称行是否展示性别符号（球队赛家族展开传 true；默认 false）
     */
    showNameGender: {
      type: Boolean,
      value: false
    },
    /** 可选：页面注入的标准化性别；缺省读 player.gender */
    gender: {
      type: String,
      value: ''
    },
    /** ♂ / ♀；缺省读 player.genderSymbol || player.genderIcon */
    genderSymbol: {
      type: String,
      value: ''
    },
    /** gender-male / gender-female；缺省读 player.genderClass */
    genderClass: {
      type: String,
      value: ''
    },
    /** @deprecated 兼容旧用法；优先 relationStatus */
    followed: {
      type: Boolean,
      value: false
    },
    /** none | following | friend */
    relationStatus: {
      type: String,
      value: ''
    },
    /**
     * 关系标签文案（页面解析）：好友 / 已关注；空则按 relationStatus 回退
     */
    relationshipLabel: {
      type: String,
      value: ''
    },
    /**
     * 是否允许展示「加关注」（稳定 userId 且非本人）。
     * 默认 true：兼容 Game Hub 等仅传 relationStatus 的旧用法。
     */
    canFollow: {
      type: Boolean,
      value: true
    },
    /** 关注请求中：按钮 disabled，防重复提交 */
    followLoading: {
      type: Boolean,
      value: false
    },
    isSelf: {
      type: Boolean,
      value: false
    }
  },

  data: {
    displayStatus: 'none',
    displayRelationLabel: '',
    showFollowBtn: false,
    showRelationTag: false,
    /** 有球员行即显示 ›；无稳定身份时弱化 */
    showProfileEntry: false,
    profileEntryEnabled: false,
    displayGenderSymbol: '',
    displayGenderClass: '',
    showAvatarBadge: false,
    avatarBadgeSrc: '',
    avatarBadgeIsTeam: false,
    avatarBadgeIsText: false,
    avatarBadgeText: '',
    avatarBadgeStyle: ''
  },

  observers: {
    'followed, relationStatus, relationshipLabel, canFollow, isSelf': function () {
      this._syncRelationDisplay();
    },
    'showNameGender, gender, genderSymbol, genderClass, player': function () {
      this._syncNameGender();
    },
    'player, teamGroupLogoById, avatarBadge': function () {
      this._syncAvatarBadge();
      this._syncProfileEntry();
    }
  },

  lifetimes: {
    attached() {
      this._syncAvatarBadge();
      this._syncRelationDisplay();
      this._syncProfileEntry();
      this._syncNameGender();
    }
  },

  methods: {
    _syncNameGender() {
      if (!this.data.showNameGender) {
        if (this.data.displayGenderSymbol || this.data.displayGenderClass) {
          this.setData({ displayGenderSymbol: '', displayGenderClass: '' });
        }
        return;
      }
      const player = this.data.player || {};
      const symbol = String(
        this.data.genderSymbol ||
          player.genderSymbol ||
          player.genderIcon ||
          ''
      ).trim();
      const cls = String(
        this.data.genderClass || player.genderClass || ''
      ).trim();
      const patch = {};
      if (this.data.displayGenderSymbol !== symbol) patch.displayGenderSymbol = symbol;
      if (this.data.displayGenderClass !== cls) patch.displayGenderClass = cls;
      if (Object.keys(patch).length) this.setData(patch);
    },

    /** 资料页入口主键：稳定 userId；排除 scorecardKey / guest_ / 索引 */
    _resolveProfileUserId(player) {
      if (!player || typeof player !== 'object') return '';
      const id = playerIdentityGuard.normalizePlayerUserId(
        player.profileUserId || player.userId || player.playerUserId || player.playerId
      );
      if (!playerIdentityGuard.isStablePublicUserId(id, { userType: player.userType })) {
        return '';
      }
      return id;
    },

    _syncProfileEntry() {
      const player = this.data.player || {};
      const userId = this._resolveProfileUserId(player);
      // 有球员行即展示进入图标；无稳定身份时弱化，点击由页面提示
      const show = !!(
        player &&
        (player.playerId || player.userId || player.playerUserId || player.name || player.avatar)
      );
      const enabled = !!userId;
      const patch = {};
      if (this.data.showProfileEntry !== show) patch.showProfileEntry = show;
      if (this.data.profileEntryEnabled !== enabled) patch.profileEntryEnabled = enabled;
      if (Object.keys(patch).length) this.setData(patch);
    },

    _syncRelationDisplay() {
      const statusRaw = String(this.data.relationStatus || '').trim();
      let status = 'none';
      if (statusRaw === 'none' || statusRaw === 'following' || statusRaw === 'friend') {
        status = statusRaw;
      } else if (this.data.followed) {
        status = 'following';
      }

      let label = String(this.data.relationshipLabel || '').trim();
      if (!label) {
        if (status === 'friend') label = '好友';
        else if (status === 'following') label = '已关注';
      }

      const isSelf = !!this.data.isSelf;
      const canFollow = this.data.canFollow !== false;
      const showRelationTag = !isSelf && !!label;
      const showFollowBtn = !isSelf && !label && canFollow && status === 'none';

      const patch = {};
      if (this.data.displayStatus !== status) patch.displayStatus = status;
      if (this.data.displayRelationLabel !== label) patch.displayRelationLabel = label;
      if (this.data.showFollowBtn !== showFollowBtn) patch.showFollowBtn = showFollowBtn;
      if (this.data.showRelationTag !== showRelationTag) patch.showRelationTag = showRelationTag;
      if (Object.keys(patch).length) this.setData(patch);
    },

    _syncAvatarBadge() {
      const mode = String(this.data.avatarBadge || 'auto').trim() || 'auto';
      const player = this.data.player || {};
      const logoMap = this.data.teamGroupLogoById || {};
      const badgeTeamId = String(player.badgeTeamId || '').trim();
      const teamLogo =
        badgeTeamId && logoMap[badgeTeamId]
          ? String(logoMap[badgeTeamId]).trim()
          : '';
      const badgeText = String(player.badgeText || '').trim();
      const badgeColor = String(player.badgeColor || '').trim();
      const flagCode = String(player.flag || '').trim();
      const flagSrc = flagCode
        ? 'https://flagcdn.com/w40/' + flagCode + '.png'
        : '';

      let showAvatarBadge = false;
      let avatarBadgeSrc = '';
      let avatarBadgeIsTeam = false;
      let avatarBadgeIsText = false;
      let avatarBadgeText = '';
      let avatarBadgeStyle = '';

      if (mode === 'none') {
        showAvatarBadge = false;
      } else if (mode === 'team') {
        if (teamLogo) {
          showAvatarBadge = true;
          avatarBadgeSrc = teamLogo;
          avatarBadgeIsTeam = true;
        } else if (badgeText) {
          // 分队无 LOGO：同尺寸文字角标（队际有 LOGO 时不会走到此分支）
          showAvatarBadge = true;
          avatarBadgeIsTeam = true;
          avatarBadgeIsText = true;
          avatarBadgeText = badgeText.length > 2 ? badgeText.slice(0, 2) : badgeText;
          avatarBadgeStyle = badgeColor ? 'background:' + badgeColor + ';' : '';
        }
      } else if (mode === 'flag') {
        if (flagSrc) {
          showAvatarBadge = true;
          avatarBadgeSrc = flagSrc;
          avatarBadgeIsTeam = false;
        }
      } else {
        // auto：保持原契约（LOGO → 国旗）；分队文字仅 team 模式
        if (teamLogo) {
          showAvatarBadge = true;
          avatarBadgeSrc = teamLogo;
          avatarBadgeIsTeam = true;
        } else if (flagSrc) {
          showAvatarBadge = true;
          avatarBadgeSrc = flagSrc;
          avatarBadgeIsTeam = false;
        }
      }

      const patch = {};
      if (this.data.showAvatarBadge !== showAvatarBadge) {
        patch.showAvatarBadge = showAvatarBadge;
      }
      if (this.data.avatarBadgeSrc !== avatarBadgeSrc) {
        patch.avatarBadgeSrc = avatarBadgeSrc;
      }
      if (this.data.avatarBadgeIsTeam !== avatarBadgeIsTeam) {
        patch.avatarBadgeIsTeam = avatarBadgeIsTeam;
      }
      if (this.data.avatarBadgeIsText !== avatarBadgeIsText) {
        patch.avatarBadgeIsText = avatarBadgeIsText;
      }
      if (this.data.avatarBadgeText !== avatarBadgeText) {
        patch.avatarBadgeText = avatarBadgeText;
      }
      if (this.data.avatarBadgeStyle !== avatarBadgeStyle) {
        patch.avatarBadgeStyle = avatarBadgeStyle;
      }
      if (Object.keys(patch).length) this.setData(patch);
    },

    /** LOGO 加载失败：仅替换展示 URL 为默认图，不写 match/storage */
    onAvatarBadgeError() {
      if (this.data.avatarBadgeIsText) return;
      const current = String(this.data.avatarBadgeSrc || '').trim();
      if (!current || current === DEFAULT_ORG_LOGO) return;
      this.setData({ avatarBadgeSrc: DEFAULT_ORG_LOGO });
    },

    onFollowTap(e) {
      if (this.data.followLoading || this.data.isSelf || !this.data.canFollow) return;
      const fromDetail = e && e.detail ? e.detail : {};
      const pid =
        String(fromDetail.userId || fromDetail.playerId || '').trim() ||
        String((this.data.player && this.data.player.playerId) || '').trim();
      if (!pid) return;
      this.triggerEvent('follow', {
        playerId: pid,
        userId: pid,
        player: this.data.player || {}
      });
    },

    /**
     * 昵称后进入按钮 → 球员资料页（页面负责路由；组件不跳转）。
     * catchtap 已阻冒泡，不触发展开/关注/reaction。
     * 无稳定身份时仍抛 profiletap（unavailable），由页面统一提示。
     */
    onProfileTap() {
      const player = this.data.player || {};
      const userId = this._resolveProfileUserId(player);
      const detail = {
        userId: userId,
        playerId: userId,
        unavailable: !userId,
        name: String(player.name || player.nickname || player.publicName || '').trim(),
        publicName: String(player.publicName || player.nickname || player.name || '').trim(),
        avatar: String(player.avatar || '').trim()
      };
      if (player.userType != null && String(player.userType).trim() !== '') {
        detail.userType = String(player.userType).trim();
      }
      if (player.identitySource != null && String(player.identitySource).trim() !== '') {
        detail.identitySource = String(player.identitySource).trim();
      }
      if (player.gender != null) detail.gender = player.gender;
      if (player.handicap != null) detail.handicap = player.handicap;
      if (player.floatCoef != null) detail.floatCoef = player.floatCoef;
      this.triggerEvent('profiletap', detail);
    }
  }
});
