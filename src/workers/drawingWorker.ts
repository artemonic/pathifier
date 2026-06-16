import type { Point, DitherType } from '../types'
import Delaunator from 'delaunator'

interface WorkerMessage {
  type: 'START'
  imageData: ImageData
  pointCount: number
  algorithm: string
  clipWhite?: boolean
  pointsPerLine?: number
  dither?: DitherType
  oscAmplitude?: number
  oscFrequencyLevels?: number
  oscMaxFrequency?: number
  oscScanLines?: number
  oscMode?: 'linear' | 'spiral'
  spacingMin?: number
  spacingMax?: number
}

function twoOptSwap(points: Point[], i: number, j: number): Point[] {
  const newPoints = points.slice(0, i)
  const segment = points.slice(i, j + 1).reverse()
  return [...newPoints, ...segment, ...points.slice(j + 1)]
}

function weightedVoronoiStippling(imageData: ImageData, targetPointCount: number, iterations: number = 40, spacingMin: number = 2, spacingMax: number = 20, clipWhite: boolean = false): Point[] {
  const { data, width, height } = imageData
  const points: Point[] = []
  
  // Weight mapping based on user-defined spacing
  const weightMin = 1 / (spacingMax ** 2)
  const weightMax = 1 / (spacingMin ** 2)
  const getWeight = (i: number) => {
    const r = data[i], g = data[i+1], b = data[i+2]
    const luminosity = (r * 0.299 + g * 0.587 + b * 0.114)
    if (clipWhite && luminosity > 250) return 0
    
    // Stronger gamma (2.0) for even sparser highlights as requested
    const darkness = Math.pow((255 - luminosity) / 255, 2.0)
    return weightMin + darkness * (weightMax - weightMin)
  }

  const initialPoolSize = targetPointCount * 5
  for (let s = 0; s < initialPoolSize * 15 && points.length < initialPoolSize; s++) {
    const x = Math.random() * width
    const y = Math.random() * height
    const i = (Math.floor(y) * width + Math.floor(x)) * 4
    
    const weight = getWeight(i)
    // Probability proportional to weight (density)
    const prob = weight / weightMax
    if (Math.random() < prob) points.push({ x, y })
  }
  const currentPoints = points.sort(() => Math.random() - 0.5).slice(0, targetPointCount)
  
  const binSize = Math.max(2.0, Math.sqrt((width * height) / currentPoints.length) * 1.5)
  const cols = Math.ceil(width / binSize), rows = Math.ceil(height / binSize)
  const head = new Int32Array(cols * rows)
  const next = new Int32Array(currentPoints.length)

  for (let iter = 0; iter < iterations; iter++) {
    self.postMessage({ type: 'PROGRESS', message: `Refining city layout (${iter + 1}/${iterations})...`, percent: 5 + Math.floor((iter/iterations)*25) })
    const sumsX = new Float32Array(currentPoints.length), sumsY = new Float32Array(currentPoints.length), counts = new Float32Array(currentPoints.length)
    
    head.fill(-1)
    currentPoints.forEach((p, idx) => {
      const cx = Math.max(0, Math.min(cols-1, Math.floor(p.x/binSize))), cy = Math.max(0, Math.min(rows-1, Math.floor(p.y/binSize)))
      const binIdx = cy * cols + cx
      next[idx] = head[binIdx]
      head[binIdx] = idx
    })

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        const weight = getWeight(i)
        if (weight <= 0.0001) continue
        const sx = x + Math.random(), sy = y + Math.random()
        let minDist = Infinity, nearestIdx = -1
        const cx = Math.floor(sx/binSize), cy = Math.floor(sy/binSize)
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy
            if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
              let pIdx = head[ny * cols + nx]
              while (pIdx !== -1) {
                const p = currentPoints[pIdx]
                const d2 = (sx - p.x)**2 + (sy - p.y)**2
                if (d2 < minDist) { minDist = d2; nearestIdx = pIdx }
                pIdx = next[pIdx]
              }
            }
          }
        }
        if (nearestIdx !== -1) { sumsX[nearestIdx] += sx * weight; sumsY[nearestIdx] += sy * weight; counts[nearestIdx] += weight }
      }
    }
    for (let i = 0; i < currentPoints.length; i++) { if (counts[i] > 0) { currentPoints[i].x = sumsX[i]/counts[i]; currentPoints[i].y = sumsY[i]/counts[i] } }
    if (iter % 5 === 0 || iter === iterations - 1) self.postMessage({ type: 'INTERMEDIATE', path: hilbertSort([...currentPoints]) })
  }
  return currentPoints
}

function hilbertIndex(x: number, y: number, n: number): number {
  let d = 0
  for (let s = Math.floor(n / 2); s > 0; s = Math.floor(s / 2)) {
    const rx = (x & s) > 0 ? 1 : 0, ry = (y & s) > 0 ? 1 : 0
    d += s * s * ((3 * rx) ^ ry)
    if (ry === 0) {
      if (rx === 1) { x = n - 1 - x; y = n - 1 - y }
      const t = x; x = y; y = t
    }
  }
  return d
}

function hilbertSort(points: Point[]): Point[] {
  if (points.length === 0) return []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y
  }
  const size = Math.max(maxX - minX, maxY - minY, 1)
  const n = Math.pow(2, Math.ceil(Math.log2(size)) + 1)
  return [...points].sort((a, b) => {
    const idxA = hilbertIndex(Math.floor(a.x - minX), Math.floor(a.y - minY), n)
    const idxB = hilbertIndex(Math.floor(b.x - minX), Math.floor(b.y - minY), n)
    return idxA - idxB
  })
}

function solveTSP(points: Point[], imageData: ImageData, clipWhite: boolean) {
  if (points.length < 4) return points
  self.postMessage({ type: 'PROGRESS', message: 'Planning path...', percent: 35 })
  
  const { width, height } = imageData
  const isWhite = new Uint8Array(width * height)
  if (clipWhite) {
    const data = imageData.data
    for (let i = 0; i < data.length; i += 4) {
      // Threshold for "forbidden" areas
      if (data[i] > 240) isWhite[i / 4] = 1
    }
  }

  const getDist = (p1: Point, p2: Point): number => {
    const dx = p1.x - p2.x, dy = p1.y - p2.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  // Balanced penalty: Avoid highlights but don't create knots to do it
  const getWhitePenalty = (p1: Point, p2: Point, d: number): number => {
    if (!clipWhite || d < 12) return 0
    
    // Sample only midpoint for speed. If midpoint is in white, it's likely crossing.
    const mx = Math.floor((p1.x + p2.x) * 0.5)
    const my = Math.floor((p1.y + p2.y) * 0.5)
    
    if (mx >= 0 && mx < width && my >= 0 && my < height) {
      if (isWhite[my * width + mx]) return d * 10 // Strong 10x penalty to ensure long crossings break
    }
    return 0
  }

  let tour = hilbertSort(points)
  self.postMessage({ type: 'PROGRESS', message: 'Optimizing flow...', percent: 45 })
  
  let improved = true, iterations = 0
  const n = tour.length
  // Reduced iterations for speed (-30% more)
  const maxIterations = n > 50000 ? 25 : (n > 10000 ? 50 : 100)
  
  while (improved && iterations < maxIterations) {
    improved = false
    // Narrow base window for speed, but dynamic expansion
    const baseWindowSize = n > 50000 ? 30 : (n > 10000 ? 100 : 400)
    let swapCount = 0

    // Calculate average line length for the current tour
    let totalLength = 0
    for (let k = 0; k < n - 1; k++) {
      totalLength += getDist(tour[k], tour[k+1])
    }
    const avgLength = totalLength / Math.max(1, n - 1)
    const softThreshold = avgLength * 1.2
    
    // Hard cutoff: Never connect cities that are absurdly far apart
    const hardCutoff = avgLength * 3.0

    const getLengthPenalty = (d: number) => d > softThreshold ? d * 50 : 0

    for (let i = 1; i < n - 2; i++) {
      const p1 = tour[i-1], p2 = tour[i]
      const d12 = getDist(p1, p2)
      const penalty12 = getWhitePenalty(p1, p2, d12) + getLengthPenalty(d12)
      const cost12 = d12 + penalty12

      // Guarantee removal of long/crossing lines: search ENTIRE path ('n')
      const searchWindow = (cost12 > d12 + 1 || d12 > softThreshold) ? n : baseWindowSize
      const jump = Math.min(n - 1, i + searchWindow)

      for (let j = i + 1; j < jump; j++) {
        const p3 = tour[j], p4 = tour[j+1]
        
        const d13 = getDist(p1, p3)
        const d24 = getDist(p2, p4)
        
        // STRICT RULE: Never connect cities that are too far apart.
        // If the proposed new edges are longer than the hard cutoff, instantly reject the swap.
        if (d13 > hardCutoff || d24 > hardCutoff) {
          continue
        }

        const d34 = getDist(p3, p4)

        const eCurrent = d12 + d34
        const eNew = d13 + d24
        
        // Euclidean improvement (removes crossing)
        if (eNew < eCurrent - 0.001) {
          tour = twoOptSwap(tour, i, j)
          improved = true; swapCount++
          break 
        }

        // Penalty improvement (avoids white areas and strict length limit)
        if (clipWhite || cost12 > d12 + 1 || d12 > softThreshold) {
          const penalty34 = getWhitePenalty(p3, p4, d34) + getLengthPenalty(d34)
          const penalty13 = getWhitePenalty(p1, p3, d13) + getLengthPenalty(d13)
          const penalty24 = getWhitePenalty(p2, p4, d24) + getLengthPenalty(d24)
          
          const cost34 = d34 + penalty34
          const cost13 = d13 + penalty13
          const cost24 = d24 + penalty24

          if ((cost13 + cost24) < (cost12 + cost34) - 0.1) {
            tour = twoOptSwap(tour, i, j)
            improved = true; swapCount++
            break
          }
        }
      }
    }

    
    iterations++
    // Only exit early if basically zero swaps occurred
    if (iterations > 15 && swapCount === 0) break

    const mod = n > 50000 ? 5 : 2
    if (iterations % mod === 0) self.postMessage({ type: 'INTERMEDIATE', path: [...tour] })
    
    self.postMessage({ type: 'PROGRESS', message: `Refining art (${iterations})...`, percent: 45 + Math.floor((iterations/maxIterations)*55) })
  }
  return tour
}

function solveDelaunay(points: Point[]): Point[][] {
  if (points.length < 3) return [points]
  const coords = new Float64Array(points.length * 2)
  for (let i = 0; i < points.length; i++) {
    coords[i * 2] = points[i].x
    coords[i * 2 + 1] = points[i].y
  }
  
  const delaunay = new Delaunator(coords)
  const { triangles, halfedges } = delaunay
  const edges: Point[][] = []

  for (let i = 0; i < triangles.length; i++) {
    if (i > halfedges[i]) {
      const p1 = points[triangles[i]]
      const p2 = points[triangles[i % 3 === 2 ? i - 2 : i + 1]]
      edges.push([p1, p2])
    }
  }
  return edges
}

function dotMatrix(imageData: ImageData, pointsPerLine: number, dither: DitherType): Point[] {
  const { data, width, height } = imageData
  const aspect = height / width, lines = Math.round(pointsPerLine * aspect)
  const stepX = width / pointsPerLine, stepY = height / lines
  const points: Point[] = [], grid = new Float32Array(pointsPerLine * lines)
  for (let ly = 0; ly < lines; ly++) {
    for (let lx = 0; lx < pointsPerLine; lx++) {
      let sum = 0, count = 0
      const startX = Math.floor(lx * stepX), endX = Math.floor((lx + 1) * stepX)
      const startY = Math.floor(ly * stepY), endY = Math.floor((ly + 1) * stepY)
      for (let y = startY; y < endY && y < height; y++) {
        for (let x = startX; x < endX && x < width; x++) { sum += data[(y * width + x) * 4]; count++ }
      }
      grid[ly * pointsPerLine + lx] = count > 0 ? sum / count : 255
    }
  }
  if (dither === 'Bayer') {
    const b8x8 = [[0,32,8,40,2,34,10,42],[48,16,56,24,50,18,58,26],[12,44,4,36,14,46,6,38],[60,28,68,20,62,30,70,22],[3,35,11,43,1,33,9,41],[51,19,59,27,49,17,57,25],[15,47,7,39,13,45,5,37],[63,31,71,23,61,29,69,21]].map(r => r.map(v => (v/64)*255))
    for (let ly = 0; ly < lines; ly++) {
      for (let lx = 0; lx < pointsPerLine; lx++) {
        const val = grid[ly * pointsPerLine + lx]
        if (val < b8x8[ly%8][lx%8]) points.push({ x: lx*stepX + stepX/2, y: ly*stepY + stepY/2 })
      }
    }
  } else if (dither === 'None') {
    for (let ly = 0; ly < lines; ly++) {
      for (let lx = 0; lx < pointsPerLine; lx++) { if (grid[ly * pointsPerLine + lx] < 128) points.push({ x: lx*stepX + stepX/2, y: ly*stepY + stepY/2 }) }
    }
  } else {
    for (let ly = 0; ly < lines; ly++) {
      for (let lx = 0; lx < pointsPerLine; lx++) {
        const idx = ly * pointsPerLine + lx, oldPixel = grid[idx], newPixel = oldPixel < 128 ? 0 : 255
        grid[idx] = newPixel; const err = oldPixel - newPixel
        const dist = (dlx: number, dly: number, f: number) => {
          const nlx = lx + dlx, nly = ly + dly
          if (nlx >= 0 && nlx < pointsPerLine && nly >= 0 && nly < lines) grid[nly * pointsPerLine + nlx] += err * f
        }
        if (dither === 'Floyd-Steinberg') { dist(1,0,7/16); dist(-1,1,3/16); dist(0,1,5/16); dist(1,1,1/16) }
        else if (dither === 'Atkinson') { const f = 1/8; dist(1,0,f); dist(2,0,f); dist(-1,1,f); dist(0,1,f); dist(1,1,f); dist(0,2,f) }
        else if (dither === 'Stucki') { dist(1,0,8/42); dist(2,0,4/42); dist(-2,1,2/42); dist(-1,1,4/42); dist(0,1,8/42); dist(1,1,4/42); dist(2,1,2/42); dist(-2,2,1/42); dist(-1,2,2/42); dist(0,2,4/42); dist(1,2,2/42); dist(2,2,1/42) }
      }
    }
    for (let ly = 0; ly < lines; ly++) {
      for (let lx = 0; lx < pointsPerLine; lx++) { if (grid[ly * pointsPerLine + lx] < 128) points.push({ x: lx*stepX + stepX/2, y: ly*stepY + stepY/2 }) }
    }
  }
  return points
}

function generateOscillations(imageData: ImageData, scanLines: number, amplitude: number, frequencyLevels: number, maxFreq: number, mode: 'linear' | 'spiral'): Point[] {
  const { data, width, height } = imageData
  const points: Point[] = []
  const centerX = width / 2
  const centerY = height / 2
  
  if (mode === 'spiral') {
    const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY)
    const totalTheta = scanLines * 2 * Math.PI
    const steps = scanLines * 1000 
    let currentPhase = 0

    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const theta = t * totalTheta
      const r = t * maxRadius
      
      const x_base = centerX + r * Math.cos(theta)
      const y_base = centerY + r * Math.sin(theta)
      
      const ix = Math.floor(x_base)
      const iy = Math.floor(y_base)
      
      if (ix < 0 || ix >= width || iy < 0 || iy >= height) continue
      
      const pixelIdx = (iy * width + ix) * 4
      const r_pix = data[pixelIdx], g_pix = data[pixelIdx+1], b_pix = data[pixelIdx+2]
      const darkness = (255 - (r_pix * 0.299 + g_pix * 0.587 + b_pix * 0.114)) / 255
      
      const level = Math.floor(darkness * frequencyLevels)
      const normalizedFreq = level / Math.max(1, frequencyLevels)
      const currentFreq = normalizedFreq * maxFreq
      
      const baseScale = 0.5 
      currentPhase += currentFreq * (r / maxRadius) * baseScale
      
      const offset = Math.sin(currentPhase) * amplitude * darkness
      
      points.push({
        x: centerX + (r + offset) * Math.cos(theta),
        y: centerY + (r + offset) * Math.sin(theta)
      })

      if (i % 5000 === 0) {
        self.postMessage({ type: 'PROGRESS', message: 'Generating spiral...', percent: Math.floor(t * 100) })
      }
    }
  } else {
    const stepY = height / scanLines
    const stepX = 1.0 
    
    for (let ly = 0; ly < scanLines; ly++) {
      const yBase = ly * stepY + stepY / 2
      const isReverse = ly % 2 === 1
      let currentPhase = 0
      
      if (ly % 10 === 0) {
        self.postMessage({ type: 'PROGRESS', message: 'Scanning oscillations...', percent: Math.floor((ly / scanLines) * 100) })
      }

      for (let lx = 0; lx <= width; lx += stepX) {
        const x = isReverse ? (width - lx) : lx
        const ix = Math.floor(x)
        const iy = Math.floor(yBase)
        
        if (ix < 0 || ix >= width || iy < 0 || iy >= height) continue
        
        const pixelIdx = (iy * width + ix) * 4
        const r_pix = data[pixelIdx], g_pix = data[pixelIdx+1], b_pix = data[pixelIdx+2]
        const darkness = (255 - (r_pix * 0.299 + g_pix * 0.587 + b_pix * 0.114)) / 255
        
        const level = Math.floor(darkness * frequencyLevels)
        const normalizedFreq = level / Math.max(1, frequencyLevels)
        const currentFreq = normalizedFreq * maxFreq
        
        currentPhase += currentFreq * 0.2 * stepX
        const offset = Math.sin(currentPhase) * amplitude * darkness
        
        points.push({ x, y: yBase + offset })
      }
    }
  }
  
  return points
}

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { type, imageData, pointCount, algorithm, clipWhite, pointsPerLine, dither, oscAmplitude, oscFrequencyLevels, oscMaxFrequency, oscScanLines, oscMode, spacingMin, spacingMax } = e.data
  if (type === 'START') {
    if (algorithm === 'Dot matrix') {
      self.postMessage({ type: 'RESULT', path: dotMatrix(imageData, pointsPerLine || 100, dither || 'Floyd-Steinberg') })
    } else if (algorithm === 'Oscillations') {
      self.postMessage({ type: 'RESULT', path: generateOscillations(
        imageData, 
        oscScanLines || 100, 
        oscAmplitude || 5, 
        oscFrequencyLevels || 4,
        oscMaxFrequency || 8.0,
        oscMode || 'linear'
      ) })
    } else {
      const isDelaunay = algorithm === 'Delaunay'
      const iters = isDelaunay 
        ? (pointCount > 50000 ? 5 : 10) 
        : (pointCount > 50000 ? 15 : (pointCount > 10000 ? 30 : 45))
      const pts = weightedVoronoiStippling(imageData, pointCount, iters, spacingMin, spacingMax, !!clipWhite)
      if (algorithm === 'Delaunay') {
        self.postMessage({ type: 'RESULT', path: solveDelaunay(pts) })
      } else {
        self.postMessage({ type: 'RESULT', path: (algorithm === 'TSP') ? solveTSP(pts, imageData, !!clipWhite) : pts })
      }
    }
  }
}
