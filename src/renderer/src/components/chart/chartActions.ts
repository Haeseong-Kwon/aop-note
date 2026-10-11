import { chartMarkdown, chartTitle } from '@shared/chart/html'
import type { ChartDoc } from '@shared/chart/kinds'
import { serializeNoteDoc } from '@shared/noteDoc'
import { chartPng } from '@/lib/chartImage'
import { useStore } from '@/store/useStore'
import { toastError, useToast } from '@/store/useToast'

const CHART_FOLDER = '통계·그래프'

export type ChartFileFormat = 'pdf' | 'pptx' | 'png'

const LABEL: Record<ChartFileFormat, string> = { pdf: 'PDF', pptx: 'PowerPoint', png: 'PNG 이미지' }

/** Save one chart as a file the user picks (the picture is drawn here, the file written by main). */
export async function exportChartFile(doc: ChartDoc, format: ChartFileFormat): Promise<void> {
  try {
    const png = format === 'pdf' ? null : await chartPng(doc)
    if (format === 'png' && !png) throw new Error('데이터를 입력해야 이미지로 내보낼 수 있습니다.')
    const result = await window.api.chart.export(JSON.stringify(doc), format, png)
    if (!result.canceled) useToast.getState().show({ message: `${LABEL[format]}로 저장했습니다${result.path ? ` — ${result.path.split(/[\\/]/).pop()}` : ''}` })
  } catch (error) {
    toastError(error)
  }
}

/** The block a chart lives in inside a memo. */
export const chartBlock = (doc: ChartDoc): { type: 'chart'; props: { doc: string } } => ({ type: 'chart', props: { doc: JSON.stringify(doc) } })

/** A new memo holding this chart (as a live chart block), in the open desk/folder, then open it. */
export async function saveChartAsMemo(doc: ChartDoc): Promise<void> {
  const { activeWorkspaceId, activeCategoryId, categories, createTask, openNote } = useStore.getState()
  if (!activeWorkspaceId) {
    toastError(new Error('메모를 저장할 데스크가 없습니다. 먼저 데스크를 만들어 주세요.'))
    return
  }
  try {
    // A desk with no folder yet gets one, so the chart always has somewhere to go.
    const categoryId = activeCategoryId ?? categories[0]?.id ?? (await window.api.category.create({ workspace_id: activeWorkspaceId, name: CHART_FOLDER })).id
    const md = chartMarkdown(doc)
    const task = await createTask({ category_id: categoryId, title: chartTitle(doc), note: md, note_doc: serializeNoteDoc(md, [chartBlock(doc), { type: 'paragraph' }]) })
    if (!task) throw new Error('메모를 만들지 못했습니다.')
    await openNote({ id: task.id, workspace_id: activeWorkspaceId, category_id: task.category_id })
    useToast.getState().show({ message: `‘${task.title}’ 메모로 저장했습니다. 메모 안에서 계속 고칠 수 있습니다.` })
  } catch (error) {
    toastError(error)
  }
}
