<script setup lang="ts">
interface Incident {
  id: string
  title: string
  description: string
  location: string
  category_id: string
  category_name: string
  reported_by: string
  reported_by_name: string
  assigned_to?: string | null
  assigned_to_name?: string | null
  created_at: string
  status: string
  priority: string
}

interface Category {
  id: string
  name: string
  description: string | null
}

interface UserAccount {
  id: string
  name: string
  email: string
  role: 'student' | 'technician' | 'admin' | string
}

interface ApiPayload {
  incidents?: Incident[]
  incident?: Incident
  categories?: Category[]
  users?: UserAccount[]
  error?: string
  details?: string[]
}

const config = useRuntimeConfig()
const apiBase = String(config.public.apiBase).replace(/\/+$/, '')
const incidentsEndpoint = `${apiBase}/incidents`

const incidents = ref<Incident[]>([])
const categories = ref<Category[]>([])
const users = ref<UserAccount[]>([])
const activeUserId = ref('')
const isLoading = ref(false)
const isSubmitting = ref(false)
const loadError = ref('')
const catalogError = ref('')
const submitError = ref('')
const successMessage = ref('')
const statusFilter = ref('')
const priorityFilter = ref('')
const activeUser = computed(() => users.value.find(user => user.id === activeUserId.value) ?? null)
const technicians = computed(() => users.value.filter(user => user.role === 'technician'))
const visibleIncidents = computed(() => incidents.value.filter(incident =>
  (!statusFilter.value || incident.status === statusFilter.value)
  && (!priorityFilter.value || incident.priority === priorityFilter.value),
))

interface IncidentDraft {
  status: string
  assignedTo: string
  comment: string
  saving: boolean
  error: string
  success: string
}

const incidentDrafts = reactive<Record<string, IncidentDraft>>({})

function syncIncidentDrafts(list: Incident[]) {
  for (const incident of list) {
    incidentDrafts[incident.id] = {
      status: incident.status,
      assignedTo: incident.assigned_to ?? '',
      comment: '',
      saving: false,
      error: '',
      success: '',
    }
  }
}

const roleLabels: Record<string, string> = {
  student: 'Estudiante',
  technician: 'Técnico',
  admin: 'Administrador',
}
const rolePermissionsText: Record<string, string> = {
  student: 'Puede registrar y consultar incidencias. No puede asignar técnicos ni cambiar estados.',
  technician: 'Puede cambiar el estado de las incidencias asignadas a él. No puede asignar técnicos.',
  admin: 'Puede asignar técnicos responsables y cambiar cualquier estado (respetando no cerrar sin técnico).',
}
const statusLabels: Record<string, string> = {
  open: 'Abierta',
  in_progress: 'En progreso',
  resolved: 'Resuelta',
  closed: 'Cerrada',
}
const priorityLabels: Record<string, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
}

const form = reactive({
  title: '',
  description: '',
  location: '',
  categoryId: '',
  priority: 'medium',
})

function getErrorMessage(payload: ApiPayload, fallback: string) {
  if (payload.error === 'Referenced category or user does not exist') {
    return 'El ID de categoría o de usuario no existe en la base de datos.'
  }

  if (payload.error === 'Validation failed') {
    return 'Revisa los datos requeridos y vuelve a intentarlo.'
  }

  return payload.error || payload.details?.join(' ') || fallback
}

async function readPayload(response: Response): Promise<ApiPayload> {
  try {
    return await response.json() as ApiPayload
  } catch {
    return {}
  }
}

async function loadIncidents() {
  isLoading.value = true
  loadError.value = ''

  try {
    const response = await fetch(incidentsEndpoint)
    const payload = await readPayload(response)

    if (!response.ok) {
      throw new Error(getErrorMessage(payload, 'No se pudo cargar el listado.'))
    }

    incidents.value = Array.isArray(payload.incidents) ? payload.incidents : []
    syncIncidentDrafts(incidents.value)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    loadError.value = message && !/failed to fetch|networkerror/i.test(message)
      ? message
      : 'No se pudo conectar con la API. Comprueba que Docker Compose esté activo e inténtalo de nuevo.'
  } finally {
    isLoading.value = false
  }
}

async function loadCatalogs() {
  catalogError.value = ''

  try {
    const [categoriesRes, usersRes] = await Promise.all([
      fetch(`${apiBase}/categories`),
      fetch(`${apiBase}/users`),
    ])

    const [categoriesPayload, usersPayload] = await Promise.all([
      readPayload(categoriesRes),
      readPayload(usersRes),
    ])

    if (!categoriesRes.ok || !usersRes.ok) {
      throw new Error('No se pudieron cargar las categorías o usuarios.')
    }

    categories.value = Array.isArray(categoriesPayload.categories) ? categoriesPayload.categories : []
    users.value = Array.isArray(usersPayload.users) ? usersPayload.users : []

    if (!form.categoryId && categories.value.length > 0) {
      form.categoryId = categories.value[0]?.id ?? ''
    }
    if (!activeUserId.value && users.value.length > 0) {
      activeUserId.value = users.value[0]?.id ?? ''
    }
  } catch (error) {
    catalogError.value = error instanceof Error && !/failed to fetch|networkerror/i.test(error.message)
      ? error.message
      : 'No se pudieron cargar las listas de categorías y roles desde la API.'
  }
}

async function submitIncident() {
  if (isSubmitting.value) {
    return
  }

  submitError.value = ''
  successMessage.value = ''

  if (!activeUserId.value) {
    submitError.value = 'Selecciona un usuario/rol en la barra superior antes de registrar.'
    return
  }

  isSubmitting.value = true

  try {
    const response = await fetch(incidentsEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: form.title.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        categoryId: form.categoryId.trim(),
        reportedBy: activeUserId.value,
        priority: form.priority,
      }),
    })
    const payload = await readPayload(response)

    if (!response.ok) {
      throw new Error(getErrorMessage(payload, 'No se pudo registrar la incidencia.'))
    }

    if (!payload.incident) {
      throw new Error('La API no devolvió la incidencia creada.')
    }

    incidents.value = [
      payload.incident,
      ...incidents.value.filter(incident => incident.id !== payload.incident?.id),
    ]
    syncIncidentDrafts([payload.incident])
    successMessage.value = `La incidencia #${payload.incident.id} se registró correctamente.`
    Object.assign(form, {
      title: '',
      description: '',
      location: '',
      categoryId: categories.value[0]?.id ?? '',
      priority: 'medium',
    })
  } catch (error) {
    submitError.value = error instanceof Error
      ? error.message
      : 'Ocurrió un error al registrar la incidencia.'
  } finally {
    isSubmitting.value = false
  }
}

function canAssignTechnician() {
  return activeUser.value?.role === 'admin'
}

function canChangeStatus(incident: Incident) {
  if (!activeUser.value) {
    return false
  }
  if (activeUser.value.role === 'admin') {
    return true
  }
  if (activeUser.value.role === 'technician') {
    return incident.assigned_to === activeUser.value.id
  }
  return false
}

async function updateIncident(incident: Incident) {
  const draft = incidentDrafts[incident.id]
  if (!draft || draft.saving || !activeUserId.value) {
    return
  }

  draft.error = ''
  draft.success = ''

  const effectiveAssignee = canAssignTechnician()
    ? (draft.assignedTo || null)
    : (incident.assigned_to ?? null)

  if (draft.status === 'closed' && !effectiveAssignee) {
    draft.error = 'No se puede cerrar una incidencia sin un técnico responsable asignado.'
    return
  }

  const body: Record<string, string | null> = {
    status: draft.status,
  }
  if (canAssignTechnician()) {
    body.assignedTo = draft.assignedTo || null
  }
  if (draft.comment.trim()) {
    body.comment = draft.comment.trim()
  }

  draft.saving = true

  try {
    const response = await fetch(`${incidentsEndpoint}/${encodeURIComponent(incident.id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': activeUserId.value,
      },
      body: JSON.stringify(body),
    })
    const payload = await readPayload(response)

    if (response.status === 401 || response.status === 403) {
      throw new Error(payload.error || 'No tienes permiso o falta activar DEV_AUTH_ENABLED=true en la API.')
    }
    if (!response.ok) {
      throw new Error(getErrorMessage(payload, 'No se pudo actualizar la incidencia.'))
    }

    if (payload.incident) {
      incidents.value = incidents.value.map(item =>
        item.id === payload.incident?.id ? payload.incident : item,
      )
      syncIncidentDrafts([payload.incident])
      const updatedDraft = incidentDrafts[incident.id]
      if (updatedDraft) {
        updatedDraft.success = 'Incidencia actualizada.'
      }
    } else {
      await loadIncidents()
    }
  } catch (error) {
    draft.error = error instanceof Error
      ? error.message
      : 'Ocurrió un error al actualizar la incidencia.'
  } finally {
    draft.saving = false
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

onMounted(() => {
  void Promise.all([loadCatalogs(), loadIncidents()])
})
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900">
    <main id="inicio" class="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <section
        aria-label="Selector rápido de rol"
        class="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-6"
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">Modo pruebas</span>
            <p class="text-sm font-semibold text-slate-700">Usuario y rol activo:</p>
            <span
              v-if="activeUser"
              class="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700"
            >
              {{ roleLabels[activeUser.role] || activeUser.role }} · ID #{{ activeUser.id }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <label for="active-role-select" class="sr-only">Cambiar usuario o rol activo</label>
            <select
              id="active-role-select"
              v-model="activeUserId"
              class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100 sm:w-72"
              :disabled="users.length === 0"
            >
              <option v-if="users.length === 0" value="">Sin usuarios disponibles</option>
              <option v-for="user in users" :key="user.id" :value="user.id">
                {{ user.name }} ({{ roleLabels[user.role] || user.role }} · #{{ user.id }})
              </option>
            </select>
          </div>
        </div>
        <p v-if="activeUser" class="text-xs text-slate-600">
          <span class="font-semibold text-slate-700">Permisos del rol:</span>
          {{ rolePermissionsText[activeUser.role] || 'Rol estándar.' }}
        </p>
      </section>

      <p v-if="catalogError" class="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
        {{ catalogError }}
      </p>

      <section class="mb-8 rounded-3xl bg-blue-700 px-6 py-8 text-white shadow-lg shadow-blue-900/10 sm:px-9 sm:py-10">
        <p class="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-blue-100">Servicios universitarios</p>
        <div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div class="max-w-2xl">
            <h1 class="text-3xl font-bold tracking-tight sm:text-4xl">Reporta una incidencia</h1>
            <p class="mt-3 max-w-xl text-sm leading-6 text-blue-50 sm:text-base">
              Describe el problema y consulta los reportes recientes para ayudar a mantener el campus en buenas condiciones.
            </p>
          </div>
          <div class="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-sm">
            <p class="text-xs text-blue-100">Incidencias en el listado</p>
            <p class="mt-1 text-2xl font-bold">{{ incidents.length }}</p>
          </div>
        </div>
      </section>

      <div class="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section class="h-fit rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="form-title">
          <div class="mb-6">
            <p class="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Nuevo reporte</p>
            <h2 id="form-title" class="mt-2 text-2xl font-bold tracking-tight">Cuéntanos qué ocurrió</h2>
            <p class="mt-2 text-sm leading-6 text-slate-600">Completa los datos para agregar la incidencia al listado.</p>
          </div>

          <form class="space-y-4" @submit.prevent="submitIncident">
            <div>
              <label for="incident-title" class="mb-1.5 block text-sm font-semibold text-slate-700">Título</label>
              <input
                id="incident-title"
                v-model="form.title"
                class="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                name="title"
                type="text"
                maxlength="160"
                placeholder="Ej. Luminaria fundida"
                required
              >
            </div>

            <div>
              <label for="incident-description" class="mb-1.5 block text-sm font-semibold text-slate-700">Descripción</label>
              <textarea
                id="incident-description"
                v-model="form.description"
                class="w-full resize-none rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                name="description"
                rows="4"
                maxlength="3000"
                placeholder="Describe el problema y cualquier detalle útil."
                required
              />
            </div>

            <div>
              <label for="incident-location" class="mb-1.5 block text-sm font-semibold text-slate-700">Ubicación</label>
              <input
                id="incident-location"
                v-model="form.location"
                class="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                name="location"
                type="text"
                maxlength="200"
                placeholder="Edificio, aula o zona del campus"
                required
              >
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label for="category-id" class="mb-1.5 block text-sm font-semibold text-slate-700">Categoría</label>
                <select
                  id="category-id"
                  v-model="form.categoryId"
                  class="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                  name="categoryId"
                  required
                >
                  <option value="" disabled>Selecciona una categoría</option>
                  <option v-for="category in categories" :key="category.id" :value="category.id">
                    {{ category.name }} (#{{ category.id }})
                  </option>
                </select>
              </div>
              <div>
                <label for="incident-priority" class="mb-1.5 block text-sm font-semibold text-slate-700">Prioridad</label>
                <select
                  id="incident-priority"
                  v-model="form.priority"
                  class="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                  name="priority"
                  required
                >
                  <option v-for="(label, value) in priorityLabels" :key="value" :value="value">
                    {{ label }}
                  </option>
                </select>
              </div>
            </div>

            <div class="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700">
              <span class="font-semibold">Reporta:</span>
              <span v-if="activeUser" class="ml-1">
                {{ activeUser.name }} ({{ roleLabels[activeUser.role] || activeUser.role }} · ID #{{ activeUser.id }})
              </span>
              <span v-else class="ml-1 text-slate-500">Selecciona un usuario en la barra superior</span>
            </div>

            <p v-if="submitError" class="rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-800" role="alert">
              {{ submitError }}
            </p>
            <p v-if="successMessage" class="rounded-xl bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800" role="status">
              {{ successMessage }}
            </p>

            <button
              class="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              :disabled="isSubmitting"
            >
              <span v-if="isSubmitting" class="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
              {{ isSubmitting ? 'Registrando…' : 'Registrar incidencia' }}
            </button>
          </form>
        </section>

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
              @click="loadIncidents"
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
            <button class="mt-3 text-sm font-bold text-rose-900 underline underline-offset-2" type="button" @click="loadIncidents">
              Intentar de nuevo
            </button>
          </div>

          <div v-else-if="isLoading && incidents.length === 0" class="rounded-2xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-600" role="status">
            Cargando incidencias…
          </div>

          <div v-else-if="incidents.length === 0" class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center">
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
                v-if="incidentDrafts[incident.id] && (canAssignTechnician() || canChangeStatus(incident))"
                class="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5"
              >
                <p class="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                  Gestión ({{ roleLabels[activeUser?.role || ''] || activeUser?.role }})
                </p>
                <div class="grid gap-2.5 sm:grid-cols-2">
                  <div v-if="canAssignTechnician()">
                    <label :for="`assign-${incident.id}`" class="mb-1 block text-xs font-semibold text-slate-700">Asignar técnico</label>
                    <select
                      :id="`assign-${incident.id}`"
                      v-model="incidentDrafts[incident.id]!.assignedTo"
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
                      v-model="incidentDrafts[incident.id]!.status"
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
                    v-model="incidentDrafts[incident.id]!.comment"
                    class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                    type="text"
                    placeholder="Comentario opcional del cambio"
                  >
                  <button
                    class="shrink-0 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-800 disabled:opacity-50"
                    type="button"
                    :disabled="incidentDrafts[incident.id]!.saving"
                    @click="updateIncident(incident)"
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
      </div>
    </main>
  </div>
</template>
