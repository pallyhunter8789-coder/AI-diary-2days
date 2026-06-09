import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

function formatTime(slot: number): string {
  const START_HOUR = 8;
  const totalMinutes = START_HOUR * 60 + slot * 30;
  const hour = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// 간단 CSV 이스케이프 헬퍼
function escapeCsv(val: any): string {
  if (val === null || val === undefined) return "";
  let str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    str = str.replace(/"/g, '""');
    return `"${str}"`;
  }
  return str;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const password = searchParams.get("password");
  const type = searchParams.get("type"); // 'raw', 'long', 'codebook'

  const expectedPassword = process.env.ADMIN_PASSWORD || "admin1234";

  if (!password || password !== expectedPassword) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    if (type === "raw") {
      // 1. 원시(블록 join) CSV 내보내기
      const { data: rawData, error: rawError } = await supabaseServer
        .from("respondents")
        .select(`
          id, panel_source, panel_id, status, quota_cell_sexage, quota_cell_ksco,
          screening ( age, sex, employment_type ),
          demographics ( region, ksco_minor, monthly_work_hours, income_decile ),
          diary_days (
            id, day_no, survey_date, status,
            diary_entries (
              id, start_slot, end_slot, activity_major, activity_minor, activity_other, location, ai_used, note,
              entry_ai_tools ( ai_type, ai_tool_name, ai_tool_other, purpose, purpose_other )
            )
          )
        `);

      if (rawError) throw rawError;

      const headers = [
        "respondent_id", "panel_source", "panel_id", "status", "quota_cell_sexage", "quota_cell_ksco",
        "age", "sex", "employment_type", "region", "ksco_minor", "monthly_work_hours", "income_decile",
        "day_no", "survey_date", "day_status", "entry_id", "start_slot", "start_time", "end_slot", "end_time",
        "activity_major", "activity_minor", "activity_other", "location", "ai_used",
        "ai_type", "ai_tool_name", "ai_purpose", "note"
      ];

      const csvRows = [headers.join(",")];

      rawData.forEach((resp: any) => {
        const scr = resp.screening || {};
        const demo = resp.demographics || {};

        resp.diary_days?.forEach((day: any) => {
          day.diary_entries?.forEach((entry: any) => {
            const baseRow = [
              escapeCsv(resp.id),
              escapeCsv(resp.panel_source),
              escapeCsv(resp.panel_id),
              escapeCsv(resp.status),
              escapeCsv(resp.quota_cell_sexage),
              escapeCsv(resp.quota_cell_ksco),
              escapeCsv(scr.age),
              escapeCsv(scr.sex),
              escapeCsv(scr.employment_type),
              escapeCsv(demo.region),
              escapeCsv(demo.ksco_minor),
              escapeCsv(demo.monthly_work_hours),
              escapeCsv(demo.income_decile),
              escapeCsv(day.day_no),
              escapeCsv(day.survey_date),
              escapeCsv(day.status),
              escapeCsv(entry.id),
              escapeCsv(entry.start_slot),
              escapeCsv(formatTime(entry.start_slot)),
              escapeCsv(entry.end_slot),
              escapeCsv(formatTime(entry.end_slot + 1)),
              escapeCsv(entry.activity_major),
              escapeCsv(entry.activity_minor),
              escapeCsv(entry.activity_other),
              escapeCsv(entry.location),
              escapeCsv(entry.ai_used ? 1 : 0),
            ];

            if (entry.ai_used && entry.entry_ai_tools && entry.entry_ai_tools.length > 0) {
              entry.entry_ai_tools.forEach((tool: any) => {
                const toolRow = [
                  ...baseRow,
                  escapeCsv(tool.ai_type),
                  escapeCsv(tool.ai_tool_name === "other" ? tool.ai_tool_other : tool.ai_tool_name),
                  escapeCsv(tool.purpose === "other" ? tool.purpose_other : tool.purpose),
                  escapeCsv(entry.note)
                ];
                csvRows.push(toolRow.join(","));
              });
            } else {
              const emptyToolRow = [
                ...baseRow,
                "", "", "", // ai_type, ai_tool_name, ai_purpose
                escapeCsv(entry.note)
              ];
              csvRows.push(emptyToolRow.join(","));
            }
          });
        });
      });

      const csvContent = "\uFEFF" + csvRows.join("\n"); // Excel 한글 깨짐 방지 BOM 추가
      return new Response(csvContent, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=diary_raw_blocks.csv",
        },
      });

    } else if (type === "long") {
      // 2. long-format(슬롯 0~31 전개) CSV 내보내기
      const { data: rawData, error: rawError } = await supabaseServer
        .from("respondents")
        .select(`
          id, panel_source, panel_id, status, quota_cell_sexage, quota_cell_ksco,
          screening ( age, sex, employment_type ),
          demographics ( region, ksco_minor, monthly_work_hours, income_decile ),
          diary_days (
            id, day_no, survey_date, status,
            diary_entries (
              id, start_slot, end_slot, activity_major, activity_minor, activity_other, location, ai_used,
              entry_ai_tools ( ai_type, ai_tool_name, ai_tool_other, purpose, purpose_other )
            )
          )
        `);

      if (rawError) throw rawError;

      const headers = [
        "respondent_id", "panel_source", "panel_id", "status", "quota_cell_sexage", "quota_cell_ksco",
        "age", "sex", "employment_type", "region", "ksco_minor", "monthly_work_hours", "income_decile",
        "day_no", "survey_date", "slot", "time_label", "activity", "activity_detail", "location", "ai_used",
        "ai_types", "ai_tools", "ai_purposes"
      ];

      const csvRows = [headers.join(",")];

      rawData.forEach((resp: any) => {
        const scr = resp.screening || {};
        const demo = resp.demographics || {};

        resp.diary_days?.forEach((day: any) => {
          // 0~31 슬롯별로 매핑할 객체 리스트 준비
          const slotsData = Array.from({ length: 32 }).map((_, i) => ({
            slot: i,
            time_label: formatTime(i),
            activity: "",
            activity_detail: "",
            location: "",
            ai_used: 0,
            ai_types: [] as string[],
            ai_tools: [] as string[],
            ai_purposes: [] as string[],
          }));

          // 각 블록의 정보를 슬롯별로 전개 매핑
          day.diary_entries?.forEach((entry: any) => {
            for (let s = entry.start_slot; s <= entry.end_slot; s++) {
              if (slotsData[s]) {
                slotsData[s].activity = entry.activity_major || "";
                slotsData[s].activity_detail = entry.activity_other || entry.activity_minor || "";
                slotsData[s].location = entry.location || "";
                slotsData[s].ai_used = entry.ai_used ? 1 : 0;

                if (entry.ai_used && entry.entry_ai_tools) {
                  entry.entry_ai_tools.forEach((tool: any) => {
                    if (tool.ai_type) slotsData[s].ai_types.push(tool.ai_type);
                    const tName = tool.ai_tool_name === "other" ? tool.ai_tool_other : tool.ai_tool_name;
                    if (tName) slotsData[s].ai_tools.push(tName);
                    const pVal = tool.purpose === "other" ? tool.purpose_other : tool.purpose;
                    if (pVal) slotsData[s].ai_purposes.push(pVal);
                  });
                }
              }
            }
          });

          // 각 슬롯별로 Row 구성
          slotsData.forEach((sData) => {
            const row = [
              escapeCsv(resp.id),
              escapeCsv(resp.panel_source),
              escapeCsv(resp.panel_id),
              escapeCsv(resp.status),
              escapeCsv(resp.quota_cell_sexage),
              escapeCsv(resp.quota_cell_ksco),
              escapeCsv(scr.age),
              escapeCsv(scr.sex),
              escapeCsv(scr.employment_type),
              escapeCsv(demo.region),
              escapeCsv(demo.ksco_minor),
              escapeCsv(demo.monthly_work_hours),
              escapeCsv(demo.income_decile),
              escapeCsv(day.day_no),
              escapeCsv(day.survey_date),
              escapeCsv(sData.slot),
              escapeCsv(sData.time_label),
              escapeCsv(sData.activity),
              escapeCsv(sData.activity_detail),
              escapeCsv(sData.location),
              escapeCsv(sData.ai_used),
              escapeCsv(sData.ai_types.join("|")),
              escapeCsv(sData.ai_tools.join("|")),
              escapeCsv(sData.ai_purposes.join("|")),
            ];
            csvRows.push(row.join(","));
          });
        });
      });

      const csvContent = "\uFEFF" + csvRows.join("\n");
      return new Response(csvContent, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=diary_slot_long_format.csv",
        },
      });

    } else if (type === "codebook") {
      // 3. 코드북 내보내기 (변수 정의서)
      const codebook = [
        ["변수명", "라벨 및 정의", "값 설명 / 범주"],
        ["respondent_id", "응답자 고유식별자 (UUID)", "시스템 생성 랜덤 UUID"],
        ["panel_source", "패널사 출처 구분", "membrain(멤브레인), panelnow(패널나우), self(자체모집), pilot(파일럿)"],
        ["panel_id", "패널사 고유 ID", "패널사 연동 파라미터 값"],
        ["status", "응답 진행 상태", "invited(초대), screened_in(통과), screened_out(대상제외), quota_full(정원초과), day1_done(1일차완료), completed(최종완료), dropped(불성실종료)"],
        ["age", "응답자 연령 (만)", "만 19세 이상 임금근로자/자영업자 대상"],
        ["sex", "응답자 성별", "M(남성), F(여성)"],
        ["employment_type", "고용 형태", "wage(임금근로자), self(자영업자), none(해당없음; 스크리닝 탈락)"],
        ["region", "가구 거주 지역", "전국 17개 시/도 단위"],
        ["ksco_minor", "직업 중분류 상세", "자유 기입 방식 구체적 직무명"],
        ["monthly_work_hours", "월평균 근로 시간", "한 달 총 근로 시간 (숫자)"],
        ["income_decile", "가구 월평균 소득분위", "1분위(최저) ~ 10분위(최고)"],
        ["day_no", "다이어리 조사 일차", "1(1일차), 2(2일차)"],
        ["slot", "30분 타임라인 슬롯 인덱스", "0~31 (0 = 08:00~08:30, 31 = 23:30~24:00)"],
        ["time_label", "슬롯 시작 시각", "08:00, 08:30, 09:00, ..."],
        ["activity", "시간대 주요 활동 대분류", "work(업무), meeting(회의·소통), meal(식사), move(이동), rest(휴식·여가), house(가사·돌봄), study(학습), personal(개인용무), other(기타)"],
        ["activity_detail", "시간대 세부 활동명", "사용자 직접 자유기입 내용"],
        ["location", "활동 장소", "home(집), workplace(직장), commute(이동중), outside(외부), other(기타)"],
        ["ai_used", "AI 도구 사용 여부", "1(사용함), 0(사용하지 않음)"],
        ["ai_types", "사용한 AI 도구 유형 구분", "chat(대화형생성), search(AI검색), doc(문서업무보조), code(코드보조), image(이미지영상), voice(음성전사), auto(자동화), other(기타)"],
        ["ai_tools", "사용한 구체적 AI 도구 명칭", "카탈로그 선택 도구명 및 직접 입력한 도구명 (| 구분 다중기록 가능)"],
        ["ai_purposes", "AI 도구 사용 목적", "work(업무수행), learn(정보탐색·학습), write(문서작성), decide(의사결정), create(창작), personal(개인용무), other(기타)"]
      ];

      const csvRows = codebook.map(row => row.map(escapeCsv).join(","));
      const csvContent = "\uFEFF" + csvRows.join("\n");
      return new Response(csvContent, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=diary_codebook.csv",
        },
      });

    } else {
      return new Response("Invalid export type parameter", { status: 400 });
    }
  } catch (err: any) {
    console.error("Export process error:", err);
    return new Response("Export process failed: " + err.message, { status: 500 });
  }
}
