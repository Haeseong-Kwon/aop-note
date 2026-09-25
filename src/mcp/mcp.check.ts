import assert from 'node:assert'
import { handleMessage } from './protocol'
import { workspaceRepo } from '../main/repositories/workspace.repo'
import { categoryRepo } from '../main/repositories/category.repo'

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
  assert.deepEqual(names.sort(), ['append_to_note', 'create_note', 'list_desks', 'list_tasks', 'read_note', 'search_notes'])

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

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
