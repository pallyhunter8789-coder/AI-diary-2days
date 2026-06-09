import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { respondent_id, event_type, meta } = body;

    if (!respondent_id || !event_type) {
      return NextResponse.json(
        { error: "respondent_id and event_type are required" },
        { status: 400 }
      );
    }

    const { error } = await supabaseServer.from("events").insert({
      respondent_id,
      event_type,
      meta: meta || {},
    });

    if (error) {
      console.error("Failed to insert event log:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Event logger error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
