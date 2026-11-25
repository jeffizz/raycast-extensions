import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cliEnvironment,
  codexArguments,
  parseCodexEvents,
  runCLI,
  checkCodex,
} from "../src/ai/codex-cli";
test("CLI environment excludes API credentials and inherited agent context", () => {
  const env = cliEnvironment({
    HOME: "/home/example",
    PATH: "/bin",
    OPENAI_API_KEY: "secret",
    DEEPSEEK_API_KEY: "secret",
    RAYCAST_API_KEY: "secret",
    CODEX_THREAD_ID: "old",
  });
  assert.deepEqual(env, { HOME: "/home/example", PATH: "/bin" });
  const args = codexArguments("/tmp/isolated");
  assert.ok(!args.includes("--model"));
  assert.ok(!codexArguments("/tmp/isolated", "  ").includes("--model"));
  const custom = codexArguments("/tmp/isolated", " test-model ");
  assert.equal(custom[custom.indexOf("--model") + 1], "test-model");
  for (const flag of [
    "--ignore-user-config",
    "--ignore-rules",
    "--ephemeral",
    "--json",
  ])
    assert.ok(args.includes(flag));
  assert.ok(
    args.includes(
      'permissions.vocabulary.filesystem={":minimal"="read",":workspace_roots"="read"}',
    ),
  );
  assert.ok(args.includes("permissions.vocabulary.network.enabled=false"));
  assert.ok(args.includes("features.shell_tool=false"));
  assert.ok(!args.includes("resume"));
});
test("CLI events use the shared candidate validator and preserve usage", () => {
  const raw = JSON.stringify({ items: [{ text: "A brief cue" }] });
  const events = [
    { type: "item.completed", item: { type: "agent_message", text: raw } },
    { type: "turn.completed", usage: { input_tokens: 10, output_tokens: 5 } },
  ]
    .map((e) => JSON.stringify(e))
    .join("\n");
  assert.equal(
    parseCodexEvents(events, "mnemonic").items[0].text,
    "A brief cue",
  );
  assert.deepEqual(parseCodexEvents(events, "mnemonic").usage, {
    input_tokens: 10,
    output_tokens: 5,
  });
  assert.throws(
    () =>
      parseCodexEvents(
        JSON.stringify({
          type: "item.completed",
          item: { type: "file_change" },
        }),
        "mnemonic",
      ),
    /tool operation/,
  );
  assert.throws(() => parseCodexEvents("", "mnemonic"), /no completed/);
});
test("subprocess transport handles stdin, stderr login, timeout and abort without shell interpolation", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-cli-test-"));
  try {
    const script = join(root, "fake-codex");
    await writeFile(
      script,
      "#!" +
        process.execPath +
        "\n" +
        String.raw`
const args=process.argv.slice(2);
if(args[0]==="login"){console.error("Logged in using ChatGPT");process.exit(0);}
if(args.includes("--help")){console.log("--ignore-user-config --ignore-rules --ephemeral --json");process.exit(0);}
if(args[0]==="hang"){setInterval(()=>{},1000);}
else {let input="";process.stdin.on("data",c=>input+=c);process.stdin.on("end",()=>console.log(input));}
`,
      { mode: 0o700 },
    );
    await checkCodex(script, root, AbortSignal.timeout(5000));
    const input = "école $(touch NEVER) 中文";
    assert.equal(
      (await runCLI(script, [], root, AbortSignal.timeout(5000), input)).trim(),
      input,
    );
    await assert.rejects(
      runCLI(script, ["hang"], root, new AbortController().signal, "", 30),
      /timed out/,
    );
    const controller = new AbortController();
    const pending = runCLI(script, ["hang"], root, controller.signal);
    controller.abort();
    await assert.rejects(pending, /cancelled/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
