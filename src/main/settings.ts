import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { app } from 'electron'
import type { AppSettings } from '@shared/types'

export const DEFAULT_SETTINGS: AppSettings = {
  launchAtLogin: false,
  dueNotifications: true,
  globalShortcut: true,
  vaultPath: '',
  aiProvider: 'claude-code',
  aiModel: 'claude-opus-5'
}

export const settingsPath = (): string => join(app.getPath('userData'), 'settings.json')

/** Keep only known keys whose value has the default's type — input comes from the renderer / disk. */
function sanitize(input: unknown): Partial<AppSettings> {
  if (!input || typeof input !== 'object') return {}
  const out: Partial<AppSettings> = {}
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
    const value = (input as Record<string, unknown>)[key]
    if (typeof value === typeof DEFAULT_SETTINGS[key]) out[key] = value as never
  }
  if (out.aiProvider !== undefined && out.aiProvider !== 'claude-code' && out.aiProvider !== 'api') delete out.aiProvider
  if (out.aiModel !== undefined && !['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'].includes(out.aiModel)) delete out.aiModel
  return out
}

export function loadSettings(): AppSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...sanitize(JSON.parse(readFileSync(settingsPath(), 'utf8'))) }
  } catch {
    return { ...DEFAULT_SETTINGS } // missing or corrupt file
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...loadSettings(), ...sanitize(patch) }
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2))
  return next
}
