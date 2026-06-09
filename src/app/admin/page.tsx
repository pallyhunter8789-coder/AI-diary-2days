"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState, useEffect } from "react";

interface SummaryData {
  total: number;
  invited: number;
  screened_in: number;
  screened_out: number;
  quota_full: number;
  day1_done: number;
  completed: number;
  dropped: number;
  screen_passed: number;
  completion_rate: number;
}

interface QuotaProgressData {
  dimension: string;
  cell_key: string;
  label: string;
  target: number;
  completed: number;
  in_progress: number;
}

interface QualityFlagData {
  id: string;
  respondent_id: string;
  flag_type: string;
  detail: string;
  created_at: string;
  respondents: {
    panel_source: string;
    panel_id: string;
  } | null;
}

function AdminContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 비밀번호 상태
  const [password, setPassword] = useState<string>("");
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>("");

  // 대시보드 통계 상태
  const [loading, setLoading] = useState<boolean>(false);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [quotaProgress, setQuotaProgress] = useState<QuotaProgressData[]>([]);
  const [qualityFlags, setQualityFlags] = useState<QualityFlagData[]>([]);
  const [eventStats, setEventStats] = useState<Record<string, number>>({});

  // 1. admin 페이지 레이아웃 가로 폭 동적 확대 적용 (UX 트릭)
  useEffect(() => {
    if (isAuthorized) {
      const container = document.querySelector(".app-container") as HTMLElement;
      if (container) {
        container.style.maxWidth = "1200px";
      }
      return () => {
        if (container) {
          container.style.maxWidth = "";
        }
      };
    }
  }, [isAuthorized]);

  // 비밀번호 검증 및 초기 데이터 로드
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setAuthError("");

    try {
      const res = await fetch(`/api/admin?password=${password}`);
      const data = await res.json();

      if (res.ok && data.success) {
        setIsAuthorized(true);
        setSummary(data.summary);
        setQuotaProgress(data.quotaProgress);
        setQualityFlags(data.qualityFlags);
        setEventStats(data.eventStats);
        // 패스워드 로컬 스토리지 등에 저장하여 재진입 지원 가능
        sessionStorage.setItem("admin_pw", password);
      } else {
        setAuthError(data.error || "비밀번호가 올바르지 않습니다.");
      }
    } catch (err) {
      console.error(err);
      setAuthError("서버와의 연결에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 기존 세션 패스워드 자동 로그인 확인
  useEffect(() => {
    const savedPw = sessionStorage.getItem("admin_pw");
    if (savedPw) {
      setPassword(savedPw);
      // 자동 로그인 트리거
      const autoLogin = async () => {
        setLoading(true);
        try {
          const res = await fetch(`/api/admin?password=${savedPw}`);
          const data = await res.json();
          if (res.ok && data.success) {
            setIsAuthorized(true);
            setSummary(data.summary);
            setQuotaProgress(data.quotaProgress);
            setQualityFlags(data.qualityFlags);
            setEventStats(data.eventStats);
          } else {
            sessionStorage.removeItem("admin_pw");
          }
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      };
      autoLogin();
    }
  }, []);

  // 로그아웃
  const handleLogout = () => {
    sessionStorage.removeItem("admin_pw");
    setIsAuthorized(false);
    setPassword("");
    setSummary(null);
    setQuotaProgress([]);
    setQualityFlags([]);
    setEventStats({});
  };

  // CSV 다운로드 트리거
  const handleExport = (type: "raw" | "long" | "codebook") => {
    if (!isAuthorized) return;
    window.open(`/api/admin/export?password=${password}&type=${type}`, "_blank");
  };

  // 1. 인증되지 않은 상태 (로그인화면)
  if (!isAuthorized) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#f8fafc] min-h-screen">
        <div className="w-full max-w-sm bg-white rounded-3xl p-8 shadow-xl border border-gray-100 space-y-6">
          <div className="text-center space-y-2">
            <span className="text-4xl inline-block">🔐</span>
            <h1 className="text-2xl font-extrabold text-navy">관리자 대시보드</h1>
            <p className="text-xs text-gray-400">액세스 비밀번호를 입력해 주세요.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <input
                type="password"
                placeholder="비밀번호 입력 (기본: admin1234)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="txt text-sm py-3.5 px-4 w-full text-center"
                autoFocus
              />
            </div>
            {authError && (
              <p className="text-xs font-bold text-red-500 text-center">{authError}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="btn primary w-full py-3.5 text-sm font-bold shadow-lg shadow-navy/20"
            >
              {loading ? "인증 중..." : "대시보드 접속"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 2. 인증 완료 상태 (대시보드 노출)
  const sexageQuotas = quotaProgress.filter((q) => q.dimension === "sexage");
  const kscoQuotas = quotaProgress.filter((q) => q.dimension === "ksco");

  // 이탈율 단계 정의
  const stepLabels: Record<string, string> = {
    open: "1. 링크 접속",
    screen_start: "2. 스크리닝 시작",
    screen_pass: "3. 스크리닝 통과",
    consent: "4. 설문 동의",
    day_start: "5. 다이어리 진입",
    day_complete: "6. 1일차 완료",
    submit: "7. 최종 제출(완료)",
  };

  return (
    <div className="flex-1 bg-[#f8fafc] min-h-screen text-slate-800 p-4 sm:p-8 space-y-8 select-none">
      {/* 어드민 상단 헤더 */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-gray-200 pb-5 gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📊</span>
            <h1 className="text-2xl font-extrabold text-navy tracking-tight">KISDI 시간다이어리 관리자 대시보드</h1>
          </div>
          <p className="text-xs text-gray-500">실시간 수집 현황 검수 및 정제 데이터 CSV 내보내기 도구</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleLogout}
            className="btn ghost text-xs py-2 px-4 border border-gray-200"
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* 요약 카드 그리드 */}
      {summary && (
        <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-1">
            <span className="text-xs font-semibold text-gray-400 block">총 접속자 (시작)</span>
            <span className="text-2xl font-extrabold text-navy">{summary.total}</span>
            <span className="text-[10px] text-gray-400 block">초대 링크 접속 기준</span>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-1">
            <span className="text-xs font-semibold text-gray-400 block">스크리닝 제외/탈락</span>
            <span className="text-2xl font-extrabold text-red-500">{summary.screened_out + summary.quota_full}</span>
            <span className="text-[10px] text-gray-400 block">제외: {summary.screened_out} / 마감: {summary.quota_full}</span>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-1 bg-gradient-to-br from-emerald-50/50 to-transparent">
            <span className="text-xs font-semibold text-[#0f5132] block">스크리닝 통과</span>
            <span className="text-2xl font-extrabold text-emerald-600">{summary.screen_passed}</span>
            <span className="text-[10px] text-gray-400 block">다이어리 진입 자격 획득</span>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-1">
            <span className="text-xs font-semibold text-gray-400 block">작성 중 (진행형)</span>
            <span className="text-2xl font-extrabold text-amber-500">{summary.screened_in + summary.day1_done}</span>
            <span className="text-[10px] text-gray-400 block">1일완료: {summary.day1_done}명 대기</span>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-1">
            <span className="text-xs font-semibold text-gray-400 block">최종 완료 표본</span>
            <span className="text-2xl font-extrabold text-cyan font-black">{summary.completed}</span>
            <span className="text-[10px] text-gray-400 block">2일차 작성 최종제출</span>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-1">
            <span className="text-xs font-semibold text-gray-400 block">불성실 이탈/탈락</span>
            <span className="text-2xl font-extrabold text-gray-500">{summary.dropped}</span>
            <span className="text-[10px] text-gray-400 block">검수 탈락 처리 건수</span>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-1 bg-gradient-to-br from-cyan/10 to-transparent">
            <span className="text-xs font-semibold text-[#0a6b80] block">2일 연속 완료율</span>
            <span className="text-2xl font-extrabold text-cyan font-black">{summary.completion_rate}%</span>
            <span className="text-[10px] text-gray-400 block">스크리닝 통과자 대비 비율</span>
          </div>
        </section>
      )}

      {/* 내보내기 및 데이터 관리 도구 */}
      <section className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
        <h2 className="text-base font-extrabold text-navy">💾 정제 데이터 엑셀/CSV 다운로드</h2>
        <p className="text-xs text-gray-500 leading-normal">
          수집 완료된 설문 및 다이어리 블록 데이터를 통계 패키지(SPSS/R 등) 분석에 즉시 활용 가능한 형태로 다운로드합니다.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleExport("raw")}
            className="btn primary py-3 px-5 text-xs font-bold"
          >
            📋 원시 데이터 CSV (블록 단위)
          </button>
          <button
            onClick={() => handleExport("long")}
            className="btn cyan py-3 px-5 text-xs font-bold text-white"
          >
            📊 30분 슬롯 Long-Format CSV (분석 전개용)
          </button>
          <button
            onClick={() => handleExport("codebook")}
            className="btn ghost py-3 px-5 text-xs font-bold border border-gray-200"
          >
            📖 변수 코드북 CSV
          </button>
        </div>
      </section>

      {/* 2가지 Quotas 진행률 일람 */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 1. 성별 X 연령대 할당 현황 */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4 overflow-hidden">
          <h2 className="text-base font-extrabold text-navy">👥 성별 × 연령대 할당 진척도 (sexage)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-gray-200 text-gray-500 font-bold">
                  <th className="p-3">셀 키 (Cell Key)</th>
                  <th className="p-3">대상 인구 세그먼트</th>
                  <th className="p-3 text-center">목표 표본수 (Target)</th>
                  <th className="p-3 text-center">수집 완료 (Completed)</th>
                  <th className="p-3 text-center">작성 중 (In Progress)</th>
                  <th className="p-3 text-center">완료율 (%)</th>
                </tr>
              </thead>
              <tbody>
                {sexageQuotas.map((cell) => {
                  const rate = cell.target > 0 ? Math.round((cell.completed / cell.target) * 100) : 0;
                  const isShortage = cell.completed < cell.target;
                  return (
                    <tr key={cell.cell_key} className="border-b border-gray-100 hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold">{cell.cell_key}</td>
                      <td className="p-3 font-semibold">{cell.label}</td>
                      <td className="p-3 text-center font-bold">{cell.target}</td>
                      <td className={`p-3 text-center font-extrabold ${isShortage ? "text-red-500" : "text-cyan"}`}>
                        {cell.completed}
                      </td>
                      <td className="p-3 text-center font-semibold text-gray-500">{cell.in_progress}</td>
                      <td className="p-3 text-center font-extrabold">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] ${
                          rate >= 100 ? "bg-cyan/10 text-[#0397b5]" : "bg-red-50 text-red-500"
                        }`}>
                          {rate}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 2. 직종 대분류 할당 현황 */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4 overflow-hidden">
          <h2 className="text-base font-extrabold text-navy">💼 직종 대분류 할당 진척도 (ksco)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-gray-200 text-gray-500 font-bold">
                  <th className="p-3">셀 키 (Cell Key)</th>
                  <th className="p-3">직종 대분류명</th>
                  <th className="p-3 text-center">목표 표본수 (Target)</th>
                  <th className="p-3 text-center">수집 완료 (Completed)</th>
                  <th className="p-3 text-center">작성 중 (In Progress)</th>
                  <th className="p-3 text-center">완료율 (%)</th>
                </tr>
              </thead>
              <tbody>
                {kscoQuotas.map((cell) => {
                  const rate = cell.target > 0 ? Math.round((cell.completed / cell.target) * 100) : 0;
                  const isShortage = cell.completed < cell.target;
                  return (
                    <tr key={cell.cell_key} className="border-b border-gray-100 hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold">{cell.cell_key}</td>
                      <td className="p-3 font-semibold">{cell.label}</td>
                      <td className="p-3 text-center font-bold">{cell.target}</td>
                      <td className={`p-3 text-center font-extrabold ${isShortage ? "text-red-500" : "text-cyan"}`}>
                        {cell.completed}
                      </td>
                      <td className="p-3 text-center font-semibold text-gray-500">{cell.in_progress}</td>
                      <td className="p-3 text-center font-extrabold">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] ${
                          rate >= 100 ? "bg-cyan/10 text-[#0397b5]" : "bg-red-50 text-red-500"
                        }`}>
                          {rate}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 이탈 단계 분포 분석 (이벤트 로그 시각화) */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4 lg:col-span-1">
          <h2 className="text-base font-extrabold text-navy">🚶‍♂️ 단계별 참여/이탈 분포 (Funnel)</h2>
          <p className="text-[11px] text-gray-500">진입에서 최종 제출까지의 응답자 잔존 분석</p>
          <div className="space-y-3 pt-2">
            {Object.entries(stepLabels).map(([evKey, label]) => {
              const count = eventStats[evKey] || 0;
              const maxCount = Math.max(...Object.values(eventStats), 1);
              const barPercent = Math.round((count / maxCount) * 100);

              return (
                <div key={evKey} className="space-y-1 text-xs">
                  <div className="flex justify-between font-semibold">
                    <span className="text-slate-600">{label}</span>
                    <span className="font-bold text-navy">{count}건</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-navy to-cyan rounded-full transition-all duration-300"
                      style={{ width: `${barPercent}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 품질 flags 모니터링 */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4 lg:col-span-2 overflow-hidden">
          <h2 className="text-base font-extrabold text-navy">⚠️ 최근 검수 경고 발생 목록 (quality_flags)</h2>
          <p className="text-[11px] text-gray-500">룰엔진에 의해 경고 탐지된 응답자 (검수 단계에서 활용)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-gray-200 text-gray-500 font-bold">
                  <th className="p-3">응답자 ID</th>
                  <th className="p-3 text-center">패널 출처</th>
                  <th className="p-3 text-center">패널 ID</th>
                  <th className="p-3 text-center">경고 유형</th>
                  <th className="p-3">상세 내용</th>
                  <th className="p-3 text-center">감지 시간</th>
                </tr>
              </thead>
              <tbody>
                {qualityFlags.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-400 font-semibold">
                      감지된 품질 검수 경고가 없습니다.
                    </td>
                  </tr>
                ) : (
                  qualityFlags.map((flag) => (
                    <tr key={flag.id} className="border-b border-gray-100 hover:bg-red-50/10">
                      <td className="p-3 font-mono font-semibold text-slate-500 text-[10px] truncate max-w-[100px]">
                        {flag.respondent_id}
                      </td>
                      <td className="p-3 text-center font-bold text-slate-600">{flag.respondents?.panel_source || "-"}</td>
                      <td className="p-3 text-center font-semibold text-slate-600">{flag.respondents?.panel_id || "-"}</td>
                      <td className="p-3 text-center font-bold">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                          flag.flag_type === "speeding" ? "bg-red-100 text-red-600" :
                          flag.flag_type === "straightline" ? "bg-amber-100 text-amber-700" :
                          flag.flag_type === "duplicate_pattern" ? "bg-indigo-100 text-indigo-600" : "bg-gray-100 text-gray-600"
                        }`}>
                          {flag.flag_type}
                        </span>
                      </td>
                      <td className="p-3 text-gray-600">{flag.detail}</td>
                      <td className="p-3 text-center text-gray-400 text-[10px]">
                        {new Date(flag.created_at).toLocaleString("ko-KR", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function Admin() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center p-6 bg-[#f8fafc] min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-navy border-t-cyan"></div>
      </div>
    }>
      <AdminContent />
    </Suspense>
  );
}
