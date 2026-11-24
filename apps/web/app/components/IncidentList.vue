<script setup lang="ts">
import type { Incident, IncidentDraft, UserAccount } from '~/types/incidents'
import { priorityLabels, roleLabels, statusLabels } from '~/utils/incidentLabels'

defineProps<{
  total: number
  visibleIncidents: Incident[]
  incidentDrafts: Record<string, IncidentDraft>
  isLoading: boolean
  loadError: string
  activeUser: UserAccount | null
  activeUserId: string
  apiBase: string
  technicians: UserAccount[]
  canAssignTechnician: boolean
  canChangeStatus: (incident: Incident) => boolean
}>()

const emit = defineEmits<{
  refresh: []
  update: [incident: Incident]
  edit: [id: string, changes: Partial<Pick<IncidentDraft, 'assignedTo' | 'status' | 'comment'>>]
}>()

const statusFilter = defineModel<string>('statusFilter', { required: true })
const priorityFilter = defineModel<string>('priorityFilter', { required: true })

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
  <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="list-title">
    <div class="mb-6 flex items-start justify-between gap-4">
      <div>
        <p class="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Listado</p>
        <h2 id="list-title" class="mt-2 text-2xl font-bold tracking-tight">Incidencias recientes</h2>
        <p class="mt-2 text-sm text-slate-600">Los reportes más nuevos aparecen primero.</p>
      </div>
      <button
        class="shrink-0 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 disabled:opacity-50"
        type="button"
        :disabled="isLoading"
        @click="emit('refresh')"
      >
        {{ isLoading ? 'Cargando…' : 'Actualizar' }}
      </button>
    </div>

    <div class="mb-5 grid gap-3 sm:grid-cols-2">
      <div>
        <label for="status-filter" class="mb-1 block text-sm font-semibold text-slate-700">Estado</label>
        <select id="status-filter" v-model="statusFilter" class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">Todos los estados</option>
          <option v-for="(label, value) in statusLabels" :key="value" :value="value">{{ label }}</option>
        </select>
      </div>
      <div>
        <label for="priority-filter" class="mb-1 block text-sm font-semibold text-slate-700">Prioridad</label>
        <select id="priority-filter" v-model="priorityFilter" class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">Todas las prioridades</option>
          <option v-for="(label, value) in priorityLabels" :key="value" :value="value">{{ label }}</option>
        </select>
      </div>
    </div>

    <div v-if="loadError" class="rounded-2xl border border-rose-200 bg-rose-50 p-4" role="alert">
      <p class="text-sm text-rose-800">{{ loadError }}</p>
      <button class="mt-3 text-sm font-bold text-rose-900 underline underline-offset-2" type="button" @click="emit('refresh')">
        Intentar de nuevo
      </button>
    </div>

    <div v-else-if="isLoading && total === 0" class="rounded-2xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-600" role="status">
      Cargando incidencias…
    </div>

    <div v-else-if="total === 0" class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center">
      <span class="mx-auto grid size-12 place-items-center rounded-2xl bg-white text-2xl text-blue-700 shadow-sm" aria-hidden="true">＋</span>
      <h3 class="mt-4 font-bold text-slate-800">Todavía no hay reportes</h3>
      <p class="mx-auto mt-2 max-w-xs text-sm leading-5 text-slate-600">Cuando se registre una incidencia, aparecerá aquí para su seguimiento.</p>
    </div>

    <div v-else-if="visibleIncidents.length === 0" class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600" role="status">
      No hay incidencias que coincidan con los filtros seleccionados.
      <button class="mt-2 block w-full font-bold text-blue-700 underline" type="button" @click="statusFilter = ''; priorityFilter = ''">Limpiar filtros</button>
    </div>

    <div v-else class="space-y-3" aria-live="polite">
      <article
        v-for="incident in visibleIncidents"
        :key="incident.id"
        class="rounded-2xl border border-slate-200 p-4 transition hover:border-blue-200 hover:shadow-sm sm:p-5"
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <p class="text-xs font-semibold text-slate-500">Reporte #{{ incident.id }}</p>
            <h3 class="mt-1 break-words text-lg font-bold text-slate-900">{{ incident.title }}</h3>
            <p class="mt-1 text-sm text-slate-600">
              {{ incident.location }} <span aria-hidden="true">·</span> {{ incident.category_name }}
            </p>
          </div>
        </div>
        <p class="mt-3 whitespace-pre-line break-words text-sm leading-6 text-slate-700">{{ incident.description }}</p>
        <p class="mt-3 text-sm text-slate-600">
          Estado: {{ statusLabels[incident.status] || incident.status }}
          · Prioridad: {{ priorityLabels[incident.priority] || incident.priority }}
          · Técnico: {{ incident.assigned_to_name || 'Sin asignar' }}
        </p>

        <div
          v-if="incidentDrafts[incident.id] && (canAssignTechnician || canChangeStatus(incident))"
          class="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5"
        >
          <p class="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-600">
            Gestión ({{ roleLabels[activeUser?.role || ''] || activeUser?.role }})
          </p>
          <div class="grid gap-2.5 sm:grid-cols-2">
            <div v-if="canAssignTechnician">
              <label :for="`assign-${incident.id}`" class="mb-1 block text-xs font-semibold text-slate-700">Asignar técnico</label>
              <select
                :id="`assign-${incident.id}`"
                :value="incidentDrafts[incident.id]!.assignedTo"
                @change="emit('edit', incident.id, { assignedTo: ($event.target as HTMLSelectElement).value })"
                class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
              >
                <option value="">Sin asignar</option>
                <option v-for="tech in technicians" :key="tech.id" :value="tech.id">
                  {{ tech.name }} (#{{ tech.id }})
                </option>
              </select>
            </div>
            <div v-if="canChangeStatus(incident)">
              <label :for="`status-${incident.id}`" class="mb-1 block text-xs font-semibold text-slate-700">Estado</label>
              <select
                :id="`status-${incident.id}`"
                :value="incidentDrafts[incident.id]!.status"
                @change="emit('edit', incident.id, { status: ($event.target as HTMLSelectElement).value })"
                class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
              >
                <option v-for="(label, value) in statusLabels" :key="value" :value="value">
                  {{ label }}
                </option>
              </select>
            </div>
          </div>
          <div class="mt-2.5 flex flex-col gap-2 sm:flex-row">
            <input
              :value="incidentDrafts[incident.id]!.comment"
              @input="emit('edit', incident.id, { comment: ($event.target as HTMLInputElement).value })"
              class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
              type="text"
              placeholder="Comentario opcional del cambio"
            >
            <button
              class="shrink-0 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-800 disabled:opacity-50"
              type="button"
              :disabled="incidentDrafts[incident.id]!.saving"
              @click="emit('update', incident)"
            >
              {{ incidentDrafts[incident.id]!.saving ? 'Guardando…' : 'Guardar cambio' }}
            </button>
          </div>
          <p v-if="incidentDrafts[incident.id]!.error" class="mt-2 text-xs font-medium text-rose-700" role="alert">
            {{ incidentDrafts[incident.id]!.error }}
          </p>
          <p v-if="incidentDrafts[incident.id]!.success" class="mt-2 text-xs font-medium text-emerald-700" role="status">
            {{ incidentDrafts[incident.id]!.success }}
          </p>
        </div>
        <p v-else-if="activeUser?.role === 'technician'" class="mt-3 text-xs text-slate-500">
          Solo puedes cambiar el estado si esta incidencia está asignada a ti.
        </p>

        <IncidentHistory :incident-id="incident.id" :api-base="apiBase" :active-user-id="activeUserId" />
        <div class="mt-4 flex flex-col gap-1 border-t border-slate-100 pt-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Reportó {{ incident.reported_by_name }}</span>
          <time :datetime="incident.created_at">{{ formatDate(incident.created_at) }}</time>
        </div>
      </article>
    </div>
  </section>
</template>
