# Pathifier Project State

## Project Overview
Pathifier generates organic, non-intersecting continuous line drawings (TSP art) from bitmap images. It prioritizes the "Bridges 2005" aesthetic (Kaplan and Bosch) with smooth gradients and professional-grade controls.

## Current Progress
- [x] Phase 5: High-Fidelity Weighted Voronoi Stippling (Bridges 2005).
- [x] Feature: Mandatory Custom Image Cropping on Import.
- [x] Feature: Canvas Zoom (Floating Slider + Mouse Wheel, 25% steps, 500% limit).
- [x] Feature: High-fidelity Vector (SVG) Path Preview (Black path on White background).
- [x] Feature: Hold-to-Compare (Fades path/white-bg to reveal processed image).
- [x] Feature: Real-time Algorithm Visualization (Live intermediate paths).
- [x] Feature: Interactive Algorithm Interruption (Instant manual cancel on settings change).
- [x] Feature: Smart Reruns (Worker only restarts on core algorithm/grading changes).
- [x] Feature: **Delaunay Triangulation** (Optimized stippling-based mesh generation).
- [x] UI: Automatic Post-processing reset on algorithm switch.
- [x] UI: Standardized action buttons and section-level reset buttons (Grading & Vignette).
- [x] UI: Custom Brand Identity (Pen icon favicon).
- [x] UI: Responsive Controls (Unlocked during processing for interruption).
- [x] Feature: Alternative algorithms (Hilbert curve, Dot matrix, Oscillations).

## Technical Standards

### Layout & Navigation
- **Dual-Sidebar**: Left panel for preparation, Right panel for generation/output.
- **Navigation**: Mouse Wheel & Slider zoom (0.25x to 5.0x) in 25% increments. Floating Zoom Control with reset.
- **Viewer Aesthetic**: Black path on white background (paper preview). Original image is only visible during "Hold-to-Compare".
- **Theme**: Dark industrial with Orange accents (`#ff8c00`).
- **Modal Buttons**: Standardized 42px height. Green (`#2e7d32`) for "Apply", Blue-Gray (`#5c7a92`) for "No Crop".

### Path Processing
- **Smoothing**: Combined Moving Average + Chaikin. Range [0, 1]. Applied to path segments *after* culling/segmentation to prevent distortion near cut gaps.
- **Segmentation**: Paths are broken into multiple segments (`Point[][]`) if any step exceeds `maxLineLength`. For TSP paths, a dedicated "Cull Long Jumps" toggle and `cullMaxDistance` setting filters out long jumps between distant clusters.
- **Delaunay Culling**: `maxLineLength` is used to hide (cull) long edges in the triangulation mesh.
- **Default Weights**: `lineWidth` defaults: 3.0 for Dots, 2.0 for TSP/Oscillations, 1.0 for Delaunay.
- **Rerun Logic**: Algorithm reruns (worker restarts) are triggered by core settings. Post-processing changes (lineWidth, smoothing, maxLineLength) are instant.
- **Auto-Reset**: Post-processing settings are automatically restored to artistic defaults when the algorithm is changed.

### Algorithms & Optimization
- **Stippling**: Weighted Voronoi with sub-pixel jittered integration.
- **WVS Optimization**: Uses a high-performance **Linked-List Grid** (Int32Array) to minimize memory allocations.
- **Delaunay Speed**: Fast half-edge traversal for unique edge extraction. Non-linear weight mapping (gamma 1.5) for increased highlight sparsity.
- **TSP Solver**: Hill-Climbing heuristic with random, Hilbert, or Nearest Neighbor initialization, and 2-opt swap candidates using nearest neighbors.
- **Concurrency**: Web Workers are immediately terminated on core settings changes.

### Grading & Vignette
- **Grading**: Blacks (Lift), Whites (Gain), Midtones (Gamma), Contrast.
- **Vignette**: Radial overlay (Amount, Width, Blur).
- **UI**: Section-level reset buttons restore all defaults in a single click.

## Artifact Trail
- `src/workers/drawingWorker.ts`: Optimized WVS, TSP, and Delaunay triangulation logic.
- `src/components/DrawingCanvas.tsx`: Multi-part SVG preview, zoom logic, and real-time path processing.
- `src/components/Controls.tsx`: Dual-panel UI with context-aware defaults and auto-reset logic.
- `src/utils/smoothing.ts`: Path segmentation and multi-segment SVG generation logic.
- `src/utils/imageProcessor.ts`: Professional grading math including radial vignette.
- `src/App.css`: Workstation UI with orange accents and floating zoom styles.
