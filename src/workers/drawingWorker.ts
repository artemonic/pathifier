import type { Point, DitherType } from '../types'
import Delaunator from 'delaunator'

interface WorkerMessage {
  type: 'START' | 'RUN_PATH_ONLY'
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
  lkNeighbors?: number
  tspInit?: 'random' | 'hilbert' | 'nearestNeighbor' | 'farthestInsertion'
  tsp2Opt?: boolean
  tsp2OptPasses?: number
  stippleIterations?: number
  points?: Point[]
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

  const progressInterval = Math.max(1, Math.floor(iterations / 20))
  const intermediateInterval = Math.max(1, Math.floor(iterations / 10))

  for (let iter = 0; iter < iterations; iter++) {
    if (iter % progressInterval === 0 || iter === iterations - 1) {
      self.postMessage({ type: 'PROGRESS', message: `Refining city layout (${iter + 1}/${iterations})...`, percent: 5 + Math.floor((iter/iterations)*25) })
    }
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
    let totalMovement = 0
    let movedCount = 0
    for (let i = 0; i < currentPoints.length; i++) {
      if (counts[i] > 0) {
        const oldX = currentPoints[i].x
        const oldY = currentPoints[i].y
        currentPoints[i].x = sumsX[i]/counts[i]
        currentPoints[i].y = sumsY[i]/counts[i]
        const dx = currentPoints[i].x - oldX
        const dy = currentPoints[i].y - oldY
        totalMovement += Math.sqrt(dx * dx + dy * dy)
        movedCount++
      }
    }
    const avgMovement = movedCount > 0 ? (totalMovement / movedCount) : 0
    if (iter % intermediateInterval === 0 || iter === iterations - 1) self.postMessage({ type: 'INTERMEDIATE', path: [...currentPoints], isStipple: true })

    if (iter > 2 && avgMovement < 0.02) {
      self.postMessage({ type: 'PROGRESS', message: `Refining city layout (converged at ${iter + 1}/${iterations})...`, percent: 30 })
      self.postMessage({ type: 'INTERMEDIATE', path: [...currentPoints], isStipple: true })
      break
    }
  }
  return currentPoints
}

function getNearestNeighbors(points: Point[], M: number): Int32Array {
  const n = points.length
  const neighbors = new Int32Array(n * M)
  neighbors.fill(-1)
  
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i < n; i++) {
    const p = points[i]
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y
  }
  const width = maxX - minX || 1
  const height = maxY - minY || 1
  
  const cellSize = Math.max(2.0, 3.0 * Math.sqrt((width * height) / n))
  const cols = Math.ceil(width / cellSize), rows = Math.ceil(height / cellSize)
  
  const head = new Int32Array(cols * rows)
  head.fill(-1)
  const next = new Int32Array(n)
  
  for (let i = 0; i < n; i++) {
    const p = points[i]
    const cx = Math.max(0, Math.min(cols - 1, Math.floor((p.x - minX) / cellSize)))
    const cy = Math.max(0, Math.min(rows - 1, Math.floor((p.y - minY) / cellSize)))
    const binIdx = cy * cols + cx
    next[i] = head[binIdx]
    head[binIdx] = i
  }
  
  const distBuf = new Float32Array(M)
  const idxBuf = new Int32Array(M)
  
  for (let i = 0; i < n; i++) {
    const p = points[i]
    const cx = Math.max(0, Math.min(cols - 1, Math.floor((p.x - minX) / cellSize)))
    const cy = Math.max(0, Math.min(rows - 1, Math.floor((p.y - minY) / cellSize)))
    
    let foundCount = 0
    distBuf.fill(Infinity)
    idxBuf.fill(-1)
    
    let ring = 1
    const maxRing = Math.max(cols, rows)
    while (foundCount < M && ring < maxRing) {
      const minDistToOuter = (ring - 1) * cellSize
      if (foundCount >= M && distBuf[M - 1] < minDistToOuter * minDistToOuter) {
        break
      }
      
      for (let dy = -ring; dy <= ring; dy++) {
        const ny = cy + dy
        if (ny < 0 || ny >= rows) continue
        
        const isBorderY = (dy === -ring || dy === ring)
        for (let dx = -ring; dx <= ring; dx++) {
          if (!isBorderY && dx !== -ring && dx !== ring) continue
          
          const nx = cx + dx
          if (nx < 0 || nx >= cols) continue
          
          let pIdx = head[ny * cols + nx]
          while (pIdx !== -1) {
            if (pIdx !== i) {
              const op = points[pIdx]
              const d2 = (p.x - op.x) ** 2 + (p.y - op.y) ** 2
              
              if (d2 < distBuf[M - 1]) {
                let ins = M - 1
                while (ins > 0 && d2 < distBuf[ins - 1]) {
                  distBuf[ins] = distBuf[ins - 1]
                  idxBuf[ins] = idxBuf[ins - 1]
                  ins--
                }
                distBuf[ins] = d2
                idxBuf[ins] = pIdx
                if (foundCount < M) foundCount++
              }
            }
            pIdx = next[pIdx]
          }
        }
      }
      ring++
    }
    
    for (let j = 0; j < M; j++) {
      neighbors[i * M + j] = idxBuf[j]
    }
  }
  
  return neighbors
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

function hilbertSort(points: Point[]): Int32Array {
  const n = points.length
  if (n === 0) return new Int32Array(0)
  
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i < n; i++) {
    const p = points[i]
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y
  }
  
  const size = Math.max(maxX - minX, maxY - minY, 1)
  const sizeN = Math.pow(2, Math.ceil(Math.log2(size)) + 1)
  
  const hIndices = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    hIndices[i] = hilbertIndex(Math.floor(points[i].x - minX), Math.floor(points[i].y - minY), sizeN)
  }
  
  const indices = new Int32Array(n)
  for (let i = 0; i < n; i++) indices[i] = i
  
  const indicesArray = Array.from(indices)
  indicesArray.sort((a, b) => hIndices[a] - hIndices[b])
  
  return new Int32Array(indicesArray)
}

function nearestNeighborTour(
  points: Point[],
  neighbors: Int32Array,
  M: number,
  getCost: (p1: Point, p2: Point) => number,
  startCity: number
): Int32Array {
  const n = points.length
  const tour = new Int32Array(n)
  const visited = new Uint8Array(n)
  
  let curr = startCity
  tour[0] = curr
  visited[curr] = 1
  
  for (let i = 1; i < n; i++) {
    let bestDist = Infinity
    let bestIdx = -1
    const pCurr = points[curr]
    
    // Check precomputed neighbors of curr first
    const nStart = curr * M
    for (let k = 0; k < M; k++) {
      const neighbor = neighbors[nStart + k]
      if (neighbor === -1) break
      if (visited[neighbor] === 0) {
        const d = getCost(pCurr, points[neighbor])
        if (d < bestDist) {
          bestDist = d
          bestIdx = neighbor
        }
      }
    }
    
    // Fallback to full scan if no unvisited neighbor is found
    if (bestIdx === -1) {
      for (let j = 0; j < n; j++) {
        if (visited[j] === 0) {
          const d = getCost(pCurr, points[j])
          if (d < bestDist) {
            bestDist = d
            bestIdx = j
          }
        }
      }
    }
    
    if (bestIdx !== -1) {
      curr = bestIdx
      tour[i] = curr
      visited[curr] = 1
    } else {
      // Emergency fallback
      for (let j = 0; j < n; j++) {
        if (visited[j] === 0) {
          curr = j
          tour[i] = curr
          visited[curr] = 1
          break
        }
      }
    }
  }
  
  return tour
}

function solveFarthestInsertion(points: Point[]): number[] {
  const n = points.length
  if (n < 3) {
    const tour = new Array(n)
    for (let i = 0; i < n; i++) tour[i] = i
    return tour
  }

  // Fast Euclidean squared distance helper for finding farthest
  const distSq = (i: number, j: number): number => {
    const dx = points[i].x - points[j].x
    const dy = points[i].y - points[j].y
    return dx * dx + dy * dy
  }

  // Find first point (index 0) and the point farthest from it
  let first = 0
  let second = -1
  let maxDSq = -1
  for (let i = 1; i < n; i++) {
    const d = distSq(first, i)
    if (d > maxDSq) {
      maxDSq = d
      second = i
    }
  }

  const tourNext = new Int32Array(n)
  const tourPrev = new Int32Array(n)
  tourNext.fill(-1)
  tourPrev.fill(-1)

  tourNext[first] = second
  tourPrev[second] = first
  tourNext[second] = first
  tourPrev[first] = second

  const inTour = new Uint8Array(n)
  inTour[first] = 1
  inTour[second] = 1

  // minDist contains squared distance from each point to the nearest point in the tour
  const minDist = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    if (i !== first && i !== second) {
      const d1 = distSq(i, first)
      const d2 = distSq(i, second)
      minDist[i] = d1 < d2 ? d1 : d2
    }
  }

  // Cache of edge lengths in the tour: edgeLengths[u] is Euclidean distance from u to tourNext[u]
  const edgeLengths = new Float32Array(n)
  edgeLengths[first] = Math.sqrt(maxDSq)
  edgeLengths[second] = edgeLengths[first]

  // Insert remaining points
  for (let step = 2; step < n; step++) {
    if (step % 1000 === 0) {
      self.postMessage({ 
        type: 'PROGRESS', 
        message: `Farthest Insertion: routing path (${step}/${n})...`, 
        percent: 35 + Math.floor((step / n) * 15) 
      })
    }

    // Find the unvisited point k farthest from the tour
    let farthestIdx = -1
    let maxDistToTour = -1
    for (let i = 0; i < n; i++) {
      if (inTour[i] === 0) {
        if (minDist[i] > maxDistToTour) {
          maxDistToTour = minDist[i]
          farthestIdx = i
        }
      }
    }

    if (farthestIdx === -1) break

    // Find the edge (curr, nxt) in the tour that minimizes insertion cost:
    // dist(curr, farthestIdx) + dist(farthestIdx, nxt) - dist(curr, nxt)
    let bestPrev = -1
    let bestNext = -1
    let minInsertCost = Infinity
    let bestDist1 = 0
    let bestDist2 = 0

    const pK = points[farthestIdx]

    let curr = first
    do {
      const nxt = tourNext[curr]
      const pCurr = points[curr]
      const pNxt = points[nxt]
      
      const d1 = Math.sqrt((pCurr.x - pK.x)**2 + (pCurr.y - pK.y)**2)
      const d2 = Math.sqrt((pNxt.x - pK.x)**2 + (pNxt.y - pK.y)**2)
      const d3 = edgeLengths[curr]
      const cost = d1 + d2 - d3

      if (cost < minInsertCost) {
        minInsertCost = cost
        bestPrev = curr
        bestNext = nxt
        bestDist1 = d1
        bestDist2 = d2
      }
      curr = nxt
    } while (curr !== first)

    // Insert farthestIdx
    tourNext[bestPrev] = farthestIdx
    tourPrev[farthestIdx] = bestPrev
    tourNext[farthestIdx] = bestNext
    tourPrev[bestNext] = farthestIdx
    inTour[farthestIdx] = 1

    // Update edge lengths cache
    edgeLengths[bestPrev] = bestDist1
    edgeLengths[farthestIdx] = bestDist2

    // Update minDist for unvisited points
    for (let i = 0; i < n; i++) {
      if (inTour[i] === 0) {
        const d = distSq(i, farthestIdx)
        if (d < minDist[i]) {
          minDist[i] = d
        }
      }
    }
  }

  // Convert double-linked list to ordered array of indices
  const tour = new Array(n)
  let curr = first
  for (let i = 0; i < n; i++) {
    tour[i] = curr
    curr = tourNext[curr]
  }
  return tour
}

function solveTSP(
  points: Point[],
  lkNeighbors?: number,
  tspInit?: 'random' | 'hilbert' | 'nearestNeighbor' | 'farthestInsertion',
  tsp2Opt?: boolean,
  tsp2OptPasses?: number
): Point[] {
  const n = points.length
  if (n < 4) return points
  self.postMessage({ type: 'PROGRESS', message: 'Routing path...', percent: 35 })

  const getDist = (p1: Point, p2: Point): number => {
    const dx = p1.x - p2.x, dy = p1.y - p2.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  const initMethod = tspInit || 'farthestInsertion'
  const tour = new Int32Array(n)

  // 1. Initialize tour
  if (initMethod === 'hilbert') {
    self.postMessage({ type: 'PROGRESS', message: 'Hilbert routing...', percent: 38 })
    const sortedIndices = hilbertSort(points)
    tour.set(sortedIndices)
  } else if (initMethod === 'farthestInsertion') {
    self.postMessage({ type: 'PROGRESS', message: 'Farthest Insertion routing...', percent: 38 })
    const insertionTour = solveFarthestInsertion(points)
    for (let i = 0; i < n; i++) tour[i] = insertionTour[i]
  } else if (initMethod === 'nearestNeighbor') {
    self.postMessage({ type: 'PROGRESS', message: 'Nearest Neighbor routing...', percent: 38 })
    const M_nn = 5
    const neighbors_nn = getNearestNeighbors(points, M_nn)
    const nnTour = nearestNeighborTour(points, neighbors_nn, M_nn, getDist, 0)
    tour.set(nnTour)
  } else {
    // random tour
    for (let i = 0; i < n; i++) {
      tour[i] = i
    }
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const temp = tour[i]
      tour[i] = tour[j]
      tour[j] = temp
    }
  }

  // 2. Run 2-opt Refinement if enabled
  if (tsp2Opt) {
    const M = lkNeighbors || 8
    const passes = tsp2OptPasses || 5
    const maxIterations = 10000

    self.postMessage({ type: 'PROGRESS', message: 'Building spatial index...', percent: 55 })
    const neighbors = getNearestNeighbors(points, M)

    // Track tour and position mapping
    const pos = new Int32Array(n)
    for (let i = 0; i < n; i++) {
      pos[tour[i]] = i
    }

    self.postMessage({ type: 'PROGRESS', message: 'Refining path (2-opt optimization)...', percent: 60 })

    let lastPostTime = 0

    for (let pass = 1; pass <= passes; pass++) {
      let improved = true
      let iteration = 0

      while (improved && iteration < maxIterations) {
        improved = false
        iteration++

        // Search start city randomly to avoid ordering bias
        const startCitySearch = Math.floor(Math.random() * n)

        for (let step = 0; step < n; step++) {
          const i = (startCitySearch + step) % n
          const u = tour[i]

          const uNeighborsStart = u * M
          for (let k = 0; k < M; k++) {
            const v = neighbors[uNeighborsStart + k]
            if (v === -1) break

            const j = pos[v]

            // Order positions so start_pos < end_pos
            let start_pos = i
            let end_pos = j
            if (end_pos < start_pos) {
              const tmp = start_pos
              start_pos = end_pos
              end_pos = tmp
            }

            // Must not be adjacent edges
            if (end_pos <= start_pos + 1 || (start_pos === 0 && end_pos === n - 1)) {
              continue
            }

            const a = tour[start_pos]
            const b = tour[start_pos + 1]
            const c = tour[end_pos]
            const d = tour[(end_pos + 1) % n]

            // Calculate current cost vs swapped cost
            const currentCost = getDist(points[a], points[b]) + getDist(points[c], points[d])
            const newCost = getDist(points[a], points[c]) + getDist(points[b], points[d])
            const delta = newCost - currentCost

            if (delta < -0.001) {
              // Apply 2-opt swap by reversing tour[start_pos + 1 ... end_pos]
              let l = start_pos + 1
              let r = end_pos
              while (l < r) {
                const temp = tour[l]
                tour[l] = tour[r]
                tour[r] = temp
                pos[tour[l]] = l
                pos[tour[r]] = r
                l++
                r--
              }
              improved = true
              break
            }
          }
        }

        // Periodically post intermediate path
        const now = performance.now()
        if (now - lastPostTime > 33) {
          self.postMessage({ type: 'INTERMEDIATE', path: tourToPoints(tour, points) })
          lastPostTime = now
        }
      }

      self.postMessage({ 
        type: 'PROGRESS', 
        message: `Refining path (Pass ${pass}/${passes})...`, 
        percent: 60 + Math.floor((pass / passes) * 40) 
      })
    }
  }

  // Return the final tour
  return tourToPoints(tour, points)
}

function tourToPoints(tour: Int32Array, points: Point[]): Point[] {
  const path = new Array(tour.length)
  for (let i = 0; i < tour.length; i++) {
    path[i] = points[tour[i]]
  }
  return path
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
  const { type, imageData, pointCount, algorithm, clipWhite, pointsPerLine, dither, oscAmplitude, oscFrequencyLevels, oscMaxFrequency, oscScanLines, oscMode, spacingMin, spacingMax, lkNeighbors, tspInit, tsp2Opt, tsp2OptPasses, stippleIterations, points } = e.data

  if (type === 'RUN_PATH_ONLY') {
    const pts = points || []
    if (algorithm === 'Delaunay') {
      self.postMessage({ type: 'RESULT', path: solveDelaunay(pts) })
    } else {
      self.postMessage({ type: 'RESULT', path: (algorithm === 'TSP') ? solveTSP(pts, lkNeighbors, tspInit, tsp2Opt, tsp2OptPasses) : pts })
    }
    return
  }

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
      const iters = stippleIterations || (isDelaunay 
        ? (pointCount > 50000 ? 5 : 10) 
        : (pointCount > 50000 ? 10 : (pointCount > 10000 ? 15 : 20)))
      const pts = weightedVoronoiStippling(imageData, pointCount, iters, spacingMin, spacingMax, !!clipWhite)
      self.postMessage({ type: 'STIPPLED_POINTS', points: pts })
      if (algorithm === 'Delaunay') {
        self.postMessage({ type: 'RESULT', path: solveDelaunay(pts) })
      } else {
        self.postMessage({ type: 'RESULT', path: (algorithm === 'TSP') ? solveTSP(pts, lkNeighbors, tspInit, tsp2Opt, tsp2OptPasses) : pts })
      }
    }
  }
}
