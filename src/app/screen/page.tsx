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

function ScreeningContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("t");

  // 상태 변수 정의
  const [age, setAge] = useState<string>("");
  const [sex, setSex] = useState<"M" | "F" | "">("");
  const [employmentType, setEmploymentType] = useState<"wage" | "self" | "none" | "">("");
  const [aiFreq, setAiFreq] = useState<"lt2" | "2_3" | "4_6" | "daily" | "">("");
  const [kscoMajor, setKscoMajor] = useState<string>("");
  const [aiToolFree, setAiToolFree] = useState<string>("");
  const [aiPurposeFree, setAiPurposeFree] = useState<string>("");

  const [respondentId, setRespondentId] = useState<string | null>(null);
  const [checking, setChecking] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // 1. 진입 시 토큰 검증 또는 자동 발급
  useEffect(() => {
    const initSession = async () => {
      try {
        const url = token ? `/api/respondent?t=${encodeURIComponent(token)}` : "/api/respondent";
        const res = await fetch(url);
        const data = await res.json();

        if (res.ok && data.success) {
          // 토큰이 없었으면 생성된 URL로 갱신하여 리다이렉트
          if (!token && data.redirectPath) {
            router.replace(data.redirectPath);
            return;
          }

          setRespondentId(data.respondent.id);

          // 스크리닝 시작 이벤트 로그 기록
          fetch("/api/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ respondent_id: data.respondent.id, event_type: "screen_start" }),
          }).catch(err => console.error("Failed to log screen_start:", err));

          // 기존 입력 복원 시도
          const saved = sessionStorage.getItem("screening_data");
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              if (parsed.age) setAge(parsed.age);
              if (parsed.sex) setSex(parsed.sex);
              if (parsed.employmentType) setEmploymentType(parsed.employmentType);
              if (parsed.aiFreq) setAiFreq(parsed.aiFreq);
              if (parsed.kscoMajor) setKscoMajor(parsed.kscoMajor);
              if (parsed.aiToolFree) setAiToolFree(parsed.aiToolFree);
              if (parsed.aiPurposeFree) setAiPurposeFree(parsed.aiPurposeFree);
            } catch (e) {
              console.error("Failed to restore screening data:", e);
            }
          }

          setChecking(false);
        } else {
          // 잘못된 토큰을 지우고 신규 세션 발급을 받기 위해 쿼리 파라미터 제외하고 이동
          if (token) {
            router.replace("/screen");
          } else {
            router.replace("/");
          }
        }
      } catch (err) {
        console.error("Failed to initialize screening session:", err);
        if (token) {
          router.replace("/screen");
        } else {
          router.replace("/");
        }
      }
    };

    initSession();
  }, [token, router]);

  // 임시 세션 입력값 자동 저장
  useEffect(() => {
    if (checking) return;
    sessionStorage.setItem(
      "screening_data",
      JSON.stringify({
        age,
        sex,
        employmentType,
        aiFreq,
        kscoMajor,
        aiToolFree,
        aiPurposeFree,
        respondentId
      })
    );
  }, [age, sex, employmentType, aiFreq, kscoMajor, aiToolFree, aiPurposeFree, respondentId, checking]);

  // 전체 유효성 평가
  const isValid =
    age &&
    parseInt(age, 10) >= 1 &&
    sex &&
    employmentType &&
    aiFreq &&
    kscoMajor &&
    aiToolFree.trim().length >= 2 &&
    aiPurposeFree.trim().length >= 2;

  const handleSubmit = async () => {
    if (!isValid || !respondentId || submitting) return;

    setSubmitting(true);
    try {
      const payload = {
        respondent_id: respondentId,
        age: age,
        sex: sex,
        employment_type: employmentType,
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
          // 통과 시 동의 단계로 이동
          router.push(`/consent?t=${token}`);
        } else {
          // 탈락/셀마감 분기
          if (data.fail_reason === "quota_full") {
            router.push(`/complete?reason=quota_full&t=${token}`);
          } else {
            router.push(`/complete?reason=screened_out&t=${token}`);
          }
        }
      } else {
        alert(data.error || "제출 중 오류가 발생했습니다. 다시 시도해 주세요.");
      }
    } catch (err) {
      console.error("Screening request failed:", err);
      alert("서버 통신 실패. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-white min-h-[100dvh]">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-navy border-t-cyan"></div>
          <p className="text-sm font-bold text-navy animate-pulse">설문 환경을 준비하고 있습니다...</p>
        </div>
      </div>
    );
  }

  return (
    <AppShell
      title="대상 여부 확인 (통합)"
      footerContent={
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isValid || submitting}
          className={`btn w-full text-center transition-all ${
            isValid && !submitting ? "primary" : "ghost text-gray-400 cursor-not-allowed"
          }`}
        >
          {submitting ? "판정 및 제출 중..." : "제출 및 검증"}
        </button>
      }
    >
      <div className="space-y-8 pb-10">
        <div className="space-y-2">
          <h2 className="text-xl font-extrabold text-navy">조사 대상 확인 설문</h2>
          <p className="text-xs text-gray-400">본 설문조사 대상 해당 여부 판정을 위해 모든 문항에 답변해 주세요.</p>
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
              type="button"
              onClick={() => setSex("M")}
              className={`chip py-4 text-center font-bold text-base ${sex === "M" ? "on" : ""}`}
            >
              남성
            </button>
            <button
              type="button"
              onClick={() => setSex("F")}
              className={`chip py-4 text-center font-bold text-base ${sex === "F" ? "on" : ""}`}
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
              type="button"
              onClick={() => setEmploymentType("wage")}
              className={`chip w-full py-4 text-left px-5 font-bold text-sm ${
                employmentType === "wage" ? "on" : ""
              }`}
            >
              💼 임금근로자 (회사원, 공무원, 파트타임 등)
            </button>
            <button
              type="button"
              onClick={() => setEmploymentType("self")}
              className={`chip w-full py-4 text-left px-5 font-bold text-sm ${
                employmentType === "self" ? "on" : ""
              }`}
            >
              🏢 자영업자 / 개인사업자 / 프리랜서
            </button>
            <button
              type="button"
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

        {/* 4. AI 사용 빈도 */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-navy">
            4. 최근 4주 동안 인공지능(AI) 도구를 얼마나 자주 사용하셨습니까?
            <span className="block text-xs font-normal text-gray-400 mt-1">※ChatGPT, 번역기, 이미지 생성기 등 개인/업무용 모두 포함</span>
          </label>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setAiFreq("daily")}
              className={`chip w-full py-4 text-left px-5 font-bold text-sm ${aiFreq === "daily" ? "on" : ""}`}
            >
              📅 매일 사용함
            </button>
            <button
              type="button"
              onClick={() => setAiFreq("4_6")}
              className={`chip w-full py-4 text-left px-5 font-bold text-sm ${aiFreq === "4_6" ? "on" : ""}`}
            >
              🗓️ 주 4~6회 정도 사용함
            </button>
            <button
              type="button"
              onClick={() => setAiFreq("2_3")}
              className={`chip w-full py-4 text-left px-5 font-bold text-sm ${aiFreq === "2_3" ? "on" : ""}`}
            >
              🗓️ 주 2~3회 정도 사용함
            </button>
            <button
              type="button"
              onClick={() => setAiFreq("lt2")}
              className={`chip w-full py-4 text-left px-5 font-bold text-sm ${aiFreq === "lt2" ? "on" : ""}`}
            >
              ⚠️ 주 2회 미만 (거의 쓰지 않음 - 대상 제외)
            </button>
          </div>
          {aiFreq === "lt2" && (
            <p className="text-xs font-semibold text-red-500">※ 주 2회 미만 사용자는 이번 조사 대상이 아닙니다.</p>
          )}
        </div>

        {/* 5. 직종 분류 */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-navy">
            5. 귀하의 주된 직업(직종)은 어디에 해당합니까?
          </label>
          <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto border border-gray-100 rounded-xl p-2 bg-gray-50/50">
            {KSCO_JOBS.map((j) => (
              <button
                key={j.k}
                type="button"
                onClick={() => setKscoMajor(j.k)}
                className={`chip w-full py-3.5 text-left px-4 font-semibold text-xs transition-all ${kscoMajor === j.k ? "on" : ""}`}
              >
                {j.label}
              </button>
            ))}
          </div>
          {(kscoMajor === "farm" || kscoMajor === "military") && (
            <p className="text-xs font-semibold text-red-500">※ 농림어업 및 군인은 이번 조사 대상이 아닙니다.</p>
          )}
        </div>

        {/* 6. AI 도구 자유 기술 */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-navy">
            6. 최근 귀하가 가장 자주 사용하는 AI 서비스/도구명을 직접 적어주세요.
          </label>
          <input
            type="text"
            placeholder="예: ChatGPT, Claude, Papago, Notion AI 등"
            value={aiToolFree}
            onChange={(e) => setAiToolFree(e.target.value)}
            className="txt text-sm"
          />
        </div>

        {/* 7. 사용 목적 자유 기술 */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-navy">
            7. 위 AI 도구의 주된 사용 목적이나 구체적인 활용 방식을 적어주세요.
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

export default function Screening() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center p-6 bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-navy border-t-cyan"></div>
      </div>
    }>
      <ScreeningContent />
    </Suspense>
  );
}
