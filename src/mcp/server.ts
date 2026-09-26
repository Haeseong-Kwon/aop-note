// AOP Note MCP server — lets Claude Code (or any MCP client) search, read and add
// notes from whatever codebase it is working in. Newline-delimited JSON-RPC on stdio;
// stdout is reserved for protocol messages, so diagnostics go to stderr.
//
// With --brief it instead acts as a Claude Code SessionStart hook: reads the hook's
// JSON from stdin, prints the linked desk's brief for its cwd (added to the session's
// context), and exits. Unlinked folders print nothing.
import { createInterface } from 'readline'
import { handleMessage } from './protocol'
import { projectBrief } from './tools'

const send = (message: object): void => {
  process.stdout.write(JSON.stringify(message) + '\n')
}

function serve(): void {
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
}

/** A hook must never break the session: any failure → no output, exit 0. */
function brief(): void {
  let input = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => (input += chunk))
  process.stdin.on('end', () => {
    try {
      let cwd = process.cwd()
      try {
        const payload = JSON.parse(input) as { cwd?: unknown }
        if (typeof payload.cwd === 'string' && payload.cwd) cwd = payload.cwd
      } catch {
        /* no / invalid hook payload: fall back to the process cwd */
      }
      const text = projectBrief(cwd)
      if (text) process.stdout.write(text + '\n')
    } catch (error) {
      console.error('[aop-note brief] failed:', error)
    }
    process.exit(0)
  })
}

if (process.argv.includes('--brief')) brief()
else serve()
