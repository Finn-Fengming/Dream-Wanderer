export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityConfig {
  tier: QualityTier;
  label: string;
  pixelRatio: number;
  shadowMapSize: number;
  aoEnabled: boolean;
  aoSamples: number;
  volumetricFog: boolean;
  volumetricSteps: number;
  bloomEnabled: boolean;
  bloomStrength: number;
  dynamicLights: number;
  snowCount: number;
  emberCount: number;
  grassCount: number;
  cloudLayers: number;
  iceReflection: boolean;
  sharpness: number;
}

export const QUALITY_PRESETS: Record<QualityTier, QualityConfig> = {
  low: {
    tier: 'low',
    label: '流畅',
    pixelRatio: 1.0,
    shadowMapSize: 1024,
    aoEnabled: false,
    aoSamples: 0,
    volumetricFog: false,
    volumetricSteps: 0,
    bloomEnabled: false,
    bloomStrength: 0.0,
    dynamicLights: 4,
    snowCount: 300,
    emberCount: 120,
    grassCount: 3500,
    cloudLayers: 1,
    iceReflection: false,
    sharpness: 0.08,
  },
  medium: {
    tier: 'medium',
    label: '均衡',
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.25),
    shadowMapSize: 1536,
    aoEnabled: true,
    aoSamples: 6,
    volumetricFog: true,
    volumetricSteps: 6,
    bloomEnabled: true,
    bloomStrength: 0.24,
    dynamicLights: 6,
    snowCount: 550,
    emberCount: 220,
    grassCount: 8000,
    cloudLayers: 2,
    iceReflection: false,
    sharpness: 0.11,
  },
  high: {
    tier: 'high',
    label: '精致',
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.45),
    shadowMapSize: 2048,
    aoEnabled: true,
    aoSamples: 10,
    volumetricFog: true,
    volumetricSteps: 10,
    bloomEnabled: true,
    bloomStrength: 0.26,
    dynamicLights: 8,
    snowCount: 800,
    emberCount: 300,
    grassCount: 14000,
    cloudLayers: 3,
    iceReflection: true,
    sharpness: 0.13,
  },
  ultra: {
    tier: 'ultra',
    label: '极高',
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.65),
    shadowMapSize: 2048,
    aoEnabled: true,
    aoSamples: 14,
    volumetricFog: true,
    volumetricSteps: 14,
    bloomEnabled: true,
    bloomStrength: 0.28,
    dynamicLights: 10,
    snowCount: 1100,
    emberCount: 420,
    grassCount: 18000,
    cloudLayers: 4,
    iceReflection: true,
    sharpness: 0.14,
  },
};

export function detectInitialQuality(): QualityConfig {
  const params = new URLSearchParams(window.location.search);
  const qParam = params.get('q') as QualityTier | null;
  if (qParam && QUALITY_PRESETS[qParam]) {
    return QUALITY_PRESETS[qParam];
  }

  const saved = localStorage.getItem('huimeng.quality.v4') as QualityTier | null;
  if (saved && QUALITY_PRESETS[saved]) {
    return QUALITY_PRESETS[saved];
  }

  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 820;
  if (isMobile) return QUALITY_PRESETS.low;

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const rendererStr = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
      if (/SwiftShader|Software|llvmpipe/i.test(rendererStr)) {
        return QUALITY_PRESETS.medium;
      }
      if (/Apple M|RTX|Radeon RX|GeForce/i.test(rendererStr)) {
        return QUALITY_PRESETS.high;
      }
    }
  } catch {
    // Ignore WebGL probe errors
  }

  return QUALITY_PRESETS.high;
}
