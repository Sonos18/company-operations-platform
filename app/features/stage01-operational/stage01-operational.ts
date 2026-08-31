export function taxonomyLabel(
  entries: readonly { code: string, label: string }[],
  code: string | null | undefined,
): string {
  if (!code) return 'Chưa xác định'
  return entries.find(entry => entry.code === code)?.label ?? code
}

export function activeAssignments<T extends { endedAt: string | null }>(assignments: readonly T[]): T[] {
  return assignments.filter(assignment => assignment.endedAt === null)
}

export function openBlockers<T extends { resolvedAt: string | null }>(blockers: readonly T[]): T[] {
  return blockers.filter(blocker => blocker.resolvedAt === null)
}

export function latestCriterionRevision<T extends { criterionKey: string, revision: number }>(
  evaluations: readonly T[],
  criterionKey: string,
): T | null {
  return evaluations.reduce<T | null>((latest, evaluation) => {
    if (evaluation.criterionKey !== criterionKey) return latest
    return latest === null || evaluation.revision > latest.revision ? evaluation : latest
  }, null)
}

export function orderedDecisionCycles<T extends { cycleNo: number }>(cycles: readonly T[]): T[] {
  return [...cycles].sort((left, right) => left.cycleNo - right.cycleNo)
}
