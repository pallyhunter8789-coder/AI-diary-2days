export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("t");

  try {
    // 1. 토큰이 없는 자체 공개 설문 참여자의 경우 신규 세션/응답자 자동 생성
    if (!token) {
      const selfToken = `self-${Math.random().toString(36).substring(2, 11)}-${Date.now()}`;
      
      const { data: newRespondent, error: insertError } = await supabaseServer
        .from("respondents")
        .insert({
          panel_source: "self",
          access_token: selfToken,
          status: "invited",
        })
        .select("*")
        .single();

      if (insertError || !newRespondent) {
        console.error("Failed to auto-create self respondent:", insertError);
        return NextResponse.json({ error: "Failed to create survey session" }, { status: 500 });
      }

      // events에 'open' 기록
      await supabaseServer.from("events").insert({
        respondent_id: newRespondent.id,
        event_type: "open",
        meta: {
          access_token: selfToken,
          status_at_entry: "invited",
          user_agent: req.headers.get("user-agent"),
          ip: req.headers.get("x-forwarded-for") || "unknown",
          auto_created: true,
        },
      });

      return NextResponse.json({
        success: true,
        respondent: {
          id: newRespondent.id,
          panel_source: newRespondent.panel_source,
          panel_id: newRespondent.panel_id,
          status: newRespondent.status,
        },
        redirectPath: `/screen/1?t=${selfToken}`,
      });
    }

    // 2. 응답자 토큰 검증
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
