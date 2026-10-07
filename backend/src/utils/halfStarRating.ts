/**
 * Half-star ratings are 0.5 through 5.0.
 * Compare in half-steps so a float remainder cannot reject a valid 0.5 step.
 */
export function isHalfStarRating(rating: number): boolean {
  if (!Number.isFinite(rating)) {
    return false;
  }
  const halves = Math.round(rating * 2);
  return halves >= 1 && halves <= 10 && Math.abs(rating * 2 - halves) < 1e-6;
}
