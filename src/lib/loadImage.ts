export interface LoadedImage { src: string; w: number; h: number; name: string }

function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => reject(new Error('That image could not be opened'))
    img.src = src
  })
}

async function renderPdfFirstPage(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const page = await doc.getPage(1)
  // Render at high resolution so fine grid lines survive zooming.
  const viewport = page.getViewport({ scale: 4 })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  await page.render({ canvas, viewport }).promise
  return canvas.toDataURL('image/png')
}

/** Loads an image or the first page of a PDF. Everything stays in the browser. */
export async function loadFile(file: File): Promise<LoadedImage> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const src = isPdf ? await renderPdfFirstPage(file) : URL.createObjectURL(file)
  const { w, h } = await imageSize(src)
  return { src, w, h, name: file.name }
}
