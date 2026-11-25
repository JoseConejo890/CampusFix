<script setup lang="ts">
import type { IncidentSummary } from '~/composables/useIncidentSummary'

defineProps<{
  summary: IncidentSummary | null
  loading: boolean
  error: string
}>()

const emit = defineEmits<{ refresh: [] }>()
</script>

<template>
  <section aria-label="Resumen de incidencias" class="rounded-2xl border border-white/20 bg-white/10 p-3">
    <dl class="grid grid-cols-2 gap-2.5" aria-live="polite">
      <div class="rounded-xl bg-blue-900/25 px-3 py-2">
        <dt class="text-sm font-medium text-blue-50">Abiertas</dt>
        <dd class="text-2xl font-bold tabular-nums">{{ summary?.open ?? '—' }}</dd>
      </div>
      <div class="rounded-xl bg-blue-900/25 px-3 py-2">
        <dt class="text-sm font-medium text-blue-50">Cerradas</dt>
        <dd class="text-2xl font-bold tabular-nums">{{ summary?.closed ?? '—' }}</dd>
      </div>
    </dl>

    <button
      type="button"
      :disabled="loading"
      class="mt-2.5 w-full rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white disabled:opacity-70"
      @click="emit('refresh')"
    >
      {{ loading ? 'Actualizando…' : 'Actualizar resumen' }}
    </button>

    <p v-if="error" role="alert" class="mt-2 text-xs text-blue-50">
      {{ error }} <span v-if="summary">Se muestran las últimas cifras disponibles.</span>
    </p>
  </section>
</template>
