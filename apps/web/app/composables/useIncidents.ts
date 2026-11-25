import type { Category, Incident, IncidentDraft, UserAccount } from '~/types/incidents'

interface ApiPayload {
  incidents?: Incident[]
  incident?: Incident
  categories?: Category[]
  users?: UserAccount[]
  error?: string
  details?: string[]
}

export function useIncidents(onIncidentSaved?: () => void) {
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
      onIncidentSaved?.()
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

      const updatedIncident = payload.incident
      if (updatedIncident) {
        incidents.value = incidents.value.map(item =>
          item.id === updatedIncident.id ? updatedIncident : item,
        )
        syncIncidentDrafts([updatedIncident])
        const updatedDraft = incidentDrafts[incident.id]
        if (updatedDraft) {
          updatedDraft.success = 'Incidencia actualizada.'
        }
      } else {
        await loadIncidents()
      }
      onIncidentSaved?.()
    } catch (error) {
      draft.error = error instanceof Error
        ? error.message
        : 'Ocurrió un error al actualizar la incidencia.'
    } finally {
      draft.saving = false
    }
  }

  onMounted(() => {
    void Promise.all([loadCatalogs(), loadIncidents()])
  })

  function editIncidentDraft(id: string, changes: Partial<Pick<IncidentDraft, 'assignedTo' | 'status' | 'comment'>>) {
    const draft = incidentDrafts[id]
    if (draft) {
      Object.assign(draft, changes)
    }
  }

  return {
    apiBase, incidents, categories, users, activeUserId, activeUser, technicians,
    isLoading, isSubmitting, loadError, catalogError, submitError, successMessage,
    statusFilter, priorityFilter, visibleIncidents, incidentDrafts, form,
    loadIncidents, submitIncident, canAssignTechnician, canChangeStatus, updateIncident,
    editIncidentDraft,
  }
}
