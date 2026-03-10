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

export type GithubFileContentResult = {
  sha: string | null;
  content: string | null;
};

export type GithubInitialCommitFile = {
  path: string;
  content: string;
};

export type GithubRepoContextSnippet = {
  path: string;
  snippet: string;
};

export type GithubIssueRepoContext = {
  repoFullName: string;
  defaultBranch: string;
  description: string | null;
  topLevelPaths: string[];
  readmeExcerpt: string | null;
  matchedFiles: GithubRepoContextSnippet[];
  isLikelyEmpty: boolean;
  notes: string[];
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

function tokenizeContextQuery(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9/_\-\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4);
  return [...new Set(tokens)].slice(0, 8);
}

function decodeBase64ToUtf8(value: string): string {
  try {
    return Buffer.from(value.replace(/\n/g, ""), "base64").toString("utf8");
  } catch {
    return "";
  }
}

function summarizeText(value: string, maxLength = 900): string {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function isLikelyTextPath(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".gif")) {
    return false;
  }
  if (lower.endsWith(".ico") || lower.endsWith(".pdf") || lower.endsWith(".zip") || lower.endsWith(".lock")) {
    return false;
  }
  return true;
}

function encodeGithubPath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function extractSnippet(content: string, keywords: string[]): string {
  const lines = content.split("\n");
  const lowerKeywords = keywords.map((keyword) => keyword.toLowerCase());
  const hitIndex = lines.findIndex((line) => {
    const lower = line.toLowerCase();
    return lowerKeywords.some((keyword) => lower.includes(keyword));
  });

  if (hitIndex >= 0) {
    const start = Math.max(0, hitIndex - 2);
    const end = Math.min(lines.length, hitIndex + 4);
    return summarizeText(lines.slice(start, end).join("\n"), 500);
  }

  return summarizeText(lines.slice(0, 8).join("\n"), 500);
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

async function githubPut(path: string, token: string, payload: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`https://api.github.com${path}`, {
    method: "PUT",
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
    throw new Error(`GitHub API PUT ${path} failed (${response.status}): ${text.slice(0, 200)}`);
  }

  return response.json();
}

async function githubGetMaybe(path: string, token: string): Promise<unknown | null> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

function contextToken(): string {
  return getGithubReadToken() || getGithubWriteToken();
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

export async function fetchGithubIssueRepoContext(
  repoFullName: string,
  transcript: string,
  summary: string
): Promise<GithubIssueRepoContext> {
  const parsed = parseOwnerAndName(repoFullName);
  if (!parsed) {
    return {
      repoFullName,
      defaultBranch: "main",
      description: null,
      topLevelPaths: [],
      readmeExcerpt: null,
      matchedFiles: [],
      isLikelyEmpty: true,
      notes: ["Repository name was not in owner/repo format."]
    };
  }

  const provider = getGithubProvider();
  if (provider === "mcp") {
    return {
      repoFullName,
      defaultBranch: "main",
      description: null,
      topLevelPaths: [],
      readmeExcerpt: null,
      matchedFiles: [],
      isLikelyEmpty: false,
      notes: ["Repo context retrieval is currently REST-only; MCP mode returned minimal context."]
    };
  }

  const token = contextToken();
  if (!token) {
    return {
      repoFullName,
      defaultBranch: "main",
      description: null,
      topLevelPaths: [],
      readmeExcerpt: null,
      matchedFiles: [],
      isLikelyEmpty: false,
      notes: ["No GitHub token available for repo context retrieval."]
    };
  }

  const repoPayload = await githubGetMaybe(`/repos/${parsed.owner}/${parsed.repo}`, token);
  const repoRecord = toRecord(repoPayload);
  const defaultBranch = asString(repoRecord?.default_branch) || "main";
  const description = asString(repoRecord?.description) || null;

  const readmePayload = await githubGetMaybe(`/repos/${parsed.owner}/${parsed.repo}/readme`, token);
  const readmeRecord = toRecord(readmePayload);
  const readmeContent = asString(readmeRecord?.content);
  const readmeExcerpt = readmeContent ? summarizeText(decodeBase64ToUtf8(readmeContent), 1000) : null;

  const treePayload = await githubGetMaybe(
    `/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`,
    token
  );
  const treeRecord = toRecord(treePayload);
  const treeItems = Array.isArray(treeRecord?.tree) ? treeRecord.tree : [];
  const filePaths = treeItems
    .map((item) => toRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .filter((item) => asString(item.type) === "blob")
    .map((item) => asString(item.path))
    .filter(Boolean);

  const topLevelPaths = [...new Set(filePaths.map((path) => path.split("/")[0]).filter(Boolean))].slice(0, 20);

  const keywords = tokenizeContextQuery(`${summary}\n${transcript}`);
  const matchedPaths = filePaths
    .filter((path) => isLikelyTextPath(path))
    .filter((path) => keywords.some((keyword) => path.toLowerCase().includes(keyword)))
    .slice(0, 3);

  const matchedFiles: GithubRepoContextSnippet[] = [];
  for (const path of matchedPaths) {
    const contentPayload = await githubGetMaybe(
      `/repos/${parsed.owner}/${parsed.repo}/contents/${encodeGithubPath(path)}?ref=${encodeURIComponent(defaultBranch)}`,
      token
    );
    const contentRecord = toRecord(contentPayload);
    const encodedContent = asString(contentRecord?.content);
    if (!encodedContent) {
      continue;
    }
    const decoded = decodeBase64ToUtf8(encodedContent);
    if (!decoded.trim()) {
      continue;
    }
    matchedFiles.push({
      path,
      snippet: extractSnippet(decoded, keywords)
    });
  }

  const isLikelyEmpty = filePaths.length === 0 || (filePaths.length <= 2 && !readmeExcerpt);

  return {
    repoFullName,
    defaultBranch,
    description,
    topLevelPaths,
    readmeExcerpt,
    matchedFiles,
    isLikelyEmpty,
    notes: isLikelyEmpty ? ["Repository appears empty or nearly empty."] : []
  };
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

export async function getGithubDefaultBranch(repoFullName: string): Promise<string> {
  const token = getGithubWriteToken();
  if (!token) {
    throw new Error("GitHub write integration is not configured.");
  }

  const parsed = parseOwnerAndName(repoFullName);
  if (!parsed) {
    throw new Error("repoFullName must be in owner/repo format.");
  }

  const body = await githubGet(`/repos/${parsed.owner}/${parsed.repo}`, token);
  const record = toRecord(body);
  return asString(record?.default_branch) || "main";
}

export async function getGithubBranchHeadSha(repoFullName: string, branchName: string): Promise<string> {
  const token = getGithubWriteToken();
  if (!token) {
    throw new Error("GitHub write integration is not configured.");
  }

  const parsed = parseOwnerAndName(repoFullName);
  if (!parsed) {
    throw new Error("repoFullName must be in owner/repo format.");
  }

  const body = await githubGet(
    `/repos/${parsed.owner}/${parsed.repo}/git/ref/heads/${encodeURIComponent(branchName)}`,
    token
  );
  const record = toRecord(body);
  const objectRecord = toRecord(record?.object);
  const sha = asString(objectRecord?.sha);
  if (!sha) {
    throw new Error(`Unable to resolve branch SHA for ${branchName}.`);
  }
  return sha;
}

export async function createGithubBranchFromSha(
  repoFullName: string,
  branchName: string,
  fromSha: string
): Promise<void> {
  const token = getGithubWriteToken();
  if (!token) {
    throw new Error("GitHub write integration is not configured.");
  }

  const parsed = parseOwnerAndName(repoFullName);
  if (!parsed) {
    throw new Error("repoFullName must be in owner/repo format.");
  }

  const response = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/refs`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: fromSha
    })
  });

  if (response.ok) {
    return;
  }

  if (response.status === 422) {
    const text = await response.text();
    if (text.toLowerCase().includes("reference already exists")) {
      return;
    }
    throw new Error(`GitHub API branch create rejected (${response.status}): ${text.slice(0, 200)}`);
  }

  const text = await response.text();
  throw new Error(`GitHub API branch create failed (${response.status}): ${text.slice(0, 200)}`);
}

export async function getGithubFileContent(
  repoFullName: string,
  path: string,
  ref: string
): Promise<GithubFileContentResult> {
  const token = getGithubWriteToken();
  if (!token) {
    throw new Error("GitHub write integration is not configured.");
  }

  const parsed = parseOwnerAndName(repoFullName);
  if (!parsed) {
    throw new Error("repoFullName must be in owner/repo format.");
  }

  const payload = await githubGetMaybe(
    `/repos/${parsed.owner}/${parsed.repo}/contents/${encodeGithubPath(path)}?ref=${encodeURIComponent(ref)}`,
    token
  );
  const record = toRecord(payload);
  if (!record) {
    return { sha: null, content: null };
  }

  const sha = asString(record.sha) || null;
  const encodedContent = asString(record.content);
  const content = encodedContent ? decodeBase64ToUtf8(encodedContent) : null;
  return { sha, content };
}

type UpsertGithubFileInput = {
  repoFullName: string;
  path: string;
  content: string;
  message: string;
  branch: string;
  sha?: string | null;
};

export async function upsertGithubFile(input: UpsertGithubFileInput): Promise<void> {
  const allowedRepo = getAllowedWriteRepo();
  if (!allowedRepo) {
    throw new Error("GitHub write integration is not configured.");
  }

  if (input.repoFullName.trim() !== allowedRepo) {
    throw new Error(`Writes are restricted to ${allowedRepo}.`);
  }

  if (getGithubProvider() === "mcp") {
    throw new Error("Codex file writes are currently REST-only; set GITHUB_PROVIDER=rest.");
  }

  const token = getGithubWriteToken();
  if (!token) {
    throw new Error("GitHub write integration is not configured.");
  }

  const parsed = parseOwnerAndName(input.repoFullName);
  if (!parsed) {
    throw new Error("repoFullName must be in owner/repo format.");
  }

  const payload: Record<string, unknown> = {
    message: input.message.trim(),
    content: Buffer.from(input.content, "utf8").toString("base64"),
    branch: input.branch.trim()
  };
  if (input.sha) {
    payload.sha = input.sha;
  }

  await githubPut(`/repos/${parsed.owner}/${parsed.repo}/contents/${encodeGithubPath(input.path)}`, token, payload);
}

type CreateGithubInitialCommitBranchInput = {
  repoFullName: string;
  branchName: string;
  message: string;
  files: GithubInitialCommitFile[];
};

export async function createGithubInitialCommitBranch(input: CreateGithubInitialCommitBranchInput): Promise<void> {
  const allowedRepo = getAllowedWriteRepo();
  if (!allowedRepo) {
    throw new Error("GitHub write integration is not configured.");
  }

  if (input.repoFullName.trim() !== allowedRepo) {
    throw new Error(`Writes are restricted to ${allowedRepo}.`);
  }

  if (getGithubProvider() === "mcp") {
    throw new Error("Codex initial commit bootstrap is currently REST-only; set GITHUB_PROVIDER=rest.");
  }

  const token = getGithubWriteToken();
  if (!token) {
    throw new Error("GitHub write integration is not configured.");
  }

  const parsed = parseOwnerAndName(input.repoFullName);
  if (!parsed) {
    throw new Error("repoFullName must be in owner/repo format.");
  }

  if (input.files.length === 0) {
    throw new Error("Initial commit bootstrap requires at least one file.");
  }

  let index = 0;
  for (const file of input.files) {
    index += 1;
    await githubPut(`/repos/${parsed.owner}/${parsed.repo}/contents/${encodeGithubPath(file.path)}`, token, {
      message: `${input.message.trim()} (${index}/${input.files.length})`,
      content: Buffer.from(file.content, "utf8").toString("base64"),
      branch: input.branchName
    });
  }
}
