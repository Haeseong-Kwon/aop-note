import assert from 'node:assert'
import { workspaceRepo } from './workspace.repo'
import { categoryRepo } from './category.repo'
import { taskRepo } from './task.repo'
import { linkRepo } from './link.repo'

const ws = workspaceRepo.create({ name: '브레인' })
const other = workspaceRepo.create({ name: '다른 데스크' })
const cat = categoryRepo.create({ workspace_id: ws.id, name: '지식' })
const cat2 = categoryRepo.create({ workspace_id: other.id, name: '잡동사니' })

const hub = taskRepo.create({ category_id: cat.id, title: 'RAG 파이프라인' })
const a = taskRepo.create({
  category_id: cat.id,
  title: '임베딩 모델 비교',
  note: '결론은 [[RAG 파이프라인]]에 반영.\n다음: [[벡터 DB 선정]]'
})
const b = taskRepo.create({ category_id: cat.id, title: '회의록', note: '오늘 rag 파이프라인 얘기함' })
// Same title in another desk: links resolve to the one in the linking note's desk.
const twin = taskRepo.create({ category_id: cat2.id, title: 'RAG 파이프라인' })

// Backlinks: who links here, with the line as context; plus unlinked mentions.
const back = linkRepo.backlinks(hub.id)
assert.deepEqual(back.linked.map((h) => h.task.id), [a.id])
assert.equal(back.linked[0].snippet, '결론은 [[RAG 파이프라인]]에 반영.')
assert.deepEqual(back.mentions.map((h) => h.task.id), [b.id], 'case-insensitive plain mention')
assert.deepEqual(linkRepo.backlinks(twin.id).linked, [], 'the twin in another desk is not the target')

// Resolution prefers the source note's desk.
assert.equal(linkRepo.resolve('rag 파이프라인', a.id)?.id, hub.id)
assert.equal(linkRepo.resolve('RAG 파이프라인', null)?.id !== undefined, true)
assert.equal(linkRepo.resolve('없는 메모', a.id), null)

// Graph: resolved edges + a ghost node for the not-yet-written note.
const g = linkRepo.graph()
const ids = new Set(g.nodes.map((n) => n.id))
assert.ok(ids.has(hub.id) && ids.has(a.id))
assert.ok(g.edges.some((e) => e.source === a.id && e.target === hub.id))
const ghost = g.nodes.find((n) => n.ghost)
assert.equal(ghost?.title, '벡터 DB 선정')
assert.ok(g.edges.some((e) => e.source === a.id && e.target === ghost?.id))
assert.equal(g.nodes.find((n) => n.id === hub.id)?.links, 1)

// Renaming a note rewrites links pointing at it (Obsidian behaviour)…
taskRepo.update({ id: hub.id, title: '검색 증강 파이프라인' })
assert.equal(taskRepo.getById(a.id)?.note, '결론은 [[검색 증강 파이프라인]]에 반영.\n다음: [[벡터 DB 선정]]')
// …but not when the old title was ambiguous (another live note still has it).
const dup1 = taskRepo.create({ category_id: cat.id, title: '중복' })
taskRepo.create({ category_id: cat.id, title: '중복' })
const refs = taskRepo.create({ category_id: cat.id, title: '참조', note: '[[중복]]' })
taskRepo.update({ id: dup1.id, title: '중복 해소' })
assert.equal(taskRepo.getById(refs.id)?.note, '[[중복]]')

console.log('links: all assertions passed')
