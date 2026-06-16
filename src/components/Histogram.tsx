import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react'

interface HistogramProps {
  data: Uint32Array | null
  blacks: number
  whites: number
  midtones: number
  onLevelsChange: (levels: { blacks?: number, whites?: number, midtones?: number }) => void
}

const Histogram: React.FC<HistogramProps> = React.memo(({ data, blacks, whites, midtones, onLevelsChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeHandle, setActiveHandle] = useState<'blacks' | 'whites' | 'midtones' | null>(null)

  // Memoize max value and bar paths to avoid recalculating on every handle move
  const barMetrics = useMemo(() => {
    if (!data) return null
    let max = 0
    for (let i = 0; i < 256; i++) if (data[i] > max) max = data[i]
    return { max }
  }, [data])

  useEffect(() => {
    if (!data || !canvasRef.current || !barMetrics) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    
    // Draw background
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, width, height)

    // Draw Histogram bars
    ctx.fillStyle = '#444'
    const barWidth = width / 256
    for (let i = 0; i < 256; i++) {
      const h = (data[i] / barMetrics.max) * (height - 15)
      ctx.fillRect(i * barWidth, (height - 15) - h, barWidth, h)
    }

    const drawHandle = (x: number, color: string, isActive: boolean) => {
      ctx.fillStyle = color
      if (isActive) {
        ctx.shadowBlur = 10
        ctx.shadowColor = color
      }
      ctx.beginPath()
      ctx.moveTo(x, height - 15)
      ctx.lineTo(x - 6, height)
      ctx.lineTo(x + 6, height)
      ctx.fill()
      ctx.shadowBlur = 0
      
      // Vertical line
      ctx.strokeStyle = color
      ctx.setLineDash(color === '#888' ? [2, 2] : [])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height - 15)
      ctx.stroke()
      ctx.setLineDash([])
    }

    const bx = blacks * width
    const wx = whites * width
    const mx = midtones * width

    drawHandle(bx, '#ff8c00', activeHandle === 'blacks')
    drawHandle(wx, '#fff', activeHandle === 'whites')
    drawHandle(mx, '#888', activeHandle === 'midtones')

  }, [data, blacks, whites, midtones, activeHandle, barMetrics])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 256
    
    const bx = blacks * 256
    const wx = whites * 256
    const mx = midtones * 256

    const distB = Math.abs(x - bx)
    const distW = Math.abs(x - wx)
    const distM = Math.abs(x - mx)

    const minDist = Math.min(distB, distW, distM)
    if (minDist < 15) {
      if (minDist === distB) setActiveHandle('blacks')
      else if (minDist === distW) setActiveHandle('whites')
      else setActiveHandle('midtones')
    }
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!activeHandle || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const val = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))

    if (activeHandle === 'blacks') {
      onLevelsChange({ blacks: Math.min(val, whites - 0.02) })
    } else if (activeHandle === 'whites') {
      onLevelsChange({ whites: Math.max(val, blacks + 0.02) })
    } else if (activeHandle === 'midtones') {
      onLevelsChange({ midtones: Math.max(blacks + 0.01, Math.min(whites - 0.01, val)) })
    }
  }, [activeHandle, blacks, whites, midtones, onLevelsChange])

  const handleMouseUp = useCallback(() => setActiveHandle(null), [])

  useEffect(() => {
    if (activeHandle) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [activeHandle, handleMouseMove, handleMouseUp])

  return (
    <div className="histogram-container" ref={containerRef} onMouseDown={handleMouseDown}>
      <canvas 
        ref={canvasRef} 
        width={256} 
        height={75} 
        style={{ width: '100%', height: '75px', background: '#111', cursor: 'pointer', display: 'block' }}
      />
    </div>
  )
})

export default Histogram
