import test from "node:test";
import assert from "node:assert/strict";

import { draftGithubIssue } from "../lib/openai/issue-writer";

test("draftGithubIssue fallback returns structured issue without raw transcript", async () => {
  const original = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const transcript = "This should never be copied verbatim into issue body.";
    const draft = await draftGithubIssue({
      repoName: "acme/platform",
      suggestedTitle: "[Issue] Improve deploy rollback handling",
      summary: "Rollback flow is unreliable for partial failures.",
      transcript,
      repoContext: {
        repoFullName: "acme/platform",
        defaultBranch: "main",
        description: "Platform services",
        topLevelPaths: ["src", "docs"],
        readmeExcerpt: "Platform service docs",
        matchedFiles: [],
        isLikelyEmpty: false,
        notes: []
      }
    });

    assert.ok(["feature", "bug", "chore"].includes(draft.issueType));
    assert.ok(draft.title.length > 0);
    assert.match(draft.body, /## Issue Metadata/);
    assert.match(draft.body, /## Executive Summary/);
    assert.match(draft.body, /## Scope/);
    assert.match(draft.body, /## Acceptance Criteria/);
    assert.match(draft.body, /## Expert Assistant Notes/);
    assert.match(draft.body, /### Assumptions/);
    assert.match(draft.body, /### Suggested Directions/);
    assert.equal(draft.body.includes("Refine this proposal into implementable tasks."), false);
    assert.equal(draft.body.includes("Keep behavior aligned with caller intent."), false);
    assert.equal(draft.body.includes(transcript), false);
  } finally {
    process.env.OPENAI_API_KEY = original;
  }
});
