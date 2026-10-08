/**
 * Group badges that can share one evaluator query.
 * Threshold is per badge. Every other criteria field (type, genre, field)
 * changes the query, so it is part of the group key.
 */

export function evaluationGroupKey(
  criteria: Record<string, unknown> | null | undefined
): string | null {
  if (!criteria || typeof criteria.type !== 'string' || criteria.type.length === 0) {
    return null;
  }

  return Object.keys(criteria)
    .filter((key) => key !== 'threshold')
    .sort()
    .map((key) => `${key}=${String(criteria[key]).toLowerCase()}`)
    .join('|');
}

export function groupBadgesForEvaluation<T extends { criteria?: Record<string, unknown> }>(
  badges: T[]
): { groups: Map<string, T[]>; withoutCriteria: T[] } {
  const groups = new Map<string, T[]>();
  const withoutCriteria: T[] = [];

  for (const badge of badges) {
    const key = evaluationGroupKey(badge.criteria);
    if (!key) {
      withoutCriteria.push(badge);
      continue;
    }
    const existing = groups.get(key);
    if (existing) {
      existing.push(badge);
    } else {
      groups.set(key, [badge]);
    }
  }

  return { groups, withoutCriteria };
}

/**
 * Fail the job when a grouped badge would be scored with someone else's query.
 */
export function assertEvaluationGroup(
  groupKey: string,
  badges: Array<{ id: string; criteria?: Record<string, unknown> }>
): void {
  for (const badge of badges) {
    if (evaluationGroupKey(badge.criteria) !== groupKey) {
      throw new Error(`Badge ${badge.id} criteria do not match evaluation group '${groupKey}'`);
    }
  }
}
