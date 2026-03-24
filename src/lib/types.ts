export interface App {
  id: string
  display_name: string
  total_questions: number
  version: string
  last_updated: string
  min_app_version: string
}

export interface Category {
  id: string
  app_id: string
  name: string
  icon: string | null
  sort_order: number
  question_count: number
  _isOrphan?: boolean
}

export interface Question {
  id: string
  app_id: string
  question: string
  options: string[]
  answer: number
  correct_answers: number[] | null
  is_multiple_choice: boolean
  explanation_encrypted: string
  category: string
  subcategory: string
  difficulty: number
  tags: string[]
  image_name: string | null
  source: string | null
  version: string
  group_id: string | null
  group_order: number | null
  is_published: boolean
  created_at: string
  updated_at: string
  last_edited_by?: string
  last_edited_at?: string
}

export interface SyncManifest {
  app_id: string
  version: string
  last_updated: string
  total_questions: number
}

export interface AdminUser {
  id: string
  email: string
  display_name: string | null
  role: 'super_admin' | 'admin' | 'editor'
  allowed_apps: string[]
  allowed_categories: string[]
  created_at: string
}

// JSON format used by existing iOS apps
export interface QuestionJSON {
  id: string
  question: string
  options: string[]
  answer: number
  correctAnswers?: number[]
  isMultipleChoice?: boolean
  explanation: string
  category: string
  subcategory?: string
  difficulty?: number
  tags?: string[]
  image?: string | null
  source?: string
  version?: string
  groupId?: string
  groupOrder?: number
}
