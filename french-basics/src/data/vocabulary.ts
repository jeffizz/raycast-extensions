export interface VocabItem {
  id: string;
  category: "cardinal" | "ordinal" | "approx" | "month" | "week" | "color";
  french: string;
  phonetic?: string;
  chinese: string;
  colorHex?: string;
  note?: string;
}

export const VOCAB_DATA: VocabItem[] = [
  // --- 基数词 ---
  { id: "c1", category: "cardinal", french: "un / une", phonetic: "[œ̃] / [yn]", chinese: "1" },
  { id: "c2", category: "cardinal", french: "deux", phonetic: "[dø]", chinese: "2" },
  { id: "c3", category: "cardinal", french: "trois", phonetic: "[trwa]", chinese: "3" },
  { id: "c4", category: "cardinal", french: "quatre", phonetic: "[katr]", chinese: "4" },
  { id: "c5", category: "cardinal", french: "cinq", phonetic: "[sɛ̃k]", chinese: "5" },
  { id: "c6", category: "cardinal", french: "six", phonetic: "[sis]", chinese: "6" },
  { id: "c7", category: "cardinal", french: "sept", phonetic: "[sɛt]", chinese: "7" },
  { id: "c8", category: "cardinal", french: "huit", phonetic: "[ɥit]", chinese: "8" },
  { id: "c9", category: "cardinal", french: "neuf", phonetic: "[nœf]", chinese: "9" },
  { id: "c10", category: "cardinal", french: "dix", phonetic: "[dis]", chinese: "10" },
  { id: "c11", category: "cardinal", french: "onze", phonetic: "[ɔ̃z]", chinese: "11" },
  { id: "c12", category: "cardinal", french: "douze", phonetic: "[duz]", chinese: "12" },
  { id: "c13", category: "cardinal", french: "treize", phonetic: "[trɛz]", chinese: "13" },
  { id: "c14", category: "cardinal", french: "quatorze", phonetic: "[ka.tɔrz]", chinese: "14" },
  { id: "c15", category: "cardinal", french: "quinze", phonetic: "[kɛ̃z]", chinese: "15" },
  { id: "c16", category: "cardinal", french: "seize", phonetic: "[sɛz]", chinese: "16" },
  { id: "c17", category: "cardinal", french: "dix-sept", phonetic: "[dis.sɛt]", chinese: "17" },
  { id: "c18", category: "cardinal", french: "dix-huit", phonetic: "[diz.ɥit]", chinese: "18" },
  { id: "c19", category: "cardinal", french: "dix-neuf", phonetic: "[diz.nœf]", chinese: "19" },
  { id: "c20", category: "cardinal", french: "vingt", phonetic: "[vɛ̃]", chinese: "20" },
  { id: "c21", category: "cardinal", french: "vingt et un", phonetic: "[vɛ̃.te.œ̃]", chinese: "21" },
  { id: "c30", category: "cardinal", french: "trente", phonetic: "[trɑ̃t]", chinese: "30" },
  { id: "c40", category: "cardinal", french: "quarante", phonetic: "[ka.ʁɑ̃t]", chinese: "40" },
  { id: "c50", category: "cardinal", french: "cinquante", phonetic: "[sɛ̃.kɑ̃t]", chinese: "50" },
  { id: "c60", category: "cardinal", french: "soixante", phonetic: "[swas.ɑ̃t]", chinese: "60" },
  { id: "c70", category: "cardinal", french: "soixante-dix", phonetic: "[swas.ɑ̃t.dis]", chinese: "70 (60+10)" },
  { id: "c71", category: "cardinal", french: "soixante et onze", phonetic: "[swas.ɑ̃t.e.ɔ̃z]", chinese: "71 (60+11)" },
  { id: "c80", category: "cardinal", french: "quatre-vingts", phonetic: "[ka.trə.vɛ̃]", chinese: "80 (4×20)" },
  { id: "c81", category: "cardinal", french: "quatre-vingt-un", phonetic: "[ka.trə.vɛ̃.œ̃]", chinese: "81" },
  { id: "c90", category: "cardinal", french: "quatre-vingt-dix", phonetic: "[ka.trə.vɛ̃.dis]", chinese: "90 (4×20+10)" },
  { id: "c91", category: "cardinal", french: "quatre-vingt-onze", phonetic: "[ka.trə.vɛ̃.ɔ̃z]", chinese: "91" },
  { id: "c100", category: "cardinal", french: "cent", phonetic: "[sɑ̃]", chinese: "100 (百)" },
  { id: "c1000", category: "cardinal", french: "mille", phonetic: "[mil]", chinese: "1 000 (千)" },
  { id: "c10000", category: "cardinal", french: "dix mille", phonetic: "[di.mil]", chinese: "10 000 (万)" },
  { id: "c1000000", category: "cardinal", french: "un million", phonetic: "[œ̃.mi.ljɔ̃]", chinese: "1 000 000 (百万)" },
  { id: "c100000000", category: "cardinal", french: "un milliard", phonetic: "[œ̃.mi.ljaʁ]", chinese: "1 000 000 000 (十亿)" },

  // --- 序数词 ---
  { id: "o1", category: "ordinal", french: "premier / première", phonetic: "[prə.mje] / [prə.mjɛʁ]", chinese: "第一 (1er / 1ère)" },
  { id: "o2", category: "ordinal", french: "deuxième / second", phonetic: "[dø.zjɛm] / [sə.ɡɔ̃]", chinese: "第二 (2e)" },
  { id: "o3", category: "ordinal", french: "troisième", phonetic: "[trwa.zjɛm]", chinese: "第三 (3e)" },
  { id: "o5", category: "ordinal", french: "cinquième", phonetic: "[sɛ̃.kjɛm]", chinese: "第五" },
  { id: "o9", category: "ordinal", french: "neuvième", phonetic: "[nø.vjɛm]", chinese: "第九" },
  { id: "o20", category: "ordinal", french: "vingtième", phonetic: "[vɛ̃.tjɛm]", chinese: "第二十 (20e)" },

  // --- 概数名词 ---
  { id: "a10", category: "approx", french: "une dizaine", phonetic: "[yn.di.zɛn]", chinese: "10个左右 / 十几个" },
  { id: "a12", category: "approx", french: "une douzaine", phonetic: "[yn.dou.zɛn]", chinese: "一打 / 12个左右" },
  { id: "a15", category: "approx", french: "une quinzaine", phonetic: "[yn.kɛ̃.zɛn]", chinese: "15个左右 / 两周左右" },
  { id: "a20", category: "approx", french: "une vingtaine", phonetic: "[yn.vɛ̃.tɛn]", chinese: "20个左右 / 20来岁" },
  { id: "a30", category: "approx", french: "une trentaine", phonetic: "[yn.trɑ̃.tɛn]", chinese: "30个左右 / 30来岁" },
  { id: "a40", category: "approx", french: "une quarantaine", phonetic: "[yn.ka.ʁɑ̃.tɛn]", chinese: "40个左右 / 隔离" },
  { id: "a50", category: "approx", french: "une cinquantaine", chinese: "50个左右" },
  { id: "a60", category: "approx", french: "une soixantaine", chinese: "60个左右" },
  { id: "a100", category: "approx", french: "une centaine", chinese: "100个左右 / 上百" },
  { id: "a1000", category: "approx", french: "un meillier", chinese: "1000左右 / 成千上万" },

  // --- 星期 ---
  { id: "w1", category: "week", french: "lundi", phonetic: "[lœ̃.di]", chinese: "星期一" },
  { id: "w2", category: "week", french: "mardi", phonetic: "[mar.di]", chinese: "星期二" },
  { id: "w3", category: "week", french: "mercredi", phonetic: "[mɛr.krə.di]", chinese: "星期三" },
  { id: "w4", category: "week", french: "jeudi", phonetic: "[ʒø.di]", chinese: "星期四" },
  { id: "w5", category: "week", french: "vendredi", phonetic: "[vɑ̃.drə.di]", chinese: "星期五" },
  { id: "w6", category: "week", french: "samedi", phonetic: "[sam.di]", chinese: "星期六" },
  { id: "w7", category: "week", french: "dimanche", phonetic: "[di.mɑ̃ʃ]", chinese: "星期日" },

  // --- 月份 ---
  { id: "m1", category: "month", french: "janvier", phonetic: "[ʒɑ̃.vje]", chinese: "一月" },
  { id: "m2", category: "month", french: "février", phonetic: "[fe.vri.je]", chinese: "二月" },
  { id: "m3", category: "month", french: "mars", phonetic: "[mars]", chinese: "三月" },
  { id: "m4", category: "month", french: "avril", phonetic: "[a.vril]", chinese: "四月" },
  { id: "m5", category: "month", french: "mai", phonetic: "[mɛ]", chinese: "五月" },
  { id: "m6", category: "month", french: "juin", phonetic: "[ʒɥɛ̃]", chinese: "六月" },
  { id: "m7", category: "month", french: "juillet", phonetic: "[ʒɥi.jɛ]", chinese: "七月" },
  { id: "m8", category: "month", french: "août", phonetic: "[ut]", chinese: "八月" },
  { id: "m9", category: "month", french: "septembre", phonetic: "[sɛp.tɑ̃br]", chinese: "九月" },
  { id: "m10", category: "month", french: "octobre", phonetic: "[ɔk.tɔbr]", chinese: "十月" },
  { id: "m11", category: "month", french: "novembre", phonetic: "[nɔ.vɑ̃br]", chinese: "十一月" },
  { id: "m12", category: "month", french: "décembre", phonetic: "[de.sɑ̃br]", chinese: "十二月" },

  // --- 颜色 ---
  { id: "col1", category: "color", french: "rouge", chinese: "红色", colorHex: "#FF3B30" },
  { id: "col2", category: "color", french: "bleu / bleue", chinese: "蓝色", colorHex: "#007AFF" },
  { id: "col3", category: "color", french: "vert / verte", chinese: "绿色", colorHex: "#34C759" },
  { id: "col4", category: "color", french: "jaune", chinese: "黄色", colorHex: "#FFCC00" },
  { id: "col5", category: "color", french: "noir / noire", chinese: "黑色", colorHex: "#000000" },
  { id: "col6", category: "color", french: "blanc / blanche", chinese: "白色", colorHex: "#FFFFFF" },
  { id: "col7", category: "color", french: "gris / grise", chinese: "灰色", colorHex: "#8E8E93" },
  { id: "col8", category: "color", french: "orange", chinese: "橙色", colorHex: "#FF9500" },
  { id: "col9", category: "color", french: "violet / violette", chinese: "紫色", colorHex: "#AF52DE" },
  { id: "col10", category: "color", french: "rose", chinese: "粉红色", colorHex: "#FF2D55" },
  { id: "col11", category: "color", french: "marron", chinese: "棕色", colorHex: "#A2845E" },
];
