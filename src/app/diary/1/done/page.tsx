"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import AppShell from "@/components/AppShell";

function Day1DoneContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("t");

  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [respondentId, setRespondentId] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  // 사후 문항 상태
  const [burden, setBurden] = useState<number>(0);
  const [accuracy, setAccuracy] = useState<number>(0);

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
          setRespondentId(data.respondent.id);
          
          fetch("/api/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ respondent_id: data.respondent.id, event_type: "day1_done_view" }),
          }).catch(err => console.error("Failed to log day1_done_view:", err));
        } else {
          router.replace("/");
        }
      } catch (err) {
        console.error("Verify error:", err);
        router.replace("/");
      } finally {
        setLoading(false);
      }
    };

    verifyRespondent();
  }, [token, router]);

  const handleSubmit = async () => {
    if (burden === 0 || accuracy === 0) {
      alert("오늘 시간다이어리 작성에 대한 부담감과 정확도를 모두 선택해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      // 다이어리 화면에서 저장해 둔 소요시간(초) 로드
      const savedElapsed = sessionStorage.getItem("day1_elapsed");
      const elapsedSeconds = savedElapsed ? parseInt(savedElapsed, 10) : 0;

      const res = await fetch("/api/post-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          respondent_id: respondentId,
          day_no: 1,
          perceived_burden: burden,
          perceived_accuracy: accuracy,
          elapsed_seconds: elapsedSeconds,
        }),
      });

      if (res.ok) {
        setIsSubmitted(true);
        // 완료 패러데이터 남기기 (Day1 완료 이벤트는 API 단에서 처리됨)
        sessionStorage.removeItem("day1_elapsed");
      } else {
        alert("제출 처리 중 오류가 발생했습니다.");
      }
    } catch (e) {
      console.error(e);
      alert("네트워크 연결을 확인해 주세요.");
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

  // 제출 완료 후 "다음 평일 안내" 화면 노출
  if (isSubmitted) {
    return (
      <AppShell title="1일차 완료">
        <div className="space-y-6 pt-10 text-center select-none">
          <span className="text-5xl inline-block mb-2 animate-bounce">✉️</span>
          <h2 className="text-xl font-extrabold text-navy">1일차 다이어리가 제출되었습니다!</h2>
          
          <div className="bg-[#f3fbfd] border border-[#d6eff6] rounded-2xl p-5 space-y-3 text-left max-w-sm mx-auto">
            <h3 className="text-sm font-bold text-[#0a6b80] flex items-center gap-1.5">
              <span>📅</span> 2일차 다이어리 안내
            </h3>
            <p className="text-xs text-[#407682] leading-relaxed">
              귀하의 1일차 데이터가 성공적으로 임시 정제 및 저장되었습니다.
              <strong>다음 평일 오전 9시</strong>에 2일차 다이어리 작성을 시작하실 수 있도록 SMS 또는 알림을 발송해 드리겠습니다.
            </p>
            <p className="text-xs text-gray-500 leading-relaxed bg-white/60 p-2.5 rounded-lg border border-gray-100">
              * 기존에 받으신 설문 참여 링크(?t=토큰)를 사용해 언제든지 동일하게 접속하여 작성을 이어가실 수 있습니다.
            </p>
          </div>

          <p className="text-xs text-gray-400">참여해주셔서 대단히 감사합니다.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      headerContent={
        <div className="space-y-1">
          <span className="text-xs font-semibold text-[#9fc7ec] tracking-wider">KISDI 시간다이어리</span>
          <h1 className="text-xl font-extrabold tracking-tight">1일차 작성 완료</h1>
        </div>
      }
      footerContent={
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="btn primary w-full text-center py-4 font-bold text-base shadow-lg shadow-navy/15"
        >
          {submitting ? "제출 처리 중..." : "1일차 사후 설문 제출하기"}
        </button>
      }
    >
      <div className="space-y-6 pb-20 select-none">
        <div className="bg-gradient-to-br from-navy to-[#2a4878] text-white p-5 rounded-2xl shadow-sm space-y-2">
          <p className="text-xs text-cyan font-bold tracking-wider">Day 1 COMPLETE</p>
          <h2 className="text-base font-extrabold">1일차 시간다이어리 작성을 축하드립니다!</h2>
          <p className="text-xs text-slate-200 leading-relaxed">
            방금 작성하신 다이어리에 대한 부담감과 실제 일과와의 정확도를 솔직하게 평가해 주세요. 사후 문항을 마저 제출하셔야 오늘 참여가 정상 인정됩니다.
          </p>
        </div>

        {/* 문항 1: 체감 부담 */}
        <div className="space-y-3.5 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <label className="text-sm font-extrabold text-navy leading-normal block">
            1. 오늘 시간다이어리를 작성하시는 데 느끼신 <span className="text-cyan font-black">시간적·심리적 부담</span>은 어느 정도였습니까?
          </label>
          <div className="flex justify-between gap-1.5">
            {[1, 2, 3, 4, 5].map((val) => {
              const labels = ["매우 편함", "편함", "보통", "부담됨", "매우 부담"];
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => setBurden(val)}
                  className={`flex-1 py-3 text-center rounded-xl border text-[10px] font-bold transition-all duration-200 ${
                    burden === val
                      ? "bg-navy border-navy text-white shadow-md shadow-navy/20 scale-105"
                      : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                  }`}
                  title={labels[val - 1]}
                >
                  <div className="text-sm font-extrabold mb-0.5">{val}</div>
                  <div className="whitespace-pre-line leading-tight">{labels[val - 1].replace(" ", "\n")}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 문항 2: 스스로 느끼는 작성 정확도 */}
        <div className="space-y-3.5 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <label className="text-sm font-extrabold text-navy leading-normal block">
            2. 오늘 작성하신 다이어리의 내용은 <span className="text-cyan font-black">실제 하루 일과와 얼마나 정확하게 일치</span>한다고 생각하십니까?
          </label>
          <div className="flex justify-between gap-1.5">
            {[1, 2, 3, 4, 5].map((val) => {
              const labels = ["전혀 안맞음", "대체로 안맞음", "보통", "대체로 맞음", "매우 정확"];
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => setAccuracy(val)}
                  className={`flex-1 py-3 text-center rounded-xl border text-[10px] font-bold transition-all duration-200 ${
                    accuracy === val
                      ? "bg-navy border-navy text-white shadow-md shadow-navy/20 scale-105"
                      : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                  }`}
                  title={labels[val - 1]}
                >
                  <div className="text-sm font-extrabold mb-0.5">{val}</div>
                  <div className="whitespace-pre-line leading-tight">{labels[val - 1].replace(" ", "\n")}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default function Day1Done() {
  return (
    <Suspense fallback={
      <div className="flex-grow flex items-center justify-center p-6 bg-white min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-navy border-t-cyan"></div>
      </div>
    }>
      <Day1DoneContent />
    </Suspense>
  );
}
