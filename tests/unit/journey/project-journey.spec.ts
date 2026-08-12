import { describe, expect, it } from 'vitest'
import { createJourneyState } from '../../../app/composables/useProjectJourney'

describe('project journey focus', () => {
  it('browses another stage without changing the actual current stage', () => {
    const state = createJourneyState(['survey', 'design', 'construction'], 'construction')
    state.focusStage('design')
    expect(state.focusedStageId.value).toBe('design')
    expect(state.actualCurrentStageId).toBe('construction')
    state.returnToCurrent()
    expect(state.focusedStageId.value).toBe('construction')
  })

  it('does not move beyond either end of the journey', () => {
    const state = createJourneyState(['survey', 'design'], 'survey')
    state.focusPrevious()
    expect(state.focusedStageId.value).toBe('survey')
    state.focusStage('design')
    state.focusNext()
    expect(state.focusedStageId.value).toBe('design')
  })
})
