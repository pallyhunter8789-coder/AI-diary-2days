export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("t");

  if (!token) {
    return NextResponse.json(
      { error: "Token parameter is required", code: "missing_token" },
      { status: 400 }
    );
  }

  try {
    // 1. 응답자 토큰 검증
    const { data: respondent, error: fetchError } = await supabaseServer
      .from("respondents")
      .select("*")
      .eq("access_token", token)
      .single();

    if (fetchError || !respondent) {
      return NextResponse.json(
        { error: "Invalid or expired token", code: "invalid_token" },
        { status: 404 }
      );
    }

    // 2. events 테이블에 'open' (진입/재진입) 패러데이터 기록
    const { error: eventError } = await supabaseServer.from("events").insert({
      respondent_id: respondent.id,
      event_type: "open",
      meta: {
        access_token: token,
        status_at_entry: respondent.status,
        user_agent: req.headers.get("user-agent"),
        ip: req.headers.get("x-forwarded-for") || "unknown",
      },
    });

    if (eventError) {
      console.error("Failed to log entry event:", eventError);
    }

    // 3. respondents.last_active_at 활성 시간 업데이트
    await supabaseServer
      .from("respondents")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", respondent.id);

    // 4. 상태(status)에 따른 분기 경로 결정
    let redirectPath = "/";
    switch (respondent.status) {
      case "invited":
        redirectPath = "/screen/1";
        break;
      case "screened_in":
        redirectPath = "/diary/1";
        break;
      case "day1_done":
        redirectPath = "/diary/2";
        break;
      case "completed":
        redirectPath = "/complete";
        break;
      case "screened_out":
        redirectPath = "/complete?reason=screened_out";
        break;
      case "quota_full":
        redirectPath = "/complete?reason=quota_full";
        break;
      case "dropped":
        redirectPath = "/complete?reason=dropped";
        break;
      default:
        redirectPath = "/";
    }

    return NextResponse.json({
      success: true,
      respondent: {
        id: respondent.id,
        panel_source: respondent.panel_source,
        panel_id: respondent.panel_id,
        status: respondent.status,
      },
      redirectPath,
    });
  } catch (err: any) {
    console.error("Database connection or execution error:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: err.message },
      { status: 500 }
    );
  }
}
