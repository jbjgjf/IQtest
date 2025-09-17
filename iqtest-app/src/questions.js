import { buildMatrixOptions } from './matrixUtils';

const sequenceQuestions = [
  {
    id: 1,
    type: 'sequence',
    text: '2, 4, 6, 8, ?',
    options: ['10', '12', '14'],
    answer: '10',
  },
  {
    id: 2,
    type: 'algebra',
    text: '□ + 5 = 12. □ = ?',
    options: ['5', '7', '12'],
    answer: '7',
  },
];

function createMatrixQuestion(id, seed, text) {
  const { options, answer } = buildMatrixOptions(seed);
  return {
    id,
    type: 'matrix',
    svgSeed: seed,
    text,
    options,
    answer,
  };
}

const matrixQuestions = [
  createMatrixQuestion(3, 42, '空欄に入るピースを選択してください。'),
  createMatrixQuestion(4, 77, '規則に合う図形を選んでください。'),
];

const questions = [...sequenceQuestions, ...matrixQuestions];

export default questions;
export { parseCell, shuffleArray } from './matrixUtils';
