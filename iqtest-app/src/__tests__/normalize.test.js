import { normalizeQuestion } from '../App';

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('normalizeQuestion', () => {
  it('sanitizes non-matrix questions without mutating source', () => {
    const raw = {
      id: 'seq-1',
      kind: 'sequence',
      difficulty: 'medium',
      options: [1, 3, '{"json":true}', '7', { label: 'bad' }],
      answerIndex: 1,
      answer: 3,
    };
    const originalOptions = [...raw.options];

    const normalized = normalizeQuestion(raw);

    expect(normalized.options).toEqual([1, 3, '7']);
    expect(normalized.options).not.toBe(raw.options);
    expect(raw.options).toEqual(originalOptions);
    expect(normalized.answer).toBe(3);
    expect(normalized.answerIndex).toBe(1);
  });

  it('produces eight unique matrix options and keeps answer', () => {
    const raw = {
      id: 'matrix-1',
      kind: 'matrix',
      seed: 42,
      candidates: [
        { variant: 101 },
        { variant: 102 },
        { variant: 103 },
        { variant: 104 },
        { variant: 105 },
        { variant: 106 },
      ],
      answerIndex: 0,
      options: [],
    };
    const originalCandidates = JSON.parse(JSON.stringify(raw.candidates));

    const normalized = normalizeQuestion(raw);

    expect(normalized.options).toHaveLength(8);
    expect(new Set(normalized.options).size).toBe(8);
    expect(normalized.options).toContain(normalized.answer);
    expect(normalized.options).not.toBe(raw.options);
    expect(raw.candidates).toEqual(originalCandidates);
  });
});
