export interface Respondent {
  id: string; // uuid
  panel_source: 'membrain' | 'panelnow' | 'self' | 'pilot';
  panel_id: string | null;
  access_token: string;
  status: 'invited' | 'screened_in' | 'screened_out' | 'quota_full' | 'day1_done' | 'completed' | 'dropped';
  quota_cell_sexage: string | null;
  quota_cell_ksco: string | null;
  invited_at: string;
  last_active_at: string | null;
  created_at: string;
}

export interface Screening {
  respondent_id: string;
  age: number | null;
  age_band: '19_29' | '30_39' | '40_49' | '50_59' | '60_plus' | null;
  sex: 'M' | 'F' | null;
  employment_type: 'wage' | 'self' | 'none' | null;
  ai_freq: 'lt2' | '2_3' | '4_6' | 'daily' | null;
  ai_tool_free: string | null;
  ai_purpose_free: string | null;
  ksco_major: string | null;
  passed: boolean;
  fail_reason: 'age' | 'employment' | 'ai_freq' | 'quota_full' | 'low_quality' | null;
  created_at: string;
}

export interface Demographics {
  respondent_id: string;
  region: string | null;
  ksco_minor: string | null;
  monthly_work_hours: number | null;
  income_decile: number | null; // 1~10
  created_at: string;
}

export interface DiaryDay {
  id: string;
  respondent_id: string;
  day_no: 1 | 2;
  survey_date: string | null;
  weekday: number | null; // 1~5
  status: 'not_started' | 'in_progress' | 'completed';
  started_at: string | null;
  completed_at: string | null;
}

export interface DiaryEntry {
  id: string;
  diary_day_id: string;
  start_slot: number; // 0~31
  end_slot: number; // 0~31
  activity_major: string | null;
  activity_minor: string | null;
  activity_other: string | null;
  location: 'home' | 'workplace' | 'commute' | 'outside' | 'other' | null;
  ai_used: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntryAiTool {
  id: string;
  entry_id: string;
  ai_type: string | null;
  ai_tool_name: string | null;
  ai_tool_other: string | null;
  purpose: string | null;
  purpose_other: string | null;
}

export interface PostSurvey {
  id: string;
  respondent_id: string;
  day_no: number | null;
  perceived_burden: number | null; // 1~5
  perceived_accuracy: number | null; // 1~5
  elapsed_seconds: number | null;
  created_at: string;
}

export interface QualityFlag {
  id: string;
  respondent_id: string;
  flag_type: 'speeding' | 'straightline' | 'duplicate_pattern' | 'attention_fail' | 'device_dup';
  detail: string | null;
  created_at: string;
}

export interface EventLog {
  id: string;
  respondent_id: string;
  event_type: 'open' | 'screen_start' | 'screen_pass' | 'consent' | 'day_start' | 'autosave' | 'day_complete' | 'dropoff' | 'reminder_sent' | 'submit';
  meta: Record<string, any> | null;
  ts: string;
}

export interface QuotaCell {
  id: string;
  dimension: 'sexage' | 'ksco';
  cell_key: string;
  label: string | null;
  target: number;
}

export interface QuotaProgressView {
  dimension: 'sexage' | 'ksco';
  cell_key: string;
  label: string | null;
  target: number;
  completed: number;
  in_progress: number;
}
