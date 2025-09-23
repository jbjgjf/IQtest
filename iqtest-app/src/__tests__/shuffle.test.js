import { shuffleArray } from '../matrixUtils';

describe('shuffleArray', () => {
  it('returns a new array without mutating input', () => {
    const input = [1, 2, 3, 4, 5];
    const snapshot = [...input];

    const result = shuffleArray(input);

    expect(result).toHaveLength(input.length);
    expect(new Set(result)).toEqual(new Set(input));
    expect(result).not.toBe(input);
    expect(input).toEqual(snapshot);
  });
});
