export const CHURCH_NAME = import.meta.env.VITE_CHURCH_NAME || 'Our Church'

export const GENDERS = ['Male', 'Female']
export const AGE_GROUPS = ['Children', 'Youth', 'Young Adults', 'Adults', 'Seniors']
export const MEMBER_TYPES = ['Member', 'Worker', 'New Convert', 'Visitor']
export const DEPARTMENTS = [
  'Choir',
  'Ushering',
  'Protocol',
  'Media',
  'Prayer Team',
  'Elders',
  'Youth Ministry',
  "Children's Ministry",
  "Women's Ministry",
  "Men's Fellowship",
]
export const SERVICE_TYPES = [
  'Sunday Service',
  'Midweek Service',
  'Prayer Meeting',
  'Youth Service',
  'Special Program',
]

// Used by the dashboard category breakdown
export const CATEGORY_OPTIONS = [
  { key: 'age_group', label: 'Age group', values: AGE_GROUPS },
  { key: 'gender', label: 'Gender', values: GENDERS },
  { key: 'member_type', label: 'Membership', values: MEMBER_TYPES },
  { key: 'department', label: 'Department', values: [...DEPARTMENTS, 'Unassigned'] },
]

export const CHART_COLORS = ['#2f5d50', '#c8962e', '#5b7fb3', '#b4463c', '#7a5c99', '#3f9aa8', '#8a6418', '#6b8f3a', '#c26d95', '#5c6b7a', '#9aa5b1']
