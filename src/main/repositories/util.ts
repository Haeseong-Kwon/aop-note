import { randomUUID } from 'crypto'

export const newId = (): string => randomUUID()

export const nowIso = (): string => new Date().toISOString()
