const ONES = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"];
const TEENS = ["dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
const TENS = ["", "dix", "vingt", "trente", "quarante", "cinquant", "soixante", "soixante-dix", "quatre-vingt", "quatre-vingt-dix"];

export function toFrenchCardinal(n: number): string {
  if (n < 0 || n > 999999999) return "数字超出范围";
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  if (n < 70) {
    const ten = Math.floor(n / 10);
    const unit = n % 10;
    if (unit === 0) return TENS[ten] + (ten === 5 ? "e" : "");
    if (unit === 1) return `${TENS[ten]}${ten === 5 ? "e" : ""} et un`;
    return `${TENS[ten]}${ten === 5 ? "e" : " "}-${ONES[unit]}`;
  }
  if (n < 80) {
    const unit = n - 60;
    if (unit === 11) return "soixante et onze";
    return `soixante-${TEENS[unit - 10]}`;
  }
  if (n < 90) {
    const unit = n - 80;
    if (unit === 0) return "quatre-vingts";
    return `quatre-vingt-${ONES[unit]}`;
  }
  if (n < 100) {
    const unit = n - 90;
    return `quatre-vingt-${TEENS[unit]}`;
  }
  if (n === 100) return "cent";
  if (n < 200) return `cent ${toFrenchCardinal(n - 100)}`;
  if (n < 1000) {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    const prefix = `${ONES[hundred]} cent${rest === 0 ? "s" : ""}`;
    return rest === 0 ? prefix : `${ONES[hundred]} cent ${toFrenchCardinal(rest)}`;
  }
  if (n === 1000) return "mille";
  if (n < 1000000) {
    const thousand = Math.floor(n / 1000);
    const rest = n % 1000;
    const prefix = thousand === 1 ? "mille" : `${toFrenchCardinal(thousand)} mille`;
    return rest === 0 ? prefix : `${prefix} ${toFrenchCardinal(rest)}`;
  }
  return n.toLocaleString();
}

export function toFrenchOrdinal(n: number): string {
  if (n === 1) return "premier / première";
  const cardinal = toFrenchCardinal(n);
  if (cardinal.endsWith("e")) return cardinal.slice(0, -1) + "ième";
  if (cardinal.endsWith("q")) return cardinal + "uième";
  if (cardinal.endsWith("f")) return cardinal.slice(0, -1) + "vième";
  if (cardinal.endsWith("s")) return cardinal.slice(0, -1) + "ième";
  return cardinal + "ième";
}

export function getFrenchApproximate(n: number): string | null {
  const approxMap: Record<number, string> = {
    10: "une dizaine (10个左右 / 十几个)",
    12: "une douzaine (一打 / 12个左右)",
    15: "une quinzaine (15个左右 / 两周左右)",
    20: "une vingtaine (20个左右 / 20来岁)",
    30: "une trentaine (30个左右 / 30来岁)",
    40: "une quarantaine (40个左右 / 40来岁 / 隔离)",
    50: "une cinquantaine (50个左右)",
    60: "une soixantaine (60个左右)",
    100: "une centaine (100个左右 / 上百)",
    1000: "un meillier (1000左右 / 成千上万)",
  };
  return approxMap[n] || null;
}
