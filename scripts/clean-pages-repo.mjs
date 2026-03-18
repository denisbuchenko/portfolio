import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const pagesRepositoryDir = path.join(projectRoot, ".pages", "denis-portfolio");
const pagesRepositoryGitDir = path.join(pagesRepositoryDir, ".git");
const preservedEntries = new Set([".git"]);

if (!existsSync(pagesRepositoryDir) || !existsSync(pagesRepositoryGitDir)) {
  throw new Error("Pages-репозиторий не найден. Сначала запусти `npm run pages:prepare`.");
}

for (const entry of readdirSync(pagesRepositoryDir)) {
  if (preservedEntries.has(entry)) continue;
  rmSync(path.join(pagesRepositoryDir, entry), {
    recursive: true,
    force: true
  });
}

writeFileSync(path.join(pagesRepositoryDir, ".nojekyll"), "");
