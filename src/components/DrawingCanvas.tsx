import React, { useRef, useEffect, useState } from 'react'
import type { Settings, Point } from '../types'
import { ImageProcessor } from '../utils/imageProcessor'
import { smoothPath, segmentPath } from '../utils/smoothing'
import type { Progress } from '../App'

interface DrawingCanvasProps {
  image: string | null
  settings: Settings
  autoProcess: boolean
  processTrigger: number
  stopTrigger: number
  setIsProcessing: (isProcessing: boolean) => void
  setProgress: (progress: Progress) => void
  onPathGenerated: (path: Point[][]) => void
  onSizeChange: (size: { width: number, height: number }) => void
  zoom: number
  setZoom: (zoom: number) => void
}

const ResetIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
)

const DrawingCanvas: React.FC<DrawingCanvasProps> = ({ 
  image, 
  settings, 
  autoProcess,
  processTrigger,
  stopTrigger,
  setIsProcessing,
  setProgress,
  onPathGenerated,
  onSizeChange,
  zoom,
  setZoom
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const imageProcessorRef = useRef<ImageProcessor>(new ImageProcessor())
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const [rawPath, setRawPath] = useState<Point[] | Point[][]>([])
  const [smoothedPath, setSmoothedPath] = useState<Point[][]>([])
  const [isComparing, setIsComparing] = useState(false)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 })
  const [isStipplePhase, setIsStipplePhase] = useState(false)
  
  const lastTriggerRef = useRef(processTrigger)
  const lastStopTriggerRef = useRef(stopTrigger)

  // Reset path when algorithm changes to avoid type mismatches during transition
  useEffect(() => {
    setRawPath([])
    setSmoothedPath([])
  }, [settings.algorithm])

  // Reset pan when zoom is reset to 1
  useEffect(() => {
    if (zoom <= 1) {
      setPan({ x: 0, y: 0 })
    }
  }, [zoom])

  // Stop algorithm and terminate worker
  useEffect(() => {
    if (stopTrigger > lastStopTriggerRef.current) {
      lastStopTriggerRef.current = stopTrigger
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
  }, [stopTrigger])

  // Memoize SVG path string for performance
  const svgPathData = React.useMemo(() => {
    if (smoothedPath.length === 0) return ''
    
    if (isStipplePhase || settings.algorithm === 'Dot matrix') {
      if (settings.dotStyle === 'circles' && !isStipplePhase) {
        const r = settings.circleDiameter / 2
        return smoothedPath.flat().map(p => `M ${p.x - r} ${p.y} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`).join(' ')
      }
      return smoothedPath.flat().map(p => `M ${p.x} ${p.y} h 0.01`).join(' ')
    }

    return smoothedPath.map(segment => {
      if (segment.length === 0) return ''
      return `M ${segment[0].x} ${segment[0].y} ` + 
             segment.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
    }).join(' ')
  }, [smoothedPath, settings.algorithm, settings.dotStyle, settings.circleDiameter, isStipplePhase])

  // Real-time smoothing and segmentation
  useEffect(() => {
    if (rawPath.length === 0) {
      setSmoothedPath([])
      onPathGenerated([])
      return
    }

    if (isStipplePhase || settings.algorithm === 'Dot matrix') {
      if (Array.isArray(rawPath[0])) return // Safety
      const segments = [rawPath as Point[]]
      onPathGenerated(segments)
      setSmoothedPath(segments)
      return
    }

    if (settings.algorithm === 'Delaunay') {
      if (!Array.isArray(rawPath[0])) return // Safety
      // Delaunay edges are already discrete, but we can smooth them and apply maxLineLength culling
      const segments = (rawPath as Point[][]).flatMap(seg => {
        const smoothed = smoothPath(seg, settings.smoothing)
        return segmentPath(smoothed, settings.maxLineLength)
      })
      onPathGenerated(segments)
      setSmoothedPath(segments)
      return
    }

    // TSP or Oscillations
    if (Array.isArray(rawPath[0])) return // Safety
    const smoothingFactor = settings.smoothing
    const smoothed = smoothPath(rawPath as Point[], smoothingFactor)
    
    const segments = segmentPath(smoothed, settings.maxLineLength)
    
    onPathGenerated(segments)
    setSmoothedPath(segments)
  }, [rawPath, settings.smoothing, settings.maxLineLength, onPathGenerated, settings.algorithm, isStipplePhase])

  // Load Image and Initial Canvas Setup
  useEffect(() => {
    if (!image) return
    
    const updateCanvasSize = () => {
      imageProcessorRef.current.loadImage(image).then(img => {
        setOriginalImage(img)
        // Ensure the container is ready
        setTimeout(() => {
          const container = document.querySelector('.canvas-container')
          const padding = 60
          
          let maxWidth = window.innerWidth * 0.6
          let maxHeight = window.innerHeight * 0.8
          
          if (container) {
            const rect = container.getBoundingClientRect()
            if (rect.width > 0 && rect.height > 0) {
              maxWidth = rect.width - padding
              maxHeight = rect.height - padding
            }
          }
          
          let width = img.width
          let height = img.height
          const scale = Math.min(maxWidth / width, maxHeight / height)
          width *= scale
          height *= scale
          
          setCanvasSize({ width, height })
          onSizeChange({ width, height })
        }, 50)
      })
    }

    updateCanvasSize()
    window.addEventListener('resize', updateCanvasSize)
    return () => window.removeEventListener('resize', updateCanvasSize)
  }, [image, onSizeChange])

  // Redraw preprocessed image on background canvas
  useEffect(() => {
    if (!originalImage || !canvasRef.current || canvasSize.width === 0) return
    
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return

    const processedData = imageProcessorRef.current.processImage(
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

    const tmpCanvas = document.createElement('canvas')
    tmpCanvas.width = originalImage.width
    tmpCanvas.height = originalImage.height
    tmpCanvas.getContext('2d')?.putImageData(processedData, 0, 0)
    
    ctx.drawImage(tmpCanvas, 0, 0, canvasSize.width, canvasSize.height)
  }, [originalImage, settings.blacks, settings.whites, settings.midtones, settings.contrast, settings.invert, settings.vignetteAmount, settings.vignetteMode, settings.vignetteWidth, settings.vignetteBlur, canvasSize])

  // Initialize and run worker with interruption support
  useEffect(() => {
    if (!originalImage || canvasSize.width === 0) return

    const runAlgorithm = () => {
      if (workerRef.current) {
        workerRef.current.terminate()
      }

      workerRef.current = new Worker(new URL('../workers/drawingWorker.ts', import.meta.url), {
        type: 'module'
      })

      workerRef.current.onmessage = (e) => {
        if (e.data.type === 'PROGRESS') {
          setProgress({ message: e.data.message, percent: e.data.percent })
        } else if (e.data.type === 'INTERMEDIATE' || e.data.type === 'RESULT') {
          const resultPath = e.data.path
          const isStipple = !!e.data.isStipple
          setIsStipplePhase(isStipple)
          
          if (originalImage && canvasSize.width > 0) {
            const scale = canvasSize.width / originalImage.width
            let scaledPath;
            if (Array.isArray(resultPath[0])) {
              scaledPath = (resultPath as Point[][]).map(seg => seg.map(p => ({
                x: p.x * scale,
                y: p.y * scale
              })))
            } else {
              scaledPath = (resultPath as Point[]).map(p => ({
                x: p.x * scale,
                y: p.y * scale
              }))
            }
            setRawPath(scaledPath)
          } else {
            setRawPath(resultPath)
          }
          
          if (e.data.type === 'RESULT') {
            setProgress({ message: 'Finalizing...', percent: 100 })
            setTimeout(() => setIsProcessing(false), 500)
          }
        }
      }

      setIsProcessing(true)
      setIsStipplePhase(false)
      setProgress({ message: 'Preparing image...', percent: 0 })
      
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

      workerRef.current?.postMessage({
        type: 'START',
        imageData,
        pointCount: settings.pointCount,
        algorithm: settings.algorithm,
        clipWhite: settings.clipWhite,
        pointsPerLine: settings.pointsPerLine,
        dither: settings.dither,
        oscAmplitude: settings.oscAmplitude,
        oscFrequencyLevels: settings.oscFrequencyLevels,
        oscMaxFrequency: settings.oscMaxFrequency,
        oscScanLines: settings.oscScanLines,
        oscMode: settings.oscMode,
        spacingMin: settings.spacingMin,
        spacingMax: settings.spacingMax
      })
    }

    if (autoProcess) {
      // Only rerun on settings that affect the algorithm output
      const timeoutId = setTimeout(runAlgorithm, 800)
      return () => clearTimeout(timeoutId)
    } else {
      if (processTrigger > lastTriggerRef.current) {
        lastTriggerRef.current = processTrigger
        runAlgorithm()
      }
    }
  }, [
    originalImage, 
    canvasSize, 
    // Only these settings trigger a worker restart
    settings.algorithm,
    settings.pointCount,
    settings.clipWhite,
    settings.pointsPerLine,
    settings.dither,
    settings.oscAmplitude,
    settings.oscFrequencyLevels,
    settings.oscMaxFrequency,
    settings.oscScanLines,
    settings.oscMode,
    settings.blacks,
    settings.whites,
    settings.midtones,
    settings.contrast,
    settings.invert,
    settings.vignetteAmount,
    settings.vignetteMode,
    settings.vignetteWidth,
    settings.vignetteBlur,
    settings.spacingMin,
    settings.spacingMax,
    processTrigger, 
    autoProcess, 
    setProgress, 
    setIsProcessing
  ])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true)
      setLastMousePos({ x: e.clientX, y: e.clientY })
      return
    }
    setIsComparing(true)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - lastMousePos.x
      const dy = e.clientY - lastMousePos.y
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }))
      setLastMousePos({ x: e.clientX, y: e.clientY })
    }
  }

  const handleMouseUp = () => {
    setIsComparing(false)
    setIsPanning(false)
  }

  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? -0.25 : 0.25
    const newZoom = Math.max(0.25, Math.min(5.0, zoom + delta))
    setZoom(newZoom)
  }

  return (
    <div 
      className="canvas-container"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      <div 
        className="canvas-viewport"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          width: canvasSize.width,
          height: canvasSize.height,
          backgroundColor: 'white',
          boxShadow: '0 0 20px rgba(0,0,0,0.3)'
        }}
      >
        <canvas 
          ref={canvasRef} 
          width={canvasSize.width} 
          height={canvasSize.height}
          style={{ 
            opacity: isComparing ? 1 : 0,
            transition: 'opacity 0.2s ease-in-out',
            position: 'absolute',
            top: 0,
            left: 0
          }}
        />
        <svg 
          width={canvasSize.width} 
          height={canvasSize.height}
          style={{ 
            opacity: isComparing ? 0 : 1,
            transition: 'opacity 0.2s ease-in-out',
            position: 'absolute',
            top: 0,
            left: 0,
            pointerEvents: 'none'
          }}
        >
          <path 
            d={svgPathData} 
            fill="none" 
            stroke="black" 
            strokeWidth={settings.lineWidth}
            strokeLinecap="round" 
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="floating-zoom-control">
        <div className="zoom-label-row">
          <span className="zoom-percent">{Math.round(zoom * 100)}%</span>
          <input 
            type="range" 
            min="0.25" 
            max="5.0" 
            step="0.25" 
            value={zoom} 
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="zoom-slider-compact"
          />
        </div>
        <button className="reset-btn" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} title="Reset Zoom">
          <ResetIcon />
        </button>
      </div>
    </div>
  )
}

export default DrawingCanvas
