"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import AppShell from "@/components/AppShell";

function Screen1Content() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("t");

  const [age, setAge] = useState<string>("");
  const [sex, setSex] = useState<"M" | "F" | "">("");
  const [employmentType, setEmploymentType] = useState<"wage" | "self" | "none" | "">("");
  
  const [respondentId, setRespondentId] = useState<string | null>(null);
  const [checking, setChecking] = useState<boolean>(true);

  // 토큰 검증 및 기존 데이터 복원 (토큰 누락 시 자체 세션 자동 발급 및 이동)
  useEffect(() => {
    const checkToken = async () => {
      try {
        const url = token ? `/api/respondent?t=${encodeURIComponent(token)}` : "/api/respondent";
        const res = await fetch(url);
        const data = await res.json();
        
        if (res.ok && data.success) {
          if (!token && data.redirectPath) {
            router.replace(data.redirectPath);
            return;
          }

          setRespondentId(data.respondent.id);
          
          fetch("/api/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ respondent_id: data.respondent.id, event_type: "screen_start" }),
          }).catch(err => console.error("Failed to log screen_start:", err));

          const saved = sessionStorage.getItem("s1_data");
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              if (parsed.age) setAge(parsed.age);
              if (parsed.sex) setSex(parsed.sex);
              if (parsed.employmentType) setEmploymentType(parsed.employmentType);
            } catch (e) {
              console.error("Failed to restore S1 data:", e);
            }
          }
          setChecking(false);
        } else {
          if (token) {
            router.replace("/screen/1");
          } else {
            router.replace("/");
          }
        }
      } catch (e) {
        console.error("Token verification error:", e);
        if (token) {
          router.replace("/screen/1");
        } else {
          router.replace("/");
        }
      }
    };
    
    checkToken();
  }, [token, router]);

  const isValid = age && parseInt(age, 10) >= 1 && sex && employmentType;

  const handleNext = () => {
    if (!isValid) return;
    
    sessionStorage.setItem(
      "s1_data",
      JSON.stringify({ age, sex, employmentType, respondentId })
    );
    
    router.push(`/screen/2?t=${token}`);
  };

  if (checking) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-navy border-t-cyan"></div>
      </div>
    );
  }

  return (
    <AppShell
      title="대상 여부 확인 (S1)"
      footerContent={
        <button
          onClick={handleNext}
          disabled={!isValid}
          className={`btn w-full text-center transition-all ${
            isValid ? "primary" : "ghost text-gray-400 cursor-not-allowed"
          }`}
        >
          다음 단계
        </button>
      }
    >
      <div className="space-y-8 pb-10">
        <div className="space-y-2">
          <h2 className="text-xl font-extrabold text-navy">기본 인적사항 및 근로여부</h2>
          <p className="text-xs text-gray-400">설문 대상 기준 검증을 위해 아래 항목에 답해 주세요.</p>
        </div>

        {/* 1. 연령 입력 */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-navy">1. 귀하의 연령(나이)은 어떻게 되십니까?</label>
          <div className="flex items-center space-x-2">
            <input
              type="number"
              pattern="[0-9]*"
              inputMode="numeric"
              placeholder="예: 32"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="txt w-24 text-center text-lg font-bold"
            />
            <span className="text-sm font-semibold text-gray-600">세 (만 나이 기준)</span>
          </div>
          {age && parseInt(age, 10) < 19 && (
            <p className="text-xs font-semibold text-red-500">※ 만 19세 미만은 본 조사에 참여할 수 없습니다.</p>
          )}
        </div>

        {/* 2. 성별 선택 */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-navy">2. 귀하의 성별은 무엇입니까?</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setSex("M")}
              className={`chip py-4 text-center font-bold text-base ${
                sex === "M" ? "on" : ""
              }`}
            >
              남성
            </button>
            <button
              onClick={() => setSex("F")}
              className={`chip py-4 text-center font-bold text-base ${
                sex === "F" ? "on" : ""
              }`}
            >
              여성
            </button>
          </div>
        </div>

        {/* 3. 고용형태 선택 */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-navy">3. 귀하의 고용 형태는 무엇입니까?</label>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setEmploymentType("wage")}
              className={`chip w-full py-4 text-left px-5 font-bold text-sm ${
                employmentType === "wage" ? "on" : ""
              }`}
            >
              💼 임금근로자 (회사원, 공무원, 파트타임 등)
            </button>
            <button
              onClick={() => setEmploymentType("self")}
              className={`chip w-full py-4 text-left px-5 font-bold text-sm ${
                employmentType === "self" ? "on" : ""
              }`}
            >
              🏢 자영업자 / 개인사업자 / 프리랜서
            </button>
            <button
              onClick={() => setEmploymentType("none")}
              className={`chip w-full py-4 text-left px-5 font-bold text-sm ${
                employmentType === "none" ? "on" : ""
              }`}
            >
              ❌ 해당 없음 (비취업자, 학생, 주부 등)
            </button>
          </div>
          {employmentType === "none" && (
            <p className="text-xs font-semibold text-red-500">※ 취업자(임금근로자/자영업자)만 참여 가능합니다.</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function Screen1() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center p-6 bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-navy border-t-cyan"></div>
      </div>
    }>
      <Screen1Content />
    </Suspense>
  );
}
