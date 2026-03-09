import * as db from "../db";
import fs from "node:fs/promises";
import path from "node:path";

type SyncOptions = {
  limit?: number;
  dryRun?: boolean;
  incremental?: boolean;
};

type SyncResult = {
  source: "mssql";
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  query: string;
  errors: string[];
  incremental: boolean;
  incrementalSince: string | null;
  lastMarker: string | null;
};

export type MssqlPatientInsertInput = {
  patientCode: string;
  fullName: string;
  phone?: string | null;
  address?: string | null;
  age?: number | null;
  gender?: string | null;
  dateOfBirth?: string | Date | null;
  branch?: string | null;
  serviceCode?: string | null;
  locationType?: "center" | "external" | string | null;
  paidAmount?: number | string | null;
  dueAmount?: number | string | null;
  enteredBy?: string | null;
};

type MssqlSyncState = {
  lastSuccessAt?: string;
  lastMarker?: string;
  lastMode?: "full" | "incremental";
  lastResult?: {
    fetched: number;
    inserted: number;
    updated: number;
    skipped: number;
    dryRun: boolean;
  };
};

const MSSQL_SYNC_STATE_KEY = "mssql_sync_state_v1";
const MSSQL_SYNC_RUNTIME_STATUS_KEY = "mssql_sync_runtime_status_v1";
type MssqlSyncRuntimeStatus = {
  running?: boolean;
  lastRunStartedAt?: string;
  lastRunFinishedAt?: string;
  lastError?: string | null;
  nextRunAt?: string | null;
  lastChangeCount?: number;
};
let doctorCsvCache:
  | {
      at: number;
      map: Map<string, string>;
    }
  | null = null;
let serviceCsvCache:
  | {
      at: number;
      map: Map<string, "consultant" | "specialist" | "lasik" | "surgery" | "external">;
    }
  | null = null;
let pentacamServiceCodesCache:
  | {
      at: number;
      codes: Set<string>;
    }
  | null = null;

function asBool(value: unknown, fallback = false): boolean {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}

function pick(row: Record<string, any>, keys: string[]): string {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      const value = String(row[key]).trim();
      if (value) return value;
    }
    const lowered = Object.keys(row).find((k) => k.toLowerCase() === key.toLowerCase());
    if (lowered && row[lowered] !== undefined && row[lowered] !== null) {
      const value = String(row[lowered]).trim();
      if (value) return value;
    }
  }
  return "";
}

function normalizeGender(input: unknown): "male" | "female" | undefined {
  const v = String(input ?? "").trim().toLowerCase();
  if (!v) return undefined;
  if (["m", "male", "man", "ذكر"].includes(v)) return "male";
  if (["f", "female", "woman", "انثى", "أنثى"].includes(v)) return "female";
  return undefined;
}

function normalizeIsoDate(input: unknown): string | undefined {
  if (!input) return undefined;
  if (input instanceof Date && !Number.isNaN(input.valueOf())) {
    return input.toISOString().slice(0, 10);
  }
  const raw = String(input).trim();
  if (!raw) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.valueOf())) return undefined;
  return date.toISOString().slice(0, 10);
}

function normalizeIsoDateTime(input: unknown): string | undefined {
  if (!input) return undefined;
  if (input instanceof Date && !Number.isNaN(input.valueOf())) return input.toISOString();
  const raw = String(input).trim();
  if (!raw) return undefined;
  const dt = new Date(raw);
  if (Number.isNaN(dt.valueOf())) return undefined;
  return dt.toISOString();
}

function normalizeNationalId(input: unknown): string | undefined {
  const raw = String(input ?? "").trim();
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return undefined;
  return raw;
}

function normalizeLocationTypeFromIdNo(input: unknown): "center" | "external" | undefined {
  const raw = String(input ?? "").trim();
  if (!raw) return undefined;
  if (raw === "1") return "center";
  if (raw === "2") return "external";
  return undefined;
}

function normalizeBranch(input: unknown): "examinations" | "surgery" | undefined {
  const v = String(input ?? "").trim().toLowerCase();
  if (!v) return undefined;
  if (["surgery", "operation", "عمليات"].includes(v)) return "surgery";
  if (["examinations", "exam", "consultation", "كشف", "عيادة"].includes(v)) return "examinations";
  return undefined;
}

function normalizeServiceType(input: unknown): "consultant" | "specialist" | "lasik" | "surgery" | "external" | undefined {
  const v = String(input ?? "").trim().toLowerCase();
  if (!v) return undefined;
  if (["consultant", "استشاري"].includes(v)) return "consultant";
  if (["specialist", "اخصائي", "أخصائي"].includes(v)) return "specialist";
  if (["lasik", "ليزك", "lasik moria", "lasik metal"].includes(v)) return "lasik";
  if (["surgery", "operation", "عمليات"].includes(v)) return "surgery";
  if (["external", "outside", "خارجي"].includes(v)) return "external";
  return undefined;
}

function normalizeLocationType(input: unknown): "center" | "external" | undefined {
  const v = String(input ?? "").trim().toLowerCase();
  if (!v) return undefined;
  if (["external", "outside", "خارجي"].includes(v)) return "external";
  if (["center", "internal", "داخلي", "المركز"].includes(v)) return "center";
  return undefined;
}

const STRICT_REQUIRED_SYNC_COLUMNS = asBool(process.env.MSSQL_SYNC_STRICT_REQUIRED_COLUMNS, true);

const REQUIRED_SYNC_COLUMNS = new Set<string>(
  [
    // rece (PAJRNRCVH)
    "PAT_CD",
    "NAM",
    "NAM1",
    "NAM2",
    "NAM3",
    "TEL1",
    "ADDRS",
    "AGE",
    "GNDR",
    "BRNCH",
    "IDNO",
    "PAY",
    "DUE",
    "DRS_CD",
    "SEC_CD",
    "SRV_CD",
    "INV_NO",
    "CAINV_NO",
    "KSH_NO",
    // srvss (PAPAT_SRV)
    "PAT_NM_AR",
    "PAT_NM_EN",
    "SRV_BY1",
    "CUR_SRV_BY",
    "PRG_BY",
    "PRG_SNO",
    "QTY",
    "PRC",
    "DISC_VL",
    "PA_VL",
  ].map((v) => v.toUpperCase())
);

const REQUIRED_SYNC_ALIASES = new Set<string>(
  [
    "patientCode",
    "fullName",
    "phone",
    "address",
    "age",
    "gender",
    "idno",
    "nationalId",
    "branch",
    "paidAmount",
    "dueAmount",
    "doctorCode",
    "serviceCode",
    "serviceCodesCsv",
    "SRV_CODES",
    "srv_codes",
    "changedAt",
    "lastVisit",
    "dateOfBirth",
  ].map((v) => v.toLowerCase())
);

const OPERATIONAL_ONLY_KEYS = new Set<string>(["changedAt", "serviceCodesCsv", "SRV_CODES", "srv_codes"]);

function isAutoOrDateLikeFallback(key: string): boolean {
  const k = String(key ?? "").trim();
  if (!k) return true;
  if (["PAT_CD", "patientCode", "SRV_CD", "serviceCode", "SRV_CODES", "serviceCodesCsv"].includes(k)) return false;
  if (/DATE|_DT$|^DT$|_TIM$|TIME/i.test(k)) return true;
  if (
    /^(TR_NO|tr_noNew|VST_NO|REPIT_NO|PRG_SNO|LN_NO|AZTR_NO|AZLN_NO|OPTR_NO|WF_TR_NO|WF_LN_NO|enter_no|CUR_SRV_IDX|T_BTCH_ID|BTCH_ID|TMP_NO|TMP_DR_BTCHID)$/i.test(
      k
    )
  ) {
    return true;
  }
  return false;
}

function shouldIncludeColumnForMerge(key: string): boolean {
  const k = String(key ?? "").trim();
  if (!k) return false;
  if (REQUIRED_SYNC_COLUMNS.has(k.toUpperCase())) return true;
  if (REQUIRED_SYNC_ALIASES.has(k.toLowerCase())) return true;
  if (!STRICT_REQUIRED_SYNC_COLUMNS && !isAutoOrDateLikeFallback(k)) return true;
  return false;
}

function buildMssqlBackfillObject(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(row ?? {})) {
    if (!shouldIncludeColumnForMerge(key)) continue;
    if (OPERATIONAL_ONLY_KEYS.has(key)) continue;
    if (isBlank(value)) continue;
    out[key] = value;
  }
  return out;
}

async function loadMssqlModule(): Promise<any> {
  try {
    const importer = new Function("return import('mssql')");
    const mod = await importer();
    return (mod as any).default ?? mod;
  } catch {
    throw new Error("Package 'mssql' is not installed. Run: pnpm add mssql");
  }
}

async function loadMssqlMsNodeSqlV8Module(): Promise<any> {
  try {
    const importer = new Function("return import('mssql/msnodesqlv8.js')");
    const mod = await importer();
    return (mod as any).default ?? mod;
  } catch (error: any) {
    const reason = String(error?.message ?? error ?? "unknown");
    throw new Error(
      `Windows auth driver failed to load (${reason}). Ensure 'msnodesqlv8' is installed and built: npx -y pnpm@10.29.2 add msnodesqlv8 && npx -y pnpm@10.29.2 rebuild msnodesqlv8`
    );
  }
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function toSqlDateTimeLiteral(input: string): string {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  const dt = new Date(raw);
  if (Number.isNaN(dt.valueOf())) return "";
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const hh = String(dt.getUTCHours()).padStart(2, "0");
  const mi = String(dt.getUTCMinutes()).padStart(2, "0");
  const ss = String(dt.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function resolveShiftNumber(now: Date = new Date()): number {
  const startShift2Raw = Number(process.env.MSSQL_SHIFT2_START_HOUR ?? 15);
  const startShift2 = Number.isFinite(startShift2Raw) ? Math.min(23, Math.max(0, Math.trunc(startShift2Raw))) : 15;
  const hour = now.getHours();
  return hour >= startShift2 ? 2 : 1;
}

async function createMssqlPool(): Promise<any> {
  const explicitAuthMode = String(process.env.MSSQL_AUTH_MODE ?? "").trim().toLowerCase();
  const connectionStringRaw = String(process.env.MSSQL_CONNECTION_STRING ?? "").trim();
  const inferredWindowsMode =
    /trusted_connection\s*=\s*yes/i.test(connectionStringRaw) ||
    /integrated security\s*=\s*sspi/i.test(connectionStringRaw);
  const authMode = explicitAuthMode || (inferredWindowsMode ? "windows" : "sql");
  const server = String(process.env.MSSQL_SERVER ?? "").trim();
  const database = String(process.env.MSSQL_DATABASE ?? "").trim();
  const port = Number(process.env.MSSQL_PORT ?? 1433);
  const connectionTimeout = Number(process.env.MSSQL_CONNECTION_TIMEOUT_MS ?? 5000);
  const requestTimeout = Number(process.env.MSSQL_REQUEST_TIMEOUT_MS ?? 15000);

  if (authMode === "windows") {
    const mssqlV8 = await loadMssqlMsNodeSqlV8Module();
    const cs = connectionStringRaw;
    const connectionString =
      cs ||
      `Driver={ODBC Driver 17 for SQL Server};Server=${server},${Number.isFinite(port) ? port : 1433};Database=${database};Trusted_Connection=Yes;TrustServerCertificate=Yes;`;
    if (!connectionString) {
      throw new Error("Missing MSSQL Windows auth config. Set MSSQL_CONNECTION_STRING or MSSQL_SERVER + MSSQL_DATABASE");
    }
    return new mssqlV8.ConnectionPool({
      connectionString,
      connectionTimeout: Number.isFinite(connectionTimeout) ? connectionTimeout : 5000,
      requestTimeout: Number.isFinite(requestTimeout) ? requestTimeout : 15000,
      options: {
        trustedConnection: true,
        trustServerCertificate: asBool(process.env.MSSQL_TRUST_SERVER_CERTIFICATE, true),
      },
    });
  }

  const user = String(process.env.MSSQL_USER ?? "").trim();
  const password = String(process.env.MSSQL_PASSWORD ?? "");
  if (!server || !user || !password || !database) {
    throw new Error("Missing MSSQL SQL-auth config. Required: MSSQL_SERVER, MSSQL_USER, MSSQL_PASSWORD, MSSQL_DATABASE");
  }
  const mssql = await loadMssqlModule();
  return new mssql.ConnectionPool({
    server,
    user,
    password,
    database,
    port: Number.isFinite(port) ? port : 1433,
    connectionTimeout: Number.isFinite(connectionTimeout) ? connectionTimeout : 5000,
    requestTimeout: Number.isFinite(requestTimeout) ? requestTimeout : 15000,
    options: {
      encrypt: asBool(process.env.MSSQL_ENCRYPT, false),
      trustServerCertificate: asBool(process.env.MSSQL_TRUST_SERVER_CERTIFICATE, true),
      enableArithAbort: true,
    },
  });
}

function splitArabicName(fullName: string): { nam1: string; nam2: string; nam3: string } {
  const parts = String(fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return {
    nam1: parts[0] ?? "",
    nam2: parts[1] ?? "",
    nam3: parts.slice(2).join(" ").trim(),
  };
}

async function applyPapatSrvDefaults(
  pool: any,
  patientCode: string,
  serviceCode: string,
  desiredQty: number,
  options?: { patientNameAr?: string | null; enteredBy?: string | null; entryDate?: string | null; trNo?: number | null }
): Promise<void> {
  const qty = Math.max(1, Math.trunc(desiredQty || 1));
  const cols = await getTableColumns(pool, "op2026.dbo.PAPAT_SRV");
  const srvTrNoCol = cols.has("TR_NO") ? "TR_NO" : cols.has("TR_NONEW") ? "tr_noNew" : "";
  const scopedTrNo = Number(options?.trNo);
  const hasScopedTrNo = Number.isFinite(scopedTrNo) && Boolean(srvTrNoCol);
  const whereSrv = hasScopedTrNo
    ? `PAT_CD = @PAT_CD AND SRV_CD = @SRV_CD AND ${srvTrNoCol} = @TR_NO`
    : "PAT_CD = @PAT_CD AND SRV_CD = @SRV_CD";
  const run = async (sqlText: string, bind?: (req: any) => void) => {
    const req = pool.request();
    req.input("PAT_CD", patientCode);
    req.input("SRV_CD", serviceCode);
    if (hasScopedTrNo) req.input("TR_NO", Math.trunc(scopedTrNo));
    if (bind) bind(req);
    await req.query(sqlText);
  };
  const qtyCol = cols.has("QTY") ? "QTY" : cols.has("SRV_QTY") ? "SRV_QTY" : "";
  if (qtyCol) {
    await run(`UPDATE op2026.dbo.PAPAT_SRV SET ${qtyCol} = @QTY WHERE ${whereSrv}`, (req) =>
      req.input("QTY", qty)
    );
  }
  if (cols.has("DISC_VL")) {
    await run(`UPDATE op2026.dbo.PAPAT_SRV SET DISC_VL = ISNULL(DISC_VL, 0) WHERE ${whereSrv}`);
  }
  let basePrice: number | null = null;
  try {
    const srvlstdCols = await getTableColumns(pool, "op2026.dbo.SRVLSTD");
    const srvlstdCodeCol =
      ["SRV_CD", "SERVICE_CODE", "CODE", "SRVNO", "SRV_NO"].find((c) => srvlstdCols.has(c)) ?? "";
    const srvlstdPriceCols = ["PRC", "PRC1", "PRC2", "PRC3", "PRICE", "SRV_PRICE", "AMT", "BASIC_PRC", "NET_PRC", "CASH_PRC"]
      .filter((c) => srvlstdCols.has(c));
    if (srvlstdCodeCol && srvlstdPriceCols.length > 0) {
      for (const col of srvlstdPriceCols) {
        const masterReq = pool.request();
        masterReq.input("SRV_CD", serviceCode);
        const master = await masterReq.query(`
          SELECT TOP 1
            CASE WHEN ISNUMERIC(CONVERT(varchar(50), ${col})) = 1 THEN CAST(CONVERT(varchar(50), ${col}) AS decimal(18,2)) ELSE NULL END AS PRC
          FROM op2026.dbo.SRVLSTD
          WHERE ${srvlstdCodeCol} = @SRV_CD
        `);
        const masterRow = Array.isArray(master?.recordset) && master.recordset.length > 0 ? master.recordset[0] : {};
        const p = Number(masterRow?.PRC);
        if (Number.isFinite(p) && p > 0) {
          basePrice = p;
          break;
        }
      }
    }
  } catch {
    // optional SRVLSTD table
  }
  try {
    const srvcmfCols = await getTableColumns(pool, "op2026.dbo.SRVCMF");
    const srvcmfPriceCols = ["PRC", "PRC1", "PRC2", "PRC3", "PRICE", "SRV_PRICE", "AMT", "BASIC_PRC", "NET_PRC", "CASH_PRC"]
      .filter((c) => srvcmfCols.has(c));
    if (basePrice == null && srvcmfPriceCols.length > 0) {
      for (const col of srvcmfPriceCols) {
        const masterReq = pool.request();
        masterReq.input("SRV_CD", serviceCode);
        const master = await masterReq.query(`
          SELECT TOP 1
            CASE WHEN ISNUMERIC(CONVERT(varchar(50), ${col})) = 1 THEN CAST(CONVERT(varchar(50), ${col}) AS decimal(18,2)) ELSE NULL END AS PRC
          FROM op2026.dbo.SRVCMF
          WHERE SRV_CD = @SRV_CD
        `);
        const masterRow = Array.isArray(master?.recordset) && master.recordset.length > 0 ? master.recordset[0] : {};
        const p = Number(masterRow?.PRC);
        if (Number.isFinite(p) && p > 0) {
          basePrice = p;
          break;
        }
      }
    }
  } catch {
    // optional SRVCMF table
  }
  const priceCol = cols.has("PRC") ? "PRC" : cols.has("PRICE") ? "PRICE" : cols.has("SRV_PRICE") ? "SRV_PRICE" : cols.has("AMT") ? "AMT" : "";
  if (basePrice == null && priceCol) {
    const rowReq = pool.request();
    rowReq.input("PAT_CD", patientCode);
    rowReq.input("SRV_CD", serviceCode);
    if (hasScopedTrNo) rowReq.input("TR_NO", Math.trunc(scopedTrNo));
    const row = await rowReq.query(`
      SELECT TOP 1
        CASE WHEN ISNUMERIC(CONVERT(varchar(50), ${priceCol})) = 1 THEN CAST(CONVERT(varchar(50), ${priceCol}) AS decimal(18,2)) ELSE NULL END AS P
      FROM op2026.dbo.PAPAT_SRV
      WHERE ${whereSrv}
    `);
    const r = Array.isArray(row?.recordset) && row.recordset.length > 0 ? row.recordset[0] : {};
    const p = Number(r?.P);
    if (Number.isFinite(p)) basePrice = p;
  }
  if (basePrice == null && priceCol) {
    const recentReq = pool.request();
    recentReq.input("SRV_CD", serviceCode);
    const recentOrderBy = [
      cols.has("UPDATEDATE") ? "CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC" : "",
      cols.has("ENTRYDATE") ? "CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC" : "",
      cols.has("DT") ? "CASE WHEN ISDATE(DT) = 1 THEN CONVERT(datetime, DT) END DESC" : "",
    ]
      .filter(Boolean)
      .join(", ");
    const recent = await recentReq.query(`
      SELECT TOP 1
        CASE WHEN ISNUMERIC(CONVERT(varchar(50), ${priceCol})) = 1 THEN CAST(CONVERT(varchar(50), ${priceCol}) AS decimal(18,2)) ELSE NULL END AS P
      FROM op2026.dbo.PAPAT_SRV
      WHERE SRV_CD = @SRV_CD
        AND ISNUMERIC(CONVERT(varchar(50), ${priceCol})) = 1
        AND CAST(CONVERT(varchar(50), ${priceCol}) AS decimal(18,2)) > 0
      ${recentOrderBy ? `ORDER BY ${recentOrderBy}` : ""}
    `);
    const rr = Array.isArray(recent?.recordset) && recent.recordset.length > 0 ? recent.recordset[0] : {};
    const p = Number(rr?.P);
    if (Number.isFinite(p)) basePrice = p;
  }
  if (cols.has("PRC") && basePrice != null) {
    await run(
      `UPDATE op2026.dbo.PAPAT_SRV
       SET PRC = CASE
         WHEN ISNUMERIC(CONVERT(varchar(50), PRC)) = 1
           AND CAST(CONVERT(varchar(50), PRC) AS decimal(18,2)) > 0
         THEN PRC
         ELSE @PRC
       END
       WHERE ${whereSrv}`,
      (req) => req.input("PRC", basePrice)
    );
  } else if (priceCol && basePrice != null) {
    await run(
      `UPDATE op2026.dbo.PAPAT_SRV
       SET ${priceCol} = CASE
         WHEN ISNUMERIC(CONVERT(varchar(50), ${priceCol})) = 1
           AND CAST(CONVERT(varchar(50), ${priceCol}) AS decimal(18,2)) > 0
         THEN ${priceCol}
         ELSE @PRC
       END
       WHERE ${whereSrv}`,
      (req) => req.input("PRC", basePrice)
    );
  }
  if (cols.has("PA_VL")) {
    const discountExpr = cols.has("DISC_VL")
      ? "CASE WHEN ISNUMERIC(CONVERT(varchar(50), DISC_VL)) = 1 THEN CAST(CONVERT(varchar(50), DISC_VL) AS decimal(18,2)) ELSE 0 END"
      : "0";
    const discReq = pool.request();
    discReq.input("PAT_CD", patientCode);
    discReq.input("SRV_CD", serviceCode);
    if (hasScopedTrNo) discReq.input("TR_NO", Math.trunc(scopedTrNo));
    const discRs = await discReq.query(`
      SELECT TOP 1
        ${discountExpr} AS D
      FROM op2026.dbo.PAPAT_SRV
      WHERE ${whereSrv}
    `);
    const discRow = Array.isArray(discRs?.recordset) && discRs.recordset.length > 0 ? discRs.recordset[0] : {};
    const disc = Number.isFinite(Number(discRow?.D)) ? Number(discRow?.D) : 0;
    const price = Number.isFinite(Number(basePrice)) ? Number(basePrice) : 0;
    const total = price * qty - disc;
    await run(`UPDATE op2026.dbo.PAPAT_SRV SET PA_VL = @PA_VL WHERE ${whereSrv}`, (req) =>
      req.input("PA_VL", total)
    );
  }

  let patientNameForSrv = String(options?.patientNameAr ?? "").trim();
  if (!patientNameForSrv) {
    try {
      const nameReq = pool.request();
      nameReq.input("PAT_CD", patientCode);
      const nameRs = await nameReq.query(`
        SELECT TOP 1
          NULLIF(CONVERT(nvarchar(255), NAM), '') AS NAM
        FROM op2026.dbo.PAJRNRCVH
        WHERE PAT_CD = @PAT_CD
        ORDER BY
          CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
          CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC
      `);
      const nameRow = Array.isArray(nameRs?.recordset) && nameRs.recordset.length > 0 ? nameRs.recordset[0] : {};
      patientNameForSrv = String(nameRow?.NAM ?? "").trim();
    } catch {
      // best-effort fallback only
    }
  }
  if (patientNameForSrv) {
    if (cols.has("NAM")) {
      await run(`UPDATE op2026.dbo.PAPAT_SRV SET NAM = @NAM WHERE ${whereSrv}`, (req) =>
        req.input("NAM", patientNameForSrv)
      );
    }
    if (cols.has("PAT_NM_AR")) {
      await run(`UPDATE op2026.dbo.PAPAT_SRV SET PAT_NM_AR = @PAT_NM_AR WHERE ${whereSrv}`, (req) =>
        req.input("PAT_NM_AR", patientNameForSrv)
      );
    }
  }
  if (cols.has("PAT_TYP")) await run(`UPDATE op2026.dbo.PAPAT_SRV SET PAT_TYP = 2 WHERE ${whereSrv}`);
  if (cols.has("CUR_SRV_BY")) await run(`UPDATE op2026.dbo.PAPAT_SRV SET CUR_SRV_BY = NULL WHERE ${whereSrv}`);
  if (cols.has("PRG_BY")) await run(`UPDATE op2026.dbo.PAPAT_SRV SET PRG_BY = NULL WHERE ${whereSrv}`);
  if (cols.has("CA_CD")) await run(`UPDATE op2026.dbo.PAPAT_SRV SET CA_CD = '00000' WHERE ${whereSrv}`);
  for (const c of ["CA_VL", "MNGEXP", "TAX1", "TAX2", "TAX3", "TAX4", "PMNGEXP", "PTAX1", "PTAX2", "PTAX3", "PTAX4"]) {
    if (cols.has(c)) await run(`UPDATE op2026.dbo.PAPAT_SRV SET ${c} = 0 WHERE ${whereSrv}`);
  }
  if (cols.has("DISC")) {
    if (cols.has("DISC_VL")) {
      await run(
        `UPDATE op2026.dbo.PAPAT_SRV SET DISC = CASE WHEN ISNUMERIC(CONVERT(varchar(50), DISC_VL))=1 THEN CAST(CONVERT(varchar(50), DISC_VL) AS decimal(18,2)) ELSE 0 END WHERE ${whereSrv}`
      );
    } else {
      await run(`UPDATE op2026.dbo.PAPAT_SRV SET DISC = 0 WHERE ${whereSrv}`);
    }
  }
  if (cols.has("LN_SRC")) await run(`UPDATE op2026.dbo.PAPAT_SRV SET LN_SRC = 'PAJRNRCV' WHERE ${whereSrv}`);
  if (cols.has("enter_no")) await run(`UPDATE op2026.dbo.PAPAT_SRV SET enter_no = 1 WHERE ${whereSrv}`);
  if (cols.has("EFCT")) await run(`UPDATE op2026.dbo.PAPAT_SRV SET EFCT = 1 WHERE ${whereSrv}`);
  if (cols.has("DISC_CA")) await run(`UPDATE op2026.dbo.PAPAT_SRV SET DISC_CA = 0 WHERE ${whereSrv}`);
  if (cols.has("DISC_P")) {
    if (cols.has("DISC_VL")) {
      await run(
        `UPDATE op2026.dbo.PAPAT_SRV SET DISC_P = CASE WHEN ISNUMERIC(CONVERT(varchar(50), DISC_VL))=1 THEN CAST(CONVERT(varchar(50), DISC_VL) AS decimal(18,2)) ELSE 0 END WHERE ${whereSrv}`
      );
    } else {
      await run(`UPDATE op2026.dbo.PAPAT_SRV SET DISC_P = 0 WHERE ${whereSrv}`);
    }
  }
  if (cols.has("PDISC_VL")) await run(`UPDATE op2026.dbo.PAPAT_SRV SET PDISC_VL = 0 WHERE ${whereSrv}`);
  // TRF_SRV1 report filters with: PAPAT_SRV.CNCL IS NULL
  if (cols.has("CNCL")) await run(`UPDATE op2026.dbo.PAPAT_SRV SET CNCL = NULL WHERE ${whereSrv}`);
  if (cols.has("ENTEREDBY") && String(options?.enteredBy ?? "").trim()) {
    await run(`UPDATE op2026.dbo.PAPAT_SRV SET ENTEREDBY = @ENTEREDBY WHERE ${whereSrv}`, (req) =>
      req.input("ENTEREDBY", String(options?.enteredBy ?? "").trim())
    );
  }
  if (cols.has("ENTRYDATE") && String(options?.entryDate ?? "").trim()) {
    await run(`UPDATE op2026.dbo.PAPAT_SRV SET ENTRYDATE = @ENTRYDATE WHERE ${whereSrv}`, (req) =>
      req.input("ENTRYDATE", String(options?.entryDate ?? "").trim())
    );
  }

  // Reports also require PAPAT_IO + PAPATMF consistency for the same visit.
  let ensureVisitDt: Date | null = null;
  try {
    const vstReq = pool.request();
    vstReq.input("PAT_CD", patientCode);
    vstReq.input("SRV_CD", serviceCode);
    if (hasScopedTrNo) vstReq.input("TR_NO", Math.trunc(scopedTrNo));
    const trOrderExpr = srvTrNoCol
      ? `, CASE WHEN ISNUMERIC(CONVERT(varchar(50), ${srvTrNoCol})) = 1 THEN CAST(CONVERT(varchar(50), ${srvTrNoCol}) AS INT) END DESC`
      : "";
    const vstRs = await vstReq.query(`
      SELECT TOP 1
        CASE
          WHEN ISNUMERIC(CONVERT(varchar(50), ${srvTrNoCol || "NULL"})) = 1 THEN CAST(CONVERT(varchar(50), ${srvTrNoCol || "NULL"}) AS INT)
          ELSE NULL
        END AS TR_NO,
        CASE
          WHEN ISNUMERIC(CONVERT(varchar(50), VST_NO)) = 1 THEN CAST(CONVERT(varchar(50), VST_NO) AS INT)
          ELSE NULL
        END AS VST_NO,
        CASE WHEN ISDATE(DT) = 1 THEN CONVERT(datetime, DT) ELSE NULL END AS VISIT_DT
      FROM op2026.dbo.PAPAT_SRV
      WHERE ${whereSrv}
      ORDER BY
        CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
        CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC
        ${trOrderExpr}
    `);
    const vstRow = Array.isArray(vstRs?.recordset) && vstRs.recordset.length > 0 ? vstRs.recordset[0] : {};
    const vstNo = Number(vstRow?.VST_NO);
    const trNo = Number(vstRow?.TR_NO);
    const visitDt = vstRow?.VISIT_DT ? new Date(vstRow.VISIT_DT) : null;
    ensureVisitDt = visitDt;
    if (Number.isFinite(vstNo)) {
      const ioCols = await getTableColumns(pool, "op2026.dbo.PAPAT_IO");
      const ioUpdates: string[] = [];
      if (ioCols.has("TR_NO")) {
        ioUpdates.push(`UPDATE op2026.dbo.PAPAT_IO SET TR_NO = ISNULL(TR_NO, @TR_NO) WHERE PAT_CD = @PAT_CD AND VST_NO = @VST_NO;`);
      }
      if (ioCols.has("SRV_DT")) {
        ioUpdates.push(`UPDATE op2026.dbo.PAPAT_IO SET SRV_DT = ISNULL(SRV_DT, @VISIT_DT) WHERE PAT_CD = @PAT_CD AND VST_NO = @VST_NO;`);
      }
      if (ioCols.has("MF_DT")) {
        ioUpdates.push(`UPDATE op2026.dbo.PAPAT_IO SET MF_DT = ISNULL(MF_DT, @VISIT_DT) WHERE PAT_CD = @PAT_CD AND VST_NO = @VST_NO;`);
      }
      if (ioCols.has("CA_CD")) {
        ioUpdates.push(`UPDATE op2026.dbo.PAPAT_IO SET CA_CD = ISNULL(NULLIF(CA_CD, ''), '00000') WHERE PAT_CD = @PAT_CD AND VST_NO = @VST_NO;`);
      }
      if (ioCols.has("PAT_EK")) {
        ioUpdates.push(`UPDATE op2026.dbo.PAPAT_IO SET PAT_EK = NULL WHERE PAT_CD = @PAT_CD AND VST_NO = @VST_NO;`);
      }
      await pool.request().input("PAT_CD", patientCode).input("VST_NO", Math.trunc(vstNo)).input("TR_NO", Number.isFinite(trNo) ? Math.trunc(trNo) : null).input("VISIT_DT", visitDt).query(`
        IF NOT EXISTS (
          SELECT 1
          FROM op2026.dbo.PAPAT_IO
          WHERE PAT_CD = @PAT_CD
            AND VST_NO = @VST_NO
        )
        BEGIN
          INSERT INTO op2026.dbo.PAPAT_IO (PAT_CD, VST_NO, PAT_EK)
          VALUES (@PAT_CD, @VST_NO, NULL)
        END

        ${ioUpdates.join("\n")}

      `);
    }
  } catch {
    // Optional compatibility: some deployments may have different PAPAT_IO schema.
  }
  try {
    await ensurePapatMfDefaults(
      pool,
      patientCode,
      ensureVisitDt ?? (String(options?.entryDate ?? "").trim() ? new Date(String(options?.entryDate ?? "").trim()) : new Date()),
      String(options?.patientNameAr ?? "").trim() || null
    );
  } catch {
    // keep sync flow alive
  }
}

async function getTableColumns(pool: any, tableName: string): Promise<Set<string>> {
  const req = pool.request();
  req.input("TBL", tableName);
  const result = await req.query(`
    SELECT name
    FROM sys.columns
    WHERE object_id = OBJECT_ID(@TBL)
  `);
  return new Set<string>(
    (Array.isArray(result?.recordset) ? result.recordset : [])
      .map((r: any) => String(r?.name ?? "").toUpperCase())
      .filter(Boolean)
  );
}

async function withMssqlServiceInsertLock<T>(
  pool: any,
  patientCode: string,
  serviceCode: string,
  work: () => Promise<T>
): Promise<T> {
  const resource = `papat_srv:${String(patientCode ?? "").trim()}:${String(serviceCode ?? "").trim()}`;
  const lockReq = pool.request();
  lockReq.input("RES", resource);
  lockReq.input("LOCK_TIMEOUT", 10000);
  const lockRs = await lockReq.query(`
    DECLARE @r int;
    EXEC @r = sp_getapplock
      @Resource = @RES,
      @LockMode = 'Exclusive',
      @LockOwner = 'Session',
      @LockTimeout = @LOCK_TIMEOUT;
    SELECT @r AS lockResult;
  `);
  const lockResult = Number(
    Array.isArray(lockRs?.recordset) && lockRs.recordset.length > 0 ? lockRs.recordset[0]?.lockResult : NaN
  );
  if (!Number.isFinite(lockResult) || lockResult < 0) {
    throw new Error(`Failed to acquire MSSQL service lock for ${resource} (result=${String(lockResult)})`);
  }

  try {
    return await work();
  } finally {
    const unlockReq = pool.request();
    unlockReq.input("RES", resource);
    await unlockReq.query(`
      DECLARE @r int;
      EXEC @r = sp_releaseapplock
        @Resource = @RES,
        @LockOwner = 'Session';
    `).catch(() => undefined);
  }
}

async function ensurePapatMfDefaults(
  pool: any,
  patientCode: string,
  visitDt: Date | null,
  patientNameAr?: string | null
): Promise<void> {
  const cols = await getTableColumns(pool, "op2026.dbo.PAPATMF");
  if (!cols.has("PAT_CD")) return;
  const headerCols = await getTableColumns(pool, "op2026.dbo.PAJRNRCVH");
  const headerTrNoCol = headerCols.has("TR_NO") ? "TR_NO" : headerCols.has("TR_NONEW") ? "tr_noNew" : "";
  const headerTrOrderExpr = headerTrNoCol
    ? `, CASE WHEN ISNUMERIC(CONVERT(varchar(50), ${headerTrNoCol})) = 1 THEN CAST(CONVERT(varchar(50), ${headerTrNoCol}) AS INT) END DESC`
    : "";
  const headerReq = pool.request();
  headerReq.input("PAT_CD", patientCode);
  const headerRs = await headerReq.query(`
    SELECT TOP 1
      NAM, TEL1, ADDRS,
      CASE WHEN ISNUMERIC(CONVERT(varchar(50), AGE)) = 1 THEN CAST(CONVERT(varchar(50), AGE) AS INT) ELSE NULL END AS AGE,
      CASE WHEN ISNUMERIC(CONVERT(varchar(50), GNDR)) = 1 THEN CAST(CONVERT(varchar(50), GNDR) AS INT) ELSE NULL END AS GNDR,
      CASE WHEN ISNUMERIC(CONVERT(varchar(50), IDNO)) = 1 THEN CAST(CONVERT(varchar(50), IDNO) AS INT) ELSE NULL END AS IDNO,
      CASE WHEN ISNUMERIC(CONVERT(varchar(50), DRS_CD)) = 1 THEN CAST(CONVERT(varchar(50), DRS_CD) AS INT) ELSE NULL END AS DRS_CD,
      CASE WHEN ISDATE(DT) = 1 THEN CONVERT(datetime, DT) ELSE NULL END AS DT,
      CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) ELSE NULL END AS ENTRYDATE
    FROM op2026.dbo.PAJRNRCVH
    WHERE PAT_CD = @PAT_CD
    ORDER BY
      CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
      CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC
      ${headerTrOrderExpr}
  `);
  const h = Array.isArray(headerRs?.recordset) && headerRs.recordset.length > 0 ? headerRs.recordset[0] : {};

  const existsReq = pool.request();
  existsReq.input("PAT_CD", patientCode);
  const existsRs = await existsReq.query(`
    SELECT TOP 1 1 AS ok
    FROM op2026.dbo.PAPATMF
    WHERE PAT_CD = @PAT_CD
  `);
  const exists = Array.isArray(existsRs?.recordset) && existsRs.recordset.length > 0;

  if (!exists) {
    const nameAr = String(patientNameAr ?? h?.NAM ?? "").trim();

    const insertCols: string[] = ["PAT_CD"];
    const insertVals: string[] = ["@PAT_CD"];
    const insReq = pool.request();
    insReq.input("PAT_CD", patientCode);

    if (cols.has("PAT_NM_AR")) {
      insertCols.push("PAT_NM_AR");
      insertVals.push("@PAT_NM_AR");
      insReq.input("PAT_NM_AR", nameAr || null);
    }
    if (cols.has("PAT_NM_EN")) {
      insertCols.push("PAT_NM_EN");
      insertVals.push("@PAT_NM_EN");
      insReq.input("PAT_NM_EN", nameAr || null);
    }
    if (cols.has("DT")) {
      insertCols.push("DT");
      insertVals.push("@DT");
      insReq.input("DT", visitDt);
    }
    if (cols.has("TEL1")) {
      insertCols.push("TEL1");
      insertVals.push("@TEL1");
      insReq.input("TEL1", h?.TEL1 ?? null);
    }
    if (cols.has("ADDRS")) {
      insertCols.push("ADDRS");
      insertVals.push("@ADDRS");
      insReq.input("ADDRS", h?.ADDRS ?? null);
    }
    if (cols.has("AGE")) {
      insertCols.push("AGE");
      insertVals.push("@AGE");
      insReq.input("AGE", Number.isFinite(Number(h?.AGE)) ? Math.trunc(Number(h.AGE)) : null);
    }
    if (cols.has("GNDR")) {
      insertCols.push("GNDR");
      insertVals.push("@GNDR");
      insReq.input("GNDR", Number.isFinite(Number(h?.GNDR)) ? Math.trunc(Number(h.GNDR)) : null);
    }
    if (cols.has("IDNO")) {
      insertCols.push("IDNO");
      insertVals.push("@IDNO");
      insReq.input("IDNO", Number.isFinite(Number(h?.IDNO)) ? Math.trunc(Number(h.IDNO)) : null);
    }

    try {
      await insReq.query(`
        INSERT INTO op2026.dbo.PAPATMF (${insertCols.join(", ")})
        VALUES (${insertVals.join(", ")})
      `);
    } catch {
      // Strict schemas: clone a full template row from PAPATMF, then override core patient fields.
      try {
        const metaReq = pool.request();
        const metaRs = await metaReq.query(`
          SELECT name, is_identity, is_computed
          FROM sys.columns
          WHERE object_id = OBJECT_ID('op2026.dbo.PAPATMF')
          ORDER BY column_id
        `);
        const colsMeta = Array.isArray(metaRs?.recordset) ? metaRs.recordset : [];
        const insertableCols = colsMeta
          .filter((c: any) => Number(c?.is_identity ?? 0) === 0 && Number(c?.is_computed ?? 0) === 0)
          .map((c: any) => String(c?.name ?? "").trim())
          .filter(Boolean);
        if (insertableCols.length > 0) {
          const q = (n: string) => `[${n.replace(/]/g, "]]")}]`;
          const mappedSelect = insertableCols.map((col: string) => {
            const u = col.toUpperCase();
            if (u === "PAT_CD") return `@PAT_CD AS ${q(col)}`;
            if (u === "PAT_NM_AR") return `COALESCE(NULLIF(@PAT_NM_AR, ''), h.NAM, t.${q(col)}, @PAT_CD) AS ${q(col)}`;
            if (u === "PAT_NM_EN") return `COALESCE(NULLIF(@PAT_NM_AR, ''), h.NAM, t.${q(col)}, @PAT_CD) AS ${q(col)}`;
            if (u === "DT") return `COALESCE(@DT, h.DT, t.${q(col)}, GETDATE()) AS ${q(col)}`;
            if (u === "CA_CD") return `COALESCE(NULLIF(t.${q(col)}, ''), '00000') AS ${q(col)}`;
            if (u === "PAT_TYP") return `COALESCE(t.${q(col)}, 2) AS ${q(col)}`;
            if (u === "RLTN") return `COALESCE(t.${q(col)}, 1) AS ${q(col)}`;
            if (u === "PRC_DGR") return `COALESCE(t.${q(col)}, 1) AS ${q(col)}`;
            if (u === "GNDR") return `COALESCE(h.GNDR, t.${q(col)}) AS ${q(col)}`;
            if (u === "AGE") return `COALESCE(h.AGE, t.${q(col)}) AS ${q(col)}`;
            if (u === "IDNO") return `COALESCE(h.IDNO, t.${q(col)}) AS ${q(col)}`;
            if (u === "TEL1") return `COALESCE(NULLIF(h.TEL1, ''), t.${q(col)}) AS ${q(col)}`;
            if (u === "ADDRS") return `COALESCE(NULLIF(h.ADDRS, ''), t.${q(col)}) AS ${q(col)}`;
            if (u === "ENTEREDBY") return `COALESCE(t.${q(col)}, 'mysql') AS ${q(col)}`;
            if (u === "UPDATEDBY") return `COALESCE(t.${q(col)}, 'mysql') AS ${q(col)}`;
            if (u === "ENTRYDATE") return `COALESCE(t.${q(col)}, GETDATE()) AS ${q(col)}`;
            if (u === "UPDATEDATE") return `GETDATE() AS ${q(col)}`;
            return `t.${q(col)} AS ${q(col)}`;
          });
          const fallbackReq = pool.request();
          fallbackReq.input("PAT_CD", patientCode);
          fallbackReq.input("PAT_NM_AR", nameAr || null);
          fallbackReq.input("DT", visitDt);
          await fallbackReq.query(`
            INSERT INTO op2026.dbo.PAPATMF (${insertableCols.map(q).join(", ")})
            SELECT ${mappedSelect.join(", ")}
            FROM (
              SELECT TOP 1 *
              FROM op2026.dbo.PAPATMF
              ORDER BY
                CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
                CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC
            ) t
            OUTER APPLY (
              SELECT TOP 1
                NAM,
                NULLIF(TEL1, '') AS TEL1,
                NULLIF(ADDRS, '') AS ADDRS,
                CASE WHEN ISNUMERIC(CONVERT(varchar(50), AGE)) = 1 THEN CAST(CONVERT(varchar(50), AGE) AS INT) ELSE NULL END AS AGE,
                CASE WHEN ISNUMERIC(CONVERT(varchar(50), GNDR)) = 1 THEN CAST(CONVERT(varchar(50), GNDR) AS INT) ELSE NULL END AS GNDR,
                CASE WHEN ISNUMERIC(CONVERT(varchar(50), IDNO)) = 1 THEN CAST(CONVERT(varchar(50), IDNO) AS INT) ELSE NULL END AS IDNO,
                CASE WHEN ISDATE(DT) = 1 THEN CONVERT(datetime, DT) ELSE NULL END AS DT
              FROM op2026.dbo.PAJRNRCVH
              WHERE PAT_CD = @PAT_CD
              ORDER BY
                CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
                CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC,
                CASE WHEN ISNUMERIC(CONVERT(varchar(50), TR_NO)) = 1 THEN CAST(CONVERT(varchar(50), TR_NO) AS INT) END DESC
            ) h
          `);
        }
      } catch {
        // Keep sync flow alive even if PAPATMF cannot be inserted in this deployment.
      }
    }
  }

  if (cols.has("DT")) {
    const updReq = pool.request();
    updReq.input("PAT_CD", patientCode);
    updReq.input("DT", visitDt);
    await updReq.query(`
      UPDATE op2026.dbo.PAPATMF
      SET DT = ISNULL(DT, @DT)
      WHERE PAT_CD = @PAT_CD
    `);
  }
  if (cols.has("PAT_NM_AR")) {
    const nameReq = pool.request();
    nameReq.input("PAT_CD", patientCode);
    nameReq.input("PAT_NM_AR", String(patientNameAr ?? "").trim() || null);
    await nameReq.query(`
      UPDATE op2026.dbo.PAPATMF
      SET PAT_NM_AR = ISNULL(NULLIF(PAT_NM_AR, ''), @PAT_NM_AR)
      WHERE PAT_CD = @PAT_CD
    `);
  }
  if (cols.has("RLTN")) {
    const req = pool.request();
    req.input("PAT_CD", patientCode);
    await req.query(`
      UPDATE op2026.dbo.PAPATMF
      SET RLTN = ISNULL(RLTN, 1)
      WHERE PAT_CD = @PAT_CD
    `);
  }
  if (cols.has("CA_CD")) {
    const req = pool.request();
    req.input("PAT_CD", patientCode);
    await req.query(`
      UPDATE op2026.dbo.PAPATMF
      SET CA_CD = ISNULL(NULLIF(CA_CD, ''), '00000')
      WHERE PAT_CD = @PAT_CD
    `);
  }
  if (cols.has("PRC_DGR")) {
    const req = pool.request();
    req.input("PAT_CD", patientCode);
    await req.query(`
      UPDATE op2026.dbo.PAPATMF
      SET PRC_DGR = ISNULL(PRC_DGR, 1)
      WHERE PAT_CD = @PAT_CD
    `);
  }
  if (cols.has("DRS_CD")) {
    const req = pool.request();
    req.input("PAT_CD", patientCode);
    req.input("DRS_CD", Number.isFinite(Number(h?.DRS_CD)) ? Math.trunc(Number(h?.DRS_CD)) : null);
    await req.query(`
      UPDATE op2026.dbo.PAPATMF
      SET DRS_CD = ISNULL(DRS_CD, @DRS_CD)
      WHERE PAT_CD = @PAT_CD
    `);
  }
  const effectiveDt = visitDt ?? (h?.DT ? new Date(h.DT) : null);
  const effectiveEntryDate = h?.ENTRYDATE ? new Date(h.ENTRYDATE) : new Date();
  if (cols.has("ENTRYDATE")) {
    const req = pool.request();
    req.input("PAT_CD", patientCode);
    req.input("ENTRYDATE", effectiveEntryDate);
    await req.query(`
      UPDATE op2026.dbo.PAPATMF
      SET ENTRYDATE = ISNULL(ENTRYDATE, @ENTRYDATE)
      WHERE PAT_CD = @PAT_CD
    `);
  }
  if (cols.has("FILE_PLC_DT")) {
    const req = pool.request();
    req.input("PAT_CD", patientCode);
    req.input("FILE_PLC_DT", effectiveDt);
    await req.query(`
      UPDATE op2026.dbo.PAPATMF
      SET FILE_PLC_DT = ISNULL(FILE_PLC_DT, @FILE_PLC_DT)
      WHERE PAT_CD = @PAT_CD
    `);
  }
  if (cols.has("FILE_PLC_TIM")) {
    const req = pool.request();
    req.input("PAT_CD", patientCode);
    req.input("FILE_PLC_TIM", effectiveEntryDate);
    await req.query(`
      UPDATE op2026.dbo.PAPATMF
      SET FILE_PLC_TIM = ISNULL(FILE_PLC_TIM, @FILE_PLC_TIM)
      WHERE PAT_CD = @PAT_CD
    `);
  }
}

async function ensurePapatIoDefaults(
  pool: any,
  patientCode: string,
  trNo: number | null,
  vstNo: number | null,
  visitDt: Date | null
): Promise<void> {
  if (!Number.isFinite(Number(vstNo))) return;
  const cols = await getTableColumns(pool, "op2026.dbo.PAPAT_IO");
  if (!cols.has("PAT_CD") || !cols.has("VST_NO")) return;

  const req = pool.request();
  req.input("PAT_CD", patientCode);
  req.input("VST_NO", Math.trunc(Number(vstNo)));
  req.input("TR_NO", Number.isFinite(Number(trNo)) ? Math.trunc(Number(trNo)) : null);
  req.input("VISIT_DT", visitDt);
  const ioUpdates: string[] = [];
  if (cols.has("TR_NO")) {
    ioUpdates.push(`UPDATE op2026.dbo.PAPAT_IO SET TR_NO = ISNULL(TR_NO, @TR_NO) WHERE PAT_CD = @PAT_CD AND VST_NO = @VST_NO;`);
  }
  if (cols.has("SRV_DT")) {
    ioUpdates.push(`UPDATE op2026.dbo.PAPAT_IO SET SRV_DT = ISNULL(SRV_DT, @VISIT_DT) WHERE PAT_CD = @PAT_CD AND VST_NO = @VST_NO;`);
  }
  if (cols.has("MF_DT")) {
    ioUpdates.push(`UPDATE op2026.dbo.PAPAT_IO SET MF_DT = ISNULL(MF_DT, @VISIT_DT) WHERE PAT_CD = @PAT_CD AND VST_NO = @VST_NO;`);
  }
  if (cols.has("CA_CD")) {
    ioUpdates.push(`UPDATE op2026.dbo.PAPAT_IO SET CA_CD = ISNULL(NULLIF(CA_CD, ''), '00000') WHERE PAT_CD = @PAT_CD AND VST_NO = @VST_NO;`);
  }
  if (cols.has("PAT_EK")) {
    ioUpdates.push(`UPDATE op2026.dbo.PAPAT_IO SET PAT_EK = NULL WHERE PAT_CD = @PAT_CD AND VST_NO = @VST_NO;`);
  }
  await req.query(`
    IF NOT EXISTS (
      SELECT 1
      FROM op2026.dbo.PAPAT_IO
      WHERE PAT_CD = @PAT_CD AND VST_NO = @VST_NO
    )
    BEGIN
      INSERT INTO op2026.dbo.PAPAT_IO (PAT_CD, VST_NO, PAT_EK)
      VALUES (@PAT_CD, @VST_NO, NULL)
    END

    ${ioUpdates.join("\n")}
  `);
}

async function applyPajrnrCvhDefaults(
  pool: any,
  targetTable: string,
  patientCode: string,
  genderCode: number | null,
  payAmount: number | null
): Promise<void> {
  const cols = await getTableColumns(pool, targetTable);
  const run = async (sqlText: string, bind?: (req: any) => void) => {
    const req = pool.request();
    req.input("PAT_CD", patientCode);
    if (bind) bind(req);
    await req.query(sqlText);
  };
  if (cols.has("PAT_TY")) await run(`UPDATE ${targetTable} SET PAT_TY = 1 WHERE PAT_CD = @PAT_CD`);
  if (cols.has("PRC_DGR")) await run(`UPDATE ${targetTable} SET PRC_DGR = 1 WHERE PAT_CD = @PAT_CD`);
  if (cols.has("CA_VL")) await run(`UPDATE ${targetTable} SET CA_VL = 0 WHERE PAT_CD = @PAT_CD`);
  if (cols.has("CA_ACC")) await run(`UPDATE ${targetTable} SET CA_ACC = ISNULL(NULLIF(CA_ACC, ''), '00000') WHERE PAT_CD = @PAT_CD`);
  if (cols.has("XSEC_CD")) await run(`UPDATE ${targetTable} SET XSEC_CD = 0 WHERE PAT_CD = @PAT_CD`);
  if (cols.has("MNGEXP")) await run(`UPDATE ${targetTable} SET MNGEXP = 0 WHERE PAT_CD = @PAT_CD`);
  if (cols.has("PMNGEXP")) await run(`UPDATE ${targetTable} SET PMNGEXP = 0 WHERE PAT_CD = @PAT_CD`);
  if (cols.has("BRNCH")) await run(`UPDATE ${targetTable} SET BRNCH = NULL WHERE PAT_CD = @PAT_CD`);
  if (cols.has("DUE")) await run(`UPDATE ${targetTable} SET DUE = NULL WHERE PAT_CD = @PAT_CD`);
  if (cols.has("GNDR") && genderCode != null) {
    await run(`UPDATE ${targetTable} SET GNDR = @GNDR WHERE PAT_CD = @PAT_CD`, (req) => req.input("GNDR", genderCode));
  }
  if (cols.has("PAY") && payAmount != null) {
    await run(`UPDATE ${targetTable} SET PAY = @PAY WHERE PAT_CD = @PAT_CD`, (req) => req.input("PAY", payAmount));
  }
  if (cols.has("TOTL") || cols.has("DISC") || cols.has("PA_VL")) {
    const aggReq = pool.request();
    aggReq.input("PAT_CD", patientCode);
    const agg = await aggReq.query(`
      SELECT
        SUM(CASE WHEN ISNUMERIC(CONVERT(varchar(50), PA_VL)) = 1 THEN CAST(CONVERT(varchar(50), PA_VL) AS decimal(18,2)) ELSE 0 END) AS totalSrv,
        SUM(CASE WHEN ISNUMERIC(CONVERT(varchar(50), DISC_VL)) = 1 THEN CAST(CONVERT(varchar(50), DISC_VL) AS decimal(18,2)) ELSE 0 END) AS totalDisc
      FROM op2026.dbo.PAPAT_SRV
      WHERE PAT_CD = @PAT_CD
    `);
    const row = Array.isArray(agg?.recordset) && agg.recordset.length > 0 ? agg.recordset[0] : {};
    const totalSrv = Number(row?.totalSrv ?? 0);
    const totalDisc = Number(row?.totalDisc ?? 0);
    if (cols.has("TOTL")) {
      await run(`UPDATE ${targetTable} SET TOTL = @TOTL WHERE PAT_CD = @PAT_CD`, (req) =>
        req.input("TOTL", Number.isFinite(totalSrv) ? totalSrv : 0)
      );
    }
    if (cols.has("DISC")) {
      await run(`UPDATE ${targetTable} SET DISC = @DISC WHERE PAT_CD = @PAT_CD`, (req) =>
        req.input("DISC", Number.isFinite(totalDisc) ? totalDisc : 0)
      );
    }
    if (cols.has("PA_VL")) {
      await run(`UPDATE ${targetTable} SET PA_VL = @PAVL WHERE PAT_CD = @PAT_CD`, (req) =>
        req.input("PAVL", Number.isFinite(totalSrv) ? totalSrv : 0)
      );
    }
  }
}

async function applyPajrnrReportDefaults(
  pool: any,
  targetTable: string,
  patientCode: string,
  trNo: number | null
): Promise<void> {
  if (!Number.isFinite(Number(trNo))) return;
  const cols = await getTableColumns(pool, targetTable);
  const trNoCol = cols.has("TR_NO") ? "TR_NO" : cols.has("TR_NONEW") ? "tr_noNew" : "";
  if (!trNoCol) return;
  const whereClause = `PAT_CD = @PAT_CD AND ${trNoCol} = @TR_NO`;
  const run = async (sqlText: string) => {
    const req = pool.request();
    req.input("PAT_CD", patientCode);
    req.input("TR_NO", Math.trunc(Number(trNo)));
    await req.query(sqlText);
  };
  if (cols.has("TR_TIM")) {
    await run(
      `UPDATE ${targetTable}
       SET TR_TIM = CASE WHEN ISNULL(CONVERT(varchar(50), TR_TIM), '') = '' THEN CONVERT(varchar(8), GETDATE(), 108) ELSE TR_TIM END
       WHERE ${whereClause}`
    );
  }
  if (cols.has("CNCL")) {
    await run(`UPDATE ${targetTable} SET CNCL = ISNULL(CNCL, 0) WHERE ${whereClause}`);
  }
}

async function loadDoubleEyeServiceCodes(): Promise<Set<string>> {
  const now = Date.now();
  if (pentacamServiceCodesCache && now - pentacamServiceCodesCache.at < 60_000) {
    return pentacamServiceCodesCache.codes;
  }

  const codes = new Set<string>();
  const configured = String(process.env.MSSQL_DOUBLE_EYE_SERVICE_CODES ?? "1501")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  configured.forEach((code) => codes.add(code));

  try {
    const setting = await db.getSystemSetting("service_directory");
    if (setting?.value) {
      const parsed = JSON.parse(String(setting.value));
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          const code = String((entry as any)?.code ?? "").trim();
          const name = String((entry as any)?.name ?? "").trim().toLowerCase();
          if (!code) continue;
          if (name.includes("pentacam") || name.includes("بنتاكام")) {
            codes.add(code);
          }
        }
      }
    }
  } catch {
    // optional setting; keep env/default codes only
  }

  pentacamServiceCodesCache = { at: now, codes };
  return codes;
}

async function getDesiredServiceQty(serviceCodeRaw: string): Promise<number> {
  const code = String(serviceCodeRaw ?? "").trim();
  if (!code) return 1;
  const doubleEyeCodes = await loadDoubleEyeServiceCodes();
  return doubleEyeCodes.has(code) ? 2 : 1;
}

export async function insertPatientToMssql(
  input: MssqlPatientInsertInput
): Promise<{ inserted: boolean; note?: string; trNo?: number | null }> {
  const patientCode = String(input.patientCode ?? "").trim();
  const fullName = String(input.fullName ?? "").trim();
  if (!patientCode || !fullName) {
    return { inserted: false, note: "Missing patientCode/fullName" };
  }

  const enabled = asBool(process.env.MSSQL_PUSH_NEW_PATIENTS_ENABLED, true);
  if (!enabled) {
    return { inserted: false, note: "MSSQL_PUSH_NEW_PATIENTS_ENABLED=false" };
  }

  const targetTable = String(process.env.MSSQL_PUSH_PATIENTS_TABLE ?? "op2026.dbo.PAJRNRCVH").trim();
  const nowIso = new Date().toISOString();
  const nowLiteral = toSqlDateTimeLiteral(nowIso);
  const todayDateOnly = `${nowIso.slice(0, 10)} 00:00:00`;
  const dobIso = normalizeIsoDate(input.dateOfBirth);
  const dobLiteral = dobIso ? `${dobIso} 00:00:00` : null;
  const branchRaw = String(input.branch ?? "").trim().toLowerCase();
  const branch = branchRaw === "surgery" ? "surgery" : "examinations";
  const serviceCode = String(input.serviceCode ?? "").trim() || null;
  const locationType = String(input.locationType ?? "").trim().toLowerCase();
  const idno = locationType === "external" ? 2 : locationType === "center" ? 1 : null;
  const payNum = Number(input.paidAmount ?? NaN);
  const dueNum = Number(input.dueAmount ?? NaN);
  const payValue = Number.isFinite(payNum) ? payNum : null;
  const dueValue = Number.isFinite(dueNum) ? dueNum : null;
  const enteredBy = String(input.enteredBy ?? process.env.MSSQL_PUSH_ENTEREDBY ?? "").trim() || null;
  const phone = String(input.phone ?? "").trim();
  const address = String(input.address ?? "").trim();
  const age = Number(input.age ?? 0);
  const ageValue = Number.isFinite(age) && age > 0 ? Math.trunc(age) : null;
  const gender = normalizeGender(input.gender) === "female" ? 2 : normalizeGender(input.gender) === "male" ? 1 : null;
  const strNoRaw = Number(process.env.MSSQL_PUSH_STR_NO ?? 916);
  const secCdRaw = Number(process.env.MSSQL_PUSH_SEC_CD ?? 15);
  const trTyRaw = Number(process.env.MSSQL_PUSH_TR_TY ?? 1);
  const strNo = Number.isFinite(strNoRaw) ? Math.trunc(strNoRaw) : 916;
  const secCd = Number.isFinite(secCdRaw) ? Math.trunc(secCdRaw) : 15;
  const trTy = Number.isFinite(trTyRaw) ? Math.trunc(trTyRaw) : 1;
  const shft = resolveShiftNumber();
  const dedupWindowSecondsRaw = Number(process.env.MSSQL_PUSH_DEDUP_SECONDS ?? 90);
  const dedupWindowSeconds =
    Number.isFinite(dedupWindowSecondsRaw) && dedupWindowSecondsRaw > 0
      ? Math.trunc(dedupWindowSecondsRaw)
      : 90;
  const allowCreateFlowServiceInsert = asBool(process.env.MSSQL_PUSH_CREATE_SERVICE_ROW, false);
  const { nam1, nam2, nam3 } = splitArabicName(fullName);

  const pool = await createMssqlPool();
  try {
    await pool.connect();
    const targetCols = await getTableColumns(pool, targetTable);
    const trNoCol = targetCols.has("TR_NO") ? "TR_NO" : targetCols.has("TR_NONEW") ? "tr_noNew" : "";
    const hasTrNoCol = Boolean(trNoCol);

    const insertColumns = [
      "PAT_CD",
      "NAM",
      "NAM1",
      "NAM2",
      "NAM3",
      "TEL1",
      "ADDRS",
      "AGE",
      "GNDR",
      "BRNCH",
      "SEC_CD",
      "TR_TY",
      ...(hasTrNoCol ? [trNoCol] : []),
      "TR_DT",
      "VST_NO",
      "SHFT",
      "DT",
      "BDT",
      "VST_DT",
      "ENTRYDATE",
      "UPDATEDATE",
      "STR_NO",
      "IDNO",
      "PAY",
      "DUE",
    ];
    const insertValues = [
      "@PAT_CD",
      "@NAM",
      "@NAM1",
      "@NAM2",
      "@NAM3",
      "@TEL1",
      "@ADDRS",
      "@AGE",
      "@GNDR",
      "@BRNCH",
      "@SEC_CD",
      "@TR_TY",
      ...(hasTrNoCol ? [`(SELECT ISNULL(MAX(CAST(${trNoCol} AS INT)), 0) + 1 FROM ${targetTable} WITH (UPDLOCK, HOLDLOCK))`] : []),
      "@TR_DT",
      `(
          SELECT ISNULL(MAX(
            CASE
              WHEN ISNUMERIC(CONVERT(varchar(50), VST_NO)) = 1 THEN CAST(CONVERT(varchar(50), VST_NO) AS INT)
              ELSE NULL
            END
          ), 0) + 1
          FROM ${targetTable}
          WHERE PAT_CD = @PAT_CD
        )`,
      "@SHFT",
      "@DT",
      "@BDT",
      "@VST_DT",
      "@ENTRYDATE",
      "@UPDATEDATE",
      "@STR_NO",
      "@IDNO",
      "@PAY",
      "@DUE",
    ];
    const insertSql = `
      INSERT INTO ${targetTable}
      (${insertColumns.join(", ")})
      ${hasTrNoCol ? `OUTPUT INSERTED.${trNoCol} AS TR_NO` : ""}
      VALUES (${insertValues.join(", ")})
    `;
    const latestReq = pool.request();
    latestReq.input("PAT_CD", patientCode);
    const latestRs = await latestReq.query(`
      SELECT TOP 1
        ${
          hasTrNoCol
            ? `CASE WHEN ISNUMERIC(CONVERT(varchar(50), ${trNoCol})) = 1 THEN CAST(CONVERT(varchar(50), ${trNoCol}) AS INT) ELSE NULL END AS TR_NO,`
            : "NULL AS TR_NO,"
        }
        CASE WHEN ISNUMERIC(CONVERT(varchar(50), VST_NO)) = 1 THEN CAST(CONVERT(varchar(50), VST_NO) AS INT) ELSE NULL END AS VST_NO,
        CASE WHEN ISDATE(DT) = 1 THEN CONVERT(datetime, DT) ELSE NULL END AS DT,
        CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) ELSE NULL END AS UPDATEDATE,
        CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) ELSE NULL END AS ENTRYDATE
      FROM ${targetTable}
      WHERE PAT_CD = @PAT_CD
      ORDER BY
        CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
        CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC
    `);
    const latestRow = Array.isArray(latestRs?.recordset) && latestRs.recordset.length > 0 ? latestRs.recordset[0] : null;
    const latestTouched = latestRow?.UPDATEDATE ?? latestRow?.ENTRYDATE ?? null;
    const latestTouchedMs = latestTouched ? new Date(latestTouched).valueOf() : NaN;
    const withinDedupWindow =
      Number.isFinite(latestTouchedMs) &&
      Date.now() - latestTouchedMs >= 0 &&
      Date.now() - latestTouchedMs <= dedupWindowSeconds * 1000;

    let trNo = Number.NaN;
    let headerVstNo = 1;
    let headerDt = new Date(todayDateOnly);

    if (withinDedupWindow) {
      trNo = Number(latestRow?.TR_NO);
      headerVstNo = Number.isFinite(Number(latestRow?.VST_NO)) ? Math.trunc(Number(latestRow?.VST_NO)) : 1;
      headerDt = latestRow?.DT ? new Date(latestRow.DT) : new Date(todayDateOnly);
    } else {
      const req = pool.request();
      req.input("PAT_CD", patientCode);
      req.input("NAM", fullName);
      req.input("NAM1", nam1 || null);
      req.input("NAM2", nam2 || null);
      req.input("NAM3", nam3 || null);
      req.input("TEL1", phone || null);
      req.input("ADDRS", address || null);
      req.input("AGE", ageValue);
      req.input("GNDR", gender);
      req.input("BRNCH", branch);
      req.input("SEC_CD", secCd);
      req.input("TR_TY", trTy);
      req.input("TR_DT", todayDateOnly);
      req.input("SHFT", shft);
      req.input("DT", todayDateOnly);
      req.input("BDT", dobLiteral);
      req.input("VST_DT", todayDateOnly);
      req.input("ENTRYDATE", nowLiteral);
      req.input("UPDATEDATE", nowLiteral);
      req.input("STR_NO", strNo);
      req.input("IDNO", idno);
      req.input("PAY", payValue);
      req.input("DUE", dueValue);
      const inserted = await req.query(insertSql);
      const insertedRow =
        Array.isArray(inserted?.recordset) && inserted.recordset.length > 0 ? inserted.recordset[0] : {};
      trNo = hasTrNoCol ? Number(insertedRow?.TR_NO) : Number.NaN;

      const headerInfoReq = pool.request();
      headerInfoReq.input("PAT_CD", patientCode);
      headerInfoReq.input("TR_NO", Number.isFinite(trNo) ? Math.trunc(trNo) : null);
      const headerWhere =
        hasTrNoCol && Number.isFinite(trNo) ? `PAT_CD = @PAT_CD AND ${trNoCol} = @TR_NO` : "PAT_CD = @PAT_CD";
      const headerInfoRs = await headerInfoReq.query(`
        SELECT TOP 1
          CASE WHEN ISNUMERIC(CONVERT(varchar(50), VST_NO)) = 1 THEN CAST(CONVERT(varchar(50), VST_NO) AS INT) ELSE NULL END AS VST_NO,
          CASE WHEN ISDATE(DT) = 1 THEN CONVERT(datetime, DT) ELSE NULL END AS DT
        FROM ${targetTable}
        WHERE ${headerWhere}
        ORDER BY
          CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
          CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC
      `);
      const hrow =
        Array.isArray(headerInfoRs?.recordset) && headerInfoRs.recordset.length > 0 ? headerInfoRs.recordset[0] : {};
      headerVstNo = Number(hrow?.VST_NO);
      headerDt = hrow?.DT ? new Date(hrow.DT) : new Date(todayDateOnly);
    }
    await applyPajrnrReportDefaults(pool, targetTable, patientCode, Number.isFinite(trNo) ? trNo : null);
    await applyPajrnrCvhDefaults(pool, targetTable, patientCode, gender, payValue);
    await ensurePapatIoDefaults(pool, patientCode, Number.isFinite(trNo) ? trNo : null, Number.isFinite(headerVstNo) ? headerVstNo : 1, headerDt);
    await ensurePapatMfDefaults(pool, patientCode, new Date(todayDateOnly), fullName);

    if (serviceCode && allowCreateFlowServiceInsert) {
      try {
        const srvCols = await getTableColumns(pool, "op2026.dbo.PAPAT_SRV");
        const srvTrNoCol = srvCols.has("TR_NO") ? "TR_NO" : srvCols.has("TR_NONEW") ? "tr_noNew" : "";
        const hasSrvTrNoCol = Boolean(srvTrNoCol);
        const serviceInsertCols = [
          "PAT_CD",
          "SRV_CD",
          "VST_NO",
          "DT",
          "FRMTIM",
          ...(hasSrvTrNoCol ? [srvTrNoCol] : []),
          "TR_TY",
          "SEC_CD",
          "PRG_SNO",
          "CUR_STAT",
          "QTY",
        ];
        const serviceInsertVals = [
          "@PAT_CD",
          "@SRV_CD",
          `ISNULL(
                (
                  SELECT TOP 1
                    CASE
                      WHEN ISNUMERIC(CONVERT(varchar(50), VST_NO)) = 1 THEN CAST(CONVERT(varchar(50), VST_NO) AS INT)
                      ELSE NULL
                    END
                  FROM op2026.dbo.PAJRNRCVH
                  WHERE PAT_CD = @PAT_CD
                  ORDER BY
                    CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
                    CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC
                ),
                1
              )`,
          `ISNULL(
                (
                  SELECT TOP 1
                    CASE WHEN ISDATE(DT) = 1 THEN CONVERT(datetime, DT) END
                  FROM op2026.dbo.PAJRNRCVH
                  WHERE PAT_CD = @PAT_CD
                  ORDER BY
                    CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
                    CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC
                ),
                GETDATE()
              )`,
          `ISNULL(
                (
                  SELECT TOP 1
                    NULLIF(CONVERT(varchar(50), TR_TIM), '')
                  FROM op2026.dbo.PAJRNRCVH
                  WHERE PAT_CD = @PAT_CD
                  ORDER BY
                    CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
                    CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC
                ),
                CONVERT(varchar(8), GETDATE(), 108)
              )`,
          ...(hasSrvTrNoCol
            ? [
                `ISNULL(
                    @TR_NO,
                    (
                      SELECT ISNULL(MAX(
                        CASE
                          WHEN ISNUMERIC(CONVERT(varchar(50), ${srvTrNoCol})) = 1 THEN CAST(CONVERT(varchar(50), ${srvTrNoCol}) AS INT)
                          ELSE NULL
                        END
                      ), 0) + 1
                      FROM op2026.dbo.PAPAT_SRV
                    )
                  )`,
              ]
            : []),
          `ISNULL(
                (
                  SELECT TOP 1
                    CASE
                      WHEN ISNUMERIC(CONVERT(varchar(50), TR_TY)) = 1 THEN CAST(CONVERT(varchar(50), TR_TY) AS INT)
                      ELSE NULL
                    END
                  FROM op2026.dbo.PAJRNRCVH
                  WHERE PAT_CD = @PAT_CD
                  ORDER BY
                    CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
                    CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC
                ),
                1
              )`,
          "15",
          "1",
          "6",
          "1",
        ];
        const serviceExistsFilter =
          (() => {
            const exact = hasSrvTrNoCol && Number.isFinite(trNo)
              ? `PAT_CD = @PAT_CD AND SRV_CD = @SRV_CD AND ${srvTrNoCol} = @TR_NO`
              : `PAT_CD = @PAT_CD AND SRV_CD = @SRV_CD`;
            const recentChecks: string[] = [];
            if (srvCols.has("UPDATEDATE")) {
              recentChecks.push(
                `(ISDATE(UPDATEDATE) = 1 AND DATEDIFF(SECOND, CONVERT(datetime, UPDATEDATE), GETDATE()) BETWEEN 0 AND @DEDUP_SECONDS)`
              );
            }
            if (srvCols.has("ENTRYDATE")) {
              recentChecks.push(
                `(ISDATE(ENTRYDATE) = 1 AND DATEDIFF(SECOND, CONVERT(datetime, ENTRYDATE), GETDATE()) BETWEEN 0 AND @DEDUP_SECONDS)`
              );
            }
            if (!recentChecks.length) return exact;
            const recent = `PAT_CD = @PAT_CD AND SRV_CD = @SRV_CD AND (${recentChecks.join(" OR ")})`;
            return `(${exact}) OR (${recent})`;
          })();
        const serviceSql = `
            INSERT INTO op2026.dbo.PAPAT_SRV (${serviceInsertCols.join(", ")})
            SELECT ${serviceInsertVals.join(", ")}
            WHERE NOT EXISTS (
              SELECT 1 FROM op2026.dbo.PAPAT_SRV WHERE ${serviceExistsFilter}
            )
        `;
        await withMssqlServiceInsertLock(pool, patientCode, serviceCode, async () => {
          const reqService = pool.request();
          reqService.input("PAT_CD", patientCode);
          reqService.input("SRV_CD", serviceCode);
          reqService.input("SEC_CD", secCd);
          reqService.input("TR_NO", Number.isFinite(trNo) ? Math.trunc(trNo) : null);
          reqService.input("DEDUP_SECONDS", dedupWindowSeconds);
          await reqService.query(serviceSql);
          await applyPapatSrvDefaults(pool, patientCode, serviceCode, await getDesiredServiceQty(serviceCode), {
            patientNameAr: fullName,
            enteredBy,
            entryDate: todayDateOnly,
            trNo: Number.isFinite(trNo) ? Math.trunc(trNo) : null,
          });
        });
        await applyPajrnrCvhDefaults(pool, targetTable, patientCode, gender, payValue);
      } catch {
        // optional service mirror table
      }
    }

    return { inserted: true, trNo: Number.isFinite(trNo) ? trNo : null };
  } finally {
    await pool.close();
  }
}

export async function upsertPatientToMssql(input: MssqlPatientInsertInput): Promise<{ upserted: boolean; note?: string }> {
  const patientCode = String(input.patientCode ?? "").trim();
  const fullName = String(input.fullName ?? "").trim();
  if (!patientCode || !fullName) {
    return { upserted: false, note: "Missing patientCode/fullName" };
  }

  const enabled = asBool(process.env.MSSQL_PUSH_NEW_PATIENTS_ENABLED, true);
  if (!enabled) {
    return { upserted: false, note: "MSSQL_PUSH_NEW_PATIENTS_ENABLED=false" };
  }

  const targetTable = String(process.env.MSSQL_PUSH_PATIENTS_TABLE ?? "op2026.dbo.PAJRNRCVH").trim();
  const nowIso = new Date().toISOString();
  const nowLiteral = toSqlDateTimeLiteral(nowIso);
  const todayDateOnly = `${nowIso.slice(0, 10)} 00:00:00`;
  const dobIso = normalizeIsoDate(input.dateOfBirth);
  const dobLiteral = dobIso ? `${dobIso} 00:00:00` : null;
  const branchRaw = String(input.branch ?? "").trim().toLowerCase();
  const branch = branchRaw === "surgery" ? "surgery" : "examinations";
  const serviceCode = String(input.serviceCode ?? "").trim() || null;
  const locationType = String(input.locationType ?? "").trim().toLowerCase();
  const idno = locationType === "external" ? 2 : locationType === "center" ? 1 : null;
  const payNum = Number(input.paidAmount ?? NaN);
  const dueNum = Number(input.dueAmount ?? NaN);
  const payValue = Number.isFinite(payNum) ? payNum : null;
  const dueValue = Number.isFinite(dueNum) ? dueNum : null;
  const enteredBy = String(input.enteredBy ?? process.env.MSSQL_PUSH_ENTEREDBY ?? "").trim() || null;
  const phone = String(input.phone ?? "").trim();
  const address = String(input.address ?? "").trim();
  const age = Number(input.age ?? 0);
  const ageValue = Number.isFinite(age) && age > 0 ? Math.trunc(age) : null;
  const gender = normalizeGender(input.gender) === "female" ? 2 : normalizeGender(input.gender) === "male" ? 1 : null;
  const strNoRaw = Number(process.env.MSSQL_PUSH_STR_NO ?? 916);
  const secCdRaw = Number(process.env.MSSQL_PUSH_SEC_CD ?? 15);
  const trTyRaw = Number(process.env.MSSQL_PUSH_TR_TY ?? 1);
  const strNo = Number.isFinite(strNoRaw) ? Math.trunc(strNoRaw) : 916;
  const secCd = Number.isFinite(secCdRaw) ? Math.trunc(secCdRaw) : 15;
  const trTy = Number.isFinite(trTyRaw) ? Math.trunc(trTyRaw) : 1;
  const shft = resolveShiftNumber();
  const { nam1, nam2, nam3 } = splitArabicName(fullName);

  const pool = await createMssqlPool();
  try {
    await pool.connect();
    const targetCols = await getTableColumns(pool, targetTable);
    const trNoCol = targetCols.has("TR_NO") ? "TR_NO" : targetCols.has("TR_NONEW") ? "tr_noNew" : "";
    const hasTrNoCol = Boolean(trNoCol);

    const bindPatientInputs = (req: any) => {
      req.input("PAT_CD", patientCode);
      req.input("NAM", fullName);
      req.input("NAM1", nam1 || null);
      req.input("NAM2", nam2 || null);
      req.input("NAM3", nam3 || null);
      req.input("TEL1", phone || null);
      req.input("ADDRS", address || null);
      req.input("AGE", ageValue);
      req.input("GNDR", gender);
      req.input("BRNCH", branch);
      req.input("SEC_CD", secCd);
      req.input("TR_TY", trTy);
      req.input("TR_DT", todayDateOnly);
      req.input("VST_NO", 1);
      req.input("SHFT", shft);
      req.input("DT", todayDateOnly);
      req.input("BDT", dobLiteral);
      req.input("VST_DT", todayDateOnly);
      req.input("ENTRYDATE", nowLiteral);
      req.input("UPDATEDATE", nowLiteral);
      req.input("STR_NO", strNo);
      req.input("IDNO", idno);
      req.input("PAY", payValue);
      req.input("DUE", dueValue);
    };
    const existsReq = pool.request();
    existsReq.input("PAT_CD", patientCode);
    const existsResult = await existsReq.query(`SELECT TOP 1 1 AS ok FROM ${targetTable} WHERE PAT_CD = @PAT_CD`);
    const exists = Array.isArray(existsResult?.recordset) && existsResult.recordset.length > 0;
    if (exists) {
      const updateSql = `
        UPDATE ${targetTable}
        SET
          NAM = COALESCE(@NAM, NAM),
          NAM1 = COALESCE(@NAM1, NAM1),
          NAM2 = COALESCE(@NAM2, NAM2),
          NAM3 = COALESCE(@NAM3, NAM3),
          TEL1 = COALESCE(@TEL1, TEL1),
          ADDRS = COALESCE(@ADDRS, ADDRS),
          AGE = COALESCE(@AGE, AGE),
          GNDR = COALESCE(@GNDR, GNDR),
          BRNCH = COALESCE(@BRNCH, BRNCH),
          SEC_CD = COALESCE(@SEC_CD, SEC_CD),
          IDNO = COALESCE(@IDNO, IDNO),
          PAY = COALESCE(@PAY, PAY),
          DUE = COALESCE(@DUE, DUE),
          TR_DT = @TR_DT,
          VST_NO = ISNULL(VST_NO, @VST_NO),
          SHFT = @SHFT,
          DT = @DT,
          BDT = @BDT,
          VST_DT = @VST_DT,
          STR_NO = ISNULL(STR_NO, @STR_NO),
          UPDATEDATE = @UPDATEDATE
        WHERE PAT_CD = @PAT_CD
      `;
      const updateReq = pool.request();
      bindPatientInputs(updateReq);
      await updateReq.query(updateSql);
    } else {
      const insertCols = [
        "PAT_CD", "NAM", "NAM1", "NAM2", "NAM3", "TEL1", "ADDRS", "AGE", "GNDR", "BRNCH", "SEC_CD", "TR_TY",
        ...(hasTrNoCol ? [trNoCol] : []),
        "TR_DT", "VST_NO", "SHFT", "DT", "BDT", "VST_DT", "ENTRYDATE", "UPDATEDATE", "STR_NO", "IDNO", "PAY", "DUE",
      ];
      const insertVals = [
        "@PAT_CD", "@NAM", "@NAM1", "@NAM2", "@NAM3", "@TEL1", "@ADDRS", "@AGE", "@GNDR", "@BRNCH", "@SEC_CD", "@TR_TY",
        ...(hasTrNoCol ? [`(SELECT ISNULL(MAX(CAST(${trNoCol} AS INT)), 0) + 1 FROM ${targetTable} WITH (UPDLOCK, HOLDLOCK))`] : []),
        "@TR_DT",
        `(
            SELECT ISNULL(MAX(
              CASE
                WHEN ISNUMERIC(CONVERT(varchar(50), VST_NO)) = 1 THEN CAST(CONVERT(varchar(50), VST_NO) AS INT)
                ELSE NULL
              END
            ), 0) + 1
            FROM ${targetTable}
            WHERE PAT_CD = @PAT_CD
          )`,
        "@SHFT", "@DT", "@BDT", "@VST_DT", "@ENTRYDATE", "@UPDATEDATE", "@STR_NO", "@IDNO", "@PAY", "@DUE",
      ];
      const insertSql = `INSERT INTO ${targetTable} (${insertCols.join(", ")}) VALUES (${insertVals.join(", ")})`;
      const insertReq = pool.request();
      bindPatientInputs(insertReq);
      await insertReq.query(insertSql);
    }
    await applyPajrnrCvhDefaults(pool, targetTable, patientCode, gender, payValue);
    const latestHeaderReq = pool.request();
    latestHeaderReq.input("PAT_CD", patientCode);
    const trNoSelectExpr = trNoCol
      ? `CASE WHEN ISNUMERIC(CONVERT(varchar(50), ${trNoCol})) = 1 THEN CAST(CONVERT(varchar(50), ${trNoCol}) AS INT) ELSE NULL END AS TR_NO,`
      : `NULL AS TR_NO,`;
    const trNoOrderExpr = trNoCol
      ? `, CASE WHEN ISNUMERIC(CONVERT(varchar(50), ${trNoCol})) = 1 THEN CAST(CONVERT(varchar(50), ${trNoCol}) AS INT) END DESC`
      : "";
    const latestHeaderRs = await latestHeaderReq.query(`
      SELECT TOP 1
        ${trNoSelectExpr}
        CASE WHEN ISNUMERIC(CONVERT(varchar(50), VST_NO)) = 1 THEN CAST(CONVERT(varchar(50), VST_NO) AS INT) ELSE NULL END AS VST_NO,
        CASE WHEN ISDATE(DT) = 1 THEN CONVERT(datetime, DT) ELSE NULL END AS DT
      FROM ${targetTable}
      WHERE PAT_CD = @PAT_CD
      ORDER BY
        CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
        CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC
        ${trNoOrderExpr}
    `);
    const latestH = Array.isArray(latestHeaderRs?.recordset) && latestHeaderRs.recordset.length > 0 ? latestHeaderRs.recordset[0] : {};
    await ensurePapatIoDefaults(
      pool,
      patientCode,
      Number.isFinite(Number(latestH?.TR_NO)) ? Math.trunc(Number(latestH?.TR_NO)) : null,
      Number.isFinite(Number(latestH?.VST_NO)) ? Math.trunc(Number(latestH?.VST_NO)) : 1,
      latestH?.DT ? new Date(latestH.DT) : new Date(todayDateOnly)
    );
    await ensurePapatMfDefaults(pool, patientCode, new Date(todayDateOnly), fullName);

    if (serviceCode) {
      try {
        const srvCols = await getTableColumns(pool, "op2026.dbo.PAPAT_SRV");
        const srvTrNoCol = srvCols.has("TR_NO") ? "TR_NO" : srvCols.has("TR_NONEW") ? "tr_noNew" : "";
        const headerTrSelectExpr = trNoCol || "TR_NO";
        const srvTrSelectExpr = srvTrNoCol || "TR_NO";
        const srvInsertCols = [
          "PAT_CD", "SRV_CD", "VST_NO", "DT", "FRMTIM", ...(srvTrNoCol ? [srvTrNoCol] : []), "TR_TY", "SEC_CD", "PRG_SNO", "CUR_STAT", "QTY",
        ];
        const srvInsertVals = [
          "@PAT_CD",
          "@SRV_CD",
          `ISNULL(
                (
                  SELECT TOP 1
                    CASE
                      WHEN ISNUMERIC(CONVERT(varchar(50), VST_NO)) = 1 THEN CAST(CONVERT(varchar(50), VST_NO) AS INT)
                      ELSE NULL
                    END
                  FROM op2026.dbo.PAJRNRCVH
                  WHERE PAT_CD = @PAT_CD
                  ORDER BY
                    CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
                    CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC
                ),
                1
              )`,
          `ISNULL(
                (
                  SELECT TOP 1
                    CASE WHEN ISDATE(DT) = 1 THEN CONVERT(datetime, DT) END
                  FROM op2026.dbo.PAJRNRCVH
                  WHERE PAT_CD = @PAT_CD
                  ORDER BY
                    CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
                    CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC
                ),
                GETDATE()
              )`,
          `ISNULL(
                (
                  SELECT TOP 1
                    NULLIF(CONVERT(varchar(50), TR_TIM), '')
                  FROM op2026.dbo.PAJRNRCVH
                  WHERE PAT_CD = @PAT_CD
                  ORDER BY
                    CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
                    CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC
                ),
                CONVERT(varchar(8), GETDATE(), 108)
              )`,
          ...(srvTrNoCol
            ? [
                `ISNULL(
                  (
                    SELECT TOP 1
                      CASE
                        WHEN ISNUMERIC(CONVERT(varchar(50), ${headerTrSelectExpr})) = 1 THEN CAST(CONVERT(varchar(50), ${headerTrSelectExpr}) AS INT)
                        ELSE NULL
                      END
                    FROM op2026.dbo.PAJRNRCVH
                    WHERE PAT_CD = @PAT_CD
                    ORDER BY
                      CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
                      CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC
                  ),
                  (
                    SELECT ISNULL(MAX(
                      CASE
                        WHEN ISNUMERIC(CONVERT(varchar(50), ${srvTrSelectExpr})) = 1 THEN CAST(CONVERT(varchar(50), ${srvTrSelectExpr}) AS INT)
                        ELSE NULL
                      END
                    ), 0) + 1
                    FROM op2026.dbo.PAPAT_SRV
                  )
                )`,
              ]
            : []),
          `ISNULL(
                (
                  SELECT TOP 1
                    CASE
                      WHEN ISNUMERIC(CONVERT(varchar(50), TR_TY)) = 1 THEN CAST(CONVERT(varchar(50), TR_TY) AS INT)
                      ELSE NULL
                    END
                  FROM op2026.dbo.PAJRNRCVH
                  WHERE PAT_CD = @PAT_CD
                  ORDER BY
                    CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
                    CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC
                ),
                1
              )`,
          "15", "1", "6", "1",
        ];
        const serviceSql = `
            INSERT INTO op2026.dbo.PAPAT_SRV (${srvInsertCols.join(", ")})
            SELECT ${srvInsertVals.join(", ")}
            WHERE NOT EXISTS (
              SELECT 1 FROM op2026.dbo.PAPAT_SRV WHERE PAT_CD = @PAT_CD AND SRV_CD = @SRV_CD
            )
        `;
        await withMssqlServiceInsertLock(pool, patientCode, serviceCode, async () => {
          const reqService = pool.request();
          reqService.input("PAT_CD", patientCode);
          reqService.input("SRV_CD", serviceCode);
          reqService.input("SEC_CD", secCd);
          await reqService.query(serviceSql);
          await applyPapatSrvDefaults(pool, patientCode, serviceCode, await getDesiredServiceQty(serviceCode), {
            patientNameAr: fullName,
            enteredBy,
            entryDate: todayDateOnly,
          });
        });
        await applyPajrnrCvhDefaults(pool, targetTable, patientCode, gender, payValue);
      } catch {
        // optional service mirror table
      }
    }

    return { upserted: true };
  } finally {
    await pool.close();
  }
}

export async function ensurePatientServiceInMssql(
  patientCodeRaw: string,
  serviceCodeRaw: string,
  quantityRaw?: number | null,
  doctorCodeRaw?: string | null,
  doctorNameRaw?: string | null
): Promise<{ linked: boolean; note?: string }> {
  const patientCode = String(patientCodeRaw ?? "").trim();
  const serviceCode = String(serviceCodeRaw ?? "").trim();
  const doctorCode = String(doctorCodeRaw ?? "").trim();
  const doctorName = String(doctorNameRaw ?? "").trim();
  if (!patientCode || !serviceCode) return { linked: false, note: "Missing patientCode/serviceCode" };

  const enabled = asBool(process.env.MSSQL_PUSH_NEW_PATIENTS_ENABLED, true);
  if (!enabled) {
    return { linked: false, note: "MSSQL_PUSH_NEW_PATIENTS_ENABLED=false" };
  }
  const secCdRaw = Number(process.env.MSSQL_PUSH_SEC_CD ?? 15);
  const secCd = Number.isFinite(secCdRaw) ? Math.trunc(secCdRaw) : 15;
  const targetTable = String(process.env.MSSQL_PUSH_PATIENTS_TABLE ?? "op2026.dbo.PAJRNRCVH").trim();
  const enteredBy = String(process.env.MSSQL_PUSH_ENTEREDBY ?? "").trim() || null;
  const todayDateOnly = `${new Date().toISOString().slice(0, 10)} 00:00:00`;

  const pool = await createMssqlPool();
  try {
    await pool.connect();
    const headerCols = await getTableColumns(pool, targetTable);
    const headerTrNoCol = headerCols.has("TR_NO") ? "TR_NO" : headerCols.has("TR_NONEW") ? "tr_noNew" : "";
    const srvCols = await getTableColumns(pool, "op2026.dbo.PAPAT_SRV");
    const srvTrNoCol = srvCols.has("TR_NO") ? "TR_NO" : srvCols.has("TR_NONEW") ? "tr_noNew" : "";
    const srvInsertCols = [
      "PAT_CD", "SRV_CD", "VST_NO", "DT", "FRMTIM", ...(srvTrNoCol ? [srvTrNoCol] : []), "TR_TY", "SEC_CD", "PRG_SNO", "CUR_STAT", "QTY",
    ];
    const headerTrExpr = headerTrNoCol || "NULL";
    const srvTrExpr = srvTrNoCol || "NULL";
    const srvInsertVals = [
      "@PAT_CD",
      "@SRV_CD",
      `ISNULL(
            (
              SELECT TOP 1
                CASE
                  WHEN ISNUMERIC(CONVERT(varchar(50), VST_NO)) = 1 THEN CAST(CONVERT(varchar(50), VST_NO) AS INT)
                  ELSE NULL
                END
              FROM ${targetTable}
              WHERE PAT_CD = @PAT_CD
              ORDER BY
                CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
                CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC
            ),
            1
          )`,
      `ISNULL(
            (
              SELECT TOP 1
                CASE WHEN ISDATE(DT) = 1 THEN CONVERT(datetime, DT) END
              FROM ${targetTable}
              WHERE PAT_CD = @PAT_CD
              ORDER BY
                CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
                CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC
            ),
            GETDATE()
          )`,
      `ISNULL(
            (
              SELECT TOP 1
                NULLIF(CONVERT(varchar(50), TR_TIM), '')
              FROM ${targetTable}
              WHERE PAT_CD = @PAT_CD
              ORDER BY
                CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
                CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC
            ),
            CONVERT(varchar(8), GETDATE(), 108)
          )`,
      ...(srvTrNoCol
        ? [
            `ISNULL(
              (
                SELECT TOP 1
                  CASE
                    WHEN ISNUMERIC(CONVERT(varchar(50), ${headerTrExpr})) = 1 THEN CAST(CONVERT(varchar(50), ${headerTrExpr}) AS INT)
                    ELSE NULL
                  END
                FROM ${targetTable}
                WHERE PAT_CD = @PAT_CD
                ORDER BY
                  CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
                  CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC
              ),
              (
                SELECT ISNULL(MAX(
                  CASE
                    WHEN ISNUMERIC(CONVERT(varchar(50), ${srvTrExpr})) = 1 THEN CAST(CONVERT(varchar(50), ${srvTrExpr}) AS INT)
                    ELSE NULL
                  END
                ), 0) + 1
                FROM op2026.dbo.PAPAT_SRV
              )
            )`,
          ]
        : []),
      `ISNULL(
            (
              SELECT TOP 1
                CASE
                  WHEN ISNUMERIC(CONVERT(varchar(50), TR_TY)) = 1 THEN CAST(CONVERT(varchar(50), TR_TY) AS INT)
                  ELSE NULL
                END
              FROM ${targetTable}
              WHERE PAT_CD = @PAT_CD
              ORDER BY
                CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
                CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC
            ),
            1
          )`,
      "15", "1", "6", "1",
    ];
    const serviceSql = `
        INSERT INTO op2026.dbo.PAPAT_SRV (${srvInsertCols.join(", ")})
        SELECT ${srvInsertVals.join(", ")}
        WHERE NOT EXISTS (
          SELECT 1 FROM op2026.dbo.PAPAT_SRV WHERE PAT_CD = @PAT_CD AND SRV_CD = @SRV_CD
        )
    `;
    await withMssqlServiceInsertLock(pool, patientCode, serviceCode, async () => {
      const reqService = pool.request();
      reqService.input("PAT_CD", patientCode);
      reqService.input("SRV_CD", serviceCode);
      reqService.input("SEC_CD", secCd);
      await reqService.query(serviceSql);
    });
    if (doctorCode || doctorName) {
      const doctorBy = String(doctorCode || "").trim() || null;
      const doctorNameEffective = String(doctorName || doctorCode || "").trim() || null;
      const papatSrvColsResult = await pool.request().query(`
        SELECT name
        FROM sys.columns
        WHERE object_id = OBJECT_ID('op2026.dbo.PAPAT_SRV')
      `);
      const papatSrvCols = new Set<string>(
        (Array.isArray(papatSrvColsResult?.recordset) ? papatSrvColsResult.recordset : [])
          .map((r: any) => String(r?.name ?? "").toUpperCase())
          .filter(Boolean)
      );
      const runSrvDoctorUpdate = async (column: string, value: string) => {
        const req = pool.request();
        req.input("PAT_CD", patientCode);
        req.input("SRV_CD", serviceCode);
        req.input("VAL", value);
        await req.query(`UPDATE op2026.dbo.PAPAT_SRV SET ${column} = @VAL WHERE PAT_CD = @PAT_CD AND SRV_CD = @SRV_CD`);
      };
      if (doctorBy) {
        if (papatSrvCols.has("SRV_BY1")) await runSrvDoctorUpdate("SRV_BY1", doctorBy);
        if (papatSrvCols.has("CUR_SRV_BY")) await runSrvDoctorUpdate("CUR_SRV_BY", doctorBy);
        if (papatSrvCols.has("PRG_BY")) await runSrvDoctorUpdate("PRG_BY", doctorBy);
        if (papatSrvCols.has("DR_CD")) {
          try {
            await runSrvDoctorUpdate("DR_CD", doctorBy);
          } catch {
            // ignore incompatible DR_CD type in some deployments
          }
        }
      }
      if (doctorNameEffective) {
        const targetColsResult = await pool.request().query(`
          SELECT name
          FROM sys.columns
          WHERE object_id = OBJECT_ID('${targetTable}')
            AND name IN ('DOC_NAM', 'DOC_NAME')
        `);
        const targetCols = new Set<string>(
          (Array.isArray(targetColsResult?.recordset) ? targetColsResult.recordset : [])
            .map((r: any) => String(r?.name ?? "").toUpperCase())
            .filter(Boolean)
        );
        const runHeaderDoctorUpdate = async (column: "DOC_NAM" | "DOC_NAME") => {
          const req = pool.request();
          req.input("PAT_CD", patientCode);
          req.input("DOC_NAME", doctorNameEffective);
          await req.query(`
            WITH latest AS (
              SELECT TOP 1 *
              FROM ${targetTable}
              WHERE PAT_CD = @PAT_CD
              ORDER BY
                CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
                CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC
            )
            UPDATE latest SET ${column} = @DOC_NAME
          `);
        };
        if (targetCols.has("DOC_NAM")) await runHeaderDoctorUpdate("DOC_NAM");
        if (targetCols.has("DOC_NAME")) await runHeaderDoctorUpdate("DOC_NAME");
      }
    }
    const q = Number(quantityRaw);
    const desiredQty = Number.isFinite(q) && q > 0 ? Math.trunc(q) : await getDesiredServiceQty(serviceCode);
    await applyPapatSrvDefaults(pool, patientCode, serviceCode, desiredQty, {
      enteredBy,
      entryDate: todayDateOnly,
    });
    await applyPajrnrCvhDefaults(pool, targetTable, patientCode, null, null);
    await ensurePapatMfDefaults(pool, patientCode, new Date(todayDateOnly), null);
    return { linked: true };
  } finally {
    await pool.close();
  }
}

export async function deletePatientFromMssqlByCode(patientCodeRaw: string): Promise<{ deleted: boolean; note?: string }> {
  const patientCode = String(patientCodeRaw ?? "").trim();
  if (!patientCode) return { deleted: false, note: "Missing patientCode" };

  const enabled = asBool(process.env.MSSQL_PUSH_NEW_PATIENTS_ENABLED, true);
  if (!enabled) {
    return { deleted: false, note: "MSSQL_PUSH_NEW_PATIENTS_ENABLED=false" };
  }

  const targetTable = String(process.env.MSSQL_PUSH_PATIENTS_TABLE ?? "op2026.dbo.PAJRNRCVH").trim();
  const pool = await createMssqlPool();
  try {
    await pool.connect();

    // Delete children first, then header row.
    const tryDeleteByCode = async (tableName: string): Promise<number> => {
      try {
        const result = await pool
          .request()
          .input("PAT_CD", patientCode)
          .query(`DELETE FROM ${tableName} WHERE PAT_CD = @PAT_CD`);
        return Number(result?.rowsAffected?.[0] ?? 0);
      } catch {
        // Some deployments may not have all tables.
        return 0;
      }
    };

    const deletedSrv = await tryDeleteByCode("op2026.dbo.PAPAT_SRV");
    const deletedIo = await tryDeleteByCode("op2026.dbo.PAPAT_IO");
    const deletedMf = await tryDeleteByCode("op2026.dbo.PAPATMF");
    const deletedHeader = await tryDeleteByCode(targetTable);

    const totalDeleted = deletedSrv + deletedIo + deletedMf + deletedHeader;
    return {
      deleted: totalDeleted > 0,
      note:
        totalDeleted > 0
          ? `Deleted rows - SRV:${deletedSrv}, IO:${deletedIo}, MF:${deletedMf}, HEADER:${deletedHeader}`
          : "No MSSQL row found for PAT_CD in SRV/IO/MF/header",
    };
  } finally {
    await pool.close();
  }
}

export async function backfillPapatSrvNamesInMssql(limitRaw?: number): Promise<{ updated: number; note?: string }> {
  const enabled = asBool(process.env.MSSQL_PUSH_NEW_PATIENTS_ENABLED, true);
  if (!enabled) return { updated: 0, note: "MSSQL_PUSH_NEW_PATIENTS_ENABLED=false" };

  const limit = Number.isFinite(Number(limitRaw)) && Number(limitRaw) > 0 ? Math.trunc(Number(limitRaw)) : 2000;
  const pool = await createMssqlPool();
  try {
    await pool.connect();
    const cols = await getTableColumns(pool, "op2026.dbo.PAPAT_SRV");
    const canSetNam = cols.has("NAM");
    const canSetPatNmAr = cols.has("PAT_NM_AR");
    if (!canSetNam && !canSetPatNmAr) {
      return { updated: 0, note: "PAPAT_SRV has no NAM/PAT_NM_AR columns" };
    }

    const setParts: string[] = [];
    const missingParts: string[] = [];
    if (canSetNam) {
      setParts.push(`NAM = CASE WHEN ISNULL(CONVERT(nvarchar(255), s.NAM), '') = '' THEN l.H_NAM ELSE s.NAM END`);
      missingParts.push(`ISNULL(CONVERT(nvarchar(255), s.NAM), '') = ''`);
    }
    if (canSetPatNmAr) {
      setParts.push(
        `PAT_NM_AR = CASE WHEN ISNULL(CONVERT(nvarchar(255), s.PAT_NM_AR), '') = '' THEN l.H_NAM ELSE s.PAT_NM_AR END`
      );
      missingParts.push(`ISNULL(CONVERT(nvarchar(255), s.PAT_NM_AR), '') = ''`);
    }

    const req = pool.request();
    req.input("LIM", limit);
    const rs = await req.query(`
      ;WITH latest AS (
        SELECT
          PAT_CD,
          NULLIF(CONVERT(nvarchar(255), NAM), '') AS H_NAM,
          ROW_NUMBER() OVER (
            PARTITION BY PAT_CD
            ORDER BY
              CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END DESC,
              CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END DESC,
              CASE WHEN ISDATE(DT) = 1 THEN CONVERT(datetime, DT) END DESC
          ) AS rn
        FROM op2026.dbo.PAJRNRCVH
        WHERE ISNULL(PAT_CD, '') <> ''
      ),
      candidates AS (
        SELECT DISTINCT TOP (@LIM) s.PAT_CD
        FROM op2026.dbo.PAPAT_SRV s
        INNER JOIN latest l ON l.PAT_CD = s.PAT_CD AND l.rn = 1
        WHERE ISNULL(l.H_NAM, '') <> ''
          AND (${missingParts.join(" OR ")})
        ORDER BY s.PAT_CD
      )
      UPDATE s
      SET ${setParts.join(",\n          ")}
      FROM op2026.dbo.PAPAT_SRV s
      INNER JOIN candidates c ON c.PAT_CD = s.PAT_CD
      INNER JOIN latest l ON l.PAT_CD = s.PAT_CD AND l.rn = 1
      WHERE ISNULL(l.H_NAM, '') <> ''
        AND (${missingParts.join(" OR ")});
    `);

    const updated = Number(Array.isArray(rs?.rowsAffected) ? rs.rowsAffected[0] ?? 0 : 0);
    return { updated };
  } finally {
    await pool.close();
  }
}

function getSyncQuery(
  limit: number,
  incrementalSince?: string,
  includeServiceCode = true,
  includePatientSrvTable = true
): string {
  const configured = String(process.env.MSSQL_PATIENTS_QUERY ?? "").trim();
  if (configured) {
    if (incrementalSince) {
      throw new Error("Incremental sync requires default query mode. Remove MSSQL_PATIENTS_QUERY to use incremental sync.");
    }
    return configured;
  }
  const sinceLiteral = toSqlDateTimeLiteral(String(incrementalSince ?? ""));
  const sinceClause = sinceLiteral
    ? `AND COALESCE(
        CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END,
        CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END,
        CASE WHEN ISDATE(VST_DT) = 1 THEN CONVERT(datetime, VST_DT) END
      ) >= CONVERT(datetime, '${escapeSqlString(sinceLiteral)}')`
    : "";
  return `
    WITH latest AS (
      SELECT
        PAT_CD,
        NAM,
        NAM1,
        NAM2,
        NAM3,
        TEL1,
        ADDRS,
        AGE,
        GNDR,
        IDNO,
        BRNCH,
        PAY,
        DUE,
        ${includeServiceCode ? "SRV_CD," : ""}
        DRS_CD,
        VST_DT,
        ENTRYDATE,
        UPDATEDATE,
        COALESCE(
          CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END,
          CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END,
          CASE WHEN ISDATE(VST_DT) = 1 THEN CONVERT(datetime, VST_DT) END
        ) AS changedAt,
        ROW_NUMBER() OVER (
          PARTITION BY PAT_CD${includeServiceCode ? ", SRV_CD" : ""}
          ORDER BY COALESCE(
            CASE WHEN ISDATE(VST_DT) = 1 THEN CONVERT(datetime, VST_DT) END,
            CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END,
            CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END
          ) DESC, TR_NO DESC
        ) AS rn
      FROM op2026.dbo.PAJRNRCVH
      WHERE ISNULL(PAT_CD, '') <> ''
        AND COALESCE(
          CASE WHEN ISDATE(UPDATEDATE) = 1 THEN CONVERT(datetime, UPDATEDATE) END,
          CASE WHEN ISDATE(ENTRYDATE) = 1 THEN CONVERT(datetime, ENTRYDATE) END,
          CASE WHEN ISDATE(VST_DT) = 1 THEN CONVERT(datetime, VST_DT) END
        ) IS NOT NULL
        ${sinceClause}
    )
    SELECT TOP (${limit})
      PAT_CD AS patientCode,
      COALESCE(
        NULLIF(CONVERT(nvarchar(255), srv.PAT_NM_AR), ''),
        NULLIF(CONVERT(nvarchar(255), srv.PAT_NM_EN), ''),
        NULLIF(CONVERT(nvarchar(255), l.NAM), '')
      ) AS fullName,
      NAM1,
      NAM2,
      NAM3,
      TEL1 AS phone,
      ADDRS AS address,
      AGE AS age,
      GNDR AS gender,
      COALESCE(l.IDNO, receBase.IDNO) AS idno,
      COALESCE(l.IDNO, receBase.IDNO) AS nationalId,
      BRNCH AS branch,
      COALESCE(l.PAY, receBase.PAY) AS paidAmount,
      COALESCE(l.DUE, receBase.DUE) AS dueAmount,
      ${
        includeServiceCode && includePatientSrvTable
          ? "COALESCE(l.SRV_CD, srv.SRV_CD) AS serviceCode,"
          : includeServiceCode
            ? "l.SRV_CD AS serviceCode,"
            : includePatientSrvTable
              ? "srv.SRV_CD AS serviceCode,"
              : ""
      }
      ${includePatientSrvTable ? "srvAll.SRV_CODES AS serviceCodesCsv," : ""}
      COALESCE(
        NULLIF(CONVERT(varchar(100), l.DRS_CD), ''),
        NULLIF(CONVERT(varchar(100), srv.SRV_BY1), ''),
        NULLIF(CONVERT(varchar(100), srv.CUR_SRV_BY), ''),
        NULLIF(CONVERT(varchar(100), srv.PRG_BY), '')
      ) AS doctorCode,
      COALESCE(
        CASE WHEN ISDATE(srv.DT) = 1 THEN CONVERT(datetime, srv.DT) END,
        CASE WHEN ISDATE(l.VST_DT) = 1 THEN CONVERT(datetime, l.VST_DT) END
      ) AS lastVisit,
      srv.PAT_NM_AR AS secondNameAr,
      srv.PAT_NM_EN AS secondNameEn,
      srv.SRV_BY1 AS secondSrvBy1,
      srv.CUR_SRV_BY AS secondCurSrvBy,
      srv.PRG_BY AS secondPrgBy,
      srv.DT AS secondDt,
      srv.TR_NO AS secondTrNo,
      srv.TR_TY AS secondTrTy,
      srv.SEC_CD AS secondSecCd,
      srv.PRG_SNO AS secondPrgSno,
      srv.QTY AS secondQty,
      srv.PRC AS secondPrc,
      srv.DISC_VL AS secondDiscVl,
      srv.PA_VL AS secondPaVl,
      changedAt
    FROM latest l
    OUTER APPLY (
      SELECT TOP 1
        r.IDNO,
        r.PAY,
        r.DUE
      FROM op2026.dbo.PAJRNRCVH r
      WHERE r.PAT_CD = l.PAT_CD
        AND (
          r.IDNO IS NOT NULL
          OR r.PAY IS NOT NULL
          OR r.DUE IS NOT NULL
        )
      ORDER BY
        CASE WHEN ISDATE(r.UPDATEDATE) = 1 THEN CONVERT(datetime, r.UPDATEDATE) END DESC,
        CASE WHEN ISDATE(r.ENTRYDATE) = 1 THEN CONVERT(datetime, r.ENTRYDATE) END DESC,
        CASE WHEN ISDATE(r.VST_DT) = 1 THEN CONVERT(datetime, r.VST_DT) END DESC,
        CASE WHEN ISNUMERIC(CONVERT(varchar(50), r.TR_NO)) = 1 THEN CAST(CONVERT(varchar(50), r.TR_NO) AS INT) END DESC
    ) receBase
    ${
      includePatientSrvTable
        ? `OUTER APPLY (
      SELECT TOP 1
        s.SRV_CD,
        s.PAT_NM_AR,
        s.PAT_NM_EN,
        s.DT,
        s.TR_NO,
        s.TR_TY,
        s.SEC_CD,
        s.PRG_SNO,
        s.SRV_BY1,
        s.CUR_SRV_BY,
        s.PRG_BY,
        s.QTY,
        s.PRC,
        s.DISC_VL,
        s.PA_VL
      FROM op2026.dbo.PAPAT_SRV s
      WHERE s.PAT_CD = l.PAT_CD
        AND ISNULL(s.SRV_CD, '') <> ''
        ${includeServiceCode ? "AND (ISNULL(l.SRV_CD, '') = '' OR s.SRV_CD = l.SRV_CD)" : ""}
      ORDER BY
        CASE WHEN ISNULL(CONVERT(varchar(100), s.SRV_BY1), '') <> '' THEN 0 ELSE 1 END,
        CASE WHEN ISNULL(CONVERT(nvarchar(255), s.PAT_NM_AR), '') <> '' THEN 0 ELSE 1 END,
        CASE WHEN ISDATE(s.UPDATEDATE) = 1 THEN CONVERT(datetime, s.UPDATEDATE) END DESC,
        CASE WHEN ISDATE(s.ENTRYDATE) = 1 THEN CONVERT(datetime, s.ENTRYDATE) END DESC,
        CASE WHEN ISDATE(s.DT) = 1 THEN CONVERT(datetime, s.DT) END DESC,
        CASE WHEN ISNUMERIC(CONVERT(varchar(50), s.TR_NO)) = 1 THEN CAST(CONVERT(varchar(50), s.TR_NO) AS INT) END DESC
    ) srv
    OUTER APPLY (
      SELECT
        STUFF((
          SELECT ',' + CONVERT(varchar(100), x.SRV_CD)
          FROM (
            SELECT DISTINCT s2.SRV_CD
            FROM op2026.dbo.PAPAT_SRV s2
            WHERE s2.PAT_CD = l.PAT_CD
              AND ISNULL(s2.SRV_CD, '') <> ''
          ) x
          FOR XML PATH(''), TYPE
        ).value('.', 'nvarchar(max)'), 1, 1, '') AS SRV_CODES
    ) srvAll`
        : ""
    }
    WHERE rn = 1
    ORDER BY patientCode ASC
  `;
}

async function readSyncState(): Promise<MssqlSyncState> {
  const row = await db.getSystemSetting(MSSQL_SYNC_STATE_KEY);
  if (!row?.value) return {};
  try {
    const parsed = JSON.parse(String(row.value)) as MssqlSyncState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeSyncState(next: MssqlSyncState) {
  await db.updateSystemSettings(MSSQL_SYNC_STATE_KEY, next);
}

async function readRuntimeStatus(): Promise<MssqlSyncRuntimeStatus> {
  const row = await db.getSystemSetting(MSSQL_SYNC_RUNTIME_STATUS_KEY);
  if (!row?.value) return {};
  try {
    const parsed = JSON.parse(String(row.value)) as MssqlSyncRuntimeStatus;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function loadDoctorMapFromCsv(): Promise<Map<string, string>> {
  const now = Date.now();
  if (doctorCsvCache && now - doctorCsvCache.at < 60_000) return doctorCsvCache.map;

  const configured = String(process.env.MSSQL_DOCTOR_MAP_CSV ?? "").trim();
  const csvPath = configured || path.join(process.cwd(), "MD.csv");
  const map = new Map<string, string>();
  try {
    const raw = await fs.readFile(csvPath, "utf8");
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i];
      const split = line.indexOf(";");
      if (split <= 0) continue;
      const code = line.slice(0, split).trim();
      const name = line.slice(split + 1).trim();
      if (!code || !name) continue;
      map.set(code, name);
    }
  } catch {
    // Optional mapping file; continue without doctor names if missing.
  }
  doctorCsvCache = { at: now, map };
  return map;
}

async function loadServiceTypeMap(): Promise<Map<string, "consultant" | "specialist" | "lasik" | "surgery" | "external">> {
  const now = Date.now();
  if (serviceCsvCache && now - serviceCsvCache.at < 60_000) return serviceCsvCache.map;

  const map = new Map<string, "consultant" | "specialist" | "lasik" | "surgery" | "external">();

  try {
    const setting = await db.getSystemSetting("service_directory");
    if (setting?.value) {
      const parsed = JSON.parse(String(setting.value));
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          const code = String((entry as any)?.code ?? "").trim();
          const active = (entry as any)?.isActive !== false;
          const normalized = normalizeServiceType((entry as any)?.serviceType);
          if (code && active && normalized) map.set(code, normalized);
        }
      }
    }
  } catch {
    // Continue with CSV fallback.
  }

  if (map.size === 0) {
    const configured = String(process.env.MSSQL_SERVICE_MAP_CSV ?? "").trim();
    const csvPath = configured || path.join(process.cwd(), "srv.csv");
    try {
      const raw = await fs.readFile(csvPath, "utf8");
      const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      for (let i = 1; i < lines.length; i += 1) {
        const line = lines[i];
        const parts = line.split(";").map((p) => p.trim()).filter(Boolean);
        if (parts.length < 2) continue;
        const code = parts[0];
        const candidate = parts.slice(1).find((value) => Boolean(normalizeServiceType(value)));
        const normalized = normalizeServiceType(candidate);
        if (!code || !normalized) continue;
        map.set(code, normalized);
      }
    } catch {
      // Optional mapping file; continue without service mapping.
    }
  }

  serviceCsvCache = { at: now, map };
  return map;
}

export async function getMssqlSyncStatus() {
  const state = await readSyncState();
  const runtime = await readRuntimeStatus();
  return {
    lastSuccessAt: state.lastSuccessAt ?? null,
    lastMarker: state.lastMarker ?? null,
    lastMode: state.lastMode ?? null,
    lastResult: state.lastResult ?? null,
    running: runtime.running === true,
    lastRunStartedAt: runtime.lastRunStartedAt ?? null,
    lastRunFinishedAt: runtime.lastRunFinishedAt ?? null,
    lastError: runtime.lastError ?? null,
    nextRunAt: runtime.nextRunAt ?? null,
    lastChangeCount:
      Number.isFinite(Number(runtime.lastChangeCount)) ? Number(runtime.lastChangeCount) : null,
  };
}

export async function syncPatientsFromMssql(options: SyncOptions = {}): Promise<SyncResult> {
  const startedAt = new Date().toISOString();
  const dryRun = Boolean(options.dryRun);
  const incremental = Boolean(options.incremental);
  const runtimeRow = await db.getSystemSetting("mssql_sync_runtime_v1").catch(() => null);
  let runtime: Record<string, unknown> = {};
  try {
    runtime = runtimeRow?.value ? (JSON.parse(String(runtimeRow.value)) as Record<string, unknown>) : {};
  } catch {
    runtime = {};
  }
  const updateExisting =
    typeof runtime.overwriteExisting === "boolean"
      ? Boolean(runtime.overwriteExisting)
      : asBool(process.env.MSSQL_SYNC_UPDATE_EXISTING, false);
  const linkServicesForExisting =
    typeof runtime.linkServicesForExisting === "boolean"
      ? Boolean(runtime.linkServicesForExisting)
      : asBool(process.env.MSSQL_SYNC_LINK_SERVICES_FOR_EXISTING, true);
  const preserveManualEdits =
    typeof runtime.preserveManualEdits === "boolean"
      ? Boolean(runtime.preserveManualEdits)
      : asBool(process.env.MSSQL_SYNC_PRESERVE_MANUAL_EDITS, true);
  const limit = Math.max(1, Math.min(20000, Number(options.limit ?? process.env.MSSQL_SYNC_LIMIT ?? 5000)));
  const state = await readSyncState();
  const incrementalSince = incremental ? String(state.lastMarker ?? "").trim() || null : null;
  let query = getSyncQuery(limit, incrementalSince ?? undefined, true, true);
  const result: SyncResult = {
    source: "mssql",
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    dryRun,
    startedAt,
    finishedAt: startedAt,
    query,
    errors: [],
    incremental,
    incrementalSince,
    lastMarker: incrementalSince,
  };

  const pool = await createMssqlPool();

  try {
    const doctorMap = await loadDoctorMapFromCsv();
    const serviceTypeMap = await loadServiceTypeMap();
    await pool.connect();
    let fetched: any;
    try {
      fetched = await pool.request().query(query);
    } catch (error: any) {
      const message = String(error?.message ?? error ?? "");
      if (/Invalid column name\s+'SRV_CD'/i.test(message)) {
        query = getSyncQuery(limit, incrementalSince ?? undefined, false, true);
        result.query = query;
        result.errors.push("SRV_CD column not found in PAJRNRCVH. Continued sync without serviceCode.");
        fetched = await pool.request().query(query);
      } else if (/Invalid object name\s+'[^']*PAPAT_SRV'|Invalid column name\s+'PAT_CD'|Invalid column name\s+'SRV_CD'/i.test(message)) {
        query = getSyncQuery(limit, incrementalSince ?? undefined, true, false);
        result.query = query;
        result.errors.push("PAPAT_SRV source not available. Continued sync with PAJRNRCVH only.");
        fetched = await pool.request().query(query);
      } else {
        throw error;
      }
    }
    const rows = Array.isArray(fetched?.recordset) ? fetched.recordset : [];
    result.fetched = rows.length;
    const mergedByPatient = new Map<string, Record<string, any>>();
    for (const raw of rows) {
      const source = (raw ?? {}) as Record<string, any>;
      const patientCode = pick(source, ["patientCode", "PAT_CD", "code", "patient_id"]);
      if (!patientCode) continue;
      const existing = mergedByPatient.get(patientCode);
      if (!existing) {
        const seed = { ...source } as Record<string, any>;
        const serviceCode = pick(source, ["serviceCode", "SRV_CD", "srv_cd"]);
        const serviceCodesCsv = pick(source, ["serviceCodesCsv", "SRV_CODES", "srv_codes"]);
        const seedCodes = new Set<string>();
        if (serviceCode) seedCodes.add(serviceCode);
        if (serviceCodesCsv) {
          for (const code of serviceCodesCsv.split(",").map((v) => String(v ?? "").trim()).filter(Boolean)) {
            seedCodes.add(code);
          }
        }
        seed.__mergedServiceCodes = Array.from(seedCodes);
        mergedByPatient.set(patientCode, seed);
        continue;
      }
      for (const [key, value] of Object.entries(source)) {
        if (!shouldIncludeColumnForMerge(key)) continue;
        if (isBlank(existing[key]) && !isBlank(value)) {
          existing[key] = value;
        }
      }
      const currentChangedAt = normalizeIsoDateTime(existing.changedAt ?? existing.UPDATEDATE ?? existing.ENTRYDATE ?? existing.VST_DT);
      const nextChangedAt = normalizeIsoDateTime(source.changedAt ?? source.UPDATEDATE ?? source.ENTRYDATE ?? source.VST_DT);
      if (nextChangedAt && (!currentChangedAt || nextChangedAt > currentChangedAt)) {
        existing.changedAt = source.changedAt ?? source.UPDATEDATE ?? source.ENTRYDATE ?? source.VST_DT;
      }
      const mergedCodes = new Set<string>(
        Array.isArray(existing.__mergedServiceCodes)
          ? existing.__mergedServiceCodes.map((v: unknown) => String(v ?? "").trim()).filter(Boolean)
          : []
      );
      const serviceCode = pick(source, ["serviceCode", "SRV_CD", "srv_cd"]);
      const serviceCodesCsv = pick(source, ["serviceCodesCsv", "SRV_CODES", "srv_codes"]);
      if (serviceCode) mergedCodes.add(serviceCode);
      if (serviceCodesCsv) {
        for (const code of serviceCodesCsv.split(",").map((v) => String(v ?? "").trim()).filter(Boolean)) {
          mergedCodes.add(code);
        }
      }
      existing.__mergedServiceCodes = Array.from(mergedCodes);
    }
    const rowsToProcess = Array.from(mergedByPatient.values()).map((source) => {
      const mergedCodes = Array.isArray(source.__mergedServiceCodes)
        ? source.__mergedServiceCodes.map((v: unknown) => String(v ?? "").trim()).filter(Boolean)
        : [];
      const next = { ...source } as Record<string, any>;
      if (mergedCodes.length > 0) {
        next.serviceCodesCsv = mergedCodes.join(",");
        if (isBlank(next.serviceCode) && isBlank(next.SRV_CD)) {
          next.serviceCode = mergedCodes[0];
        }
      }
      delete next.__mergedServiceCodes;
      return next;
    });
    let maxMarker = incrementalSince;

    for (const row of rowsToProcess) {
      try {
        const source = row as Record<string, any>;
        const backfillFields = buildMssqlBackfillObject(source);
        const changedAt = normalizeIsoDateTime(source.changedAt ?? source.UPDATEDATE ?? source.ENTRYDATE ?? source.VST_DT);
        if (changedAt && (!maxMarker || changedAt > maxMarker)) {
          maxMarker = changedAt;
        }
        const patientCode = pick(source, ["patientCode", "PAT_CD", "code", "patient_id"]);
        const fullName = pick(source, ["fullName", "NAM", "NAM1", "NAM2", "NAM3", "name", "patientName"]);
        if (!patientCode || !fullName) {
          result.skipped += 1;
          continue;
        }

        const payload: Record<string, any> = {
          patientCode,
          fullName,
        };

        const phone = pick(source, ["phone", "TEL1", "mobile", "phoneNumber"]);
        if (phone) payload.phone = phone;
        const alternatePhone = pick(source, ["alternatePhone", "phone2", "secondaryPhone"]);
        if (alternatePhone) payload.alternatePhone = alternatePhone;
        const address = pick(source, ["address", "ADDRS"]);
        if (address) payload.address = address;
        const occupation = pick(source, ["occupation", "job"]);
        if (occupation) payload.occupation = occupation;
        const nationalId = normalizeNationalId(
          pick(source, ["nationalId", "nid", "national_id"])
        );
        if (nationalId) payload.nationalId = nationalId;
        const referralSource = pick(source, ["referralSource", "referral"]);
        if (referralSource) payload.referralSource = referralSource;

        const dob = normalizeIsoDate(source.dateOfBirth ?? source.DT ?? source.BDT ?? source.dob ?? source.birthDate);
        if (dob) payload.dateOfBirth = dob;
        const lastVisit = normalizeIsoDate(source.lastVisit ?? source.VST_DT ?? source.last_visit ?? source.visitDate);
        if (lastVisit) payload.lastVisit = lastVisit;
        const ageNum = Number(source.age ?? source.AGE);
        if (Number.isFinite(ageNum) && ageNum > 0) payload.age = Math.trunc(ageNum);

        const gender = normalizeGender(source.gender ?? source.GNDR);
        if (gender) payload.gender = gender;

        const branch = normalizeBranch(source.branch ?? source.BRNCH);
        if (branch) payload.branch = branch;
        const serviceCode = pick(source, ["serviceCode", "SRV_CD", "srv_cd"]);
        const serviceCodesCsv = pick(source, ["serviceCodesCsv", "SRV_CODES", "srv_codes"]);
        const sourceServiceCodes = serviceCodesCsv
          .split(",")
          .map((v) => String(v ?? "").trim())
          .filter(Boolean);
        const incomingServiceCodes = Array.from(new Set([serviceCode, ...sourceServiceCodes].filter(Boolean)));
        const primaryServiceCode = serviceCode || incomingServiceCodes[0] || "";
        if (primaryServiceCode) payload.serviceCode = primaryServiceCode;
        if (incomingServiceCodes.length > 0) payload.serviceCodes = incomingServiceCodes;
        const receiptRef = pick(source, ["TR_NO", "INV_NO", "CAINV_NO", "tr_noNew", "KSH_NO"]);
        const serviceType =
          normalizeServiceType(source.serviceType ?? source.serviceName) ||
          (primaryServiceCode ? serviceTypeMap.get(primaryServiceCode) : undefined);
        if (serviceType) payload.serviceType = serviceType;
        let locationType =
          normalizeLocationTypeFromIdNo(source.idno ?? source.IDNO) ??
          normalizeLocationType(source.locationType);
        if (!locationType && serviceType === "external") locationType = "external";
        if (locationType) payload.locationType = locationType;
        const doctorCode = pick(source, ["doctorCode", "DRS_CD", "SRV_BY1", "CUR_SRV_BY", "PRG_BY", "DR_CD"]);
        const doctorNameFromRow = pick(source, ["DOC_NAME", "DOC_NAM", "doctorName"]);
        const doctorName = doctorNameFromRow || (doctorCode ? (doctorMap.get(doctorCode) ?? "") : "");
        if (doctorName) {
          payload.treatingDoctor = doctorName;
        } else if (doctorCode) {
          payload.treatingDoctor = String(doctorCode);
        }

        const existing = await db.getPatientByCode(patientCode);
        let targetPatientId = Number(existing?.id ?? 0);
        let manualLockEnabled = false;
        let existingExamStateData: Record<string, any> | null = null;
        if (existing) {
          if (targetPatientId > 0 && preserveManualEdits) {
            const existingState = await db.getPatientPageState(targetPatientId, "examination").catch(() => null);
            existingExamStateData =
              existingState && typeof (existingState as any).data === "object" && (existingState as any).data
                ? ((existingState as any).data as Record<string, any>)
                : null;
            manualLockEnabled = Boolean(
              existingExamStateData?.syncLockManual === true || String(existingExamStateData?.manualEditedAt ?? "").trim()
            );
          }
          if (!updateExisting) {
            if (!dryRun && linkServicesForExisting && targetPatientId > 0 && incomingServiceCodes.length > 0) {
              const existingState = await db.getPatientPageState(targetPatientId, "examination");
              const existingData =
                existingState && typeof (existingState as any).data === "object" && (existingState as any).data
                  ? ((existingState as any).data as Record<string, any>)
                  : {};
              const existingServiceCode = String(existingData.serviceCode ?? "").trim();
              const existingServiceCodesRaw = Array.isArray((existingData as any).serviceCodes)
                ? (existingData as any).serviceCodes
                : [];
              const existingServiceCodes = existingServiceCodesRaw
                .map((v: unknown) => String(v ?? "").trim())
                .filter(Boolean);
              const mergedServiceCodes = Array.from(new Set([...existingServiceCodes, existingServiceCode, ...incomingServiceCodes].filter(Boolean)));
              const nextServiceCode = !existingServiceCode ? primaryServiceCode : "";
              const changed =
                Boolean(nextServiceCode) || mergedServiceCodes.length !== existingServiceCodes.length;
              if (changed) {
                await db.upsertPatientPageState(targetPatientId, "examination", {
                  ...existingData,
                  ...(nextServiceCode ? { serviceCode: nextServiceCode } : {}),
                  ...(mergedServiceCodes.length > 0 ? { serviceCodes: mergedServiceCodes } : {}),
                });
                result.updated += 1;
              } else {
                result.skipped += 1;
              }
            } else {
              result.skipped += 1;
            }
            continue;
          }
          if (!dryRun) {
            if (!manualLockEnabled) {
              const nextUpdates: Record<string, any> = {};
              const existingRow = existing as Record<string, any>;
              const copyIfMissing = (key: string) => {
                if (isBlank(payload[key])) return;
                if (isBlank(existingRow[key])) nextUpdates[key] = payload[key];
              };
              // Never overwrite user-edited patient fields; only backfill empty values.
              copyIfMissing("fullName");
              copyIfMissing("phone");
              copyIfMissing("alternatePhone");
              copyIfMissing("address");
              copyIfMissing("occupation");
              copyIfMissing("nationalId");
              copyIfMissing("referralSource");
              copyIfMissing("dateOfBirth");
              copyIfMissing("age");
              copyIfMissing("gender");
              copyIfMissing("branch");
              copyIfMissing("serviceType");
              copyIfMissing("locationType");
              copyIfMissing("treatingDoctor");
              // Keep doctor aligned with MSSQL treating doctor when sync is allowed.
              if (!isBlank(payload.treatingDoctor)) {
                const incomingDoctor = String(payload.treatingDoctor).trim();
                const currentDoctor = String((existing as any).treatingDoctor ?? "").trim();
                if (incomingDoctor && incomingDoctor !== currentDoctor) {
                  nextUpdates.treatingDoctor = incomingDoctor;
                }
              }
              if (!isBlank(payload.lastVisit)) {
                const incoming = new Date(String(payload.lastVisit));
                const current = new Date(String((existing as any).lastVisit ?? ""));
                if (
                  Number.isNaN(current.valueOf()) ||
                  (!Number.isNaN(incoming.valueOf()) && incoming.valueOf() > current.valueOf())
                ) {
                  nextUpdates.lastVisit = payload.lastVisit;
                }
              }
              if (Object.keys(nextUpdates).length > 0) {
                await db.updatePatient(Number(existing.id), nextUpdates);
              }
            }
          }
          result.updated += 1;
        } else {
          const createPayload = {
            ...payload,
            branch: payload.branch ?? "examinations",
            serviceType: payload.serviceType ?? "consultant",
            locationType: payload.locationType ?? "center",
            status: "new",
            lastVisit: payload.lastVisit ?? new Date().toISOString().slice(0, 10),
          };
          if (!dryRun) {
            await db.createPatient(createPayload);
            const created = await db.getPatientByCode(patientCode);
            targetPatientId = Number(created?.id ?? 0);
          }
          result.inserted += 1;
        }
        if (!dryRun && targetPatientId > 0 && (doctorName || doctorCode || incomingServiceCodes.length > 0) && !manualLockEnabled) {
          const existingState = await db.getPatientPageState(targetPatientId, "examination");
          const existingData =
            existingState && typeof (existingState as any).data === "object" && (existingState as any).data
              ? ((existingState as any).data as Record<string, any>)
              : {};
          const existingBackfill =
            existingData.mssqlBackfill && typeof existingData.mssqlBackfill === "object"
              ? (existingData.mssqlBackfill as Record<string, any>)
              : {};
          const mergedBackfill: Record<string, any> = { ...existingBackfill };
          let backfillChanged = false;
          for (const [k, v] of Object.entries(backfillFields)) {
            if (isBlank(mergedBackfill[k]) && !isBlank(v)) {
              mergedBackfill[k] = v;
              backfillChanged = true;
            }
          }
          const existingDoctorName = String(
            existingData.doctorName ?? existingData.signatures?.doctor ?? ""
          ).trim();
          const existingDoctorCode = String(existingData.doctorCode ?? "").trim();
          const existingServiceCode = String(existingData.serviceCode ?? "").trim();
          const existingServiceCodesRaw = Array.isArray((existingData as any).serviceCodes)
            ? (existingData as any).serviceCodes
            : [];
          const existingServiceCodes = existingServiceCodesRaw
            .map((v: unknown) => String(v ?? "").trim())
            .filter(Boolean);
          const nextDoctorName =
            doctorName && doctorName !== existingDoctorName ? doctorName : "";
          const nextDoctorCode =
            doctorCode && doctorCode !== existingDoctorCode ? doctorCode : "";
          const nextServiceCode = !existingServiceCode ? primaryServiceCode : "";
          const mergedServiceCodes = Array.from(new Set([...existingServiceCodes, existingServiceCode, ...incomingServiceCodes].filter(Boolean)));
          if (
            !nextDoctorName &&
            !nextDoctorCode &&
            !nextServiceCode &&
            mergedServiceCodes.length === existingServiceCodes.length &&
            !backfillChanged
          ) {
            continue;
          }
          await db.upsertPatientPageState(targetPatientId, "examination", {
            ...existingData,
            ...(nextDoctorName ? { doctorName: nextDoctorName } : {}),
            ...(nextDoctorCode ? { doctorCode: nextDoctorCode } : {}),
            ...(nextServiceCode ? { serviceCode: nextServiceCode } : {}),
            ...(mergedServiceCodes.length > 0 ? { serviceCodes: mergedServiceCodes } : {}),
            ...(backfillChanged ? { mssqlBackfill: mergedBackfill } : {}),
            signatures: {
              ...(existingData.signatures ?? {}),
              ...(nextDoctorName ? { doctor: nextDoctorName } : {}),
            },
          });
        }
        if (!dryRun && targetPatientId > 0 && incomingServiceCodes.length > 0) {
          for (const code of incomingServiceCodes) {
            const sourceRef = `mssql:${patientCode}:${code}:${receiptRef || changedAt || "row"}`;
            await db.upsertPatientServiceEntry({
              patientId: targetPatientId,
              serviceCode: code,
              source: "mssql",
              sourceRef,
              serviceDate: lastVisit || undefined,
            });
          }
        }
      } catch (error: any) {
        result.skipped += 1;
        result.errors.push(String(error?.message ?? error ?? "Unknown row error"));
      }
    }
    if (!dryRun && linkServicesForExisting) {
      try {
        const servicesQuery = `
          SELECT TOP (${limit})
            PAT_CD AS patientCode,
            SRV_CD AS serviceCode
          FROM op2026.dbo.PAPAT_SRV
          WHERE ISNULL(PAT_CD, '') <> ''
            AND ISNULL(SRV_CD, '') <> ''
          ORDER BY PAT_CD ASC
        `;
        const serviceRowsResult = await pool.request().query(servicesQuery);
        const serviceRows = Array.isArray(serviceRowsResult?.recordset) ? serviceRowsResult.recordset : [];
        for (const srvRow of serviceRows) {
          const row = srvRow as Record<string, any>;
          const patientCode = pick(row, ["patientCode", "PAT_CD", "pat_cd"]);
          const serviceCode = pick(row, ["serviceCode", "SRV_CD", "srv_cd"]);
          if (!patientCode || !serviceCode) continue;
          const existing = await db.getPatientByCode(patientCode);
          const targetPatientId = Number(existing?.id ?? 0);
          if (targetPatientId <= 0) continue;
          const existingState = await db.getPatientPageState(targetPatientId, "examination");
          const existingData =
            existingState && typeof (existingState as any).data === "object" && (existingState as any).data
              ? ((existingState as any).data as Record<string, any>)
              : {};
          const existingServiceCode = String(existingData.serviceCode ?? "").trim();
          const existingServiceCodesRaw = Array.isArray((existingData as any).serviceCodes)
            ? (existingData as any).serviceCodes
            : [];
          const existingServiceCodes = existingServiceCodesRaw
            .map((v: unknown) => String(v ?? "").trim())
            .filter(Boolean);
          const mergedServiceCodes = Array.from(
            new Set([
              ...existingServiceCodes,
              existingServiceCode,
              String(serviceCode ?? "").trim(),
            ].filter(Boolean))
          );
          const nextServiceCode = !existingServiceCode ? String(serviceCode ?? "").trim() : "";
          const changed =
            Boolean(nextServiceCode) || mergedServiceCodes.length !== existingServiceCodes.length;
          if (!changed) continue;
          await db.upsertPatientPageState(targetPatientId, "examination", {
            ...existingData,
            ...(nextServiceCode ? { serviceCode: nextServiceCode } : {}),
            ...(mergedServiceCodes.length > 0 ? { serviceCodes: mergedServiceCodes } : {}),
          });
          await db.upsertPatientServiceEntry({
            patientId: targetPatientId,
            serviceCode: String(serviceCode ?? "").trim(),
            source: "mssql",
            sourceRef: `mssql:PAPAT_SRV:${patientCode}:${serviceCode}`,
          });
          result.updated += 1;
        }
      } catch (error: any) {
        const message = String(error?.message ?? error ?? "");
        if (/Invalid object name\s+'[^']*PAPAT_SRV'|Invalid column name\s+'PAT_CD'|Invalid column name\s+'SRV_CD'/i.test(message)) {
          result.errors.push("PAPAT_SRV direct pass unavailable. Skipped global service-link pass.");
        } else {
          result.errors.push(`PAPAT_SRV direct pass failed: ${message}`);
        }
      }
    }
    result.lastMarker = maxMarker ?? null;
    if (!dryRun) {
      await writeSyncState({
        lastSuccessAt: new Date().toISOString(),
        lastMarker: result.lastMarker ?? undefined,
        lastMode: incremental ? "incremental" : "full",
        lastResult: {
          fetched: result.fetched,
          inserted: result.inserted,
          updated: result.updated,
          skipped: result.skipped,
          dryRun: false,
        },
      });
    }
  } finally {
    result.finishedAt = new Date().toISOString();
    await pool.close();
  }

  return result;
}
