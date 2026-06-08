import {
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  File as FileIcon,
  FileType
} from 'lucide-react'

/** Pick a lucide icon component for a file extension. */
export function fileIconFor(ext: string): typeof FileIcon {
  const e = ext.toLowerCase()
  if (e === 'pdf') return FileType
  if (['doc', 'docx', 'txt', 'md', 'markdown', 'rtf'].includes(e)) return FileText
  if (['xlsx', 'xls', 'xlsm', 'csv'].includes(e)) return FileSpreadsheet
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(e)) return ImageIcon
  return FileIcon
}
