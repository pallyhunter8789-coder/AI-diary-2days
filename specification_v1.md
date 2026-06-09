AI 시간다이어리 조사 웹앱 — 빌드 명세서 (Antigravity용) v1
발주: KISDI 「AI 시간다이어리 조사」 · 수행: 테헤란씨씨 목적: 패널(멤브레인·패널나우) 응답자가 전량 본 웹앱에서 2일 연속 시간다이어리를 작성한다. 이 문서 하나로 Antigravity(또는 임의의 에이전트형 IDE)가 MVP를 빌드할 수 있도록 작성됨.


0. 확정 파라미터 (제안서 기준 — 변경 금지)
항목
값
기록 시간대
평일 08:00 ~ 24:00
슬롯 단위
30분 (1시간 미만 충족) → 하루 32 슬롯 (index 0~31)
슬롯 인덱스
0 = 08:00–08:30 … 31 = 23:30–24:00
기록 일수
연속 2일(평일)
입력 방식
드래그형 경량 다이어리 (블록을 드래그로 채우고 탭하여 상세 입력)
핵심 수집
활동내용·장소 + AI 사용여부·도구명·사용목적
유효표본
2일 연속 완료 건만 인정 (1일만 = 부분데이터, 유효 제외)
디자인
navy #203864 / cyan #04BEE7 / 폰트 Pretendard 또는 Malgun Gothic, 모바일 우선


1. 기술 스택 & 아키텍처
Frontend: Next.js 14+ (App Router), TypeScript, Tailwind CSS, 모바일 우선 반응형
Backend: Next.js Route Handlers (app/api/**) — 응답자는 DB에 직접 접근하지 않고 API를 경유
DB/Storage: Supabase (Postgres + Storage). 서버 라우트에서 service role 키로 접근, 클라이언트엔 anon 키 노출 금지
인증: 로그인 없음. 패널사 링크의 단일 접속 토큰(?t=<token>)으로 식별/재진입
배포: Vercel
상태: 다이어리 격자는 React 클라이언트 상태 + 디바운스 자동저장(블록 변경 800ms 후 API 저장)
알림(리마인드): 1차는 패널사 발송 연계, 2차(자체)는 이메일/SMS 훅(/api/reminder) — MVP에선 인터페이스만, 실제 발송은 외부 연계

[패널사 링크 ?t=token]

        │

        ▼

 Next.js (Vercel) ── app/api/* (service role) ── Supabase Postgres

        │                                              │

   클라이언트(React)                              Storage(export)


2. 데이터 모델 (Supabase / Postgres)
아래 SQL을 Supabase SQL Editor에 그대로 실행. RLS는 켜되 정책은 “서버(service role)만 접근”으로 둔다(응답자는 API 경유).

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

분석용 long-format: respondent × day_no × slot(0..31) 로 펼친 뷰를 export 시 생성 → 제안서의 long-format 데이터 모델과 일치. (블록 → 슬롯 전개)


3. 참조 데이터 (시드)
3.1 표준직업분류(KSCO) 대분류 — 스크리닝/할당
코드
명칭
할당
mgr
관리자
110
pro
전문가 및 관련 종사자
320
clerk
사무 종사자
270
service
서비스 종사자
110
sales
판매 종사자
100
craft
기능원·기능 종사자
40
machine
장치·기계조작·조립
30
labor
단순노무 종사자
20
farm
농림어업
제외
military
군인
제외
3.2 성별×연령 인터로킹 할당 (quota_cells dimension='sexage')
cell_key
target

cell_key
target
M_19_29
120

F_19_29
100
M_30_39
165

F_30_39
135
M_40_49
160

F_40_49
130
M_50_59
105

F_50_59
85
3.3 AI 도구 유형 (ai_type) + 예시 도구
코드
유형
예시 도구
chat
대화형·생성형 AI
ChatGPT, Claude, Gemini, Clova X
search
AI 검색·정보
Perplexity, AI Overview
doc
문서·업무 보조(요약·작성·번역)
Copilot, Notion AI, 뤼튼
code
코드 작성 보조
GitHub Copilot, Cursor
image
이미지·영상 생성
Midjourney, DALL·E, Sora
voice
음성·전사
Clova Note, Whisper
auto
데이터·업무 자동화
—
other
기타(직접입력)
—

도구명은 카탈로그에서 선택, 목록에 없으면 직접입력(필수 요건).
3.4 사용목적 (purpose)
work(업무수행) · learn(정보탐색·학습) · write(문서작성) · decide(의사결정지원) · create(창작) · personal(일상·개인용무) · other(기타)
3.5 활동 대분류 (activity_major) — 최소 세트(중분류는 직접입력 허용)
work(업무) · meeting(회의·소통) · meal(식사) · move(이동) · rest(휴식·여가) · house(가사·돌봄) · study(학습) · personal(개인용무) · other(기타)
3.6 장소 (location)
home(집) · workplace(직장) · commute(이동중) · outside(외부) · other(기타)


4. 화면 흐름 (전체)
(0) 토큰 진입  ?t=token

     │  유효? ──아니오→ [만료/오류 안내]

     ▼ 예

(1) 스크리닝 S1  연령·고용형태 ──탈락→ [정중 종료(screened_out)]

     ▼ 통과

(2) 스크리닝 S2  AI빈도·도구/목적 자유기술·직종

     │  주2회미만→탈락 / 셀마감→ quota_full 종료 / 저품질→탈락

     ▼ 통과 → quota_cell 배정, status=screened_in

(3) 동의(개인정보·조사목적·사례비 안내)

     ▼

(4) 온보딩 튜토리얼(드래그·슬롯·AI태깅 30초)

     ▼

(5) 다이어리 Day1  (격자+드래그+블록상세)  ── 자동저장

     ▼ 완료(빈슬롯 확인 통과) → day1_done

(6) Day1 사후 미니문항 → "내일 다시 안내" → reminder 예약

     ▼ (다음 평일, 동일 토큰 재진입)

(7) 다이어리 Day2  (동일)

     ▼ 완료

(8) 기본정보(거주지역·직업중분류·월근로시간·소득분위)

     ▼

(9) Day2 사후 미니문항 → 최종 제출 status=completed

     ▼

(10) 완료/사례비 안내 (패널사 정산 안내)

[관리자] /admin  ── 셀별 진행률·완료율·이탈·부스터·export

재진입 규칙: 동일 토큰으로 들어오면 status에 따라 마지막 위치로 복귀(이어쓰기). Day1 완료 후엔 Day2 안내 화면으로.


5. 화면별 상세 명세
5.1 진입 /?t=<token>
토큰 검증 → respondents 조회. 없거나 만료 → 오류 화면. events:open 기록.
상태 분기: invited→스크리닝 / screened_in→Day1 / day1_done→Day2 안내 / completed→완료 화면.
5.2 스크리닝 S1 /screen/1
필드: 연령(숫자, 만19세 미만 탈락), 고용형태(임금근로자/자영업자/해당없음→탈락), 성별.
통과 시 S2.
5.3 스크리닝 S2 /screen/2
AI 사용빈도(최근 4주): 주2회 미만(탈락)/주2–3회/주4–6회/매일.
AI 도구 자유기술(1개+) + 사용목적 자유기술(진정성 필터; 공백·무의미 입력 시 저품질 플래그 후 탈락 가능).
직종(KSCO 대분류 선택). 농림어업·군인 선택 시 “대상 외” 종료.
통과 처리: age_band×sex로 quota_cell_sexage, 직종으로 quota_cell_ksco 배정 → 셀 마감 검사(v_quota_progress) → 마감이면 quota_full 종료, 아니면 screened_in.
AI 도구 정의·예시를 화면 상단에 명시(인식 편차 통제).
5.4 동의 /consent
개인정보 수집·이용, 조사목적, 2일 참여 안내, 사례비 안내, 데이터 활용(KISDI). 동의 체크 → events:consent.
5.5 온보딩 /onboarding
3스텝 코치마크: ① 시간 칸을 드래그해 활동 채우기 ② 칸을 탭해 상세 입력 ③ AI 썼으면 ✨ 토글 켜고 도구·목적 선택. "시작하기" → Day1.
5.6 다이어리 메인 /diary/[day] ★핵심 화면
레이아웃(모바일 우선)

상단 고정 헤더: "Day N · {요일} {날짜}", 진행률 바(채운 슬롯/32), 임시저장 표시("자동 저장됨").
본문: 세로 타임라인. 행 = 30분 슬롯(좌측 시간 라벨 08:00…23:30), 우측 = 슬롯 셀.
빈 슬롯: 연한 회색. 채워진 블록: 활동색 바 + 활동명 + (AI 사용 시) ✨ 배지(cyan).

상호작용

드래그 생성: 시작 슬롯 pointerdown → 아래로 드래그 → pointerup = 블록(start_slot~end_slot) 생성 → 즉시 하단 시트(bottom sheet) 로 상세 입력.
탭 편집: 블록 탭 → 하단 시트 열림.
삭제: 시트 내 삭제 버튼.
직전활동 복제: "직전과 동일" 버튼(반복업무 빠른 입력).
즐겨찾기: 자주 쓰는 활동·AI도구 핀.
pointer 이벤트 사용(터치+마우스 동시 지원).

블록 상세 시트 필드

활동 대분류(칩 선택) → 세부(선택/직접입력)
장소(칩: 집/직장/이동중/외부/기타)
AI 사용? 토글 → ON이면:
AI 유형(칩) → 도구명(유형별 카탈로그, 목록 외 직접입력) → 사용목적(칩)
도구 여러 개면 +추가(entry_ai_tools n행)
(선택) 메모
저장 시 diary_entries upsert + entry_ai_tools 교체, 디바운스 자동저장, events:autosave.

완료 검증

"완료" 클릭 → 빈 슬롯/시간 공백 안내(전부 채울 필요는 없으나 큰 공백은 확인 유도) → 확인 시 diary_days.status=completed, day_no=1이면 respondents.status=day1_done, events:day_complete.

검증/품질(클라이언트+서버)

슬롯 중복 금지(블록 범위 겹침 불가).
과속/직선 등은 서버 룰엔진(§6)에서 사후 판정.
5.7 Day1 완료 /diary/1/done
사후 미니문항(소요시간 자동기록, 체감 부담 1–5) → "다음 평일에 2일차 안내를 보내드립니다" → events:reminder_sent(훅).
5.8 Day2 안내/진입
동일 토큰 재진입 → Day2 격자(5.6 동일). 완료 → 5.9.
5.9 기본정보 + 최종 제출 /finish
거주지역, 직업 중분류, 월평균 근로시간, 소득분위(1–10). (성·연령·고용·AI빈도는 스크리닝값 재사용)
Day2 사후 미니문항 → "제출" → respondents.status=completed, events:submit.
5.10 완료 /complete
참여 감사 + 사례비 정산 안내(패널사). 재진입 시 동일 화면.
5.11 관리자 /admin (토큰/비번 보호)
카드: 전체 초대/스크리닝 통과/Day1완료/2일완료/이탈, 2일 완료율(%).
셀별 진행률 표(sexage, ksco) — target 대비 completed/in_progress, 부족 셀 하이라이트(부스터 판단).
품질 플래그 목록, 이탈 시점 분포(events).
Export 버튼: 원시(블록), long-format(슬롯), 코드북.


6. 품질 룰엔진 / 패러데이터
서버 배치 또는 제출 시 트리거로 quality_flags 생성(자동 탈락이 아니라 검수 대상 표시):

speeding: 다이어리 총 활성 입력시간 < 임계(예: 90초/일) → 플래그
straightline: 동일 활동이 K슬롯 이상 무변화 + 장소·AI 동일 반복 → 플래그
duplicate_pattern: Day1=Day2 거의 동일 패턴 → 플래그
attention_fail: 숨은 어텐션 체크 1문항 불일치
device_dup: 동일 디바이스/IP 다중 토큰
모든 events로 이탈 시점·소요시간·재진입 추적 → 완료율·이탈관리 보고서 근거.


7. 유효표본 · 할당 로직
유효 = respondents.status='completed'(2일 완료). day1_done 은 유효표본 아님(이탈 분석용).
스크리닝 통과 시 셀 배정 → 셀 target 도달(completed 기준) 시 신규 통과자 quota_full 종료.
초과모집 버퍼: 완료율 80% 가정 → 순 1,000 위해 약 1,250~1,300 초대. 셀별 부족분 부스터 우선 초대.


8. 데이터 내보내기 (산출물)
원시(블록): respondents+screening+demographics+diary_entries+entry_ai_tools join (CSV/XLSX)
long-format(슬롯): 블록을 슬롯(0–31)으로 전개 → respondent_id, day_no, slot, time, activity, location, ai_used, ai_type, ai_tool, purpose
코드북: 변수명·라벨·값 정의·결측 규칙 (md/xlsx)
온라인 설문 양식: 화면/문항 export(응답 환경 검토용)


9. UX 디테일 (응답피로 저감 — RFP 평가 포인트)
직전활동 복제 / 즐겨찾기 / 진행률 바 / 자동 임시저장·이어쓰기 / 리마인드.
큰 터치 타깃, 한 화면 1동작, 칩 선택 우선(자유입력 최소화), 다크 미사용·고대비.
색상: 활동 바(중립색), AI 사용 블록은 cyan ✨ 강조(스크린샷에서 'AI 침투'가 시각적으로 드러남 → 제안서·발표 캡처에 유리).


10. Antigravity 빌드 프롬프트 (복붙용)
아래를 Antigravity 프로젝트 지시문으로 사용. §2 SQL과 §3 시드를 함께 첨부.

프로젝트: "AI 시간다이어리" 설문 수집 웹앱 (Next.js 14 App Router + TypeScript + Tailwind + Supabase + Vercel).

한국어 UI, 모바일 우선. 디자인 토큰: --navy #203864, --cyan #04BEE7, 폰트 Pretendard.

핵심 화면(라우트):

- /?t=token  : 토큰 검증 후 상태별 분기

- /screen/1, /screen/2 : 2단계 스크리닝(연령·고용·성별 → AI빈도·도구/목적 자유기술·직종)

- /consent, /onboarding

- /diary/[day] : 30분 슬롯 32칸(08:00–24:00) 세로 타임라인. 드래그로 활동 블록 생성,

  탭하면 하단 시트에서 활동/장소/AI사용(유형→도구명(목록 외 직접입력)→목적) 입력.

  진행률 바, 직전활동 복제, 자동저장(디바운스 800ms). AI 사용 블록은 cyan ✨ 배지.

- /diary/1/done, /finish, /complete

- /admin : 셀별(성별×연령, 직종) 진행률, 2일 완료율, 품질 플래그, CSV/XLSX export

데이터: 첨부 SQL(respondents, screening, demographics, diary_days, diary_entries,

entry_ai_tools, post_survey, quality_flags, events, quota_cells, v_quota_progress) 사용.

응답자는 DB 직접접근 금지 — 모든 쓰기는 app/api/* 라우트(service role)에서 처리.

유효표본 = 2일 연속 완료(status='completed')만 인정. 스크리닝 통과 시 quota 셀 배정,

셀 target 도달 시 quota_full 종료.

수용 기준:

1) 모바일에서 드래그로 30분 블록 생성·편집·삭제가 매끄럽게 동작(터치+마우스).

2) AI 사용 토글 ON 시 유형→도구→목적 선택 및 목록 외 직접입력 가능.

3) 새로고침/재진입 시 동일 토큰으로 작성 내용 복원(자동저장).

4) /admin에서 셀별 진행률과 2일 완료율이 보이고 CSV export 동작.

5) Day1 완료 후 Day2 진입, Day2 완료 후 기본정보→제출→completed.


11. 내일 확정할 의사결정 목록
연속 2일 정의: 금요일 Day1 → 다음 월요일 Day2 허용 여부(기본: 연속 평일, 금→월 허용 옵션).
알림 채널: 자체 SMS(발송 비용/사업자) vs 패널사 발송 일원화(권장: 패널사 1차 + 이메일 보조).
어텐션 체크 문항 1개 문구 확정.
활동 분류 깊이: 대분류만 + 직접입력(현재) vs 중분류 코드표까지 제공.
사례비 차등: 2일 완료 vs 1일만의 부분 지급 정책(패널사 정산 규칙과 정합).
관리자 보호 방식: 단순 비번 vs Supabase Auth 별도.
도구 카탈로그 초기 목록 확정(국내 서비스 포함: Clova X, 뤼튼 등).


다음 단계 (내일)
위 명세로 Antigravity 빌드 → 핵심 화면(스크리닝/다이어리/완료) 동작 확인
다이어리 격자 화면 캡처 4컷(스크리닝→격자→AI태깅 시트→완료) 확보 → 제안서 §II-4 삽입 + 발표자료(Day3)
파일럿용 시드(quota_cells, 카탈로그) 입력 후 내부 QA

