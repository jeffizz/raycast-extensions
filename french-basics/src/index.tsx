import { useState } from "react";
import { Grid, ActionPanel, Action, showToast, Toast, Icon, environment } from "@raycast/api";
import { playFrenchSpeech, playLocalAudio } from "./tts";
import { VOCAB_DATA, VocabItem } from "./data/vocabulary";
import { toFrenchCardinal, toFrenchOrdinal, getFrenchApproximate } from "./utils/numberToFrench";
import { getDateTimeItems } from "./utils/dateTime";
import path from "path";

const CATEGORY_NAMES: Record<string, string> = {
  cardinal: "🔢 基数词",
  ordinal: "🥇 序数词",
  approx: "📦 概数名词",
  time: "🕒 时间表达",
  date: "📆 日期表达",
  week: "📅 星期",
  month: "🗓️ 月份",
  color: "🎨 颜色",
  alphabet: "🔤 26个字母",
};

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(text: string, maxCharsPerLine: number = 14): string[] {
  if (text.length <= maxCharsPerLine) return [text];
  const words = text.split(/(?<=[- ])|(?=[ -])/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + word).length <= maxCharsPerLine) {
      currentLine += word;
    } else {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine.trim());
  return lines.length > 0 ? lines : [text];
}

function cardToSvgDataUrl(french: string, phonetic?: string, chinese?: string): string {
  const frenchLines = wrapText(french, 14);
  const chineseLines = chinese ? wrapText(chinese, 12) : [];
  const safePhonetic = phonetic ? escapeXml(phonetic) : "";

  // Long dates need tighter line spacing and smaller text to fit in a grid card.
  const totalElements = frenchLines.length + (phonetic ? 1 : 0) + chineseLines.length;
  const lineHeight = Math.min(46, 216 / Math.max(totalElements, 1));
  const longestFrench = Math.max(...frenchLines.map((line) => line.length), 1);
  const frenchFontSize = Math.min(34, lineHeight * 0.8, 280 / (longestFrench * 0.7));
  const secondaryFontSize = Math.min(22, lineHeight * 0.7);
  let contentSvg = "";
  let currentY = (240 - lineHeight * (totalElements - 1)) / 2;

  for (const line of frenchLines) {
    contentSvg += `<text x="50%" y="${currentY}" dominant-baseline="middle" text-anchor="middle" font-size="${frenchFontSize}" font-weight="900" fill="#0F172A" font-family="system-ui, -apple-system, sans-serif">${escapeXml(line)}</text>`;
    currentY += lineHeight;
  }

  if (safePhonetic) {
    contentSvg += `<text x="50%" y="${currentY}" dominant-baseline="middle" text-anchor="middle" font-size="${secondaryFontSize}" font-weight="600" fill="#475569" font-family="system-ui, -apple-system, sans-serif">${safePhonetic}</text>`;
    currentY += lineHeight;
  }

  for (const line of chineseLines) {
    contentSvg += `<text x="50%" y="${currentY}" dominant-baseline="middle" text-anchor="middle" font-size="${secondaryFontSize}" font-weight="800" fill="#D97706" font-family="system-ui, -apple-system, sans-serif">${escapeXml(line)}</text>`;
    currentY += lineHeight;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="240" viewBox="0 0 300 240">
    <rect width="100%" height="100%" fill="none"/>
    ${contentSvg}
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function colorCardToSvgDataUrl(french: string, chinese: string, colorHex: string): string {
  const frenchLines = wrapText(french, 14);

  const strokeAttr = (colorHex.toUpperCase() === "#FFFFFF" || colorHex.toUpperCase() === "#E5E7EB")
    ? 'stroke="#CBD5E1" stroke-width="4"'
    : '';

  let contentSvg = "";
  contentSvg += `<circle cx="150" cy="65" r="36" fill="${colorHex}" ${strokeAttr} />`;

  let currentY = 56;
  for (const line of frenchLines) {
    contentSvg += `<text x="50%" y="${currentY}%" dominant-baseline="middle" text-anchor="middle" font-size="28" font-weight="900" fill="#0F172A" font-family="system-ui, -apple-system, sans-serif">${escapeXml(line)}</text>`;
    currentY += 18;
  }

  contentSvg += `<text x="50%" y="${currentY}%" dominant-baseline="middle" text-anchor="middle" font-size="22" font-weight="800" fill="#D97706" font-family="system-ui, -apple-system, sans-serif">${escapeXml(chinese)}</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="240" viewBox="0 0 300 240">
    <rect width="100%" height="100%" fill="none"/>
    ${contentSvg}
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default function Command() {
  const [searchText, setSearchText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  async function handlePlay(item: VocabItem) {
    try {
      if (item.localAudioFile) {
        const absolutePath = path.join(environment.assetsPath, item.localAudioFile);
        await playLocalAudio(absolutePath);
      } else {
        await showToast({ style: Toast.Style.Animated, title: "正在朗读..." });
        const cleanText = item.french.split("/")[0].trim();
        await playFrenchSpeech(cleanText);
        await showToast({ style: Toast.Style.Success, title: "朗读完成" });
      }
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "朗读失败",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const dateTimeResult = getDateTimeItems(searchText);
  const parsedNumber = parseInt(searchText.trim(), 10);
  const isInputNumber = !dateTimeResult && !isNaN(parsedNumber) && parsedNumber >= 0;

  const dynamicItems: VocabItem[] = [];
  if (isInputNumber) {
    dynamicItems.push({
      id: `dyn-cardinal-${parsedNumber}`,
      category: "cardinal",
      french: toFrenchCardinal(parsedNumber),
      chinese: `基数词: ${parsedNumber}`,
    });
    dynamicItems.push({
      id: `dyn-ordinal-${parsedNumber}`,
      category: "ordinal",
      french: toFrenchOrdinal(parsedNumber),
      chinese: `序数词: 第${parsedNumber}`,
    });
    const approx = getFrenchApproximate(parsedNumber);
    if (approx) {
      dynamicItems.push({
        id: `dyn-approx-${parsedNumber}`,
        category: "approx",
        french: approx.split(" ")[0] + " " + approx.split(" ")[1],
        chinese: `概数: ${approx}`,
      });
    }
  }

  const query = searchText.trim().toLocaleLowerCase();
  const displayItems = dateTimeResult
    ? dateTimeResult.items
    : isInputNumber
      ? dynamicItems
      : VOCAB_DATA.filter((item) =>
          (categoryFilter === "all" || item.category === categoryFilter) &&
          (!query || [item.french, item.chinese, item.phonetic ?? ""].some((value) => value.toLocaleLowerCase().includes(query)))
        );

  const categoriesPresent = Array.from(new Set(displayItems.map((item) => item.category)));

  return (
    <Grid
      itemSize={Grid.ItemSize.Medium}
      inset={Grid.Inset.Zero}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
      searchBarPlaceholder="搜索词汇，或输入数字、14:30、2024-02-29"
      searchBarAccessory={
        <Grid.Dropdown tooltip="筛选词汇分类" onChange={setCategoryFilter}>
          <Grid.Dropdown.Item title="全部分类" value="all" />
          <Grid.Dropdown.Item title="🔢 基数词" value="cardinal" />
          <Grid.Dropdown.Item title="🥇 序数词" value="ordinal" />
          <Grid.Dropdown.Item title="📦 概数名词" value="approx" />
          <Grid.Dropdown.Item title="🕒 时间表达" value="time" />
          <Grid.Dropdown.Item title="📆 日期表达" value="date" />
          <Grid.Dropdown.Item title="📅 星期" value="week" />
          <Grid.Dropdown.Item title="🗓️ 月份" value="month" />
          <Grid.Dropdown.Item title="🎨 颜色" value="color" />
          <Grid.Dropdown.Item title="🔤 26个字母" value="alphabet" />
        </Grid.Dropdown>
      }
    >
      {dateTimeResult?.error && <Grid.EmptyView title="无法识别时间或日期" description={dateTimeResult.error} />}
      {categoriesPresent.map((catKey) => {
        const catItems = displayItems.filter((item) => item.category === catKey);
        const sectionTitle = CATEGORY_NAMES[catKey] || catKey;

        return (
          <Grid.Section key={catKey} title={sectionTitle}>
            {catItems.map((item) => {
              const isColor = item.category === "color" && item.colorHex;
              const contentSource = isColor
                ? colorCardToSvgDataUrl(item.french, item.chinese, item.colorHex!)
                : cardToSvgDataUrl(item.french, item.phonetic, item.chinese);

              return (
                <Grid.Item
                  key={item.id}
                  title={undefined}
                  subtitle={undefined}
                  content={contentSource}
                  actions={
                    <ActionPanel>
                      <Action
                        title="朗读发音"
                        icon={Icon.SpeakerHigh}
                        onAction={() => handlePlay(item)}
                      />
                      <Action.CopyToClipboard
                        title="复制法语单词"
                        content={item.french}
                        shortcut={{ modifiers: ["cmd"], key: "c" }}
                      />
                      {item.phonetic && (
                        <Action.CopyToClipboard
                          title="复制音标"
                          content={item.phonetic}
                          shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                        />
                      )}
                    </ActionPanel>
                  }
                />
              );
            })}
          </Grid.Section>
        );
      })}
    </Grid>
  );
}
