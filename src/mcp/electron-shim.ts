// The MCP server runs as plain Node (ELECTRON_RUN_AS_NODE) and reuses the main
// process's repositories; this stands in for `electron`, which they import only
// to locate the data folder.
import { homedir } from 'os'
import { join } from 'path'

function defaultUserData(): string {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'aop-note')
  if (process.platform === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'aop-note')
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'aop-note')
}

const userData = process.env.AOP_NOTE_DATA || defaultUserData()

export const app = { getPath: (): string => userData }
