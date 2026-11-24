<script setup lang="ts">
interface HistoryEntry {
  id: string
  changed_by_name: string
  previous_status: string | null
  new_status: string
  previous_assigned_to: string | null
  previous_assigned_to_name: string | null
  new_assigned_to: string | null
  new_assigned_to_name: string | null
  comment: string | null
  created_at: string
}

const props = defineProps<{ incidentId: string, apiBase: string, activeUserId?: string }>()
const expanded = ref(false)
const loading = ref(false)
const error = ref('')
const updates = ref<HistoryEntry[]>([])
const developmentUserId = ref('')
const isDevelopment = import.meta.dev
const labels: Record<string, string> = {
  open: 'Abierta',
  in_progress: 'En progreso',
  resolved: 'Resuelta',
  closed: 'Cerrada',
}
let currentRequest = 0

async function loadHistory() {
  const request = ++currentRequest
  loading.value = true
  error.value = ''
  updates.value = []
  try {
    const headers: Record<string, string> = {}
    const effectiveUserId = developmentUserId.value.trim() || props.activeUserId?.trim() || ''
    if (effectiveUserId) {
      headers['X-User-Id'] = effectiveUserId
    }
    const response = await fetch(`${props.apiBase}/incidents/${encodeURIComponent(props.incidentId)}/history`, {
      headers,
    })
    if (response.status === 401 || response.status === 403) {
      throw new Error('No tienes una sesión autorizada para consultar el historial.')
    }
    if (!response.ok) {
      throw new Error('No se pudo cargar el historial. Inténtalo de nuevo.')
    }
    const payload = await response.json() as { updates?: HistoryEntry[] }
    if (!Array.isArray(payload.updates)) {
      throw new Error('La API devolvió un historial inválido.')
    }
    if (request === currentRequest) updates.value = payload.updates
  } catch (cause) {
    if (request === currentRequest) {
      error.value = cause instanceof Error && !/failed to fetch|networkerror/i.test(cause.message)
        ? cause.message
        : 'No se pudo conectar con la API.'
    }
  } finally {
    if (request === currentRequest) loading.value = false
  }
}

function toggleHistory() {
  expanded.value = !expanded.value
  if (expanded.value) {
    void loadHistory()
  } else {
    currentRequest++
  }
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}
</script>

<template>
  <div class="mt-4 border-t border-slate-100 pt-3">
    <button class="text-sm font-semibold text-blue-700 underline underline-offset-2" type="button" :aria-expanded="expanded" :aria-controls="`history-${incidentId}`" @click="toggleHistory">
      {{ expanded ? 'Ocultar historial' : 'Ver historial' }}
    </button>
    <section v-show="expanded" :id="`history-${incidentId}`" class="mt-3" :aria-label="`Historial del reporte ${incidentId}`">
      <div v-if="isDevelopment" class="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
        <label :for="`history-user-${incidentId}`" class="block font-semibold">ID de usuario para pruebas locales</label>
        <p class="mt-1 text-xs">Solo funciona en desarrollo con DEV_AUTH_ENABLED activado en la API.</p>
        <div class="mt-2 flex gap-2">
          <input :id="`history-user-${incidentId}`" v-model="developmentUserId" class="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-2 py-1" inputmode="numeric" placeholder="ID de usuario existente">
          <button class="rounded-lg bg-amber-900 px-3 py-1 font-semibold text-white disabled:opacity-50" type="button" :disabled="loading || !/^[1-9]\d*$/.test(developmentUserId.trim())" @click="loadHistory">Consultar</button>
        </div>
      </div>
      <p v-if="loading" class="text-sm text-slate-600" role="status">Cargando historial…</p>
      <div v-else-if="error" class="text-sm text-rose-800" role="alert">
        <p>{{ error }}</p>
        <button class="mt-1 font-semibold underline" type="button" @click="loadHistory">Intentar de nuevo</button>
      </div>
      <p v-else-if="updates.length === 0" class="text-sm text-slate-600">Esta incidencia aún no tiene cambios registrados.</p>
      <ol v-else class="space-y-3">
        <li v-for="entry in updates" :key="entry.id" class="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
          <p class="font-semibold">{{ entry.changed_by_name }} · <time :datetime="entry.created_at">{{ formatDate(entry.created_at) }}</time></p>
          <p class="mt-1">Estado: {{ entry.previous_status ? (labels[entry.previous_status] || entry.previous_status) : 'Inicio' }} → {{ labels[entry.new_status] || entry.new_status }}</p>
          <p v-if="entry.previous_assigned_to !== entry.new_assigned_to">Responsable: {{ entry.previous_assigned_to_name || 'Sin asignar' }} → {{ entry.new_assigned_to_name || 'Sin asignar' }}</p>
          <p v-if="entry.comment" class="mt-1 whitespace-pre-line break-words">{{ entry.comment }}</p>
        </li>
      </ol>
    </section>
  </div>
</template>
