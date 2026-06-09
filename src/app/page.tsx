"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function EntryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("t");
  
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    const verifyToken = async () => {
      try {
        const response = await fetch(`/api/respondent?t=${encodeURIComponent(token)}`);
        const data = await response.json();

        if (response.ok && data.success) {
          // 상태 전달을 위해 다음 페이지로 토큰을 쿼리 스트링 형태로 전달합니다.
          router.replace(`${data.redirectPath}${data.redirectPath.includes("?") ? "&" : "?"}t=${token}`);
        } else {
          setErrorMsg(data.error || "유효하지 않은 토큰입니다.");
          setLoading(false);
        }
      } catch (err) {
        console.error("Token verification failed:", err);
        setErrorMsg("서버 통신 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
        setLoading(false);
      }
    };

    verifyToken();
  }, [token, router]);

  // 1. 토큰 검증 로딩 뷰
  if (loading && token) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center p-6 bg-white">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-navy border-t-cyan"></div>
          <p className="text-sm font-medium text-navy tracking-wide animate-pulse">
            접속 토큰을 검증하고 있습니다...
          </p>
        </div>
      </main>
    );
  }

  // 2. 토큰 미인증 또는 누락 안내 뷰
  return (
    <main className="flex-1 flex flex-col justify-between p-6 bg-white">
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
      <div className="my-auto space-y-6">
        <div className="bg-[#f3fbfd] border border-[#d6eff6] rounded-2xl p-6 space-y-4">
          <div className="flex items-center space-x-2">
            <span className="text-cyan text-xl">💡</span>
            <h2 className="text-base font-bold text-navy">접속 안내</h2>
          </div>
          
          {errorMsg ? (
            <p className="text-sm leading-relaxed text-gray-600 font-medium">
              입력하신 링크의 인증에 실패했습니다: <span className="text-red-500 font-bold">{errorMsg}</span>
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-gray-600">
              본 조사는 AI 서비스 이용 상태를 정밀 분석하기 위한 학술 조사입니다. 
              참여를 위해서는 **전송받으신 개인별 전용 링크**를 통해 접속해 주셔야 합니다.
            </p>
          )}

          <div className="text-xs text-gray-500 space-y-2 bg-white/70 rounded-xl p-3 border border-gray-100">
            <p className="font-semibold text-navy">이동 방법:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>받으신 카카오톡, SMS, 또는 이메일 안의 **전용 URL**을 클릭해 주세요.</li>
              <li>주소를 복사하여 브라우저 주소창에 완전히 붙여넣어 접속하십시오.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 하단 푸터 */}
      <div className="pb-4 text-center">
        <p className="text-xs text-gray-400">
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
