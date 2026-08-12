export function usePrototypeReset() {
  const repositories = useRepositories()
  const resetting = ref(false)

  async function resetPrototype() {
    const confirmed = window.confirm('Khôi phục toàn bộ dữ liệu thử nghiệm về trạng thái ban đầu?')
    if (!confirmed) return false

    resetting.value = true
    try {
      await repositories.prototype.reset()
      await refreshNuxtData()
      return true
    } finally {
      resetting.value = false
    }
  }

  return { resetting: readonly(resetting), resetPrototype }
}
