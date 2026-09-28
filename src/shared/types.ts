// Domain types shared between main (DB) and renderer (UI).
// Keep this file free of any Node/Electron imports — it is consumed by both sides.

export type TaskStatus = 'todo' | 'doing' | 'done'

/** Priority: 0 = none, 1 = low, 2 = medium, 3 = high */
export type Priority = 0 | 1 | 2 | 3

/** Repeat rule: completing the task schedules the next occurrence. */
export type Recurrence = 'daily' | 'weekdays' | 'weekly' | 'monthly'

export interface Workspace {
  id: string
  name: string
  color: string
  /** Emoji shown in place of the colored dot. Empty string = use the colored dot. */
  icon: string
  /** Local project folder (code repo / docs) linked to this desk, or null. */
  folder_path: string | null
  /** Parent desk (sub-desk in the sidebar tree); null = top level. */
  parent_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Category {
  id: string
  workspace_id: string
  name: string
  color: string
  parent_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Task {
  id: string
  category_id: string
  /** Parent memo (sub-memo), always in the same category; null = top level. */
  parent_id: string | null
  goal_id: string | null
  title: string
  note: string
  status: TaskStatus
  priority: Priority
  due_date: string | null
  recurrence: Recurrence | null
  /** When to send a reminder notification (ISO), or null. */
  remind_at: string | null
  /** Lossless editor blocks for the memo (see shared/noteDoc.ts); null = Markdown only. */
  note_doc: string | null
  /** Page settings JSON: icon, cover, layout (see shared/pageMeta.ts). */
  page_meta: string | null
  sort_order: number
  created_at: string
  updated_at: string
  completed_at: string | null
  deleted_at: string | null
}

export interface Goal {
  id: string
  workspace_id: string
  title: string
  description: string
  due_date: string | null
  status: TaskStatus
  sort_order: number
  created_at: string
  updated_at: string
  completed_at: string | null
  deleted_at: string | null
}

/** Goal enriched with progress derived from its linked tasks. */
export interface GoalWithProgress extends Goal {
  total_tasks: number
  done_tasks: number
  /** 0..1 completion ratio of linked tasks (0 when no tasks linked). */
  progress: number
}

/** Task joined with its category + workspace, for cross-workspace views. */
export interface TaskWithContext extends Task {
  category_name: string
  category_color: string
  workspace_id: string
  workspace_name: string
  workspace_color: string
}

export interface Attachment {
  id: string
  /** The memo it's attached to; null = uploaded straight to the desk's 문서함. */
  task_id: string | null
  /** Set for desk-level uploads (memo attachments take the desk from their memo). */
  workspace_id: string | null
  /** 문서함 folder it's filed in; null = top level. */
  folder_id: string | null
  file_name: string // original name as uploaded
  ext: string // lowercase, no dot (e.g. "pdf")
  mime: string
  size: number // bytes
  stored_name: string // filename on disk under userData/attachments
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** Attachment joined with its task + category (null for desk-level uploads), for the 문서함. */
export interface AttachmentWithContext extends Attachment {
  task_title: string | null
  category_id: string | null
  category_name: string | null
  category_color: string | null
}

/** A folder in a desk's 문서함 (independent of task categories). */
export interface DocFolder {
  id: string
  workspace_id: string
  name: string
  parent_id: string | null
  created_at: string
  updated_at: string
}

export interface CreateDocFolderInput {
  workspace_id: string
  name: string
  parent_id?: string | null
}

export interface DocumentUploadInput {
  workspace_id: string
  folder_id: string | null
  source_path: string
  file_name: string
}

export type ExportFormat = 'md' | 'html' | 'pdf'

export interface ExportResult {
  canceled: boolean
  path?: string
}

export interface AttachmentAddInput {
  task_id: string
  source_path: string
  file_name: string
}

/** Result of rendering an attachment for the in-app viewer. */
/** One slide of a .pptx as the in-app viewer shows it (content, not layout). */
export interface PptxSlide {
  index: number
  title: string
  paragraphs: string[]
  /** data: URLs of the slide's pictures. */
  images: string[]
  /** Speaker notes. */
  notes: string
}

export type AttachmentRender =
  | { kind: 'pdf'; url: string }
  | { kind: 'image'; url: string }
  | { kind: 'html'; html: string }
  | { kind: 'sheets'; sheets: { name: string; html: string }[] }
  | { kind: 'text'; text: string }
  | { kind: 'slides'; slides: PptxSlide[] }
  | { kind: 'unsupported'; reason: string }

/** A memo matching a graph search (title or body). */
export interface NoteSearchHit {
  id: string
  title: string
  /** Text around the first body match; '' when only the title matched. */
  snippet: string
}

/** A hit in the command palette / quick switcher. */
export interface SearchHit {
  type: 'task' | 'category' | 'workspace'
  id: string
  title: string
  subtitle: string
  color: string
  workspace_id: string
  category_id: string | null
}

// ---- Input payloads (renderer -> main) ----

export interface CreateWorkspaceInput {
  name: string
  parent_id?: string | null
  color?: string
  icon?: string
}

export interface UpdateWorkspaceInput {
  id: string
  name?: string
  color?: string
  icon?: string
  sort_order?: number
}

export interface CreateCategoryInput {
  workspace_id: string
  name: string
  color?: string
  parent_id?: string | null
}

export interface UpdateCategoryInput {
  id: string
  name?: string
  color?: string
  parent_id?: string | null
  sort_order?: number
}

export interface CreateTaskInput {
  category_id: string
  /** Create as a sub-memo; category_id is then taken from the parent. */
  parent_id?: string | null
  goal_id?: string | null
  title: string
  note?: string
  status?: TaskStatus
  priority?: Priority
  due_date?: string | null
  recurrence?: Recurrence | null
  remind_at?: string | null
  note_doc?: string | null
  page_meta?: string | null
}

export interface UpdateTaskInput {
  id: string
  title?: string
  note?: string
  status?: TaskStatus
  priority?: Priority
  due_date?: string | null
  sort_order?: number
  category_id?: string
  goal_id?: string | null
  recurrence?: Recurrence | null
  remind_at?: string | null
  note_doc?: string | null
  page_meta?: string | null
}

export interface CreateGoalInput {
  workspace_id: string
  title: string
  description?: string
  due_date?: string | null
  status?: TaskStatus
}

export interface UpdateGoalInput {
  id: string
  title?: string
  description?: string
  due_date?: string | null
  status?: TaskStatus
  sort_order?: number
}

export type TrashKind = 'workspace' | 'category' | 'task'

/**
 * One delete action as shown in the trash. A cascading delete (desk → categories
 * → tasks) stamps every row with the same deleted_at, so only its top item is listed.
 */
export interface TrashItem {
  kind: TrashKind
  id: string
  title: string
  /** Where it lived, e.g. "마케팅 / 캠페인". Empty for a desk. */
  context: string
  color: string
  deleted_at: string
  /** Tasks removed in the same delete (1 for a task). */
  task_count: number
}

/** App-level preferences, persisted by main in userData/settings.json. */
export interface AppSettings {
  /** Start the app when the user logs in. */
  launchAtLogin: boolean
  /** Notify about tasks due today. Per-task reminders fire regardless. */
  dueNotifications: boolean
  /** System-wide ⌘⇧Space quick capture. */
  globalShortcut: boolean
  /** Folder the Obsidian-style Markdown mirror is written into ('' = off). */
  vaultPath: string
  /** How the in-app AI reaches Claude. */
  aiProvider: 'claude-code' | 'api'
  aiModel: string
}

/** How to register the bundled MCP server with Claude Code. */
export interface McpInfo {
  /** One-line `claude mcp add …` command to paste into a terminal. */
  command: string
  /** The same for OpenAI's Codex CLI (GPT): `codex mcp add …`. */
  codexCommand: string
  /** Our SessionStart hook is present in ~/.claude/settings.json. */
  hookInstalled: boolean
}

export interface BackupInfo {
  /** Absolute path of the folder holding the database and attachments. */
  data_dir: string
  /** Date (YYYY-MM-DD) of the newest automatic backup, or null if none yet. */
  last_auto_backup: string | null
}

export interface BacklinkHit {
  task: TaskWithContext
  /** The line of the other note where the link / mention appears. */
  snippet: string
}

/** A document in a desk's linked project folder that links somewhere. */
export interface FileBacklink {
  workspace_id: string
  /** Project-relative path. */
  path: string
  title: string
  snippet: string
}

/** A git commit whose subject [[links]] to a note. */
export interface CommitMention {
  workspace_id: string
  short: string
  subject: string
  author: string
  date: string
}

export interface Backlinks {
  /** Notes with a [[link]] to this one. */
  linked: BacklinkHit[]
  /** Notes that mention this title as plain text (candidates for a link). */
  mentions: BacklinkHit[]
  /** Project documents linking here. */
  files: FileBacklink[]
  /** Commits in linked repos whose message links here. */
  commits: CommitMention[]
}

/** Who points at a project document. */
export interface FileBacklinks {
  linked: BacklinkHit[]
  files: FileBacklink[]
}

export interface GraphNode {
  /** Task id, "file:<desk id>:<path>" for a project document, "folder:<desk id>:<dir>"
   *  for a folder of it ('' = the linked folder itself), or "ghost:<title>". */
  id: string
  title: string
  color: string
  /** note = memo; file = document in a linked project folder; folder = a folder of it
   *  (holds its documents together, links or not); ghost = linked but not written yet;
   *  desk / category = the app's own structure (every memo hangs off it). */
  kind: 'note' | 'file' | 'folder' | 'ghost' | 'desk' | 'category'
  /** Project-relative path for a file node. */
  path: string | null
  /** Where the note lives (null for a ghost). */
  workspace_id: string | null
  workspace_name: string | null
  category_id: string | null
  /** Number of distinct neighbours. */
  links: number
  /** A 문서함 document / memo attachment (opens in the document viewer), else null. */
  attachment_id: string | null
}

/** link = a [[wiki link]] / Markdown link; structure = containment (desk ⊃ category ⊃ memo, folder ⊃ file). */
export type GraphEdgeKind = 'link' | 'structure'

export interface GraphData {
  nodes: GraphNode[]
  edges: { source: string; target: string; kind?: GraphEdgeKind }[]
}

export type GraphExportFormat = 'md' | 'json'

export interface GraphExportStats {
  nodes: number
  edges: number
  chars: number
  /** Rough estimate (≈2 chars per token for Korean-heavy text). */
  tokens: number
}

/** What to export: the graph view's filter + how much content. */
export interface GraphExportRequest {
  title: string
  format: GraphExportFormat
  scope: string | null
  linkedOnly: boolean
  /** Include desks / categories / folders and containment (default true); false = [[links]] only. */
  structure?: boolean
  /** Node ids (e.g. search hits) to centre on, with `hops` of neighbours. */
  focus: string[] | null
  hops: number
  includeBodies: boolean
  maxBodyChars: number | null
}

/** A saved pack in the 그래프 보관함. */
export interface GraphArchiveEntry extends GraphExportStats {
  id: string
  title: string
  file: string
  format: GraphExportFormat
  scope: string
  created_at: string
}

export interface GitCommit {
  hash: string
  short: string
  author: string
  /** ISO 8601 author date. */
  date: string
  subject: string
}

export interface GitInfo {
  /** null on a detached HEAD. */
  branch: string | null
  ahead: number
  behind: number
  /** Changed + untracked files in the work tree. */
  changed: number
  commits: GitCommit[]
}

/** What the 프로젝트 tab shows for a desk's linked folder. */
export interface ProjectOverview {
  folder: string
  /** False when the folder was moved or deleted since it was linked. */
  exists: boolean
  git: GitInfo | null
  files: { path: string; title: string; size: number; mtime: number }[]
  totalFiles: number
  truncated: boolean
}

/** A project document opened for reading. */
export interface ProjectFile {
  path: string
  title: string
  /** Markdown / text; empty for binary documents (PDF, Word, 한글 …) — render those instead. */
  content: string
  binary: boolean
}

/** One row of the 프로젝트 list: a desk with a linked folder. */
export interface ProjectSummary {
  desk_id: string
  name: string
  color: string
  icon: string
  folder: string
  exists: boolean
  docs: number
  git: {
    branch: string | null
    changed: number
    ahead: number
    last_commit: string | null
    last_commit_date: string | null
  } | null
}

/** A subscribed iCal feed (the secret address stays encrypted in main). */
export interface CalendarInfo {
  id: string
  name: string
  color: string
  last_sync: string | null
  /** Why the last sync failed; the previously fetched events are kept. */
  last_error: string | null
  event_count: number
}

/** One occurrence from a subscribed calendar (read-only). */
export interface CalendarEvent {
  id: string
  calendar_id: string
  calendar_name: string
  color: string
  title: string
  location: string
  description: string
  start: string
  end: string
  all_day: boolean
}

/** Metadata for a web bookmark block. */
export interface LinkPreview {
  url: string
  title: string
  description: string
  /** Absolute http(s) image URL, or ''. */
  image: string
  site: string
}

export type PropertyType = 'text' | 'number' | 'select' | 'multi_select' | 'date' | 'checkbox' | 'url'

export interface SelectOption {
  name: string
  color: string
}

/** A user-defined column on a desk's tasks (Notion database property). */
export interface Property {
  id: string
  workspace_id: string
  name: string
  type: PropertyType
  /** select / multi_select choices, in order of first use. */
  options: SelectOption[]
  sort_order: number
}

/** A stored value: string (text/select/date YYYY-MM-DD/url), number, boolean, or string[] (multi-select). */
export type PropertyValue = string | number | boolean | string[]

/** task id → property id → value */
export type PropertyValues = Record<string, Record<string, PropertyValue>>

/** Everything a database view needs for one desk. */
export interface DatabaseData {
  tasks: TaskWithContext[]
  properties: Property[]
  values: PropertyValues
}

/** A synced block's shared content (NoteDoc JSON) — edited in one memo, shown in all. */
export interface SyncedBlock {
  id: string
  doc: string
  updated_at: string
}

export interface SyncedBlockSummary {
  id: string
  /** First line of its Markdown. */
  preview: string
  /** Memos currently embedding it. */
  used_in: number
  updated_at: string
}

/** In-app AI actions (Notion-AI style). */
export type AiAction =
  | 'summarize'
  | 'improve'
  | 'shorter'
  | 'longer'
  | 'continue'
  | 'translate_en'
  | 'translate_ko'
  | 'action_items'
  | 'custom'
  | 'ask'

export type AiProvider = 'claude-code' | 'api'

export interface AiStatus {
  provider: AiProvider
  model: string
  /** An API key is stored (the key itself never leaves main). */
  hasKey: boolean
  /** Path of the `claude` CLI found on this Mac, or null. */
  cliPath: string | null
}

export interface AiRequest {
  /** Client-chosen id; deltas arrive as onAiDelta(id, text). */
  id: string
  action: AiAction
  text?: string
  instruction?: string
}

export interface AiResult {
  text: string
  /** For "ask": notes the answer was based on. */
  sources?: { id: string; title: string; workspace_id: string; category_id: string }[]
}
