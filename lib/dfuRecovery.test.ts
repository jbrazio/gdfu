import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/page.tsx", "utf8");
const targets = readFileSync("components/TargetSection.tsx", "utf8");

// A failed run must keep its progress (errorMessage) so DfuSection shows the alert.
assert.doesNotMatch(page, /if \(value\.phase === "failed"\) \{\s*resetSession\(\);/);
assert.match(page, /value\.phase === "success" \|\| value\.phase === "failed" \|\| value\.phase === "cancelled"/);
assert.doesNotMatch(targets, /ttlSeconds/);
assert.doesNotMatch(targets, /<Chip/);
