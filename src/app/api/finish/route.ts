import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      respondent_id,
      region,
      ksco_minor,
      monthly_work_hours,
      income_decile,
      attention_check_val,
      perceived_burden,
      perceived_accuracy,
      elapsed_seconds,
    } = body;

    if (
      !respondent_id ||
      !region ||
      !ksco_minor ||
      !monthly_work_hours ||
      !income_decile ||
      !attention_check_val ||
      !perceived_burden ||
      !perceived_accuracy
    ) {
      return NextResponse.json(
        { error: "Missing required demographic or survey fields", code: "missing_fields" },
        { status: 400 }
      );
    }

    const workHours = parseInt(monthly_work_hours, 10);
    const income = parseInt(income_decile, 10);

    if (isNaN(workHours) || workHours <= 0) {
      return NextResponse.json({ error: "Invalid monthly work hours" }, { status: 400 });
    }

    // 1. demographics 테이블 저장 (upsert)
    const { error: demoError } = await supabaseServer.from("demographics").upsert({
      respondent_id,
      region,
      ksco_minor,
      monthly_work_hours: workHours,
      income_decile: income,
    });

    if (demoError) {
      console.error("Failed to save demographics:", demoError);
      return NextResponse.json({ error: "Failed to save demographics" }, { status: 500 });
    }

    // 2. 2일차 post_survey 기록 저장
    const { error: surveyError } = await supabaseServer.from("post_survey").insert({
      respondent_id,
      day_no: 2,
      perceived_burden,
      perceived_accuracy,
      elapsed_seconds: elapsed_seconds || 0,
    });

    if (surveyError) {
      console.error("Failed to save 2nd day post survey:", surveyError);
      return NextResponse.json({ error: "Failed to save post survey" }, { status: 500 });
    }

    // 3. 2일차 diary_days status를 completed로 변경
    const { error: dayUpdateError } = await supabaseServer
      .from("diary_days")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("respondent_id", respondent_id)
      .eq("day_no", 2);

    if (dayUpdateError) {
      console.error("Failed to update 2nd day diary status:", dayUpdateError);
      return NextResponse.json({ error: "Failed to update diary day" }, { status: 500 });
    }

    // 4. respondents status를 completed로 변경 (최종 완료표본 인정)
    const { error: respondentError } = await supabaseServer
      .from("respondents")
      .update({ status: "completed" })
      .eq("id", respondent_id);

    if (respondentError) {
      console.error("Failed to update respondent status to completed:", respondentError);
      return NextResponse.json({ error: "Failed to finalize respondent status" }, { status: 500 });
    }

    // 5. events에 submit 기록 남기기
    await supabaseServer.from("events").insert({
      respondent_id,
      event_type: "submit",
      meta: { finalized: true },
    });

    // 6. 품질 검수 룰엔진 (quality_flags 생성)
    try {
      const flagsToInsert = [];

      // 어텐션 체크 주의확인 문항 검증 (3번이 정답)
      const attnVal = parseInt(attention_check_val, 10);
      if (isNaN(attnVal) || attnVal !== 3) {
        flagsToInsert.push({
          respondent_id,
          flag_type: "attention_fail",
          detail: `어텐션 체크 주의 확인 문항 오응답 (응답값: ${attention_check_val}번 / 정답: 3번).`,
        });
      }

      // 6.1 speeding 검사 (두 날짜의 elapsed_seconds 합산이 90초 미만인 경우)
      const { data: surveys } = await supabaseServer
        .from("post_survey")
        .select("elapsed_seconds")
        .eq("respondent_id", respondent_id);

      const totalElapsed = (surveys || []).reduce((acc: number, curr: any) => acc + (curr.elapsed_seconds || 0), 0);
      if (totalElapsed < 90) {
        flagsToInsert.push({
          respondent_id,
          flag_type: "speeding",
          detail: `1·2일차 총 응답 소요 시간 ${totalElapsed}초로 90초 미만 과속 의심.`,
        });
      }

      // 6.2 straightline 검사 (동일 활동이 너무 반복되거나 등록된 활동 종류가 너무 적은지 검사)
      const { data: entries } = await supabaseServer
        .from("diary_days")
        .select("day_no, diary_entries ( start_slot, end_slot, activity_major )")
        .eq("respondent_id", respondent_id);

      let day1Activities: string[] = Array(32).fill("");
      let day2Activities: string[] = Array(32).fill("");
      let hasStraightlineBlock = false;

      (entries || []).forEach((day: any) => {
        const arr = day.day_no === 1 ? day1Activities : day2Activities;
        day.diary_entries?.forEach((entry: any) => {
          const len = entry.end_slot - entry.start_slot + 1;
          if (len >= 16) {
            hasStraightlineBlock = true; // 단일 블록이 16칸(8시간) 이상
          }
          for (let s = entry.start_slot; s <= entry.end_slot; s++) {
            arr[s] = entry.activity_major;
          }
        });
      });

      if (hasStraightlineBlock) {
        flagsToInsert.push({
          respondent_id,
          flag_type: "straightline",
          detail: `단일 활동 블록이 8시간(16칸) 이상 연속적으로 지정되어 단순화 의심.`,
        });
      } else {
        const day1Unique = new Set(day1Activities.filter(a => a !== "")).size;
        const day2Unique = new Set(day2Activities.filter(a => a !== "")).size;
        if (day1Unique <= 1 || day2Unique <= 1) {
          flagsToInsert.push({
            respondent_id,
            flag_type: "straightline",
            detail: `하루 동안 기록된 고유 활동 개수가 1개 이하로 극단적 단순화 의심.`,
          });
        }
      }

      // 6.3 duplicate_pattern 검사 (Day1과 Day2의 활동 패턴이 90% 이상 일치하는 경우)
      let matchCount = 0;
      for (let s = 0; s < 32; s++) {
        if (day1Activities[s] === day2Activities[s] && day1Activities[s] !== "") {
          matchCount++;
        }
      }
      const matchRate = Math.round((matchCount / 32) * 100);
      if (matchRate >= 90) {
        flagsToInsert.push({
          respondent_id,
          flag_type: "duplicate_pattern",
          detail: `1일차와 2일차 활동 배치 일치율이 ${matchRate}%로 중복 유사 패턴 감지.`,
        });
      }

      // 6.4 device_dup 검사 (동일 IP에서 다중 토큰 응답 탐지)
      const { data: currentOpenEvent } = await supabaseServer
        .from("events")
        .select("meta")
        .eq("respondent_id", respondent_id)
        .eq("event_type", "open")
        .order("ts", { ascending: false })
        .limit(1);

      const currentIp = (currentOpenEvent?.[0]?.meta as any)?.ip;
      if (currentIp && currentIp !== "unknown") {
        const { data: dupIpEvents } = await supabaseServer
          .from("events")
          .select("respondent_id")
          .eq("event_type", "open")
          .eq("meta->>ip", currentIp)
          .neq("respondent_id", respondent_id)
          .limit(1);

        if (dupIpEvents && dupIpEvents.length > 0) {
          flagsToInsert.push({
            respondent_id,
            flag_type: "device_dup",
            detail: `동일한 IP 주소(${currentIp})에서 다중 토큰 접속 이력 감지.`,
          });
        }
      }

      if (flagsToInsert.length > 0) {
        await supabaseServer.from("quality_flags").insert(flagsToInsert);
      }
    } catch (qualityErr) {
      console.error("Quality Engine trigger failed:", qualityErr);
    }

    return NextResponse.json({
      success: true,
    });
  } catch (err: any) {
    console.error("POST finish error:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: err.message },
      { status: 500 }
    );
  }
}
