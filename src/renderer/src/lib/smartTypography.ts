import { Extension, InputRule } from '@tiptap/core'

/**
 * Notion-style text shortcuts: type the token, press space, get the symbol.
 * Longest tokens first so `-->` wins over `->`.
 */
const PAIRS: readonly (readonly [string, string])[] = [
  ['<-->', '↔'],
  ['<->', '↔'],
  ['-->', '→'],
  ['<--', '←'],
  ['==>', '⇒'],
  ['<==', '⇐'],
  ['(tm)', '™'],
  ['->', '→'],
  ['<-', '←'],
  ['=>', '⇒'],
  ['!=', '≠'],
  ['<=', '≤'],
  ['>=', '≥'],
  ['+-', '±'],
  ['--', '—'],
  ['...', '…'],
  ['(c)', '©'],
  ['(r)', '®'],
  ['1/2', '½'],
  ['1/4', '¼'],
  ['3/4', '¾']
]

const SYMBOLS = new Map(PAIRS)

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Matches "<token> " at the caret, requiring the token to start a word.
const FIND = new RegExp(`(?:^|\\s)(${PAIRS.map(([token]) => escape(token)).join('|')}) $`)

/**
 * Pure core of the rule: given the text just before the caret, the symbol to
 * substitute for the trailing "<token> ", or null. Exported so it is testable
 * without a ProseMirror document.
 */
export function matchSmartToken(
  textBeforeCaret: string
): { token: string; symbol: string } | null {
  const match = FIND.exec(textBeforeCaret)
  const symbol = match && SYMBOLS.get(match[1])
  return symbol ? { token: match[1], symbol } : null
}

export const SmartTypography = Extension.create({
  name: 'aopSmartTypography',

  addInputRules() {
    return [
      new InputRule({
        find: FIND,
        handler: ({ state, range, match }) => {
          const token = match[1]
          const symbol = SYMBOLS.get(token)
          if (!symbol) return null
          // The space that triggered the rule isn't in the doc yet, so range.to sits
          // right after the token. Replace the token and re-add the space ourselves.
          state.tr.insertText(`${symbol} `, range.to - token.length, range.to)
          return undefined
        }
      })
    ]
  }
})
