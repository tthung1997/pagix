import { useEffect, useRef, useState } from 'react'
import { PreviewCancelled, requestThumbnail } from '../pdf/preview'
import { sourceStore } from '../pdf/sourceStore'

interface Props {
  sourceId: string
  pageIndex: number
  label: string
}

/** Renders a page preview only while it is near the viewport, releasing its pixels otherwise. */
export function Thumbnail({ sourceId, pageIndex, label }: Props) {
  const tileRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [near, setNear] = useState(typeof IntersectionObserver === 'undefined')
  const key = `${sourceId}:${pageIndex}`
  const [result, setResult] = useState<{ key: string; ok: boolean } | null>(null)

  useEffect(() => {
    const tile = tileRef.current
    if (!tile || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => setNear(entries.some((e) => e.isIntersecting)), {
      rootMargin: '600px 0px',
    })
    observer.observe(tile)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!near) return
    const canvas = canvasRef.current
    const file = sourceStore.get(sourceId)
    if (!canvas) return
    if (!file) {
      Promise.resolve().then(() => setResult({ key, ok: false }))
      return
    }
    let cancelled = false
    const request = requestThumbnail(sourceId, pageIndex, file)
    request.promise
      .then((bitmap) => {
        if (cancelled) return
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
        setResult({ key, ok: true })
      })
      .catch((error) => {
        if (cancelled || error instanceof PreviewCancelled) return
        console.warn('preview failed', error)
        setResult({ key, ok: false })
      })
    return () => {
      cancelled = true
      request.release()
      canvas.width = 0
      canvas.height = 0
      setResult(null)
    }
  }, [near, sourceId, pageIndex, key])

  const state = !near ? 'idle' : result?.key === key ? (result.ok ? 'ready' : 'error') : 'loading'

  return (
    <div className="thumb" ref={tileRef} data-state={state}>
      <canvas ref={canvasRef} role="img" aria-label={label} hidden={state !== 'ready'} />
      {state === 'error' && <span className="thumb-note">Preview unavailable</span>}
      {state === 'loading' && <span className="thumb-skeleton" aria-hidden="true" />}
    </div>
  )
}
