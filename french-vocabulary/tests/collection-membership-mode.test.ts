import test from "node:test";
import assert from "node:assert/strict";
import {
  mixedCollectionMembership,
  applyMembershipEdits,
} from "../src/core/collection-membership";
import { emptyLibrary } from "../src/core/model";
test("only identical full memberships allow editing, including unassigned selections", () => {
  const collections = [
    { id: "a", name: "A", wordIds: ["1", "2"] },
    { id: "b", name: "B", wordIds: ["1", "2"] },
  ];
  assert.equal(mixedCollectionMembership(collections, ["1", "2"]), false);
  assert.equal(mixedCollectionMembership(collections, ["3", "4"]), false);
  assert.equal(mixedCollectionMembership(collections, ["1"]), false);
  collections[1].wordIds = ["1"];
  assert.equal(mixedCollectionMembership(collections, ["1", "2"]), true);
  assert.equal(mixedCollectionMembership(collections, ["1", "3"]), true);
  assert.equal(mixedCollectionMembership(collections, []), false);
});
test("add-only saves preserve existing memberships and reject all removals before mutation", () => {
  const lib = emptyLibrary();
  lib.settings = {
    collections: [
      { id: "a", name: "A", wordIds: ["1"] },
      { id: "b", name: "B", wordIds: ["2"] },
    ],
  };
  const before = structuredClone(lib.settings.collections!);
  assert.throws(
    () =>
      applyMembershipEdits(
        lib,
        ["1", "2"],
        { a: true, b: false },
        before,
        true,
      ),
    /only support adding/,
  );
  assert.deepEqual(lib.settings.collections, before);
  applyMembershipEdits(lib, ["1", "2"], { a: true }, before, true);
  assert.deepEqual(
    lib.settings.collections?.map((c) => c.wordIds),
    [["1", "2"], ["2"]],
  );
});
