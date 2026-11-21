const workerURL = new URL('../../packs/310103c8489a4d1a/converter/score-conversion-worker.js', import.meta.url)

// Only the XML and lightweight page metadata enter the conversion worker.
// Previews stay here, keeping them out of the JavaScript-to-Python bridge.
export function convertRecognizedPages(
  { pages, pageCount = pages.length, skippedPages = [], title, pdf = false },
  { signal, onProgress } = {}
) {
  return new Promise((resolve, reject) => {
    const abortError = () => signal?.reason ?? new DOMException('Scan cancelled.', 'AbortError')
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const worker = new Worker(workerURL, { type: 'module' })
    const finish = (complete, value) => {
      signal?.removeEventListener('abort', abort)
      worker.onmessage = worker.onerror = worker.onmessageerror = null
      worker.terminate()
      complete(value)
    }
    const fail = (error) => finish(reject, error)
    const abort = () => fail(abortError())
    signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = ({ data }) => {
      try {
        if (data.type === 'progress') {
          onProgress?.(data.message)
        } else if (data.type === 'result') {
          const score = data.score
          if (pdf) {
            score.pages.forEach((page, index) => {
              if (pages[index].preview !== undefined) page.preview = pages[index].preview
            })
          }
          finish(resolve, score)
        } else {
          fail(new Error(data.message))
        }
      } catch (error) {
        fail(error)
      }
    }
    worker.onerror = () => fail(new Error('The score reader could not start. Try again.'))
    worker.onmessageerror = () => fail(new Error('The score reader returned an unreadable result. Try again.'))
    try {
      worker.postMessage({
        pages: pages.map(({ number, xml, imageSize }) => ({ number, xml, imageSize })),
        page_count: pageCount,
        skipped_pages: skippedPages,
        title,
        pdf
      })
    } catch (error) {
      fail(error)
    }
  })
}
