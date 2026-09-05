const memberListView = require('../../../../../../../utils/teamClub/memberListView.js');
const openPlayerProfileUtil = require('../../../../../../../utils/openPlayerProfile.js');

Component({
  properties: {
    pageState: { type: String, value: 'loading' },
    members: { type: Array, value: [] },
    keyword: { type: String, value: '' },
    showManageButton: { type: Boolean, value: false }
  },
  data: {
    searchMode: false,
    useLetterIndex: true,
    listCount: 0,
    metaLabel: '球队成员',
    emptyText: '暂无成员',
    sections: [],
    flatRows: [],
    indexLetters: [],
    scrollIntoView: ''
  },
  observers: {
    // 不要观察 showManageButton：它既是 property，又曾被 _rebuild 的 setData 写回，
    // 会形成 observer → setData → observer 的自触发环。管理按钮直接用 property 渲染即可。
    'members, keyword': function () {
      this._rebuild();
    }
  },
  attached() {
    this._rebuild();
  },
  methods: {
    _rebuild() {
      const view = memberListView.buildMemberListView(this.data.members || [], this.data.keyword);
      this.setData(view);
    },
    onSearchInput(e) {
      const keyword = (e.detail && e.detail.value) || '';
      this.triggerEvent('search', { keyword: keyword });
    },
    onClearSearch() {
      this.triggerEvent('search', { keyword: '' });
    },
    onRetry() {
      this.triggerEvent('retry');
    },
    onTapManage() {
      this.triggerEvent('manage');
    },
    onTapIndex(e) {
      if (this.data.searchMode || !this.data.useLetterIndex) return;
      const letter = e.currentTarget.dataset.letter;
      if (!letter) return;
      const hit = (this.data.sections || []).some(function (s) {
        return s.letter === letter;
      });
      if (!hit) {
        wx.showToast({ title: '无 ' + letter + ' 分组', icon: 'none', duration: 800 });
        return;
      }
      this.setData({ scrollIntoView: 'sec-' + letter });
    },
    onTapMember(e) {
      if (this._profileNavLock) return;
      const ds = (e.currentTarget && e.currentTarget.dataset) || {};
      const rowUserId = String(ds.userId || '').trim();
      const nickname = String(ds.nickname || ds.name || '').trim();
      const avatar = String(ds.avatar || '').trim();
      const userType = String(ds.userType || '').trim();
      const targetUserId = openPlayerProfileUtil.resolveOpenableUserId({
        userId: rowUserId,
        playerId: rowUserId,
        userType: userType
      });
      if (!targetUserId) {
        wx.showToast({ title: '该球员暂无主页', icon: 'none', duration: 1200 });
        return;
      }
      this._profileNavLock = true;
      const self = this;
      const opened = openPlayerProfileUtil.openPlayerProfile({
        userId: targetUserId,
        playerId: targetUserId,
        publicName: nickname,
        nickname: nickname,
        avatar: avatar,
        gender: ds.gender,
        handicap: ds.handicap,
        floatCoef: ds.floatCoef,
        userType: userType,
        identitySource: 'contacts'
      });
      if (!opened) {
        this._profileNavLock = false;
        wx.showToast({ title: '该球员暂无主页', icon: 'none', duration: 1200 });
        return;
      }
      setTimeout(function () {
        self._profileNavLock = false;
      }, 800);
    }
  }
});
