import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const pagesRootDir = path.join(projectRoot, ".pages");
const pagesRepositoryName = "denis-portfolio";
const pagesRepositoryDir = path.join(pagesRootDir, pagesRepositoryName);
const pagesRepositoryGitDir = path.join(pagesRepositoryDir, ".git");
const pagesRepositoryUrl = process.env.PAGES_REPO_URL ?? "git@github.com:denisbuchenko/denis-portfolio.git";

function _runGit(args, cwd = projectRoot) {
  execFileSync("git", args, {
    cwd,
    stdio: "inherit"
  });
}

function _getGitOutput(args, cwd = projectRoot) {
  return execFileSync("git", args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8"
  }).trim();
}

function _hasTrackedRemoteBranch(repoDir) {
  try {
    const branchName = _getGitOutput(["branch", "--show-current"], repoDir);
    if (!branchName) return false;
    const upstreamRef = _getGitOutput(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], repoDir);
    return Boolean(upstreamRef);
  } catch {
    return false;
  }
}

mkdirSync(pagesRootDir, { recursive: true });

if (!existsSync(pagesRepositoryDir)) {
  _runGit(["clone", pagesRepositoryUrl, pagesRepositoryDir]);
  process.exit(0);
}

if (!existsSync(pagesRepositoryGitDir)) {
  throw new Error(`Папка "${pagesRepositoryDir}" уже существует, но не является git-репозиторием.`);
}

_runGit(["fetch", "origin"], pagesRepositoryDir);

if (_hasTrackedRemoteBranch(pagesRepositoryDir)) {
  _runGit(["pull", "--ff-only"], pagesRepositoryDir);
}
