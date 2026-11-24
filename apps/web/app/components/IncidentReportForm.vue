<script setup lang="ts">
import type { Category, UserAccount } from '~/types/incidents'
import { priorityLabels, roleLabels } from '~/utils/incidentLabels'

defineProps<{
  categories: Category[]
  activeUser: UserAccount | null
  isSubmitting: boolean
  submitError: string
  successMessage: string
}>()

const emit = defineEmits<{ submit: [] }>()

const title = defineModel<string>('title', { required: true })
const description = defineModel<string>('description', { required: true })
const location = defineModel<string>('location', { required: true })
const categoryId = defineModel<string>('categoryId', { required: true })
const priority = defineModel<string>('priority', { required: true })
</script>

<template>
  <section class="h-fit rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="form-title">
    <div class="mb-6">
      <p class="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Nuevo reporte</p>
      <h2 id="form-title" class="mt-2 text-2xl font-bold tracking-tight">Cuéntanos qué ocurrió</h2>
      <p class="mt-2 text-sm leading-6 text-slate-600">Completa los datos para agregar la incidencia al listado.</p>
    </div>

    <form class="space-y-4" @submit.prevent="emit('submit')">
      <div>
        <label for="incident-title" class="mb-1.5 block text-sm font-semibold text-slate-700">Título</label>
        <input
          id="incident-title"
          v-model="title"
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
          v-model="description"
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
          v-model="location"
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
            v-model="categoryId"
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
            v-model="priority"
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
</template>
