import test from "node:test";
import assert from "node:assert/strict";
import { providerErrorDetail, AIRequestError } from "../src/ai/provider-error";
test("provider diagnostics retain model errors but redact credentials", async () => {
  const response = new Response(
    JSON.stringify({
      error: {
        message:
          "models/example is not found for generateContent; key=secret-key",
      },
    }),
    { status: 404 },
  );
  const text = await providerErrorDetail(response, "secret-key");
  assert.match(text, /not found/);
  assert.ok(!text.includes("secret-key"));
  const error = new AIRequestError(404, "gemini", "example", text);
  assert.equal(error.status, 404);
  assert.match(error.message, /gemini \/ example/);
});
test("non-JSON and oversized error bodies are not exposed", async () => {
  assert.equal(
    await providerErrorDetail(new Response("<html>private page</html>"), ""),
    "No structured provider error details.",
  );
  const result = await providerErrorDetail(new Response("x".repeat(20000)), "");
  assert.ok(result.length < 601);
});
