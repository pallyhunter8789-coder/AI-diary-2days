import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

// GET: 다이어리 내역 조회 및 세션 자동 생성
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("t");
  const dayStr = searchParams.get("day");

  if (!token || !dayStr) {
    return NextResponse.json({ error: "t and day parameters are required" }, { status: 400 });
  }

  const dayNo = parseInt(dayStr, 10);
  if (dayNo !== 1 && dayNo !== 2) {
    return NextResponse.json({ error: "day must be 1 or 2" }, { status: 400 });
  }

  try {
    // 1. 응답자 조회
    const { data: respondent, error: rError } = await supabaseServer
      .from("respondents")
      .select("id")
      .eq("access_token", token)
      .single();

    if (rError || !respondent) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }

    // 2. diary_days 데이터 확인
    let { data: diaryDay, error: dError } = await supabaseServer
      .from("diary_days")
      .select("*")
      .eq("respondent_id", respondent.id)
      .eq("day_no", dayNo)
      .maybeSingle();

    // 없으면 자동 생성 (in_progress)
    if (!diaryDay) {
      const today = new Date();
      let weekday = today.getDay(); // 0=일 ~ 6=토
      if (weekday === 0) weekday = 7;

      const { data: newDay, error: createError } = await supabaseServer
        .from("diary_days")
        .insert({
          respondent_id: respondent.id,
          day_no: dayNo,
          survey_date: today.toISOString().split("T")[0],
          weekday: weekday <= 5 ? weekday : 1, // 주말 진입 시 임의로 월요일(1) 취급
          status: "in_progress",
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (createError) {
        console.error("Failed to create diary day:", createError);
        return NextResponse.json({ error: "Database creation error" }, { status: 500 });
      }
      diaryDay = newDay;
    }

    // 3. diary_entries & entry_ai_tools 조인 조회
    const { data: entries, error: entriesError } = await supabaseServer
      .from("diary_entries")
      .select(`
        *,
        entry_ai_tools (*)
      `)
      .eq("diary_day_id", diaryDay.id)
      .order("start_slot", { ascending: true });

    if (entriesError) {
      console.error("Failed to fetch diary entries:", entriesError);
      return NextResponse.json({ error: "Failed to fetch entries" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      diaryDay: {
        id: diaryDay.id,
        status: diaryDay.status,
      },
      entries: entries.map((e: any) => ({
        id: e.id,
        start_slot: e.start_slot,
        end_slot: e.end_slot,
        activity_major: e.activity_major,
        activity_minor: e.activity_minor,
        activity_other: e.activity_other,
        location: e.location,
        ai_used: e.ai_used,
        note: e.note,
        ai_tools: e.entry_ai_tools || [],
      })),
    });
  } catch (err: any) {
    console.error("GET diary error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}

// POST: 다이어리 블록 추가/수정 자동저장
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { respondent_id, day_no, entry } = body;

    if (!respondent_id || !day_no || !entry) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. 해당 일자의 diary_days 가져오기
    const { data: diaryDay, error: dError } = await supabaseServer
      .from("diary_days")
      .select("id")
      .eq("respondent_id", respondent_id)
      .eq("day_no", day_no)
      .single();

    if (dError || !diaryDay) {
      return NextResponse.json({ error: "Diary day session not found" }, { status: 404 });
    }

    const start = parseInt(entry.start_slot, 10);
    const end = parseInt(entry.end_slot, 10);

    // 2. 슬롯 범위 중복 검사 (자기 자신 제외)
    let query = supabaseServer
      .from("diary_entries")
      .select("id, start_slot, end_slot")
      .eq("diary_day_id", diaryDay.id);

    if (entry.id) {
      query = query.neq("id", entry.id);
    }

    const { data: otherEntries, error: rangeError } = await query;
    if (rangeError) {
      console.error("Failed to check overlap range:", rangeError);
      return NextResponse.json({ error: "Range validation error" }, { status: 500 });
    }

    const otherEntriesList = (otherEntries || []) as any[];
    const isOverlapping = otherEntriesList.some(
      (oe: any) => !(end < oe.start_slot || start > oe.end_slot)
    );

    if (isOverlapping) {
      return NextResponse.json(
        { error: "해당 시간대에 이미 기록된 활동 블록이 존재합니다. 시간 범위를 다시 조절해 주세요.", code: "slot_overlap" },
        { status: 400 }
      );
    }

    // 3. 다이어리 블록 upsert
    const entryData: any = {
      diary_day_id: diaryDay.id,
      start_slot: start,
      end_slot: end,
      activity_major: entry.activity_major,
      activity_minor: entry.activity_minor,
      activity_other: entry.activity_other,
      location: entry.location,
      ai_used: !!entry.ai_used,
      note: entry.note || null,
      updated_at: new Date().toISOString(),
    };

    if (entry.id) {
      entryData.id = entry.id;
    }

    const { data: savedEntry, error: saveError } = await supabaseServer
      .from("diary_entries")
      .upsert(entryData)
      .select("id")
      .single();

    if (saveError || !savedEntry) {
      console.error("Failed to save diary entry:", saveError);
      return NextResponse.json({ error: "Failed to save entry" }, { status: 500 });
    }

    const entryId = savedEntry.id;

    // 4. 연동된 AI 도구 갱신
    const { error: deleteToolsError } = await supabaseServer
      .from("entry_ai_tools")
      .delete()
      .eq("entry_id", entryId);

    if (deleteToolsError) {
      console.error("Failed to clear old tools:", deleteToolsError);
      return NextResponse.json({ error: "Failed to sync AI tools" }, { status: 500 });
    }

    if (entry.ai_used && Array.isArray(entry.ai_tools) && entry.ai_tools.length > 0) {
      const toolsToInsert = entry.ai_tools.map((t: any) => ({
        entry_id: entryId,
        ai_type: t.ai_type,
        ai_tool_name: t.ai_tool_name,
        ai_tool_other: t.ai_tool_other || null,
        purpose: t.purpose,
        purpose_other: t.purpose_other || null,
      }));

      const { error: insertToolsError } = await supabaseServer
        .from("entry_ai_tools")
        .insert(toolsToInsert);

      if (insertToolsError) {
        console.error("Failed to insert new tools:", insertToolsError);
        return NextResponse.json({ error: "Failed to save AI tool specs" }, { status: 500 });
      }
    }

    // 4.3 events 에 패러데이터 로깅
    await supabaseServer.from("events").insert({
      respondent_id,
      event_type: "autosave",
      meta: { entry_id: entryId, day_no, action: entry.id ? "edit" : "add" },
    });

    return NextResponse.json({
      success: true,
      entry_id: entryId,
    });
  } catch (err: any) {
    console.error("POST diary error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
