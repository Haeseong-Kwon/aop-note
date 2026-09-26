import assert from 'node:assert'
import { handleMessage } from './protocol'
import { workspaceRepo } from '../main/repositories/workspace.repo'
import { categoryRepo } from '../main/repositories/category.repo'
import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { projectBrief } from './tools'
import { addCalendar } from '../main/calendars'

type Rpc = { jsonrpc: '2.0'; id?: number; result?: any; error?: { code: number; message: string } } // eslint-disable-line @typescript-eslint/no-explicit-any

let seq = 0
const call = async (method: string, params?: unknown): Promise<Rpc> =>
  (await handleMessage({ jsonrpc: '2.0', id: ++seq, method, params })) as Rpc
const tool = async (name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> => {
  const r = await call('tools/call', { name, arguments: args })
  return { text: r.result.content[0].text, isError: Boolean(r.result.isError) }
}

async function main(): Promise<void> {
  const ws = workspaceRepo.create({ name: 'MCP 데스크' })
  categoryRepo.create({ workspace_id: ws.id, name: '아키텍처' })

  // Handshake echoes the client's protocol version and advertises tools.
  const init = await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } })
  assert.equal(init.result.protocolVersion, '2025-06-18')
  assert.ok(init.result.capabilities.tools)
  assert.equal(await handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }), null, 'notifications get no reply')

  const names = (await call('tools/list')).result.tools.map((t: { name: string }) => t.name)
  assert.deepEqual(names.sort(), ['append_to_note', 'create_note', 'get_project_context', 'link_project', 'list_desks', 'list_events', 'list_tasks', 'read_note', 'search_notes'])

  // Write → search → read, with links and backlinks.
  let r = await tool('create_note', { title: '인증 흐름', desk: 'mcp 데스크', category: '아키텍처', markdown: 'JWT 대신 세션. [[세션 저장소]] 참고', due: '2099-01-02' })
  assert.equal(r.isError, false, r.text)
  const id = JSON.parse(r.text).id as string
  r = await tool('create_note', { title: '세션 저장소', desk: ws.id, category: '아키텍처', markdown: 'Redis' })
  assert.equal(r.isError, false, r.text)

  r = await tool('search_notes', { query: '세션' })
  assert.ok(r.text.includes('인증 흐름') && r.text.includes('세션 저장소'))

  r = await tool('read_note', { title: '세션 저장소' })
  assert.ok(r.text.includes('# 세션 저장소'))
  assert.ok(r.text.includes('인증 흐름'), 'backlink from 인증 흐름 is listed')

  r = await tool('append_to_note', { id, markdown: '- 만료 정책 추가' })
  assert.equal(r.isError, false)
  r = await tool('read_note', { id })
  assert.ok(r.text.includes('JWT 대신 세션') && r.text.includes('- 만료 정책 추가'))
  assert.ok(r.text.includes('세션 저장소'), 'outgoing link resolved')

  r = await tool('list_tasks', { desk: 'MCP 데스크' })
  assert.ok(r.text.includes('인증 흐름'))

  // Bad input is reported as a tool error (the agent can correct itself), not a crash.
  r = await tool('create_note', { title: 'x', desk: 'MCP 데스크', category: '없는 카테고리' })
  assert.equal(r.isError, true)
  assert.match(r.text, /아키텍처/, 'error lists the categories that do exist')
  r = await tool('create_note', { title: 'x', desk: 'MCP 데스크', category: '아키텍처', due: '내일' })
  assert.equal(r.isError, true)
  r = await tool('read_note', {})
  assert.equal(r.isError, true)

  const unknown = await call('bogus/method')
  assert.equal(unknown.error?.code, -32601)

  console.log('mcp: all assertions passed')
}


// --- projects: a repo linked to a desk becomes Claude Code's context -----------

async function projects(): Promise<void> {
  const repo = mkdtempSync(join(tmpdir(), 'aop-mcp-repo-'))
  mkdirSync(join(repo, 'src', 'auth'), { recursive: true })
  writeFileSync(join(repo, 'README.md'), '# 결제 서비스\n')
  writeFileSync(join(repo, 'CLAUDE.md'), '규칙: [[인증 흐름]] 참고')
  execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'feat/login'])

  // Unlinked folder: context explains how to link instead of failing.
  let r = await tool('get_project_context', { cwd: join(repo, 'src', 'auth') })
  assert.equal(r.isError, false)
  assert.match(r.text, /link_project/)
  assert.equal(projectBrief(repo), null, 'no brief for an unlinked folder (hook stays silent)')

  r = await tool('link_project', { desk: 'MCP 데스크', path: repo })
  assert.equal(r.isError, false, r.text)
  r = await tool('link_project', { desk: 'MCP 데스크', path: '/definitely/not/here' })
  assert.equal(r.isError, true)

  // From a subfolder of the repo: desk, branch, open tasks, notes and docs.
  r = await tool('get_project_context', { cwd: join(repo, 'src', 'auth') })
  assert.match(r.text, /MCP 데스크/)
  assert.match(r.text, /feat\/login/)
  assert.match(r.text, /인증 흐름/, 'open task / recent note listed')
  assert.match(r.text, /README\.md/)
  assert.ok((projectBrief(join(repo, 'src')) ?? '').includes('MCP 데스크'), 'hook brief resolves subfolders too')
  // A sibling folder that merely shares a prefix is not inside the project.
  assert.equal(projectBrief(`${repo}-other`), null)

  // Subscribed calendar events reach Claude Code: a tool, and today's slice in the brief.
  const feed = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'DTSTART:20260929T010000Z',
    'DTEND:20260929T020000Z',
    'UID:review@example.com',
    'SUMMARY:아키텍처 리뷰',
    'LOCATION:회의실 A',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n')
  await addCalendar(
    { name: '업무', url: 'https://calendar.example.com/private.ics', color: '#123456' },
    { fetcher: async () => feed, now: new Date('2026-09-25T00:00:00Z') }
  )
  r = await tool('list_events', { from: '2026-09-29', to: '2026-09-29' })
  assert.equal(r.isError, false, r.text)
  assert.match(r.text, /아키텍처 리뷰/)
  assert.match(r.text, /회의실 A/)
  r = await tool('list_events', { from: '2026-10-01', to: '2026-10-02' })
  assert.doesNotMatch(r.text, /아키텍처 리뷰/)
  r = await tool('list_events', { from: '어제' })
  assert.equal(r.isError, true)
  const briefToday = projectBrief(repo, new Date('2026-09-29T00:30:00Z')) ?? ''
  assert.match(briefToday, /오늘 일정/)
  assert.match(briefToday, /아키텍처 리뷰/)

  console.log('mcp projects: all assertions passed')
}
// projects() builds on the desk and notes main() creates.
main()
  .then(projects)
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
