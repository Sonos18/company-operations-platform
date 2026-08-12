import { ref } from 'vue'

export function createJourneyState(stageIds: string[], actualCurrentStageId: string) {
  const focusedStageId = ref(actualCurrentStageId)

  const focusStage = (id: string) => {
    if (stageIds.includes(id)) focusedStageId.value = id
  }

  const move = (offset: number) => {
    const currentIndex = stageIds.indexOf(focusedStageId.value)
    const nextIndex = Math.max(0, Math.min(stageIds.length - 1, currentIndex + offset))
    const nextId = stageIds[nextIndex]
    if (nextId) focusStage(nextId)
  }

  return {
    actualCurrentStageId,
    focusedStageId,
    focusStage,
    focusPrevious: () => move(-1),
    focusNext: () => move(1),
    returnToCurrent: () => focusStage(actualCurrentStageId),
  }
}
