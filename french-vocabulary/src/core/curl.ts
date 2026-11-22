import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const quote = (value: string) =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n")}"`;
/** GET-only fetch adapter. Secrets travel through stdin, never command arguments. */
export const curlFetch: typeof fetch = async (input, init = {}) => {
  const url = String(input);
  if (new URL(url).protocol !== "https:") throw Error("HTTPS required.");
  if (init.method && init.method !== "GET")
    throw Error("Speech transport supports GET only.");
  const root = await mkdtemp(join(tmpdir(), "fv-speech-"));
  try {
    const body = join(root, "audio"),
      head = join(root, "headers");
    const config = [
      `url = ${quote(url)}`,
      "silent",
      "show-error",
      "compressed",
      "max-time = 25",
      "max-filesize = 20971520",
      `output = ${quote(body)}`,
      `dump-header = ${quote(head)}`,
      ...Object.entries(init.headers ?? {}).map(
        ([k, v]) => `header = ${quote(`${k}: ${v}`)}`,
      ),
    ].join("\n");
    await new Promise<void>((resolve, reject) => {
      const child = spawn("/usr/bin/curl", ["-q", "--config", "-"], {
        stdio: ["pipe", "ignore", "ignore"],
      });
      let settled = false;
      const finish = (e?: Error) => {
        if (settled) return;
        settled = true;
        init.signal?.removeEventListener("abort", abort);
        if (e) reject(e);
        else resolve();
      };
      const abort = () => {
        child.kill();
        finish(Error("Speech request cancelled."));
      };
      if (init.signal?.aborted) {
        abort();
        return;
      }
      init.signal?.addEventListener("abort", abort, { once: true });
      child.on("error", () => finish(Error("Cannot start system curl.")));
      child.on("close", (code) =>
        finish(
          code === 0
            ? undefined
            : Error(`System curl failed (code ${code ?? "unknown"}).`),
        ),
      );
      child.stdin.on("error", () => {});
      child.stdin.end(config + "\n");
    });
    const raw = await readFile(head, "utf8");
    const blocks = raw.split(/\r?\n\r?\n/).filter((x) => /^HTTP\//u.test(x));
    const lines = blocks.at(-1)?.split(/\r?\n/) ?? [];
    const status = Number(lines[0]?.split(" ")[1]);
    if (status < 100 || status > 599 || !status)
      throw Error("Invalid curl HTTP response.");
    const headers = new Headers();
    for (const line of lines.slice(1)) {
      const i = line.indexOf(":");
      if (i > 0)
        headers.append(line.slice(0, i).trim(), line.slice(i + 1).trim());
    }
    const bytes = await readFile(body);
    return new Response(
      [204, 205, 304].includes(status) ? null : new Uint8Array(bytes),
      { status, headers },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};
