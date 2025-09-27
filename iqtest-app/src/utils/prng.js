const normalizeSeed = (value) => {
  if (typeof value !== 'number') {
    return 0;
  }
  return value >>> 0;
};

export const mulberry32 = (seedNumber) => {
  let t = normalizeSeed(seedNumber);
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

export const hashStringToSeed = (value) => {
  if (typeof value !== 'string' || value.length === 0) {
    return 0;
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
    hash >>>= 0;
  }
  return hash >>> 0;
};

export const pickOne = (rng, array) => {
  if (!Array.isArray(array) || array.length === 0) {
    return undefined;
  }
  const fn = typeof rng === 'function' ? rng : Math.random;
  const index = Math.floor(fn() * array.length);
  return array[index];
};

export const shuffleInPlace = (rng, array) => {
  const fn = typeof rng === 'function' ? rng : Math.random;
  const target = array;
  for (let i = target.length - 1; i > 0; i -= 1) {
    const j = Math.floor(fn() * (i + 1));
    [target[i], target[j]] = [target[j], target[i]];
  }
  return target;
};

const prng = {
  mulberry32,
  hashStringToSeed,
  pickOne,
  shuffleInPlace,
};

export default prng;
