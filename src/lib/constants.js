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

// Every permission the system understands. Roles are built from these.
export const PERMISSIONS = [
  { key: 'members.view_all', label: 'See all members', hint: 'Without this, a leader only sees their own group or ministry' },
  { key: 'members.manage', label: 'Add and edit members' },
  { key: 'attendance.manage', label: 'Run services and mark attendance' },
  { key: 'finance.view', label: 'See money and reports' },
  { key: 'finance.record', label: 'Record payments, bills and expenses' },
  { key: 'finance.manage', label: 'Manage accounts and journal entries' },
  { key: 'sms.send', label: 'Send SMS' },
  { key: 'assets.manage', label: 'Manage fixed assets' },
  { key: 'reports.view', label: 'See reports' },
  { key: 'settings.manage', label: 'Change church settings and dropdowns' },
  { key: 'users.manage', label: 'Add users and set their rights' },
]

export const MEMBER_CHART_OPTIONS = [
  { key: 'gender', label: 'Gender' },
  { key: 'group_name', label: 'Group' },
  { key: 'ministry', label: 'Ministry' },
  { key: 'member_type', label: 'Membership status' },
  { key: 'age_group', label: 'Age group' },
  { key: 'marital_status', label: 'Marital status' },
]

export const SMS_PLACEHOLDERS = {
  payment: ['{name}', '{church}', '{type}', '{amount}', '{balance}', '{date}', '{total_paid}'],
  billing: ['{name}', '{church}', '{type}', '{amount}', '{balance}', '{due}'],
  birthday: ['{name}', '{church}'],
}
