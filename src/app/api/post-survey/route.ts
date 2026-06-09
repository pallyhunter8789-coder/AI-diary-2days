import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      respondent_id,
      day_no,
      perceived_burden,
      perceived_accuracy,
      elapsed_seconds,
    } = body;

    if (!respondent_id || !day_no || !perceived_burden || !perceived_accuracy) {
      return NextResponse.json(
        { error: "Missing required fields", code: "missing_fields" },
        { status: 400 }
      );
    }

    // 1. post_survey 기록 저장 (upsert)
    const { error: surveyError } = await supabaseServer.from("post_survey").insert({
      respondent_id,
      day_no,
      perceived_burden,
      perceived_accuracy,
      elapsed_seconds: elapsed_seconds || 0,
    });

    if (surveyError) {
      console.error("Failed to insert post survey:", surveyError);
      return NextResponse.json({ error: "Failed to save post survey" }, { status: 500 });
    }

    // 2. diary_days 상태를 completed로 업데이트
    const { error: dayUpdateError } = await supabaseServer
      .from("diary_days")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("respondent_id", respondent_id)
      .eq("day_no", day_no);

    if (dayUpdateError) {
      console.error("Failed to update diary day status:", dayUpdateError);
      return NextResponse.json({ error: "Failed to update diary day" }, { status: 500 });
    }

    // 3. 만약 1일차인 경우 respondents.status를 day1_done 으로 변경
    if (day_no === 1) {
      const { error: respondentError } = await supabaseServer
        .from("respondents")
        .update({ status: "day1_done" })
        .eq("id", respondent_id);

      if (respondentError) {
        console.error("Failed to update respondent status:", respondentError);
        return NextResponse.json({ error: "Failed to update respondent status" }, { status: 500 });
      }

      // events에 day_complete와 reminder_sent(발송 예약 훅) 남기기
      await supabaseServer.from("events").insert([
        {
          respondent_id,
          event_type: "day_complete",
          meta: { day_no: 1 },
        },
        {
          respondent_id,
          event_type: "reminder_sent",
          meta: { day_no: 2, channel: "panel_integration" },
        }
      ]);
    } else {
      // 2일차인 경우 events에 day_complete만 남김 (최종완료는 demographics 제출 시 completed가 됨)
      await supabaseServer.from("events").insert({
        respondent_id,
        event_type: "day_complete",
        meta: { day_no: 2 },
      });
    }

    return NextResponse.json({
      success: true,
    });
  } catch (err: any) {
    console.error("POST post-survey error:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: err.message },
      { status: 500 }
    );
  }
}
