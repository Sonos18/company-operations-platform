import type { RepositoryRegistry } from '../repositories/contracts'

export function useRepositories(): RepositoryRegistry {
  const repositories = useNuxtApp().$repositories
  if (!repositories) {
    throw new Error('Kho dữ liệu thử nghiệm chưa được khởi tạo.')
  }
  return repositories
}
