import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";

const databaseUrl = process.env.DATABASE_URL || "file:./walkflow.sqlite";
const client = createClient({ url: databaseUrl });

const demoUserId = "user-demo-001";
const demoPassword = "walkflow-demo-123";

const interactions = [
  {
    id: "int-001",
    status: "proposed",
    transcript:
      "I noticed our signup form fails quietly when the phone number has spaces. We should normalize input and show a validation message.",
    summary:
      "Normalize phone input to E.164 before validation and add user-facing validation errors on signup.",
    chosenRepoName: "walkflow/web",
    chosenIssueTitle: "Normalize signup phone input and surface validation errors"
  },
  {
    id: "int-002",
    status: "needs_review",
    transcript:
      "During call intake, unknown numbers are dropped too fast. Prompt callers to sign up at the site instead of ending abruptly.",
    summary:
      "Improve unregistered caller path with clear signup prompt before ending the call.",
    chosenRepoName: "walkflow/voice",
    chosenIssueTitle: "Add unregistered caller signup guidance prompt"
  },
  {
    id: "int-003",
    status: "approved",
    transcript:
      "Dashboard is hard to scan. We should show the repo and issue title first, then the status.",
    summary:
      "Prioritize repository and issue title in dashboard rows to improve scanability.",
    chosenRepoName: "walkflow/web",
    chosenIssueTitle: "Reorder dashboard columns for faster review"
  }
];

const artifacts = [
  {
    id: "art-001",
    interactionId: "int-001",
    githubIssueLink: "https://github.com/walkflow/web/issues/42",
    githubPrLink: null,
    codeChangesSummary: "Planned: add phone normalizer helper and inline validation message in signup form."
  },
  {
    id: "art-002",
    interactionId: "int-002",
    githubIssueLink: null,
    githubPrLink: null,
    codeChangesSummary: "No code changes yet. Interaction flagged for manual review due ambiguous request."
  },
  {
    id: "art-003",
    interactionId: "int-003",
    githubIssueLink: "https://github.com/walkflow/web/issues/47",
    githubPrLink: "https://github.com/walkflow/web/pull/51",
    codeChangesSummary: "Updated dashboard table order and labels for review-focused scanning."
  }
];

async function main() {
  const demoPasswordHash = await bcrypt.hash(demoPassword, 12);
  await client.execute(
    `
      INSERT INTO users (id, email, name, password_hash, phone_e164, phone_verified_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        email=excluded.email,
        name=excluded.name,
        password_hash=excluded.password_hash,
        phone_e164=excluded.phone_e164,
        phone_verified_at=excluded.phone_verified_at
    `,
    [demoUserId, "demo@walkflow.dev", "Demo User", demoPasswordHash, "+14155550100", Date.now()]
  );
  const targetUserId = demoUserId;

  for (const interaction of interactions) {
    await client.execute(`
      INSERT INTO interactions (
        id, user_id, status, transcript, summary, chosen_repo_name, chosen_issue_title, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status=excluded.status,
        transcript=excluded.transcript,
        summary=excluded.summary,
        chosen_repo_name=excluded.chosen_repo_name,
        chosen_issue_title=excluded.chosen_issue_title,
        updated_at=excluded.updated_at
    `, [
      interaction.id,
      targetUserId,
      interaction.status,
      interaction.transcript,
      interaction.summary,
      interaction.chosenRepoName,
      interaction.chosenIssueTitle,
      Date.now(),
      Date.now()
    ]);
  }

  for (const artifact of artifacts) {
    await client.execute(`
      INSERT INTO artifacts (
        id, interaction_id, github_issue_link, github_pr_link, code_changes_summary, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        github_issue_link=excluded.github_issue_link,
        github_pr_link=excluded.github_pr_link,
        code_changes_summary=excluded.code_changes_summary,
        updated_at=excluded.updated_at
    `, [
      artifact.id,
      artifact.interactionId,
      artifact.githubIssueLink,
      artifact.githubPrLink,
      artifact.codeChangesSummary,
      Date.now(),
      Date.now()
    ]);
  }

  console.log("Seeded interactions and artifacts.");
  console.log("Demo login: demo@walkflow.dev / walkflow-demo-123");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
