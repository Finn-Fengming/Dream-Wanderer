export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityConfig {
  tier: QualityTier;
  label: string;
  pixelRatio: number;
  shadowMapSize: number;
  bloomEnabled: boolean;
  bloomStrength: number;
  snowCount: number;
  emberCount: number;
  cloudLayers: number;
  iceReflection: boolean;
}

export const QUALITY_PRESETS: Record<QualityTier, QualityConfig> = {
  low: {
    tier: 'low',
    label: '流畅',
    pixelRatio: 1.0,
    shadowMapSize: 512,
    bloomEnabled: false,
    bloomStrength: 0.0,
    snowCount: 260,
    emberCount: 100,
    cloudLayers: 1,
    iceReflection: false,
  },
  medium: {
    tier: 'medium',
    label: '均衡',
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.35),
    shadowMapSize: 1024,
    bloomEnabled: true,
    bloomStrength: 0.36,
    snowCount: 520,
    emberCount: 200,
    cloudLayers: 2,
    iceReflection: false,
  },
  high: {
    tier: 'high',
    label: '精致',
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.45),
    shadowMapSize: 1536,
    bloomEnabled: true,
    bloomStrength: 0.34,
    snowCount: 650,
    emberCount: 240,
    cloudLayers: 3,
    iceReflection: true,
  },
  ultra: {
    tier: 'ultra',
    label: '极高',
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.65),
    shadowMapSize: 2048,
    bloomEnabled: true,
    bloomStrength: 0.38,
    snowCount: 900,
    emberCount: 360,
    cloudLayers: 4,
    iceReflection: true,
  },
};

export function detectInitialQuality(): QualityConfig {
  const params = new URLSearchParams(window.location.search);
  const qParam = params.get('q') as QualityTier | null;
  if (qParam && QUALITY_PRESETS[qParam]) {
    return QUALITY_PRESETS[qParam];
  }

  const saved = localStorage.getItem('huimeng.quality.v1') as QualityTier | null;
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
