/** 昵称排序用首字母（拼音首字母 / 英文字母 / #） */
const SURNAME_LETTER = {
  阿: "A",
  艾: "A",
  安: "A",
  白: "B",
  陈: "C",
  程: "C",
  曹: "C",
  崔: "C",
  邓: "D",
  丁: "D",
  董: "D",
  杜: "D",
  范: "F",
  方: "F",
  冯: "F",
  高: "G",
  郭: "G",
  韩: "H",
  何: "H",
  胡: "H",
  黄: "H",
  贾: "J",
  蒋: "J",
  金: "J",
  孔: "K",
  赖: "L",
  雷: "L",
  李: "L",
  梁: "L",
  林: "L",
  刘: "L",
  卢: "L",
  罗: "L",
  吕: "L",
  马: "M",
  毛: "M",
  孟: "M",
  倪: "N",
  宁: "N",
  欧: "O",
  潘: "P",
  彭: "P",
  齐: "Q",
  钱: "Q",
  秦: "Q",
  邱: "Q",
  任: "R",
  沈: "S",
  施: "S",
  石: "S",
  宋: "S",
  苏: "S",
  孙: "S",
  谭: "T",
  唐: "T",
  陶: "T",
  田: "T",
  汪: "W",
  王: "W",
  魏: "W",
  吴: "W",
  伍: "W",
  夏: "X",
  肖: "X",
  谢: "X",
  徐: "X",
  许: "X",
  薛: "X",
  严: "Y",
  杨: "Y",
  叶: "Y",
  易: "Y",
  尹: "Y",
  于: "Y",
  余: "Y",
  袁: "Y",
  岳: "Y",
  曾: "Z",
  张: "Z",
  赵: "Z",
  郑: "Z",
  钟: "Z",
  周: "Z",
  朱: "Z",
  邹: "Z",
  老: "L",
  小: "X"
};

function letterOf(name) {
  const raw = String(name || "").trim();
  if (!raw) return "#";
  const ch = raw.charAt(0);
  if (/[A-Za-z]/.test(ch)) return ch.toUpperCase();
  if (/[0-9]/.test(ch)) return "#";
  if (SURNAME_LETTER[ch]) return SURNAME_LETTER[ch];
  // 次字兜底（如「阿凯」→ 凯）
  if (raw.length > 1 && SURNAME_LETTER[raw.charAt(1)]) {
    return SURNAME_LETTER[raw.charAt(1)];
  }
  return "#";
}

function sortByLetterName(list) {
  return (list || []).slice().sort(function (a, b) {
    const la = letterOf(a.name);
    const lb = letterOf(b.name);
    if (la !== lb) {
      if (la === "#") return 1;
      if (lb === "#") return -1;
      return la < lb ? -1 : 1;
    }
    return String(a.name || "").localeCompare(String(b.name || ""), "zh");
  });
}

function groupByLetter(list) {
  const sorted = sortByLetterName(list);
  const groups = [];
  const map = {};
  sorted.forEach(function (item) {
    const letter = letterOf(item.name);
    if (!map[letter]) {
      map[letter] = { letter: letter, players: [] };
      groups.push(map[letter]);
    }
    map[letter].players.push(item);
  });
  return groups;
}

module.exports = {
  letterOf: letterOf,
  sortByLetterName: sortByLetterName,
  groupByLetter: groupByLetter
};
