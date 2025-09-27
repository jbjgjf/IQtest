import { sanitizeNickname, validateScorePayload } from '../data/scoreApi';

describe('sanitizeNickname', () => {
  it('trims leading and trailing whitespace', () => {
    expect(sanitizeNickname('  Alice  ')).toBe('Alice');
  });

  it('collapses internal whitespace to a single space', () => {
    expect(sanitizeNickname('A   B\tC')).toBe('A B C');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeNickname(undefined)).toBe('');
  });
});

describe('validateScorePayload', () => {
  const base = { nickname: 'Tester', score: 10, difficulty: 'easy', iq: 95 };

  it('returns sanitized values for a valid payload', () => {
    const result = validateScorePayload({ ...base, nickname: '  Tester  ' });
    expect(result).toEqual({
      nickname: 'Tester',
      score: 10,
      difficulty: 'easy',
      iq: 95,
    });
  });

  it.each([
    { nickname: '', desc: 'empty nickname' },
    { nickname: ' '.repeat(30), desc: 'nickname only spaces' },
    { nickname: 'x'.repeat(25), desc: 'nickname too long' },
  ])('rejects invalid nickname: $desc', ({ nickname }) => {
    expect(() => validateScorePayload({ ...base, nickname })).toThrow('invalid nickname');
  });

  it.each([ -1, 10000, 1.5, NaN ])('rejects invalid score %s', (score) => {
    expect(() => validateScorePayload({ ...base, score })).toThrow('invalid score');
  });

  it.each(['', 'invalid', null, undefined])('rejects difficulty %s', (difficulty) => {
    expect(() => validateScorePayload({ ...base, difficulty })).toThrow('invalid difficulty');
  });

  it.each([NaN, Infinity, 'abc'])('rejects non-finite iq %s', (iq) => {
    expect(() => validateScorePayload({ ...base, iq })).toThrow('invalid iq');
  });
});
