/**
 * 球队成员列表展示：字母分组 / 搜索 / 索引。
 * 行为对齐通讯录（contacts）的 letterFromPinyin、filterByKeyword、buildSections。
 */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function letterFromPinyin(pinyin) {
  const ch = String(pinyin || '').charAt(0).toUpperCase();
  if (ch >= 'A' && ch <= 'Z') return ch;
  return '#';
}

function filterMembersByKeyword(rows, keyword) {
  const q = String(keyword || '').trim().toLowerCase();
  if (!q) return (rows || []).slice();
  return (rows || []).filter(function (row) {
    const nickname = String((row && row.nickname) || '').toLowerCase();
    const displayName = String((row && row.displayName) || '').toLowerCase();
    const remark = String((row && row.remark) || '').toLowerCase();
    return (
      nickname.indexOf(q) !== -1 ||
      displayName.indexOf(q) !== -1 ||
      remark.indexOf(q) !== -1
    );
  });
}

function sortByLetter(rows) {
  return (rows || []).slice().sort(function (a, b) {
    const la = a && a.letter ? a.letter : '#';
    const lb = b && b.letter ? b.letter : '#';
    if (la !== lb) return la.localeCompare(lb);
    return String((a && a.sortPinyin) || '').localeCompare(String((b && b.sortPinyin) || ''));
  });
}

function buildSections(rows) {
  const map = {};
  (rows || []).forEach(function (row) {
    const key = (row && row.letter) || '#';
    if (!map[key]) map[key] = [];
    map[key].push(row);
  });
  return Object.keys(map)
    .sort(function (a, b) {
      if (a === '#') return 1;
      if (b === '#') return -1;
      return a.localeCompare(b);
    })
    .map(function (letter) {
      return {
        letter: letter,
        anchorId: 'sec-' + letter,
        items: map[letter]
      };
    });
}

function buildIndexLetters(sections) {
  const active = {};
  (sections || []).forEach(function (s) {
    if (s && s.letter) active[s.letter] = true;
  });
  return LETTERS.map(function (letter) {
    return {
      letter: letter,
      active: !!active[letter]
    };
  });
}

function buildMemberListView(members, keyword, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const q = String(keyword || '').trim();
  const searchMode = !!q;
  const sorted = sortByLetter(members || []);
  const filtered = filterMembersByKeyword(sorted, q);
  const sections = searchMode ? [] : buildSections(filtered);
  const indexLetters = searchMode ? [] : buildIndexLetters(sections);
  return {
    searchMode: searchMode,
    useLetterIndex: !searchMode,
    listCount: filtered.length,
    metaLabel: searchMode ? '搜索结果' : '球队成员',
    emptyText: searchMode ? '未找到相关用户' : '暂无成员',
    sections: searchMode ? [] : sections,
    flatRows: searchMode ? filtered : [],
    indexLetters: indexLetters
  };
}

module.exports = {
  LETTERS,
  letterFromPinyin,
  filterMembersByKeyword,
  sortByLetter,
  buildSections,
  buildIndexLetters,
  buildMemberListView
};
