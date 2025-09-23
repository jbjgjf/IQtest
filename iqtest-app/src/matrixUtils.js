const SHAPES = ['square', 'circle', 'triangle', 'diamond'];
const ACCENTS = ['none', 'dot', 'bar', 'cross', 'slash'];
const COLORS = ['#2563eb', '#22c55e', '#f97316', '#a855f7', '#0ea5e9', '#ef4444'];

const ROTATION_PERIOD_MAP = new Map([
  ['triangle', 120],
  ['tri', 120],
  ['triangular', 120],
  ['square', 90],
  ['diamond', 90],
  ['plus', 90],
  ['cross', 90],
  ['x', 90],
]);

const DEFAULT_FILL_COLOR = '#4b5563';
const DEFAULT_ACCENT_COLOR = '#1f2937';

const clamp01 = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const normalizeHue = (value) => {
  if (!Number.isFinite(value)) return 0;
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const hexToRgb = (hex) => {
  if (typeof hex !== 'string') return null;
  const trimmed = hex.trim();
  if (!trimmed.startsWith('#')) return null;
  const value = trimmed.slice(1);
  if (![3, 6].includes(value.length)) return null;
  const sized = value.length === 3
    ? value.split('').map((ch) => ch + ch).join('')
    : value;
  const intVal = parseInt(sized, 16);
  if (Number.isNaN(intVal)) return null;
  const r = (intVal >> 16) & 0xff;
  const g = (intVal >> 8) & 0xff;
  const b = intVal & 0xff;
  return { r, g, b };
};

const rgbToHsv = ({ r, g, b }) => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    switch (max) {
      case rn:
        h = ((gn - bn) / delta) % 6;
        break;
      case gn:
        h = (bn - rn) / delta + 2;
        break;
      default:
        h = (rn - gn) / delta + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { hue: normalizeHue(h), sat: clamp01(s), val: clamp01(v) };
};

const normalizeColor = (value, fallbackHex) => {
  if (value && typeof value === 'object') {
    const hue = normalizeHue(value.h ?? value.hue ?? 0);
    const sat = clamp01(value.s ?? value.sat ?? value.saturation ?? 0);
    const val = clamp01(value.v ?? value.val ?? value.value ?? 0);
    return { hue, sat, val };
  }

  if (typeof value === 'string') {
    const rgb = hexToRgb(value) ?? hexToRgb(fallbackHex);
    if (rgb) {
      return rgbToHsv(rgb);
    }
  }

  const fallbackRgb = hexToRgb(fallbackHex) ?? { r: 128, g: 128, b: 128 };
  return rgbToHsv(fallbackRgb);
};

const normalizeRotationForShape = (rotation, shape) => {
  const quantized = Math.round((Number.isFinite(rotation) ? rotation : 0) / 90) * 90;
  const normalized = ((quantized % 360) + 360) % 360;
  const period = ROTATION_PERIOD_MAP.get(shape) ?? 0;
  if (!period) return normalized;
  return normalized % period;
};

const normalizeCornerRadius = (value) => {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value / 4) * 4;
  return Math.max(0, Math.min(12, rounded));
};

const normalizeStrokeWidth = (value, strokeEnabled) => {
  if (!strokeEnabled) return 0;
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(2, Math.round(value)));
};

const parseAccent = (cell) => {
  const accent = cell?.accent;
  const accentShape = typeof accent === 'string'
    ? accent
    : typeof accent === 'object'
      ? accent.shape ?? accent.type ?? accent.kind
      : cell?.accentShape ?? cell?.accentKind ?? 'none';
  const enabled = Boolean(
    typeof accent === 'object'
      ? accent.enabled ?? true
      : accentShape && accentShape !== 'none'
  );
  const position = (typeof accent === 'object' && accent.position)
    || cell?.accentPosition
    || 'center';

  const colorSource = (typeof accent === 'object' && (accent.color ?? accent.fill))
    || cell?.accentColor
    || DEFAULT_ACCENT_COLOR;

  const normalizedColor = normalizeColor(colorSource, DEFAULT_ACCENT_COLOR);

  return {
    enabled,
    shape: enabled ? String(accentShape ?? 'dot').toLowerCase() : 'none',
    position: String(position ?? 'center').toLowerCase(),
    hue: normalizedColor.hue,
    sat: normalizedColor.sat,
    val: normalizedColor.val,
  };
};

const parseStripe = (cell) => {
  const stripe = cell?.stripe ?? cell?.stripes ?? {};
  const enabled = Boolean(
    typeof stripe === 'object'
      ? stripe.enabled ?? stripe.active ?? false
      : stripe
  );
  const angleRaw = Number.isFinite(stripe.angle)
    ? stripe.angle
    : Number.isFinite(stripe.rotation)
      ? stripe.rotation
      : 0;
  const normalizedAngle = ((angleRaw % 180) + 180) % 180;
  const widthRaw = Number.isFinite(stripe.width) ? stripe.width : stripe.thickness;
  const gapRaw = Number.isFinite(stripe.gap) ? stripe.gap : stripe.spacing;

  return {
    enabled,
    angle: enabled ? Math.round(normalizedAngle / 15) * 15 : 0,
    width: enabled ? clamp01(widthRaw ?? 0.5) : 0,
    gap: enabled ? clamp01(gapRaw ?? 0.5) : 0,
  };
};

const sortKeysDeep = (value) => {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeysDeep(value[key]);
        return acc;
      }, {});
  }
  return value;
};

const buildVisualFeatures = (spec) => {
  if (spec && spec.__vf) {
    return spec;
  }

  let cell = spec;
  if (typeof spec === 'string') {
    try {
      cell = JSON.parse(spec);
    } catch (error) {
      cell = {};
    }
  }

  if (!cell || typeof cell !== 'object') {
    cell = {};
  }

  const shape = String(cell.shape ?? cell.type ?? 'unknown').toLowerCase();
  const rotation = normalizeRotationForShape(cell.rotation ?? cell.rot ?? 0, shape);
  const flip = Boolean(cell.flip ?? cell.invert ?? false);
  const stroke = Boolean(cell.stroke ?? false);
  const strokeWidth = normalizeStrokeWidth(cell.strokeWidth, stroke);
  const cornerRadius = normalizeCornerRadius(cell.cornerRadius ?? 0);
  const fillColor = normalizeColor(cell.fill ?? cell.color ?? DEFAULT_FILL_COLOR, DEFAULT_FILL_COLOR);
  const accent = parseAccent(cell);
  const stripe = parseStripe(cell);

  return Object.freeze({
    __vf: true,
    shape,
    rotation,
    flip,
    stroke,
    strokeWidth,
    cornerRadius,
    fill: fillColor,
    accent,
    stripe,
  });
};

export const VISUAL_DISTANCE_THRESHOLD = 1.5;

export function canonicalMatrixKeyV2(spec) {
  const features = buildVisualFeatures(spec);
  const keyPayload = {
    shape: features.shape,
    rotation: features.rotation,
    flip: features.flip,
    stroke: features.stroke,
    strokeWidth: features.strokeWidth,
    cornerRadius: features.cornerRadius,
    fill: features.fill,
    accent: features.accent,
    stripe: features.stripe,
  };
  return JSON.stringify(sortKeysDeep(keyPayload));
}

const colorDistance = (a, b) => {
  if (!a || !b) return 0;
  const dhRaw = Math.abs((a.hue ?? 0) - (b.hue ?? 0));
  const dh = Math.min(dhRaw, 360 - dhRaw) / 180;
  const ds = Math.abs((a.sat ?? 0) - (b.sat ?? 0));
  const dv = Math.abs((a.val ?? 0) - (b.val ?? 0));
  return 0.4 * dh + 0.3 * ds + 0.3 * dv;
};

export const toVisualFeatures = (spec) => buildVisualFeatures(spec);

export function visualDistance(aSpec, bSpec) {
  const a = buildVisualFeatures(aSpec);
  const b = buildVisualFeatures(bSpec);

  let distance = 0;

  distance += a.shape === b.shape ? 0 : 1;

  const rotationDiff = Math.abs(a.rotation - b.rotation) % 360;
  const minimumRotation = Math.min(rotationDiff, 360 - rotationDiff);
  if (minimumRotation === 90 || minimumRotation === 270) {
    distance += 0.5;
  } else if (minimumRotation === 180) {
    distance += 0.75;
  }

  distance += colorDistance(a.fill, b.fill);

  if (a.flip !== b.flip) distance += 0.25;
  if (a.stroke !== b.stroke) distance += 0.25;
  if (Math.abs(a.strokeWidth - b.strokeWidth) >= 1) distance += 0.25;
  if (Math.abs(a.cornerRadius - b.cornerRadius) >= 4) distance += 0.25;

  if (a.accent.enabled !== b.accent.enabled) {
    distance += 0.5;
  }

  if (a.accent.enabled || b.accent.enabled) {
    if (a.accent.shape !== b.accent.shape) distance += 0.5;
    if (a.accent.position !== b.accent.position) distance += 0.5;
    if (colorDistance(a.accent, b.accent) > 0.3) distance += 0.3;
  }

  if (a.stripe.enabled !== b.stripe.enabled) {
    distance += 0.5;
  }

  if (a.stripe.enabled && b.stripe.enabled) {
    const stripeAngleDiff = Math.abs(a.stripe.angle - b.stripe.angle) % 180;
    const normalizedStripeAngle = Math.min(stripeAngleDiff, 180 - stripeAngleDiff);
    if (normalizedStripeAngle >= 45) distance += 0.3;
    if (Math.abs(a.stripe.width - b.stripe.width) >= 0.1) distance += 0.3;
    if (Math.abs(a.stripe.gap - b.stripe.gap) >= 0.1) distance += 0.3;
  }

  return distance;
}

function mulberry32(a) {
  let t = a + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rngFrom(seed) {
  return () => mulberry32(seed++);
}

export function generateMatrixCell(seed, row, col) {
  const baseSeed = seed * 97 + row * 31 + col * 17;
  const rand = rngFrom(baseSeed);

  const shapeIndex = (Math.floor(rand() * SHAPES.length) + row + col + seed) % SHAPES.length;
  const accentIndex = Math.floor(rand() * ACCENTS.length);
  const colorIndex = (Math.floor(rand() * COLORS.length) + row) % COLORS.length;
  const accentColorIndex = (colorIndex + 2 + col) % COLORS.length;

  const rotationSteps = (Math.floor(rand() * 4) + col + seed) % 4;
  const baseScale = 0.55 + rand() * 0.35;
  const scale = Number(clamp(baseScale + row * 0.05 - col * 0.03, 0.45, 0.9).toFixed(2));
  const invert = ((seed + row + col + Math.floor(rand() * 10)) % 2) === 0;
  const stroke = ((seed + row * 5 + col * 3) % 3) === 0;

  return {
    shape: SHAPES[shapeIndex],
    accent: ACCENTS[accentIndex],
    rotation: rotationSteps * 90,
    scale,
    invert,
    fill: COLORS[colorIndex],
    accentColor: COLORS[accentColorIndex],
    stroke,
  };
}

export function serializeCell(cell) {
  return JSON.stringify(cell);
}

export function parseCell(serialized) {
  try {
    const parsed = JSON.parse(serialized);
    return parsed;
  } catch (error) {
    return null;
  }
}

export function mutateCell(cell, variantSeed) {
  const rand = rngFrom(variantSeed + 12345);
  const mutated = { ...cell };
  const props = ['shape', 'rotation', 'scale', 'invert', 'accent', 'fill', 'accentColor', 'stroke'];
  const chosen = props[Math.floor(rand() * props.length)];

  switch (chosen) {
    case 'shape': {
      const currentIndex = SHAPES.indexOf(mutated.shape);
      mutated.shape = SHAPES[(currentIndex + 1 + Math.floor(rand() * (SHAPES.length - 1))) % SHAPES.length];
      break;
    }
    case 'rotation': {
      const rotationOptions = [0, 90, 180, 270].filter((angle) => angle !== mutated.rotation);
      mutated.rotation = rotationOptions[Math.floor(rand() * rotationOptions.length)];
      break;
    }
    case 'scale': {
      const delta = (rand() - 0.5) * 0.3;
      mutated.scale = Number(clamp(mutated.scale + delta, 0.4, 0.95).toFixed(2));
      break;
    }
    case 'invert': {
      mutated.invert = !mutated.invert;
      break;
    }
    case 'accent': {
      const currentIndex = ACCENTS.indexOf(mutated.accent);
      mutated.accent = ACCENTS[(currentIndex + 1 + Math.floor(rand() * (ACCENTS.length - 1))) % ACCENTS.length];
      break;
    }
    case 'fill': {
      const currentIndex = COLORS.indexOf(mutated.fill);
      mutated.fill = COLORS[(currentIndex + 1 + Math.floor(rand() * (COLORS.length - 1))) % COLORS.length];
      break;
    }
    case 'accentColor': {
      const currentIndex = COLORS.indexOf(mutated.accentColor);
      mutated.accentColor = COLORS[(currentIndex + 2 + Math.floor(rand() * (COLORS.length - 1))) % COLORS.length];
      break;
    }
    case 'stroke': {
      mutated.stroke = !mutated.stroke;
      break;
    }
    default:
      break;
  }

  return mutated;
}

export function buildMatrixOptions(seed) {
  const correctCell = generateMatrixCell(seed, 2, 2);
  const answer = serializeCell(correctCell);
  const optionsSet = new Set([answer]);

  let variantSeed = seed + 5;
  while (optionsSet.size < 6) {
    const mutated = mutateCell(correctCell, variantSeed);
    const serialized = serializeCell(mutated);
    if (!optionsSet.has(serialized)) {
      optionsSet.add(serialized);
    }
    variantSeed += 13;
  }

  return { options: Array.from(optionsSet), answer };
}

export function shuffleArray(input) {
  const array = [...input];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
