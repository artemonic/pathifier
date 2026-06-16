export class ImageProcessor {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D

  constructor() {
    this.canvas = document.createElement('canvas')
    const context = this.canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Could not get canvas context')
    this.ctx = context
  }

  loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = url
    })
  }

  /**
   * Calculates the intensity histogram of the image.
   * Returns an array of 256 integers representing the count of each luminosity level.
   */
  getHistogram(img: HTMLImageElement): Uint32Array {
    this.canvas.width = img.width
    this.canvas.height = img.height
    this.ctx.drawImage(img, 0, 0)
    const { data } = this.ctx.getImageData(0, 0, img.width, img.height)
    
    const histogram = new Uint32Array(256).fill(0)
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i+1], b = data[i+2]
      // Standard luminosity conversion
      const luminosity = Math.round(r * 0.299 + g * 0.587 + b * 0.114)
      histogram[luminosity]++
    }
    return histogram
  }

  processImage(img: HTMLImageElement, blacks: number, whites: number, midtones: number, contrast: number, invert: boolean, vignetteAmount: number, vignetteMode: 'none' | 'black' | 'white', vignetteWidth: number, vignetteBlur: number): ImageData {
    this.canvas.width = img.width
    this.canvas.height = img.height
    this.ctx.drawImage(img, 0, 0)

    const imageData = this.ctx.getImageData(0, 0, img.width, img.height)
    const data = imageData.data

    // Levels Math:
    // blacks: Input level that becomes 0
    // whites: Input level that becomes 1
    // midtones: Input level that becomes 0.5
    const range = whites - blacks
    const midRelative = (midtones - blacks) / (range || 0.0001)
    // Calculate gamma such that (midRelative)^gamma = 0.5
    // gamma = log(0.5) / log(midRelative)
    const gamma = Math.log(0.5) / Math.log(Math.max(0.01, Math.min(0.99, midRelative)))
    
    const cFactor = (contrast + 100) / 100
    const centerX = img.width / 2
    const centerY = img.height / 2

    for (let i = 0; i < data.length; i += 4) {
      const x = (i / 4) % img.width
      const y = Math.floor((i / 4) / img.width)
      
      const r = data[i], g = data[i + 1], b = data[i + 2]
      let gray = (0.299 * r + 0.587 * g + 0.114 * b) / 255

      if (invert) gray = 1 - gray

      // 1. Levels Adjustment (Input Range Mapping)
      let l = (gray - blacks) / (range || 0.0001)
      l = Math.max(0, Math.min(1, l))
      
      // 2. Apply Gamma (Midtone)
      gray = Math.pow(l, gamma)

      // 3. Apply Contrast (centered at 0.5)
      gray = (gray - 0.5) * cFactor + 0.5
      
      // Apply Vignette
      if (vignetteMode !== 'none' && vignetteAmount !== 0) {
        // Normalize distance based on aspect ratio (normalized coordinates -1 to 1)
        const nx = (x - centerX) / centerX
        const ny = (y - centerY) / centerY
        
        // Euclidean distance in normalized space
        // Corner is Math.sqrt(1^2 + 1^2) = Math.sqrt(2)
        const dist = Math.sqrt(nx * nx + ny * ny) / Math.sqrt(2)
        
        // Normalize dist based on width and blur
        // width 0-1 (inner radius)
        // blur 0-1 (outer transition)
        const inner = vignetteWidth * 0.8
        const outer = inner + (vignetteBlur * 0.8) + 0.01
        
        const v = Math.max(0, Math.min(1, (dist - inner) / (outer - inner)))
        const vignetteEffect = v * (vignetteAmount / 100)
        
        if (vignetteMode === 'black') {
          // Black vignette (multiply)
          gray *= (1 - vignetteEffect)
        } else {
          // White vignette (screen-ish / add)
          gray = gray + (1 - gray) * vignetteEffect
        }
      }
      
      // Clamp and convert back to 0-255
      gray = Math.max(0, Math.min(1, gray)) * 255

      data[i] = data[i + 1] = data[i + 2] = gray
      data[i + 3] = 255
    }

    return imageData
  }


  // Get cropped image data directly from the original image
  getCroppedImageData(img: HTMLImageElement, x: number, y: number, w: number, h: number): ImageData {
    this.canvas.width = w
    this.canvas.height = h
    this.ctx.drawImage(img, x, y, w, h, 0, 0, w, h)
    return this.ctx.getImageData(0, 0, w, h)
  }
}

export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number }
): Promise<string> {
  const image = new Image()
  image.src = imageSrc
  await new Promise((resolve) => {
    image.onload = resolve
  })

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (!ctx) return ''

  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  )

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) return
      resolve(URL.createObjectURL(blob))
    }, 'image/jpeg')
  })
}
