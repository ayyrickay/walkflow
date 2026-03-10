import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { pathToFileURL } from "url";

const databaseUrl = process.env.DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:5432/walkflow";
if (databaseUrl.startsWith("file:")) {
  throw new Error("DATABASE_URL must be a Postgres connection string. Replace any old SQLite-style value like file:./walkflow.sqlite.");
}

const sslEnabled = (process.env.DATABASE_SSL || "").trim().toLowerCase() === "true";

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

function asTranscriptJson(text) {
  return JSON.stringify([{ role: "caller", speaker: "Caller", text }]);
}

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

export async function seedDemoData() {
  const client = new Pool({
    connectionString: databaseUrl,
    ssl: sslEnabled ? { rejectUnauthorized: false } : undefined
  });

  const demoPasswordHash = await bcrypt.hash(demoPassword, 12);
  try {
    await client.query(
      `
        INSERT INTO users (id, email, name, password_hash, phone_e164, phone_verified_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT(id) DO UPDATE SET
          email=excluded.email,
          name=excluded.name,
          password_hash=excluded.password_hash,
          phone_e164=excluded.phone_e164,
          phone_verified_at=excluded.phone_verified_at
      `,
      [demoUserId, "demo@walkflow.dev", "Demo User", demoPasswordHash, "+14155550100", new Date()]
    );
    const targetUserId = demoUserId;

    await client.query(
      `
        INSERT INTO app_settings (id, allow_unmapped_calls, demo_account_id, updated_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT(id) DO UPDATE SET
          allow_unmapped_calls=excluded.allow_unmapped_calls,
          demo_account_id=excluded.demo_account_id,
          updated_at=excluded.updated_at
      `,
      ["default", true, targetUserId, new Date()]
    );

    const repositories = [
      { id: "repo-001", owner: "walkflow", name: "web", defaultBranch: "main" },
      { id: "repo-002", owner: "walkflow", name: "voice", defaultBranch: "main" },
      { id: "repo-003", owner: "ricky", name: "circulating-magazines", defaultBranch: "main" }
    ];

    for (const repository of repositories) {
      await client.query(`
        INSERT INTO repositories (
          id, user_id, provider, owner, name, default_branch, is_active, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT(id) DO UPDATE SET
          user_id=excluded.user_id,
          provider=excluded.provider,
          owner=excluded.owner,
          name=excluded.name,
          default_branch=excluded.default_branch,
          is_active=excluded.is_active
      `, [
        repository.id,
        targetUserId,
        "github",
        repository.owner,
        repository.name,
        repository.defaultBranch,
        true,
        new Date()
      ]);
    }

    for (const interaction of interactions) {
      await client.query(`
        INSERT INTO interactions (
          id, user_id, status, transcript, summary, chosen_repo_name, chosen_issue_title, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
        asTranscriptJson(interaction.transcript),
        interaction.summary,
        interaction.chosenRepoName,
        interaction.chosenIssueTitle,
        new Date(),
        new Date()
      ]);
    }

    for (const artifact of artifacts) {
      await client.query(`
        INSERT INTO artifacts (
          id, interaction_id, github_issue_link, github_pr_link, code_changes_summary, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
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
        new Date(),
        new Date()
      ]);
    }

    console.log("Seeded users, repositories, interactions, artifacts, and demo settings.");
    console.log("Demo login: demo@walkflow.dev / walkflow-demo-123");
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedDemoData().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
