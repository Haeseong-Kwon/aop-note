import { execFileSync } from 'child_process'
import type { GitInfo } from '@shared/types'

const FIELD = '\x1f'

/** git with arguments (never a shell); null if git is missing or the command fails. */
function git(root: string, args: string[]): string | null {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
      maxBuffer: 16 * 1024 * 1024
    })
  } catch {
    return null
  }
}

function parseBranch(header: string): Pick<GitInfo, 'branch' | 'ahead' | 'behind'> {
  // "## main...origin/main [ahead 1, behind 2]" | "## No commits yet on main" | "## HEAD (no branch)"
  const rest = header.replace(/^## /, '')
  const branch = rest.startsWith('No commits yet on ')
    ? rest.slice('No commits yet on '.length).trim()
    : rest.startsWith('HEAD (no branch)')
      ? null
      : rest.split(' ')[0].split('...')[0]
  return {
    branch,
    ahead: Number(rest.match(/ahead (\d+)/)?.[1] ?? 0),
    behind: Number(rest.match(/behind (\d+)/)?.[1] ?? 0)
  }
}

/** Branch, work-tree changes and recent commits; null when root isn't in a git work tree. */
export function gitInfo(root: string, limit = 30): GitInfo | null {
  if (git(root, ['rev-parse', '--is-inside-work-tree'])?.trim() !== 'true') return null
  const lines = (git(root, ['status', '--porcelain=v1', '-b']) ?? '').split('\n').filter(Boolean)
  const header = lines[0]?.startsWith('## ') ? lines.shift() ?? '' : ''
  // An empty repo has no log; git exits non-zero and we get null → no commits.
  const log = git(root, ['log', `-n${limit}`, `--pretty=format:%H${FIELD}%h${FIELD}%an${FIELD}%aI${FIELD}%s`]) ?? ''
  const commits = log
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, short, author, date, subject] = line.split(FIELD)
      return { hash, short, author, date, subject }
    })
  return { ...parseBranch(header), changed: lines.length, commits }
}

const CACHE_MS = 15_000
const cache = new Map<string, { at: number; info: GitInfo | null }>()

/** gitInfo with a short cache: backlinks / graph ask for it on every refresh. */
export function getGitInfo(root: string): GitInfo | null {
  const hit = cache.get(root)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.info
  const info = gitInfo(root, 100)
  cache.set(root, { at: Date.now(), info })
  return info
}

export const invalidateGit = (root: string): boolean => cache.delete(root)
