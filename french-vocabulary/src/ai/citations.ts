export type SearchOutput = {
  type?: string;
  content?: {
    type?: string;
    text?: string;
    annotations?: {
      type?: string;
      url?: string;
      start_index?: number;
      end_index?: number;
    }[];
  }[];
};
export function groundedHistory(output: SearchOutput[]) {
  if (!output.some((o) => o.type === "web_search_call"))
    throw Error(
      "No web search was performed. Historical content was not accepted.",
    );
  const paragraphs: string[] = [];
  let sources = 0;
  for (const item of output)
    for (const part of item.type === "message" ? (item.content ?? []) : []) {
      if (part.type !== "output_text" || !part.text) continue;
      let text = part.text;
      const annotations = (part.annotations ?? []).filter(
        (a) =>
          a.type === "url_citation" &&
          a.url?.startsWith("https://") &&
          Number.isInteger(a.end_index),
      );
      for (const a of [...annotations].sort(
        (a, b) => (b.end_index ?? 0) - (a.end_index ?? 0),
      )) {
        const end = a.end_index!;
        if (end < 0 || end > text.length) continue;
        const link =
          " [" +
          ++sources +
          "](" +
          a.url!.replace(/[()\s]/g, encodeURIComponent) +
          ")";
        text = text.slice(0, end) + link + text.slice(end);
      }
      paragraphs.push(text);
    }
  if (!sources)
    throw Error(
      "No sourced citations were returned. Historical content was not accepted.",
    );
  const text =
    "Source-backed AI draft — check the linked sources before saving.\n\n" +
    paragraphs.join("\n\n");
  if (text.length > 6000)
    throw Error("Historical draft is too long; try again.");
  return [{ text }];
}
