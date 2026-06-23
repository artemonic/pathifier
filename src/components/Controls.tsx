import React, { useState, useEffect, useRef } from 'react'
import type { Settings, Algorithm, DitherType } from '../types'
import Histogram from './Histogram'
import { ImageProcessor } from '../utils/imageProcessor'

interface ControlsProps {
  panel: 'left' | 'right'
  image: string | null
  settings: Settings
  setSettings: React.Dispatch<React.SetStateAction<Settings>>
  autoProcess: boolean
  setAutoProcess: (auto: boolean) => void
  onRunProcessing: () => void
  onImageUpload: (imageUrl: string, fileName: string) => void
  onExportSVG: () => void
  isProcessing: boolean
  hasPath: boolean
  pathCount?: number
}

const DEFAULTS: Partial<Settings> = {
  blacks: 0.0,
  whites: 1.0,
  midtones: 0.5,
  contrast: 0,
  invert: false,
  vignetteAmount: 100,
  vignetteMode: 'none',
  vignetteWidth: 0.5,
  vignetteBlur: 0.5,
  lineWidth: 2.0,
  pointCount: 10000,
  smoothing: 0,
  maxLineLength: 1000,
  pointsPerLine: 256,
  dither: 'Atkinson',
  dotStyle: 'dots',
  circleDiameter: 1.0,
  oscAmplitude: 5.0,
  oscFrequencyLevels: 4,
  oscMaxFrequency: 8.0,
  oscScanLines: 100,
  oscMode: 'linear',
  spacingMin: 2.0,
  spacingMax: 64.0,
  lkNeighbors: 300,
  tspInit: 'farthestInsertion',
  tsp2Opt: false,
  tsp2OptPasses: 5,
  cullJumps: false,
  cullMaxDistance: 100,
  stippleIterations: 10,
}

const getContextDefault = (key: keyof Settings, algorithm: string, dotStyle: string, _pointCount: number): any => {
  if (key === 'lineWidth') {
    if (algorithm === 'Dot matrix' && dotStyle === 'dots') {
      return 3.0
    } else if (algorithm === 'Delaunay') {
      return 1.0
    } else {
      return 2.0
    }
  }
  if (key === 'stippleIterations') {
    return 10
  }
  return DEFAULTS[key as keyof typeof DEFAULTS]
}

const applySettingChange = (prev: Settings, key: keyof Settings, value: any, isDirectInput: boolean): Settings => {
  let finalValue = value
  const defaultValue = getContextDefault(key, prev.algorithm, prev.dotStyle, prev.pointCount)
  
  if (!isDirectInput && typeof value === 'number' && typeof defaultValue === 'number') {
    const isSmallRange = ['smoothing', 'blacks', 'whites', 'midtones', 'lineWidth', 'vignetteWidth', 'vignetteBlur', 'oscAmplitude', 'spacingMin'].includes(key)
    const threshold = 
      key === 'pointCount' ? 2000 : 
      key === 'contrast' ? 5 : 
      key === 'vignetteAmount' ? 5 :
      key === 'maxLineLength' ? 50 : 
      key === 'pointsPerLine' ? 5 : 
      key === 'oscFrequencyLevels' ? 0 :
      key === 'oscMaxFrequency' ? 0 :
      key === 'oscScanLines' ? 5 :
      key === 'spacingMin' ? 0.1 :
      key === 'lkNeighbors' ? 0 :
      key === 'tsp2OptPasses' ? 0 :
      key === 'cullMaxDistance' ? 10 :
      key === 'stippleIterations' ? 5 :
      (isSmallRange ? 0.05 : 5)
    
    if (Math.abs(value - defaultValue) < threshold) {
      finalValue = defaultValue
    }
  }

  const next = { ...prev, [key]: finalValue }
  
  if (key === 'pointCount') {
    next.stippleIterations = 10
  }
  
  // Proportional midtone adjustment
  if (key === 'blacks' || key === 'whites') {
    const oldRange = prev.whites - prev.blacks
    const relativeMid = oldRange > 1e-6 ? (prev.midtones - prev.blacks) / oldRange : 0.5
    
    if (key === 'blacks') {
      const newBlacks = finalValue as number
      const newRange = prev.whites - newBlacks
      next.midtones = parseFloat((newBlacks + relativeMid * newRange).toFixed(2))
    } else {
      const newWhites = finalValue as number
      const newRange = newWhites - prev.blacks
      next.midtones = parseFloat((prev.blacks + relativeMid * newRange).toFixed(2))
    }
  }
  
  return next
}

const RotateCcw = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
)

const ChevronLeft = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6"/>
  </svg>
)

const ChevronRight = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6"/>
  </svg>
)

interface SliderWithArrowsProps {
  min: number
  max: number
  step: number
  value: number
  onChange: (val: number, isDirect: boolean) => void
}

const SliderWithArrows: React.FC<SliderWithArrowsProps> = ({ min, max, step, value, onChange }) => {
  const handleDecrement = () => {
    const newValue = Math.max(min, parseFloat((value - step).toFixed(3)))
    onChange(newValue, true)
  }

  const handleIncrement = () => {
    const newValue = Math.min(max, parseFloat((value + step).toFixed(3)))
    onChange(newValue, true)
  }

  return (
    <div className="range-with-arrows">
      <button className="step-btn" onClick={handleDecrement} title="Decrease">
        <ChevronLeft />
      </button>
      <input 
        type="range" 
        min={min} 
        max={max} 
        step={step} 
        value={value} 
        onChange={(e) => onChange(parseFloat(e.target.value), false)} 
      />
      <button className="step-btn" onClick={handleIncrement} title="Increase">
        <ChevronRight />
      </button>
    </div>
  )
}

const Controls: React.FC<ControlsProps> = React.memo(({ 
  panel,
  image,
  settings, 
  setSettings, 
  autoProcess,
  setAutoProcess,
  onRunProcessing,
  onImageUpload, 
  onExportSVG,
  isProcessing,
  hasPath,
  pathCount
}) => {
  const [histogramData, setHistogramData] = useState<Uint32Array | null>(null)
  const imageProcessorRef = useRef<ImageProcessor>(new ImageProcessor())

  useEffect(() => {
    let isMounted = true
    if (!image) {
      setHistogramData(null)
      return
    }
    imageProcessorRef.current.loadImage(image).then(img => {
      if (!isMounted) return
      const hist = imageProcessorRef.current.getHistogram(img)
      setHistogramData(hist)
    })
    return () => { isMounted = false }
  }, [image])

  const autoLevels = React.useCallback(() => {
    if (!histogramData) return
    let total = 0
    for (let i = 0; i < 256; i++) total += histogramData[i]
    const threshold = total * 0.005
    let black = 0, sum = 0
    for (let i = 0; i < 256; i++) {
      sum += histogramData[i]
      if (sum >= threshold) { black = i; break }
    }
    let white = 255
    sum = 0
    for (let i = 255; i >= 0; i--) {
      sum += histogramData[i]
      if (sum >= threshold) { white = i; break }
    }
    setSettings(prev => ({
      ...prev,
      blacks: parseFloat((black / 255).toFixed(2)),
      whites: parseFloat((white / 255).toFixed(2)),
      midtones: parseFloat(((black + (white - black) / 2) / 255).toFixed(2))
    }))
  }, [histogramData, setSettings])

  const resetAlgorithmSettings = React.useCallback(() => {
    setSettings(prev => {
      if (prev.algorithm === 'TSP' || prev.algorithm === 'Delaunay') {
        const pc = DEFAULTS.pointCount || 10000
        const isDelaunay = prev.algorithm === 'Delaunay'
        const iterations = isDelaunay 
          ? (pc > 50000 ? 5 : 10) 
          : (pc > 50000 ? 10 : (pc > 10000 ? 15 : 20))
        return {
          ...prev, 
          pointCount: pc,
          smoothing: DEFAULTS.smoothing!,
          maxLineLength: DEFAULTS.maxLineLength!,
          lkNeighbors: DEFAULTS.lkNeighbors!,
          tspInit: DEFAULTS.tspInit as any,
          tsp2Opt: DEFAULTS.tsp2Opt!,
          tsp2OptPasses: DEFAULTS.tsp2OptPasses!,
          cullJumps: DEFAULTS.cullJumps!,
          cullMaxDistance: DEFAULTS.cullMaxDistance!,
          stippleIterations: iterations
        }
      } else if (prev.algorithm === 'Dot matrix') {
        return { 
          ...prev, 
          pointsPerLine: DEFAULTS.pointsPerLine!,
          dither: DEFAULTS.dither!,
          dotStyle: DEFAULTS.dotStyle!,
          circleDiameter: DEFAULTS.circleDiameter!,
          lineWidth: prev.dotStyle === 'dots' ? 3.0 : 2.0
        }
      } else if (prev.algorithm === 'Oscillations') {
        return { 
          ...prev, 
          oscScanLines: DEFAULTS.oscScanLines!,
          oscAmplitude: DEFAULTS.oscAmplitude!,
          oscMaxFrequency: DEFAULTS.oscMaxFrequency!,
          oscFrequencyLevels: DEFAULTS.oscFrequencyLevels!,
          oscMode: DEFAULTS.oscMode!,
          smoothing: DEFAULTS.smoothing!,
          lineWidth: 2.0
        }
      }
      return prev
    })
  }, [setSettings])

  const handleFileChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      onImageUpload(url, file.name)
    }
  }, [onImageUpload])

  const updateSetting = React.useCallback(<K extends keyof Settings>(key: K, value: Settings[K], isDirectInput = false) => {
    setSettings(prev => applySettingChange(prev, key, value, isDirectInput))
  }, [setSettings])

  const resetSetting = React.useCallback((key: keyof Settings) => {
    setSettings(prev => {
      const defaultValue = getContextDefault(key, prev.algorithm, prev.dotStyle, prev.pointCount)
      if (defaultValue !== undefined) {
        return applySettingChange(prev, key, defaultValue, true)
      }
      return prev
    })
  }, [setSettings])

  const resetColorGrading = React.useCallback(() => {
    setSettings(prev => ({
      ...prev,
      blacks: DEFAULTS.blacks!,
      whites: DEFAULTS.whites!,
      midtones: DEFAULTS.midtones!,
      contrast: DEFAULTS.contrast!,
      invert: DEFAULTS.invert!,
    }))
  }, [setSettings])

  const resetVignette = React.useCallback(() => {
    setSettings(prev => ({
      ...prev,
      vignetteAmount: DEFAULTS.vignetteAmount!,
      vignetteMode: DEFAULTS.vignetteMode!,
      vignetteWidth: DEFAULTS.vignetteWidth!,
      vignetteBlur: DEFAULTS.vignetteBlur!,
    }))
  }, [setSettings])

  const handleLevelsChange = React.useCallback((levels: { blacks?: number, whites?: number, midtones?: number }) => {
    if (levels.blacks !== undefined) updateSetting('blacks', levels.blacks, true)
    if (levels.whites !== undefined) updateSetting('whites', levels.whites, true)
    if (levels.midtones !== undefined) updateSetting('midtones', levels.midtones, true)
  }, [updateSetting])

  const handleAlgorithmChange = React.useCallback((newAlgorithm: Algorithm) => {
    setSettings(prev => {
      // First update the algorithm
      const updated = { ...prev, algorithm: newAlgorithm }
      
      // Determine context-aware defaults for the new algorithm
      let newLineWidth = 2.0
      if (newAlgorithm === 'Dot matrix' && updated.dotStyle === 'dots') {
        newLineWidth = 3.0
      } else if (newAlgorithm === 'Delaunay') {
        newLineWidth = 1.0
      }

      // Return settings with reset post-processing values
      const pc = updated.pointCount
      const newStippleIterations = newAlgorithm === 'Delaunay'
        ? (pc > 50000 ? 5 : 10)
        : (pc > 50000 ? 10 : (pc > 10000 ? 15 : 20))

      return {
        ...updated,
        lineWidth: newLineWidth,
        smoothing: DEFAULTS.smoothing!,
        maxLineLength: DEFAULTS.maxLineLength!,
        circleDiameter: DEFAULTS.circleDiameter!,
        stippleIterations: newStippleIterations
      }
    })
  }, [setSettings])

  return (
    <div className="controls">
      {panel === 'left' ? (
        <>
          <div className="controls-group">
            <label htmlFor="image-upload">Upload Image</label>
            <input 
              id="image-upload" 
              type="file" 
              accept="image/*" 
              onChange={handleFileChange} 
              disabled={isProcessing}
            />
          </div>

          <div className="controls-section">
            <div className="section-header">
              <h4 className="section-title">Color Grading</h4>
              <button className="reset-btn" onClick={resetColorGrading} title="Reset All Color Grading">
                <RotateCcw />
              </button>
            </div>
            
            <div className="controls-group">
              <div className="checkbox-row">
                <input 
                  id="invert-colors"
                  type="checkbox" 
                  checked={settings.invert} 
                  onChange={(e) => updateSetting('invert', e.target.checked)} 
                />
                <label htmlFor="invert-colors">Invert Colors</label>
              </div>
            </div>

            <div className="controls-group">
              <div className="section-header">
                <label>Levels & Histogram</label>
                <button className="reset-all-link" onClick={autoLevels}>Auto-Levels</button>
              </div>
              <Histogram 
                data={histogramData} 
                blacks={settings.blacks} 
                whites={settings.whites} 
                midtones={settings.midtones} 
                onLevelsChange={handleLevelsChange}
              />
            </div>

            <div className="controls-group">
              <div className="label-row">
                <div className="label-with-reset">
                  <label>Black Point</label>
                  <button className="reset-btn" onClick={() => resetSetting('blacks')} title="Reset">
                    <RotateCcw />
                  </button>
                </div>
                <input 
                  type="number" 
                  step="0.01"
                  value={settings.blacks} 
                  onChange={(e) => updateSetting('blacks', parseFloat(e.target.value) || 0, true)}
                  className="number-input"
                />
              </div>
              <SliderWithArrows 
                min={0.0} 
                max={Math.min(0.98, settings.whites - 0.02)} 
                step={0.01}
                value={settings.blacks} 
                onChange={(val, isDirect) => updateSetting('blacks', val, isDirect)}
              />
            </div>

            <div className="controls-group">
              <div className="label-row">
                <div className="label-with-reset">
                  <label>Mid Point (50%)</label>
                  <button className="reset-btn" onClick={() => resetSetting('midtones')} title="Reset">
                    <RotateCcw />
                  </button>
                </div>
                <input 
                  type="number" 
                  step="0.01"
                  value={settings.midtones} 
                  onChange={(e) => updateSetting('midtones', parseFloat(e.target.value) || 0.5, true)}
                  className="number-input"
                />
              </div>
              <SliderWithArrows 
                min={Math.max(0.01, settings.blacks + 0.01)} 
                max={Math.min(0.99, settings.whites - 0.01)} 
                step={0.01}
                value={settings.midtones} 
                onChange={(val, isDirect) => updateSetting('midtones', val, isDirect)}
              />
            </div>

            <div className="controls-group">
              <div className="label-row">
                <div className="label-with-reset">
                  <label>White Point</label>
                  <button className="reset-btn" onClick={() => resetSetting('whites')} title="Reset">
                    <RotateCcw />
                  </button>
                </div>
                <input 
                  type="number" 
                  step="0.01"
                  value={settings.whites} 
                  onChange={(e) => updateSetting('whites', parseFloat(e.target.value) || 0, true)}
                  className="number-input"
                />
              </div>
              <SliderWithArrows 
                min={Math.max(0.02, settings.blacks + 0.02)} 
                max={1.0} 
                step={0.01}
                value={settings.whites} 
                onChange={(val, isDirect) => updateSetting('whites', val, isDirect)}
              />
            </div>

            <div className="controls-group">
              <div className="label-row">
                <div className="label-with-reset">
                  <label>Contrast</label>
                  <button className="reset-btn" onClick={() => resetSetting('contrast')} title="Reset">
                    <RotateCcw />
                  </button>
                </div>
                <input 
                  type="number" 
                  value={settings.contrast} 
                  onChange={(e) => updateSetting('contrast', parseInt(e.target.value) || 0, true)}
                  className="number-input"
                />
              </div>
              <SliderWithArrows 
                min={-100} 
                max={100} 
                step={1}
                value={settings.contrast} 
                onChange={(val, isDirect) => updateSetting('contrast', val, isDirect)}
              />
            </div>
          </div>

          <div className="controls-section">
            <div className="section-header">
              <h4 className="section-title">Vignette</h4>
              <button className="reset-btn" onClick={resetVignette} title="Reset All Vignette Settings">
                <RotateCcw />
              </button>
            </div>
            <div className="controls-group">
              <label>Vignette Color</label>
              <div className="segmented-toggle">
                <button 
                  className={`segmented-btn ${settings.vignetteMode === 'black' ? 'active' : ''}`}
                  onClick={() => updateSetting('vignetteMode', 'black')}
                >
                  Black
                </button>
                <button 
                  className={`segmented-btn ${settings.vignetteMode === 'none' ? 'active' : ''}`}
                  onClick={() => updateSetting('vignetteMode', 'none')}
                >
                  None
                </button>
                <button 
                  className={`segmented-btn ${settings.vignetteMode === 'white' ? 'active' : ''}`}
                  onClick={() => updateSetting('vignetteMode', 'white')}
                >
                  White
                </button>
              </div>
            </div>

            <div className="controls-group">
              <div className="label-row">
                <div className="label-with-reset">
                  <label>Width</label>
                  <button className="reset-btn" onClick={() => resetSetting('vignetteWidth')} title="Reset">
                    <RotateCcw />
                  </button>
                </div>
                <input 
                  type="number" 
                  step="0.01"
                  value={settings.vignetteWidth} 
                  onChange={(e) => updateSetting('vignetteWidth', parseFloat(e.target.value) || 0, true)}
                  className="number-input"
                />
              </div>
              <SliderWithArrows 
                min={0.0} 
                max={1.0} 
                step={0.01}
                value={settings.vignetteWidth} 
                onChange={(val, isDirect) => updateSetting('vignetteWidth', val, isDirect)}
              />
            </div>

            <div className="controls-group">
              <div className="label-row">
                <div className="label-with-reset">
                  <label>Blur</label>
                  <button className="reset-btn" onClick={() => resetSetting('vignetteBlur')} title="Reset">
                    <RotateCcw />
                  </button>
                </div>
                <input 
                  type="number" 
                  step="0.01"
                  value={settings.vignetteBlur} 
                  onChange={(e) => updateSetting('vignetteBlur', parseFloat(e.target.value) || 0, true)}
                  className="number-input"
                />
              </div>
              <SliderWithArrows 
                min={0.0} 
                max={1.0} 
                step={0.01}
                value={settings.vignetteBlur} 
                onChange={(val, isDirect) => updateSetting('vignetteBlur', val, isDirect)}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="controls-section">
            <h4 className="section-title">Algorithm Selection</h4>
            <div className="controls-group">
              <label>Algorithm</label>
              <select 
                value={settings.algorithm} 
                onChange={(e) => handleAlgorithmChange(e.target.value as Algorithm)}
              >
                <option value="TSP">Traveling Salesman (TSP)</option>
                <option value="Delaunay">Delaunay Triangulation</option>
                <option value="Dot matrix">Dot matrix</option>
                <option value="Oscillations">Oscillations</option>
              </select>
            </div>
          </div>

          <div className="controls-section">
            <div className="section-header">
              <h4 className="section-title">Algorithm Settings</h4>
              <button className="reset-btn" onClick={resetAlgorithmSettings} title="Reset Algorithm Settings">
                <RotateCcw />
              </button>
            </div>
            
            {(settings.algorithm === 'TSP' || settings.algorithm === 'Delaunay') && (
              <>
                <div className="controls-group">
                  <div className="label-row">
                    <div className="label-with-reset">
                      <label>Point Count</label>
                      <button className="reset-btn" onClick={() => resetSetting('pointCount')} title="Reset">
                        <RotateCcw />
                      </button>
                    </div>
                    <input 
                      type="number" 
                      value={settings.pointCount} 
                      onChange={(e) => updateSetting('pointCount', parseInt(e.target.value) || 0, true)}
                      className="number-input wide"
                      step="1000"
                    />
                  </div>
                  <SliderWithArrows 
                    min={1000} 
                    max={150000} 
                    step={1000}
                    value={settings.pointCount} 
                    onChange={(val, isDirect) => updateSetting('pointCount', val, isDirect)}
                  />
                </div>

                <div className="controls-group">
                  <div className="checkbox-row">
                    <input 
                      id="clip-white"
                      type="checkbox" 
                      checked={settings.clipWhite} 
                      onChange={(e) => updateSetting('clipWhite', e.target.checked)} 
                    />
                    <label htmlFor="clip-white">Clip White Areas</label>
                  </div>
                </div>



                {settings.algorithm === 'Delaunay' && (
                  <>
                    <div className="controls-group">
                      <div className="label-row">
                        <div className="label-with-reset">
                          <label>Min Spacing (Blacks)</label>
                          <button className="reset-btn" onClick={() => resetSetting('spacingMin')} title="Reset">
                            <RotateCcw />
                          </button>
                        </div>
                        <input 
                          type="number" 
                          step="0.1"
                          value={settings.spacingMin} 
                          onChange={(e) => updateSetting('spacingMin', parseFloat(e.target.value) || 1.0, true)}
                          className="number-input"
                        />
                      </div>
                      <SliderWithArrows 
                        min={1.0} 
                        max={16.0} 
                        step={0.1}
                        value={settings.spacingMin} 
                        onChange={(val, isDirect) => updateSetting('spacingMin', val, isDirect)}
                      />
                    </div>

                    <div className="controls-group">
                      <div className="label-row">
                        <div className="label-with-reset">
                          <label>Max Spacing (Whites)</label>
                          <button className="reset-btn" onClick={() => resetSetting('spacingMax')} title="Reset">
                            <RotateCcw />
                          </button>
                        </div>
                        <input 
                          type="number" 
                          step="1"
                          value={settings.spacingMax} 
                          onChange={(e) => updateSetting('spacingMax', parseFloat(e.target.value) || 32, true)}
                          className="number-input"
                        />
                      </div>
                      <SliderWithArrows 
                        min={32} 
                        max={512} 
                        step={1}
                        value={settings.spacingMax} 
                        onChange={(val, isDirect) => updateSetting('spacingMax', val, isDirect)}
                      />
                    </div>
                  </>
                )}

                {settings.algorithm === 'TSP' && (
                  <>
                    <div className="controls-group">
                      <div className="label-row">
                        <div className="label-with-reset">
                          <label>Path Initialization</label>
                          <button className="reset-btn" onClick={() => resetSetting('tspInit')} title="Reset">
                            <RotateCcw />
                          </button>
                        </div>
                      </div>
                      <select 
                        value={settings.tspInit} 
                        onChange={(e) => updateSetting('tspInit', e.target.value as any)}
                      >
                        <option value="farthestInsertion">Farthest Insertion (Organic, Low Crossing)</option>
                        <option value="hilbert">Hilbert Curve (Instant, Grid-like)</option>
                      </select>
                    </div>

                    <div className="controls-group">
                      <div className="checkbox-row">
                        <input 
                          id="tsp-2opt"
                          type="checkbox" 
                          checked={settings.tsp2Opt} 
                          onChange={(e) => updateSetting('tsp2Opt', e.target.checked)} 
                        />
                        <label htmlFor="tsp-2opt">2-Opt Local Optimization</label>
                      </div>
                    </div>

                    {settings.tsp2Opt && (
                      <>
                        <div className="controls-group">
                          <div className="label-row">
                            <div className="label-with-reset">
                              <label>2-Opt Max Passes</label>
                              <button className="reset-btn" onClick={() => resetSetting('tsp2OptPasses')} title="Reset">
                                <RotateCcw />
                              </button>
                            </div>
                            <input 
                              type="number" 
                              value={settings.tsp2OptPasses} 
                              onChange={(e) => updateSetting('tsp2OptPasses', parseInt(e.target.value) || 1, true)}
                              className="number-input"
                            />
                          </div>
                          <SliderWithArrows 
                            min={1} 
                            max={20} 
                            step={1}
                            value={settings.tsp2OptPasses} 
                            onChange={(val, isDirect) => updateSetting('tsp2OptPasses', val, isDirect)}
                          />
                        </div>

                        <div className="controls-group">
                          <div className="label-row">
                            <div className="label-with-reset">
                              <label>Candidate Neighbors</label>
                              <button className="reset-btn" onClick={() => resetSetting('lkNeighbors')} title="Reset">
                                <RotateCcw />
                              </button>
                            </div>
                            <input 
                              type="number" 
                              value={settings.lkNeighbors} 
                              onChange={(e) => updateSetting('lkNeighbors', parseInt(e.target.value) || 2, true)}
                              className="number-input"
                            />
                          </div>
                          <SliderWithArrows 
                            min={2} 
                            max={800} 
                            step={1}
                            value={settings.lkNeighbors} 
                            onChange={(val, isDirect) => updateSetting('lkNeighbors', val, isDirect)}
                          />
                        </div>
                      </>
                    )}

                    <div className="controls-group">
                      <div className="checkbox-row">
                        <input 
                          id="cull-jumps"
                          type="checkbox" 
                          checked={settings.cullJumps} 
                          onChange={(e) => updateSetting('cullJumps', e.target.checked)} 
                        />
                        <label htmlFor="cull-jumps">Cull Long Jumps</label>
                      </div>
                    </div>

                    {settings.cullJumps && (
                      <div className="controls-group">
                        <div className="label-row">
                          <div className="label-with-reset">
                            <label>Max Jump Distance</label>
                            <button className="reset-btn" onClick={() => resetSetting('cullMaxDistance')} title="Reset">
                              <RotateCcw />
                            </button>
                          </div>
                          <input 
                            type="number" 
                            value={settings.cullMaxDistance} 
                            onChange={(e) => updateSetting('cullMaxDistance', parseInt(e.target.value) || 10, true)}
                            className="number-input"
                          />
                        </div>
                        <SliderWithArrows 
                          min={10} 
                          max={500} 
                          step={5}
                          value={settings.cullMaxDistance} 
                          onChange={(val, isDirect) => updateSetting('cullMaxDistance', val, isDirect)}
                        />
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {settings.algorithm === 'Dot matrix' && (
              <>
                <div className="controls-group">
                  <div className="label-row">
                    <div className="label-with-reset">
                      <label>Dots per line</label>
                      <button className="reset-btn" onClick={() => resetSetting('pointsPerLine')} title="Reset">
                        <RotateCcw />
                      </button>
                    </div>
                    <input 
                      type="number" 
                      value={settings.pointsPerLine} 
                      onChange={(e) => updateSetting('pointsPerLine', parseInt(e.target.value) || 0, true)}
                      className="number-input wide"
                    />
                  </div>
                  <SliderWithArrows 
                    min={10} 
                    max={1024} 
                    step={1}
                    value={settings.pointsPerLine} 
                    onChange={(val, isDirect) => updateSetting('pointsPerLine', val, isDirect)}
                  />
                </div>

                <div className="controls-group">
                  <label>Dithering</label>
                  <select 
                    value={settings.dither} 
                    onChange={(e) => updateSetting('dither', e.target.value as DitherType)}
                  >
                    <option value="Atkinson">Atkinson</option>
                    <option value="Bayer">Bayer (Ordered)</option>
                    <option value="Floyd-Steinberg">Floyd-Steinberg</option>
                    <option value="None">None (Threshold)</option>
                    <option value="Stucki">Stucki</option>
                  </select>
                </div>

                <div className="controls-group">
                  <label>Dot Style</label>
                  <div className="segmented-toggle">
                    <button 
                      className={`segmented-btn ${settings.dotStyle === 'dots' ? 'active' : ''}`}
                      onClick={() => updateSetting('dotStyle', 'dots')}
                    >
                      Dots
                    </button>
                    <button 
                      className={`segmented-btn ${settings.dotStyle === 'circles' ? 'active' : ''}`}
                      onClick={() => updateSetting('dotStyle', 'circles')}
                    >
                      Circles
                    </button>
                  </div>
                </div>
              </>
            )}

            {settings.algorithm === 'Oscillations' && (
              <>
                <div className="controls-group">
                  <label>Scan Mode</label>
                  <div className="segmented-toggle">
                    <button 
                      className={`segmented-btn ${settings.oscMode === 'linear' ? 'active' : ''}`}
                      onClick={() => updateSetting('oscMode', 'linear')}
                    >
                      Linear
                    </button>
                    <button 
                      className={`segmented-btn ${settings.oscMode === 'spiral' ? 'active' : ''}`}
                      onClick={() => updateSetting('oscMode', 'spiral')}
                    >
                      Spiral
                    </button>
                  </div>
                </div>

                <div className="controls-group">
                  <div className="label-row">
                    <div className="label-with-reset">
                      <label>Scan Lines</label>
                      <button className="reset-btn" onClick={() => resetSetting('oscScanLines')} title="Reset">
                        <RotateCcw />
                      </button>
                    </div>
                    <input 
                      type="number" 
                      value={settings.oscScanLines} 
                      onChange={(e) => updateSetting('oscScanLines', parseInt(e.target.value) || 10, true)}
                      className="number-input"
                    />
                  </div>
                  <SliderWithArrows 
                    min={10} 
                    max={256} 
                    step={1}
                    value={settings.oscScanLines} 
                    onChange={(val, isDirect) => updateSetting('oscScanLines', val, isDirect)}
                  />
                </div>

                <div className="controls-group">
                  <div className="label-row">
                    <div className="label-with-reset">
                      <label>Amplitude</label>
                      <button className="reset-btn" onClick={() => resetSetting('oscAmplitude')} title="Reset">
                        <RotateCcw />
                      </button>
                    </div>
                    <input 
                      type="number" 
                      step="0.1"
                      value={settings.oscAmplitude} 
                      onChange={(e) => updateSetting('oscAmplitude', parseFloat(e.target.value) || 0, true)}
                      className="number-input"
                    />
                  </div>
                  <SliderWithArrows 
                    min={0.1} 
                    max={16} 
                    step={0.1}
                    value={settings.oscAmplitude} 
                    onChange={(val, isDirect) => updateSetting('oscAmplitude', val, isDirect)}
                  />
                </div>

                <div className="controls-group">
                  <div className="label-row">
                    <div className="label-with-reset">
                      <label>Max Frequency</label>
                      <button className="reset-btn" onClick={() => resetSetting('oscMaxFrequency')} title="Reset">
                        <RotateCcw />
                      </button>
                    </div>
                    <input 
                      type="number" 
                      step="1"
                      value={settings.oscMaxFrequency} 
                      onChange={(e) => updateSetting('oscMaxFrequency', parseFloat(e.target.value) || 0, true)}
                      className="number-input wide"
                    />
                  </div>
                  <SliderWithArrows 
                    min={1} 
                    max={16} 
                    step={1}
                    value={settings.oscMaxFrequency} 
                    onChange={(val, isDirect) => updateSetting('oscMaxFrequency', val, isDirect)}
                  />
                </div>

                <div className="controls-group">
                  <div className="label-row">
                    <div className="label-with-reset">
                      <label>Frequency Steps</label>
                      <button className="reset-btn" onClick={() => resetSetting('oscFrequencyLevels')} title="Reset">
                        <RotateCcw />
                      </button>
                    </div>
                    <input 
                      type="number" 
                      step="1"
                      value={settings.oscFrequencyLevels} 
                      onChange={(e) => updateSetting('oscFrequencyLevels', parseInt(e.target.value) || 2, true)}
                      className="number-input wide"
                    />
                  </div>
                  <SliderWithArrows 
                    min={2} 
                    max={16} 
                    step={1}
                    value={settings.oscFrequencyLevels} 
                    onChange={(val, isDirect) => updateSetting('oscFrequencyLevels', val, isDirect)}
                  />
                </div>
              </>
            )}
          </div>

          <div className="controls-section">
            <h4 className="section-title">Curve Post-processing</h4>
            
            {(settings.algorithm === 'TSP' || settings.algorithm === 'Delaunay' || settings.algorithm === 'Oscillations' || (settings.algorithm === 'Dot matrix' && settings.dotStyle === 'circles')) && (
              <>
                <div className="controls-group">
                  <div className="label-row">
                    <div className="label-with-reset">
                      <label>
                        {settings.algorithm === 'Dot matrix' 
                          ? (settings.dotStyle === 'circles' ? 'Circle Diameter' : 'Point Size') 
                          : 'Line Width'}
                      </label>
                      <button 
                        className="reset-btn" 
                        onClick={() => resetSetting(settings.algorithm === 'Dot matrix' && settings.dotStyle === 'circles' ? 'circleDiameter' : 'lineWidth')} 
                        title="Reset"
                      >
                        <RotateCcw />
                      </button>
                    </div>
                    <input 
                      type="number" 
                      step={settings.algorithm === 'Dot matrix' ? 1 : 0.01}
                      value={settings.algorithm === 'Dot matrix' && settings.dotStyle === 'circles' ? settings.circleDiameter : settings.lineWidth} 
                      onChange={(e) => updateSetting(settings.algorithm === 'Dot matrix' && settings.dotStyle === 'circles' ? 'circleDiameter' : 'lineWidth', parseFloat(e.target.value) || 0, true)}
                      className="number-input"
                    />
                  </div>
                  <SliderWithArrows 
                    min={0.1} 
                    max={settings.algorithm === 'Dot matrix' ? 50 : 10} 
                    step={settings.algorithm === 'Dot matrix' ? 1 : 0.1}
                    value={settings.algorithm === 'Dot matrix' && settings.dotStyle === 'circles' ? settings.circleDiameter : settings.lineWidth} 
                    onChange={(val, isDirect) => updateSetting(settings.algorithm === 'Dot matrix' && settings.dotStyle === 'circles' ? 'circleDiameter' : 'lineWidth', val, isDirect)}
                  />
                </div>

                {(settings.algorithm === 'Dot matrix' && settings.dotStyle === 'circles') && (
                  <div className="controls-group">
                    <div className="label-row">
                      <div className="label-with-reset">
                        <label>Line Width</label>
                        <button className="reset-btn" onClick={() => resetSetting('lineWidth')} title="Reset">
                          <RotateCcw />
                        </button>
                      </div>
                      <input 
                        type="number" 
                        step="1"
                        value={settings.lineWidth} 
                        onChange={(e) => updateSetting('lineWidth', parseFloat(e.target.value) || 3, true)}
                        className="number-input"
                      />
                    </div>
                    <SliderWithArrows 
                      min={1} 
                      max={20} 
                      step={1}
                      value={settings.lineWidth} 
                      onChange={(val, isDirect) => updateSetting('lineWidth', val, isDirect)}
                    />
                  </div>
                )}

                {(settings.algorithm === 'TSP' || settings.algorithm === 'Delaunay') && (
                  <div className="controls-group">
                    <div className="label-row">
                      <div className="label-with-reset">
                        <label>Max Line Length</label>
                        <button className="reset-btn" onClick={() => resetSetting('maxLineLength')} title="Reset">
                          <RotateCcw />
                        </button>
                      </div>
                      <input 
                        type="number" 
                        value={settings.maxLineLength} 
                        onChange={(e) => updateSetting('maxLineLength', parseInt(e.target.value) || 0, true)}
                        className="number-input wide"
                      />
                    </div>
                    <SliderWithArrows 
                      min={1} 
                      max={1000} 
                      step={1}
                      value={settings.maxLineLength} 
                      onChange={(val, isDirect) => updateSetting('maxLineLength', val, isDirect)}
                    />
                  </div>
                )}

                {(settings.algorithm === 'TSP' || settings.algorithm === 'Oscillations') && (
                  <div className="controls-group">
                    <div className="label-row">
                      <div className="label-with-reset">
                        <label>Smoothing</label>
                        <button className="reset-btn" onClick={() => resetSetting('smoothing')} title="Reset">
                          <RotateCcw />
                        </button>
                      </div>
                      <input 
                        type="number" 
                        step="0.01"
                        min="0"
                        max="1"
                        value={settings.smoothing} 
                        onChange={(e) => updateSetting('smoothing', parseFloat(e.target.value) || 0, true)}
                        className="number-input"
                      />
                    </div>
                    <SliderWithArrows 
                      min={0} 
                      max={1} 
                      step={0.01}
                      value={settings.smoothing} 
                      onChange={(val, isDirect) => updateSetting('smoothing', val, isDirect)}
                    />
                  </div>
                )}
              </>
            )}

            {(settings.algorithm === 'Dot matrix' && settings.dotStyle === 'dots') && (
              <div className="controls-group">
                <div className="label-row">
                  <div className="label-with-reset">
                    <label>Point Size</label>
                    <button className="reset-btn" onClick={() => resetSetting('lineWidth')} title="Reset">
                      <RotateCcw />
                    </button>
                  </div>
                  <input 
                    type="number" 
                    step="1"
                    value={settings.lineWidth} 
                    onChange={(e) => updateSetting('lineWidth', parseFloat(e.target.value) || 3, true)}
                    className="number-input"
                  />
                </div>
                <SliderWithArrows 
                  min={1} 
                  max={20} 
                  step={1}
                  value={settings.lineWidth} 
                  onChange={(val, isDirect) => updateSetting('lineWidth', val, isDirect)}
                />
              </div>
            )}
          </div>

          <div className="process-controls">
            <div className="checkbox-row">
              <input 
                id="auto-process"
                type="checkbox" 
                checked={autoProcess} 
                onChange={(e) => setAutoProcess(e.target.checked)} 
              />
              <label htmlFor="auto-process">Auto-process</label>
            </div>
            <button 
              className="run-btn"
              onClick={onRunProcessing} 
              disabled={isProcessing || !image}
            >
              Process Curve
            </button>
          </div>

          <button 
            className="export-btn"
            onClick={onExportSVG} 
            disabled={isProcessing || !hasPath}
          >
            Export SVG
          </button>

          {hasPath && pathCount !== undefined && (
            <div className="path-stats">
              Separate curves: <strong>{pathCount}</strong>
            </div>
          )}

          {isProcessing && <p className="processing-text">Processing algorithm...</p>}
        </>
      )}
    </div>
  )
})

export default Controls
