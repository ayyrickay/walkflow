import test from "node:test";
import assert from "node:assert/strict";

import {
  extractIssueNumberFromUrl,
  isEligibleInteractionStatus,
  parseActionFromChosenIssueTitle
} from "../lib/skills/github-write";

test("isEligibleInteractionStatus is confirm-gated", () => {
  assert.equal(isEligibleInteractionStatus("approved"), true);
  assert.equal(isEligibleInteractionStatus("completed"), true);
  assert.equal(isEligibleInteractionStatus("proposed"), false);
  assert.equal(isEligibleInteractionStatus("needs_review"), false);
});

test("parseActionFromChosenIssueTitle detects PR prefixes", () => {
  assert.equal(parseActionFromChosenIssueTitle("[PR] Add oauth callback retries"), "pr");
  assert.equal(parseActionFromChosenIssueTitle("[Issue] Improve logs"), "issue");
  assert.equal(parseActionFromChosenIssueTitle("Improve logs"), "issue");
});

test("extractIssueNumberFromUrl parses canonical GitHub issue urls", () => {
  assert.equal(extractIssueNumberFromUrl("https://github.com/acme/walkflow/issues/123"), 123);
  assert.equal(extractIssueNumberFromUrl("https://github.com/acme/walkflow/issues/77/"), 77);
  assert.equal(extractIssueNumberFromUrl("https://github.com/acme/walkflow/pull/55"), null);
  assert.equal(extractIssueNumberFromUrl("not-a-url"), null);
});
