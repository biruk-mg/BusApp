// Gets a designer's picture ready to upload: checks the type, and shrinks it in
// the browser when it is large, so the API (max 1 MB) and the home page stay fast.

export const TARGET_BYTES = 450 * 1024
export const API_LIMIT_BYTES = 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as a picture')) }
    img.src = url
  })
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

export async function prepareBannerImage(file: File, maxWidth: number): Promise<Blob> {
  if (!ALLOWED.includes(file.type)) throw new Error('Please choose a JPG, PNG or WebP picture')
  const img = await loadImage(file)
  const fitsAlready = img.naturalWidth <= maxWidth && file.size <= TARGET_BYTES
  if (fitsAlready) return file

  let scale = Math.min(1, maxWidth / img.naturalWidth)
  for (let attempt = 0; attempt < 5; attempt++) {
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This browser cannot prepare the picture')

    // WebP keeps transparency and is small. Browsers that cannot make WebP give
    // a PNG back, so then we use JPEG on a white background.
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    let type = 'image/webp'
    let probe = await toBlob(canvas, type, 0.9)
    if (!probe || probe.type !== 'image/webp') {
      type = 'image/jpeg'
      ctx.globalCompositeOperation = 'destination-over'
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, w, h)
    }
    for (let q = 0.9; q >= 0.5; q -= 0.1) {
      const blob = await toBlob(canvas, type, q)
      if (blob && blob.size <= TARGET_BYTES) return blob
      probe = blob
    }
    scale *= 0.8
  }
  throw new Error('This picture is too large even after shrinking. Please use a smaller picture.')
}
