import { useState, useCallback } from 'react'
import './App.css'
import DrawingCanvas from './components/DrawingCanvas'
import Controls from './components/Controls'
import CropModal from './components/CropModal'
import ImagePreview from './components/ImagePreview'
import { generateSVG } from './utils/smoothing'
import type { Settings, Point } from './types'

export interface Progress {
  message: string
  percent: number
}

function App() {
  const [image, setImage] = useState<string | null>(null)
  const [tempImage, setTempImage] = useState<string | null>(null)
  const [originalFileName, setOriginalFileName] = useState<string>('pathifier')
  const [settings, setSettings] = useState<Settings>({
    blacks: 0.0,
    whites: 1.0,
    midtones: 0.5,
    contrast: 0,
    invert: false,
    vignetteAmount: 1.0,
    vignetteMode: 'none',
    vignetteWidth: 0.5,
    vignetteBlur: 0.5,
    lineWidth: 2.0,
    smoothing: 0,
    maxLineLength: 1000,
    algorithm: 'TSP',
    pointCount: 10000,
    clipWhite: false,
    pointsPerLine: 256,
    dither: 'Atkinson',
    dotStyle: 'dots',
    circleDiameter: 1.0,
    oscAmplitude: 5.0,
    oscFrequencyLevels: 4,
    oscMaxFrequency: 8.0,
    oscScanLines: 100,
    oscMode: 'linear',
    spacingMin: 2,
    spacingMax: 10,
    lkNeighbors: 300,
    tspInit: 'farthestInsertion',
    tsp2Opt: false,
    tsp2OptPasses: 5,
    cullJumps: false,
    cullMaxDistance: 100,
    stippleIterations: 10,
  })
  const [autoProcess, setAutoProcess] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState<Progress>({ message: '', percent: 0 })
  const [currentPath, setCurrentPath] = useState<Point[][]>([])
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const [processTrigger, setProcessTrigger] = useState(0)
  const [stopTrigger, setStopTrigger] = useState(0)
  const [zoom, setZoom] = useState(1)

  const handleImageUpload = (imageUrl: string, fileName: string) => {
    setTempImage(imageUrl)
    // Strip extension from filename
    const baseName = fileName.replace(/\.[^/.]+$/, "")
    setOriginalFileName(baseName)
  }

  const handleCropComplete = (croppedImageUrl: string) => {
    setImage(croppedImageUrl)
    setTempImage(null)
    setCurrentPath([])
    setProgress({ message: '', percent: 0 })
  }

  const handleCropCancel = () => {
    setTempImage(null)
  }

  const handleRunProcessing = () => {
    setProcessTrigger(prev => prev + 1)
  }

  const handleStopProcessing = () => {
    setStopTrigger(prev => prev + 1)
    setIsProcessing(false)
    setProgress({ message: '', percent: 0 })
  }

  const handleExportSVG = useCallback(() => {
    if (currentPath.length === 0) return

    const svgContent = generateSVG(currentPath, canvasSize.width, canvasSize.height, settings.lineWidth)
    const blob = new Blob([svgContent], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = `${originalFileName}_pathified.svg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [currentPath, canvasSize, settings.lineWidth])

  return (
    <div className="app-container">
      <main>
        <aside className="sidebar left">
          <Controls 
            panel="left"
            image={image} 
            settings={settings} 
            setSettings={setSettings}
            autoProcess={autoProcess}
            setAutoProcess={setAutoProcess}
            onRunProcessing={handleRunProcessing}
            onImageUpload={handleImageUpload}
            onExportSVG={handleExportSVG}
            isProcessing={isProcessing}
            hasPath={currentPath.length > 0}
          />
        </aside>

        <div className="canvas-area">
          <div className="canvas-header-overlay">
            <div className="title-group">
              <h1>Pathifier</h1>
              <p className="subtitle">A picture to line-art converter</p>
            </div>
            {image && (
              <div className="canvas-preview-overlay">
                <ImagePreview 
                  image={image} 
                  settings={settings} 
                />
              </div>
            )}
          </div>
          <DrawingCanvas 
            image={image} 
            settings={settings} 
            autoProcess={autoProcess}
            processTrigger={processTrigger}
            stopTrigger={stopTrigger}
            setIsProcessing={setIsProcessing}
            setProgress={setProgress}
            onPathGenerated={setCurrentPath}
            onSizeChange={setCanvasSize}
            zoom={zoom}
            setZoom={setZoom}
          />
          {isProcessing && (
            <div className="loading-overlay">
              <div className="loader">
                <div className="loader-text">{progress.message || 'Processing...'}</div>
                <div className="progress-bar-container">
                  <div className="progress-bar" style={{ width: `${progress.percent}%` }}></div>
                </div>
                <div className="loader-footer">
                  <div className="percent-text">{progress.percent}%</div>
                  <button className="stop-btn" onClick={handleStopProcessing}>Stop</button>
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="sidebar right">
          <Controls 
            panel="right"
            image={image} 
            settings={settings} 
            setSettings={setSettings}
            autoProcess={autoProcess}
            setAutoProcess={setAutoProcess}
            onRunProcessing={handleRunProcessing}
            onImageUpload={handleImageUpload}
            onExportSVG={handleExportSVG}
            isProcessing={isProcessing}
            hasPath={currentPath.length > 0}
            pathCount={currentPath.length}
          />
        </aside>
      </main>

      {tempImage && (
        <CropModal 
          image={tempImage} 
          onCropComplete={handleCropComplete} 
          onCancel={handleCropCancel} 
        />
      )}

      <footer>
        <a href="https://artemonic.github.io/pathifier/">Pathifier</a> © 2026 by <a href="https://github.com/artemonic">artemonic</a> is licensed under <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>
        <img src="https://mirrors.creativecommons.org/presskit/icons/cc.svg" alt="" style={{ maxWidth: '1em', maxHeight: '1em', marginLeft: '.2em' }} />
        <img src="https://mirrors.creativecommons.org/presskit/icons/by.svg" alt="" style={{ maxWidth: '1em', maxHeight: '1em', marginLeft: '.2em' }} />
        <img src="https://mirrors.creativecommons.org/presskit/icons/sa.svg" alt="" style={{ maxWidth: '1em', maxHeight: '1em', marginLeft: '.2em' }} />
      </footer>
    </div>
  )
}

export default App
