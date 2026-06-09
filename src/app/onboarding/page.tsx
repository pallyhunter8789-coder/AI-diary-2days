"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import AppShell from "@/components/AppShell";

const STEPS = [
  {
    step: 1,
    title: "1. 시간 칸 드래그하기",
    desc: "다이어리 화면의 빈 시간 칸을 탭하고 아래로 드래그하여 활동을 하고 보낸 시간을 블록으로 칠해 줍니다. (30분 단위)",
    icon: "👆"
  },
  {
    step: 2,
    title: "2. 활동 및 장소 기록",
    desc: "드래그를 놓거나 칠해진 블록을 탭하면 하단 시트가 열립니다. 무엇을 했는지(활동), 어디서 했는지(장소)를 간편하게 칩으로 탭하여 입력합니다.",
    icon: "🏠"
  },
  {
    step: 3,
    title: "3. ✨ AI 도구 정보 기록",
    desc: "해당 시간에 AI 도구(ChatGPT, 번역기 등)를 썼다면 AI 사용 토글을 켜주세요. 사용한 AI의 유형과 목적, 그리고 도구명을 선택하거나 직접 입력합니다.",
    icon: "✨"
  }
];

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("t");

  const [activeStep, setActiveStep] = useState<number>(0);
  const [s1Data, setS1Data] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(true);

  useEffect(() => {
    if (!token) {
      router.replace("/");
      return;
    }

    const saved = sessionStorage.getItem("s1_data");
    if (!saved) {
      router.replace(`/screen/1?t=${token}`);
      return;
    }

    try {
      setS1Data(JSON.parse(saved));
      setVerifying(false);
    } catch (e) {
      console.error("Failed to parse S1 data:", e);
      router.replace(`/screen/1?t=${token}`);
    }
  }, [token, router]);

  const handleNext = async () => {
    if (activeStep < STEPS.length - 1) {
      setActiveStep(prev => prev + 1);
    } else {
      if (!s1Data || loading) return;
      
      setLoading(true);
      try {
        await fetch("/api/event", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            respondent_id: s1Data.respondentId,
            event_type: "day_start",
            meta: { access_token: token, day_no: 1 },
          }),
        });

        router.push(`/diary/1?t=${token}`);
      } catch (e) {
        console.error("Failed to log day_start event:", e);
        router.push(`/diary/1?t=${token}`);
      } finally {
        setLoading(false);
      }
    }
  };

  if (verifying) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-navy border-t-cyan"></div>
      </div>
    );
  }

  const isLast = activeStep === STEPS.length - 1;

  return (
    <AppShell
      title="작성 가이드"
      footerContent={
        <div className="w-full flex flex-col space-y-3">
          <div className="flex justify-center space-x-1.5 pb-1">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-2 rounded-full transition-all duration-300 ${
                  activeStep === i ? "w-6 bg-cyan" : "w-2 bg-gray-200"
                }`}
              ></span>
            ))}
          </div>
          <button
            onClick={handleNext}
            disabled={loading}
            className="btn primary w-full text-center py-4 text-base font-extrabold"
          >
            {loading ? "다이어리 생성 중..." : isLast ? "다이어리 작성 시작하기" : "다음"}
          </button>
        </div>
      }
    >
      <div className="h-full flex flex-col justify-between pb-6">
        <div className="space-y-2">
          <h2 className="text-xl font-extrabold text-navy">간편한 시간 기록 방법</h2>
          <p className="text-xs text-gray-400">설문 작성을 시작하기 전에 30초 튜토리얼을 확인해 주세요.</p>
        </div>

        <div className="my-auto py-10 text-center space-y-6">
          <div className="w-24 h-24 bg-[#f3fbfd] border border-[#d6eff6] rounded-3xl flex items-center justify-center text-4xl mx-auto shadow-sm">
            {STEPS[activeStep].icon}
          </div>
          
          <div className="space-y-3 px-4">
            <h3 className="text-lg font-bold text-navy">{STEPS[activeStep].title}</h3>
            <p className="text-sm text-gray-500 leading-relaxed min-h-[72px] max-w-xs mx-auto">
              {STEPS[activeStep].desc}
            </p>
          </div>
        </div>

        {activeStep < STEPS.length - 1 && (
          <button
            onClick={() => setActiveStep(STEPS.length - 1)}
            className="text-xs font-semibold text-gray-400 hover:text-navy mx-auto transition-colors"
          >
            가이드 건너뛰기
          </button>
        )}
      </div>
    </AppShell>
  );
}

export default function Onboarding() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center p-6 bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-navy border-t-cyan"></div>
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  );
}
