const { createHeaderStyle } = require('../../../utils/headerEngine.js');
const teamDirectory = require('../../../utils/teamDirectory.js');
const mockAvatars = require('../../../utils/mockAvatars.js');

const NAME_MAX = 30;
const SLOGAN_MAX = 50;
const DESC_MAX = 500;

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',

    mode: 'list',

    searchQuery: '',
    searchKeyword: '',
    selectedId: '',
    selectedTeamId: null,
    teams: [],
    teamList: [],
    filteredTeamList: [],
    selectedTeam: null,
    emptyVisible: false,
    showEmptyState: false,
    emptyTerm: '',

    createForm: {
      logo: '',
      name: '',
      slogan: '',
      desc: ''
    },
    createNameCount: 0,
    createSloganCount: 0,
    createDescCount: 0
  },

  onLoad(options) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    const selectedId = (options && options.selectedId) || '';
    this.setData({ selectedId, selectedTeamId: selectedId || null });
    this.refreshTeams();
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
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.redirectTo({ url: '/pages/home/index' });
    }
  },

  refreshTeams() {
    // TODO：搜索球队接口
    const searchKeyword = this.data.searchQuery.trim();
    const list = teamDirectory.listTeamsForSelect(searchKeyword);
    const selectedId = this.data.selectedId;
    const teams = list.map((item) => Object.assign({}, item, { selected: item.id === selectedId }));
    const selectedTeam = selectedId ? teamDirectory.getTeamById(selectedId) : null;
    const showEmptyState = !!searchKeyword && teams.length === 0;

    this.setData({
      teams,
      teamList: teams,
      filteredTeamList: teams,
      selectedTeamId: selectedId || null,
      selectedTeam: selectedTeam
        ? { id: selectedTeam.id, name: selectedTeam.name, logo: selectedTeam.logo }
        : null,
      emptyVisible: showEmptyState,
      showEmptyState,
      emptyTerm: searchKeyword,
      searchKeyword
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
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const nextId = this.data.selectedId === id ? '' : id;
    this.setData({ selectedId: nextId, selectedTeamId: nextId || null }, () => this.refreshTeams());
  },

  onClearSelected() {
    this.setData({ selectedId: '', selectedTeamId: null }, () => this.refreshTeams());
  },

  openCreateTeam() {
    const keyword = this.data.searchQuery.trim();
    this.setData({
      mode: 'create',
      createForm: {
        logo: '',
        name: keyword,
        slogan: '',
        desc: ''
      },
      createNameCount: keyword.length,
      createSloganCount: 0,
      createDescCount: 0
    });
  },

  backFromCreateTeam() {
    this.setData({
      mode: 'list',
      createForm: { logo: '', name: '', slogan: '', desc: '' },
      createNameCount: 0,
      createSloganCount: 0,
      createDescCount: 0
    });
    this.refreshTeams();
  },

  chooseTeamLogo() {
    // TODO：上传球队 Logo 接口
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
    const value = String(e.detail.value || '').slice(0, NAME_MAX);
    this.setData({
      'createForm.name': value,
      createNameCount: value.length
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
      wx.showToast({ title: '请输入球队名称', icon: 'none' });
      return;
    }

    // TODO：创建球队接口
    const team = teamDirectory.addCreatedTeam({
      id: Date.now(),
      name,
      logo: this.data.createForm.logo || mockAvatars.pickMockAvatar(name),
      role: '超级管理员',
      slogan: this.data.createForm.slogan,
      desc: this.data.createForm.desc
    });

    if (!team) return;

    this.setData(
      {
        mode: 'list',
        searchQuery: '',
        selectedId: team.id,
        selectedTeamId: team.id,
        createForm: { logo: '', name: '', slogan: '', desc: '' },
        createNameCount: 0,
        createSloganCount: 0,
        createDescCount: 0
      },
      () => this.refreshTeams()
    );
  },

  onConfirm() {
    if (!this.data.selectedId) {
      wx.showToast({ title: '请至少选择 1 个球队', icon: 'none' });
      return;
    }
    const team = teamDirectory.getTeamById(this.data.selectedId);
    if (!team) return;

    // TODO：确认选择球队后与后端创建队内赛数据结构对齐
    const channel = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (channel) {
      channel.emit('teamSelected', {
        teamId: team.id,
        teamName: team.name,
        teamLogo: team.logo,
        teamRole: team.role
      });
    }
    wx.navigateBack({ delta: 1 });
  }
});
