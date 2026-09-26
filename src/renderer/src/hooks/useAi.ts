import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiAction, AiResult } from '@shared/types'

export interface AiRun {
  text: string
  running: boolean
  error: string | null
  result: AiResult | null
  run: (action: AiAction, input: { text?: string; instruction?: string }) => Promise<AiResult | null>
  cancel: () => void
  reset: () => void
}

/** One AI request at a time: streamed text, final result, errors, cancel. */
export function useAi(): AiRun {
  const [text, setText] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AiResult | null>(null)
  const current = useRef<string | null>(null)

  useEffect(
    () =>
      window.api.onAiDelta((id, delta) => {
        if (id === current.current) setText((t) => t + delta)
      }),
    []
  )

  const run = useCallback(async (action: AiAction, input: { text?: string; instruction?: string }) => {
    const id = crypto.randomUUID()
    current.current = id
    setText('')
    setError(null)
    setResult(null)
    setRunning(true)
    try {
      const res = await window.api.ai.run({ id, action, ...input })
      if (current.current !== id) return null // superseded
      setText(res.text)
      setResult(res)
      return res
    } catch (e) {
      if (current.current === id) setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
      return null
    } finally {
      if (current.current === id) setRunning(false)
    }
  }, [])

  const cancel = useCallback(() => {
    if (current.current) void window.api.ai.cancel(current.current)
    current.current = null
    setRunning(false)
  }, [])

  const reset = useCallback(() => {
    cancel()
    setText('')
    setError(null)
    setResult(null)
  }, [cancel])

  useEffect(() => cancel, [cancel]) // stop streaming when the panel unmounts
  return { text, running, error, result, run, cancel, reset }
}
