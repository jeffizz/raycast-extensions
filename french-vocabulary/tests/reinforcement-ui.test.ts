import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(
  new URL("../src/components/reinforcement-question.tsx", import.meta.url),
  "utf8",
);
const practice = readFileSync(
  new URL("../src/practice.tsx", import.meta.url),
  "utf8",
);

test("reinforcement always renders a full-width list with neutral initial focus", () => {
  assert.ok(!component.includes("<Detail"));
  assert.ok(component.includes("isShowingDetail={false}"));
  assert.ok(component.includes("useState<string>()"));
  assert.ok(component.includes('setSelected("question")'));
  assert.ok(component.includes('if (id !== "question") return'));
  assert.ok(component.includes("(rowsReady ? choices : [])"));
  assert.ok(
    component.indexOf('"Submit Selected Answer"') <
      component.indexOf('title="Choose an Answer"'),
  );
  assert.ok(!component.includes("onAction={() => select(c)} />"));
});
test("choice rows share safe actions and explicitly identify outcome and correct answer", () => {
  assert.ok(component.includes("actions={actions()}"));
  assert.ok(component.includes('"Correct · Not Graded"'));
  assert.ok(component.includes('"Incorrect · Not Graded"'));
  assert.ok(component.includes('text: "Correct Answer"'));
  assert.ok(component.includes('text: "Your Answer"'));
});
test("the question row offers pronunciation as its primary action", () => {
  const question = component.slice(
    component.indexOf('id="question"'),
    component.indexOf(
      "{(rowsReady ? choices : []).map((c, i) => (\n        <List.Item",
    ),
  );
  assert.ok(question.includes("actions={actions(true)}"));
  assert.ok(
    component.indexOf('title="Speak Word"') <
      component.indexOf('title="Continue"'),
  );
  assert.ok(practice.includes("onSpeak={() => speakWord(challenge.word)}"));
});

test("reinforcement continuation restores pending question and rejects old list events", () => {
  assert.ok(practice.includes("setReturnToQuestionPending(!!queue[index])"));
  assert.ok(practice.includes("setSelected(queue[window.start]?.id)"));
  assert.ok(practice.includes("onAction={returnToCurrentQuestion}"));
  assert.ok(
    practice.includes("renderedSelectionEpoch !== selectionEpoch.current"),
  );
  assert.ok(!practice.includes("onToggleLayout="));
  assert.ok(!practice.includes("restoreQuestionFocus"));
  const navigation = practice.slice(
    practice.indexOf("const returnToCurrentQuestion ="),
    practice.indexOf("const actions ="),
  );
  assert.ok(navigation.includes("setSelected(q.id)"));
  assert.ok(navigation.includes("setReturnToQuestionPending(false)"));
  assert.ok(!navigation.includes("submit("));
  assert.ok(!navigation.includes("setRevealed("));
  assert.ok(
    component.includes(
      "selectedChoice ? select(selectedChoice) : instructions()",
    ),
  );
  const selectionHandler = component.slice(
    component.indexOf("onSelectionChange="),
    component.indexOf("searchBarPlaceholder="),
  );
  assert.ok(!selectionHandler.includes("select("));
  assert.ok(!selectionHandler.includes("onAnswer("));
});
