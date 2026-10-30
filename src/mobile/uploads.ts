import { posix } from 'path-browserify'
import { handlerFor, ipcMain, takePickedFile } from './shims/electron'
import { mkdirSync, rmSync, writeFileSync } from './shims/fs'
import { IPC } from '@shared/ipc'

// Uploads take a source path (desktop: the file on disk). On the phone that path is virtual
// (webUtils.getPathForFile): write the picked file's bytes there, run the desktop handler
// unchanged, then drop the copy.

async function withPickedFile<T>(path: string, run: () => T | Promise<T>): Promise<T> {
  const file = takePickedFile(path)
  if (!file) return run()
  mkdirSync(posix.dirname(path), { recursive: true })
  writeFileSync(path, new Uint8Array(await file.arrayBuffer()))
  try {
    return await run()
  } finally {
    rmSync(posix.dirname(path), { recursive: true, force: true })
  }
}

export function installUploads(): void {
  for (const channel of [IPC.attachment.upload, IPC.attachment.add]) {
    const original = handlerFor(channel)
    if (!original) continue
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, (event, input) =>
      withPickedFile(String((input as { source_path?: unknown }).source_path), () => original(event, input))
    )
  }
}
