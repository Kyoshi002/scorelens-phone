const runtime = new URL('./pyodide/', import.meta.url)
const sources = ['score.py', 'score_conversion.py']

async function fetchSource(name) {
  const response = await fetch(new URL(name, import.meta.url))
  if (!response.ok) throw new Error('Score conversion source could not be loaded.')
  return new Uint8Array(await response.arrayBuffer())
}

self.onmessage = async ({ data }) => {
  try {
    self.postMessage({ type: 'progress', message: 'Preparing the recognized score…' })
    const [{ loadPyodide }, ...code] = await Promise.all([
      import(new URL('pyodide.mjs', runtime).href),
      ...sources.map(fetchSource)
    ])
    const python = await loadPyodide({ indexURL: runtime.href })
    sources.forEach((name, index) => python.FS.writeFile(name, code[index]))
    python.globals.set('score_payload', JSON.stringify(data))
    const result = python.runPython(`
import json
from score_conversion import convert_pages, ScoreConversionError

try:
    result = {"type": "result", "score": convert_pages(**json.loads(score_payload))}
except ScoreConversionError as error:
    result = {"type": "error", "message": str(error)}
json.dumps(result, ensure_ascii=False)
`)
    self.postMessage(JSON.parse(result))
  } catch (error) {
    console.error('Score conversion failed', error)
    self.postMessage({ type: 'error', message: 'The score reader could not prepare this scan. Try again.' })
  }
}
