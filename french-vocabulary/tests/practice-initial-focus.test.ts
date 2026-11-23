import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/practice.tsx", import.meta.url),
  "utf8",
);
test("practice initial selection targets only new sessions; resume uses Return navigation", () => {
  assert.ok(
    source.includes("useRef(initialProgress ? undefined : queue[0]?.id)"),
  );
  assert.ok(source.includes("useState(!!initialProgress)"));
  assert.ok(source.includes("setSelected(initialQuestionId.current)"));
  assert.ok(source.includes("if (id !== initialQuestionId.current) return"));
  assert.ok(
    source.includes(
      "!initialRowsPending || rowId === initialQuestionId.current",
    ),
  );
  assert.ok(source.includes("setInitialRowsPending(false)"));
});
test("first-entry initialization does not replace the manual reinforcement return fallback", () => {
  assert.ok(source.includes("setReturnToQuestionPending(!!queue[index])"));
  assert.ok(source.includes("setSelected(queue[window.start]?.id)"));
  const returnHandler = source.slice(
    source.indexOf("const returnToCurrentQuestion ="),
    source.indexOf("const actions ="),
  );
  assert.ok(returnHandler.includes("setSelected(q.id)"));
  assert.ok(!returnHandler.includes("setRevealed("));
  assert.ok(!returnHandler.includes("submit("));
});
