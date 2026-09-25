import { TOOLS } from './tools'

// Minimal MCP (Model Context Protocol) server side: JSON-RPC 2.0 with initialize,
// ping, tools/list and tools/call. Hand-rolled because that is all this server needs;
// swap in @modelcontextprotocol/sdk if resources/prompts/streaming are ever added.

const DEFAULT_PROTOCOL_VERSION = '2025-06-18'
const SERVER_INFO = { name: 'aop-note', version: '0.1.0' }
const INSTRUCTIONS =
  "AOP Note is the user's local work brain: desks → categories → notes (each note is also a task). " +
  'Search before creating to avoid duplicates, read a note to see its links and backlinks, and ' +
  'connect related notes with [[Exact Title]] links in Markdown so they appear in backlinks and the graph.'

interface Request {
  jsonrpc: '2.0'
  id?: string | number | null
  method?: string
  params?: unknown
}

const ok = (id: Request['id'], result: unknown): object => ({ jsonrpc: '2.0', id, result })
const fail = (id: Request['id'], code: number, message: string): object => ({ jsonrpc: '2.0', id, error: { code, message } })

/** One incoming message → its response, or null for notifications (no id). */
export async function handleMessage(msg: Request): Promise<object | null> {
  const isNotification = msg.id === undefined || msg.id === null
  if (typeof msg.method !== 'string') return isNotification ? null : fail(msg.id, -32600, 'Invalid request')
  if (isNotification) return null // e.g. notifications/initialized, notifications/cancelled

  const params = (msg.params ?? {}) as Record<string, unknown>
  switch (msg.method) {
    case 'initialize':
      return ok(msg.id, {
        // Echo the client's version: our surface (tools only) is the same across versions.
        protocolVersion: typeof params.protocolVersion === 'string' ? params.protocolVersion : DEFAULT_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS
      })
    case 'ping':
      return ok(msg.id, {})
    case 'tools/list':
      return ok(msg.id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) })
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params.name)
      if (!tool) return fail(msg.id, -32602, `Unknown tool: ${String(params.name)}`)
      try {
        const text = tool.run((params.arguments ?? {}) as Record<string, unknown>)
        return ok(msg.id, { content: [{ type: 'text', text }] })
      } catch (error) {
        // Tool errors go back as results so the model can read them and retry.
        const message = error instanceof Error ? error.message : String(error)
        return ok(msg.id, { content: [{ type: 'text', text: message }], isError: true })
      }
    }
    default:
      return fail(msg.id, -32601, `Method not found: ${msg.method}`)
  }
}
