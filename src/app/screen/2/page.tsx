"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import AppShell from "@/components/AppShell";

const KSCO_JOBS = [
  { k: "mgr", label: "🏢 관리자 (임원, 부서장 등)" },
  { k: "pro", label: "🧪 전문가 및 관련 종사자 (개발자, 기획자, 의료인 등)" },
  { k: "clerk", label: "✍️ 사무 종사자 (행정, 회계, 비서 등)" },
  { k: "service", label: "🛎️ 서비스 종사자 (소방, 헤어디자이너, 요식업 등)" },
  { k: "sales", label: "🛍️ 판매 종사자 (영업직, 매장 판매원 등)" },
  { k: "craft", label: "🔧 기능원 및 기능 종사자 (건설, 제조 설비 등)" },
  { k: "machine", label: "⚙️ 장치·기계 조작 및 조립 종사자 (운송, 생산기계 등)" },
  { k: "labor", label: "🧹 단순노무 종사자 (청소, 배송, 가사 등)" },
  { k: "farm", label: "🌾 농림어업 숙련 종사자 (대상 외)" },
  { k: "military", label: "🪖 군인 (대상 외)" }
];

function Screen2Content() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("t");

  const [aiFreq, setAiFreq] = useState<"lt2" | "2_3" | "4_6" | "daily" | "">("");
  const [kscoMajor, setKscoMajor] = useState<string>("");
  const [aiToolFree, setAiToolFree] = useState<string>("");
  const [aiPurposeFree, setAiPurposeFree] = useState<string>("");
  
  const [s1Data, setS1Data] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [verifyingToken, setVerifyingToken] = useState<boolean>(true);

  // 1단계 데이터 로딩 및 검증
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
      setVerifyingToken(false);

      if (parsed.respondentId) {
        fetch("/api/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ respondent_id: parsed.respondentId, event_type: "screen2_start" }),
        }).catch(err => console.error("Failed to log screen2_start:", err));
      }
    } catch (e) {
      console.error("Failed to parse S1 data:", e);
      router.replace(`/screen/1?t=${token}`);
    }
  }, [token, router]);

  const isValid = aiFreq && kscoMajor && aiToolFree.trim().length >= 2 && aiPurposeFree.trim().length >= 2;

  const handleSubmit = async () => {
    if (!isValid || !s1Data || loading) return;
    
    setLoading(true);
    try {
      const payload = {
        respondent_id: s1Data.respondentId,
        age: s1Data.age,
        sex: s1Data.sex,
        employment_type: s1Data.employmentType,
        ai_freq: aiFreq,
        ai_tool_free: aiToolFree,
        ai_purpose_free: aiPurposeFree,
        ksco_major: kscoMajor,
      };

      const response = await fetch("/api/screening", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        if (data.passed) {
          router.push(`/consent?t=${token}`);
        } else {
          if (data.fail_reason === "quota_full") {
            router.push(`/complete?reason=quota_full&t=${token}`);
          } else {
            router.push(`/complete?reason=screened_out&t=${token}`);
          }
        }
      } else {
        alert(data.error || "스크리닝 제출 중 오류가 발생했습니다.");
      }
    } catch (e) {
      console.error("Screening request failed:", e);
      alert("서버 연결 실패. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  if (verifyingToken) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-navy border-t-cyan"></div>
      </div>
    );
  }

  return (
    <AppShell
      title="대상 여부 확인 (S2)"
      footerContent={
        <button
          onClick={handleSubmit}
          disabled={!isValid || loading}
          className={`btn w-full text-center transition-all ${
            isValid && !loading ? "primary" : "ghost text-gray-400 cursor-not-allowed"
          }`}
        >
          {loading ? "판정 및 제출 중..." : "제출 및 검증"}
        </button>
      }
    >
      <div className="space-y-8 pb-10">
        <div className="space-y-2">
          <h2 className="text-xl font-extrabold text-navy">AI 활용 수준 및 직종 확인</h2>
          <p className="text-xs text-gray-400">마지막 판정 단계입니다. 성실하게 기재해 주세요.</p>
        </div>

        {/* 1. AI 사용 빈도 */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-navy">
            1. 최근 4주 동안 인공지능(AI) 도구를 얼마나 자주 사용하셨습니까?
            <span className="block text-xs font-normal text-gray-400 mt-1">※ChatGPT, 번역기, 이미지 생성기 등 개인/업무용 모두 포함</span>
          </label>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setAiFreq("daily")}
              className={`chip w-full py-3 text-left px-4 font-semibold text-sm ${aiFreq === "daily" ? "on" : ""}`}
            >
              📅 매일 사용함
            </button>
            <button
              onClick={() => setAiFreq("4_6")}
              className={`chip w-full py-3 text-left px-4 font-semibold text-sm ${aiFreq === "4_6" ? "on" : ""}`}
            >
              🗓️ 주 4~6회 정도 사용함
            </button>
            <button
              onClick={() => setAiFreq("2_3")}
              className={`chip w-full py-3 text-left px-4 font-semibold text-sm ${aiFreq === "2_3" ? "on" : ""}`}
            >
              🗓️ 주 2~3회 정도 사용함
            </button>
            <button
              onClick={() => setAiFreq("lt2")}
              className={`chip w-full py-3 text-left px-4 font-semibold text-sm ${aiFreq === "lt2" ? "on" : ""}`}
            >
              ⚠️ 주 2회 미만 (거의 쓰지 않음 - 대상 제외)
            </button>
          </div>
        </div>

        {/* 2. 직종 분류 */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-navy">
            2. 귀하의 주된 직업(직종)은 어디에 해당합니까?
          </label>
          <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto border border-gray-100 rounded-xl p-2 bg-gray-50/50">
            {KSCO_JOBS.map((j) => (
              <button
                key={j.k}
                onClick={() => setKscoMajor(j.k)}
                className={`chip w-full py-3 text-left px-4 font-semibold text-xs transition-all ${kscoMajor === j.k ? "on" : ""}`}
              >
                {j.label}
              </button>
            ))}
          </div>
          {(kscoMajor === "farm" || kscoMajor === "military") && (
            <p className="text-xs font-semibold text-red-500">※ 농림어업 및 군인은 이번 조사 대상이 아닙니다.</p>
          )}
        </div>

        {/* 3. AI 도구 자유 기술 */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-navy">
            3. 최근 귀하가 가장 자주 사용하는 AI 서비스/도구명을 직접 적어주세요.
          </label>
          <input
            type="text"
            placeholder="예: ChatGPT, Claude, Papago, Notion AI 등"
            value={aiToolFree}
            onChange={(e) => setAiToolFree(e.target.value)}
            className="txt text-sm"
          />
        </div>

        {/* 4. 사용 목적 자유 기술 */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-navy">
            4. 위 AI 도구의 주된 사용 목적이나 구체적인 활용 방식을 적어주세요.
          </label>
          <textarea
            placeholder="예: 업무 문서 번역 및 보고서 초안 요약, 챗봇을 통한 기초 지식 학습 등"
            value={aiPurposeFree}
            onChange={(e) => setAiPurposeFree(e.target.value)}
            rows={3}
            className="txt text-sm w-full border border-gray-200 rounded-xl p-3 focus:outline-none focus:border-cyan"
          />
        </div>
      </div>
    </AppShell>
  );
}

export default function Screen2() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center p-6 bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-navy border-t-cyan"></div>
      </div>
    }>
      <Screen2Content />
    </Suspense>
  );
}
