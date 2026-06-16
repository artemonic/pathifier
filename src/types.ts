export type Algorithm = 'TSP' | 'Dot matrix' | 'Oscillations' | 'Delaunay';

export type DitherType = 'None' | 'Floyd-Steinberg' | 'Atkinson' | 'Stucki' | 'Bayer';

export interface Point {
  x: number;
  y: number;
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Settings {
  blacks: number;
  whites: number;
  midtones: number;
  contrast: number;
  invert: boolean;
  vignetteAmount: number;
  vignetteMode: 'none' | 'black' | 'white';
  vignetteWidth: number;
  vignetteBlur: number;
  lineWidth: number;
  smoothing: number;
  maxLineLength: number;
  algorithm: Algorithm;
  pointCount: number;
  clipWhite: boolean;
  // Dot Matrix Specific
  pointsPerLine: number;
  dither: DitherType;
  dotStyle: 'dots' | 'circles';
  circleDiameter: number;
  // Oscillation Specific
  oscAmplitude: number;
  oscFrequencyLevels: number;
  oscMaxFrequency: number;
  oscScanLines: number;
  oscMode: 'linear' | 'spiral';
  // Delaunay/Stippling Specific
  spacingMin: number;
  spacingMax: number;
}
