import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const password = searchParams.get("password");

  const expectedPassword = process.env.ADMIN_PASSWORD || "admin1234";

  if (!password || password !== expectedPassword) {
    return NextResponse.json({ error: "Unauthorized", code: "invalid_password" }, { status: 401 });
  }

  try {
    // 1. 요약 카드용 집계 (respondents 상태별 카운트)
    const { data: respondents, error: rError } = await supabaseServer
      .from("respondents")
      .select("status");

    if (rError) throw rError;

    const respondentsList = (respondents || []) as any[];
    const invitedCount = respondentsList.filter((r: any) => r.status === "invited").length;
    const screenedInCount = respondentsList.filter((r: any) => r.status === "screened_in").length;
    const screenedOutCount = respondentsList.filter((r: any) => r.status === "screened_out").length;
    const quotaFullCount = respondentsList.filter((r: any) => r.status === "quota_full").length;
    const day1DoneCount = respondentsList.filter((r: any) => r.status === "day1_done").length;
    const completedCount = respondentsList.filter((r: any) => r.status === "completed").length;
    const droppedCount = respondentsList.filter((r: any) => r.status === "dropped").length;

    const screenPassedCount = screenedInCount + day1DoneCount + completedCount + droppedCount;

    const summary = {
      total: respondents.length,
      invited: invitedCount,
      screened_in: screenedInCount,
      screened_out: screenedOutCount,
      quota_full: quotaFullCount,
      day1_done: day1DoneCount,
      completed: completedCount,
      dropped: droppedCount,
      screen_passed: screenPassedCount,
      completion_rate: screenPassedCount > 0 ? Math.round((completedCount / screenPassedCount) * 100) : 0,
    };

    // 2. 셀별 Quota 진행률 뷰 조회
    const { data: quotaProgress, error: qError } = await supabaseServer
      .from("v_quota_progress")
      .select("*");

    if (qError) throw qError;

    // 3. 최근 품질 플래그 목록 조회
    const { data: qualityFlags, error: fError } = await supabaseServer
      .from("quality_flags")
      .select(`
        *,
        respondents (
          panel_source,
          panel_id
        )
      `)
      .order("created_at", { ascending: false })
      .limit(100);

    if (fError) throw fError;

    // 4. 이탈 시점 분석 (events 테이블의 타입별 카운트)
    const { data: eventCounts, error: eError } = await supabaseServer
      .from("events")
      .select("event_type");

    if (eError) throw eError;

    const eventStats: Record<string, number> = {};
    (eventCounts || []).forEach((ev: any) => {
      eventStats[ev.event_type] = (eventStats[ev.event_type] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      summary,
      quotaProgress,
      qualityFlags,
      eventStats,
    });
  } catch (err: any) {
    console.error("Admin data fetch error:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: err.message },
      { status: 500 }
    );
  }
}
