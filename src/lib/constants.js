export const CHART_COLORS = [
  '#2f5d50', '#c8962e', '#5b7fb3', '#b4463c', '#7a5c99',
  '#3f9aa8', '#8a6418', '#6b8f3a', '#c26d95', '#5c6b7a', '#9aa5b1',
]

export const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense']

// Dropdowns the administrator can edit under Settings → Dropdowns
export const LOOKUP_CATEGORIES = [
  { key: 'gender', label: 'Gender' },
  { key: 'marital_status', label: 'Marital status' },
  { key: 'age_group', label: 'Age group' },
  { key: 'membership_status', label: 'Membership status' },
  { key: 'ministry', label: 'Ministry' },
  { key: 'department', label: 'Department' },
  { key: 'service_type', label: 'Service type' },
  { key: 'communication_method', label: 'Preferred communication' },
  { key: 'payment_method', label: 'Payment method' },
  { key: 'asset_category', label: 'Asset category' },
  { key: 'asset_condition', label: 'Asset condition' },
  { key: 'asset_status', label: 'Asset status' },
]

// Categories the dashboard can break attendance down by
export const BREAKDOWN_OPTIONS = [
  { key: 'group_name', label: 'Group' },
  { key: 'age_group', label: 'Age group' },
  { key: 'gender', label: 'Gender' },
  { key: 'member_type', label: 'Membership' },
  { key: 'ministry', label: 'Ministry' },
  { key: 'department', label: 'Department' },
]

export const SMS_AUDIENCES = [
  { key: 'all', label: 'All active members' },
  { key: 'absent', label: 'Absent members for a service' },
  { key: 'present', label: 'Members present at a service' },
  { key: 'followup', label: 'Follow-up list' },
  { key: 'group', label: 'A group' },
  { key: 'custom', label: 'Type numbers myself' },
]
