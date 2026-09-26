import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'
import { createBookmark, createCallout, createTableOfContents } from './blocks'

/**
 * Schema for editors nested inside a block (synced blocks): no synced blocks or
 * database views inside them, so content can't recurse into itself.
 */
export const nestedSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    callout: createCallout(),
    bookmark: createBookmark(),
    toc: createTableOfContents()
  }
})
