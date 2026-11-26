import type { Incident } from '~/types/incidents'

export interface IncidentSummary {
  total: number
  closed: number
}

export function useIncidentSummary() {
  const config = useRuntimeConfig()
  const apiBase = String(config.public.apiBase).replace(/\/+$/, '')
  const summary = ref<IncidentSummary | null>(null)
  const isSummaryLoading = ref(true)
  const summaryError = ref('')
  let activeRequest: AbortController | undefined

  async function fetchSummary(signal: AbortSignal): Promise<IncidentSummary> {
    const options = { signal, cache: 'no-store', retry: 0, timeout: 15_000 } as const

    try {
      const payload = await $fetch<{ summary?: IncidentSummary }>(`${apiBase}/summary`, options)
      const counts = payload?.summary

      if (counts && [counts.total, counts.closed].every(count => Number.isSafeInteger(count) && count >= 0)
        && counts.closed <= counts.total) {
        return counts
      }
    } catch (error) {
      if (signal.aborted) {
        throw error
      }
    }

    const payload = await $fetch<{ incidents?: Pick<Incident, 'status'>[] }>(`${apiBase}/incidents`, options)
    if (!Array.isArray(payload?.incidents) || !payload.incidents.every(incident => typeof incident?.status === 'string')) {
      throw new Error('El listado de incidencias no es válido.')
    }

    return {
      total: payload.incidents.length,
      closed: payload.incidents.filter(incident => incident.status === 'closed').length,
    }
  }

  async function refreshSummary() {
    activeRequest?.abort()
    const request = new AbortController()
    activeRequest = request
    isSummaryLoading.value = true

    try {
      const counts = await fetchSummary(request.signal)
      if (activeRequest === request) {
        summary.value = counts
        summaryError.value = ''
      }
    } catch {
      if (activeRequest === request) {
        summaryError.value = 'No se pudo actualizar el resumen de incidencias.'
      }
    } finally {
      if (activeRequest === request) {
        activeRequest = undefined
        isSummaryLoading.value = false
      }
    }
  }

  onMounted(() => {
    void refreshSummary()
  })

  onUnmounted(() => {
    const request = activeRequest
    activeRequest = undefined
    request?.abort()
  })

  return { summary, isSummaryLoading, summaryError, refreshSummary }
}
