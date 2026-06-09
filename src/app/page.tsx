"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function EntryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 1. 진입 시 토큰 검증 또는 자체 응답자 세션 자동 생성
  useEffect(() => {
    let t = searchParams.get("t") || "";
    if (!t && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      t = params.get("t") || "";
    }

    const verifyOrRegister = async () => {
      try {
        setLoading(true);
        const url = t ? `/api/respondent?t=${encodeURIComponent(t)}` : "/api/respondent";
        const response = await fetch(url);
        const data = await response.json();

        if (response.ok && data.success) {
          let finalPath = data.redirectPath;
          if (t && !finalPath.includes("t=")) {
            finalPath = `${finalPath}${finalPath.includes("?") ? "&" : "?"}t=${t}`;
          }
          router.replace(finalPath);
        } else {
          setErrorMsg(data.error || "설문 세션 생성 또는 토큰 검증에 실패했습니다.");
          setLoading(false);
        }
      } catch (err) {
        console.error("Respondent registration failed:", err);
        setErrorMsg("서버 통신 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
        setLoading(false);
      }
    };

    verifyOrRegister();
  }, [searchParams, router]);

  const handleStartDemo = () => {
    router.push("/?t=test-token-1234");
  };

  // 1. 토큰 검증 및 세션 생성 로딩 뷰
  if (loading) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center p-6 bg-white min-h-[100dvh]">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-navy border-t-cyan"></div>
          <p className="text-sm font-bold text-navy tracking-wide animate-pulse">
            설문 환경을 준비하고 있습니다...
          </p>
        </div>
      </main>
    );
  }

  // 2. 토큰 미인증 또는 누락 안내 뷰
  return (
    <main className="flex-1 flex flex-col justify-between p-6 bg-white min-h-[100dvh]">
      {/* 상단 헤더 */}
      <div className="pt-8 text-center">
        <div className="inline-block px-3 py-1 bg-bg-gray rounded-full text-xs font-semibold text-navy tracking-wider mb-3">
          KISDI 공동연구
        </div>
        <h1 className="text-2xl font-extrabold text-navy tracking-tight">
          AI 시간다이어리 조사
        </h1>
      </div>

      {/* 중단 설명 박스 */}
      <div className="my-auto space-y-6 py-8">
        <div className="bg-[#f3fbfd] border border-[#d6eff6] rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center space-x-2">
            <span className="text-red-500 text-xl">⚠️</span>
            <h2 className="text-base font-extrabold text-navy">받으신 링크로만 참여 가능</h2>
          </div>
          
          {errorMsg ? (
            <p className="text-sm leading-relaxed text-gray-600 font-semibold bg-red-50/50 p-3 rounded-xl border border-red-100 text-center">
              인증 실패: <span className="text-red-500 font-bold">{errorMsg}</span>
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-gray-600">
              본 조사는 AI 서비스 이용자 분석을 위한 한정 연구 조사입니다.<br />
              원활한 통계 분석을 위해 **전송받으신 개인별 전용 링크**를 통해서만 접속 및 참여하실 수 있습니다.
            </p>
          )}

          <div className="text-xs text-gray-500 space-y-2 bg-white/80 rounded-xl p-3.5 border border-gray-100">
            <p className="font-semibold text-[#203864]">올바른 참여 방법:</p>
            <ul className="list-disc pl-4 space-y-1.5 leading-normal">
              <li>전송받으신 카카오톡, 알림톡 또는 SMS 내의 **개별 전용 URL**을 클릭해 주세요.</li>
              <li>링크를 복사하여 브라우저 주소창에 완전히 붙여넣고 다시 접속해주시기 바랍니다.</li>
            </ul>
          </div>
        </div>

        {/* 시연용 테스트 버튼 카드 */}
        <div className="bg-gray-50 border border-gray-200/60 rounded-2xl p-5 space-y-3.5 text-center">
          <div className="space-y-1">
            <h3 className="text-xs font-extrabold text-cyan tracking-wider">DEMO VERSION</h3>
            <p className="text-[11px] text-gray-500">
              배포 및 시스템 작동 여부를 검증하기 위한 가상 시연 모드입니다.
            </p>
          </div>
          <button
            onClick={handleStartDemo}
            className="btn cyan w-full py-3.5 text-white font-bold text-sm shadow-md shadow-cyan/15 rounded-xl cursor-pointer hover:bg-cyan-d active:scale-95 transition-all"
          >
            ✨ (시연용) 테스트 토큰으로 시작하기
          </button>
        </div>
      </div>

      {/* 하단 푸터 */}
      <div className="pb-4 text-center">
        <p className="text-[10px] text-gray-400">
          © KISDI 정보통신정책연구원 · 테헤란씨씨
        </p>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center p-6 bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-navy border-t-cyan"></div>
      </div>
    }>
      <EntryContent />
    </Suspense>
  );
}
