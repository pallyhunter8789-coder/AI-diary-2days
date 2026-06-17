"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState, useEffect, useRef } from "react";
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

  const [aiToolSelect, setAiToolSelect] = useState<string>("");
  const [aiToolOther, setAiToolOther] = useState<string>("");
  const [aiPurposeSelect, setAiPurposeSelect] = useState<string>("");
  const [aiPurposeOther, setAiPurposeOther] = useState<string>("");

  const [respondentId, setRespondentId] = useState<string | null>(null);
  const [checking, setChecking] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Q6, Q7 내부 선택값과 자유 기술값의 동기화
  useEffect(() => {
    if (aiToolSelect === "기타") {
      setAiToolFree(aiToolOther);
    } else {
      setAiToolFree(aiToolSelect);
    }
  }, [aiToolSelect, aiToolOther]);

  useEffect(() => {
    if (aiPurposeSelect === "기타") {
      setAiPurposeFree(aiPurposeOther);
    } else {
      setAiPurposeFree(aiPurposeSelect);
    }
  }, [aiPurposeSelect, aiPurposeOther]);

  // 리렌더링과 관계없이 토큰 및 응답자 ID를 공유하기 위한 Ref 정의
  const tokenRef = useRef<string>("");
  const respondentIdRef = useRef<string>("");

  // 1. 진입 시 토큰 검증 또는 자동 발급 (의존성 배열을 빈 배열로 하여 1회만 실행되게 함)
  useEffect(() => {
    let isMounted = true;

    // 8초 후 타임아웃 처리
    const timeoutId = setTimeout(() => {
      if (isMounted) {
        setInitError("설문 준비 시간이 초과되었습니다. 네트워크 연결 상태를 확인한 후 새로고침해 주세요.");
        setChecking(false);
      }
    }, 8000);

    const initSession = async () => {
      try {
        // searchParams 대신 window.location.search 로부터 token을 1회만 직접 취득하여 Ref에 보존
        const currentParams = new URLSearchParams(window.location.search);
        const t = currentParams.get("t") || "";
        tokenRef.current = t;

        const url = t ? `/api/respondent?t=${encodeURIComponent(t)}` : "/api/respondent";
        console.log("[Screening Init Debug] Initiating session check url:", url);

        const res = await fetch(url);
        const data = await res.json();

        console.log("[Screening Init Debug] API Response status:", res.status, "ok:", res.ok);
        console.log("[Screening Init Debug] API Response payload:", data);

        if (!isMounted) return;

        if (res.ok && data.success) {
          // 토큰이 없었으면 생성된 URL로 갱신하여 리다이렉트
          if (!t && data.redirectPath) {
            clearTimeout(timeoutId);
            window.location.replace(data.redirectPath);
            return;
          }

          // Ref와 State를 동시에 셋업하여 안정성 유지
          respondentIdRef.current = data.respondent.id;
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
              if (parsed.age) {
                // 하위 호환성: 기존 숫자 나이가 저장되어 있는 경우 연령대 코드로 자동 전환
                const ageNum = parseInt(parsed.age, 10);
                if (!isNaN(ageNum)) {
                  if (ageNum >= 19 && ageNum <= 29) setAge("19_29");
                  else if (ageNum >= 30 && ageNum <= 39) setAge("30_39");
                  else if (ageNum >= 40 && ageNum <= 49) setAge("40_49");
                  else if (ageNum >= 50 && ageNum <= 59) setAge("50_59");
                  else if (ageNum >= 60) setAge("60_plus");
                } else {
                  setAge(parsed.age);
                }
              }
              if (parsed.sex) setSex(parsed.sex);
              if (parsed.employmentType) setEmploymentType(parsed.employmentType);
              if (parsed.aiFreq) setAiFreq(parsed.aiFreq);
              if (parsed.kscoMajor) setKscoMajor(parsed.kscoMajor);
              if (parsed.aiToolFree) {
                setAiToolFree(parsed.aiToolFree);
                const defaultTools = ["ChatGPT (챗GPT)", "제미나이 (Gemini)", "클로드 (Claude)", "코파일럿 (Microsoft Copilot)", "클로바X (CLOVA X)"];
                if (defaultTools.includes(parsed.aiToolFree)) {
                  setAiToolSelect(parsed.aiToolFree);
                } else {
                  setAiToolSelect("기타");
                  setAiToolOther(parsed.aiToolFree);
                }
              }
              if (parsed.aiPurposeFree) {
                setAiPurposeFree(parsed.aiPurposeFree);
                const defaultPurposes = [
                  "업무 처리·자동화 (코딩·데이터·반복업무 등)",
                  "정보 검색·학습 (질문·자료 찾기)",
                  "문서·콘텐츠 작성 (작성·요약·번역)",
                  "기획·아이디어·의사결정 지원",
                  "이미지·영상 등 창작"
                ];
                if (defaultPurposes.includes(parsed.aiPurposeFree)) {
                  setAiPurposeSelect(parsed.aiPurposeFree);
                } else {
                  setAiPurposeSelect("기타");
                  setAiPurposeOther(parsed.aiPurposeFree);
                }
              }
              if (parsed.respondentId) {
                respondentIdRef.current = parsed.respondentId;
                setRespondentId(parsed.respondentId);
              }
            } catch (e) {
              console.error("Failed to restore screening data:", e);
            }
          }
        } else {
          // 잘못된 접근(유효하지 않은 토큰) 시 다른 경로로 리다이렉트하지 않고 정적 안내 화면을 보여준 채 멈춤
          clearTimeout(timeoutId);
          if (isMounted) {
            setInitError(data.error || "유효하지 않은 토큰이거나 잘못된 접근입니다. 올바른 설문 링크를 확인해 주세요.");
          }
        }
      } catch (err: any) {
        console.error("Failed to initialize screening session:", err);
        if (isMounted) {
          setInitError(err.message || "서버 통신 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
        }
      } finally {
        clearTimeout(timeoutId);
        if (isMounted) {
          setChecking(false);
        }
      }
    };

    initSession();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, []);

  // 임시 세션 입력값 자동 저장
  useEffect(() => {
    if (checking || initError) return;
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
  }, [age, sex, employmentType, aiFreq, kscoMajor, aiToolFree, aiPurposeFree, respondentId, checking, initError]);

  // 전체 유효성 평가
  const isValid =
    age &&
    sex &&
    employmentType &&
    aiFreq &&
    kscoMajor &&
    aiToolFree.trim().length >= 2 &&
    aiPurposeFree.trim().length >= 2;

  const handleSubmit = async () => {
    // URL 파라미터 및 Ref에서 토큰과 세션 정보 안전하게 추출
    const currentToken = token || tokenRef.current || (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("t") : "") || "";
    const currentRespondentId = respondentId || respondentIdRef.current;

    // 상세 디버깅 로그 기록
    console.log("[Screening Submit Debug] --- SUBMIT ACTION TRIGGERED ---");
    console.log("[Screening Submit Debug] - window.location.search :", typeof window !== "undefined" ? window.location.search : "undefined");
    console.log("[Screening Submit Debug] - checking (세션 초기화 진행중여부) :", checking);
    console.log("[Screening Submit Debug] - initError (세션 에러 상태) :", initError);
    console.log("[Screening Submit Debug] - token (state) :", token);
    console.log("[Screening Submit Debug] - tokenRef.current (Ref) :", tokenRef.current);
    console.log("[Screening Submit Debug] - currentToken (최종 도출) :", currentToken);
    console.log("[Screening Submit Debug] - respondentId (state) :", respondentId);
    console.log("[Screening Submit Debug] - respondentIdRef.current (Ref) :", respondentIdRef.current);
    console.log("[Screening Submit Debug] - currentRespondentId (최종 도출) :", currentRespondentId);
    console.log("[Screening Submit Debug] - isValid (입력 항목들 유효성) :", isValid);

    try {
      if (!currentRespondentId) {
        console.log("[Screening Submit Debug] FAILURE: currentRespondentId is EMPTY!");
        if (!respondentId && !respondentIdRef.current) {
          console.log("[Screening Submit Debug] Detailed Reason: Both respondentId state and respondentIdRef.current are empty/null.");
        }
        if (checking) {
          console.log("[Screening Submit Debug] Detailed Reason: checking state is still TRUE (initialization in progress).");
        }
        alert("세션 초기화가 완료되지 않았거나 토큰 정보가 유실되었습니다. 새로고침 후 다시 시도해 주세요.");
        return;
      }

      if (!isValid) {
        const missing = [];
        if (!age) missing.push("1. 연령");
        if (!sex) missing.push("2. 성별");
        if (!employmentType) missing.push("3. 고용형태");
        if (!aiFreq) missing.push("4. AI 사용빈도");
        if (!kscoMajor) missing.push("5. 직종");
        if (!aiToolFree || aiToolFree.trim().length < 2) missing.push("6. AI 도구명 (최소 2자)");
        if (!aiPurposeFree || aiPurposeFree.trim().length < 2) missing.push("7. AI 사용 목적 (최소 2자)");
        
        alert(`입력하지 않았거나 형식에 맞지 않는 항목이 있습니다:\n- ${missing.join("\n- ")}`);
        return;
      }

      if (submitting) return;
      setSubmitting(true);

      const payload = {
        respondent_id: currentRespondentId,
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
      console.log("[Screening Submit Debug] API Response status:", response.status, "ok:", response.ok);
      console.log("[Screening Submit Debug] API Response payload data:", data);
      if (data.error) {
        console.error("[Screening Submit Debug] API Response contains error:", data.error, "details:", data.details);
      }

      if (response.ok && data.success) {
        // 하위 호환성(consent, onboarding, diary 등)을 위해 s1_data 키로도 동일하게 백업 저장
        sessionStorage.setItem(
          "s1_data",
          JSON.stringify({
            respondentId: currentRespondentId,
            age,
            sex,
            employmentType,
            aiFreq,
            kscoMajor,
            aiToolFree,
            aiPurposeFree,
          })
        );

        if (data.passed) {
          const dest = `/consent?t=${currentToken}`;
          console.log("[Screening Submit Debug] 이동 시작 (통과):", dest);
          router.push(dest);
        } else {
          let dest = "";
          if (data.fail_reason === "quota_full") {
            dest = `/complete?reason=quota_full&t=${currentToken}`;
          } else {
            dest = `/complete?reason=screened_out&t=${currentToken}`;
          }
          console.log("[Screening Submit Debug] 이동 시작 (탈락):", dest);
          router.push(dest);
        }
      } else {
        const errMsg = data.error || "알 수 없는 에러가 발생했습니다.";
        const errDetails = data.details || "상세 정보 없음";
        console.log("[Screening Submit Debug] Submission failed. error:", errMsg, "details:", errDetails);
        alert(`제출 처리 중 오류 발생: ${errMsg}\n(상세 내용: ${errDetails})`);
      }
    } catch (err: any) {
      console.error("[Screening Submit Debug] Screening request failed:", err);
      alert(`제출 중 예상치 못한 오류가 발생했습니다: ${err.message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

  // 1. 준비 과정에서 실패 또는 타임아웃 오류 시 화면
  if (initError) {
    return (
      <main className="flex-1 flex flex-col justify-between p-6 bg-white min-h-[100dvh]">
        <div className="pt-8 text-center">
          <div className="inline-block px-3 py-1 bg-red-50 rounded-full text-xs font-semibold text-red-600 tracking-wider mb-3">
            준비 실패
          </div>
          <h1 className="text-2xl font-extrabold text-navy tracking-tight">
            설문 환경 초기화 실패
          </h1>
        </div>

        <div className="my-auto space-y-6 py-8">
          <div className="bg-red-50/50 border border-red-100 rounded-2xl p-6 space-y-4 shadow-sm text-center">
            <span className="text-red-500 text-4xl block">⚠️</span>
            <p className="text-sm leading-relaxed text-gray-600 font-semibold">
              {initError}
            </p>
          </div>
          
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn primary py-4 font-bold text-sm shadow-md rounded-xl cursor-pointer hover:bg-navy2 active:scale-95 transition-all"
          >
            🔄 새로고침
          </button>
        </div>

        <div className="pb-4 text-center">
          <p className="text-[10px] text-gray-400">
            © KISDI 정보통신정책연구원 · 테헤란씨씨
          </p>
        </div>
      </main>
    );
  }

  // 2. 토큰 검증 및 세션 생성 로딩 뷰
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
      title="대상 여부 확인"
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

        {/* 1. 연령 선택 */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-navy">1. 귀하의 연령대는 어떻게 되십니까?</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { k: "19_29", label: "① 19–29세" },
              { k: "30_39", label: "② 30–39세" },
              { k: "40_49", label: "③ 40–49세" },
              { k: "50_59", label: "④ 50–59세" },
              { k: "60_plus", label: "⑤ 60세 이상" }
            ].map((band) => (
              <button
                key={band.k}
                type="button"
                onClick={() => setAge(band.k)}
                className={`chip py-4 text-center font-bold text-sm ${age === band.k ? "on" : ""}`}
              >
                {band.label}
              </button>
            ))}
          </div>
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

        {/* 6. AI 도구 선택 (객관식) */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-navy">
            6. 최근 귀하가 가장 자주 사용하는 AI 서비스/도구명은 무엇입니까? (단일 선택)
          </label>
          <div className="grid grid-cols-2 gap-3">
            {["ChatGPT (챗GPT)", "제미나이 (Gemini)", "클로드 (Claude)", "코파일럿 (Microsoft Copilot)", "클로바X (CLOVA X)", "기타"].map((tool) => (
              <button
                key={tool}
                type="button"
                onClick={() => setAiToolSelect(tool)}
                className={`chip py-4 text-center font-bold text-sm ${aiToolSelect === tool ? "on" : ""}`}
              >
                {tool}
              </button>
            ))}
          </div>
          {aiToolSelect === "기타" && (
            <div className="space-y-2 mt-2 animate-fadeIn">
              <label className="block text-xs font-semibold text-gray-500">서비스명을 직접 적어주세요.</label>
              <input
                type="text"
                placeholder="예: Papago, Notion AI, 뤼튼 등"
                value={aiToolOther}
                onChange={(e) => setAiToolOther(e.target.value)}
                className="txt text-sm"
              />
            </div>
          )}
        </div>

        {/* 7. 사용 목적 선택 (객관식) */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-navy">
            7. 위 AI 도구의 주된 사용 목적이나 활용 방식은 무엇입니까? (단일 선택)
          </label>
          <div className="flex flex-col gap-3">
            {[
              "업무 처리·자동화 (코딩·데이터·반복업무 등)",
              "정보 검색·학습 (질문·자료 찾기)",
              "문서·콘텐츠 작성 (작성·요약·번역)",
              "기획·아이디어·의사결정 지원",
              "이미지·영상 등 창작",
              "기타"
            ].map((purpose) => (
              <button
                key={purpose}
                type="button"
                onClick={() => setAiPurposeSelect(purpose)}
                className={`chip w-full py-4 text-left px-5 font-bold text-sm ${aiPurposeSelect === purpose ? "on" : ""}`}
              >
                {purpose}
              </button>
            ))}
          </div>
          {aiPurposeSelect === "기타" && (
            <div className="space-y-2 mt-2 animate-fadeIn">
              <label className="block text-xs font-semibold text-gray-500">구체적인 활용 방식을 직접 적어주세요.</label>
              <textarea
                placeholder="예: 개인 웹사이트 디자인 아이디어 탐색 등"
                value={aiPurposeOther}
                onChange={(e) => setAiPurposeOther(e.target.value)}
                rows={3}
                className="txt text-sm w-full border border-gray-200 rounded-xl p-3 focus:outline-none focus:border-cyan"
              />
            </div>
          )}
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
