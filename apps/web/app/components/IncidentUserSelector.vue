<script setup lang="ts">
import type { UserAccount } from '~/types/incidents'
import { roleLabels, rolePermissionsText } from '~/utils/incidentLabels'

defineProps<{
  users: UserAccount[]
  activeUser: UserAccount | null
}>()

const activeUserId = defineModel<string>({ required: true })
</script>

<template>
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
</template>
