export interface Incident {
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

export interface Category {
  id: string
  name: string
  description: string | null
}

export interface UserAccount {
  id: string
  name: string
  email: string
  role: 'student' | 'technician' | 'admin' | string
}

export interface IncidentDraft {
  status: string
  assignedTo: string
  comment: string
  saving: boolean
  error: string
  success: string
}
