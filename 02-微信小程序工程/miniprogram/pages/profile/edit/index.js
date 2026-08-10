/**
 * 个人资料编辑 — 真实编辑交互，写回 userProfileStore 后刷新
 */
const { createHeaderStyle } = require('../../../utils/headerEngine.js');
const userProfileStore = require('../../../utils/userProfileStore.js');
const genderNormalize = require('../../../utils/genderNormalize.js');
const geoCatalog = require('../../../utils/geoCatalog.js');

const IDENTITY_PLAYER = userProfileStore.IDENTITY_PLAYER || 'PLAYER';
const IDENTITY_CADDIE = userProfileStore.IDENTITY_CADDIE || 'CADDIE';
const SIGNATURE_MAX = 30;

const EDITOR_FIELDS = {
  nickname: {
    key: 'nickname',
    title: '编辑昵称',
    placeholder: '请输入昵称',
    maxlength: 20,
    multiline: false
  },
  signature: {
    key: 'signature',
    title: '编辑个人签名',
    placeholder: '写下你的球场格言…',
    maxlength: SIGNATURE_MAX,
    multiline: true
  },
  displayName: {
    key: 'displayName',
    title: '编辑比赛名',
    placeholder: '未设置时显示昵称',
    maxlength: 20,
    multiline: false
  },
  caddieCourse: {
    key: 'caddieCourse',
    title: '所属球场',
    placeholder: '请输入所属球场',
    maxlength: 40,
    multiline: false
  }
};

function buildUserProfileView() {
  const p = userProfileStore.loadProfile() || {};
  const nickname = String(p.nickname || '').trim() || '未设置昵称';
  const displayName = String(p.displayName || p.competitionName || '').trim();
  const identityType = p.identityType === IDENTITY_CADDIE ? IDENTITY_CADDIE : IDENTITY_PLAYER;
  const signature = String(p.signature || '').trim();
  const nationalityName = String(p.nationalityName || '').trim();
  const regionDisplayName = geoCatalog.formatRegionDisplayName(p);

  return {
    avatar: p.avatar || userProfileStore.DEFAULT_AVATAR,
    nickname: nickname,
    gender: genderNormalize.genderLabelZh(p.gender),
    signature: signature,
    signatureText: signature || '未设置签名',
    identityType: identityType,
    caddieCourse: String(p.caddieCourse || '').trim() || '未设置球场',
    displayName: displayName,
    displayNameText: displayName || nickname,
    phoneBound: p.phoneBound === true,
    phoneMasked: String(p.phoneMasked || '未绑定').trim() || '未绑定',
    isCaddie: identityType === IDENTITY_CADDIE,
    nationalityName: nationalityName,
    nationalityText: nationalityName || '未设置',
    regionDisplayName: regionDisplayName,
    regionText: regionDisplayName || '未设置'
  };
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    identityPlayer: IDENTITY_PLAYER,
    identityCaddie: IDENTITY_CADDIE,
    userProfile: {
      avatar: '',
      nickname: '',
      gender: '',
      signature: '',
      signatureText: '',
      identityType: IDENTITY_PLAYER,
      caddieCourse: '',
      displayName: '',
      displayNameText: '',
      phoneBound: false,
      phoneMasked: '',
      isCaddie: false,
      nationalityName: '',
      nationalityText: '未设置',
      regionDisplayName: '',
      regionText: '未设置'
    },
    editorVisible: false,
    editorField: '',
    editorTitle: '',
    editorPlaceholder: '',
    editorMaxlength: 20,
    editorMultiline: false,
    editorDraft: '',
    editorCount: 0,
    /** nationality | regionProvince | regionCity */
    pickerVisible: false,
    pickerMode: '',
    pickerTitle: '',
    pickerItems: [],
    pickerAllowClear: false
  },

  onLoad() {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    this.refreshProfile();
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
    this.refreshProfile();
  },

  initHeaderNav() {
    const styles = createHeaderStyle();
    this.setData({
      headerRootStyle: styles.headerRootStyle,
      headerBarStyle: styles.headerBarStyle
    });
  },

  applyTheme(theme) {
    this.setData({ themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode' });
  },

  refreshProfile() {
    this.setData({ userProfile: buildUserProfileView() });
  },

  /** 预留：未来接微信头像更新 */
  updateAvatar() {
    wx.showToast({ title: '头像修改即将开放', icon: 'none' });
  },

  onTapAvatar() {
    this.updateAvatar();
  },

  openTextEditor(fieldKey) {
    const conf = EDITOR_FIELDS[fieldKey];
    if (!conf) return;
    const p = userProfileStore.loadProfile() || {};
    let draft = '';
    if (fieldKey === 'nickname') draft = String(p.nickname || '');
    else if (fieldKey === 'signature') draft = String(p.signature || '');
    else if (fieldKey === 'displayName') draft = String(p.displayName || p.competitionName || '');
    else if (fieldKey === 'caddieCourse') draft = String(p.caddieCourse || '');

    this.setData({
      editorVisible: true,
      editorField: conf.key,
      editorTitle: conf.title,
      editorPlaceholder: conf.placeholder,
      editorMaxlength: conf.maxlength,
      editorMultiline: conf.multiline,
      editorDraft: draft,
      editorCount: draft.length
    });
  },

  onTapNickname() {
    this.openTextEditor('nickname');
  },

  onTapSignature() {
    this.openTextEditor('signature');
  },

  onTapDisplayName() {
    this.openTextEditor('displayName');
  },

  onTapCaddieCourse() {
    this.openTextEditor('caddieCourse');
  },

  onEditorInput(e) {
    let value = (e.detail && e.detail.value) || '';
    const max = this.data.editorMaxlength || 20;
    if (value.length > max) value = value.slice(0, max);
    this.setData({
      editorDraft: value,
      editorCount: value.length
    });
  },

  onEditorCancel() {
    this.setData({
      editorVisible: false,
      editorField: '',
      editorDraft: ''
    });
  },

  onEditorSave() {
    const field = this.data.editorField;
    const conf = EDITOR_FIELDS[field];
    if (!conf) {
      this.onEditorCancel();
      return;
    }
    let value = String(this.data.editorDraft || '');
    if (field === 'signature' && value.length > SIGNATURE_MAX) {
      value = value.slice(0, SIGNATURE_MAX);
    } else {
      value = value.trim();
    }

    if (field === 'nickname') {
      if (!value) {
        wx.showToast({ title: '昵称不能为空', icon: 'none' });
        return;
      }
      userProfileStore.updateProfile({ nickname: value });
    } else if (field === 'signature') {
      userProfileStore.updateProfile({ signature: value });
    } else if (field === 'displayName') {
      userProfileStore.updateProfile({ displayName: value });
    } else if (field === 'caddieCourse') {
      userProfileStore.updateProfile({ caddieCourse: value });
    }

    this.setData({ editorVisible: false, editorField: '', editorDraft: '' });
    this.refreshProfile();
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  onTapGender() {
    wx.showActionSheet({
      itemList: ['男', '女'],
      success: (res) => {
        const gender = res.tapIndex === 1 ? '女' : '男';
        userProfileStore.updateProfile({ gender: gender });
        this.refreshProfile();
        wx.showToast({ title: '已保存', icon: 'success' });
      }
    });
  },

  onTapNationality() {
    const items = geoCatalog.listNationalities().map((n) => ({
      code: n.code,
      name: n.name,
      label: n.name
    }));
    this.setData({
      pickerVisible: true,
      pickerMode: 'nationality',
      pickerTitle: '选择国籍',
      pickerItems: items,
      pickerAllowClear: true
    });
  },

  onTapRegion() {
    this._pendingRegionProvince = null;
    const items = geoCatalog.listChinaProvinces().map((p) => ({
      code: p.code,
      name: p.name,
      label: p.name
    }));
    this.setData({
      pickerVisible: true,
      pickerMode: 'regionProvince',
      pickerTitle: '选择省份',
      pickerItems: items,
      pickerAllowClear: true
    });
  },

  onPickerCancel() {
    // 取消不落盘未确认的省/市草稿
    this._pendingRegionProvince = null;
    this.setData({
      pickerVisible: false,
      pickerMode: '',
      pickerItems: [],
      pickerAllowClear: false
    });
  },

  onPickerClear() {
    const mode = this.data.pickerMode;
    if (mode === 'nationality') {
      userProfileStore.updateProfile({
        nationalityCode: '',
        nationalityName: ''
      });
      this.onPickerCancel();
      this.refreshProfile();
      wx.showToast({ title: '已清除国籍', icon: 'success' });
      return;
    }
    if (mode === 'regionProvince' || mode === 'regionCity') {
      this._pendingRegionProvince = null;
      userProfileStore.updateProfile({
        regionCountryCode: '',
        regionCountryName: '',
        regionProvinceCode: '',
        regionProvinceName: '',
        regionCityCode: '',
        regionCityName: ''
      });
      this.onPickerCancel();
      this.refreshProfile();
      wx.showToast({ title: '已清除地域', icon: 'success' });
    }
  },

  onPickerSelect(e) {
    const ds = (e.currentTarget && e.currentTarget.dataset) || {};
    const code = String(ds.code || '').trim();
    const name = String(ds.name || '').trim();
    const mode = this.data.pickerMode;
    if (!code || !name) return;

    if (mode === 'nationality') {
      userProfileStore.updateProfile({
        nationalityCode: code,
        nationalityName: name
      });
      this.onPickerCancel();
      this.refreshProfile();
      wx.showToast({ title: '已保存', icon: 'success' });
      return;
    }

    if (mode === 'regionProvince') {
      const cities = geoCatalog.listChinaCities(code);
      const pending = {
        regionCountryCode: 'CN',
        regionCountryName: '中国',
        regionProvinceCode: code,
        regionProvinceName: name,
        regionCityCode: '',
        regionCityName: ''
      };
      if (!cities.length) {
        userProfileStore.updateProfile(pending);
        this._pendingRegionProvince = null;
        this.onPickerCancel();
        this.refreshProfile();
        wx.showToast({ title: '已保存', icon: 'success' });
        return;
      }
      // 市列表未确认前不写 Storage；取消则保留原值
      this._pendingRegionProvince = pending;
      this.setData({
        pickerMode: 'regionCity',
        pickerTitle: '选择城市',
        pickerItems: cities.map((c) => ({
          code: c.code,
          name: c.name,
          label: c.name
        })),
        pickerAllowClear: true
      });
      return;
    }

    if (mode === 'regionCity') {
      const pending = this._pendingRegionProvince || {};
      userProfileStore.updateProfile({
        regionCountryCode: pending.regionCountryCode || 'CN',
        regionCountryName: pending.regionCountryName || '中国',
        regionProvinceCode: pending.regionProvinceCode || '',
        regionProvinceName: pending.regionProvinceName || '',
        regionCityCode: code,
        regionCityName: name
      });
      this._pendingRegionProvince = null;
      this.onPickerCancel();
      this.refreshProfile();
      wx.showToast({ title: '已保存', icon: 'success' });
    }
  },

  /** 身份类型 → store */
  onSelectIdentity(e) {
    const type = String(
      (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.type) || ''
    );
    if (type !== IDENTITY_PLAYER && type !== IDENTITY_CADDIE) return;
    const current = (this.data.userProfile && this.data.userProfile.identityType) || '';
    if (type === current) return;
    const patch = { identityType: type };
    if (type === IDENTITY_CADDIE) {
      const p = userProfileStore.loadProfile() || {};
      if (!String(p.caddieCourse || '').trim()) {
        patch.caddieCourse = '深圳正中高尔夫俱乐部';
      }
    }
    userProfileStore.updateProfile(patch);
    this.refreshProfile();
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  onTapAliasManage() {
    wx.showToast({ title: '马甲管理即将开放', icon: 'none' });
  },

  onBack() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/home/index' }) });
  },

  noop() {}
});
