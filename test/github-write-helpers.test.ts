import test from "node:test";
import assert from "node:assert/strict";

import {
  extractIssueNumberFromUrl,
  isEligibleInteractionStatus,
  parseActionFromChosenIssueTitle,
  resolveAutomationIssueTitle
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

test("resolveAutomationIssueTitle prefers summary over stale chosen title", () => {
  const chosen = "[PR] Add simple FizzBuzz to workflow demo";
  const summary =
    "Add a dynamic programming example that counts ways to make 100 cents with 1, 10, 15, and 50 cent coins.";
  assert.equal(
    resolveAutomationIssueTitle(chosen, summary),
    "Add a dynamic programming example that counts ways to make 100 cents with 1, 10, 15,..."
  );
});

test("resolveAutomationIssueTitle falls back to chosen title when summary is too short", () => {
  assert.equal(resolveAutomationIssueTitle("[Issue] Improve logs", "Need this"), "Improve logs");
});
