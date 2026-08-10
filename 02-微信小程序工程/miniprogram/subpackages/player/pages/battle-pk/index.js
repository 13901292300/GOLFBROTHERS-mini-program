/**
 * 战绩 PK：当前登录用户 VS 球员主页目标
 */
const { createHeaderStyle } = require('../../../../utils/headerEngine.js');
const playerBattlePk = require('../../../../utils/playerBattlePk.js');
const socialRelationStore = require('../../../../utils/socialRelationStore.js');
const playerDisplayName = require('../../../../utils/playerDisplayName.js');
const contactStore = require('../../../../utils/contactStore.js');
const publicPlayerProfile = require('../../../../utils/publicPlayerProfile.js');
const playerIdentityGuard = require('../../../../utils/playerIdentityGuard.js');

function safeDecode(raw) {
  if (raw == null) return '';
  const s = String(raw);
  try {
    return decodeURIComponent(s);
  } catch (e) {
    return s;
  }
}

function formatGross(n) {
  if (n == null || !Number.isFinite(Number(n))) return '--';
  return String(Math.floor(Number(n)));
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    pageState: 'loading',
    targetUserId: '',
    scope: playerBattlePk.PK_SCOPES.SAME_GAME,
    sampleSize: 10,
    viewerLabel: '我',
    targetLabel: '对方',
    targetOriginName: '',
    showOriginName: false,
    summary: {
      viewerWins: 0,
      targetWins: 0,
      draws: 0,
      viewerAverageGrossText: '--',
      targetAverageGrossText: '--',
      averageDifferenceLabel: '',
      viewerBestGrossText: '--',
      targetBestGrossText: '--'
    },
    trendText: '',
    matchCards: [],
    actualCount: 0,
    emptyText: '你们还没有共同完成的个人比杆赛'
  },

  onLoad(query) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    const q = query || {};
    const targetUserId = safeDecode(q.userId || q.targetUserId);
    this._samplesCache = null;
    this._revision = '';
    this._navigating = false;
    this.setData({
      targetUserId: targetUserId,
      scope: playerBattlePk.PK_SCOPES.SAME_GAME,
      sampleSize: 10
    });
    this._resolveDisplayNames(targetUserId);
    this.loadPk(true);
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
    if (!this.data.targetUserId) return;
    if (this.data.pageState === 'loading') return;
    // revision 未变则保留筛选与结果
    try {
      const playerMatchHistory = require('../../../../utils/playerMatchHistory.js');
      const rev = playerMatchHistory.getStoreRevision();
      if (this._revision && rev === this._revision) return;
    } catch (e) { /* ignore */ }
    this.loadPk(false);
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

  _resolveDisplayNames(targetUserId) {
    const me = socialRelationStore.resolveCurrentUserId();
    let viewerLabel = '我';
    try {
      const myProfile = publicPlayerProfile.resolvePublicPlayerProfile(me, {});
      const n = (myProfile && (myProfile.nickname || myProfile.displayName)) || '';
      if (n) viewerLabel = n;
    } catch (e) { /* ignore */ }

    let publicName = '';
    let avatar = '';
    try {
      const tp = publicPlayerProfile.resolvePublicPlayerProfile(targetUserId, {});
      publicName = (tp && (tp.nickname || tp.displayName)) || '';
      avatar = (tp && tp.avatar) || '';
    } catch (e2) { /* ignore */ }

    let remarkMap = {};
    try {
      remarkMap = playerDisplayName.buildRemarkNameMap(me, [targetUserId]) || {};
    } catch (e3) {
      try {
        const remark = contactStore.getPrivateRemark(me, targetUserId);
        if (remark && remark.remarkName) {
          remarkMap[targetUserId] = String(remark.remarkName).trim();
        }
      } catch (e4) { /* ignore */ }
    }

    const named = playerDisplayName.resolvePlayerDisplayNameForViewer({
      viewerUserId: me,
      targetUserId: targetUserId,
      publicName: publicName || '球友',
      snapshotName: '',
      remarkNameMap: remarkMap,
      defaultName: '球友'
    });

    this._targetAvatar = avatar;
    this.setData({
      viewerLabel: viewerLabel || '我',
      targetLabel: named.displayName || '对方',
      targetOriginName: named.originalName || publicName || '',
      showOriginName: !!named.hasRemark
    });
  },

  loadPk(showLoading) {
    const targetUserId = this.data.targetUserId;
    if (!playerIdentityGuard.isStablePublicUserId(targetUserId)) {
      this.setData({ pageState: 'error' });
      return;
    }
    if (showLoading) this.setData({ pageState: 'loading' });
    try {
      const me = socialRelationStore.resolveCurrentUserId();
      let profile = null;
      try {
        profile = publicPlayerProfile.resolvePublicPlayerProfile(targetUserId, {});
      } catch (e) {
        profile = null;
      }
      const bundle = playerBattlePk.buildPlayerBattlePk({
        viewerUserId: me,
        targetUserId: targetUserId,
        scope: this.data.scope,
        sampleSize: this.data.sampleSize,
        profile: profile,
        cached: this._samplesCache
      });
      this._revision = bundle.revision || '';
      if (bundle.samplesCache) this._samplesCache = bundle.samplesCache;

      if (bundle.access && !bundle.access.canPk) {
        if (bundle.access.reason === 'history_private' || bundle.access.reason === 'target_private') {
          this.setData({ pageState: 'private' });
          return;
        }
        if (bundle.access.reason === 'self') {
          this.setData({ pageState: 'error' });
          return;
        }
        this.setData({ pageState: 'error' });
        return;
      }

      const summary = bundle.summary || {};
      const matches = Array.isArray(bundle.matches) ? bundle.matches : [];
      const cards = matches.map((m) => ({
        matchKey: m.matchKey,
        dateLabel: m.dateLabel || '日期缺失',
        matchName: m.matchName || '',
        courseName: m.courseName || '',
        scopeTag: m.isSameGroup ? '同组' : '同场',
        viewerGrossText: formatGross(m.viewerGross),
        targetGrossText: formatGross(m.targetGross),
        diffText:
          m.difference === 0
            ? '持平'
            : m.difference > 0
              ? '你胜 ' + m.difference + ' 杆'
              : '对方胜 ' + Math.abs(m.difference) + ' 杆',
        resultText: m.result === 'win' ? '胜' : m.result === 'loss' ? '负' : '平',
        resultClass:
          m.result === 'win' ? 'is-win' : m.result === 'loss' ? 'is-loss' : 'is-draw',
        navUrl: m.navUrl || '',
        hasNav: !!(m.navUrl && m.matchId)
      }));

      const emptyText =
        this.data.scope === playerBattlePk.PK_SCOPES.SAME_GROUP
          ? '你们还没有共同完成的同组个人比杆赛'
          : '你们还没有共同完成的个人比杆赛';

      this.setData({
        pageState: matches.length ? 'ready' : 'empty',
        actualCount: bundle.actualCount || 0,
        emptyText: emptyText,
        trendText: (bundle.trend || []).join('｜'),
        matchCards: cards,
        summary: {
          viewerWins: summary.viewerWins || 0,
          targetWins: summary.targetWins || 0,
          draws: summary.draws || 0,
          viewerAverageGrossText:
            summary.viewerAverageGross != null
              ? String(summary.viewerAverageGross)
              : '--',
          targetAverageGrossText:
            summary.targetAverageGross != null
              ? String(summary.targetAverageGross)
              : '--',
          averageDifferenceLabel: summary.averageDifferenceLabel || '',
          viewerBestGrossText:
            summary.viewerBestGross != null ? String(summary.viewerBestGross) : '--',
          targetBestGrossText:
            summary.targetBestGross != null ? String(summary.targetBestGross) : '--'
        }
      });
    } catch (err) {
      console.warn('[battle-pk] error', err && err.message);
      this.setData({ pageState: 'error', matchCards: [] });
    }
  },

  onSelectScope(e) {
    const scope =
      (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.scope) ||
      playerBattlePk.PK_SCOPES.SAME_GAME;
    if (scope === this.data.scope) return;
    this.setData({ scope: scope });
    this.loadPk(false);
  },

  onSelectSample(e) {
    const n = Number(
      e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.size
    );
    const size = n === 20 ? 20 : 10;
    if (size === this.data.sampleSize) return;
    this.setData({ sampleSize: size });
    this.loadPk(false);
  },

  onTapMatch(e) {
    const url =
      (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.url) ||
      '';
    if (!url) {
      wx.showToast({ title: '暂无赛事详情', icon: 'none' });
      return;
    }
    if (this._navigating) return;
    this._navigating = true;
    const self = this;
    wx.navigateTo({
      url: url,
      complete: function () {
        self._navigating = false;
      }
    });
  },

  onRetry() {
    this._samplesCache = null;
    this.loadPk(true);
  },

  onBack() {
    wx.navigateBack({
      fail: () => wx.redirectTo({ url: '/pages/home/index' })
    });
  }
});
