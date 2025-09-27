const DEFAULT_LENGTH = 5;

const ensureRng = (rng) => (typeof rng === 'function' ? rng : Math.random);

const randomInt = (rng, min, max) => {
  const fn = ensureRng(rng);
  return Math.floor(fn() * (max - min + 1)) + min;
};

const factorial = (n) => {
  let result = 1;
  for (let i = 2; i <= n; i += 1) {
    result *= i;
  }
  return result;
};

const isPrime = (value) => {
  if (value < 2) return false;
  for (let i = 2; i * i <= value; i += 1) {
    if (value % i === 0) {
      return false;
    }
  }
  return true;
};

const nextPrime = (start) => {
  let candidate = start + 1;
  while (!isPrime(candidate)) {
    candidate += 1;
  }
  return candidate;
};

const buildSequence = (sequence, answer) => ({ sequence, answer });

// Easy Level
const generateArithmeticSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const first = randomInt(rng, 1, 10);
  const diff = randomInt(rng, 1, 5);
  const sequence = Array.from({ length: count }, (_, index) => first + diff * index);
  const answer = first + diff * count;
  return buildSequence(sequence, answer);
};

const generateGeometricSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const first = randomInt(rng, 1, 5);
  const ratio = randomInt(rng, 2, 5);
  const sequence = Array.from({ length: count }, (_, index) => first * ratio ** index);
  const answer = sequence[count - 1] * ratio;
  return buildSequence(sequence, answer);
};

const generateEvenNumberSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const start = randomInt(rng, 1, 5) * 2;
  const sequence = Array.from({ length: count }, (_, index) => start + index * 2);
  const answer = sequence[count - 1] + 2;
  return buildSequence(sequence, answer);
};

const generateOddNumberSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const start = randomInt(rng, 0, 4) * 2 + 1;
  const sequence = Array.from({ length: count }, (_, index) => start + index * 2);
  const answer = sequence[count - 1] + 2;
  return buildSequence(sequence, answer);
};

const generateSquareNumberSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const startN = randomInt(rng, 2, 6);
  const sequence = Array.from({ length: count }, (_, index) => {
    const n = startN + index;
    return n * n;
  });
  const nAnswer = startN + count;
  const answer = nAnswer * nAnswer;
  return buildSequence(sequence, answer);
};

const generateCubicNumberSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const startN = randomInt(rng, 2, 4);
  const sequence = Array.from({ length: count }, (_, index) => {
    const n = startN + index;
    return n ** 3;
  });
  const answer = (startN + count) ** 3;
  return buildSequence(sequence, answer);
};

const generateAlternatingAddSubtract1Sequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const start = randomInt(rng, 5, 20);
  const sequence = [start];
  let current = start;
  for (let step = 0; step < count - 1; step += 1) {
    const isAdd = step % 2 === 0;
    current = isAdd ? current + 2 : current - 1;
    sequence.push(current);
  }
  const nextStepIndex = count - 1;
  const nextIsAdd = nextStepIndex % 2 === 0;
  const answer = nextIsAdd ? current + 2 : current - 1;
  return buildSequence(sequence, answer);
};

const generateAlternatingAddSubtract2Sequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const start = randomInt(rng, 5, 25);
  const addStep = randomInt(rng, 4, 7);
  const subtractStep = Math.max(1, addStep - 2);
  const sequence = [start];
  let current = start;
  for (let step = 0; step < count - 1; step += 1) {
    const isAdd = step % 2 === 0;
    current = isAdd ? current + addStep : current - subtractStep;
    sequence.push(current);
  }
  const nextStepIndex = count - 1;
  const nextIsAdd = nextStepIndex % 2 === 0;
  const answer = nextIsAdd ? current + addStep : current - subtractStep;
  return buildSequence(sequence, answer);
};

const generateMultiplesOfThreeSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const start = randomInt(rng, 1, 10) * 3;
  const sequence = Array.from({ length: count }, (_, index) => start + index * 3);
  const answer = sequence[count - 1] + 3;
  return buildSequence(sequence, answer);
};

const generateMultiplesOfFiveSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const start = randomInt(rng, 1, 10) * 5;
  const sequence = Array.from({ length: count }, (_, index) => start + index * 5);
  const answer = sequence[count - 1] + 5;
  return buildSequence(sequence, answer);
};

// Medium Level
const generateFibonacciVariantSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(2, length);
  const seeds = [
    [1, 1],
    [2, 3],
  ];
  const seedIndex = randomInt(rng, 0, seeds.length - 1);
  const [first, second] = seeds[seedIndex];
  const sequence = [first, second];
  while (sequence.length < count) {
    const len = sequence.length;
    sequence.push(sequence[len - 1] + sequence[len - 2]);
  }
  const answer = sequence[sequence.length - 1] + sequence[sequence.length - 2];
  return buildSequence(sequence, answer);
};

const generateTribonacciSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(3, length);
  const sequence = [randomInt(rng, 1, 3), randomInt(rng, 1, 3), randomInt(rng, 1, 3)];
  while (sequence.length < count) {
    const len = sequence.length;
    sequence.push(sequence[len - 1] + sequence[len - 2] + sequence[len - 3]);
  }
  const answer = sequence.slice(-3).reduce((sum, value) => sum + value, 0);
  return buildSequence(sequence, answer);
};

const generateDoubleIncrementSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const start = randomInt(rng, 1, 10);
  const factor = randomInt(rng, 2, 3);
  const sequence = Array.from({ length: count }, (_, index) => start * factor ** index);
  const answer = sequence[count - 1] * factor;
  return buildSequence(sequence, answer);
};

const generateMixedAddMultiplySequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const start = randomInt(rng, 2, 10);
  const addStep = randomInt(rng, 1, 5);
  const multiplyFactor = randomInt(rng, 2, 4);
  const sequence = [start];
  let current = start;
  for (let step = 0; step < count - 1; step += 1) {
    const isAdd = step % 2 === 0;
    current = isAdd ? current + addStep : current * multiplyFactor;
    sequence.push(current);
  }
  const nextStepIndex = count - 1;
  const nextIsAdd = nextStepIndex % 2 === 0;
  const answer = nextIsAdd ? current + addStep : current * multiplyFactor;
  return buildSequence(sequence, answer);
};

const generatePrimeSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const startingPrimes = [2, 3, 5, 7];
  const start = startingPrimes[randomInt(rng, 0, startingPrimes.length - 1)];
  const sequence = [start];
  while (sequence.length < count) {
    const next = nextPrime(sequence[sequence.length - 1]);
    sequence.push(next);
  }
  const answer = nextPrime(sequence[sequence.length - 1]);
  return buildSequence(sequence, answer);
};

const generateFactorialSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const startN = randomInt(rng, 1, 3);
  const sequence = Array.from({ length: count }, (_, index) => factorial(startN + index));
  const answer = factorial(startN + count);
  return buildSequence(sequence, answer);
};

const generateNSquaredPlusNSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const startN = randomInt(rng, 1, 6);
  const sequence = Array.from({ length: count }, (_, index) => {
    const n = startN + index;
    return n * n + n;
  });
  const nextN = startN + count;
  const answer = nextN * nextN + nextN;
  return buildSequence(sequence, answer);
};

const generateNSquaredMinusOneSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const startN = randomInt(rng, 2, 7);
  const sequence = Array.from({ length: count }, (_, index) => {
    const n = startN + index;
    return n * n - 1;
  });
  const nextN = startN + count;
  const answer = nextN * nextN - 1;
  return buildSequence(sequence, answer);
};

const generateAlternatingMultiplicationDivisionSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const start = randomInt(rng, 2, 12);
  const factor = randomInt(rng, 2, 4);
  const sequence = [start];
  let current = start;
  for (let step = 0; step < count - 1; step += 1) {
    const isMultiply = step % 2 === 0;
    current = isMultiply ? current * factor : current / factor;
    sequence.push(current);
  }
  const nextStepIndex = count - 1;
  const nextIsMultiply = nextStepIndex % 2 === 0;
  const answer = nextIsMultiply ? current * factor : current / factor;
  return buildSequence(sequence, answer);
};

const generateModuloPatternSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const cycleLength = randomInt(rng, 3, 5);
  const offset = randomInt(rng, 0, cycleLength - 1);
  const sequence = Array.from({ length: count }, (_, index) => ((index + offset) % cycleLength) + 1);
  const answer = ((count + offset) % cycleLength) + 1;
  return buildSequence(sequence, answer);
};

// Hard Level
const generateAlternatingRatiosSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const start = randomInt(rng, 1, 5);
  const ratios = [2, 3];
  const sequence = [start];
  let current = start;
  for (let step = 0; step < count - 1; step += 1) {
    current *= ratios[step % ratios.length];
    sequence.push(current);
  }
  const nextStepIndex = count - 1;
  const answer = current * ratios[nextStepIndex % ratios.length];
  return buildSequence(sequence, answer);
};

const generateAlternatingAddMultiplySequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const start = randomInt(rng, 3, 12);
  const addStep = randomInt(rng, 2, 6);
  const multiplyFactor = randomInt(rng, 2, 4);
  const sequence = [start];
  let current = start;
  for (let step = 0; step < count - 1; step += 1) {
    const isMultiply = step % 2 === 0;
    current = isMultiply ? current * multiplyFactor : current + addStep;
    sequence.push(current);
  }
  const nextStepIndex = count - 1;
  const nextIsMultiply = nextStepIndex % 2 === 0;
  const answer = nextIsMultiply ? current * multiplyFactor : current + addStep;
  return buildSequence(sequence, answer);
};

const generateIncreasingDifferenceSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const start = randomInt(rng, 5, 25);
  const baseDiff = randomInt(rng, 1, 4);
  const sequence = [start];
  let current = start;
  for (let step = 0; step < count - 1; step += 1) {
    const diff = baseDiff + step;
    current += diff;
    sequence.push(current);
  }
  const nextDiff = baseDiff + (count - 1);
  const answer = current + nextDiff;
  return buildSequence(sequence, answer);
};

const generateChangingRatioGeometricSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const start = randomInt(rng, 1, 4);
  const ratios = [2, 3];
  const sequence = [start];
  let current = start;
  for (let step = 0; step < count - 1; step += 1) {
    current *= ratios[step % ratios.length];
    sequence.push(current);
  }
  const nextStepIndex = count - 1;
  const answer = current * ratios[nextStepIndex % ratios.length];
  return buildSequence(sequence, answer);
};

const generateSquaresOfEvenNumbersSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const startEven = randomInt(rng, 1, 5) * 2;
  const sequence = Array.from({ length: count }, (_, index) => {
    const even = startEven + index * 2;
    return even ** 2;
  });
  const nextEven = startEven + count * 2;
  const answer = nextEven ** 2;
  return buildSequence(sequence, answer);
};

const generateCubesOfOddNumbersSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const startOdd = randomInt(rng, 1, 5) * 2 - 1;
  const sequence = Array.from({ length: count }, (_, index) => {
    const odd = startOdd + index * 2;
    return odd ** 3;
  });
  const nextOdd = startOdd + count * 2;
  const answer = nextOdd ** 3;
  return buildSequence(sequence, answer);
};

const generateSkippedFactorialsSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const startOdd = randomInt(rng, 1, 3) * 2 - 1;
  const sequence = Array.from({ length: count }, (_, index) => factorial(startOdd + index * 2));
  const answer = factorial(startOdd + count * 2);
  return buildSequence(sequence, answer);
};

const generateRepeatingCycleSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const start = randomInt(rng, 5, 20);
  const deltas = [1, 2, 3];
  const sequence = [start];
  let current = start;
  for (let step = 0; step < count - 1; step += 1) {
    current += deltas[step % deltas.length];
    sequence.push(current);
  }
  const nextDelta = deltas[(count - 1) % deltas.length];
  const answer = current + nextDelta;
  return buildSequence(sequence, answer);
};

const generatePrimePlusTwoSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const basePrimes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41];
  const startIndex = randomInt(rng, 0, 4);
  let current = basePrimes[startIndex];
  const sequence = [];
  for (let i = 0; i < count; i += 1) {
    sequence.push(current);
    const skipped = nextPrime(current);
    current = nextPrime(skipped);
  }
  const answer = nextPrime(nextPrime(sequence[sequence.length - 1]));
  return buildSequence(sequence, answer);
};

const generateHybridSquareCubeSequence = (length = DEFAULT_LENGTH, rng = Math.random) => {
  const count = Math.max(1, length);
  const startN = randomInt(rng, 2, 5);
  const sequence = [];
  let base = startN;
  for (let i = 0; i < count; i += 1) {
    if (i % 2 === 0) {
      sequence.push(base ** 2);
    } else {
      sequence.push(base ** 3);
      base += 1;
    }
  }
  const nextIndex = count;
  const answer = nextIndex % 2 === 0 ? base ** 2 : base ** 3;
  return buildSequence(sequence, answer);
};

export {
  generateArithmeticSequence,
  generateGeometricSequence,
  generateEvenNumberSequence,
  generateOddNumberSequence,
  generateSquareNumberSequence,
  generateCubicNumberSequence,
  generateAlternatingAddSubtract1Sequence,
  generateAlternatingAddSubtract2Sequence,
  generateMultiplesOfThreeSequence,
  generateMultiplesOfFiveSequence,
  generateFibonacciVariantSequence,
  generateTribonacciSequence,
  generateDoubleIncrementSequence,
  generateMixedAddMultiplySequence,
  generatePrimeSequence,
  generateFactorialSequence,
  generateNSquaredPlusNSequence,
  generateNSquaredMinusOneSequence,
  generateAlternatingMultiplicationDivisionSequence,
  generateModuloPatternSequence,
  generateAlternatingRatiosSequence,
  generateAlternatingAddMultiplySequence,
  generateIncreasingDifferenceSequence,
  generateChangingRatioGeometricSequence,
  generateSquaresOfEvenNumbersSequence,
  generateCubesOfOddNumbersSequence,
  generateSkippedFactorialsSequence,
  generateRepeatingCycleSequence,
  generatePrimePlusTwoSequence,
  generateHybridSquareCubeSequence,
};

const sequenceGeneratorMap = {
  generateArithmeticSequence,
  generateGeometricSequence,
  generateEvenNumberSequence,
  generateOddNumberSequence,
  generateSquareNumberSequence,
  generateCubicNumberSequence,
  generateAlternatingAddSubtract1Sequence,
  generateAlternatingAddSubtract2Sequence,
  generateMultiplesOfThreeSequence,
  generateMultiplesOfFiveSequence,
  generateFibonacciVariantSequence,
  generateTribonacciSequence,
  generateDoubleIncrementSequence,
  generateMixedAddMultiplySequence,
  generatePrimeSequence,
  generateFactorialSequence,
  generateNSquaredPlusNSequence,
  generateNSquaredMinusOneSequence,
  generateAlternatingMultiplicationDivisionSequence,
  generateModuloPatternSequence,
  generateAlternatingRatiosSequence,
  generateAlternatingAddMultiplySequence,
  generateIncreasingDifferenceSequence,
  generateChangingRatioGeometricSequence,
  generateSquaresOfEvenNumbersSequence,
  generateCubesOfOddNumbersSequence,
  generateSkippedFactorialsSequence,
  generateRepeatingCycleSequence,
  generatePrimePlusTwoSequence,
  generateHybridSquareCubeSequence,
};

export default sequenceGeneratorMap;
