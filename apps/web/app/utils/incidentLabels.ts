export const roleLabels: Record<string, string> = {
  student: 'Estudiante',
  technician: 'Técnico',
  admin: 'Administrador',
}
export const rolePermissionsText: Record<string, string> = {
  student: 'Puede registrar y consultar incidencias. No puede asignar técnicos ni cambiar estados.',
  technician: 'Puede cambiar el estado de las incidencias asignadas a él. No puede asignar técnicos.',
  admin: 'Puede asignar técnicos responsables y cambiar cualquier estado (respetando no cerrar sin técnico).',
}
export const statusLabels: Record<string, string> = {
  open: 'Abierta',
  in_progress: 'En progreso',
  resolved: 'Resuelta',
  closed: 'Cerrada',
}
export const priorityLabels: Record<string, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
}
