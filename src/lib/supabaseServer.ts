import "server-only";
import { createClient } from "@supabase/supabase-js";

// 1. Mock 메모리 DB 구조 정의 (실제 Supabase가 없을 때 로컬 테스트 흐름 지원)
const MOCK_DB = {
  respondents: [
    {
      id: "test-respondent-id-1234",
      access_token: "test-token-1234",
      panel_source: "self",
      panel_id: "test-user-1",
      status: "invited",
      created_at: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
    }
  ],
  screening: [] as any[],
  consent: [] as any[],
  diary_days: [
    { id: "dd1", respondent_id: "test-respondent-id-1234", day_no: 1, status: "in_progress", completed_at: null },
    { id: "dd2", respondent_id: "test-respondent-id-1234", day_no: 2, status: "in_progress", completed_at: null },
  ] as any[],
  diary_entries: [] as any[],
  events: [] as any[],
  demographics: [] as any[],
  post_survey: [] as any[],
  quality_flags: [] as any[],
  v_quota_progress: [
    // 성별×연령 할당셀
    { dimension: "sexage", cell_key: "M_19_29", label: "남성 19~29세", target: 5, completed: 1, in_progress: 1 },
    { dimension: "sexage", cell_key: "M_30_39", label: "남성 30~39세", target: 5, completed: 3, in_progress: 0 },
    { dimension: "sexage", cell_key: "M_40_49", label: "남성 40~49세", target: 5, completed: 5, in_progress: 0 }, // 마감셀 예제
    { dimension: "sexage", cell_key: "M_50_59", label: "남성 50~59세", target: 5, completed: 2, in_progress: 1 },
    { dimension: "sexage", cell_key: "M_60_plus", label: "남성 60세이상", target: 5, completed: 1, in_progress: 0 },
    { dimension: "sexage", cell_key: "F_19_29", label: "여성 19~29세", target: 5, completed: 2, in_progress: 0 },
    { dimension: "sexage", cell_key: "F_30_39", label: "여성 30~39세", target: 5, completed: 1, in_progress: 2 },
    { dimension: "sexage", cell_key: "F_40_49", label: "여성 40~49세", target: 5, completed: 4, in_progress: 1 },
    { dimension: "sexage", cell_key: "F_50_59", label: "여성 50~59세", target: 5, completed: 1, in_progress: 0 },
    { dimension: "sexage", cell_key: "F_60_plus", label: "여성 60세이상", target: 5, completed: 0, in_progress: 0 },
    // 직종별 할당셀
    { dimension: "ksco", cell_key: "mgr", label: "관리자", target: 5, completed: 2, in_progress: 0 },
    { dimension: "ksco", cell_key: "pro", label: "전문가 및 관련종사자", target: 10, completed: 6, in_progress: 1 },
    { dimension: "ksco", cell_key: "clerk", label: "사무 종사자", target: 10, completed: 8, in_progress: 2 },
    { dimension: "ksco", cell_key: "service", label: "서비스 종사자", target: 5, completed: 1, in_progress: 0 },
    { dimension: "ksco", cell_key: "sales", label: "판매 종사자", target: 5, completed: 0, in_progress: 1 },
    { dimension: "ksco", cell_key: "craft", label: "기능원 및 관련종사자", target: 5, completed: 0, in_progress: 0 },
    { dimension: "ksco", cell_key: "machine", label: "장치·기계조작 및 조립", target: 5, completed: 1, in_progress: 0 },
    { dimension: "ksco", cell_key: "labor", label: "단순노무 종사자", target: 5, completed: 2, in_progress: 1 },
  ] as any[]
};

class MockSupabaseQuery {
  private tableName: string;
  private filters: Array<{ col: string; val: any; type: string }> = [];
  private orderOpts: { col: string; ascending: boolean } | null = null;
  private limitCount: number | null = null;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(columns?: string) {
    return this;
  }

  eq(col: string, val: any) {
    this.filters.push({ col, val, type: "eq" });
    return this;
  }

  neq(col: string, val: any) {
    this.filters.push({ col, val, type: "neq" });
    return this;
  }

  or(cond: string) {
    this.filters.push({ col: "cell_key", val: cond, type: "or" });
    return this;
  }

  single() {
    return this.execute().then(res => {
      return {
        data: res.data ? res.data[0] || null : null,
        error: res.error
      };
    });
  }

  order(col: string, opts?: { ascending: boolean }) {
    this.orderOpts = { col, ascending: opts?.ascending ?? true };
    return this;
  }

  limit(n: number) {
    this.limitCount = n;
    return this;
  }

  async execute() {
    let list = (MOCK_DB as any)[this.tableName] || [];
    
    // 필터링
    for (const filter of this.filters) {
      if (filter.type === "eq") {
        list = list.filter((item: any) => {
          if (filter.col.includes("->>")) {
            const [parent, child] = filter.col.split("->>");
            return item[parent]?.[child] === filter.val;
          }
          return item[filter.col] === filter.val;
        });
      } else if (filter.type === "neq") {
        list = list.filter((item: any) => item[filter.col] !== filter.val);
      } else if (filter.type === "or") {
        const parts = filter.val.split(",");
        const allowedKeys = parts.map((p: string) => p.split(".").pop());
        list = list.filter((item: any) => allowedKeys.includes(item.cell_key));
      }
    }

    // 정렬
    if (this.orderOpts) {
      const col = this.orderOpts.col;
      const asc = this.orderOpts.ascending;
      list = [...list].sort((a: any, b: any) => {
        if (a[col] < b[col]) return asc ? -1 : 1;
        if (a[col] > b[col]) return asc ? 1 : -1;
        return 0;
      });
    }

    // limit
    if (this.limitCount !== null) {
      list = list.slice(0, this.limitCount);
    }

    // JOIN 흉내내기 (quality_flags -> respondents)
    if (this.tableName === "quality_flags") {
      list = list.map((flag: any) => {
        const resp = MOCK_DB.respondents.find(r => r.id === flag.respondent_id);
        return {
          ...flag,
          respondents: resp ? { panel_source: resp.panel_source, panel_id: resp.panel_id } : null
        };
      });
    }

    return { data: list, error: null };
  }

  then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class MockSupabaseTable {
  private tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(columns?: string) {
    return new MockSupabaseQuery(this.tableName).select(columns);
  }

  async insert(rows: any) {
    const list = (MOCK_DB as any)[this.tableName];
    if (Array.isArray(rows)) {
      rows.forEach(r => {
        const id = r.id || "gen_" + Math.random().toString(36).substr(2, 9);
        list.push({ id, created_at: new Date().toISOString(), ...r });
      });
    } else {
      const id = rows.id || "gen_" + Math.random().toString(36).substr(2, 9);
      list.push({ id, created_at: new Date().toISOString(), ...rows });
    }
    return { data: rows, error: null };
  }

  async upsert(rows: any) {
    const list = (MOCK_DB as any)[this.tableName];
    const items = Array.isArray(rows) ? rows : [rows];
    
    items.forEach(r => {
      const keyCol = this.tableName === "screening" || this.tableName === "demographics" ? "respondent_id" : "id";
      const existingIdx = list.findIndex((item: any) => item[keyCol] === r[keyCol]);
      if (existingIdx > -1) {
        list[existingIdx] = { ...list[existingIdx], ...r };
      } else {
        const id = r.id || "gen_" + Math.random().toString(36).substr(2, 9);
        list.push({ id, created_at: new Date().toISOString(), ...r });
      }
    });

    return { data: rows, error: null };
  }

  update(row: any) {
    const tableName = this.tableName;
    return {
      eq(col: string, val: any) {
        return {
          eq(col2: string, val2: any) {
            const list = (MOCK_DB as any)[tableName] || [];
            list.forEach((item: any) => {
              if (item[col] === val && item[col2] === val2) {
                Object.assign(item, row);
              }
            });
            return Promise.resolve({ data: null, error: null });
          },
          then(cb: any) {
            const list = (MOCK_DB as any)[tableName] || [];
            list.forEach((item: any) => {
              if (item[col] === val) {
                Object.assign(item, row);
              }
            });
            return Promise.resolve({ data: null, error: null }).then(cb);
          }
        };
      }
    };
  }

  delete() {
    const tableName = this.tableName;
    return {
      eq(col: string, val: any) {
        const list = (MOCK_DB as any)[tableName] || [];
        (MOCK_DB as any)[tableName] = list.filter((item: any) => item[col] !== val);
        return Promise.resolve({ data: null, error: null });
      }
    };
  }
}

// 2. Mock 모드 동작 판정 (실제 환경 변수가 비어 있거나 placeholder일 때 자동으로 활성화)
const isMockMode = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");

const realSupabaseClient = !isMockMode 
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

// 인터페이스 일관성을 맞추어 프록시 혹은 리얼 클라이언트 반환
export const supabaseServer = !isMockMode && realSupabaseClient ? realSupabaseClient : {
  from(tableName: string) {
    return new MockSupabaseTable(tableName);
  }
} as any;
