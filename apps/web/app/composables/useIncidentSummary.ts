export interface IncidentSummary {
  total: number
  open: number
  closed: number
}

export function useIncidentSummary() {
  const config = useRuntimeConfig()
  const apiBase = String(config.public.apiBase).replace(/\/+$/, '')
  const summary = ref<IncidentSummary | null>(null)
  const isSummaryLoading = ref(true)
  const summaryError = ref('')
  let requestId = 0

  async function refreshSummary() {
    const currentRequest = ++requestId
    isSummaryLoading.value = true
    summaryError.value = ''

    try {
      const payload = await $fetch<{ summary?: IncidentSummary }>(`${apiBase}/summary`, { retry: 0 })
      const counts = payload?.summary

      if (!counts || ![counts.total, counts.open, counts.closed].every(count => Number.isSafeInteger(count) && count >= 0)
        || counts.open + counts.closed > counts.total) {
        throw new Error('Resumen de incidencias inválido')
      }

      if (currentRequest === requestId) {
        summary.value = counts
      }
    } catch {
      if (currentRequest === requestId) {
        summaryError.value = 'No se pudo actualizar el resumen de incidencias.'
      }
    } finally {
      if (currentRequest === requestId) {
        isSummaryLoading.value = false
      }
    }
  }

  return { summary, isSummaryLoading, summaryError, refreshSummary }
}
