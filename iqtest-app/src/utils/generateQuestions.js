import {
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
} from './sequenceGenerators';
import { shuffleInPlace } from './prng';

const DEFAULT_TIME_LIMIT = 30;
const DEFAULT_WEIGHT = 1.0;
const DEFAULT_VISIBLE_LENGTH = 5;

const ensureRng = (rng) => (typeof rng === 'function' ? rng : Math.random);

const randomInt = (rng, min, max) => {
  const fn = ensureRng(rng);
  return Math.floor(fn() * (max - min + 1)) + min;
};

const buildQuestion = ({ sequence, answer, id, difficulty, rng }) => {
  const fn = ensureRng(rng);
  const text = `${sequence.join(', ')}, ?`;

  const varianceBase = Math.max(3, Math.abs(answer));
  const distractors = new Set();
  while (distractors.size < 2) {
    const magnitude = Math.max(1, Math.round(varianceBase * fn() * 0.4));
    const direction = fn() < 0.5 ? -1 : 1;
    const candidate = answer + direction * magnitude;
    if (candidate !== answer) {
      distractors.add(candidate);
    }
  }

  const optionPool = [answer, ...distractors];
  shuffleInPlace(fn, optionPool);

  return {
    id,
    kind: 'sequence',
    text,
    options: optionPool,
    answer,
    timeLimitSec: DEFAULT_TIME_LIMIT,
    weight: DEFAULT_WEIGHT,
    difficulty,
  };
};

const easyGenerators = [
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
];

const mediumGenerators = [
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
];

const hardGenerators = [
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
];

const generatorsByDifficulty = {
  easy: easyGenerators,
  medium: mediumGenerators,
  hard: hardGenerators,
};

const pickGenerators = (count, difficulty, rng) => {
  const generators = generatorsByDifficulty[difficulty] ?? [];
  if (count <= 0 || generators.length === 0) {
    return [];
  }
  const picks = [];
  for (let i = 0; i < count; i += 1) {
    const index = randomInt(rng, 0, generators.length - 1);
    picks.push({ generator: generators[index], difficulty });
  }
  return picks;
};

const DEFAULT_DIFFICULTY = 'easy';

export const generatePack = (
  count = 30,
  mixDifficulties = true,
  selectedDifficulty = DEFAULT_DIFFICULTY,
  opts = {}
) => {
  const rng = ensureRng(opts.rng);
  const difficultyOrder = ['easy', 'medium', 'hard'];
  const allocations = { easy: 0, medium: 0, hard: 0 };

  if (mixDifficulties) {
    const base = Math.floor(count / difficultyOrder.length);
    difficultyOrder.forEach((difficulty) => {
      allocations[difficulty] = base;
    });
    let remainder = count - base * difficultyOrder.length;
    let index = 0;
    while (remainder > 0) {
      allocations[difficultyOrder[index % difficultyOrder.length]] += 1;
      remainder -= 1;
      index += 1;
    }
  } else {
    const difficulty = difficultyOrder.includes(selectedDifficulty)
      ? selectedDifficulty
      : DEFAULT_DIFFICULTY;
    allocations[difficulty] = count;
  }

  const selectedGenerators = [];
  difficultyOrder.forEach((difficulty) => {
    selectedGenerators.push(...pickGenerators(allocations[difficulty], difficulty, rng));
  });

  shuffleInPlace(rng, selectedGenerators);

  const questions = selectedGenerators.map(({ generator, difficulty }, index) => {
    const { sequence, answer } = generator(DEFAULT_VISIBLE_LENGTH, rng);
    const id = `seq-${index + 1}`;
    return buildQuestion({
      sequence,
      answer,
      id,
      difficulty,
      rng,
    });
  });

  const normalizedDifficulty = difficultyOrder.includes(selectedDifficulty)
    ? selectedDifficulty
    : DEFAULT_DIFFICULTY;
  const packDifficulty = mixDifficulties ? 'mixed' : normalizedDifficulty;

  return {
    version: 'v1',
    title: 'Generated Arithmetic Pack',
    difficulty: packDifficulty,
    questions,
  };
};

export default generatePack;
