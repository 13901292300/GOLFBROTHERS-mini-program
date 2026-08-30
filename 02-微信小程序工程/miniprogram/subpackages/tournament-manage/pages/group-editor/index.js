/**
 * 队内赛分组编辑页
 * 编辑 groupDraft / pairingDraft；确定后才写入正式 groups / pairings
 */
const { createHeaderStyle } = require('../../../../utils/headerEngine.js');
const teamMatchStore = require('../../../../utils/teamMatchStore.js');
const {
  isTeamMatchFamily,
  isInterTeamMatch
} = require('../../../../utils/teamMatchCapabilities.js');
const matchManageAccess = require('../../../../utils/matchManageAccess.js');
const playerManage = require('../../../../utils/playerManage.js');
const gameStore = require('../../../../utils/gameStore.js');
const mockAvatars = require('../../../../utils/mockAvatars.js');
const playerDirectory = require('../../../../utils/playerDirectory.js');
const tPosition = require('../../../../utils/tPosition.js');
const {
  validateStrokeEntities,
  validateGroupForTargetGameMode,
  buildRegisterTeamMap,
  isG5MatchPlayMode,
  isG6G7MatchPlayMode,
  isG8MatchPlayMode,
  isG2G3FamilyMode,
  isG4FamilyMode,
  validateG5MatchPlayPlayers,
  validateG6G7MatchPlayPlayers,
  validateG8MatchPlayPlayers
} = require('../../../../utils/strokeEntityValidator.js');
const { syncStrokeEntities } = require('../../../../utils/strokeEntityBuilder.js');
const { normalizeFormalGroupSeats } = require('../../../../utils/strokeGroupSeatNormalizer.js');

const tournamentGroupDraft = require('../../../../utils/tournament/tournamentGroupDraft.js');
const seriesStore = require('../../../../utils/seriesStore.js');
const seriesStationIndex = require('../../../../utils/seriesStationIndex.js');
const seriesGroupPickRoster = require('../../utils/seriesGroupPickRoster.js');
const seriesNoRepeatLineup = require('../../../../utils/seriesNoRepeatLineup.js');
const seriesLiveIdentityCorrection = require('../../utils/seriesLiveIdentityCorrection.js');
const teamMatchFinish = require('../../../../utils/teamMatchFinish.js');
const {
  PLAYER_SLOTS,
  DEFAULT_REGISTER_GROUPS,
  STROKE_ENTITY_INVALID_TIP,
  resolveSideUnitLabel,
  resolveScorePlayerId,
  withScorePlayerFields,
  createEmptyGroupPlayer,
  createEmptyGroup,
  buildRegisterPlayerLookup,
  hydrateDraftPlayers,
  cloneTournamentGroups,
  toFormalGroups,
  buildG4RegisterTeamMap,
  listG4TeamOrder,
  hasFormalGroups,
  buildInitialGroupDraft,
  resolvePlayerDisplayName,
  shouldShowAvatarTeamLabel,
  mapPlayersForCard,
  resolveRegisterInfo,
  buildRegisterTeamGroupMap,
  resolvePlayerTeamGroupId,
  listFilledPickPlayers,
  ensurePlayersHaveTeam,
  allMembersSameTeam,
  generatePairCompositionsByTeam,
  validateGeneratedCompositions,
  validateG2G3TwoPlusTwoPlayers,
  validateStrokeCompositionPlayers,
  validateG4GroupStructurePlayers,
  validatePlayersForRegisterGameMode,
  resolveRegisterTeamId,
  buildPreviewRegisterMaps,
  buildMatchPlayTeamPreview,
  buildCompositionPreview,
  buildG4CompositionPreviewFromSeats,
  resolveRegisterSubTabs,
  buildPairingSlotId,
  resolvePairingSlotNo,
  createEmptyPairing,
  buildAutoPairingsForGroup,
  applyLiveGroupsFromDraft,
  rematerializeLivePlayersAfterNormalize,
  rebindLiveScoreDataToSeatPlayers,
  collectConfirmGroupRejectMessages,
  isCoveredDraftStructureErr
} = tournamentGroupDraft;

// 页面方法内原调用 this._validateGroupDraft / _validatePairingDraft / _sanitizeGroupDraft
// 改为薄封装，语义与抽出前一致

const SERIES_LIVE_NO_CHANGE_MSG = '未检测到可保存的换人';
const SERIES_LIVE_GROUP_FINISHED_MSG = '当前分组已结束，无法修改';
const SERIES_LIVE_ROUND_CANCELLED_MSG = '本轮已取消，无法修改分组';
const SERIES_LIVE_SERIES_LOCKED_MSG = '系列赛已经结束。';
const SERIES_LIVE_STALE_MSG = '数据已被其他管理员更新，请重新确认';
const SERIES_LIVE_MANUAL_REVIEW_MSG = '保存状态需要管理员检查，请勿重复操作';
const SERIES_LIVE_SAVE_FAIL_RETRY_MSG = '保存时发生异常，请稍后重试';
const SERIES_LIVE_ROLLED_BACK_MSG = '保存时发生异常，请稍后重试';
const SERIES_LIVE_UPDATED_MSG = '分组已更新';
const SERIES_LIVE_DUPLICATE_MSG = '同一球员重复出现在多个位置';
const SERIES_LIVE_NOT_ON_ROSTER_MSG = '有球员未报名';
const SERIES_LIVE_AFFILIATION_MSG = '2+2 队伍组合不合法';
const SERIES_LIVE_OVER_CAPACITY_MSG = '分组人数不符合当前赛制';
const SERIES_LIVE_ROUND_ENDED_MSG = '场次或系列赛已结束';
const SERIES_LIVE_PERMISSION_MSG = '无管理权限';
const SERIES_LIVE_SEAT_SCORE_MSG = '位置成绩数据异常，无法安全保存';
const GROUP_SAVE_REJECT_TITLE = '分组无法保存';
const GROUP_SAVE_SYSTEM_FAIL_MSG = '保存时发生异常，请稍后重试';

function livePlayerIdOf(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw).trim();
  return String((raw.userId || raw.playerId || raw.id || '')).trim();
}

function isRegisteredRosterStatus(status) {
  const st = String(status || '').trim().toLowerCase();
  return !st || st === 'registered';
}

/** 兼容共享视图 triggerEvent(detail) 与旧 dataset */
function eventField(e, key) {
  if (e && e.detail && e.detail[key] != null && String(e.detail[key]).trim() !== '') {
    return e.detail[key];
  }
  var ds = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset : {};
  if (ds[key] != null) return ds[key];
  return '';
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    matchId: '',
    mode: 'create',
    headerTitle: '开始分组',
    gameMode: '',
    showPairingSection: false,
    showCompositionMode: false,
    /** G2/G3/G6/G7 组合预览；与 showCompositionMode（2+2/4+0 选择）分离 */
    showCompositionPreview: false,
    /** 非 G4：显示「自动组合 / 添加组合」；G4 由分队规则生成 pairing，不展示 */
    showPairingComposeTools: false,
    pairingSectionTitle: '组合',
    groupDraft: [],
    pairingDraft: {},
    draftCards: [],
    groupDeleteModalVisible: false,
    groupDeleteTargetId: '',
    groupDeleteTargetName: '',
    pairingEditVisible: false,
    editingPairingGroupId: '',
    editingPairingId: '',
    editingPairingSelectedIds: [],
    pairingEditTitle: '修改组合',
    pairingEditOptions: [],
    strokeCompositionMode: '2+2',
    saving: false
  },

  onLoad(options) {
    this._pageAlive = true;
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    const matchId = options && options.matchId ? decodeURIComponent(options.matchId) : '';
    const modeOpt = options && options.mode ? String(options.mode) : '';
    const fromSeriesRaw = options && options.fromSeries != null ? String(options.fromSeries) : '';
    this._fromSeries = fromSeriesRaw === '1' || fromSeriesRaw === 'true';
    this._seriesReturnMeta = {
      seriesId: options && options.seriesId != null
        ? decodeURIComponent(String(options.seriesId))
        : '',
      roundId: options && options.roundId != null
        ? decodeURIComponent(String(options.roundId))
        : ''
    };
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    if (match && teamMatchFinish.isMatchCompleted(match)) {
      wx.showToast({ title: teamMatchFinish.MATCH_FINISHED_TOAST, icon: 'none' });
      setTimeout(() => {
        wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/home/index' }) });
      }, 500);
      return;
    }
    if (match) {
      var seriesEnterGuard = teamMatchFinish.assertWritable(match);
      if (!seriesEnterGuard.ok && seriesEnterGuard.reason === 'series_completed') {
        wx.showToast({ title: seriesEnterGuard.message, icon: 'none' });
        setTimeout(() => {
          wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/home/index' }) });
        }, 500);
        return;
      }
    }
    if (match) {
      const user = gameStore.getCurrentUser() || {};
      const canEdit =
        matchManageAccess.hasMatchManagePermission(match, user, 'edit_groups') ||
        matchManageAccess.hasMatchManagePermission(match, user, 'manage_groups');
      if (!canEdit) {
        wx.showToast({ title: '暂无分组管理权限', icon: 'none' });
        setTimeout(() => {
          wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/home/index' }) });
        }, 500);
        return;
      }
    }
    const formalExists = hasFormalGroups(match);
    const mode = modeOpt === 'edit' || modeOpt === 'create' || modeOpt === 'live'
      ? modeOpt
      : (formalExists ? 'edit' : 'create');
    const gameMode = match && match.gameMode ? String(match.gameMode) : '';
    const matchType = match && match.matchType ? String(match.matchType) : 'team-internal';
    // G2/G3 比杆 + G6/G7 比洞 → 组合编辑器；G4 比杆 + G8 比洞 → G4 preview/pairing
    const isG2G3 = isG2G3FamilyMode(gameMode) || teamMatchStore.isPairingStrokeFormat(gameMode);
    const isG6G7 = isG6G7MatchPlayMode(gameMode);
    const isG4 = isG4FamilyMode(gameMode);
    // 仅 G2/G3 比杆显示「2+2 / 4+0」选择；G6/G7 复用编辑器但不复用该选择规则
    const showCompositionMode = isTeamMatchFamily(matchType) && isG2G3 && !isG6G7;
    // G2/G3/G6/G7：组合预览（G6/G7 无模式选择，预览按分队自动按 2+2 展示）
    const showCompositionPreview = isTeamMatchFamily(matchType) && isG2G3;
    // G4/G8 create/edit/live：统一报名期 UI（composition-preview）；不展示旧 pairing 编辑区
    // pairing 数据仍保留在 pairingDraft / 保存链路，仅隐藏编辑入口
    const showPairingSection = false;
    // G2/G3：已有 4+0 / 2+2 保持；G6/G7：不依赖用户选择，固定按双方分队结构 → 2+2
    const rawComposition =
      match && match.strokeCompositionMode != null && String(match.strokeCompositionMode).trim() !== ''
        ? String(match.strokeCompositionMode).trim()
        : '';
    const resolvedMode = isG6G7 ? '2+2' : (rawComposition === '4+0' ? '4+0' : '2+2');
    const draft = buildInitialGroupDraft(match);
    // G4 保留 pairingDraft，供保存时复用 slot id（不展示 pairing 操作区）
    const pairingDraft = isG4
      ? teamMatchStore.clonePairings(match && match.pairings)
      : {};
    this._matchSnapshot = match || null;
    this._leavingConfirmed = false;
    this._pairingIdSeq = 1;
    // Series：已报名名单读 series.roster（内存投影）；普通比赛仍读 match.registerInfo
    if (this._fromSeries) {
      const seriesLoaded = this._loadSeriesPickRegisterSource(matchId, match);
      if (!seriesLoaded) {
        return;
      }
    } else {
      this._registerInfo = resolveRegisterInfo(match);
      this._registerTeamMap = buildRegisterTeamGroupMap(this._registerInfo);
      this._registerSubTabs = resolveRegisterSubTabs(match, this._registerInfo);
    }
    this.setData({
      matchId: matchId,
      mode: mode,
      headerTitle: mode === 'create' ? '开始分组' : '修改分组',
      gameMode: gameMode,
      showPairingSection: showPairingSection,
      showCompositionMode: showCompositionMode,
      showCompositionPreview: showCompositionPreview,
      showPairingComposeTools: false,
      pairingSectionTitle: teamMatchStore.getPairingStrokeLabel(gameMode),
      strokeCompositionMode: resolvedMode,
      groupDraft: draft,
      pairingDraft: pairingDraft,
      draftCards: this._buildDraftCards(
        draft,
        pairingDraft,
        showPairingSection,
        gameMode,
        showCompositionPreview,
        resolvedMode
      )
    });
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
    if (this._fromSeries) {
      this._loadSeriesPickRegisterSource(this.data.matchId, this._matchSnapshot, { silentFail: true });
      this.setData({
        draftCards: this._buildDraftCards(
          this.data.groupDraft,
          this.data.pairingDraft,
          this.data.showPairingSection,
          this.data.gameMode,
          this.data.showCompositionPreview,
          this.data.strokeCompositionMode
        )
      });
    }
    this._applyGroupPickResultIfAny();
  },

  onUnload() {
    this._pageAlive = false;
  },

  /**
   * Series 分组：核验后投影 series.roster → 内存 registerInfo（不写 match.registerInfo）
   * @returns {boolean} 是否装载成功
   */
  _loadSeriesPickRegisterSource(matchId, match, options) {
    const opts = options || {};
    const meta = this._seriesReturnMeta || {};
    const seriesId = String(meta.seriesId || '').trim();
    const roundId = String(meta.roundId || '').trim();
    const mid = matchId != null ? String(matchId).trim() : '';
    const loaded = seriesGroupPickRoster.loadSeriesPickRegisterSource({
      fromSeries: 1,
      seriesId: seriesId,
      roundId: roundId,
      matchId: mid,
      match: match || (mid ? teamMatchStore.getMatchById(mid) : null),
      series: seriesId ? seriesStore.getSeriesById(seriesId) : null,
      getMatchById: function (id) {
        return teamMatchStore.getMatchById(id);
      },
      getIndexByMatchId: function (id) {
        return seriesStationIndex.getByMatchId(id);
      }
    });
    if (!loaded || !loaded.ok) {
      if (!opts.silentFail) {
        wx.showToast({
          title: (loaded && loaded.message) || '本轮比赛数据异常',
          icon: 'none'
        });
        setTimeout(() => {
          wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/home/index' }) });
        }, 500);
      }
      return false;
    }
    this._seriesForPick = loaded.series;
    this._registerInfo = loaded.registerInfo || { totalCount: 0, users: [] };
    this._registerTeamMap = buildRegisterTeamGroupMap(this._registerInfo);
    this._registerSubTabs = Array.isArray(loaded.registerSubTabs)
      ? loaded.registerSubTabs
      : resolveRegisterSubTabs(match || loaded.match, this._registerInfo);
    this._seriesPickEmptyText = loaded.emptyText || '暂无报名人员';
    this._noRepeatLock = loaded.noRepeat || { ok: true, enabled: false, playerIds: {} };
    return true;
  },

  _withNoRepeatSeatHint(player) {
    const pl = player && typeof player === 'object' ? player : {};
    const lock = this._noRepeatLock;
    if (!this._fromSeries || !lock || !lock.enabled) return pl;
    const occ = seriesNoRepeatLineup.lookupOccupancy(pl.userId || pl.playerId, lock);
    if (!occ) return pl;
    return Object.assign({}, pl, {
      noRepeatHint: seriesNoRepeatLineup.formatOccupiedHint(occ.label)
    });
  },

  applyTheme(theme) {
    this.setData({ themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode' });
  },

  initHeaderNav() {
    const header = createHeaderStyle();
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle
    });
  },

  /** 预览用 match 上下文：用当前 UI 的 strokeCompositionMode，不改写 store */
  _buildCompositionMatchContext(compositionMode) {
    const stored = this.data.matchId
      ? teamMatchStore.getMatchById(this.data.matchId)
      : null;
    const base = stored || this._matchSnapshot || {};
    const mode = compositionMode === '2+2' ? '2+2' : '4+0';
    return Object.assign({}, base, {
      gameMode: this.data.gameMode || base.gameMode || '',
      strokeCompositionMode: mode,
      registerInfo: this._registerInfo || base.registerInfo || { totalCount: 0, users: [] },
      teamGroups: Array.isArray(base.teamGroups) ? base.teamGroups : []
    });
  },

  _buildDraftCards(groups, pairingDraft, showPairing, gameMode, showCompositionPreviewFlag, strokeCompositionMode) {
    const title = teamMatchStore.getPairingStrokeLabel(gameMode || this.data.gameMode);
    const resolvedGameMode = String(gameMode || this.data.gameMode || '');
    const isG4 = isG4FamilyMode(resolvedGameMode);
    const isG5 = isG5MatchPlayMode(resolvedGameMode);
    const isG6G7 = isG6G7MatchPlayMode(resolvedGameMode);
    // 第 5 参：组合预览开关（G2/G3/G6/G7）；不再与「2+2/4+0 选择」绑死
    const showCompositionPreview = showCompositionPreviewFlag != null
      ? !!showCompositionPreviewFlag
      : !!this.data.showCompositionPreview;
    // G6/G7：不读用户 compositionMode，按双方分队结构固定 2+2 预览
    const compositionMode = isG6G7
      ? '2+2'
      : (strokeCompositionMode != null
        ? String(strokeCompositionMode)
        : String(this.data.strokeCompositionMode || ''));
    const matchLike = showCompositionPreview
      ? this._buildCompositionMatchContext(compositionMode)
      : null;
    const g5MatchLike = isG5
      ? {
          registerInfo: this._registerInfo || { totalCount: 0, users: [] },
          teamGroups: Array.isArray(this._matchSnapshot && this._matchSnapshot.teamGroups)
            ? this._matchSnapshot.teamGroups
            : []
        }
      : null;
    const teamGroups = Array.isArray(this._matchSnapshot && this._matchSnapshot.teamGroups)
      ? this._matchSnapshot.teamGroups
      : [];
    const showTeamLabel = shouldShowAvatarTeamLabel(this._matchSnapshot);
    const registerLookup = buildRegisterPlayerLookup(
      this._registerInfo || (this._matchSnapshot && this._matchSnapshot.registerInfo)
    );
    return (groups || []).map((g) => {
      const players = mapPlayersForCard(g.players, {
        teamGroups: teamGroups,
        registerLookup: registerLookup,
        showTeamLabel: showTeamLabel
      }).map((pl) => this._withNoRepeatSeatHint(pl));
      const card = {
        groupId: g.groupId,
        badge: g.groupName,
        players: players
      };
      if (showPairing) {
        card.pairingBlock = this._buildPairingBlockView(g, pairingDraft, title);
      }
      if (isG5 && g5MatchLike) {
        // G5：独立 1v1 分队行；不进 composition / pairings
        const lines = buildMatchPlayTeamPreview(g, g5MatchLike);
        if (lines && lines.length) card.matchPlayTeamPreview = lines;
      } else if (showCompositionPreview && matchLike) {
        const preview = buildCompositionPreview(matchLike, g);
        if (preview) card.compositionPreview = preview;
      } else if (isG4 && !showPairing) {
        // G4 报名/编辑：与 G2/G3 同款 composition-preview（座位+分队，只读）
        const preview = buildG4CompositionPreviewFromSeats(
          g,
          this._matchSnapshot,
          this._registerInfo
        );
        if (preview) card.compositionPreview = preview;
      }
      return card;
    });
  },

  _buildPairingBlockView(group, pairingDraft, sectionTitle) {
    const groupId = String(group.groupId || '');
    const isG4 = isG4FamilyMode(this.data.gameMode);
    const players = ((group && group.players) || []).filter((p) => p && String(p.userId || '').trim());
    const playerMap = {};
    players.forEach((p) => {
      playerMap[String(p.userId)] = p;
    });
    const teamIdByUser = isG4
      ? buildG4RegisterTeamMap({
          registerInfo: this._registerInfo || (this._matchSnapshot && this._matchSnapshot.registerInfo)
        })
      : {};
    const teamNameById = {};
    const sideUnit = resolveSideUnitLabel(this._matchSnapshot);
    if (isG4) {
      const match = this._matchSnapshot || {};
      const teamGroups = Array.isArray(match.teamGroups) ? match.teamGroups : [];
      teamGroups.forEach((g, index) => {
        const id = g && g.id != null ? String(g.id).trim() : '';
        if (!id) return;
        teamNameById[id] = String((g && g.name) || '').trim() || (sideUnit + (index + 1));
      });
      const users =
        (this._registerInfo && Array.isArray(this._registerInfo.users) && this._registerInfo.users)
        || (match.registerInfo && Array.isArray(match.registerInfo.users) && match.registerInfo.users)
        || [];
      users.forEach((u) => {
        if (!u) return;
        const tid =
          u.matchTeamId != null && String(u.matchTeamId).trim() !== ''
            ? String(u.matchTeamId).trim()
            : u.groupId != null && String(u.groupId).trim() !== ''
              ? String(u.groupId).trim()
              : '';
        const tname =
          (u.matchTeamName != null && String(u.matchTeamName).trim())
          || (u.groupName != null && String(u.groupName).trim())
          || '';
        if (tid && tname && !teamNameById[tid]) teamNameById[tid] = tname;
      });
    }
    const rawList = (pairingDraft && pairingDraft[groupId]) ? pairingDraft[groupId] : [];
    const pairings = rawList.map((pairing, idx) => {
      const ids = Array.isArray(pairing.playerIds) ? pairing.playerIds.map(String) : [];
      const members = ids.map((id) => {
        const p = playerMap[id];
        return {
          userId: id,
          name: resolvePlayerDisplayName(p) || id,
          avatar: p && p.avatar ? mockAvatars.resolveAvatar(p.avatar) : ''
        };
      });
      let label = '组合' + (idx + 1);
      let namesText = members.map((m) => m.name).filter(Boolean).join(' / ') || '暂无球员';
      if (isG4) {
        let teamLabel = '';
        for (let i = 0; i < ids.length; i++) {
          const tid = teamIdByUser[ids[i]] || '';
          if (tid && teamNameById[tid]) {
            teamLabel = teamNameById[tid];
            break;
          }
        }
        if (!teamLabel) teamLabel = sideUnit;
        // wxml 为 label + names 分行；label 带冒号以贴近「分队/球队：球员」
        label = teamLabel + '：';
        namesText = members.map((m) => m.name).filter(Boolean).join('、') || '暂无球员';
      }
      return {
        id: pairing.id || ('pairing_' + (idx + 1)),
        label: label,
        playerIds: ids,
        members: members,
        namesText: namesText,
        isEmpty: members.length === 0
      };
    });
    const paired = {};
    pairings.forEach((pr) => {
      (pr.playerIds || []).forEach((id) => { paired[id] = true; });
    });
    const incomplete = players
      .filter((p) => !paired[String(p.userId)])
      .map((p) => ({
        userId: String(p.userId),
        name: resolvePlayerDisplayName(p),
        avatar: p.avatar ? mockAvatars.resolveAvatar(p.avatar) : ''
      }));
    return {
      // G4：隐藏「四人两球组合」标题；其它赛制保持原 title
      title: isG4 ? '' : (sectionTitle || '组合'),
      pairings: pairings,
      incompletePlayers: incomplete,
      incompleteNamesText: incomplete.map((p) => p.name).filter(Boolean).join('、'),
      hasIncomplete: incomplete.length > 0
    };
  },

  _refreshCards() {
    this.setData({
      draftCards: this._buildDraftCards(
        this.data.groupDraft,
        this.data.pairingDraft,
        this.data.showPairingSection,
        this.data.gameMode
      )
    });
  },

  _setGroupDraft(draft, pairingDraft) {
    const nextGroups = cloneTournamentGroups(draft);
    let nextPairings = pairingDraft != null
      ? teamMatchStore.clonePairings(pairingDraft)
      : teamMatchStore.clonePairings(this.data.pairingDraft);
    const isG4 = isG4FamilyMode(this.data.gameMode);
    if (this.data.showPairingSection || isG4) {
      // G4/G8：无编辑区也 prune 保留 slot id，供保存 rebuild 复用
      nextPairings = this._prunePairingsToGroups(nextGroups, nextPairings);
    } else {
      nextPairings = {};
    }
    this.setData({
      groupDraft: nextGroups,
      pairingDraft: nextPairings,
      draftCards: this._buildDraftCards(
        nextGroups,
        nextPairings,
        this.data.showPairingSection,
        this.data.gameMode
      )
    });
  },

  _setPairingDraft(pairingDraft) {
    const next = teamMatchStore.clonePairings(pairingDraft);
    this.setData({
      pairingDraft: next,
      draftCards: this._buildDraftCards(
        this.data.groupDraft,
        next,
        this.data.showPairingSection,
        this.data.gameMode
      )
    });
  },

  /** 删除组或球员变更后，清理无效 pairings */
  _prunePairingsToGroups(groups, pairingDraft) {
    const next = {};
    const groupIds = {};
    (groups || []).forEach((g) => {
      const gid = String(g.groupId || '');
      groupIds[gid] = true;
      const validPlayers = {};
      ((g.players || [])).forEach((p) => {
        const id = p && p.userId ? String(p.userId).trim() : '';
        if (id) validPlayers[id] = true;
      });
      const list = (pairingDraft && pairingDraft[gid]) ? pairingDraft[gid] : [];
      next[gid] = list.map((pr) => ({
        id: pr.id,
        playerIds: (pr.playerIds || []).map(String).filter((id) => validPlayers[id])
      }));
    });
    // 丢弃已删除组的 pairings
    Object.keys(pairingDraft || {}).forEach((gid) => {
      if (!groupIds[gid]) return;
    });
    return next;
  },

  onStrokeCompositionModeTap(e) {
    if (!this.data.showCompositionMode) return;
    const mode = String(eventField(e, 'mode') || '');
    if (mode !== '4+0' && mode !== '2+2') return;
    if (mode === this.data.strokeCompositionMode) return;
    this.setData({ strokeCompositionMode: mode }, () => {
      this._refreshCards();
    });
  },

  onAddGroup() {
    const draft = (this.data.groupDraft || []).slice();
    draft.push(createEmptyGroup(draft.length));
    this._setGroupDraft(draft);
  },

  onDeleteGroupTap(e) {
    const groupId = String(eventField(e, 'groupId') || '');
    const groupName = String(eventField(e, 'groupName') || '');
    if (!groupId) return;
    this.setData({
      groupDeleteModalVisible: true,
      groupDeleteTargetId: groupId,
      groupDeleteTargetName: groupName || '该组'
    });
  },

  closeGroupDeleteModal() {
    this.setData({
      groupDeleteModalVisible: false,
      groupDeleteTargetId: '',
      groupDeleteTargetName: ''
    });
  },

  confirmDeleteGroup() {
    const targetId = String(this.data.groupDeleteTargetId || '');
    if (!targetId) {
      this.closeGroupDeleteModal();
      return;
    }
    const next = (this.data.groupDraft || [])
      .filter((g) => String(g && g.groupId) !== targetId)
      .map((g, index) => Object.assign({}, g, {
        groupName: '第' + (index + 1) + '组'
      }));
    const pairingDraft = teamMatchStore.clonePairings(this.data.pairingDraft);
    delete pairingDraft[targetId];
    this._setGroupDraft(next, pairingDraft);
    this.setData({
      groupDeleteModalVisible: false,
      groupDeleteTargetId: '',
      groupDeleteTargetName: ''
    });
  },

  onGroupCardTap(e) {
    const groupId = String(eventField(e, 'groupId') || '');
    const groupName = String(eventField(e, 'groupName') || '');
    if (!groupId) return;
    const draft = this.data.groupDraft || [];
    const currentGroup = draft.find((g) => String(g.groupId) === groupId) || null;
    const app = getApp();
    app.globalData = app.globalData || {};
    app.globalData.tournamentGroupPickResult = null;
    app.globalData.tournamentGroupPickPayload = {
      matchId: this.data.matchId || '',
      groupId: groupId,
      groupName: groupName,
      gameMode: this.data.gameMode || '',
      // G6/G7：固定 2+2，且不开启 G2/G3 的 4+0 选人分队锁
      strokeCompositionMode: isG6G7MatchPlayMode(this.data.gameMode)
        ? '2+2'
        : (this.data.strokeCompositionMode === '2+2' ? '2+2' : '4+0'),
      showCompositionMode: !!this.data.showCompositionMode,
      players: currentGroup && Array.isArray(currentGroup.players) ? currentGroup.players : [],
      groups: draft.map((g) => ({
        groupId: g && g.groupId ? String(g.groupId) : '',
        groupName: g && g.groupName ? String(g.groupName) : '',
        players: Array.isArray(g && g.players)
          ? g.players.map((p) => ({
            userId: p && p.userId ? String(p.userId) : '',
            position: Number(p && p.position) || 0
          }))
          : []
      })),
      registerInfo: this._registerInfo || { totalCount: 0, users: [] },
      registerSubTabs: this._registerSubTabs || [],
      fromSeries: !!this._fromSeries,
      seriesId: (this._seriesReturnMeta && this._seriesReturnMeta.seriesId) || '',
      roundId: (this._seriesReturnMeta && this._seriesReturnMeta.roundId) || '',
      emptyRosterText: this._fromSeries
        ? (this._seriesPickEmptyText || '暂无报名人员')
        : '暂无可选球员'
    };
    var pickUrl =
      '/subpackages/tournament-manage/pages/group-pick/index?matchId=' +
      encodeURIComponent(this.data.matchId || '') +
      '&groupId=' +
      encodeURIComponent(groupId) +
      '&groupName=' +
      encodeURIComponent(groupName);
    if (this._fromSeries) {
      pickUrl +=
        '&fromSeries=1&seriesId=' +
        encodeURIComponent((this._seriesReturnMeta && this._seriesReturnMeta.seriesId) || '') +
        '&roundId=' +
        encodeURIComponent((this._seriesReturnMeta && this._seriesReturnMeta.roundId) || '');
    }
    wx.navigateTo({ url: pickUrl });
  },

  _applyGroupPickResultIfAny() {
    const app = getApp();
    const result = app && app.globalData ? app.globalData.tournamentGroupPickResult : null;
    if (!result || !result.groupId) return;
    if (app && app.globalData) app.globalData.tournamentGroupPickResult = null;

    const draft = (this.data.groupDraft || []).slice();
    const idx = draft.findIndex((g) => String(g.groupId) === String(result.groupId));
    if (idx < 0) return;

    const lookup = buildRegisterPlayerLookup(this._registerInfo || { users: [] });
    const previousPlayers = Array.isArray(draft[idx] && draft[idx].players) ? draft[idx].players : [];
    const previousByPosition = {};
    previousPlayers.forEach((player) => {
      const position = Number(player && player.position) || 0;
      if (position) previousByPosition[position] = player;
    });
    const players = Array.from({ length: PLAYER_SLOTS }, (_, i) => {
      const position = i + 1;
      const previous = previousByPosition[position] || null;
      const found = Array.isArray(result.players)
        ? result.players.find((p) => Number(p && p.position) === position)
        : null;
      if (!found || !found.userId) {
        return createEmptyGroupPlayer(position, previous);
      }
      const userId = String(found.userId);
      const src = lookup[userId] || {};
      const gender = found.gender || src.gender || playerDirectory.getGenderById(userId, '');
      const tee = tPosition.resolve({
        tPosition: found.tPosition,
        tee: found.tee,
        gender: gender
      });
      return withScorePlayerFields({
        position: position,
        userId: userId,
        avatar: found.avatar || src.avatar || '',
        displayName: found.displayName
          || found.competitionName
          || src.displayName
          || '',
        gender: gender,
        tee: tee,
        tPosition: tee,
        matchTeamId: found.matchTeamId || src.matchTeamId || '',
        groupId: found.groupId || src.groupId || '',
        matchTeamName: found.matchTeamName || src.matchTeamName || '',
        groupName: found.groupName || src.groupName || '',
        seriesParticipantId: found.seriesParticipantId || src.seriesParticipantId || '',
        affiliationId:
          found.affiliationId ||
          src.affiliationId ||
          found.matchTeamId ||
          src.matchTeamId ||
          '',
        participantNameSnapshot:
          found.participantNameSnapshot ||
          src.participantNameSnapshot ||
          found.nameSnapshot ||
          src.nameSnapshot ||
          '',
        participantShortNameSnapshot:
          found.participantShortNameSnapshot ||
          src.participantShortNameSnapshot ||
          found.shortNameSnapshot ||
          src.shortNameSnapshot ||
          '',
        participantColorSnapshot:
          found.participantColorSnapshot ||
          src.participantColorSnapshot ||
          found.colorSnapshot ||
          src.colorSnapshot ||
          '',
        fromSeriesRoster: !!(found.fromSeriesRoster || src.fromSeriesRoster)
      }, previous || found);
    });

    draft[idx] = Object.assign({}, draft[idx], {
      groupName: result.groupName || draft[idx].groupName,
      players: players
    });
    this._setGroupDraft(draft);
  },

  /* ===== 组合分配 ===== */

  onAutoPairTap(e) {
    if (!this.data.showPairingSection || !this.data.showPairingComposeTools) return;
    const groupId = String(eventField(e, 'groupId') || '');
    if (!groupId) return;
    const existing = (this.data.pairingDraft && this.data.pairingDraft[groupId]) || [];
    if (existing.length > 0) {
      wx.showModal({
        title: '提示',
        content: '当前组已有组合，自动组合将覆盖当前组合，是否继续？',
        confirmText: '继续',
        cancelText: '取消',
        success: (res) => {
          if (!res.confirm) return;
          this._applyAutoPair(groupId);
        }
      });
      return;
    }
    this._applyAutoPair(groupId);
  },

  _applyAutoPair(groupId) {
    const group = (this.data.groupDraft || []).find((g) => String(g.groupId) === String(groupId));
    if (!group) return;
    const pairingDraft = teamMatchStore.clonePairings(this.data.pairingDraft);
    const existing = (pairingDraft[String(groupId)] || []).slice();
    const list = buildAutoPairingsForGroup(group, this.data.matchId, existing);
    pairingDraft[String(groupId)] = list;
    this._setPairingDraft(pairingDraft);
  },

  onAddPairingTap(e) {
    if (!this.data.showPairingSection || !this.data.showPairingComposeTools) return;
    const groupId = String(eventField(e, 'groupId') || '');
    if (!groupId) return;
    const pairingDraft = teamMatchStore.clonePairings(this.data.pairingDraft);
    const list = (pairingDraft[groupId] || []).slice();
    const usedSlots = {};
    list.forEach((pr, idx) => {
      const slotNo = resolvePairingSlotNo(pr && pr.id, idx);
      usedSlots[slotNo] = true;
    });
    // 优先占用已有空成绩行（playerIds=[]）；否则取最小缺失 slot（最多 slot1/slot2）
    const emptyIdx = list.findIndex(
      (pr) => pr && (!Array.isArray(pr.playerIds) || pr.playerIds.filter(Boolean).length === 0)
    );
    if (emptyIdx >= 0) {
      wx.showToast({ title: '请先使用空闲组合位', icon: 'none' });
      return;
    }
    let nextSlot = 0;
    for (let n = 1; n <= 2; n++) {
      if (!usedSlots[n]) {
        nextSlot = n;
        break;
      }
    }
    if (!nextSlot) {
      wx.showToast({ title: '最多两个组合', icon: 'none' });
      return;
    }
    list.push(createEmptyPairing(this.data.matchId, groupId, nextSlot));
    // 按 slot 序号排列，保证第一组合=slot1、第二组合=slot2
    list.sort(
      (a, b) =>
        resolvePairingSlotNo(a && a.id, 0) - resolvePairingSlotNo(b && b.id, 0)
    );
    pairingDraft[groupId] = list;
    this._setPairingDraft(pairingDraft);
  },

  onDeletePairingTap(e) {
    if (!this.data.showPairingSection) return;
    const groupId = String(eventField(e, 'groupId') || '');
    const pairingId = String(eventField(e, 'pairingId') || '');
    if (!groupId || !pairingId) return;
    const pairingDraft = teamMatchStore.clonePairings(this.data.pairingDraft);
    // 删除成员：清空 playerIds，保留稳定 slot id（不删槽位对象）
    pairingDraft[groupId] = (pairingDraft[groupId] || []).map((p) => {
      if (!p || String(p.id) !== pairingId) return p;
      return Object.assign({}, p, { playerIds: [] });
    });
    this._setPairingDraft(pairingDraft);
  },

  /* ===== 组合分配：修改组合弹窗 ===== */

  /**
   * 其它组合占用表（排除当前正在编辑的组合）
   * disabled 只允许来自这里，绝不能来自当前组合原始 playerIds / selectedIds
   */
  _getOtherPairingsOccupiedMap(groupId, editingPairingId) {
    const occupied = {};
    const list = (this.data.pairingDraft && this.data.pairingDraft[groupId]) || [];
    list.forEach((pr, idx) => {
      if (!pr || String(pr.id) === String(editingPairingId)) return;
      const label = '组合' + (idx + 1);
      (pr.playerIds || []).forEach((id) => {
        const uid = String(id || '').trim();
        if (uid) occupied[uid] = label;
      });
    });
    return occupied;
  },

  /**
   * 根据弹窗临时 selectedIds + 其它组合占用，重建列表
   * checked / disabled 完全解耦
   */
  _buildPairingPlayerOptions(groupId, editingPairingId, selectedIds) {
    const group = (this.data.groupDraft || []).find((g) => String(g.groupId) === String(groupId));
    if (!group) return [];
    const selectedSet = {};
    (selectedIds || []).forEach((id) => {
      const uid = String(id || '').trim();
      if (uid) selectedSet[uid] = true;
    });
    const occupiedByOther = this._getOtherPairingsOccupiedMap(groupId, editingPairingId);

    return ((group.players || []).filter((p) => p && p.userId)).map((p, index) => {
      const uid = String(p.userId);
      const occupiedLabel = occupiedByOther[uid] || '';
      const checked = !!selectedSet[uid];
      // disabled 只看其它组合；与 checked、当前组合原始 playerIds 无关
      const disabled = !!occupiedLabel;
      return {
        index: index,
        userId: uid,
        name: resolvePlayerDisplayName(p),
        avatar: p.avatar ? mockAvatars.resolveAvatar(p.avatar) : '',
        checked: checked,
        disabled: disabled,
        occupiedTip: occupiedLabel ? ('已在' + occupiedLabel) : ''
      };
    });
  },

  onEditPairingTap(e) {
    if (!this.data.showPairingSection) return;
    const groupId = String(eventField(e, 'groupId') || '');
    const pairingId = String(eventField(e, 'pairingId') || '');
    if (!groupId || !pairingId) return;
    const list = (this.data.pairingDraft && this.data.pairingDraft[groupId]) || [];
    const current = list.find((p) => String(p.id) === pairingId) || { playerIds: [] };
    // 打开时：仅用当前组合 playerIds 初始化临时选中；之后不再读 current.playerIds
    const selectedIds = (current.playerIds || []).map((id) => String(id || '').trim()).filter(Boolean);
    const options = this._buildPairingPlayerOptions(groupId, pairingId, selectedIds);
    this.setData({
      pairingEditVisible: true,
      editingPairingGroupId: groupId,
      editingPairingId: pairingId,
      editingPairingSelectedIds: selectedIds,
      pairingEditTitle: '修改组合',
      pairingEditOptions: options
    });
  },

  onTogglePairingEditPlayer(e) {
    const groupId = this.data.editingPairingGroupId;
    const pairingId = this.data.editingPairingId;
    if (!groupId || !pairingId) return;

    const index = Number(e.currentTarget.dataset.index);
    const opt = (this.data.pairingEditOptions || [])[index];
    if (!opt) return;
    // disabled 球员不可点
    if (opt.disabled) return;

    const userId = String(opt.userId || '');
    if (!userId) return;

    // 再次确认：仅其它组合占用才拦截（不看当前组合）
    const occupiedByOther = this._getOtherPairingsOccupiedMap(groupId, pairingId);
    if (occupiedByOther[userId]) return;

    const beforeSelectedIds = (this.data.editingPairingSelectedIds || []).map(String);
    const exists = beforeSelectedIds.indexOf(userId) >= 0;
    const afterSelectedIds = exists
      ? beforeSelectedIds.filter((id) => id !== userId)
      : beforeSelectedIds.concat([userId]);

    // 先更新临时选中，再整表重建 —— checked/disabled 重新计算
    const options = this._buildPairingPlayerOptions(groupId, pairingId, afterSelectedIds);
    this.setData({
      editingPairingSelectedIds: afterSelectedIds,
      pairingEditOptions: options
    });
  },

  closePairingEditSheet() {
    this.setData({
      pairingEditVisible: false,
      editingPairingGroupId: '',
      editingPairingId: '',
      editingPairingSelectedIds: [],
      pairingEditOptions: []
    });
  },

  confirmPairingEdit() {
    const groupId = this.data.editingPairingGroupId;
    const pairingId = this.data.editingPairingId;
    if (!groupId || !pairingId) {
      this.closePairingEditSheet();
      return;
    }
    // 以弹窗临时 selectedIds 为准；过滤掉仍被其它组合占用的异常项
    const occupiedByOther = this._getOtherPairingsOccupiedMap(groupId, pairingId);
    const selectedIds = (this.data.editingPairingSelectedIds || [])
      .map((id) => String(id || '').trim())
      .filter((id) => id && !occupiedByOther[id]);

    const pairingDraft = teamMatchStore.clonePairings(this.data.pairingDraft);
    const list = (pairingDraft[groupId] || []).slice();
    const idx = list.findIndex((p) => String(p.id) === String(pairingId));
    if (idx < 0) {
      this.closePairingEditSheet();
      return;
    }
    list[idx] = Object.assign({}, list[idx], { playerIds: selectedIds });
    pairingDraft[groupId] = list;
    this._setPairingDraft(pairingDraft);
    this.closePairingEditSheet();
  },

  /** 去掉空组：空分组不写入正式 groups */
  _sanitizeGroupDraft(draft) {
    return tournamentGroupDraft.sanitizeGroupDraft(draft);
  },

  /**
   * 确定分组校验：
   * - 组内/跨组球员不重复
   * - 组合内球员不跨组合重复
   * - 允许未完成组合、允许 1 人组合、允许部分报名未入组
   */
  _validateGroupDraft(draft, pairingDraft) {
    return tournamentGroupDraft.validateGroupDraft(draft, pairingDraft, {
      gameMode: this.data.gameMode,
      strokeCompositionMode: this.data.strokeCompositionMode,
      showCompositionMode: !!this.data.showCompositionMode,
      showPairingSection: !!this.data.showPairingSection,
      registerInfo: this._registerInfo || { users: [] },
      matchLike: this._matchSnapshot,
      sideUnit: resolveSideUnitLabel(this._matchSnapshot)
    });
  },

  _validatePairingDraft(groups, pairingDraft) {
    return tournamentGroupDraft.validatePairingDraft(groups, pairingDraft);
  },

  _confirmGroupRejectOptions() {
    return {
      gameMode: this.data.gameMode,
      strokeCompositionMode: this.data.strokeCompositionMode,
      showCompositionMode: !!this.data.showCompositionMode,
      registerInfo: this._registerInfo || { users: [] },
      sideUnit: resolveSideUnitLabel(this._matchSnapshot)
    };
  },

  _collectConfirmGroupRejectMessages(rawDraft) {
    return collectConfirmGroupRejectMessages(rawDraft, this._confirmGroupRejectOptions());
  },

  _isGroupStructureRejectCode(code) {
    const c = String(code || '');
    return (
      c.indexOf('2_2') >= 0 ||
      c.indexOf('4_0') >= 0 ||
      c.indexOf('4+0') >= 0 ||
      c === 'affiliation' ||
      c === 'affiliation_mismatch' ||
      c.indexOf('illegal_split') >= 0 ||
      c.indexOf('g4_player_count') >= 0 ||
      c.indexOf('g4_illegal') >= 0 ||
      c.indexOf('empty_group') >= 0 ||
      c.indexOf('player_count') >= 0 ||
      c.indexOf('g5') >= 0
    );
  },

  _showStrokeRejectWithGroupContext(reason, fallback) {
    const scoped = this._collectConfirmGroupRejectMessages(this.data.groupDraft);
    if (scoped.length) {
      this._showGroupSaveRejectModal(scoped, reason);
      return;
    }
    this._showGroupSaveRejectModal(this._mapStrokeRejectMessage(reason, fallback), reason);
  },

  _normalizeGroupSaveRejectMessage(raw) {
    const t = String(raw || '').trim();
    if (!t) return '';
    if (t.indexOf('不符合2+2分组规则') >= 0) return t;
    if (t.indexOf('：4+0 组合不合法') >= 0) return t;
    if (t.indexOf('：分组人数不符合当前赛制') >= 0) return t;
    if (t.indexOf('：存在未填的必要位置') >= 0) return t;
    const c = t;
    if (
      c === 'player_not_on_roster' ||
      t.indexOf('不在系列赛名单') >= 0 ||
      t.indexOf('未报名') >= 0 ||
      t.indexOf('未归属') >= 0 ||
      t.indexOf('请先完成报名') >= 0
    ) {
      return '有球员未报名';
    }
    if (
      c === 'duplicate' ||
      c === 'incoming_already_in_round' ||
      t.indexOf('重复球员') >= 0 ||
      t.indexOf('球员重复') >= 0
    ) {
      return '同一球员重复出现在多个位置';
    }
    if (t.indexOf('2+2') >= 0 || c === 'affiliation' || c === 'affiliation_mismatch') {
      return '2+2 队伍组合不合法';
    }
    if (t.indexOf('4+0') >= 0 || t.indexOf('4_0') >= 0 || c === '4_0_multi_team') {
      return '4+0 组合不合法';
    }
    if (
      t.indexOf('必须有且只有') >= 0 ||
      t.indexOf('未填') >= 0 ||
      c === 'empty_group'
    ) {
      return '存在未填的必要位置';
    }
    if (
      c === 'player_count' ||
      c === 'group_over_capacity' ||
      c === 'player_addition' ||
      c === 'player_removal' ||
      t.indexOf('人数超过') >= 0 ||
      t.indexOf('人数超限') >= 0 ||
      t.indexOf('每组最多') >= 0 ||
      t.indexOf('赛制要求') >= 0
    ) {
      return '分组人数不符合当前赛制';
    }
    if (
      c === 'match_completed' ||
      c === 'group_finished' ||
      c === 'station_not_live' ||
      c === 'series_locked' ||
      c === 'round_cancelled' ||
      t.indexOf('已结束') >= 0 ||
      t.indexOf('已经结束') >= 0 ||
      t.indexOf('已取消') >= 0
    ) {
      return '场次或系列赛已结束';
    }
    if (
      c === 'revision_conflict' ||
      c === 'stale_confirmation' ||
      c === 'confirmation_fingerprint_conflict' ||
      c === 'payload_conflict' ||
      t.indexOf('其他管理员') >= 0
    ) {
      return '数据已被其他管理员更新，请重新确认';
    }
    if (
      c === 'seat_score_moved' ||
      c === 'seat_anchor_damaged' ||
      t.indexOf('位置成绩') >= 0
    ) {
      return '位置成绩数据异常，无法安全保存';
    }
    if (c === 'permission_denied' || t.indexOf('权限') >= 0) {
      return '无管理权限';
    }
    if (
      c === 'save_failed' ||
      c === 'restore_failed' ||
      c === 'flow_prepare_failed' ||
      t.indexOf('保存失败') >= 0
    ) {
      return GROUP_SAVE_SYSTEM_FAIL_MSG;
    }
    if (/^[a-z0-9_]+$/i.test(t) && t.indexOf(' ') < 0) {
      return GROUP_SAVE_SYSTEM_FAIL_MSG;
    }
    return t;
  },

  _mapStrokeRejectMessage(reason, fallback) {
    const r = String(reason || '');
    if (r.indexOf('2_2') >= 0 || r.indexOf('g2g3') >= 0 || r.indexOf('illegal_split') >= 0) {
      return '2+2 队伍组合不合法';
    }
    if (r.indexOf('4_0') >= 0 || r.indexOf('4+0') >= 0) {
      return '4+0 组合不合法';
    }
    if (r.indexOf('player_missing') >= 0 || r.indexOf('player_not_on_roster') >= 0) {
      return '有球员未报名';
    }
    if (r.indexOf('g5') >= 0 || r.indexOf('player_count') >= 0) {
      return '分组人数不符合当前赛制';
    }
    return this._normalizeGroupSaveRejectMessage(fallback || STROKE_ENTITY_INVALID_TIP);
  },

  _showGroupSaveRejectModal(messages, debugCode) {
    const list = Array.isArray(messages)
      ? messages.filter(function (m) {
          return String(m || '').trim();
        })
      : [String(messages || '').trim()];
    const unique = [];
    const seen = {};
    list.forEach((item) => {
      const mapped = this._normalizeGroupSaveRejectMessage(item);
      if (!mapped || seen[mapped]) return;
      seen[mapped] = true;
      unique.push(mapped);
    });
    if (debugCode) {
      console.warn('[group-save-reject]', debugCode, unique);
    }
    this.setData({ saving: false });
    const content = unique.length ? unique.join('\n') : GROUP_SAVE_SYSTEM_FAIL_MSG;
    wx.showModal({
      title: GROUP_SAVE_REJECT_TITLE,
      content: content,
      showCancel: false,
      confirmText: '知道了'
    });
  },

  _collectGroupSaveRejectIssues(rawDraft, pairingDraft, match) {
    const issues = [];
    if (!match) {
      issues.push(GROUP_SAVE_SYSTEM_FAIL_MSG);
      return issues;
    }
    const user = gameStore.getCurrentUser() || {};
    const canEdit =
      matchManageAccess.hasMatchManagePermission(match, user, 'edit_groups') ||
      matchManageAccess.hasMatchManagePermission(match, user, 'manage_groups');
    if (!canEdit) issues.push('无管理权限');
    const finishedGuard = teamMatchFinish.assertWritable(match);
    if (!finishedGuard.ok) {
      issues.push('场次或系列赛已结束');
    }
    const perGroup = this._collectConfirmGroupRejectMessages(rawDraft);
    perGroup.forEach((msg) => issues.push(msg));
    const draftErr = this._validateGroupDraft(rawDraft, pairingDraft);
    if (draftErr && !(perGroup.length && isCoveredDraftStructureErr(draftErr))) {
      issues.push(draftErr);
    }
    if (this._fromSeries) {
      const sanitizedForLock = this._sanitizeGroupDraft(rawDraft);
      const ids = seriesNoRepeatLineup.collectDraftMemberIds(sanitizedForLock, pairingDraft);
      const seriesId = (this._seriesReturnMeta && this._seriesReturnMeta.seriesId) || '';
      const check = seriesNoRepeatLineup.assertPlayersNotOccupied(ids, {
        fromSeries: true,
        seriesId: seriesId,
        series: (seriesId ? seriesStore.getSeriesById(seriesId) : null) || this._seriesForPick,
        currentRoundId: (this._seriesReturnMeta && this._seriesReturnMeta.roundId) || '',
        getMatchById: function (id) {
          return teamMatchStore.getMatchById(id);
        },
        getIndexByMatchId: function (id) {
          return seriesStationIndex.getByMatchId(id);
        }
      });
      if (!check.ok) {
        issues.push(check.message || '有球员未报名');
      }
    }
    const rosterUsers =
      (this._registerInfo && Array.isArray(this._registerInfo.users) && this._registerInfo.users) ||
      (match.registerInfo && Array.isArray(match.registerInfo.users) && match.registerInfo.users) ||
      [];
    const rosterSet = {};
    rosterUsers.forEach((u) => {
      const id = String((u && (u.userId || u.playerId)) || '').trim();
      if (id) rosterSet[id] = true;
    });
    if (Object.keys(rosterSet).length) {
      const groups = Array.isArray(rawDraft) ? rawDraft : [];
      for (let gi = 0; gi < groups.length; gi++) {
        const players = Array.isArray(groups[gi] && groups[gi].players) ? groups[gi].players : [];
        for (let pi = 0; pi < players.length; pi++) {
          const id = String((players[pi] && players[pi].userId) || '').trim();
          if (id && !rosterSet[id]) {
            issues.push('有球员未报名');
            gi = groups.length;
            break;
          }
        }
      }
    }
    if (
      this._matchSnapshot &&
      match &&
      this._matchSnapshot.updatedAt != null &&
      match.updatedAt != null &&
      String(this._matchSnapshot.updatedAt) !== String(match.updatedAt)
    ) {
      issues.push('数据已被其他管理员更新，请重新确认');
    }
    return issues;
  },


  _clearGroupDerivedFields(matchPatch) {
    const next = matchPatch || {};
    next.pairings = {};
    // 清空分组：成绩行保留 entityId，members 置空；不删 teamScoresByEntity / scoreData
    const se =
      next.scoreEntities && typeof next.scoreEntities === 'object' && !Array.isArray(next.scoreEntities)
        ? next.scoreEntities
        : null;
    if (se) {
      const cleared = {};
      Object.keys(se).forEach((groupId) => {
        const list = Array.isArray(se[groupId]) ? se[groupId] : [];
        cleared[groupId] = list
          .filter((e) => e && e.entityId != null && String(e.entityId).trim() !== '')
          .map((e) =>
            Object.assign({}, e, {
              entityId: String(e.entityId).trim(),
              members: [],
              teamGroupId: ''
            })
          );
      });
      next.scoreEntities = cleared;
    }
    if (Object.prototype.hasOwnProperty.call(next, 'groupCount')) next.groupCount = 0;
    if (Object.prototype.hasOwnProperty.call(next, 'teeGroups')) next.teeGroups = [];
    if (Object.prototype.hasOwnProperty.call(next, 'groupSummary')) next.groupSummary = null;
    if (Object.prototype.hasOwnProperty.call(next, 'pairingMap')) next.pairingMap = {};
    return next;
  },

  _validateLiveGroupDraft(draft) {
    const groups = Array.isArray(draft) ? draft : [];
    const seen = {};
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i] || {};
      const players = Array.isArray(g.players) ? g.players : [];
      const localSeen = {};
      for (let j = 0; j < players.length; j++) {
        const id = String((players[j] && players[j].userId) || '').trim();
        if (!id) continue;
        if (localSeen[id]) return '同一分组内存在重复球员';
        localSeen[id] = true;
        if (seen[id]) return '存在重复球员，请检查分组';
        seen[id] = true;
      }
    }
    return '';
  },

  _findPlayerEntryByPosition(group, position) {
    return tournamentGroupDraft.findPlayerEntryByPosition(group, position);
  },

  _buildLivePlayerEntry(oldEntry, draftEntry, position) {
    return tournamentGroupDraft.buildLivePlayerEntry(oldEntry, draftEntry, position);
  },

  _buildLiveGroupFromDraft(oldGroup, draftGroup, index) {
    return tournamentGroupDraft.buildLiveGroupFromDraft(oldGroup, draftGroup, index);
  },

  /**
   * 按座位把洞成绩留在原位置，球员身份（含 scorePlayerId）改为当前正确球员。
   */
  _rematerializeLivePlayersAfterNormalize(normalizedGroups, liveGroupsBefore) {
    return rematerializeLivePlayersAfterNormalize(normalizedGroups, liveGroupsBefore);
  },

  _persistLiveMatchWithReadback(next, previousMatch) {
    const prev = previousMatch;
    try {
      teamMatchStore.saveMatch(next);
    } catch (eSave) {
      return { ok: false, reason: 'save_failed' };
    }
    const mid = next && next.matchId != null ? String(next.matchId).trim() : '';
    const read = mid ? teamMatchStore.getMatchById(mid) : null;
    if (!read) {
      try {
        teamMatchStore.saveMatch(prev);
      } catch (e1) {
        /* ignore */
      }
      return { ok: false, reason: 'save_failed' };
    }
    return { ok: true, match: read };
  },

  /**
   * LIVE：从最新 Match + sanitized draft 生成校验前候选（不写盘、不改 UI）。
   * pairingDraft 与 _confirmLiveGroups 第三参一致，缺省读 this.data.pairingDraft。
   */
  _buildLiveCandidateBase(latestMatch, sanitizedDraft, pairingDraft) {
    const match = latestMatch && typeof latestMatch === 'object' ? latestMatch : {};
    const sanitized = Array.isArray(sanitizedDraft) ? sanitizedDraft : [];
    const oldGroups = Array.isArray(match.groups) ? match.groups : [];
    const isClear = sanitized.length === 0;
    const oldById = {};
    oldGroups.forEach((group) => {
      const groupId = group && group.groupId ? String(group.groupId) : '';
      if (groupId) oldById[groupId] = group;
    });
    const draftIds = {};
    sanitized.forEach((group) => {
      const groupId = group && group.groupId ? String(group.groupId) : '';
      if (groupId) draftIds[groupId] = true;
    });
    const deletedGroupIds = Object.keys(oldById).filter((groupId) => !draftIds[groupId]);

    // 按座位合并：数值留在座位，userId/playerId/scorePlayerId 均为当前正确球员
    let nextGroups = rematerializeLivePlayersAfterNormalize(
      applyLiveGroupsFromDraft(oldGroups, sanitized),
      oldGroups
    );

    const nextScoreData = rebindLiveScoreDataToSeatPlayers(
      oldGroups,
      nextGroups,
      match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
        ? Object.assign({}, match.scoreData)
        : {}
    );
    deletedGroupIds.forEach((groupId) => {
      delete nextScoreData[groupId];
    });

    const matchId = match.matchId != null ? String(match.matchId).trim() : '';
    const gameMode = String(match.gameMode || this.data.gameMode || '');
    const isG4Stroke = isG4FamilyMode(gameMode);

    // LIVE 位置不动：不再 normalizeFormalGroupSeats（会按分队重排座位并带动成绩）

    // 与报名一致：G4/G8 按座位重建 pairings（复用 slot id）
    const shouldPersistPairings = this.data.showPairingSection || isG4Stroke;
    let nextPairings = {};
    if (!isClear && shouldPersistPairings) {
      if (isG4Stroke) {
        const matchPairings =
          match.pairings && typeof match.pairings === 'object' && !Array.isArray(match.pairings)
            ? match.pairings
            : {};
        const draftSource = pairingDraft != null ? pairingDraft : (this.data.pairingDraft || {});
        const rebuilt = {};
        nextGroups.forEach((group) => {
          const gid = group && group.groupId != null ? String(group.groupId) : '';
          if (!gid) return;
          const fromDraft = draftSource && Object.prototype.hasOwnProperty.call(draftSource, gid)
            ? draftSource[gid]
            : null;
          const existingList = Array.isArray(fromDraft)
            ? fromDraft
            : (Array.isArray(matchPairings[gid]) ? matchPairings[gid] : []);
          rebuilt[gid] = buildAutoPairingsForGroup(group, matchId, existingList);
        });
        nextPairings = teamMatchStore.sanitizePairings(rebuilt);
      } else {
        const pairingSource = this.data.showPairingSection
          ? (pairingDraft != null ? pairingDraft : (this.data.pairingDraft || {}))
          : (match.pairings || {});
        let draftPairings = teamMatchStore.clonePairings(pairingSource);
        deletedGroupIds.forEach((groupId) => {
          delete draftPairings[groupId];
        });
        nextPairings = teamMatchStore.sanitizePairings(
          this._prunePairingsToGroups(nextGroups, draftPairings)
        );
      }
    }

    let next = Object.assign({}, match, {
      groups: nextGroups,
      pairings: isClear ? {} : (shouldPersistPairings ? nextPairings : {}),
      scoreData: nextScoreData,
      updatedAt: Date.now()
    });
    const persistedStroke =
      match.strokeCompositionMode != null && String(match.strokeCompositionMode).trim() !== ''
        ? match.strokeCompositionMode
        : '';
    if (persistedStroke) {
      next.strokeCompositionMode = persistedStroke;
    } else if (this.data.showCompositionMode) {
      next.strokeCompositionMode = this.data.strokeCompositionMode === '2+2' ? '2+2' : '4+0';
    } else if (isG6G7MatchPlayMode(gameMode) && !isClear) {
      // G6/G7：不依赖用户选择；双方分队结构对应 2+2 Entity 切分
      next.strokeCompositionMode = '2+2';
    }
    if (isClear) {
      next = this._clearGroupDerivedFields(next);
    } else if (!shouldPersistPairings) {
      next.pairings = {};
    }

    // Series：补齐 registerInfo 后与普通共用 validateStrokeEntities（不另设 2+2/4+0 门闩）
    return this._withSeriesRegisterInfoForSave(next);
  },

  /**
   * LIVE：校验 + sync stroke entities。成功返回最终候选；失败不写盘。
   */
  _finalizeLiveCandidate(baseCandidate) {
    const next = baseCandidate && typeof baseCandidate === 'object'
      ? Object.assign({}, baseCandidate)
      : {};
    const check = validateStrokeEntities(next);
    if (!check || check.valid !== true) {
      return {
        ok: false,
        valid: false,
        reason: (check && check.reason) || 'invalid',
        message: STROKE_ENTITY_INVALID_TIP,
        check: check
      };
    }
    next.scoreEntities = syncStrokeEntities(next);
    return { ok: true, valid: true, candidate: next };
  },

  _seriesLivePlayerId(raw) {
    return livePlayerIdOf(raw);
  },

  _findEditedLiveGroupId(beforeMatch, sanitizedDraft) {
    const before = Array.isArray(beforeMatch && beforeMatch.groups) ? beforeMatch.groups : [];
    const after = Array.isArray(sanitizedDraft) ? sanitizedDraft : [];
    const beforeById = {};
    before.forEach((g) => {
      const gid = g && g.groupId != null ? String(g.groupId).trim() : '';
      if (gid) beforeById[gid] = g;
    });
    const changed = [];
    after.forEach((g) => {
      const gid = g && g.groupId != null ? String(g.groupId).trim() : '';
      if (!gid) return;
      const old = beforeById[gid];
      const oldPlayers = old && Array.isArray(old.players) ? old.players : [];
      const newPlayers = g && Array.isArray(g.players) ? g.players : [];
      const oldMap = {};
      oldPlayers.forEach((p) => {
        const pos = Number(p && (p.position != null ? p.position : p.slotIndex)) || 0;
        if (pos) oldMap[pos] = this._seriesLivePlayerId(p);
      });
      let diff = false;
      newPlayers.forEach((p) => {
        const pos = Number(p && (p.position != null ? p.position : p.slotIndex)) || 0;
        if (!pos) return;
        const nid = this._seriesLivePlayerId(p);
        if ((oldMap[pos] || '') !== nid) diff = true;
      });
      if (oldPlayers.length !== newPlayers.length) diff = true;
      if (diff) changed.push(gid);
    });
    if (changed.length === 1) return changed[0];
    if (before.length === 1 && before[0] && before[0].groupId) {
      return String(before[0].groupId).trim();
    }
    return changed[0] || '';
  },

  _resolveSeriesLiveIncomingPlayer(latestMatch, series, sanitizedDraft) {
    const before = Array.isArray(latestMatch && latestMatch.groups) ? latestMatch.groups : [];
    const after = Array.isArray(sanitizedDraft) ? sanitizedDraft : [];
    const beforeById = {};
    before.forEach((g) => {
      const gid = g && g.groupId != null ? String(g.groupId).trim() : '';
      if (gid) beforeById[gid] = g;
    });
    const incomingIds = [];
    after.forEach((g) => {
      const gid = g && g.groupId != null ? String(g.groupId).trim() : '';
      const oldPlayers = ((beforeById[gid] && beforeById[gid].players) || []);
      const oldMap = {};
      oldPlayers.forEach((p) => {
        const pos = Number(p && (p.position != null ? p.position : p.slotIndex)) || 0;
        if (pos) oldMap[pos] = this._seriesLivePlayerId(p);
      });
      (Array.isArray(g && g.players) ? g.players : []).forEach((p) => {
        const pos = Number(p && (p.position != null ? p.position : p.slotIndex)) || 0;
        const nid = this._seriesLivePlayerId(p);
        const oid = oldMap[pos] || '';
        if (nid && nid !== oid) incomingIds.push(nid);
      });
    });
    const unique = [];
    const seen = {};
    incomingIds.forEach((id) => {
      if (!id || seen[id]) return;
      seen[id] = true;
      unique.push(id);
    });
    const incomingId = unique.length === 1 ? unique[0] : '';
    if (!incomingId) return null;
    const roster = series && Array.isArray(series.roster) ? series.roster : [];
    const rows = roster.filter((row) => {
      const pid = this._seriesLivePlayerId(row);
      return pid === incomingId && isRegisteredRosterStatus(row && row.registrationStatus);
    });
    if (rows.length !== 1) return null;
    const row = rows[0];
    const draftHit = (function findDraft() {
      for (let i = 0; i < after.length; i++) {
        const players = Array.isArray(after[i] && after[i].players) ? after[i].players : [];
        for (let j = 0; j < players.length; j++) {
          if (livePlayerIdOf(players[j]) === incomingId) return players[j];
        }
      }
      return null;
    })();
    return Object.assign({}, row || {}, {
      userId: incomingId,
      playerId: incomingId,
      id: incomingId,
      displayName:
        (row && (row.playerNameSnapshot || row.displayName)) ||
        (draftHit && draftHit.displayName) ||
        incomingId,
      seriesParticipantId: row && row.seriesParticipantId,
      registrationStatus: row && row.registrationStatus
    });
  },

  _reloadSeriesLiveReplaceContext(sanitizedDraft) {
    const matchId = String((this.data && this.data.matchId) || '').trim();
    const latestMatch = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const matchCtx =
      latestMatch && latestMatch.seriesContext && typeof latestMatch.seriesContext === 'object'
        ? latestMatch.seriesContext
        : {};
    const indexRow = matchId ? seriesStationIndex.getByMatchId(matchId) : null;
    const seriesId = String(
      (indexRow && indexRow.seriesId) || matchCtx.seriesId || ''
    ).trim();
    const series = seriesId ? seriesStore.getSeriesById(seriesId) : null;
    const roundId = String(
      (indexRow && indexRow.roundId) || matchCtx.roundId || ''
    ).trim();
    const publishToken = String(
      matchCtx.publishToken || (series && series.publishToken) || ''
    ).trim();
    const rounds = series && Array.isArray(series.rounds) ? series.rounds : [];
    let round = null;
    for (let i = 0; i < rounds.length; i++) {
      if (String((rounds[i] && rounds[i].roundId) || '').trim() === roundId) {
        round = rounds[i];
        break;
      }
    }
    const stationIndex = {
      seriesId: seriesId,
      roundId: roundId,
      matchId: String((indexRow && indexRow.matchId) || matchCtx.matchId || (latestMatch && latestMatch.matchId) || matchId).trim(),
      publishToken: publishToken
    };
    const incomingPlayer = this._resolveSeriesLiveIncomingPlayer(
      latestMatch,
      series,
      sanitizedDraft
    );
    const currentUser = gameStore.getCurrentUser() || {};
    return {
      series: series,
      latestSeries: series,
      currentSeries: series,
      match: latestMatch,
      latestMatch: latestMatch,
      currentMatch: latestMatch,
      beforeMatch: latestMatch,
      stationIndex: stationIndex,
      incomingPlayer: incomingPlayer,
      currentUser: currentUser,
      editedGroupId: this._findEditedLiveGroupId(latestMatch, sanitizedDraft),
      getMatchById: function (id) {
        return teamMatchStore.getMatchById(id);
      }
    };
  },

  _buildSeriesLiveCandidateFromLatestMatch(latestMatch, currentDraft, pairingDraft) {
    const sanitized = Array.isArray(currentDraft) ? currentDraft : [];
    const pairings =
      pairingDraft != null
        ? pairingDraft
        : (this._seriesLivePendingPairings != null
          ? this._seriesLivePendingPairings
          : (this.data && this.data.pairingDraft) || {});
    const base = this._buildLiveCandidateBase(latestMatch, sanitized, pairings);
    const finalized = this._finalizeLiveCandidate(base);
    const candidate = finalized && finalized.ok && finalized.candidate ? finalized.candidate : base;
    this._seriesLiveLastCandidate = candidate;
    return candidate;
  },

  _validateSeriesLiveCandidate(payload) {
    const src = payload && typeof payload === 'object' ? payload : {};
    const matchId = String((this.data && this.data.matchId) || '').trim();
    const latest = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const fromCandidate =
      src.candidateMatch && typeof src.candidateMatch === 'object'
        ? src.candidateMatch
        : this._seriesLiveLastCandidate && typeof this._seriesLiveLastCandidate === 'object'
          ? this._seriesLiveLastCandidate
          : src;
    const trial = Object.assign({}, latest || {}, fromCandidate || {});
    delete trial.series;
    delete trial.candidateMatch;
    delete trial.kind;
    delete trial.affiliationId;
    delete trial.playerId;
    delete trial.target;
    if (src.groups != null) trial.groups = src.groups;
    if (src.pairings != null) trial.pairings = src.pairings;
    if (fromCandidate && fromCandidate.strokeCompositionMode != null) {
      trial.strokeCompositionMode = fromCandidate.strokeCompositionMode;
    } else if (src.strokeCompositionMode != null) {
      trial.strokeCompositionMode = src.strokeCompositionMode;
    }
    if (fromCandidate && fromCandidate.registerInfo != null) trial.registerInfo = fromCandidate.registerInfo;
    if (fromCandidate && fromCandidate.scoreEntities != null) trial.scoreEntities = fromCandidate.scoreEntities;
    if (fromCandidate && fromCandidate.scoreData != null) trial.scoreData = fromCandidate.scoreData;
    if (fromCandidate && fromCandidate.teamScores != null) trial.teamScores = fromCandidate.teamScores;
    if (fromCandidate && fromCandidate.teamScoresByEntity != null) {
      trial.teamScoresByEntity = fromCandidate.teamScoresByEntity;
    }
    if (fromCandidate && fromCandidate.gameMode != null) trial.gameMode = fromCandidate.gameMode;
    if (src.series && src.series.publishToken && trial.seriesContext) {
      trial.seriesContext = Object.assign({}, trial.seriesContext);
    }
    const stroke = validateStrokeEntities(trial);
    if (!stroke || stroke.valid !== true) {
      return {
        ok: false,
        valid: false,
        reason: (stroke && stroke.reason) || 'invalid',
        message: STROKE_ENTITY_INVALID_TIP
      };
    }
    const gameMode = String(trial.gameMode || (this.data && this.data.gameMode) || '');
    const groups = Array.isArray(trial.groups) ? trial.groups : [];
    for (let i = 0; i < groups.length; i++) {
      const gCheck = validateGroupForTargetGameMode(gameMode, groups[i], trial);
      if (!gCheck || gCheck.valid !== true) {
        return {
          ok: false,
          valid: false,
          reason: (gCheck && gCheck.reason) || 'invalid',
          message: STROKE_ENTITY_INVALID_TIP
        };
      }
    }
    return { ok: true, valid: true };
  },

  _mapSeriesLiveRejectMessage(code) {
    const c = String(code || '').trim();
    if (this._isGroupStructureRejectCode(c)) {
      const scoped = this._collectConfirmGroupRejectMessages(
        (this.data && this.data.groupDraft) || []
      );
      if (scoped.length === 1) return scoped[0];
      if (scoped.length > 1) return scoped;
    }
    if (c === 'incoming_already_in_round' || c === 'duplicate') return SERIES_LIVE_DUPLICATE_MSG;
    if (c === 'player_not_on_roster') return SERIES_LIVE_NOT_ON_ROSTER_MSG;
    if (c === 'affiliation_mismatch' || c === 'affiliation') return SERIES_LIVE_AFFILIATION_MSG;
    if (
      c === 'player_addition' ||
      c === 'player_removal' ||
      c === 'group_over_capacity' ||
      c === 'player_count'
    ) {
      return SERIES_LIVE_OVER_CAPACITY_MSG;
    }
    if (c === 'no_live_group_change') return SERIES_LIVE_NO_CHANGE_MSG;
    if (c === 'group_finished' || c === 'match_completed' || c === 'station_not_live') {
      return c === 'group_finished' ? SERIES_LIVE_GROUP_FINISHED_MSG : SERIES_LIVE_ROUND_ENDED_MSG;
    }
    if (c === 'round_cancelled') return SERIES_LIVE_ROUND_CANCELLED_MSG;
    if (c === 'series_locked') return SERIES_LIVE_SERIES_LOCKED_MSG;
    if (c === 'permission_denied') return SERIES_LIVE_PERMISSION_MSG;
    if (
      c === 'revision_conflict' ||
      c === 'stale_confirmation' ||
      c === 'confirmation_fingerprint_conflict' ||
      c === 'payload_conflict'
    ) {
      return SERIES_LIVE_STALE_MSG;
    }
    if (c === 'seat_score_moved' || c === 'seat_anchor_damaged') {
      return SERIES_LIVE_SEAT_SCORE_MSG;
    }
    if (c === 'save_failed' || c === 'restore_failed' || c === 'flow_prepare_failed') {
      return SERIES_LIVE_ROLLED_BACK_MSG;
    }
    const mapped = this._normalizeGroupSaveRejectMessage(c);
    if (mapped && mapped !== c) return mapped;
    return SERIES_LIVE_SAVE_FAIL_RETRY_MSG;
  },

  _hasSeriesLiveManagePermission(info) {
    const src = info && typeof info === 'object' ? info : {};
    const match = src.match;
    const user = src.user || gameStore.getCurrentUser() || {};
    const perm = src.permission || 'edit_groups';
    return (
      matchManageAccess.hasMatchManagePermission(match, user, perm) ||
      matchManageAccess.hasMatchManagePermission(match, user, 'manage_groups')
    );
  },

  _executeSeriesLiveIdentityCorrection(input) {
    return seriesLiveIdentityCorrection.executeSeriesLiveIdentityCorrection(input);
  },

  _buildSeriesLiveIdentityCorrectionInput(sanitized, pairingDraft) {
    const self = this;
    const draft = Array.isArray(sanitized) ? sanitized : [];
    const pairings = pairingDraft != null ? pairingDraft : {};
    this._seriesLivePendingSanitized = draft;
    this._seriesLivePendingPairings = pairings;
    return {
      currentDraft: draft,
      expectedRevision: '',
      reloadContext: function () {
        return self._reloadSeriesLiveReplaceContext(draft);
      },
      buildCandidateFromLatestMatch: function (latestMatch, currentDraft) {
        return self._buildSeriesLiveCandidateFromLatestMatch(
          latestMatch,
          currentDraft != null ? currentDraft : draft,
          pairings
        );
      },
      validateCandidate: function (payload) {
        const extra = payload && typeof payload === 'object' ? payload : {};
        return self._validateSeriesLiveCandidate(
          Object.assign(
            {},
            extra,
            extra.candidateMatch || self._seriesLiveLastCandidate
              ? { candidateMatch: extra.candidateMatch || self._seriesLiveLastCandidate }
              : {}
          )
        );
      },
      persistMatch: function (next, previousMatch) {
        return self._persistLiveMatchWithReadback(next, previousMatch);
      },
      getMatchById: function (id) {
        return teamMatchStore.getMatchById(id);
      },
      getSeriesById: function (id) {
        return seriesStore.getSeriesById(id);
      },
      currentUser: gameStore.getCurrentUser() || {},
      hasManagePermission: function (info) {
        return self._hasSeriesLiveManagePermission(info);
      }
    };
  },

  _seriesLivePageAlive() {
    return this._pageAlive !== false;
  },

  _handleSeriesLiveFlowResult(result, session) {
    if (!this._seriesLivePageAlive()) return;
    const out = result && typeof result === 'object' ? result : {};
    const status = String(out.status || '');
    if (status === 'completed') {
      this.setData({ saving: false });
      this._leavingConfirmed = true;
      this._touchSeriesReturnContext();
      wx.showToast({ title: SERIES_LIVE_UPDATED_MSG, icon: 'success' });
      setTimeout(() => {
        if (!this._seriesLivePageAlive()) return;
        wx.navigateBack({ delta: 1 });
      }, 400);
      return;
    }
    if (status === 'failed_before_write') {
      this._showGroupSaveRejectModal(GROUP_SAVE_SYSTEM_FAIL_MSG, out.code || status);
      return;
    }
    if (status === 'failed_rolled_back') {
      this._showGroupSaveRejectModal(GROUP_SAVE_SYSTEM_FAIL_MSG, out.code || status);
      return;
    }
    if (status === 'manual_review' || status === 'retry_not_safe') {
      this.setData({ saving: false });
      wx.showModal({
        title: GROUP_SAVE_REJECT_TITLE,
        content: SERIES_LIVE_MANUAL_REVIEW_MSG,
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }
    this._showGroupSaveRejectModal(
      this._mapSeriesLiveRejectMessage(out.code || out.status),
      out.code || out.status
    );
  },

  _runSeriesLiveIdentityCorrection(sanitized, pairingDraft) {
    const ctxPreview = this._reloadSeriesLiveReplaceContext(sanitized);
    const input = this._buildSeriesLiveIdentityCorrectionInput(sanitized, pairingDraft);
    input.currentUser = ctxPreview.currentUser || input.currentUser;
    input.expectedRevision = String((ctxPreview.match && ctxPreview.match.updatedAt) || input.expectedRevision || '');
    let result;
    try {
      result = this._executeSeriesLiveIdentityCorrection(input);
    } catch (eRun) {
      result = { ok: false, status: 'failed_before_write', code: 'flow_prepare_failed' };
      this._handleSeriesLiveFlowResult(result);
      return result;
    }
    this._handleSeriesLiveFlowResult(result);
    return result;
  },

  _confirmLiveGroups(match, rawDraft, pairingDraft) {
    const sanitized = this._sanitizeGroupDraft(rawDraft);
    const isClear = sanitized.length === 0;

    let next = this._buildLiveCandidateBase(match, sanitized, pairingDraft);

    // 与报名一致：stroke entity 校验 + sync（不碰 teamScoresByEntity）
    if (!isClear) {
      const finalized = this._finalizeLiveCandidate(next);
      if (!finalized.ok) {
        console.warn('[stroke-entity-validate]', finalized.reason || 'invalid');
        this._showStrokeRejectWithGroupContext(
          finalized.reason,
          finalized.message
        );
        return;
      }
      next = finalized.candidate;
    }

    if (this._fromSeries === true && this.data.mode === 'live') {
      this._runSeriesLiveIdentityCorrection(sanitized, pairingDraft);
      return;
    }

    const persisted = this._persistLiveMatchWithReadback(next, match);
    if (!persisted.ok) {
      this._showGroupSaveRejectModal(GROUP_SAVE_SYSTEM_FAIL_MSG, persisted.reason);
      return;
    }

    this._leavingConfirmed = true;
    this._touchSeriesReturnContext();
    wx.showToast({ title: isClear ? '分组已清空' : '分组已保存', icon: 'success' });
    setTimeout(() => {
      wx.navigateBack({ delta: 1 });
    }, 400);
  },

  /** Series 入口：返回前刷新来源标记，供 series-detail onShow 恢复赛程 TAB/轮次 */
  _touchSeriesReturnContext() {
    if (!this._fromSeries) return;
    const meta = this._seriesReturnMeta || {};
    const seriesId = String(meta.seriesId || '').trim();
    const roundId = String(meta.roundId || '').trim();
    if (!seriesId) return;
    let prev = null;
    try {
      if (typeof wx !== 'undefined' && typeof wx.getStorageSync === 'function') {
        prev = wx.getStorageSync('gb_series_group_editor_return_v1');
      }
    } catch (eGet) {
      prev = null;
    }
    const next = Object.assign({}, prev && typeof prev === 'object' ? prev : {}, {
      seriesId: seriesId,
      roundId: roundId || (prev && prev.roundId) || '',
      activeTab: 'schedule',
      scheduleSelectedKey: roundId || (prev && prev.scheduleSelectedKey) || ''
    });
    try {
      if (typeof wx !== 'undefined' && typeof wx.setStorageSync === 'function') {
        wx.setStorageSync('gb_series_group_editor_return_v1', next);
      }
    } catch (eSet) {
      /* ignore */
    }
  },

  onCancel() {
    this._leavingConfirmed = true;
    this._touchSeriesReturnContext();
    wx.navigateBack({ delta: 1 });
  },

  onBack() {
    this.onCancel();
  },

  onConfirm() {
    if (this.data.saving) return;
    const rawDraft = Array.isArray(this.data.groupDraft) ? this.data.groupDraft : [];
    const pairingDraft = this.data.pairingDraft || {};
    const matchId = this.data.matchId || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const issues = this._collectGroupSaveRejectIssues(rawDraft, pairingDraft, match);
    if (issues.length) {
      this._showGroupSaveRejectModal(issues, 'confirm_validate');
      return;
    }
    this.setData({ saving: true });
    if (this.data.mode === 'live') {
      this._confirmLiveGroups(match, rawDraft, pairingDraft);
      return;
    }
    const sanitized = this._sanitizeGroupDraft(rawDraft);
    const isClear = sanitized.length === 0;
    // 正式 groups：position + userId + tPosition + Series 归属快照（见 toFormalGroups）
    // 按 groupId 合并保留已有出发信息（teeTime / startHole）
    const teeSheetManage = require('../../../../utils/teeSheetManage.js');
    let formal = isClear ? [] : toFormalGroups(sanitized);
    if (!isClear) {
      formal = teeSheetManage.mergeTeeFieldsByGroupId(match.groups, formal);
    }

    const gameMode = String(match.gameMode || this.data.gameMode || '');
    const isG4Stroke = isG4FamilyMode(gameMode);
    const isG2G3Stroke = isG2G3FamilyMode(gameMode);
    const isG5MatchPlay = isG5MatchPlayMode(gameMode);
    // 报名保存：统一正式座位规范化（position ≠ 选人顺序）；不碰 pairing / entity / score
    // G5：复用现有 normalizeFormalGroupSeats，不进 composition / pairings
    if (!isClear && (isG4Stroke || isG2G3Stroke || isG5MatchPlay)) {
      formal = normalizeFormalGroupSeats(formal, match);
    }
    // G4/G8 成绩主体来自 pairings；即使 UI 组合区未开，保存时仍保留/写入 pairings
    const shouldPersistPairings = this.data.showPairingSection || isG4Stroke;

    let formalPairings = {};
    if (!isClear && shouldPersistPairings) {
      if (isG4Stroke) {
        // normalize 后按座位重建 pairing，复用已有 slot id（draft 优先，否则 match）
        const matchPairings =
          match.pairings && typeof match.pairings === 'object' && !Array.isArray(match.pairings)
            ? match.pairings
            : {};
        const rebuilt = {};
        formal.forEach((group) => {
          const gid = group && group.groupId != null ? String(group.groupId) : '';
          if (!gid) return;
          const fromDraft = pairingDraft && Object.prototype.hasOwnProperty.call(pairingDraft, gid)
            ? pairingDraft[gid]
            : null;
          const existingList = Array.isArray(fromDraft)
            ? fromDraft
            : (Array.isArray(matchPairings[gid]) ? matchPairings[gid] : []);
          rebuilt[gid] = buildAutoPairingsForGroup(group, matchId, existingList);
        });
        formalPairings = teamMatchStore.sanitizePairings(rebuilt);
      } else {
        const pairingSource = this.data.showPairingSection
          ? pairingDraft
          : (match.pairings || {});
        const pruned = this._prunePairingsToGroups(formal, pairingSource);
        formalPairings = teamMatchStore.sanitizePairings(pruned);
      }
    }

    let next = Object.assign({}, match, {
      groups: formal,
      pairings: isClear ? {} : (shouldPersistPairings ? formalPairings : {}),
      updatedAt: Date.now()
    });
    if (this.data.showCompositionMode) {
      next.strokeCompositionMode = this.data.strokeCompositionMode === '2+2' ? '2+2' : '4+0';
    } else if (isG6G7MatchPlayMode(gameMode) && !isClear) {
      // G6/G7：不依赖用户选择；双方分队结构对应 2+2 Entity 切分
      next.strokeCompositionMode = '2+2';
    }
    if (isClear) {
      next = this._clearGroupDerivedFields(next);
    } else if (!shouldPersistPairings) {
      next.pairings = {};
    }

    // Series：补齐 registerInfo 后与普通共用 validateStrokeEntities（不另设 2+2/4+0 门闩）
    next = this._withSeriesRegisterInfoForSave(next);

    // 报名期：合并成绩行（已有 entityId 只更新 members；新增主体才新建；不清 teamScoresByEntity）
    if (!isClear) {
      const check = validateStrokeEntities(next);
      if (!check || check.valid !== true) {
        console.warn('[stroke-entity-validate]', check && check.reason ? check.reason : 'invalid');
        this._showStrokeRejectWithGroupContext(
          check && check.reason,
          STROKE_ENTITY_INVALID_TIP
        );
        return;
      }
      next.scoreEntities = syncStrokeEntities(next);
    }

    teamMatchStore.saveMatch(next);
    this._leavingConfirmed = true;
    this._touchSeriesReturnContext();
    wx.showToast({
      title: isClear ? '分组已清空' : '分组已保存',
      icon: 'success'
    });
    setTimeout(() => {
      wx.navigateBack({ delta: 1 });
    }, 400);
  },

  /**
   * Series fromSeries：把选人用的内存 registerInfo 并入待保存 match（不写 series.roster）
   * 使 validateStrokeEntities / syncStrokeEntities 与普通队际赛共用同一 teamMap 口径
   */
  _withSeriesRegisterInfoForSave(nextMatch) {
    if (!this._fromSeries || !this._registerInfo) return nextMatch;
    const next = nextMatch && typeof nextMatch === 'object' ? nextMatch : {};
    const synUsers =
      this._registerInfo && Array.isArray(this._registerInfo.users)
        ? this._registerInfo.users
        : [];
    if (!synUsers.length) return next;
    const existing =
      next.registerInfo && Array.isArray(next.registerInfo.users)
        ? next.registerInfo.users
        : [];
    const byId = {};
    const merged = [];
    existing.forEach((u) => {
      const id = u && u.userId != null ? String(u.userId).trim() : '';
      if (!id || byId[id]) return;
      byId[id] = true;
      merged.push(Object.assign({}, u));
    });
    synUsers.forEach((s) => {
      const id = s && s.userId != null ? String(s.userId).trim() : '';
      if (!id) return;
      if (byId[id]) {
        const idx = merged.findIndex(
          (u) => u && String(u.userId || '').trim() === id
        );
        if (idx >= 0) {
          merged[idx] = Object.assign({}, merged[idx], {
            matchTeamId:
              (s.matchTeamId != null && String(s.matchTeamId).trim()) ||
              merged[idx].matchTeamId,
            groupId:
              (s.groupId != null && String(s.groupId).trim()) ||
              merged[idx].groupId,
            seriesParticipantId:
              (s.seriesParticipantId != null &&
                String(s.seriesParticipantId).trim()) ||
              merged[idx].seriesParticipantId,
            matchTeamName:
              (s.matchTeamName != null && String(s.matchTeamName).trim()) ||
              merged[idx].matchTeamName,
            competitionName:
              (s.competitionName != null && String(s.competitionName).trim()) ||
              merged[idx].competitionName,
            displayName:
              (s.displayName != null && String(s.displayName).trim()) ||
              merged[idx].displayName
          });
        }
        return;
      }
      byId[id] = true;
      merged.push(Object.assign({}, s));
    });
    next.registerInfo = {
      totalCount: merged.length,
      users: merged
    };
    return next;
  },

  stopPropagation() {}
});
