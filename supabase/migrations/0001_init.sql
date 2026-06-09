-- 2.1 응답자
create table respondents (
  id            uuid primary key default gen_random_uuid(),
  panel_source  text not null check (panel_source in ('membrain','panelnow','self','pilot')),
  panel_id      text,
  access_token  text unique not null,
  status        text not null default 'invited'
                check (status in ('invited','screened_in','screened_out','quota_full',
                                  'day1_done','completed','dropped')),
  quota_cell_sexage text,            -- 예: 'M_30_39'
  quota_cell_ksco   text,            -- 예: 'pro' (전문가)
  invited_at    timestamptz default now(),
  last_active_at timestamptz,
  created_at    timestamptz default now()
);

-- 2.2 스크리닝 (2단계)
create table screening (
  respondent_id uuid primary key references respondents(id) on delete cascade,
  age           int,
  age_band      text,                 -- '19_29','30_39','40_49','50_59','60_plus'
  sex           text check (sex in ('M','F')),
  employment_type text,               -- 'wage','self','none'(탈락)
  ai_freq       text,                 -- 'lt2'(주2회미만→탈락),'2_3','4_6','daily'
  ai_tool_free  text,                 -- 진정성 필터용 자유기술(도구)
  ai_purpose_free text,               -- 진정성 필터용 자유기술(목적)
  ksco_major    text,                 -- 표준직업분류 대분류 코드(아래 참조)
  passed        boolean default false,
  fail_reason   text,                 -- 'age','employment','ai_freq','quota_full','low_quality'
  created_at    timestamptz default now()
);

-- 2.3 기본정보(최종 제출 시)
create table demographics (
  respondent_id uuid primary key references respondents(id) on delete cascade,
  region        text,                 -- 거주지역(시도)
  ksco_minor    text,                 -- 직업 중분류
  monthly_work_hours int,             -- 월평균 근로시간
  income_decile int,                  -- 소득분위 1~10
  created_at    timestamptz default now()
);

-- 2.4 다이어리 일자 (1일차/2일차)
create table diary_days (
  id            uuid primary key default gen_random_uuid(),
  respondent_id uuid references respondents(id) on delete cascade,
  day_no        int not null check (day_no in (1,2)),
  survey_date   date,
  weekday       int,                  -- 1=월 … 5=금 (평일만 허용)
  status        text default 'not_started'
                check (status in ('not_started','in_progress','completed')),
  started_at    timestamptz,
  completed_at  timestamptz,
  unique (respondent_id, day_no)
);

-- 2.5 다이어리 활동 블록 (1블록 = 연속 슬롯 범위)
create table diary_entries (
  id            uuid primary key default gen_random_uuid(),
  diary_day_id  uuid references diary_days(id) on delete cascade,
  start_slot    int not null check (start_slot between 0 and 31),
  end_slot      int not null check (end_slot between 0 and 31),   -- inclusive
  activity_major text,                -- 활동 대분류 코드
  activity_minor text,                -- 세부
  activity_other text,                -- 직접입력
  location      text check (location in ('home','workplace','commute','outside','other')),
  ai_used       boolean default false,
  note          text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  check (end_slot >= start_slot)
);

-- 2.6 블록별 AI 도구 (블록당 1~n개)
create table entry_ai_tools (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid references diary_entries(id) on delete cascade,
  ai_type       text,                 -- AI 유형 코드(참조데이터)
  ai_tool_name  text,                 -- 도구명(카탈로그 선택)
  ai_tool_other text,                 -- 목록 외 직접입력
  purpose       text,                 -- 사용목적 코드
  purpose_other text
);

-- 2.7 사후 미니문항(일자별)
create table post_survey (
  id            uuid primary key default gen_random_uuid(),
  respondent_id uuid references respondents(id) on delete cascade,
  day_no        int,
  perceived_burden int,               -- 1~5
  perceived_accuracy int,             -- 1~5 자기보고 정확도(품질 가중)
  elapsed_seconds int,
  created_at    timestamptz default now()
);

-- 2.8 품질 플래그 (룰엔진)
create table quality_flags (
  id            uuid primary key default gen_random_uuid(),
  respondent_id uuid references respondents(id) on delete cascade,
  flag_type     text,                 -- 'speeding','straightline','duplicate_pattern','attention_fail','device_dup'
  detail        text,
  created_at    timestamptz default now()
);

-- 2.9 패러데이터(이벤트 로그) — 이탈/완료율 분석
create table events (
  id            uuid primary key default gen_random_uuid(),
  respondent_id uuid references respondents(id) on delete cascade,
  event_type    text,                 -- 'open','screen_start','screen_pass','consent','day_start',
                                       -- 'autosave','day_complete','dropoff','reminder_sent','submit'
  meta          jsonb,
  ts            timestamptz default now()
);

-- 2.10 할당 셀 관리
create table quota_cells (
  id          uuid primary key default gen_random_uuid(),
  dimension   text not null check (dimension in ('sexage','ksco')),
  cell_key    text not null,
  label       text,
  target      int not null,
  unique (dimension, cell_key)
);

-- 진행률 뷰(완료=2일완료 기준)
create view v_quota_progress as
select c.dimension, c.cell_key, c.label, c.target,
  count(r.id) filter (where r.status = 'completed') as completed,
  count(r.id) filter (where r.status in ('screened_in','day1_done')) as in_progress
from quota_cells c
left join respondents r
  on (c.dimension='sexage' and r.quota_cell_sexage = c.cell_key)
  or (c.dimension='ksco'   and r.quota_cell_ksco   = c.cell_key)
group by c.dimension, c.cell_key, c.label, c.target;
