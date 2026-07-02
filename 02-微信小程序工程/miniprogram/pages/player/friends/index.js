/**

 * 好友选择页（记分页面「空位 → 添加方式」第二层入口之一）

 * - 搜索栏下固定「我」入口，不参与 A-Z 分组

 * - 通讯录按字母（pinyin 首字母）分组排序

 * - 多选；本组已有球员（含我）默认选中、可取消

 * - 返回时通过 openerEventChannel 回传最终选择集，由创建/记分页面统一回填 slot

 */

const { createHeaderStyle } = require('../../../utils/headerEngine.js');

const { FRIEND_LIST } = require('../../../utils/playerDirectory.js');

const gameStore = require('../../../utils/gameStore.js');



const MAX_GROUP_SIZE = 4;



function buildCurrentUser() {

  const u = gameStore.getCurrentUser() || {};

  return {

    playerId: u.userId || 'me',

    name: u.name || '我',

    phone: u.phone || '',

    avatar: u.avatar || ''

  };

}



function parseIdList(raw) {

  return raw ? decodeURIComponent(raw).split(',').filter(Boolean) : [];

}



function filterFriends(list, keyword) {

  const q = (keyword || '').trim();

  if (!q) return list;

  const lower = q.toLowerCase();

  return list.filter((f) => {

    const fields = [f.name, f.pinyin, f.phone, f.remark, f.displayName];

    return fields.some((v) => v && String(v).toLowerCase().includes(lower));

  });

}



function buildSections(list) {

  const sorted = list.slice().sort((a, b) => (a.pinyin || a.name).localeCompare(b.pinyin || b.name));

  const map = {};

  sorted.forEach((f) => {

    const letter = ((f.pinyin || f.name)[0] || '#').toUpperCase();

    if (!map[letter]) map[letter] = [];

    map[letter].push(f);

  });

  return Object.keys(map)

    .sort()

    .map((letter) => ({ letter, items: map[letter] }));

}



Page({

  data: {

    themeClass: 'bright-mode',

    headerRootStyle: '',

    headerBarStyle: '',

    matchId: '',

    slotId: '',

    keyword: '',

    currentUser: null,

    sections: [],

    searchEmpty: false,

    selectedMap: {},

    currentGroupPlayerIds: [],

    preselectedMap: {},

    disabledMap: {},

    maxAdd: 4,

    selectedCount: 0

  },



  // 入参：groupPlayers=当前本组已有球员；used=其它组已占用 playerId

  onLoad(options) {

    this.initHeaderNav();

    this.applyTheme(getApp().getTheme());



    const opt = options || {};

    const groupPlayerIds = parseIdList(opt.groupPlayers || opt.preselected);

    const usedIds = parseIdList(opt.used);

    const emptyCount = opt.emptyCount != null ? Number(opt.emptyCount) : 4;

    const currentUser = buildCurrentUser();



    const preselectedMap = {};

    const selectedMap = {};

    groupPlayerIds.forEach((id) => {

      preselectedMap[id] = true;

      selectedMap[id] = true;

    });



    const disabledMap = {};

    usedIds.forEach((id) => {

      if (!preselectedMap[id]) disabledMap[id] = true;

    });



    this._allFriends = FRIEND_LIST;

    this._currentGroupPlayerIds = groupPlayerIds.slice();



    this.setData({

      matchId: opt.matchId || '',

      slotId: opt.slotId || '',

      keyword: '',

      currentUser,

      sections: buildSections(this._allFriends),

      searchEmpty: false,

      currentGroupPlayerIds: groupPlayerIds,

      preselectedMap,

      selectedMap,

      disabledMap,

      maxAdd: isNaN(emptyCount) ? 4 : emptyCount,

      selectedCount: groupPlayerIds.length

    });

  },



  onShow() {

    this.applyTheme(getApp().getTheme());

  },



  applyTheme(theme) {

    this.setData({ themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode' });

  },



  initHeaderNav() {

    const header = createHeaderStyle();

    this.setData({ headerRootStyle: header.headerRootStyle, headerBarStyle: header.headerBarStyle });

  },



  _applyFriendFilter(keyword) {

    const filtered = filterFriends(this._allFriends || FRIEND_LIST, keyword);

    const trimmed = (keyword || '').trim();

    this.setData({

      keyword: keyword || '',

      sections: buildSections(filtered),

      searchEmpty: !!trimmed && filtered.length === 0

    });

  },



  onSearchInput(e) {

    this._applyFriendFilter(e.detail.value || '');

  },



  clearSearch() {

    this._applyFriendFilter('');

  },



  toggleFriend(e) {

    this._togglePlayer(e.currentTarget.dataset.id);

  },



  toggleMe() {

    const cu = this.data.currentUser;

    if (!cu || !cu.playerId) return;

    this._togglePlayer(cu.playerId);

  },



  _togglePlayer(id) {

    if (!id) return;

    if (this.data.disabledMap[id]) return;



    const selectedMap = Object.assign({}, this.data.selectedMap);

    const isOn = !!selectedMap[id];

    if (isOn) {

      delete selectedMap[id];

    } else if (Object.keys(selectedMap).length >= MAX_GROUP_SIZE) {

      wx.showToast({ title: '每组最多 ' + MAX_GROUP_SIZE + ' 人', icon: 'none' });

      return;

    } else {

      selectedMap[id] = true;

    }

    this.setData({ selectedMap, selectedCount: Object.keys(selectedMap).length });

  },



  onBack() {

    if (getCurrentPages().length > 1) wx.navigateBack({ delta: 1 });

    else wx.redirectTo({ url: '/pages/home/index' });

  },



  confirm() {

    const selectedMap = this.data.selectedMap;

    const selected = [];

    const cu = this.data.currentUser;

    if (cu && cu.playerId && selectedMap[cu.playerId]) {

      selected.push({

        playerId: cu.playerId,

        name: cu.name,

        avatar: cu.avatar || ''

      });

    }

    (this._allFriends || FRIEND_LIST).forEach((f) => {

      if (selectedMap[f.playerId]) selected.push(f);

    });

    const ch = this.getOpenerEventChannel && this.getOpenerEventChannel();

    if (ch && ch.emit) ch.emit('friendsSelected', { friends: selected });

    this.onBack();

  }

});


