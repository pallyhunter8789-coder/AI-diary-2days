import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      respondent_id,
      age,
      sex,
      employment_type,
      ai_freq,
      ai_tool_free,
      ai_purpose_free,
      ksco_major,
    } = body;

    if (!respondent_id) {
      return NextResponse.json(
        { error: "Respondent ID is required", code: "missing_respondent_id" },
        { status: 400 }
      );
    }

    let passed = true;
    let fail_reason: string | null = null;

    // 1. S1 검증
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < 19) {
      passed = false;
      fail_reason = "age";
    } else if (employment_type === "none") {
      passed = false;
      fail_reason = "employment";
    } else if (!sex || (sex !== "M" && sex !== "F")) {
      passed = false;
      fail_reason = "sex_missing";
    }

    // 2. S2 검증 (S1 통과 시에만)
    if (passed) {
      if (ai_freq === "lt2") {
        passed = false;
        fail_reason = "ai_freq";
      } else if (ksco_major === "farm" || ksco_major === "military" || !ksco_major) {
        passed = false;
        fail_reason = "ksco";
      } else {
        // 진정성 필터링 (자유 기술 무성의 필터)
        const cleanTool = (ai_tool_free || "").trim().toLowerCase();
        const cleanPurpose = (ai_purpose_free || "").trim().toLowerCase();
        
        const invalidKeywords = [
          "없음", "모름", "아무거나", "test", "asdf", "몰라", "없어", 
          "ㅇㅇ", "ㄴㄴ", "none", "no", "dontknow", "don't know", "ㅁㄴㅇㄹ", "."
        ];
        
        const isToolInvalid = cleanTool.length < 2 || invalidKeywords.some(kw => cleanTool.includes(kw));
        const isPurposeInvalid = cleanPurpose.length < 2 || invalidKeywords.some(kw => cleanPurpose.includes(kw));
        
        if (isToolInvalid || isPurposeInvalid) {
          passed = false;
          fail_reason = "low_quality";
        }
      }
    }

    let ageBand: string | null = null;
    let quotaCellSexage: string | null = null;
    let quotaCellKsco: string | null = null;

    // 3. Quota 및 상태 판단
    if (passed) {
      if (ageNum >= 19 && ageNum <= 29) ageBand = "19_29";
      else if (ageNum >= 30 && ageNum <= 39) ageBand = "30_39";
      else if (ageNum >= 40 && ageNum <= 49) ageBand = "40_49";
      else if (ageNum >= 50 && ageNum <= 59) ageBand = "50_59";
      else if (ageNum >= 60) ageBand = "60_plus";

      quotaCellSexage = `${sex}_${ageBand}`;
      quotaCellKsco = ksco_major;

      // quota_cells 진행 상태 조회
      const { data: progress, error: progressError } = await supabaseServer
        .from("v_quota_progress")
        .select("*")
        .or(`cell_key.eq.${quotaCellSexage},cell_key.eq.${quotaCellKsco}`);

      if (progressError) {
        console.error("Failed to check quota progress:", progressError);
        throw new Error("Failed to check quota progress");
      }

      // 하나라도 이미 채워졌는지 확인 (completed >= target)
      const isQuotaFull = (progress || []).some((cell: any) => cell.completed >= cell.target);
      if (isQuotaFull) {
        passed = false;
        fail_reason = "quota_full";
      }
    }

    // 4. DB 상태 변경 및 로깅
    // 4.1 screening 테이블 upsert
    console.log("[Backend Screening Debug] Upserting screening table for respondent:", respondent_id);
    const { data: screeningUpsertData, error: screeningError } = await supabaseServer.from("screening").upsert({
      respondent_id,
      age: ageNum,
      age_band: ageBand,
      sex,
      employment_type,
      ai_freq,
      ai_tool_free,
      ai_purpose_free,
      ksco_major,
      passed,
      fail_reason,
    }).select("*");

    console.log("[Backend Screening Debug] Screening upsert result. data:", screeningUpsertData, "error:", screeningError);

    if (screeningError) {
      console.error("Failed to insert screening record:", screeningError);
      throw new Error(`Database error on screening logging: ${screeningError.message} (Code: ${screeningError.code})`);
    }

    // 4.2 respondents 테이블 업데이트
    let finalStatus = "screened_out";
    if (passed) {
      finalStatus = "screened_in";
    } else if (fail_reason === "quota_full") {
      finalStatus = "quota_full";
    }

    const updateData: any = { status: finalStatus };
    if (passed) {
      updateData.quota_cell_sexage = quotaCellSexage;
      updateData.quota_cell_ksco = quotaCellKsco;
    }

    console.log("[Backend Screening Debug] Updating respondent status to:", finalStatus, "payload:", updateData);
    const { data: respondentUpdateData, error: respondentUpdateError } = await supabaseServer
      .from("respondents")
      .update(updateData)
      .eq("id", respondent_id)
      .select("*");

    console.log("[Backend Screening Debug] Respondent status update result. data:", respondentUpdateData, "error:", respondentUpdateError);

    if (respondentUpdateError) {
      console.error("Failed to update respondent status:", respondentUpdateError);
      throw new Error(`Database error on respondent update: ${respondentUpdateError.message} (Code: ${respondentUpdateError.code})`);
    }

    // 4.3 events 테이블 패러데이터 기록
    const eventType = passed ? "screen_pass" : "dropoff";
    await supabaseServer.from("events").insert({
      respondent_id,
      event_type: eventType,
      meta: {
        passed,
        fail_reason,
        quota_cell_sexage: quotaCellSexage,
        quota_cell_ksco: quotaCellKsco,
      },
    });

    return NextResponse.json({
      success: true,
      passed,
      fail_reason,
      status: finalStatus,
    });
  } catch (err: any) {
    console.error("Screening process error:", err);
    return NextResponse.json(
      { 
        success: false, 
        error: err.message || "Internal Server Error",
        details: err.details || err.hint || err.message || "No extra details"
      },
      { status: 500 }
    );
  }
}
