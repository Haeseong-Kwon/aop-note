import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'
import { createBookmark, createCallout, createDatabase, createTableOfContents } from './blocks'
import { createSynced } from './synced'

/** The memo schema: BlockNote's blocks plus the Notion-style ones. */
export const memoSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    callout: createCallout(),
    bookmark: createBookmark(),
    toc: createTableOfContents(),
    database: createDatabase(),
    synced: createSynced()
  }
})
