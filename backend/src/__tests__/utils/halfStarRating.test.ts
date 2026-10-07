import { isHalfStarRating } from '../../utils/halfStarRating';

describe('isHalfStarRating', () => {
  it('accepts 0.5 steps from 0.5 through 5 and rejects other numbers', () => {
    for (let halves = 1; halves <= 10; halves += 1) {
      expect(isHalfStarRating(halves / 2)).toBe(true);
    }
    expect(isHalfStarRating(0)).toBe(false);
    expect(isHalfStarRating(0.4)).toBe(false);
    expect(isHalfStarRating(5.5)).toBe(false);
    expect(isHalfStarRating(Number.NaN)).toBe(false);
  });
});
