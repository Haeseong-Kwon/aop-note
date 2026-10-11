/** Schemes the OS may open for a link clicked in the app; anything else (file:, smb:, custom handlers) is dropped. */
const EXTERNAL_SCHEMES = new Set(['http:', 'https:', 'mailto:'])

export function isSafeExternalUrl(url: string): boolean {
  try {
    return EXTERNAL_SCHEMES.has(new URL(url).protocol)
  } catch {
    return false
  }
}
