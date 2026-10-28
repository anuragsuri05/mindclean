import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson } from "./json.ts";

test("extractJson handles bare JSON, fences, and preambles", () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('Here you go:\n```json\n{"a":{"b":[1,2]}}\n```'), { a: { b: [1, 2] } });
  assert.deepEqual(extractJson('Sure! {"pace":"steady"} Hope that helps.'), { pace: "steady" });
  assert.throws(() => extractJson("no json here"));
});
