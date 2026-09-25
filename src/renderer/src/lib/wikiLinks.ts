import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { extractLinks } from '@shared/links'

export interface WikiLinksOptions {
  /** ⌘/Ctrl-click on a [[link]]: open (or create) the note with that title. */
  onOpen: (title: string) => void
}

const key = new PluginKey<DecorationSet>('wikiLinks')

// ponytail: rescans the whole memo on every edit — memos are small; switch to
// mapping + re-decorating changed ranges if long documents ever lag.
function decorate(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text?.includes('[[')) return
    for (const link of extractLinks(node.text)) {
      const from = pos + link.index
      decorations.push(
        Decoration.inline(
          from,
          from + link.length,
          { class: 'bn-wikilink', title: `${link.target} — ⌘+클릭으로 열기` },
          { target: link.target }
        )
      )
    }
  })
  return DecorationSet.create(doc, decorations)
}

/**
 * Shows Obsidian-style [[links]] as links without changing the stored text, so
 * memos stay plain Markdown. Links split across differently-styled text (half
 * bold) aren't detected — the same text in Obsidian would render oddly too.
 */
export const WikiLinks = Extension.create<WikiLinksOptions>({
  name: 'wikiLinks',

  addOptions() {
    return { onOpen: () => undefined }
  },

  addProseMirrorPlugins() {
    const { onOpen } = this.options
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_config, state) => decorate(state.doc),
          apply: (tr, old) => (tr.docChanged ? decorate(tr.doc) : old)
        },
        props: {
          decorations: (state) => key.getState(state),
          handleClick: (view, pos, event) => {
            if (!(event.metaKey || event.ctrlKey)) return false
            const hit = key.getState(view.state)?.find(pos, pos)[0]
            const target = (hit?.spec as { target?: string } | undefined)?.target
            if (!target) return false
            onOpen(target)
            return true
          }
        }
      })
    ]
  }
})
