import type { DragEvent } from 'react'

// Drag payloads inside the 문서함. OS files arrive as dataTransfer.files instead.
export const DOC_MIME = 'application/x-aop-doc'
export const FOLDER_MIME = 'application/x-aop-folder'

export type DropPayload =
  | { kind: 'doc'; id: string }
  | { kind: 'folder'; id: string }
  | { kind: 'files'; files: File[] }

/** A drop target accepts our own drags and files from Finder. */
export const isDroppable = (e: DragEvent): boolean =>
  [DOC_MIME, FOLDER_MIME, 'Files'].some((t) => e.dataTransfer.types.includes(t))

export function readDrop(e: DragEvent): DropPayload | null {
  const doc = e.dataTransfer.getData(DOC_MIME)
  if (doc) return { kind: 'doc', id: doc }
  const folder = e.dataTransfer.getData(FOLDER_MIME)
  if (folder) return { kind: 'folder', id: folder }
  const files = [...e.dataTransfer.files]
  return files.length ? { kind: 'files', files } : null
}
