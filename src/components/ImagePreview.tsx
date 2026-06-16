import React, { useRef, useEffect, useState } from 'react'
import type { Settings } from '../types'
import { ImageProcessor } from '../utils/imageProcessor'

interface ImagePreviewProps {
  image: string
  settings: Settings
}

const ImagePreview: React.FC<ImagePreviewProps> = ({ 
  image, 
  settings
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageProcessorRef = useRef<ImageProcessor>(new ImageProcessor())
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    imageProcessorRef.current.loadImage(image).then(img => {
      setOriginalImage(img)
    })
  }, [image])

  useEffect(() => {
    if (!originalImage || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Draw preview
    const imageData = imageProcessorRef.current.processImage(
      originalImage, 
      settings.blacks, 
      settings.whites, 
      settings.midtones, 
      settings.contrast,
      settings.invert,
      settings.vignetteAmount,
      settings.vignetteMode,
      settings.vignetteWidth,
      settings.vignetteBlur
    )
    
    // Scale preview to fit
    const scale = Math.min(canvas.width / originalImage.width, canvas.height / originalImage.height)
    const w = originalImage.width * scale
    const h = originalImage.height * scale
    const x = (canvas.width - w) / 2
    const y = (canvas.height - h) / 2

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    // Draw processed image on temporary canvas to scale it
    const tmpCanvas = document.createElement('canvas')
    tmpCanvas.width = originalImage.width
    tmpCanvas.height = originalImage.height
    tmpCanvas.getContext('2d')?.putImageData(imageData, 0, 0)
    
    ctx.drawImage(tmpCanvas, x, y, w, h)
  }, [originalImage, settings])

  return (
    <div className="image-preview-container">
      <canvas 
        ref={canvasRef} 
        width={260} 
        height={180}
        style={{ background: '#000', display: 'block' }}
      />
    </div>
  )
}

export default ImagePreview
