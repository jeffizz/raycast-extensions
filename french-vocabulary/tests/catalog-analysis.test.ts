import test from "node:test";
import assert from "node:assert/strict";
import {
  validateAdvice,
  adviceRank,
  modelPrice,
} from "../src/ai/catalog-analysis";
import { parseModels, modelAssessment } from "../src/ai/model-catalog";
const models = [{ id: "new-model", name: "New" }];
const valid = {
  id: "new-model",
  status: "recommended",
  strengths: "Bilingual text",
  reason: "Provider description supports text.",
};
test("catalog advice rejects fabricated IDs, duplicate entries and invalid categories", () => {
  assert.equal(
    validateAdvice([JSON.stringify(valid)], models)[0].status,
    "recommended",
  );
  for (const bad of [
    { ...valid, id: "fabricated" },
    { ...valid, status: "disabled" },
    { ...valid, strengths: 1 },
  ]) {
    assert.throws(() => validateAdvice([JSON.stringify(bad)], models));
  }
  assert.throws(() =>
    validateAdvice([JSON.stringify(valid), JSON.stringify(valid)], models),
  );
});
test("AI disapproval never hard-disables a general text model and unknowns stay selectable", () => {
  assert.equal(modelAssessment(models[0]).blocked, false);
  assert.equal(adviceRank(models[0], undefined, false), 2);
  assert.equal(
    adviceRank(models[0], { ...valid, status: "not_recommended" }, false),
    3,
  );
  assert.equal(
    adviceRank(models[0], { ...valid, status: "recommended" }, true),
    4,
  );
  assert.equal(
    modelAssessment({ id: "text-embedding-3-small", name: "Embedding" })
      .blocked,
    true,
  );
});
test("prices and descriptions come from provider metadata, not AI advice", () => {
  const [model] = parseModels("openrouter", {
    data: [
      {
        id: "new-model",
        description: "Text JSON",
        pricing: { prompt: "0.000001", completion: "0.000002" },
        supported_parameters: ["response_format"],
      },
    ],
  });
  assert.equal(model.description, "Text JSON");
  assert.match(modelPrice(model), /0.000001/);
  assert.match(modelPrice(models[0]), /not provided/);
  assert.ok(model.supportedParameters?.includes("response_format"));
});
