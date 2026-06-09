"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState, useEffect, useRef } from "react";
import AppShell from "@/components/AppShell";

const REGIONS = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"
];

function FinishContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("t");

  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [respondentId, setRespondentId] = useState<string | null>(null);

  // 입력 필드 상태
  const [region, setRegion] = useState<string>("");
  const [kscoMinor, setKscoMinor] = useState<string>("");
  const [workHours, setWorkHours] = useState<string>("");
  const [incomeDecile, setIncomeDecile] = useState<number>(0);
  const [attentionCheck, setAttentionCheck] = useState<number>(0);
  const [burden, setBurden] = useState<number>(0);
  const [accuracy, setAccuracy] = useState<number>(0);

  // 소요시간 계산용
  const pageLoadTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!token) {
      router.replace("/");
      return;
    }

    const verifyRespondent = async () => {
      try {
        const res = await fetch(`/api/respondent?t=${token}`);
        const data = await res.json();
        
        if (res.ok && data.success) {
          // 2일차 완료할 수 있는 상태인지 검증 (day1_done 등이어야 함)
          const status = data.respondent.status;
          if (status !== "day1_done" && status !== "screened_in" && status !== "completed") {
            // 비정상 진입 시 홈으로
            router.replace("/");
            return;
          }
          setRespondentId(data.respondent.id);

          fetch("/api/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ respondent_id: data.respondent.id, event_type: "finish_start" }),
          }).catch(err => console.error("Failed to log finish_start:", err));
        } else {
          router.replace("/");
        }
      } catch (err) {
        console.error("Verification error:", err);
        alert("사용자 확인에 실패했습니다.");
      } finally {
        setLoading(false);
      }
    };

    verifyRespondent();
  }, [token, router]);

  const handleSubmit = async () => {
    if (!region) {
      alert("거주지역을 선택해 주세요.");
      return;
    }
    if (!kscoMinor.trim()) {
      alert("직업 중분류(또는 구체적인 업무명)를 입력해 주세요.");
      return;
    }
    const hoursNum = parseInt(workHours, 10);
    if (isNaN(hoursNum) || hoursNum <= 0 || hoursNum > 720) {
      alert("올바른 월평균 근로시간을 입력해 주세요. (예: 160)");
      return;
    }
    if (incomeDecile === 0) {
      alert("소득분위를 선택해 주세요.");
      return;
    }
    if (attentionCheck === 0) {
      alert("신뢰성 검증 문항을 선택해 주세요.");
      return;
    }
    if (burden === 0 || accuracy === 0) {
      alert("2일차 사후 설문 항목을 모두 체크해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const elapsed = Math.round((Date.now() - pageLoadTimeRef.current) / 1000);
      
      const res = await fetch("/api/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          respondent_id: respondentId,
          region,
          ksco_minor: kscoMinor.trim(),
          monthly_work_hours: hoursNum,
          income_decile: incomeDecile,
          attention_check_val: attentionCheck,
          perceived_burden: burden,
          perceived_accuracy: accuracy,
          elapsed_seconds: elapsed,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // 최종 완료 화면으로 이동
        router.push(`/complete?t=${token}`);
      } else {
        alert(data.error || "제출에 실패했습니다. 입력 양식을 다시 확인해주세요.");
      }
    } catch (e) {
      console.error(e);
      alert("네트워크 연결 중 문제가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-grow flex items-center justify-center p-6 bg-white min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-navy border-t-cyan"></div>
      </div>
    );
  }

  return (
    <AppShell
      headerContent={
        <div className="space-y-1">
          <span className="text-xs font-semibold text-[#9fc7ec] tracking-wider">최종 제출 단계</span>
          <h1 className="text-xl font-extrabold tracking-tight">기본정보 & 사후 설문</h1>
        </div>
      }
      footerContent={
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="btn primary w-full text-center py-4 font-bold text-base"
        >
          {submitting ? "제출 처리 중..." : "다이어리 최종 제출하기"}
        </button>
      }
    >
      <div className="space-y-6 pb-24">
        {/* 인트로 카드 */}
        <div className="bg-gradient-to-br from-navy to-[#2c4b7c] rounded-2xl p-5 text-white space-y-2 shadow-md">
          <p className="text-xs font-semibold text-cyan tracking-wider">마지막 단계입니다!</p>
          <h2 className="text-base font-bold">2일차 조사를 무사히 마쳤습니다.</h2>
          <p className="text-xs text-gray-200 leading-relaxed">
            통계 분석에 활용될 기본적인 인적사항과 오늘 다이어리 작성에 대한 사후 문항을 마저 작성하시고 최종 제출해 주세요.
          </p>
        </div>

        {/* 1. 거주지역 */}
        <div className="space-y-2.5">
          <label className="text-sm font-extrabold text-navy flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan"></span>
            거주 지역 (시/도)
          </label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="txt text-sm py-3 px-4 w-full"
          >
            <option value="">-- 거주 지역 선택 --</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {/* 2. 직업 중분류 */}
        <div className="space-y-2.5">
          <label className="text-sm font-extrabold text-navy flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan"></span>
            직업 세부 명칭 (직업 중분류)
          </label>
          <p className="text-[11px] text-gray-500 leading-normal">
            수행하시는 업무를 구체적으로 입력해 주세요.<br />
            (예: 소프트웨어 개발자, 카페 바리스타, 인사총무 기획자, 마케터 등)
          </p>
          <input
            type="text"
            placeholder="직업이나 담당 직무를 적어주세요."
            value={kscoMinor}
            onChange={(e) => setKscoMinor(e.target.value)}
            className="txt text-sm py-3 px-4 w-full"
          />
        </div>

        {/* 3. 월평균 근로시간 */}
        <div className="space-y-2.5">
          <label className="text-sm font-extrabold text-navy flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan"></span>
            월평균 근로시간
          </label>
          <p className="text-[11px] text-gray-500 leading-normal">
            주휴일 등을 포함해 평소 한 달 동안 일하시는 시간을 적어주세요. (주 40시간 근무 시 보통 월 174시간 내외)
          </p>
          <div className="relative">
            <input
              type="number"
              pattern="[0-9]*"
              placeholder="예: 160"
              value={workHours}
              onChange={(e) => setWorkHours(e.target.value)}
              className="txt text-sm py-3 pl-4 pr-12 w-full font-semibold"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">시간</span>
          </div>
        </div>

        {/* 4. 가구 소득분위 */}
        <div className="space-y-2.5">
          <label className="text-sm font-extrabold text-navy flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan"></span>
            가구 월평균 소득 분위 (1분위 ~ 10분위)
          </label>
          <p className="text-[11px] text-gray-500 leading-normal">
            가장 낮은 소득(1분위)부터 가장 높은 소득(10분위)까지 가구 총소득의 대략적인 분위를 선택해 주세요.
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            {Array.from({ length: 10 }).map((_, i) => {
              const val = i + 1;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => setIncomeDecile(val)}
                  className={`py-2.5 text-center rounded-xl border text-xs font-bold transition-all duration-150 ${
                    incomeDecile === val
                      ? "bg-navy border-navy text-white shadow-md shadow-navy/20 scale-105"
                      : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {val}분위
                </button>
              );
            })}
          </div>
        </div>

        {/* 주의 확인 (어텐션 체크) 문항 */}
        <div className="space-y-2.5 border-t border-gray-100 pt-6">
          <label className="text-sm font-extrabold text-navy flex items-center gap-1.5 leading-normal">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            신뢰성 확인 검증 문항
          </label>
          <p className="text-[11px] text-[#203864] bg-[#f0f4f9] p-3.5 rounded-xl leading-normal">
            본 설문조사의 성실한 참여 여부를 검증하기 위한 확인 문항입니다. 문항 내용을 정독하고 아래 보기 중 <strong>'3번(2025년)'</strong>을 터치해 주십시오.
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map((val) => {
              const years = ["2023년", "2024년", "2025년", "2026년", "없음"];
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => setAttentionCheck(val)}
                  className={`py-3 text-center rounded-xl border text-[10px] font-bold transition-all duration-150 ${
                    attentionCheck === val
                      ? "bg-navy border-navy text-white shadow-md shadow-navy/20 scale-105"
                      : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  <div className="text-xs font-bold mb-0.5">{val}번</div>
                  <div>{years[val - 1]}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 5. 2일차 사후 미니문항 */}
        <div className="border-t border-gray-100 pt-6 space-y-6">
          <h3 className="text-base font-extrabold text-navy flex items-center gap-2">
            <span>📊</span> 2일차 작성 사후 조사
          </h3>

          {/* 문항 1: 체감 부담 */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-navy block">
              1. 오늘 시간다이어리를 작성하시는 데 느끼신 <span className="text-cyan font-extrabold">시간적·심리적 부담</span>은 어느 정도였습니까?
            </label>
            <div className="flex justify-between gap-1">
              {[1, 2, 3, 4, 5].map((val) => {
                const labels = ["매우 편함", "편함", "보통", "부담됨", "매우 부담"];
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setBurden(val)}
                    className={`flex-1 py-1.5 px-0.5 text-center rounded-xl border text-[9px] font-bold transition-all duration-200 ${
                      burden === val
                        ? "bg-navy border-navy text-white shadow-md shadow-navy/20 scale-105"
                        : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    <div className="text-xs font-extrabold mb-0.5">{val}</div>
                    <div className="whitespace-pre-line leading-tight">{labels[val - 1].replace(" ", "\n")}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 문항 2: 스스로 느끼는 작성 정확도 */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-navy block">
              2. 오늘 작성하신 다이어리의 내용은 <span className="text-cyan font-extrabold">실제 하루 일과와 얼마나 정확하게 일치</span>한다고 생각하십니까?
            </label>
            <div className="flex justify-between gap-1">
              {[1, 2, 3, 4, 5].map((val) => {
                const labels = ["전혀 안맞음", "대체로 안맞음", "보통", "대체로 맞음", "매우 정확"];
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAccuracy(val)}
                    className={`flex-1 py-1.5 px-0.5 text-center rounded-xl border text-[9px] font-bold transition-all duration-200 ${
                      accuracy === val
                        ? "bg-navy border-navy text-white shadow-md shadow-navy/20 scale-105"
                        : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    <div className="text-xs font-extrabold mb-0.5">{val}</div>
                    <div className="whitespace-pre-line leading-tight">{labels[val - 1].replace(" ", "\n")}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default function Finish() {
  return (
    <Suspense fallback={
      <div className="flex-grow flex items-center justify-center p-6 bg-white min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-navy border-t-cyan"></div>
      </div>
    }>
      <FinishContent />
    </Suspense>
  );
}
