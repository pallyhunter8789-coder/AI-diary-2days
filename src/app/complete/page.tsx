"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";

function CompleteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("t");
  const reason = searchParams.get("reason");

  useEffect(() => {
    if (!token) return;

    const logCompleteView = async () => {
      try {
        const res = await fetch(`/api/respondent?t=${token}`);
        const data = await res.json();
        if (res.ok && data.success) {
          fetch("/api/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              respondent_id: data.respondent.id,
              event_type: "complete_view",
              meta: { reason: reason || "completed" },
            }),
          }).catch(err => console.error("Failed to log complete_view:", err));
        }
      } catch (e) {
        console.error("Failed to log complete view:", e);
      }
    };

    logCompleteView();
  }, [token, reason]);

  let title = "설문 완료";
  let heading = "참여해 주셔서 감사합니다";
  let message = "제출하신 데이터가 정상적으로 수집되었습니다. 사례비 정산은 안내된 일정에 맞춰 지급됩니다.";

  if (reason === "screened_out") {
    title = "조사 종료";
    heading = "설문 대상 제외 안내";
    message = "귀하는 이번 AI 시간다이어리 조사의 설문 참여 대상 기준(만 19세 이상 임금근로자/자영업자 및 AI 주 2회 이상 사용자)에 해당하지 않아 조사가 종료되었습니다.";
  } else if (reason === "quota_full") {
    title = "조사 종료";
    heading = "정원 초과 안내";
    message = "귀하가 해당하는 연령/성별/직종 그룹의 목표 표본 수집이 마감되어 참여가 불가능합니다. 관심 가져주셔서 대단히 감사합니다.";
  } else if (reason === "dropped") {
    title = "조사 종료";
    heading = "설문 참여 종료";
    message = "검수 규칙에 따라 불성실 응답 또는 무성의한 중복 입출력이 탐지되어 설문 참여가 종료되었습니다.";
  } else if (reason === "day1_complete") {
    title = "1일차 기록 완료";
    heading = "1일차 시간다이어리 완료";
    message = "1일차 다이어리가 안전하게 자동 저장되었습니다. 다음 평일 오전에 2일차 작성을 시작할 수 있도록 알림(SMS/메일 등)을 보내드립니다. 받으신 기존 링크(?t=토큰)를 그대로 사용하셔서 재진입하실 수 있습니다.";
  }

  return (
    <AppShell title={title}>
      <div className="space-y-4 pt-6 text-center">
        <span className="text-4xl inline-block mb-2">
          {reason ? "📋" : "🎉"}
        </span>
        <h2 className="text-xl font-bold text-navy">{heading}</h2>
        <p className="text-sm text-gray-500">
          토큰: <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">{token || "없음"}</span>
        </p>
        <p className="text-sm text-gray-600 leading-relaxed max-w-sm mx-auto">
          {message}
        </p>
      </div>
    </AppShell>
  );
}

export default function Complete() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center p-6 bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-navy border-t-cyan"></div>
      </div>
    }>
      <CompleteContent />
    </Suspense>
  );
}
