import { canonicalMatrixKeyV2 } from '../matrixUtils';

describe('canonicalMatrixKeyV2', () => {
  it('collapses rotations that look identical', () => {
    const base = { shape: 'square', rotation: 0, fill: '#4455ff' };
    const quarterTurn = { shape: 'square', rotation: 90, fill: '#4455ff' };
    const halfTurn = { shape: 'square', rotation: 180, fill: '#4455ff' };

    const keyBase = canonicalMatrixKeyV2(base);
    const keyQuarter = canonicalMatrixKeyV2(quarterTurn);
    const keyHalf = canonicalMatrixKeyV2(halfTurn);

    expect(keyBase).toBe(keyQuarter);
    expect(keyQuarter).toBe(keyHalf);
  });

  it('differs when visual attributes change', () => {
    const a = { shape: 'square', rotation: 0, fill: '#4455ff' };
    const b = { shape: 'triangle', rotation: 0, fill: '#4455ff' };

    expect(canonicalMatrixKeyV2(a)).not.toBe(canonicalMatrixKeyV2(b));
  });
});
