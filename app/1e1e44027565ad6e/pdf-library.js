// Keep the larger multipage scores outside the photo library's localStorage quota.
let database
function connect() {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open('scorelens-pdfs', 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('pieces', { keyPath: 'id' })
        request.result.createObjectStore('summaries', { keyPath: 'id' })
      }
      request.onsuccess = () => {
        const db = request.result
        db.onversionchange = () => {
          db.close()
          database = undefined
        }
        resolve(db)
      }
      request.onerror = () => reject(request.error)
    }).catch((error) => {
      database = undefined
      throw error
    })
  }
  return database
}

async function access(stores, mode, action) {
  const db = await connect()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(stores, mode)
    const request = action(transaction)
    transaction.oncomplete = () => resolve(request?.result)
    transaction.onabort = () => reject(transaction.error || new Error('PDF storage unavailable'))
  })
}

export function savePdf(item) {
  return access(['pieces', 'summaries'], 'readwrite', (tx) => {
    tx.objectStore('pieces').put(item)
    tx.objectStore('summaries').put({
      id: item.id,
      title: item.score.title,
      measures: item.score.measures.length,
      timeSignature: item.score.timeSignature,
      savedAt: Date.now()
    })
  })
}
export function removePdf(id) {
  return access(['pieces', 'summaries'], 'readwrite', (tx) => {
    tx.objectStore('pieces').delete(id)
    tx.objectStore('summaries').delete(id)
  })
}
export function readPdf(id) {
  return access(['pieces'], 'readonly', (tx) => tx.objectStore('pieces').get(id))
}
export function pdfSummaries() {
  return access(['summaries'], 'readonly', (tx) => tx.objectStore('summaries').getAll())
}
