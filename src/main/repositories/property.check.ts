import assert from 'node:assert'
import { workspaceRepo } from './workspace.repo'
import { categoryRepo } from './category.repo'
import { taskRepo } from './task.repo'
import { propertyRepo } from './property.repo'

const ws = workspaceRepo.create({ name: 'DB 데스크' })
const other = workspaceRepo.create({ name: '다른 곳' })
const cat = categoryRepo.create({ workspace_id: ws.id, name: '백로그' })
const a = taskRepo.create({ category_id: cat.id, title: '로그인 개선' })
const b = taskRepo.create({ category_id: cat.id, title: '결제 버그' })

// Properties are per desk, ordered, typed.
const points = propertyRepo.create({ workspace_id: ws.id, name: '스토리 포인트', type: 'number' })
const area = propertyRepo.create({ workspace_id: ws.id, name: '영역', type: 'select' })
const tags = propertyRepo.create({ workspace_id: ws.id, name: '태그', type: 'multi_select' })
const spec = propertyRepo.create({ workspace_id: ws.id, name: '기획서', type: 'url' })
const shipped = propertyRepo.create({ workspace_id: ws.id, name: '배포됨', type: 'checkbox' })
propertyRepo.create({ workspace_id: other.id, name: '남의 속성', type: 'text' })
assert.deepEqual(propertyRepo.listByWorkspace(ws.id).map((p) => p.name), ['스토리 포인트', '영역', '태그', '기획서', '배포됨'])
assert.throws(() => propertyRepo.create({ workspace_id: ws.id, name: 'x', type: 'formula' as never }), /종류/)
assert.throws(() => propertyRepo.create({ workspace_id: ws.id, name: '  ', type: 'text' }), /이름/)

// Values are validated per type; select options are created on first use (Notion-style).
propertyRepo.setValue(a.id, points.id, 5)
propertyRepo.setValue(a.id, area.id, '프론트엔드')
propertyRepo.setValue(b.id, area.id, '백엔드')
propertyRepo.setValue(a.id, tags.id, ['긴급', 'UX', '긴급'])
propertyRepo.setValue(a.id, shipped.id, true)
propertyRepo.setValue(a.id, spec.id, 'https://docs.example.com/login')
assert.throws(() => propertyRepo.setValue(a.id, points.id, 'many'), /숫자/)
assert.throws(() => propertyRepo.setValue(a.id, spec.id, 'javascript:alert(1)'), /http/)
assert.throws(() => propertyRepo.setValue(a.id, shipped.id, 'yes'), /체크/)

const opts = propertyRepo.listByWorkspace(ws.id).find((p) => p.id === area.id)?.options.map((o) => o.name)
assert.deepEqual(opts, ['프론트엔드', '백엔드'], 'options appear as they are used')

const values = propertyRepo.valuesForWorkspace(ws.id)
assert.deepEqual(values[a.id], {
  [points.id]: 5,
  [area.id]: '프론트엔드',
  [tags.id]: ['긴급', 'UX'],
  [shipped.id]: true,
  [spec.id]: 'https://docs.example.com/login'
})
assert.deepEqual(values[b.id], { [area.id]: '백엔드' })

// Clearing a value removes it; deleting a property drops its values.
propertyRepo.setValue(a.id, spec.id, null)
assert.equal(propertyRepo.valuesForWorkspace(ws.id)[a.id][spec.id], undefined)
propertyRepo.update({ id: area.id, name: '담당 영역' })
assert.equal(propertyRepo.listByWorkspace(ws.id).find((p) => p.id === area.id)?.name, '담당 영역')
propertyRepo.remove(points.id)
assert.equal(propertyRepo.valuesForWorkspace(ws.id)[a.id][points.id], undefined)
assert.equal(propertyRepo.listByWorkspace(ws.id).length, 4)

console.log('properties: all assertions passed')
