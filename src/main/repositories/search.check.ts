import assert from 'node:assert'
import { workspaceRepo } from './workspace.repo'
import { categoryRepo } from './category.repo'
import { taskRepo } from './task.repo'
import { searchRepo } from './search.repo'

// Graph search: memo titles AND bodies, every hit (not the palette's top 20), with a snippet.
const ws = workspaceRepo.create({ name: '검색 데스크' })
const cat = categoryRepo.create({ workspace_id: ws.id, name: '자료' })
const inBody = taskRepo.create({ category_id: cat.id, title: '주간 회의', note: '지난주 논의: 온보딩 퍼널 이탈률이 높다. 다음 액션은 인터뷰.' })
const inTitle = taskRepo.create({ category_id: cat.id, title: '퍼널 분석', note: '' })
const gone = taskRepo.create({ category_id: cat.id, title: '퍼널 삭제됨', note: '' })
taskRepo.remove(gone.id)
for (let i = 0; i < 25; i++) taskRepo.create({ category_id: cat.id, title: `메모 ${i}`, note: `여기에도 퍼널 언급 ${i}` })

const hits = searchRepo.notes('퍼널')
const ids = hits.map((h) => h.id)
assert.ok(ids.includes(inBody.id), 'body match')
assert.ok(ids.includes(inTitle.id), 'title match')
assert.ok(!ids.includes(gone.id), 'trashed memos are not found')
assert.ok(hits.length >= 27, 'not capped at the palette limit')
const body = hits.find((h) => h.id === inBody.id)
assert.match(body?.snippet ?? '', /온보딩 퍼널 이탈률/, 'snippet shows the text around the match')
assert.equal(hits.find((h) => h.id === inTitle.id)?.snippet, '', 'title-only hit: no snippet')
assert.deepEqual(searchRepo.notes('   '), [])
assert.deepEqual(searchRepo.notes('100%'), [], 'LIKE wildcards are literal')
console.log('note search: all assertions passed')
