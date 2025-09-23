import { canonicalMatrixKeyV2 } from '../matrixUtils';

test('canonical key collapses visually-equal rotations', () => {
  const a = JSON.stringify({ shape: 'square', rotation: 0, fill: '#000' });
  const b = JSON.stringify({ shape: 'square', rotation: 90, fill: '#000' });
  const c = JSON.stringify({ shape: 'square', rotation: 180, fill: '#000' });

  const ka = canonicalMatrixKeyV2(a);
  const kb = canonicalMatrixKeyV2(b);
  const kc = canonicalMatrixKeyV2(c);

  expect(ka).toBe(kb);
  expect(kb).toBe(kc);
});
