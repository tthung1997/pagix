export function downloadBytes(bytes: Uint8Array, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()
  // The browser starts the download synchronously; keep the URL alive briefly for slow handlers.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
