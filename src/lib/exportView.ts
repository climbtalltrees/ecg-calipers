interface Args {
  img: HTMLImageElement
  svg: SVGSVGElement
  w: number; h: number
  view: { s: number; tx: number; ty: number }
  vpW: number; vpH: number
  lines: string[]
}

function svgToImage(svg: SVGSVGElement, w: number, h: number): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(w)); clone.setAttribute('height', String(h))
  clone.querySelectorAll('[fill="transparent"],[stroke="transparent"]').forEach(n => n.remove())
  const text = new XMLSerializer().serializeToString(clone)
  return new Promise((res, rej) => {
    const i = new Image()
    i.onload = () => res(i); i.onerror = () => rej(new Error('Could not draw the calipers'))
    i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text)
  })
}

/** Renders exactly what is on screen, plus a measurement footer, and shares or downloads it. */
export async function exportView({ img, svg, w, h, view, vpW, vpH, lines }: Args) {
  const dpr = 2
  const lineH = 20, pad = 12
  const footer = pad * 2 + lineH * (Math.ceil(lines.length / 2) + 1)
  const c = document.createElement('canvas')
  c.width = Math.round(vpW * dpr); c.height = Math.round((vpH + footer) * dpr)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, c.width, c.height)
  ctx.save()
  ctx.beginPath(); ctx.rect(0, 0, vpW * dpr, vpH * dpr); ctx.clip()
  ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.tx, dpr * view.ty)
  ctx.drawImage(img, 0, 0, w, h)
  ctx.drawImage(await svgToImage(svg, w, h), 0, 0, w, h)
  ctx.restore()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, vpH, vpW, footer)
  ctx.fillStyle = '#0f172a'; ctx.font = '600 14px system-ui, sans-serif'
  lines.forEach((l, i) => ctx.fillText(l, pad + (i % 2) * (vpW / 2), vpH + pad + 14 + Math.floor(i / 2) * lineH))
  ctx.fillStyle = '#64748b'; ctx.font = '12px system-ui, sans-serif'
  ctx.fillText('ECGs Made Easy · all points placed by the user · not a diagnosis', pad, vpH + footer - pad)
  const blob: Blob = await new Promise((r, j) => c.toBlob(b => (b ? r(b) : j(new Error('Export failed'))), 'image/png'))
  const file = new File([blob], `ecg-measured-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Measured ECG' })
    return
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(file); a.download = file.name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}
