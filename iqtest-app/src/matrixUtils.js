const SHAPES = ['square', 'circle', 'triangle', 'diamond'];
const ACCENTS = ['none', 'dot', 'bar', 'cross', 'slash'];
const COLORS = ['#2563eb', '#22c55e', '#f97316', '#a855f7', '#0ea5e9', '#ef4444'];

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
