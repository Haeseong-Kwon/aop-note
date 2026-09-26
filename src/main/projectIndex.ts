import { execFileSync } from 'child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { homedir } from 'os'
import { isAbsolute, join, posix, resolve } from 'path'
import { extractLinks } from '@shared/links'
import { READ_ONLY_GIT_ENV } from './git'

/**
 * Read-only index of the documents in a linked project folder, so a desk's notes,
 * the repo's Markdown docs and their links form one graph. Files are only ever read.
 * ponytail: synchronous scan + short-lived cache — a docs scan is a few ms even in a
 * big repo (git ls-files does the heavy lifting); go async/incremental if it ever shows.
 */

export interface DocFile {
  /** Project-relative POSIX path. */
  path: string
  /** First "# Heading", else the file name. */
  title: string
  /** [[wiki link]] targets as written. */
  links: string[]
  /** Relative Markdown links that point at other indexed docs (project paths). */
  fileLinks: string[]
  size: number
  mtime: number
}

export interface ProjectIndex {
  root: string
  /** True when listed through git (so .gitignore is respected). */
  git: boolean
  files: DocFile[]
  /** Every file considered (code included) — for "N files, M docs". */
  totalFiles: number
  /** Hit a size cap; the index covers part of the folder. */
  truncated: boolean
  scannedAt: number
}

const DOC_EXT = /\.(md|mdx|markdown|txt)$/i
const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', 'build', 'coverage', 'vendor', 'target', '__pycache__'])
const MAX_LISTED = 50_000
const MAX_DOCS = 2_000
const MAX_DOC_BYTES = 512 * 1024
const CACHE_MS = 15_000

/** Tracked + untracked-but-not-ignored files, relative to root; null if root isn't in a git work tree. */
function listWithGit(root: string): string[] | null {
  try {
    const out = execFileSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      env: READ_ONLY_GIT_ENV,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000
    })
    return out.split('\0').filter((p) => p && existsSync(join(root, p))) // index may list deleted files
  } catch {
    return null
  }
}

/** Without git: walk, skipping hidden, dependency and build folders; never follow symlinks. */
function listByWalk(root: string): string[] {
  const out: string[] = []
  const walk = (rel: string): void => {
    for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
      if (out.length >= MAX_LISTED) return
      if (entry.name.startsWith('.')) continue
      const child = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(child)
      } else if (entry.isFile()) {
        out.push(child)
      }
    }
  }
  walk('')
  return out
}

const MD_LINK = /\[[^\]]*\]\(([^)\s]+)\)/g

function parseDoc(root: string, path: string, docPaths: Set<string>): DocFile {
  const abs = join(root, path)
  const stat = statSync(abs)
  const text = stat.size <= MAX_DOC_BYTES ? readFileSync(abs, 'utf8') : ''
  const heading = text.match(/^#\s+(.+)$/m)?.[1].trim()
  const fileLinks = new Set<string>()
  for (const m of text.matchAll(MD_LINK)) {
    const target = m[1]
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue // URLs, anchors
    let decoded = target.split('#')[0]
    try {
      decoded = decodeURIComponent(decoded)
    } catch {
      /* keep as written */
    }
    const resolved = posix.normalize(posix.join(posix.dirname(path), decoded))
    if (docPaths.has(resolved)) fileLinks.add(resolved)
  }
  return {
    path,
    title: heading || posix.basename(path).replace(DOC_EXT, ''),
    links: extractLinks(text).map((l) => l.target),
    fileLinks: [...fileLinks],
    size: stat.size,
    mtime: stat.mtimeMs
  }
}

export function scanProject(root: string): ProjectIndex {
  const viaGit = listWithGit(root)
  const listed = viaGit ?? listByWalk(root)
  const docs = listed.filter((p) => DOC_EXT.test(p)).sort()
  const kept = docs.slice(0, MAX_DOCS)
  const docPaths = new Set(kept)
  return {
    root,
    git: viaGit !== null,
    files: kept.map((p) => parseDoc(root, p, docPaths)),
    totalFiles: listed.length,
    truncated: docs.length > MAX_DOCS || listed.length >= MAX_LISTED,
    scannedAt: Date.now()
  }
}

/**
 * A [[target]] → project path, the way Obsidian resolves note names: exact path
 * (extension optional), else a unique file name. Ambiguous names resolve to nothing.
 */
export function resolveFile(index: ProjectIndex, target: string): string | null {
  const t = target.trim().replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase()
  if (!t) return null
  const exact = index.files.find((f) => {
    const p = f.path.toLowerCase()
    return p === t || p.replace(DOC_EXT, '') === t
  })
  if (exact) return exact.path
  const byName = index.files.filter((f) => {
    const name = posix.basename(f.path).toLowerCase()
    return name === t || name.replace(DOC_EXT, '') === t
  })
  return byName.length === 1 ? byName[0].path : null
}

const cache = new Map<string, ProjectIndex>()

/** Cached index for a folder, or null if it no longer exists. */
export function getProjectIndex(root: string): ProjectIndex | null {
  try {
    if (!statSync(root).isDirectory()) return null
  } catch {
    return null
  }
  const hit = cache.get(root)
  if (hit && Date.now() - hit.scannedAt < CACHE_MS) return hit
  const index = scanProject(root)
  cache.set(root, index)
  return index
}

export const invalidateProject = (root: string): boolean => cache.delete(root)

/** A folder we're willing to index: an existing directory, not / or the whole home folder. */
export function validateFolder(input: string): string {
  if (!input || !isAbsolute(input)) throw new Error('절대 경로의 폴더를 지정하세요.')
  const folder = resolve(input)
  let isDir = false
  try {
    isDir = statSync(folder).isDirectory()
  } catch {
    /* missing */
  }
  if (!isDir) throw new Error(`폴더를 찾을 수 없습니다: ${folder}`)
  if (folder === '/' || folder === homedir()) throw new Error('홈 폴더나 루트 전체는 연결할 수 없습니다. 프로젝트 폴더를 고르세요.')
  return folder
}
