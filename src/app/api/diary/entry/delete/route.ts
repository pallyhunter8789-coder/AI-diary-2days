import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { respondent_id, entry_id } = body;

    if (!respondent_id || !entry_id) {
      return NextResponse.json({ error: "respondent_id and entry_id are required" }, { status: 400 });
    }

    // 보안 검수: 해당 블록이 이 응답자의 것이 맞는지 검사합니다.
    const { data: entry, error: fetchError } = await supabaseServer
      .from("diary_entries")
      .select("id, diary_days(respondent_id)")
      .eq("id", entry_id)
      .single();

    if (fetchError || !entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const entryOwnerId = (entry as any).diary_days?.respondent_id;
    if (entryOwnerId !== respondent_id) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
    }

    // 다이어리 블록 삭제 (Foreign Key CASCADE 룰로 인해 entry_ai_tools 레코드들도 자동 제거됩니다.)
    const { error: deleteError } = await supabaseServer
      .from("diary_entries")
      .delete()
      .eq("id", entry_id);

    if (deleteError) {
      console.error("Failed to delete entry:", deleteError);
      return NextResponse.json({ error: "Failed to delete entry" }, { status: 500 });
    }

    // events 에 삭제 패러데이터 로깅
    await supabaseServer.from("events").insert({
      respondent_id,
      event_type: "autosave",
      meta: { entry_id, action: "delete" },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("DELETE entry error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
