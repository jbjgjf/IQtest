import { visualDistance, VISUAL_DISTANCE_THRESHOLD } from '../matrixUtils';

describe('visualDistance', () => {
  it('keeps similar cells below threshold', () => {
    const base = { shape: 'square', rotation: 0, fill: '#3366ff' };
    const similar = { shape: 'square', rotation: 90, fill: '#3164f0' };

    expect(visualDistance(base, similar)).toBeLessThan(VISUAL_DISTANCE_THRESHOLD);
  });

  it('pushes dissimilar cells above threshold', () => {
    const base = { shape: 'square', rotation: 0, fill: '#3366ff' };
    const different = {
      shape: 'triangle',
      rotation: 180,
      fill: '#ff6633',
      accent: { shape: 'dot', position: 'tr', color: '#ff0000' },
      stripe: { enabled: true, angle: 90, width: 1, gap: 0.2 },
    };

    expect(visualDistance(base, different)).toBeGreaterThanOrEqual(VISUAL_DISTANCE_THRESHOLD);
  });
});
