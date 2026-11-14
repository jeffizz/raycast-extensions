export function speechRequest(text: string) {
  const url = new URL("https://api.frdic.com/api/v2/speech/speakweb");
  url.searchParams.set("langid", "fr");
  url.searchParams.set(
    "txt",
    `QYN${Buffer.from(text, "utf8").toString("base64")}`,
  );
  const headers: Record<string, string> = {
    accept: "*/*",
    "accept-language": "fr,zh-CN;q=0.9",
    "user-agent": "Mozilla/5.0",
    referer: "https://www.frdic.com/",
  };
  return { url, headers };
}
export function looksLikeAudio(b: Uint8Array) {
  return (
    b.length > 4 &&
    ((b[0] === 0xff && (b[1] & 0xe0) === 0xe0) ||
      Buffer.from(b.subarray(0, 3)).toString() === "ID3" ||
      ["RIFF", "OggS", "fLaC"].includes(
        Buffer.from(b.subarray(0, 4)).toString(),
      ) ||
      Buffer.from(b.subarray(4, 8)).toString() === "ftyp")
  );
}
export async function fetchSpeech(text: string, fetcher: typeof fetch = fetch) {
  let { url, headers } = speechRequest(text);
  const initialOrigin = url.origin;
  const signal = AbortSignal.timeout(25000);
  for (let redirects = 0; redirects <= 5; redirects++) {
    let response: Response;
    try {
      response = await fetcher(url, { headers, redirect: "manual", signal });
    } catch {
      throw Error(
        "Frdic connection failed or timed out. Check network, proxy, and certificate settings.",
      );
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location)
        throw Error(
          `Frdic redirect has no location (HTTP ${response.status}).`,
        );
      const next = new URL(location, url);
      if (next.protocol !== "https:" || next.username || next.password)
        throw Error("Frdic returned an unsafe audio redirect.");
      if (next.origin !== initialOrigin)
        headers = { accept: "*/*", "user-agent": headers["user-agent"] };
      url = next;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw Error(
        `Frdic HTTP ${response.status}${response.status === 429 ? ": rate limited" : ""}.`,
      );
    }
    const limit = 20 * 1024 * 1024;
    if (Number(response.headers.get("content-length") || 0) > limit) {
      await response.body?.cancel();
      throw Error("Frdic audio response is too large.");
    }
    const reader = response.body?.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    if (reader)
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > limit) {
          await reader.cancel();
          throw Error("Frdic audio response is too large.");
        }
        parts.push(part.value);
      }
    const data = Buffer.concat(parts);
    const type = response.headers.get("content-type") ?? "unknown";
    if (!looksLikeAudio(data) && !/^audio\//iu.test(type))
      throw Error(
        "Frdic returned no audio. The anonymous speech service returned an invalid response.",
      );
    if (data.length < 5) throw Error("Frdic returned empty audio.");
    return data;
  }
  throw Error("Frdic returned too many audio redirects.");
}
