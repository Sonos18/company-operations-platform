import { ref, watch, type Ref } from 'vue'
import type { ProjectStage } from '../features/journey/journey.types'
import type { ProjectMedia } from '../features/media/media.types'
import type { MediaRepository } from '../repositories/contracts'

export function useStageMedia(
  stage: Ref<ProjectStage>,
  focused: Ref<boolean>,
  repository: Pick<MediaRepository, 'listByStage'>,
) {
  const media = ref<ProjectMedia[]>([])
  const pending = ref(false)
  const error = ref('')
  let mediaRequest = 0

  watch(
    [focused, () => stage.value.id],
    async ([isFocused]) => {
      const request = ++mediaRequest
      media.value = []
      error.value = ''
      pending.value = false
      if (!isFocused || stage.value.visualKind !== 'construction_comparison') return

      pending.value = true
      try {
        const result = await repository.listByStage(stage.value.id)
        if (request === mediaRequest) media.value = result
      } catch {
        if (request === mediaRequest) error.value = 'Không thể tải hình ảnh của giai đoạn này.'
      } finally {
        if (request === mediaRequest) pending.value = false
      }
    },
    { immediate: true },
  )

  return { media, pending, error }
}
