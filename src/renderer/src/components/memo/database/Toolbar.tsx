import { useRef, useState } from 'react'
import { Table2, Columns3, List, LayoutGrid, Filter, ArrowUpDown, Settings2, Plus, Trash2, X } from 'lucide-react'
import { Popover } from '@/components/ui/popover'
import { toastError } from '@/store/useToast'
import { cn } from '@/lib/utils'
import type { Field, FilterOp, ViewConfig, ViewKind } from '@/lib/database'
import type { Category, DatabaseData, PropertyType } from '@shared/types'

export const VIEW_TABS: { value: ViewKind; label: string; icon: typeof Table2 }[] = [
  { value: 'table', label: '표', icon: Table2 },
  { value: 'board', label: '보드', icon: Columns3 },
  { value: 'list', label: '목록', icon: List },
  { value: 'gallery', label: '갤러리', icon: LayoutGrid }
]

export const TYPE_LABEL: Record<PropertyType, string> = {
  text: '텍스트',
  number: '숫자',
  select: '선택',
  multi_select: '다중 선택',
  date: '날짜',
  checkbox: '체크박스',
  url: 'URL'
}

const BUILT_IN_FIELDS: { field: Field; label: string }[] = [
  { field: 'title', label: '제목' },
  { field: 'status', label: '상태' },
  { field: 'priority', label: '우선순위' },
  { field: 'due', label: '기한' },
  { field: 'category', label: '카테고리' }
]

const OP_LABEL: Record<FilterOp, string> = {
  is: '=',
  is_not: '≠',
  contains: '포함',
  empty: '비어 있음',
  not_empty: '비어 있지 않음',
  before: '이전',
  after: '이후'
}

export function allFields(data: DatabaseData): { field: Field; label: string }[] {
  return [...BUILT_IN_FIELDS, ...data.properties.map((p) => ({ field: `prop:${p.id}` as Field, label: p.name }))]
}
export const fieldLabel = (field: Field, data: DatabaseData): string =>
  allFields(data).find((f) => f.field === field)?.label ?? '삭제된 속성'

const selectClass = 'h-7 rounded-md border border-input bg-background/70 px-1.5 text-xs outline-none focus:ring-2 focus:ring-ring'

function ToolButton({
  icon: Icon,
  label,
  active,
  onClick,
  btnRef
}: {
  icon: typeof Filter
  label: string
  active?: boolean
  onClick: () => void
  btnRef?: React.Ref<HTMLButtonElement>
}): JSX.Element {
  return (
    <button
      ref={btnRef}
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-7 items-center gap-1 rounded-md px-2 text-xs transition-colors hover:bg-accent',
        active ? 'text-primary' : 'text-muted-foreground'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

interface ToolbarProps {
  cfg: ViewConfig
  data: DatabaseData
  categories: Category[]
  onConfig: (patch: Partial<ViewConfig>) => void
  onChanged: () => void
  onNew: () => void
}

export function Toolbar({ cfg, data, categories, onConfig, onChanged, onNew }: ToolbarProps): JSX.Element {
  const [open, setOpen] = useState<'filter' | 'sort' | 'props' | null>(null)
  const filterRef = useRef<HTMLButtonElement>(null)
  const sortRef = useRef<HTMLButtonElement>(null)
  const propsRef = useRef<HTMLButtonElement>(null)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<PropertyType>('select')
  const fields = allFields(data)
  const groupable = fields.filter(
    (f) => f.field === 'status' || f.field === 'priority' || data.properties.some((p) => `prop:${p.id}` === f.field && p.type === 'select')
  )

  const addProperty = async (): Promise<void> => {
    if (!newName.trim()) return
    try {
      await window.api.database.createProperty({ workspace_id: cfg.workspaceId, name: newName, type: newType })
      setNewName('')
      onChanged()
    } catch (e) {
      toastError(e)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border pb-1.5">
      <input
        value={cfg.title}
        onChange={(e) => onConfig({ title: e.target.value })}
        placeholder="데이터베이스"
        aria-label="뷰 이름"
        className="mr-2 w-40 bg-transparent text-base font-semibold outline-none placeholder:text-muted-foreground/60"
      />
      <div className="flex rounded-md bg-muted/60 p-0.5" role="tablist">
        {VIEW_TABS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={cfg.view === value}
            onClick={() => onConfig({ view: value, groupBy: value === 'board' && !cfg.groupBy ? 'status' : cfg.groupBy })}
            className={cn(
              'flex h-6 items-center gap-1 rounded px-2 text-xs',
              cfg.view === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <select
        value={cfg.categoryId ?? ''}
        onChange={(e) => onConfig({ categoryId: e.target.value || null })}
        aria-label="범위"
        className={cn(selectClass, 'ml-1 max-w-[9rem]')}
      >
        <option value="">데스크 전체</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.parent_id ? '— ' : ''}
            {c.name}
          </option>
        ))}
      </select>

      {(cfg.view === 'board' || cfg.view === 'list') && (
        <select
          value={cfg.groupBy ?? ''}
          onChange={(e) => onConfig({ groupBy: (e.target.value || null) as Field | null })}
          aria-label="그룹"
          className={selectClass}
        >
          {cfg.view === 'list' && <option value="">그룹 없음</option>}
          {groupable.map((f) => (
            <option key={f.field} value={f.field}>
              그룹: {f.label}
            </option>
          ))}
        </select>
      )}

      <div className="ml-auto flex items-center">
        <ToolButton btnRef={filterRef} icon={Filter} label={cfg.filters.length ? `필터 ${cfg.filters.length}` : '필터'} active={cfg.filters.length > 0} onClick={() => setOpen('filter')} />
        <ToolButton btnRef={sortRef} icon={ArrowUpDown} label="정렬" active={!!cfg.sort} onClick={() => setOpen('sort')} />
        <ToolButton btnRef={propsRef} icon={Settings2} label="속성" onClick={() => setOpen('props')} />
        <button
          type="button"
          onClick={onNew}
          className="ml-1 flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" />
          새로 만들기
        </button>
      </div>

      {open === 'filter' && (
        <Popover anchorEl={filterRef.current} onClose={() => setOpen(null)} width={420} align="right">
          {cfg.filters.length === 0 && <p className="px-1 pb-2 text-xs text-muted-foreground">필터가 없습니다.</p>}
          {cfg.filters.map((f, i) => {
            const update = (patch: Partial<typeof f>): void =>
              onConfig({ filters: cfg.filters.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
            return (
              <div key={i} className="mb-1.5 flex items-center gap-1">
                <select value={f.field} onChange={(e) => update({ field: e.target.value as Field })} className={cn(selectClass, 'w-28')}>
                  {fields.map((x) => (
                    <option key={x.field} value={x.field}>
                      {x.label}
                    </option>
                  ))}
                </select>
                <select value={f.op} onChange={(e) => update({ op: e.target.value as FilterOp })} className={cn(selectClass, 'w-28')}>
                  {(Object.keys(OP_LABEL) as FilterOp[]).map((op) => (
                    <option key={op} value={op}>
                      {OP_LABEL[op]}
                    </option>
                  ))}
                </select>
                {f.op !== 'empty' && f.op !== 'not_empty' && (
                  <input
                    value={f.value ?? ''}
                    onChange={(e) => update({ value: e.target.value })}
                    placeholder={f.field === 'due' || f.op === 'before' || f.op === 'after' ? 'YYYY-MM-DD' : f.field === 'status' ? 'todo / doing / done' : '값'}
                    className={cn(selectClass, 'min-w-0 flex-1')}
                  />
                )}
                <button type="button" aria-label="필터 삭제" onClick={() => onConfig({ filters: cfg.filters.filter((_, j) => j !== i) })} className="rounded p-1 text-muted-foreground hover:bg-accent">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
          <button
            type="button"
            onClick={() => onConfig({ filters: [...cfg.filters, { field: 'status', op: 'is_not', value: 'done' }] })}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            필터 추가
          </button>
        </Popover>
      )}

      {open === 'sort' && (
        <Popover anchorEl={sortRef.current} onClose={() => setOpen(null)} width={280} align="right">
          <div className="flex items-center gap-1">
            <select
              value={cfg.sort?.field ?? ''}
              onChange={(e) => onConfig({ sort: e.target.value ? { field: e.target.value as Field, dir: cfg.sort?.dir ?? 'asc' } : null })}
              className={cn(selectClass, 'flex-1')}
            >
              <option value="">직접 정렬 (기본)</option>
              {fields.map((x) => (
                <option key={x.field} value={x.field}>
                  {x.label}
                </option>
              ))}
            </select>
            {cfg.sort && (
              <select
                value={cfg.sort.dir}
                onChange={(e) => onConfig({ sort: { ...cfg.sort!, dir: e.target.value as 'asc' | 'desc' } })}
                className={selectClass}
              >
                <option value="asc">오름차순</option>
                <option value="desc">내림차순</option>
              </select>
            )}
          </div>
        </Popover>
      )}

      {open === 'props' && (
        <Popover anchorEl={propsRef.current} onClose={() => setOpen(null)} width={300} align="right">
          <p className="px-1 pb-1 text-[11px] font-medium text-muted-foreground">보이는 속성</p>
          {fields
            .filter((f) => f.field !== 'title')
            .map((f) => {
              const hidden = cfg.hidden.includes(f.field)
              const prop = data.properties.find((p) => `prop:${p.id}` === f.field)
              return (
                <div key={f.field} className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-accent/60">
                  <input
                    type="checkbox"
                    checked={!hidden}
                    onChange={() => onConfig({ hidden: hidden ? cfg.hidden.filter((h) => h !== f.field) : [...cfg.hidden, f.field] })}
                    aria-label={`${f.label} 보이기`}
                  />
                  {prop ? (
                    <input
                      defaultValue={prop.name}
                      onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value !== prop.name) {
                          window.api.database.updateProperty({ id: prop.id, name: e.target.value }).then(onChanged, toastError)
                        }
                      }}
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                      aria-label="속성 이름"
                    />
                  ) : (
                    <span className="flex-1 text-sm">{f.label}</span>
                  )}
                  <span className="text-[11px] text-muted-foreground">{prop ? TYPE_LABEL[prop.type] : '기본'}</span>
                  {prop && (
                    <button
                      type="button"
                      aria-label={`${prop.name} 삭제`}
                      onClick={() => window.api.database.removeProperty(prop.id).then(onChanged, toastError)}
                      className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
          <div className="mt-2 border-t border-border pt-2">
            <p className="px-1 pb-1 text-[11px] font-medium text-muted-foreground">새 속성 (이 데스크의 모든 작업에 추가)</p>
            <form
              className="flex gap-1"
              onSubmit={(e) => {
                e.preventDefault()
                void addProperty()
              }}
            >
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="이름" className={cn(selectClass, 'min-w-0 flex-1')} />
              <select value={newType} onChange={(e) => setNewType(e.target.value as PropertyType)} className={selectClass}>
                {(Object.keys(TYPE_LABEL) as PropertyType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={!newName.trim()} className="rounded-md bg-primary px-2 text-xs text-primary-foreground disabled:opacity-50">
                추가
              </button>
            </form>
          </div>
        </Popover>
      )}
    </div>
  )
}
