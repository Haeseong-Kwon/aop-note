import { create } from 'zustand'

export interface Toast {
  id: number
  message: string
  tone?: 'default' | 'error'
  actionLabel?: string
  onAction?: () => void
}

interface ToastState {
  toast: Toast | null
  show: (toast: Omit<Toast, 'id'>) => void
  dismiss: () => void
}

let nextId = 1

/** One toast at a time: a newer message replaces the current one (Notion/Linear style). */
export const useToast = create<ToastState>((set) => ({
  toast: null,
  show: (toast) => set({ toast: { ...toast, id: nextId++ } }),
  dismiss: () => set({ toast: null })
}))

export const toastError = (e: unknown): void =>
  useToast.getState().show({ message: e instanceof Error ? e.message : String(e), tone: 'error' })
