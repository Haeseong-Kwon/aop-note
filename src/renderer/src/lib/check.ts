import assert from 'node:assert'
import { matchSmartToken } from './smartTypography'

/** Mirrors the InputRule handler: replace the trailing "<token> " with "<symbol> ". */
function apply(textBeforeCaret: string): string {
  const hit = matchSmartToken(textBeforeCaret)
  if (!hit) return textBeforeCaret
  const from = textBeforeCaret.length - 1 - hit.token.length // -1: trailing space not yet in doc
  return textBeforeCaret.slice(0, from) + hit.symbol + ' '
}

assert.equal(apply('-> '), '→ ')
assert.equal(apply('a -> '), 'a → ')
assert.equal(apply('a --> '), 'a → ')      // longest token wins
assert.equal(apply('a <-> '), 'a ↔ ')
assert.equal(apply('a <--> '), 'a ↔ ')
assert.equal(apply('x -- '), 'x — ')
assert.equal(apply('x ... '), 'x … ')
assert.equal(apply('x (c) '), 'x © ')
assert.equal(apply('x != '), 'x ≠ ')
assert.equal(apply('일단 -> '), '일단 → ')
assert.equal(apply('a->'), 'a->')          // no trailing space: untouched
assert.equal(apply('a-> '), 'a-> ')        // mid-word: untouched
assert.equal(apply('x--> more'), 'x--> more')
assert.equal(apply('plain text '), 'plain text ')
console.log('smartTypography: all assertions passed')

// --- memoMarkdown: attachment round-trip -------------------------------------
import { extractFiles, restoreFileBlocks } from './memoMarkdown'

const NOTE =
  '![shot.png](aop-file:///a.png)[spec.pdf](aop-file:///b.pdf)\n\nattachment test\n'
const ex = extractFiles(NOTE)
assert.deepEqual(ex.files, [{ name: 'spec.pdf', url: 'aop-file:///b.pdf' }])
assert.equal(ex.markdown, '![shot.png](aop-file:///a.png)\n\n@@aop-file-0@@\n\nattachment test')

// The parser turns that markdown into these blocks; markers must become file blocks.
const parsed = [
  { type: 'image', props: { url: 'aop-file:///a.png' } },
  { type: 'paragraph', content: [{ type: 'text', text: '@@aop-file-0@@' }] },
  { type: 'paragraph', content: [{ type: 'text', text: 'attachment test' }] }
]
assert.deepEqual(restoreFileBlocks(parsed, ex.files), [
  { type: 'image', props: { url: 'aop-file:///a.png' } },
  { type: 'file', props: { url: 'aop-file:///b.pdf', name: 'spec.pdf' } },
  { type: 'paragraph', content: [{ type: 'text', text: 'attachment test' }] }
])

// Notes without attachments must pass through untouched.
assert.equal(extractFiles('# hi\n\nplain [link](https://x.dev)').files.length, 0)
assert.deepEqual(restoreFileBlocks(parsed, []), parsed)
console.log('memoMarkdown: all assertions passed')
