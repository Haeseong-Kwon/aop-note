// AOP Note MCP server — lets Claude Code (or any MCP client) search, read and add
// notes from whatever codebase it is working in. Newline-delimited JSON-RPC on stdio;
// stdout is reserved for protocol messages, so diagnostics go to stderr.
import { createInterface } from 'readline'
import { handleMessage } from './protocol'

const send = (message: object): void => {
  process.stdout.write(JSON.stringify(message) + '\n')
}

createInterface({ input: process.stdin }).on('line', async (line) => {
  if (!line.trim()) return
  let msg: unknown
  try {
    msg = JSON.parse(line)
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    return
  }
  try {
    const reply = await handleMessage(msg as Parameters<typeof handleMessage>[0])
    if (reply) send(reply)
  } catch (error) {
    console.error('[aop-note mcp] request failed:', error)
    const id = (msg as { id?: string | number }).id ?? null
    send({ jsonrpc: '2.0', id, error: { code: -32603, message: 'Internal error' } })
  }
})
