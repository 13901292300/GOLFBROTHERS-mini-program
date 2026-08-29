const { createHeaderStyle } = require('../../../../../utils/headerEngine.js');
const teamDirectory = require('../../../../../utils/teamDirectory.js');
const mockAvatars = require('../../../../../utils/mockAvatars.js');
const {
  TEAM_SELECT_MODES,
  normalizeTeamSelectMode,
  isMultiParticipantSelectMode,
  isEventOrgSelectMode
} = require('../../../../../utils/teamSelectModes.js');

const NAME_MAX = 30;
const SLOGAN_MAX = 50;
const DESC_MAX = 500;
const SHORT_NAME_MAX = teamDirectory.SHORT_NAME_MAX || 4;

function charLen(s) {
  return teamDirectory.charLength ? teamDirectory.charLength(s) : Array.from(String(s || '')).length;
}

function sliceChars(s, max) {
  return teamDirectory.sliceChars
    ? teamDirectory.sliceChars(s, max)
    : Array.from(String(s || '')).slice(0, max).join('');
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',

    /** list | create */
    mode: 'list',
    /** TEAM_SELECT_MODES */
    selectMode: TEAM_SELECT_MODES.TEAM,
    isEventOrgMode: false,
    isParticipantMode: false,
    pageEyebrow: 'TEAM',
    pageTitle: '选择球队',
    createTitle: '创建球队',
    listSectionTitle: '全部球队',
    listSectionNote: '选择一个球队',
    searchPlaceholder: '搜索球队名称',
    emptyTitle: '未找到球队',
    emptyCreateLabel: '立即创建',
    confirmTipPrefix: '已选择',
    confirmTipUnit: '个球队',
    confirmMinTip: '至少选择 1 个',
    createSubmitLabel: '创建球队',
    nameFieldLabel: '球队名称',
    namePlaceholder: '请输入球队名称',
    logoFieldLabel: '球队 Logo',

    searchQuery: '',
    searchKeyword: '',
    selectedId: '',
    selectedTeamId: null,
    selectedIds: [],
    selectedParticipants: [],
    teams: [],
    selectedTeam: null,
    emptyVisible: false,
    showEmptyState: false,
    emptyTerm: '',
    footerSelectedCount: 0,
    confirmEnabled: false,

    showShortNameSheet: false,
    shortNameDraft: '',
    shortNameCount: 0,
    shortNameMax: SHORT_NAME_MAX,
    shortNameTeamId: '',
    shortNameTeamName: '',
    shortNameEditingExisting: false,

    createForm: {
      logo: '',
      name: '',
      shortName: '',
      slogan: '',
      desc: ''
    },
    createNameCount: 0,
    createShortNameCount: 0,
    createSloganCount: 0,
    createDescCount: 0,
    showCreateShortName: true
  },

  onLoad(options) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    const selectMode = normalizeTeamSelectMode(options && options.mode);
    const selectedId = (options && options.selectedId) || '';
    // 参赛多选：完整已选对象由 opener eventChannel 预填，不解析 URL 数组
    const selectedIds = isMultiParticipantSelectMode(selectMode)
      ? []
      : selectedId
        ? [String(selectedId)]
        : [];

    this._participantSnapshots = {};
    this._organizationSnapshot = null;
    this._selectMode = selectMode;
    this._pendingInitParticipants = null;
    this._pendingInitOrganization = null;

    // 比洞赛：限制最多 2 支（由创建页传入 maxCount）
    const maxCount = options && options.maxCount != null ? Number(options.maxCount) : 0;
    this._maxParticipantCount = isFinite(maxCount) && maxCount > 0 ? Math.floor(maxCount) : 0;

    const channel = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (channel && typeof channel.on === 'function') {
      if (isMultiParticipantSelectMode(selectMode)) {
        // 须在 opener success.emit 前注册；payload 可能早于首次 setData 完成
        channel.on('initParticipants', (payload) => {
          this._applyInitialParticipants(payload);
        });
      }
      if (isEventOrgSelectMode(selectMode)) {
        channel.on('initOrganization', (payload) => {
          this._applyInitialOrganization(payload);
        });
      }
    }

    const labels = this._resolveLabels(selectMode);
    this.setData(
      Object.assign(
        {
          selectMode: selectMode,
          isEventOrgMode: isEventOrgSelectMode(selectMode),
          isParticipantMode: isMultiParticipantSelectMode(selectMode),
          selectedId: isMultiParticipantSelectMode(selectMode) ? '' : selectedId,
          selectedTeamId: isMultiParticipantSelectMode(selectMode) ? null : selectedId || null,
          selectedIds: selectedIds
        },
        labels
      ),
      () => {
        if (this._pendingInitParticipants) {
          const pendingIds = this._pendingInitParticipants.selectedIds || [];
          this._pendingInitParticipants = null;
          this.setData({ selectedIds: pendingIds }, () => this.refreshTeams());
          return;
        }
        if (this._pendingInitOrganization) {
          const pending = this._pendingInitOrganization;
          this._pendingInitOrganization = null;
          this.setData(
            {
              selectedId: pending.selectedId || '',
              selectedTeamId: pending.selectedId || null
            },
            () => this.refreshTeams()
          );
          return;
        }
        this.refreshTeams();
      }
    );
  },

  /**
   * 队际赛创建/编辑页经 eventChannel 预填当前赛事机构。
   * 仅选择页临时态；返回/取消不回写创建页。
   */
  _applyInitialOrganization(payload) {
    if (!isEventOrgSelectMode(this._selectMode || this.data.selectMode)) {
      return;
    }
    const data = payload && typeof payload === 'object' ? payload : {};
    const id = String(data.organizationId || '').trim();
    this._organizationSnapshot = {
      organizationId: id,
      organizationName: String(data.organizationName || '').trim(),
      organizationLogo: String(data.organizationLogo || '').trim(),
      isDefaultInterTeamOrganizer: !!data.isDefaultInterTeamOrganizer,
      organizationType: String(data.organizationType || 'event_org').trim() || 'event_org'
    };
    if (!this.data.isEventOrgMode) {
      this._pendingInitOrganization = { selectedId: id };
      return;
    }
    this.setData(
      {
        selectedId: id,
        selectedTeamId: id || null
      },
      () => this.refreshTeams()
    );
  },

  /**
   * 创建/编辑页经 eventChannel 预填已选参赛球队（含 group ID、简称、顺序）。
   * 仅更新选择页临时状态；确认前不回写创建页。
   */
  _applyInitialParticipants(payload) {
    if (!isMultiParticipantSelectMode(this._selectMode || this.data.selectMode)) {
      return;
    }
    const list =
      payload && Array.isArray(payload.participants) ? payload.participants : [];
    const snapshots = {};
    const selectedIds = [];
    list.forEach((p, index) => {
      if (!p || p.sourceTeamId == null) return;
      const sid = String(p.sourceTeamId).trim();
      if (!sid) return;
      const shortName = String(p.sourceTeamShortName || p.name || '').trim();
      const groupId =
        p.groupId != null && String(p.groupId).trim() !== ''
          ? p.groupId
          : p.id != null && String(p.id).trim() !== ''
            ? p.id
            : '';
      selectedIds.push(sid);
      snapshots[sid] = {
        id: groupId,
        groupId: groupId,
        sourceTeamId: sid,
        sourceTeamName: String(p.sourceTeamName || '').trim(),
        sourceTeamShortName: shortName,
        sourceTeamLogo: String(p.sourceTeamLogo || '').trim(),
        name: shortName,
        order: p.order != null ? p.order : index
      };
    });
    this._participantSnapshots = snapshots;
    // data 尚未就绪时先挂起，等 onLoad setData 回调再刷列表
    if (!this.data.isParticipantMode) {
      this._pendingInitParticipants = { selectedIds: selectedIds };
      return;
    }
    this.setData({ selectedIds: selectedIds }, () => this.refreshTeams());
  },

  _resolveLabels(selectMode) {
    if (isEventOrgSelectMode(selectMode)) {
      return {
        pageEyebrow: 'ORG',
        pageTitle: '选择赛事机构',
        createTitle: '创建赛事机构',
        listSectionTitle: '可选赛事机构',
        listSectionNote: '仅展示已加入与历史使用机构',
        searchPlaceholder: '搜索赛事机构',
        emptyTitle: '未找到赛事机构',
        emptyCreateLabel: '立即创建',
        confirmTipPrefix: '已选择',
        confirmTipUnit: '个机构',
        confirmMinTip: '请选择 1 个',
        createSubmitLabel: '创建赛事机构',
        nameFieldLabel: '机构名称',
        namePlaceholder: '请输入赛事机构名称',
        logoFieldLabel: '机构 Logo',
        showCreateShortName: false
      };
    }
    if (isMultiParticipantSelectMode(selectMode)) {
      return {
        pageEyebrow: 'TEAM',
        pageTitle: '选择参赛球队',
        createTitle: '创建球队',
        listSectionTitle: '全部球队',
        listSectionNote: '可多选，按加入顺序排列',
        searchPlaceholder: '搜索球队名称',
        emptyTitle: '未找到球队',
        emptyCreateLabel: '立即创建',
        confirmTipPrefix: '已选择',
        confirmTipUnit: '支球队',
        confirmMinTip: '至少选择 2 支',
        createSubmitLabel: '创建球队',
        nameFieldLabel: '球队名称',
        namePlaceholder: '请输入球队名称',
        logoFieldLabel: '球队 Logo',
        showCreateShortName: true
      };
    }
    return {
      pageEyebrow: 'TEAM',
      pageTitle: '选择球队',
      createTitle: '创建球队',
      listSectionTitle: '全部球队',
      listSectionNote: '选择一个球队',
      searchPlaceholder: '搜索球队名称',
      emptyTitle: '未找到球队',
      emptyCreateLabel: '立即创建',
      confirmTipPrefix: '已选择',
      confirmTipUnit: '个球队',
      confirmMinTip: '至少选择 1 个',
      createSubmitLabel: '创建球队',
      nameFieldLabel: '球队名称',
      namePlaceholder: '请输入球队名称',
      logoFieldLabel: '球队 Logo',
      showCreateShortName: true
    };
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
  },

  initHeaderNav() {
    const header = createHeaderStyle();
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle
    });
  },

  applyTheme(theme) {
    this.setData({ themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode' });
  },

  onBack() {
    if (this.data.mode === 'create') {
      this.backFromCreateTeam();
      return;
    }
    if (this.data.showShortNameSheet) {
      this.cancelShortNameSheet();
      return;
    }
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.redirectTo({ url: '/pages/home/index' });
    }
  },

  _loadList(searchKeyword) {
    const selectMode = this.data.selectMode;
    if (isEventOrgSelectMode(selectMode)) {
      return teamDirectory.listSelectableEventOrganizations(searchKeyword);
    }
    return teamDirectory.listClubTeamsForSelect(searchKeyword);
  },

  refreshTeams() {
    const searchKeyword = this.data.searchQuery.trim();
    const list = this._loadList(searchKeyword);
    const participantMode = this.data.isParticipantMode;
    const selectedIds = participantMode
      ? (this.data.selectedIds || []).map(String)
      : this.data.selectedId
        ? [String(this.data.selectedId)]
        : [];
    const selectedSet = {};
    selectedIds.forEach((id) => {
      selectedSet[id] = true;
    });

    const teams = list.map((item) =>
      Object.assign({}, item, { selected: !!selectedSet[String(item.id)] })
    );

    let selectedTeam = null;
    let selectedParticipants = [];
    if (participantMode) {
      // 已选区严格按 selectedIds（= teamGroups 顺序）；无候选列表球队也保留
      selectedParticipants = selectedIds
        .map((id) => {
          const snap = this._participantSnapshots[id];
          const team = teamDirectory.getTeamById(id);
          if (!team && !snap) return null;
          const shortName = String(
            (snap && (snap.name || snap.sourceTeamShortName)) ||
              (team && team.shortName) ||
              ''
          ).trim();
          return {
            id: id,
            name:
              (snap && snap.sourceTeamName) ||
              (team && team.name) ||
              '',
            logo:
              (snap && snap.sourceTeamLogo) ||
              (team && team.logo) ||
              '',
            shortName: shortName
          };
        })
        .filter(Boolean);
    } else if (this.data.selectedId) {
      const t = teamDirectory.getTeamById(this.data.selectedId);
      const orgSnap = this._organizationSnapshot;
      if (t) {
        // 已选回显：目录为准；同 ID 时优先展示创建页传入的本场快照名/LOGO
        const sameSnap =
          orgSnap && String(orgSnap.organizationId || '') === String(t.id);
        selectedTeam = {
          id: t.id,
          name:
            (sameSnap && orgSnap.organizationName) || t.name || '',
          logo:
            (sameSnap && orgSnap.organizationLogo) || t.logo || ''
        };
      } else if (
        orgSnap &&
        String(orgSnap.organizationId || '') === String(this.data.selectedId)
      ) {
        selectedTeam = {
          id: orgSnap.organizationId,
          name: orgSnap.organizationName || '',
          logo: orgSnap.organizationLogo || ''
        };
      }
    }

    const showEmptyState = !!searchKeyword && teams.length === 0;
    const footerSelectedCount = participantMode
      ? selectedParticipants.length
      : selectedTeam
        ? 1
        : 0;
    const confirmEnabled = participantMode
      ? selectedParticipants.length >= 2
      : !!selectedTeam;

    this.setData({
      teams: teams,
      selectedTeamId: participantMode ? null : this.data.selectedId || null,
      selectedTeam: selectedTeam,
      selectedParticipants: selectedParticipants,
      selectedIds: selectedIds,
      emptyVisible: showEmptyState,
      showEmptyState: showEmptyState,
      emptyTerm: searchKeyword,
      searchKeyword: searchKeyword,
      footerSelectedCount: footerSelectedCount,
      confirmEnabled: confirmEnabled
    });
  },

  handleSearchInput(e) {
    this.onSearchInput(e);
  },

  onSearchInput(e) {
    this.setData({ searchQuery: e.detail.value || '' }, () => this.refreshTeams());
  },

  handleSearch() {
    this.refreshTeams();
  },

  clearSearch() {
    this.setData({ searchQuery: '' }, () => this.refreshTeams());
  },

  onToggleTeam(e) {
    const id = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '');
    if (!id) return;

    if (this.data.isParticipantMode) {
      this._toggleParticipant(id);
      return;
    }

    const nextId = this.data.selectedId === id ? '' : id;
    this.setData({ selectedId: nextId, selectedTeamId: nextId || null }, () => this.refreshTeams());
  },

  _toggleParticipant(id) {
    const ids = (this.data.selectedIds || []).map(String);
    const idx = ids.indexOf(id);
    if (idx >= 0) {
      // 已选：打开简称编辑（不要求重新选择；无目录球队也可用快照）
      const snap = this._participantSnapshots[id] || {};
      const team = teamDirectory.getTeamById(id);
      const initial =
        snap.name ||
        snap.sourceTeamShortName ||
        (team && team.shortName) ||
        sliceChars((team && team.name) || snap.sourceTeamName || '', SHORT_NAME_MAX);
      this.setData({
        showShortNameSheet: true,
        shortNameDraft: initial,
        shortNameCount: charLen(initial),
        shortNameTeamId: id,
        shortNameTeamName:
          (team && team.name) || snap.sourceTeamName || '',
        shortNameEditingExisting: true
      });
      return;
    }

    if (this._maxParticipantCount > 0 && ids.length >= this._maxParticipantCount) {
      wx.showToast({
        title: '比洞赛有且只能有两支球队参与',
        icon: 'none'
      });
      return;
    }

    const team = teamDirectory.getTeamById(id);
    if (!team) return;
    const initial =
      (team.shortName && String(team.shortName).trim()) ||
      sliceChars(team.name || '', SHORT_NAME_MAX);
    this.setData({
      showShortNameSheet: true,
      shortNameDraft: initial,
      shortNameCount: charLen(initial),
      shortNameTeamId: id,
      shortNameTeamName: team.name || '',
      shortNameEditingExisting: false
    });
  },

  onShortNameInput(e) {
    const value = sliceChars(e.detail.value || '', SHORT_NAME_MAX);
    this.setData({
      shortNameDraft: value,
      shortNameCount: charLen(value)
    });
  },

  cancelShortNameSheet() {
    this.setData({
      showShortNameSheet: false,
      shortNameDraft: '',
      shortNameCount: 0,
      shortNameTeamId: '',
      shortNameTeamName: '',
      shortNameEditingExisting: false
    });
  },

  confirmShortNameSheet() {
    const id = String(this.data.shortNameTeamId || '');
    const shortName = String(this.data.shortNameDraft || '').trim();
    if (!id) {
      this.cancelShortNameSheet();
      return;
    }
    if (!shortName) {
      wx.showToast({ title: '请输入本场简称', icon: 'none' });
      return;
    }
    if (charLen(shortName) > SHORT_NAME_MAX) {
      wx.showToast({ title: '简称最多 ' + SHORT_NAME_MAX + ' 个字', icon: 'none' });
      return;
    }

    const team = teamDirectory.getTeamById(id);
    if (!team && !this.data.shortNameEditingExisting) {
      this.cancelShortNameSheet();
      return;
    }

    const prev = this._participantSnapshots[id] || {};
    const groupId =
      prev.groupId != null && String(prev.groupId).trim() !== ''
        ? prev.groupId
        : prev.id != null && String(prev.id).trim() !== ''
          ? prev.id
          : '';
    this._participantSnapshots[id] = {
      id: groupId,
      groupId: groupId,
      sourceTeamId: id,
      sourceTeamName:
        (team && team.name) ||
        prev.sourceTeamName ||
        this.data.shortNameTeamName ||
        '',
      sourceTeamLogo:
        (prev.sourceTeamLogo && String(prev.sourceTeamLogo).trim()) ||
        (team && team.logo) ||
        '',
      name: shortName,
      sourceTeamShortName: shortName,
      order: prev.order
    };

    let ids = (this.data.selectedIds || []).map(String);
    if (ids.indexOf(id) < 0) {
      ids = ids.concat([id]);
    }

    this.setData(
      {
        selectedIds: ids,
        showShortNameSheet: false,
        shortNameDraft: '',
        shortNameCount: 0,
        shortNameTeamId: '',
        shortNameTeamName: '',
        shortNameEditingExisting: false
      },
      () => this.refreshTeams()
    );
  },

  onRemoveParticipant(e) {
    const id = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '');
    if (!id) return;
    const ids = (this.data.selectedIds || []).map(String).filter((x) => x !== id);
    delete this._participantSnapshots[id];
    this.setData({ selectedIds: ids }, () => this.refreshTeams());
  },

  onClearSelected() {
    if (this.data.isParticipantMode) {
      this._participantSnapshots = {};
      this.setData({ selectedIds: [] }, () => this.refreshTeams());
      return;
    }
    this.setData({ selectedId: '', selectedTeamId: null }, () => this.refreshTeams());
  },

  openCreateTeam() {
    const keyword = this.data.searchQuery.trim();
    this.setData({
      mode: 'create',
      createForm: {
        logo: '',
        name: keyword,
        shortName: '',
        slogan: '',
        desc: ''
      },
      createNameCount: charLen(keyword),
      createShortNameCount: 0,
      createSloganCount: 0,
      createDescCount: 0
    });
  },

  backFromCreateTeam() {
    this.setData({
      mode: 'list',
      createForm: { logo: '', name: '', shortName: '', slogan: '', desc: '' },
      createNameCount: 0,
      createShortNameCount: 0,
      createSloganCount: 0,
      createDescCount: 0
    });
    this.refreshTeams();
  },

  chooseTeamLogo() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) return;
        this.setData({ 'createForm.logo': file.tempFilePath });
      },
      fail: () => {}
    });
  },

  handleCreateTeamNameInput(e) {
    const value = sliceChars(e.detail.value || '', NAME_MAX);
    this.setData({
      'createForm.name': value,
      createNameCount: charLen(value)
    });
  },

  handleCreateShortNameInput(e) {
    const value = sliceChars(e.detail.value || '', SHORT_NAME_MAX);
    this.setData({
      'createForm.shortName': value,
      createShortNameCount: charLen(value)
    });
  },

  handleCreateSloganInput(e) {
    const value = String(e.detail.value || '').slice(0, SLOGAN_MAX);
    this.setData({
      'createForm.slogan': value,
      createSloganCount: value.length
    });
  },

  handleCreateDescInput(e) {
    const value = String(e.detail.value || '').slice(0, DESC_MAX);
    this.setData({
      'createForm.desc': value,
      createDescCount: value.length
    });
  },

  submitCreateTeam() {
    const name = (this.data.createForm.name || '').trim();
    if (!name) {
      wx.showToast({
        title: this.data.isEventOrgMode ? '请输入机构名称' : '请输入球队名称',
        icon: 'none'
      });
      return;
    }

    const organizationType = this.data.isEventOrgMode
      ? teamDirectory.ORGANIZATION_TYPES.EVENT_ORG
      : teamDirectory.ORGANIZATION_TYPES.TEAM;

    const shortName = this.data.showCreateShortName
      ? teamDirectory.normalizeShortName(this.data.createForm.shortName)
      : '';

    const team = teamDirectory.addCreatedTeam({
      id: Date.now(),
      name: name,
      shortName: shortName,
      logo: this.data.createForm.logo || mockAvatars.pickMockAvatar(name),
      role: '超级管理员',
      slogan: this.data.createForm.slogan,
      desc: this.data.createForm.desc,
      organizationType: organizationType,
      isMine: true
    });

    if (!team) return;

    if (this.data.isParticipantMode) {
      this.setData(
        {
          mode: 'list',
          searchQuery: '',
          createForm: { logo: '', name: '', shortName: '', slogan: '', desc: '' },
          createNameCount: 0,
          createShortNameCount: 0,
          createSloganCount: 0,
          createDescCount: 0
        },
        () => {
          this.refreshTeams();
          this._toggleParticipant(String(team.id));
        }
      );
      return;
    }

    this.setData(
      {
        mode: 'list',
        searchQuery: '',
        selectedId: team.id,
        selectedTeamId: team.id,
        createForm: { logo: '', name: '', shortName: '', slogan: '', desc: '' },
        createNameCount: 0,
        createShortNameCount: 0,
        createSloganCount: 0,
        createDescCount: 0
      },
      () => this.refreshTeams()
    );
  },

  onConfirm() {
    const channel = this.getOpenerEventChannel && this.getOpenerEventChannel();

    if (this.data.isParticipantMode) {
      const ids = (this.data.selectedIds || []).map(String);
      if (ids.length < 2) {
        wx.showToast({ title: '请至少选择 2 支球队', icon: 'none' });
        return;
      }
      if (this._maxParticipantCount > 0 && ids.length > this._maxParticipantCount) {
        wx.showToast({ title: '比洞赛有且只能有两支球队参与', icon: 'none' });
        return;
      }
      const participants = ids
        .map((id, index) => {
          const snap = this._participantSnapshots[id] || {};
          const team = teamDirectory.getTeamById(id);
          const shortName = String(
            snap.name || snap.sourceTeamShortName || ''
          ).trim();
          if (!shortName) return null;
          let groupId = '';
          if (snap.groupId != null && String(snap.groupId).trim() !== '') {
            groupId = snap.groupId;
          } else if (snap.id != null && String(snap.id).trim() !== '') {
            groupId = snap.id;
          }
          return {
            id: groupId,
            groupId: groupId,
            sourceTeamId: id,
            sourceTeamName: snap.sourceTeamName || (team && team.name) || '',
            sourceTeamLogo: snap.sourceTeamLogo || (team && team.logo) || '',
            sourceTeamShortName: shortName,
            name: shortName,
            order: snap.order != null ? snap.order : index
          };
        })
        .filter(Boolean);
      if (participants.length !== ids.length) {
        wx.showToast({ title: '请为每支球队确认简称', icon: 'none' });
        return;
      }
      if (channel) {
        channel.emit('participantsSelected', { participants: participants });
      }
      wx.navigateBack({ delta: 1 });
      return;
    }

    if (!this.data.selectedId) {
      wx.showToast({
        title: this.data.isEventOrgMode ? '请选择赛事机构' : '请至少选择 1 个球队',
        icon: 'none'
      });
      return;
    }
    const team = teamDirectory.getTeamById(this.data.selectedId);
    if (!team) return;

    if (this.data.isEventOrgMode) {
      teamDirectory.rememberRecentEventOrg(team.id);
      if (channel) {
        channel.emit('organizationSelected', {
          organizationId: team.id,
          organizationName: team.name,
          organizationLogo: team.logo,
          isDefaultInterTeamOrganizer: !!team.isDefaultInterTeamOrganizer,
          organizationType: team.organizationType
        });
      }
      wx.navigateBack({ delta: 1 });
      return;
    }

    if (channel) {
      channel.emit('teamSelected', {
        teamId: team.id,
        teamName: team.name,
        teamLogo: team.logo,
        teamRole: team.role,
        shortName: team.shortName || ''
      });
    }
    wx.navigateBack({ delta: 1 });
  }
});
