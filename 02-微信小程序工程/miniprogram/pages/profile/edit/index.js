/**
 * 个人资料编辑 — 真实编辑交互，写回 userProfileStore 后刷新
 */
const { createHeaderStyle } = require('../../../utils/headerEngine.js');
const userProfileStore = require('../../../utils/userProfileStore.js');

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
  const gender = String(p.gender || '').trim();

  return {
    avatar: p.avatar || userProfileStore.DEFAULT_AVATAR,
    nickname: nickname,
    gender: gender || '未设置',
    signature: signature,
    signatureText: signature || '未设置签名',
    identityType: identityType,
    caddieCourse: String(p.caddieCourse || '').trim() || '未设置球场',
    displayName: displayName,
    displayNameText: displayName || nickname,
    phoneBound: p.phoneBound === true,
    phoneMasked: String(p.phoneMasked || '未绑定').trim() || '未绑定',
    isCaddie: identityType === IDENTITY_CADDIE
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
      isCaddie: false
    },
    editorVisible: false,
    editorField: '',
    editorTitle: '',
    editorPlaceholder: '',
    editorMaxlength: 20,
    editorMultiline: false,
    editorDraft: '',
    editorCount: 0
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
  }
});
