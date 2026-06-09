# AI 시간다이어리 설문조사 웹앱

## Getting Started

먼저 개발 서버를 구동합니다:

```bash
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속하여 결과를 확인할 수 있습니다.

## 1단계: 프로젝트 환경 변수 설정

`.env.local` 파일에 Supabase 설정 정보를 기입합니다:
```env
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

## 2단계: 데이터베이스 마이그레이션 및 시드 적재

본 프로젝트는 Supabase를 사용합니다. 마이그레이션 및 시드 데이터를 데이터베이스에 반영하려면 다음 방법 중 하나를 사용하십시오:

### 방법 A: Supabase SQL Editor 사용 (권장)
1. Supabase 대시보드(https://supabase.com)에 접속하여 프로젝트를 엽니다.
2. 좌측 메뉴의 **SQL Editor**로 이동합니다.
3. [supabase/migrations/0001_init.sql](file:///c:/Users/user/Desktop/AI%20%EC%8B%9C%EA%B0%84%EB%8B%A4%EC%9D%B4%EC%96%B4%EB%A6%AC%20%EC%9B%B9%EC%95%B1/supabase/migrations/0001_init.sql) 파일의 SQL 전체를 복사하여 쿼리 창에 붙여넣고 **Run** 버튼을 클릭하여 실행합니다.
4. 실행이 완료되면, [supabase/seed.sql](file:///c:/Users/user/Desktop/AI%20%EC%8B%9C%EA%B0%84%EB%8B%A4%EC%9D%B4%EC%96%B4%EB%A6%AC%20%EC%9B%B9%EC%95%B1/supabase/seed.sql) 파일의 SQL 전체를 복사하여 쿼리 창에 붙여넣고 **Run** 버튼을 클릭하여 실행합니다.

### 방법 B: Supabase CLI 사용
로컬에 Supabase CLI가 설치되어 있고 프로젝트에 연결되어 있다면 다음 명령어로 적용할 수 있습니다:
```bash
# 로컬 개발 데이터베이스의 경우
supabase db reset

# 원격 Supabase 데이터베이스의 경우 (자격 증명 필요)
supabase link --project-ref <your-project-id>
supabase db push
```

## 3단계: 로컬 테스트 진입

시드 데이터에 포함된 기본 테스트용 토큰은 다음과 같습니다:
- **토큰**: `test-token-1234`
- **테스트 진입 URL**: `http://localhost:3000/?t=test-token-1234`

해당 URL로 접속하면 토큰 검증 API(`GET /api/respondent?t=...`)를 거쳐 `/screen/1` 페이지로 분기(리다이렉션)됩니다.

## 4단계: Vercel 배포 가이드

본 프로젝트는 Next.js App Router를 사용하여 Vercel 플랫폼에 간편하게 배포할 수 있습니다.

### 1. 필요한 환경 변수 (Environment Variables)

Vercel 프로젝트 설정의 **Environment Variables** 탭에 다음 환경 변수들을 반드시 추가해 주어야 합니다:

| 환경 변수명 | 설명 | 값의 예시 |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 API URL (클라이언트 공개용) | `https://yourproject.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key (서버 사이드 API 전용, 절대 브라우저 노출 금지) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `ADMIN_PASSWORD` | 관리자 대시보드 (`/admin`) 접속 비밀번호 | `your-secret-password` (미지정 시 기본값 `admin1234`) |

### 2. 배포 순서

1. **데이터베이스 반영**: 배포를 시작하기 전에 반드시 **2단계**의 SQL 마이그레이션 및 시드 적재를 진행하여 Supabase 원격 테이블 및 Quota 설정, AI 카탈로그가 완성되어야 합니다.
2. **코드 푸시**: GitHub 또는 GitLab/Bitbucket 등의 원격 저장소에 코드를 푸시합니다.
3. **Vercel 프로젝트 연동**:
   - Vercel 대시보드에서 **Add New > Project**를 선택하고 해당 저장소를 가져옵니다.
   - **Framework Preset**이 `Next.js`로 자동 지정된 것을 확인합니다.
4. **환경 변수 구성**:
   - 위의 3개 환경 변수(`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`)를 추가합니다.
5. **빌드 및 배포**:
   - **Deploy** 버튼을 눌러 빌드를 진행합니다.
   - 배포가 완료되면 Vercel이 생성해 준 고유 호스팅 도메인(예: `https://your-project.vercel.app`)을 얻을 수 있습니다.

### 3. Vercel 배포 후 테스트
- 배포된 URL 뒤에 `/?t=test-token-1234`를 붙여 접속하여 실시간 설문 전과정이 원격 DB와 올바르게 작동하는지 확인합니다.
  - 예시: `https://your-project.vercel.app/?t=test-token-1234`
