const ranks = { active: 0, paused: 1, unknown: 2, completed: 3 } as const

export function compareProjectDirectoryEntries(
  left: { projectId: string, operationalState: keyof typeof ranks, updatedAt: string },
  right: { projectId: string, operationalState: keyof typeof ranks, updatedAt: string },
): number {
  return ranks[left.operationalState] - ranks[right.operationalState]
    || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    || fractionalMicros(right.updatedAt) - fractionalMicros(left.updatedAt)
    || left.projectId.localeCompare(right.projectId)
}

function fractionalMicros(value: string): number {
  return Number((value.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0').slice(3, 6))
}
