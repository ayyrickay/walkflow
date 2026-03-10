import test from "node:test";
import assert from "node:assert/strict";

import type { GithubIssueRepoContext } from "../src/lib/github";
import { passesIssueQualityGate } from "../src/lib/openai/issue-writer";

const baseBody = [
  "## Issue Metadata",
  "- Type: feature",
  "",
  "## Executive Summary",
  "Add fizzbuzz example.",
  "",
  "## Scope",
  "- Add implementation.",
  "",
  "## Acceptance Criteria",
  "- [ ] Done",
  "",
  "## Expert Assistant Notes",
  "- Tentative: start small."
].join("\n");

test("quality gate requires repo grounding for non-empty repos", () => {
  const context: GithubIssueRepoContext = {
    repoFullName: "acme/repo",
    defaultBranch: "main",
    description: null,
    topLevelPaths: ["src"],
    readmeExcerpt: null,
    matchedFiles: [{ path: "src/fizzbuzz.ts", snippet: "export function fizzbuzz() {}" }],
    isLikelyEmpty: false,
    notes: []
  };

  const withoutReference = passesIssueQualityGate(
    { issueType: "feature", title: "Add fizzbuzz", body: baseBody },
    context
  );
  assert.equal(withoutReference, false);

  const withReference = passesIssueQualityGate(
    {
      issueType: "feature",
      title: "Add fizzbuzz",
      body: `${baseBody}\n\nPotential location: src/fizzbuzz.ts`
    },
    context
  );
  assert.equal(withReference, true);
});

test("quality gate allows structured draft when repo is empty", () => {
  const context: GithubIssueRepoContext = {
    repoFullName: "acme/empty",
    defaultBranch: "main",
    description: null,
    topLevelPaths: [],
    readmeExcerpt: null,
    matchedFiles: [],
    isLikelyEmpty: true,
    notes: ["Repository appears empty or nearly empty."]
  };

  const ok = passesIssueQualityGate(
    { issueType: "feature", title: "Add fizzbuzz", body: baseBody },
    context
  );
  assert.equal(ok, true);
});
