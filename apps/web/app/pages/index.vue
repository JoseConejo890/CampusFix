<script setup lang="ts">
const {
  apiBase, incidents, categories, users, activeUserId, activeUser, technicians,
  isLoading, isSubmitting, loadError, catalogError, submitError, successMessage,
  statusFilter, priorityFilter, visibleIncidents, incidentDrafts, form,
  loadIncidents, submitIncident, canAssignTechnician, canChangeStatus, updateIncident,
  editIncidentDraft,
} = useIncidents()
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900">
    <main id="inicio" class="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <IncidentUserSelector v-model="activeUserId" :users="users" :active-user="activeUser" />

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
        <IncidentReportForm
          v-model:title="form.title"
          v-model:description="form.description"
          v-model:location="form.location"
          v-model:category-id="form.categoryId"
          v-model:priority="form.priority"
          :categories="categories"
          :active-user="activeUser"
          :is-submitting="isSubmitting"
          :submit-error="submitError"
          :success-message="successMessage"
          @submit="submitIncident"
        />

        <IncidentList
          v-model:status-filter="statusFilter"
          v-model:priority-filter="priorityFilter"
          :total="incidents.length"
          :visible-incidents="visibleIncidents"
          :incident-drafts="incidentDrafts"
          :is-loading="isLoading"
          :load-error="loadError"
          :active-user="activeUser"
          :active-user-id="activeUserId"
          :api-base="apiBase"
          :technicians="technicians"
          :can-assign-technician="canAssignTechnician()"
          :can-change-status="canChangeStatus"
          @refresh="loadIncidents"
          @update="updateIncident"
          @edit="editIncidentDraft"
        />
      </div>
    </main>
  </div>
</template>
