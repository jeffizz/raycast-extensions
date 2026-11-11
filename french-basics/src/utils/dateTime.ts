import { toFrenchCardinal } from "./numberToFrench";
import type { VocabItem } from "../data/vocabulary";

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const WEEKDAYS_ZH = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

type DateTimeSearch = { items: VocabItem[]; error?: string };

/** Recognize time/date-like input before the legacy parseInt-based number search. */
export function getDateTimeItems(input: string): DateTimeSearch | null {
  const text = input.trim();
  if (/^\d{1,2}:/.test(text)) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(text);
    if (!match) return { items: [], error: "请输入 24 小时制时间，例如 14:30 或 09:05" };
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return { items: [], error: "时间范围为 00:00–23:59" };
    const normalized = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const feminineNumber = (n: number) => toFrenchCardinal(n).replace(/\bun$/, "une");
    const hourText = `${feminineNumber(hour)} ${hour <= 1 ? "heure" : "heures"}`;
    const french = minute === 0 ? hourText : `${hourText} ${feminineNumber(minute)}`;
    const items: VocabItem[] = [{ id: `time-${normalized}`, category: "time", french, chinese: normalized }];
    if (minute === 0 && (hour === 0 || hour === 12)) {
      items.push({ id: `time-${normalized}-alternate`, category: "time", french: hour === 0 ? "minuit" : "midi", chinese: `${normalized} 常用说法` });
    }
    return { items };
  }
  if (/^\d{4}[-/]/.test(text)) {
    const match = /^(\d{4})([-/])(\d{1,2})\2(\d{1,2})$/.exec(text);
    if (!match) return { items: [], error: "请输入日期，例如 2024-02-29 或 2024/02/29" };
    const year = Number(match[1]);
    const month = Number(match[3]);
    const day = Number(match[4]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
      return { items: [], error: "日期不存在，请检查年月日和闰年" };
    }
    // Use UTC fields and setUTCFullYear explicitly: Date.UTC treats years 0–99 as 1900–1999.
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);
    const weekday = date.getUTCDay();
    const normalized = `${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayText = day === 1 ? "premier" : toFrenchCardinal(day);
    // Dates use ordinal-value years: cent and vingt do not take plural s.
    const yearText = toFrenchCardinal(year).replace(/\b(cent|vingt)s(?= mille\b|$)/g, "$1");
    return { items: [
      { id: `date-${normalized}`, category: "date", french: `le ${WEEKDAYS[weekday]} ${dayText} ${MONTHS[month - 1]} ${yearText}`, chinese: `${normalized} ${WEEKDAYS_ZH[weekday]}` },
    ] };
  }
  return null;
}
