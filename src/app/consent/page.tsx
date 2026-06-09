"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import AppShell from "@/components/AppShell";

function ConsentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("t");

  const [checked, setChecked] = useState<boolean>(false);
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
      const parsed = JSON.parse(saved);
      setS1Data(parsed);
      setVerifying(false);

      if (parsed.respondentId) {
        fetch("/api/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ respondent_id: parsed.respondentId, event_type: "consent_view" }),
        }).catch(err => console.error("Failed to log consent_view:", err));
      }
    } catch (e) {
      console.error("Failed to parse S1 data:", e);
      router.replace(`/screen/1?t=${token}`);
    }
  }, [token, router]);

  const handleConsent = async () => {
    if (!checked || !s1Data || loading) return;

    setLoading(true);
    try {
      await fetch("/api/event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          respondent_id: s1Data.respondentId,
          event_type: "consent",
          meta: { access_token: token },
        }),
      });

      router.push(`/onboarding?t=${token}`);
    } catch (e) {
      console.error("Failed to log consent event:", e);
      router.push(`/onboarding?t=${token}`);
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-navy border-t-cyan"></div>
      </div>
    );
  }

  return (
    <AppShell
      title="참여 동의서"
      footerContent={
        <button
          onClick={handleConsent}
          disabled={!checked || loading}
          className={`btn w-full text-center transition-all ${
            checked && !loading ? "primary" : "ghost text-gray-400 cursor-not-allowed"
          }`}
        >
          {loading ? "동의 처리 중..." : "동의하고 시작하기"}
        </button>
      }
    >
      <div className="space-y-6 pb-10">
        <div className="space-y-2">
          <h2 className="text-xl font-extrabold text-navy">개인정보 수집 및 참여 동의</h2>
          <p className="text-xs text-gray-400">조사 참여를 위해 아래 동의 내용을 확인해 주세요.</p>
        </div>

        {/* 상세 규정 약관 안내 */}
        <div className="border border-gray-100 rounded-2xl bg-gray-50/50 p-5 space-y-5 text-sm leading-relaxed text-gray-600">
          <div className="space-y-2">
            <h3 className="font-bold text-navy text-sm">1. 조사 목적 및 활용</h3>
            <p className="text-xs">
              본 조사는 인공지능(AI) 기술 확산에 따른 이용자들의 시간 활용 방식 변화를 정밀하게 분석하기 위해 정보통신정책연구원(KISDI)의 학술 연구 목적으로 수행됩니다.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-bold text-navy text-sm">2. 개인정보 수집 및 보유 기간</h3>
            <p className="text-xs">
              - 수집 항목: 성별, 연령, 고용형태, 거주지역, 직종, 근로시간, 소득분위, 일자별 다이어리 기록 및 AI 활용 내역<br />
              - 보유 기간: 통계 분석 및 연구 보고서 작성 완료 시점(조사 종료 후 1년 이내)까지 보유하며, 이후 안전하게 파기됩니다.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-bold text-navy text-sm">3. 연속 2일 참여 요건</h3>
            <p className="text-xs">
              본 조사는 평일 기준 **연속된 2일**간 다이어리를 작성해야 유효한 응답(유효표본)으로 인정받으실 수 있습니다. 1일만 작성하고 중도 이탈하실 경우 분석 대상에서 제외되며 정산이 제한될 수 있습니다.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-bold text-navy text-sm">4. 사례비 정산 및 지급</h3>
            <p className="text-xs">
              2일 연속 다이어리 작성을 무사히 마친 유효 응답자분들께는 패널사를 통해 사전에 안내된 금액 기준에 따라 사례비가 지급됩니다.
            </p>
          </div>
        </div>

        {/* 동의 체크 칩 */}
        <div
          onClick={() => setChecked(!checked)}
          className={`flex items-center space-x-3 p-4 border rounded-2xl cursor-pointer transition-all ${
            checked 
              ? "bg-[#f3fbfd] border-cyan text-navy font-bold" 
              : "border-gray-200 text-gray-500 font-semibold"
          }`}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={() => {}}
            className="w-5 h-5 accent-cyan rounded cursor-pointer"
          />
          <span className="text-sm select-none">위 개인정보 및 약관에 동의합니다. (필수)</span>
        </div>
      </div>
    </AppShell>
  );
}

export default function Consent() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center p-6 bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-navy border-t-cyan"></div>
      </div>
    }>
      <ConsentContent />
    </Suspense>
  );
}
