import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("related group navigation is available from Browse and practice without replacing session state", () => {
  for (const file of ["../src/components/word.tsx", "../src/practice.tsx"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.ok(source.includes('title="Confusion Groups"'));
    assert.ok(source.includes("push(<RelatedConfusionGroups"));
  }
});
test("related group views exclude review history and only show groups containing the word", () => {
  const source = readFileSync(
    new URL("../src/components/related-confusion-groups.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes("useLibrary(false)"));
  assert.ok(source.includes("g.wordIds.includes(wordId)"));
  assert.ok(source.includes('title="Open Group Details"'));
  assert.ok(source.includes("<GroupDetails groupId={group.id} />"));
  assert.ok(source.includes('title="Add to Confusion Group"'));
  assert.ok(source.includes("onSaved={refresh}"));
  assert.equal((source.match(/\{addAction\}/g) ?? []).length, 2);
  assert.ok(!source.includes("store.mutate"));
});
