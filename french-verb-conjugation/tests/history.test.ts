import { strict as assert } from "node:assert";
import { test } from "node:test";
import { LocalStorage } from "@raycast/api";
import { incrementPractices, loadLookupHistory, loadRecentPractices, loadStats, recordLookup } from "../src/mine";

test("lookup history tracks counts and most recent order independently", async () => {
  await LocalStorage.setItem("lookup-history", "[]");
  await Promise.all([recordLookup("pouvoir"), recordLookup("aller"), recordLookup("pouvoir")]);
  assert.deepEqual(await loadLookupHistory(), [
    { name: "pouvoir", count: 2 },
    { name: "aller", count: 1 },
  ]);
});

test("practice counts remain compatible and recent order follows checked verbs", async () => {
  await LocalStorage.setItem("practice-stats", JSON.stringify({ être: 3 }));
  await LocalStorage.setItem("practice-recent", "[]");
  await incrementPractices(["être", "être", "avoir"]);
  await incrementPractices(["aller"]);
  await incrementPractices(["être"]);
  assert.deepEqual(await loadStats(), { être: 5, avoir: 1, aller: 1 });
  assert.deepEqual(await loadRecentPractices(), ["être", "aller", "avoir"]);
  assert.deepEqual(await loadLookupHistory(), [
    { name: "pouvoir", count: 2 },
    { name: "aller", count: 1 },
  ]);
});
