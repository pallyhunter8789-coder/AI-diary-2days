"use client";

import { useSearchParams, useRouter, useParams } from "next/navigation";
import { Suspense, useState, useEffect, useRef } from "react";
import AppShell from "@/components/AppShell";

const SLOTS = 32;
const ROW_HEIGHT = 26; // px
const START_HOUR = 8;

const ACT_CLASSES: Record<string, { label: string; color: string }> = {
  work: { label: "업무", color: "#2F4A6B" },
  meeting: { label: "회의·소통", color: "#5A6B8C" },
  meal: { label: "식사", color: "#8C7A5A" },
  move: { label: "이동", color: "#6B7B8C" },
  rest: { label: "휴식·여가", color: "#5A8C7A" },
  house: { label: "가사·돌봄", color: "#8C5A7A" },
  study: { label: "학습", color: "#5A7A8C" },
  personal: { label: "개인용무", color: "#7A6B8C" },
  other: { label: "기타", color: "#8c8c8c" },
};

const LOC_CLASSES: Record<string, string> = {
  home: "집",
  workplace: "직장",
  commute: "이동중",
  outside: "외부",
  other: "기타",
};

const AI_TYPES: Record<string, string> = {
  chat: "대화형 생성AI",
  search: "AI 검색",
  doc: "문서·업무보조",
  code: "코드 보조",
  image: "이미지·영상",
  voice: "음성·전사",
  auto: "자동화",
  other: "기타",
};

const AI_RECOMMENDED_TOOLS: Record<string, string[]> = {
  chat: ["ChatGPT", "Claude", "Gemini", "Clova X"],
  search: ["Perplexity", "AI Overview"],
  doc: ["Copilot", "Notion AI", "뤼튼"],
  code: ["GitHub Copilot", "Cursor"],
  image: ["Midjourney", "DALL·E", "Sora"],
  voice: ["Clova Note", "Whisper"],
  auto: [],
  other: [],
};

const PURPOSES: Record<string, string> = {
  work: "업무수행",
  learn: "정보탐색·학습",
  write: "문서작성",
  decide: "의사결정",
  create: "창작",
  personal: "개인용무",
  other: "기타",
};

function formatTime(slot: number): string {
  const totalMinutes = START_HOUR * 60 + slot * 30;
  const hour = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

interface ClientAiTool {
  ai_type: string;
  ai_tool_name: string;
  ai_tool_other?: string;
  purpose: string;
  purpose_other?: string;
}

interface ClientDiaryEntry {
  id: string;
  start_slot: number;
  end_slot: number;
  activity_major: string;
  activity_minor?: string;
  activity_other?: string;
  location: string;
  ai_used: boolean;
  note?: string;
  ai_tools: ClientAiTool[];
}

function DiaryContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const token = searchParams.get("t");
  const day = parseInt(params.day as string, 10);

  const [entries, setEntries] = useState<ClientDiaryEntry[]>([]);
  const [respondentId, setRespondentId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  
  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [editingEntry, setEditingEntry] = useState<Partial<ClientDiaryEntry> | null>(null);
  
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);
  const [isTimelineDragging, setIsTimelineDragging] = useState<boolean>(false);
  const [dragStartSlot, setDragStartSlot] = useState<number | null>(null);
  const [dragCurrentSlot, setDragCurrentSlot] = useState<number | null>(null);

  const [resizingEntryId, setResizingEntryId] = useState<string | null>(null);
  const [resizeStartSlot, setResizeStartSlot] = useState<number | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFailedSaveRef = useRef<{ entry: ClientDiaryEntry; isDelete: boolean } | null>(null);

  // 소요시간 측정을 위한 진입 시각
  const pageLoadTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!token) {
      router.replace("/");
      return;
    }

    const fetchDiary = async () => {
      try {
        const res = await fetch(`/api/diary?t=${token}&day=${day}`);
        const data = await res.json();
        
        if (res.ok && data.success) {
          let currentId = null;
          const savedS1 = sessionStorage.getItem("s1_data") || sessionStorage.getItem("screening_data");
          if (savedS1) {
            const parsed = JSON.parse(savedS1);
            setRespondentId(parsed.respondentId);
            currentId = parsed.respondentId;
          } else {
            const verifyRes = await fetch(`/api/respondent?t=${token}`);
            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.success) {
              setRespondentId(verifyData.respondent.id);
              currentId = verifyData.respondent.id;
            }
          }
          setEntries(data.entries);

          if (currentId) {
            fetch("/api/event", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                respondent_id: currentId,
                event_type: "day_start",
                meta: { day_no: day, reentry: true },
              }),
            }).catch((err) => console.error("Failed to log day_start reentry:", err));
          }
        } else {
          router.replace("/");
        }
      } catch (err) {
        console.error("Diary load error:", err);
        showToast("다이어리 데이터를 가져오는데 실패했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchDiary();
  }, [token, day, router]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2000);
  };

  const isOverlap = (start: number, end: number, ignoreId?: string) => {
    return entries.some(
      (e) => e.id !== ignoreId && !(end < e.start_slot || start > e.end_slot)
    );
  };

  const triggerAutoSave = (updatedEntry: ClientDiaryEntry, isDelete = false) => {
    setSaveStatus("saving");
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (!respondentId) return;

      try {
        let response;
        if (isDelete) {
          response = await fetch("/api/diary/entry/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              respondent_id: respondentId,
              entry_id: updatedEntry.id,
            }),
          });
        } else {
          response = await fetch("/api/diary", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              respondent_id: respondentId,
              day_no: day,
              entry: updatedEntry,
            }),
          });
        }

        if (response.ok) {
          setSaveStatus("saved");
          lastFailedSaveRef.current = null;
          showToast(isDelete ? "블록이 삭제되었습니다." : "작성 내역이 자동 저장되었습니다.");
          
          if (!isDelete) {
            const data = await response.json();
            if (data.success && data.entry_id && updatedEntry.id !== data.entry_id) {
              setEntries((prev) =>
                prev.map((e) => (e.id === updatedEntry.id ? { ...e, id: data.entry_id } : e))
              );
            }
          }
        } else {
          setSaveStatus("error");
          lastFailedSaveRef.current = { entry: updatedEntry, isDelete };
          showToast("자동 저장에 실패했습니다. 네트워크를 확인해 주세요.");
        }
      } catch (e) {
        console.error("Autosave request error:", e);
        setSaveStatus("error");
        lastFailedSaveRef.current = { entry: updatedEntry, isDelete };
        showToast("네트워크 연결이 끊겼습니다.");
      }
    }, 800);
  };

  const handleRetrySave = () => {
    if (lastFailedSaveRef.current) {
      const { entry, isDelete } = lastFailedSaveRef.current;
      triggerAutoSave(entry, isDelete);
    }
  };

  const getSlotFromY = (clientY: number): number => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    const slotIndex = Math.floor(relativeY / ROW_HEIGHT);
    return Math.max(0, Math.min(SLOTS - 1, slotIndex));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".diary-block")) return;
    
    setIsTimelineDragging(true);
    const slot = getSlotFromY(e.clientY);
    setDragStartSlot(slot);
    setDragCurrentSlot(slot);
    
    if (timelineRef.current) {
      timelineRef.current.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isTimelineDragging || dragStartSlot === null) return;
    const slot = getSlotFromY(e.clientY);
    setDragCurrentSlot(slot);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isTimelineDragging || dragStartSlot === null || dragCurrentSlot === null) return;
    setIsTimelineDragging(false);
    
    if (timelineRef.current) {
      timelineRef.current.releasePointerCapture(e.pointerId);
    }

    const start = Math.min(dragStartSlot, dragCurrentSlot);
    const end = Math.max(dragStartSlot, dragCurrentSlot);

    setDragStartSlot(null);
    setDragCurrentSlot(null);

    if (isOverlap(start, end)) {
      showToast("이미 기록된 시간 범위와 겹칠 수 없습니다.");
      return;
    }

    const newEntry: Partial<ClientDiaryEntry> = {
      id: "temp_" + Date.now(),
      start_slot: start,
      end_slot: end,
      activity_major: "",
      location: "workplace",
      ai_used: false,
      ai_tools: [],
    };
    
    setEditingEntry(newEntry);
    setEditorOpen(true);
  };

  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent, entry: ClientDiaryEntry) => {
    e.stopPropagation();
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    setResizingEntryId(entry.id);
    setResizeStartSlot(entry.start_slot);
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (!resizingEntryId || resizeStartSlot === null) return;
      const currentSlot = getSlotFromY(e.clientY);
      
      if (currentSlot < resizeStartSlot) return;
      if (isOverlap(resizeStartSlot, currentSlot, resizingEntryId)) return;

      setEntries((prev) =>
        prev.map((item) =>
          item.id === resizingEntryId ? { ...item, end_slot: currentSlot } : item
        )
      );
    };

    const handleGlobalPointerUp = () => {
      if (resizingEntryId) {
        const updated = entries.find((e) => e.id === resizingEntryId);
        if (updated) {
          triggerAutoSave(updated);
        }
        setResizingEntryId(null);
        setResizeStartSlot(null);
        document.body.style.userSelect = "";
      }
    };

    if (resizingEntryId !== null) {
      window.addEventListener("pointermove", handleGlobalPointerMove);
      window.addEventListener("pointerup", handleGlobalPointerUp);
    }

    return () => {
      window.removeEventListener("pointermove", handleGlobalPointerMove);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
    };
  }, [resizingEntryId, resizeStartSlot, entries]);

  const handleSaveEditor = () => {
    if (!editingEntry || !editingEntry.activity_major) {
      showToast("주요 활동을 선택해 주세요.");
      return;
    }

    let filteredTools: ClientAiTool[] = [];
    if (editingEntry.ai_used) {
      if (!editingEntry.ai_tools || editingEntry.ai_tools.length === 0) {
        showToast("사용하신 AI 도구를 최소 1개 이상 추가해 주세요.");
        return;
      }
      for (let i = 0; i < editingEntry.ai_tools.length; i++) {
        const t = editingEntry.ai_tools[i];
        if (!t.ai_type || !t.ai_tool_name || !t.ai_tool_name.trim() || !t.purpose) {
          showToast(`AI 도구 #${i + 1}의 유형, 이름, 사용 목적을 모두 입력/선택해 주세요.`);
          return;
        }
      }
      filteredTools = editingEntry.ai_tools.map(t => ({
        ...t,
        ai_tool_name: t.ai_tool_name.trim(),
      }));
    }

    const finalEntry = {
      id: editingEntry.id!,
      start_slot: editingEntry.start_slot!,
      end_slot: editingEntry.end_slot!,
      activity_major: editingEntry.activity_major,
      activity_minor: editingEntry.activity_minor || "",
      activity_other: editingEntry.activity_other || "",
      location: editingEntry.location || "workplace",
      ai_used: !!editingEntry.ai_used,
      note: editingEntry.note || "",
      ai_tools: editingEntry.ai_used ? filteredTools : [],
    };

    let updatedEntries = [...entries];
    const isNew = finalEntry.id.startsWith("temp_");

    if (isNew) {
      updatedEntries.push(finalEntry);
    } else {
      updatedEntries = updatedEntries.map((e) => (e.id === finalEntry.id ? finalEntry : e));
    }

    setEntries(updatedEntries);
    setEditorOpen(false);
    setEditingEntry(null);
    triggerAutoSave(finalEntry);
  };

  const handleDeleteEntry = (id: string) => {
    const target = entries.find((e) => e.id === id);
    if (!target) return;

    setEntries((prev) => prev.filter((e) => e.id !== id));
    setEditorOpen(false);
    setEditingEntry(null);
    triggerAutoSave(target, true);
  };

  const handleCloneLast = () => {
    if (entries.length === 0) {
      showToast("복제할 이전 활동이 없습니다.");
      return;
    }
    const sorted = [...entries].sort((a, b) => b.end_slot - a.end_slot);
    const last = sorted[0];

    setEditingEntry((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        activity_major: last.activity_major,
        activity_minor: last.activity_minor,
        activity_other: last.activity_other,
        location: last.location,
        ai_used: last.ai_used,
        ai_tools: last.ai_tools ? [...last.ai_tools] : [],
        note: last.note,
      };
    });
    showToast("직전 활동 정보를 불러왔습니다.");
  };

  const handleFinish = async () => {
    const filledSlotsCount = entries.reduce((acc, curr) => acc + (curr.end_slot - curr.start_slot + 1), 0);
    
    if (filledSlotsCount < SLOTS) {
      const confirmProceed = window.confirm(
        `아직 채워지지 않은 공백 시간이 있습니다. (${SLOTS - filledSlotsCount}칸 비어있음)\n이대로 다이어리 기록을 완료하시겠습니까?`
      );
      if (!confirmProceed) return;
    }

    if (day === 1) {
      // 1일차인 경우 다이어리 작성 소요시간(초) 계산 후 세션스토리지 보관 및 이동
      const elapsed = Math.round((Date.now() - pageLoadTimeRef.current) / 1000);
      sessionStorage.setItem("day1_elapsed", elapsed.toString());
      router.push(`/diary/1/done?t=${token}`);
    } else {
      // 2일차인 경우 바로 /finish 로 이동 (거기서 사후 문항과 기본정보를 함께 처리)
      router.push(`/finish?t=${token}`);
    }
  };

  const getDragHighlightStyle = () => {
    if (!isTimelineDragging || dragStartSlot === null || dragCurrentSlot === null) return { display: "none" };
    const start = Math.min(dragStartSlot, dragCurrentSlot);
    const end = Math.max(dragStartSlot, dragCurrentSlot);
    return {
      display: "block",
      top: `${start * ROW_HEIGHT + 1}px`,
      height: `${(end - start + 1) * ROW_HEIGHT - 2}px`,
    };
  };

  const filledSlots = entries.reduce((acc, curr) => acc + (curr.end_slot - curr.start_slot + 1), 0);
  const progressPercent = Math.round((filledSlots / SLOTS) * 100);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-navy border-t-cyan"></div>
      </div>
    );
  }

  return (
    <AppShell
      headerContent={
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#9fc7ec] tracking-wider">AI 시간다이어리</span>
            {saveStatus === "saving" && (
              <span className="flex items-center text-xs text-cyan gap-1.5 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-cyan"></span>저장 중...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="flex items-center text-xs text-gray-300 gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#10b981]"></span>자동 저장됨
              </span>
            )}
            {saveStatus === "error" && (
              <button
                type="button"
                onClick={handleRetrySave}
                className="flex items-center text-xs text-red-400 gap-1.5 font-bold cursor-pointer hover:text-red-300 transition-colors"
                title="클릭하여 재시도"
              >
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>저장 실패 (재시도)
              </button>
            )}
          </div>
          <div className="flex items-baseline justify-between">
            <h1 className="text-xl font-extrabold tracking-tight">Day {day} · 다이어리</h1>
            <span className="text-xs font-medium text-gray-300">{filledSlots} / 32 칸 채움</span>
          </div>
          <div className="w-full h-2 rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan to-[#7fe6f6] rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>
      }
      footerContent={
        <button
          onClick={handleFinish}
          className="btn primary w-full text-center py-4 font-bold text-base"
        >
          기록 완료하기
        </button>
      }
    >
      <div className="space-y-4 pb-20 select-none">
        <div className="bg-[#eaf9fd] border-b border-[#d6eff6] p-3 text-xs font-semibold text-[#0a6b80] rounded-xl flex items-center gap-1.5">
          <span>💡</span>
          <span>빈 칸을 <b>터치 후 아래로 드래그</b>하여 활동 블록을 생성하세요.</span>
        </div>

        <div
          ref={timelineRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative border-l border-[#e5e9f0] select-none touch-none"
          style={{
            height: `${SLOTS * ROW_HEIGHT}px`,
            marginLeft: "48px",
            touchAction: isTimelineDragging || resizingEntryId ? "none" : "pan-y",
          }}
        >
          {Array.from({ length: SLOTS }).map((_, i) => (
            <div
              key={i}
              className={`absolute left-0 right-0 border-b border-dashed border-[#eef1f6]`}
              style={{
                top: `${i * ROW_HEIGHT}px`,
                height: `${ROW_HEIGHT}px`,
                borderBottomStyle: i % 2 === 1 ? "solid" : "dashed",
                borderBottomColor: i % 2 === 1 ? "#e7ebf3" : "#eef1f6",
              }}
            >
              {i % 2 === 0 && (
                <span className="absolute -left-12 top-[-8px] w-10 text-right text-[10px] font-bold text-gray-400">
                  {formatTime(i)}
                </span>
              )}
            </div>
          ))}
          <span className="absolute -left-12 bottom-[-8px] w-10 text-right text-[10px] font-bold text-gray-400">
            24:00
          </span>

          <div
            className="absolute left-[2px] right-[2px] bg-cyan/20 border-2 border-dashed border-cyan rounded-lg z-10 pointer-events-none"
            style={getDragHighlightStyle()}
          ></div>

          {entries.map((entry) => {
            const act = ACT_CLASSES[entry.activity_major] || { label: "미지정", color: "#8c8c8c" };
            const top = entry.start_slot * ROW_HEIGHT + 2;
            const height = (entry.end_slot - entry.start_slot + 1) * ROW_HEIGHT - 4;

            return (
              <div
                key={entry.id}
                onClick={() => {
                  setEditingEntry({ ...entry });
                  setEditorOpen(true);
                }}
                className={`absolute left-[2px] right-[2px] rounded-xl text-white p-2 flex flex-col justify-center overflow-hidden shadow-sm cursor-pointer z-10 diary-block ${
                  entry.ai_used ? "border-l-4 border-cyan" : ""
                }`}
                style={{
                  top: `${top}px`,
                  height: `${height}px`,
                  backgroundColor: act.color,
                }}
              >
                <div className="text-xs font-bold truncate">
                  {entry.activity_other || entry.activity_minor || act.label}
                </div>
                <div className="text-[9px] opacity-80 truncate mt-0.5">
                  {entry.ai_used ? "✨ AI 활용" : LOC_CLASSES[entry.location]}
                </div>

                {entry.ai_used && (
                  <span className="absolute top-1.5 right-2 text-[9px] bg-cyan text-navy font-black px-1.5 py-0.5 rounded-full">
                    AI
                  </span>
                )}

                <div
                  onMouseDown={(e) => handleResizeStart(e, entry)}
                  onTouchStart={(e) => handleResizeStart(e, entry)}
                  className="absolute bottom-0 left-0 right-0 h-3 cursor-row-resize flex items-center justify-center bg-black/10 hover:bg-black/20"
                >
                  <span className="w-6 h-[2px] bg-white/40 rounded-full"></span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 바텀 시트 에디터 */}
      <div
        onClick={() => setEditorOpen(false)}
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-200 ${
          editorOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      ></div>
      <div
        className={`fixed left-0 right-0 bottom-0 max-h-[85%] bg-white rounded-t-3xl z-50 overflow-y-auto transition-transform duration-300 ease-out shadow-2xl ${
          editorOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto my-3"></div>

        {editingEntry && (
          <div className="px-5 pb-8 space-y-6">
            <div className="flex justify-between items-baseline border-b border-gray-100 pb-3">
              <h3 className="text-lg font-bold text-navy">활동 상세 입력</h3>
              <span className="text-sm font-bold text-gray-500">
                {formatTime(editingEntry.start_slot!)} ~ {formatTime(editingEntry.end_slot! + 1)}
              </span>
            </div>

            {/* 1. 활동 대분류 */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-navy block">어떤 활동을 하셨나요?</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(ACT_CLASSES).map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => setEditingEntry((prev) => prev ? ({ ...prev, activity_major: k }) : null)}
                    className={`chip py-2 px-3.5 text-xs font-semibold ${
                      editingEntry.activity_major === k ? "on" : ""
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 1.2 세부 활동 입력 */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-navy block">세부 활동 기록 (직접 입력)</label>
              <input
                type="text"
                placeholder="예: 주간 기획 업무 회의, 자재 단가 엑셀 정리 등"
                value={editingEntry.activity_other || ""}
                onChange={(e) => setEditingEntry((prev) => prev ? ({ ...prev, activity_other: e.target.value }) : null)}
                className="txt text-sm"
              />
            </div>

            {/* 2. 장소 분류 */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-navy block">어디에서 하셨나요?</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(LOC_CLASSES).map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => setEditingEntry((prev) => prev ? ({ ...prev, location: k }) : null)}
                    className={`chip py-2 px-3.5 text-xs font-semibold ${
                      editingEntry.location === k ? "on" : ""
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. AI 사용 스위치 */}
            <div className="flex items-center justify-between bg-[#f3fbfd] border border-[#d6eff6] rounded-2xl p-4">
              <div className="space-y-0.5">
                <span className="text-sm font-bold text-[#0a6b80] block">이 시간대에 AI 도구를 사용했습니까?</span>
                <span className="text-[10px] text-[#5a93a1]">ChatGPT, 번역, 회의록 요약, 코딩 보조 등 활용 포함</span>
              </div>
              <button
                onClick={() => setEditingEntry((prev) => {
                  if (!prev) return null;
                  const newAiUsed = !prev.ai_used;
                  const tools = newAiUsed ? [{ ai_type: "", ai_tool_name: "", purpose: "" }] : [];
                  return { ...prev, ai_used: newAiUsed, ai_tools: tools };
                })}
                className={`w-12 h-7 rounded-full transition-all duration-200 relative ${
                  editingEntry.ai_used ? "bg-cyan" : "bg-gray-200"
                }`}
              >
                <span
                  className={`w-5.5 h-5.5 bg-white rounded-full absolute top-0.75 transition-all duration-200 shadow-sm ${
                    editingEntry.ai_used ? "left-5.75" : "left-0.75"
                  }`}
                ></span>
              </button>
            </div>

            {/* AI 사용 디테일 칩 영역 */}
            {editingEntry.ai_used && (
              <div className="space-y-4">
                <div className="flex justify-between items-center bg-gray-100 p-2.5 rounded-xl">
                  <span className="text-xs font-bold text-navy">사용한 AI 도구 목록</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingEntry((prev) => {
                        if (!prev) return null;
                        const tools = prev.ai_tools ? [...prev.ai_tools] : [];
                        return {
                          ...prev,
                          ai_tools: [...tools, { ai_type: "", ai_tool_name: "", purpose: "" }]
                        };
                      });
                    }}
                    className="text-xs font-bold text-cyan border border-cyan/30 px-2.5 py-1 rounded-lg bg-white shadow-sm hover:bg-cyan/5 transition-all duration-200"
                  >
                    + 도구 추가
                  </button>
                </div>

                {(editingEntry.ai_tools && editingEntry.ai_tools.length > 0 ? editingEntry.ai_tools : [{ ai_type: "", ai_tool_name: "", purpose: "" }]).map((tool, idx) => (
                  <div key={idx} className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-4 relative">
                    <div className="flex justify-between items-center border-b border-gray-200 pb-2 mb-1">
                      <span className="text-xs font-bold text-[#0a6b80]">AI 도구 #{idx + 1}</span>
                      {editingEntry.ai_tools && editingEntry.ai_tools.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingEntry((prev) => {
                              if (!prev) return null;
                              const tools = prev.ai_tools ? [...prev.ai_tools] : [];
                              tools.splice(idx, 1);
                              return { ...prev, ai_tools: tools };
                            });
                          }}
                          className="text-xs font-bold text-red-500 hover:text-red-700 px-2 py-1 bg-red-50 rounded"
                        >
                          삭제
                        </button>
                      )}
                    </div>

                    {/* AI 유형 */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-navy block">사용한 AI 유형</label>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(AI_TYPES).map(([k, v]) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => {
                              setEditingEntry((prev) => {
                                if (!prev) return null;
                                const tools = prev.ai_tools ? [...prev.ai_tools] : [{ ai_type: "", ai_tool_name: "", purpose: "" }];
                                if (tools.length === 0) {
                                  tools.push({ ai_type: k, ai_tool_name: "", purpose: "" });
                                } else if (tools[idx]) {
                                  tools[idx] = { ...tools[idx], ai_type: k, ai_tool_name: "" };
                                }
                                return { ...prev, ai_tools: tools };
                              });
                            }}
                            className={`chip py-1.5 px-3 text-[10px] font-semibold ${
                              tool.ai_type === k ? "on" : ""
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* AI 도구명 자동완성/직접입력 */}
                    {tool.ai_type && (
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-navy block">사용한 AI 도구명</label>
                        <input
                          type="text"
                          list={`catalog_tools_${idx}`}
                          placeholder="도구명을 적어주세요. (추천 도구 목록 선택 가능)"
                          value={tool.ai_tool_name || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditingEntry((prev) => {
                              if (!prev) return null;
                              const tools = prev.ai_tools ? [...prev.ai_tools] : [];
                              if (tools[idx]) {
                                tools[idx] = { ...tools[idx], ai_tool_name: val };
                              }
                              return { ...prev, ai_tools: tools };
                            });
                          }}
                          className="txt text-sm"
                        />
                        <datalist id={`catalog_tools_${idx}`}>
                          {(AI_RECOMMENDED_TOOLS[tool.ai_type] || []).map((t) => (
                            <option key={t} value={t} />
                          ))}
                        </datalist>
                      </div>
                    )}

                    {/* AI 사용 목적 */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-navy block">AI 사용 목적</label>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(PURPOSES).map(([k, v]) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => {
                              setEditingEntry((prev) => {
                                if (!prev) return null;
                                const tools = prev.ai_tools ? [...prev.ai_tools] : [];
                                if (tools[idx]) {
                                  tools[idx] = { ...tools[idx], purpose: k };
                                }
                                return { ...prev, ai_tools: tools };
                              });
                            }}
                            className={`chip py-1.5 px-3 text-[10px] font-semibold ${
                              tool.purpose === k ? "on" : ""
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 시트 하단 액션 버튼 */}
            <div className="flex gap-2.5 pt-4">
              <button onClick={handleCloneLast} className="btn ghost flex-none py-4 px-3" title="직전 활동 복제">
                📋 직전동일
              </button>
              
              {!editingEntry.id?.startsWith("temp_") && (
                <button
                  onClick={() => handleDeleteEntry(editingEntry.id!)}
                  className="btn ghost text-red-500 border border-red-200 flex-none py-4 px-4"
                >
                  삭제
                </button>
              )}
              
              <button onClick={handleSaveEditor} className="btn cyan flex-1 py-4 font-bold">
                입력 저장
              </button>
            </div>
          </div>
        )}
      </div>

      <div
        className={`fixed left-50% bottom-[88px] translate-x-[-50%] bg-[#11192b] text-white text-xs font-bold py-3 px-5 rounded-full z-50 transition-all duration-300 pointer-events-none shadow-lg ${
          toastMessage ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
        }`}
      >
        {toastMessage}
      </div>

    </AppShell>
  );
}

export default function Diary() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center p-6 bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-navy border-t-cyan"></div>
      </div>
    }>
      <DiaryContent />
    </Suspense>
  );
}
