type GithubProvider = "rest" | "mcp";

type GithubRepository = {
  fullName: string;
  owner: string;
  name: string;
  defaultBranch: string;
  htmlUrl: string;
  description: string | null;
  isPrivate: boolean;
};

type SearchRepositoriesOptions = {
  query: string;
  limit?: number;
  owners?: string[];
};

type CreateIssueInput = {
  repoFullName: string;
  title: string;
  body: string;
};

type CreatePullRequestInput = {
  repoFullName: string;
  title: string;
  body: string;
  head: string;
  base?: string;
};

type GithubIssueResult = {
  number: number;
  htmlUrl: string;
};

type GithubPullRequestResult = {
  number: number;
  htmlUrl: string;
};

function parseCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseOwnerAndName(repoFullName: string): { owner: string; repo: string } | null {
  const trimmed = repoFullName.trim();
  if (!trimmed.includes("/")) {
    return null;
  }

  const [owner, repo] = trimmed.split("/", 2).map((part) => part.trim());
  if (!owner || !repo) {
    return null;
  }

  return { owner, repo };
}

function parseOwnerFromFullName(repoFullName: string): string | null {
  const parsed = parseOwnerAndName(repoFullName);
  return parsed ? parsed.owner : null;
}

function sanitizeSearchQuery(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9/\-_\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .slice(0, 10)
    .join(" ");
}

function getGithubProvider(): GithubProvider {
  const configured = (process.env.GITHUB_PROVIDER || "rest").trim().toLowerCase();
  return configured === "mcp" ? "mcp" : "rest";
}

function getGithubReadToken() {
  return process.env.GITHUB_READ_TOKEN?.trim() || "";
}

function getGithubWriteToken() {
  return process.env.GITHUB_WRITE_TOKEN?.trim() || "";
}

function getAllowedWriteRepo() {
  return process.env.GITHUB_WRITE_ALLOWED_REPO?.trim() || "";
}

function defaultReadOwners() {
  return parseCsv(process.env.GITHUB_READ_REPO_OWNERS);
}

function getMcpUrl() {
  return process.env.GITHUB_MCP_URL?.trim() || "";
}

function getMcpBearerToken() {
  return process.env.GITHUB_MCP_BEARER_TOKEN?.trim() || "";
}

function getMcpReadTool() {
  return process.env.GITHUB_MCP_READ_TOOL?.trim() || "github.search_repositories";
}

function getMcpCreateIssueTool() {
  return process.env.GITHUB_MCP_CREATE_ISSUE_TOOL?.trim() || "github.create_issue";
}

function getMcpCreatePrTool() {
  return process.env.GITHUB_MCP_CREATE_PR_TOOL?.trim() || "github.create_pull_request";
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function parseMcpPayloadResult(value: unknown): unknown {
  const root = toRecord(value);
  if (!root) {
    return value;
  }

  const result = root.result;
  const resultRecord = toRecord(result);
  if (!resultRecord) {
    return result ?? value;
  }

  if (resultRecord.isError) {
    const text = asString(resultRecord.text) || asString(resultRecord.message) || "MCP tool call failed.";
    throw new Error(text);
  }

  if (resultRecord.structuredContent !== undefined) {
    return resultRecord.structuredContent;
  }

  const content = Array.isArray(resultRecord.content) ? resultRecord.content : [];
  for (const part of content) {
    const contentRecord = toRecord(part);
    if (!contentRecord) {
      continue;
    }

    if (contentRecord.type === "json" && contentRecord.json !== undefined) {
      return contentRecord.json;
    }

    const textValue = asString(contentRecord.text);
    if (textValue) {
      try {
        return JSON.parse(textValue);
      } catch {
        return textValue;
      }
    }
  }

  return resultRecord;
}

async function callMcpTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  const url = getMcpUrl();
  if (!url) {
    throw new Error("GITHUB_MCP_URL is not configured.");
  }

  const bearerToken = getMcpBearerToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `wf-${Date.now()}`,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub MCP call failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const payload = await response.json() as unknown;
  return parseMcpPayloadResult(payload);
}

function normalizeRepo(value: unknown): GithubRepository | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }

  const ownerRecord = toRecord(record.owner);
  const owner = asString(record.owner) || asString(ownerRecord?.login);
  const fullName = asString(record.fullName) || asString(record.full_name);
  const name = asString(record.name) || fullName.split("/")[1] || "";
  const defaultBranch = asString(record.defaultBranch) || asString(record.default_branch) || "main";
  const description = asString(record.description) || null;
  const isPrivate = Boolean(record.isPrivate ?? record.private);

  let htmlUrl = asString(record.htmlUrl) || asString(record.html_url);
  if (!htmlUrl && fullName) {
    htmlUrl = `https://github.com/${fullName}`;
  }

  if (!fullName || !owner || !name || !htmlUrl) {
    return null;
  }

  return {
    fullName,
    owner,
    name,
    defaultBranch,
    htmlUrl,
    description,
    isPrivate
  };
}

function normalizeIssueResult(value: unknown): GithubIssueResult {
  const record = toRecord(value);
  if (!record) {
    throw new Error("GitHub issue response was not in expected format.");
  }

  const issueRecord = toRecord(record.issue) || record;
  const number = Number(issueRecord.number || issueRecord.issue_number || 0);
  const htmlUrl = asString(issueRecord.htmlUrl) || asString(issueRecord.html_url) || asString(issueRecord.url);
  if (!number || !htmlUrl) {
    throw new Error("GitHub issue response missing expected fields.");
  }

  return { number, htmlUrl };
}

function normalizePullRequestResult(value: unknown): GithubPullRequestResult {
  const record = toRecord(value);
  if (!record) {
    throw new Error("GitHub pull request response was not in expected format.");
  }

  const prRecord = toRecord(record.pullRequest) || toRecord(record.pull_request) || record;
  const number = Number(prRecord.number || prRecord.pr_number || 0);
  const htmlUrl = asString(prRecord.htmlUrl) || asString(prRecord.html_url) || asString(prRecord.url);
  if (!number || !htmlUrl) {
    throw new Error("GitHub pull request response missing expected fields.");
  }

  return { number, htmlUrl };
}

function extractRepositoryItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  const record = toRecord(payload);
  if (!record) {
    return [];
  }

  const candidates = [record.items, record.repos, record.repositories, record.results, record.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

async function githubGet(path: string, token: string): Promise<unknown> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API GET ${path} failed (${response.status}): ${text.slice(0, 200)}`);
  }

  return response.json();
}

async function githubPost(path: string, token: string, payload: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`https://api.github.com${path}`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API POST ${path} failed (${response.status}): ${text.slice(0, 200)}`);
  }

  return response.json();
}

export function isGithubReadConfigured() {
  if (getGithubProvider() === "mcp") {
    return Boolean(getMcpUrl());
  }
  return Boolean(getGithubReadToken());
}

export function isGithubWriteConfigured() {
  const allowedRepo = getAllowedWriteRepo();
  if (!allowedRepo) {
    return false;
  }

  if (getGithubProvider() === "mcp") {
    return Boolean(getMcpUrl());
  }
  return Boolean(getGithubWriteToken());
}

export async function searchGithubRepositories(options: SearchRepositoriesOptions): Promise<GithubRepository[]> {
  const limit = Math.min(Math.max(options.limit ?? 6, 1), 20);
  const rawQuery = sanitizeSearchQuery(options.query);
  if (!rawQuery) {
    return [];
  }

  const owners = (options.owners && options.owners.length > 0 ? options.owners : defaultReadOwners())
    .map((owner) => owner.trim())
    .filter(Boolean);
  const provider = getGithubProvider();

  if (provider === "mcp") {
    const payload = await callMcpTool(getMcpReadTool(), {
      query: rawQuery,
      limit,
      owners
    });

    return extractRepositoryItems(payload)
      .map((item) => normalizeRepo(item))
      .filter((repo): repo is GithubRepository => Boolean(repo));
  }

  const token = getGithubReadToken();
  if (!token) {
    return [];
  }

  const ownerQualifier = owners.map((owner) => `user:${owner}`).join(" ");
  const query = `${rawQuery} in:name,description ${ownerQualifier}`.trim();
  const encoded = encodeURIComponent(query);
  const body = await githubGet(`/search/repositories?q=${encoded}&sort=updated&order=desc&per_page=${limit}`, token);

  return extractRepositoryItems(body)
    .map((item) => normalizeRepo(item))
    .filter((repo): repo is GithubRepository => Boolean(repo));
}

export async function suggestGithubRepoNamesFromText(text: string, limit = 6): Promise<string[]> {
  const repositories = await searchGithubRepositories({ query: text, limit });
  return repositories.map((repo) => repo.fullName);
}

export async function listGithubUserRepoNames(limit = 100): Promise<string[]> {
  const maxCount = Math.min(Math.max(limit, 1), 200);
  const provider = getGithubProvider();

  if (provider === "mcp") {
    // MCP servers differ on list-repos tool names and shapes.
    // Keep this conservative and rely on search until MCP mapping is explicitly configured.
    return [];
  }

  const token = getGithubReadToken();
  if (!token) {
    return [];
  }

  const body = await githubGet(`/user/repos?per_page=${Math.min(maxCount, 100)}&sort=updated&type=owner`, token);
  return extractRepositoryItems(body)
    .map((item) => normalizeRepo(item))
    .filter((repo): repo is GithubRepository => Boolean(repo))
    .map((repo) => repo.fullName)
    .slice(0, maxCount);
}

export async function suggestGithubRepoNamesFromTextForOwners(
  text: string,
  owners: string[],
  limit = 6
): Promise<string[]> {
  const repositories = await searchGithubRepositories({ query: text, owners, limit });
  return repositories.map((repo) => repo.fullName);
}

export function ownersFromRepoNames(repos: string[]): string[] {
  const unique = new Set<string>();
  for (const repo of repos) {
    const owner = parseOwnerFromFullName(repo);
    if (owner) {
      unique.add(owner);
    }
  }
  return [...unique];
}

export async function createGithubIssue(input: CreateIssueInput): Promise<GithubIssueResult> {
  const allowedRepo = getAllowedWriteRepo();
  if (!allowedRepo) {
    throw new Error("GitHub write integration is not configured.");
  }

  if (input.repoFullName.trim() !== allowedRepo) {
    throw new Error(`Writes are restricted to ${allowedRepo}.`);
  }

  const provider = getGithubProvider();
  if (provider === "mcp") {
    const payload = await callMcpTool(getMcpCreateIssueTool(), {
      repoFullName: input.repoFullName.trim(),
      title: input.title.trim(),
      body: input.body.trim()
    });
    return normalizeIssueResult(payload);
  }

  const token = getGithubWriteToken();
  if (!token) {
    throw new Error("GitHub write integration is not configured.");
  }

  const parsed = parseOwnerAndName(input.repoFullName);
  if (!parsed) {
    throw new Error("repoFullName must be in owner/repo format.");
  }

  const body = await githubPost(`/repos/${parsed.owner}/${parsed.repo}/issues`, token, {
    title: input.title.trim(),
    body: input.body.trim()
  });
  return normalizeIssueResult(body);
}

export async function createGithubPullRequest(input: CreatePullRequestInput): Promise<GithubPullRequestResult> {
  const allowedRepo = getAllowedWriteRepo();
  if (!allowedRepo) {
    throw new Error("GitHub write integration is not configured.");
  }

  if (input.repoFullName.trim() !== allowedRepo) {
    throw new Error(`Writes are restricted to ${allowedRepo}.`);
  }

  const defaultBaseBranch = process.env.GITHUB_WRITE_ALLOWED_BASE_BRANCH?.trim() || "main";
  const provider = getGithubProvider();
  if (provider === "mcp") {
    const payload = await callMcpTool(getMcpCreatePrTool(), {
      repoFullName: input.repoFullName.trim(),
      title: input.title.trim(),
      body: input.body.trim(),
      head: input.head.trim(),
      base: input.base?.trim() || defaultBaseBranch
    });
    return normalizePullRequestResult(payload);
  }

  const token = getGithubWriteToken();
  if (!token) {
    throw new Error("GitHub write integration is not configured.");
  }

  const parsed = parseOwnerAndName(input.repoFullName);
  if (!parsed) {
    throw new Error("repoFullName must be in owner/repo format.");
  }

  const body = await githubPost(`/repos/${parsed.owner}/${parsed.repo}/pulls`, token, {
    title: input.title.trim(),
    body: input.body.trim(),
    head: input.head.trim(),
    base: input.base?.trim() || defaultBaseBranch
  });
  return normalizePullRequestResult(body);
}
