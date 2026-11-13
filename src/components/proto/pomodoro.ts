import type { Session } from "./types";

export type ParsedPomodoroRow = {
  id: string;
  date: string;
  start: string;
  minutes: number;
  task: string;
  note?: string;
  status?: string;
  completion?: string;
};

export type ParsePomodoroResult = {
  fileName: string;
  rows: ParsedPomodoroRow[];
  headers: string[];
  skipped: number;
  declared: {
    range?: string;
    count?: number;
    durationText?: string;
    minutes?: number;
  };
  totalMinutes: number;
};

type CellValue = { index: number; text: string };

const HEADER_MAP = {
  start: ["专注时间", "开始时间", "开始日期", "日期"],
  task: ["待办名称", "待办", "任务", "事项"],
  minutes: ["专注时长", "时长", "用时"],
  note: ["心得", "备注", "备注说明"],
  status: ["状态"],
  completion: ["完成度", "完成情况"],
};

function normalizeHeader(value: string): string {
  return value.replace(/[\s\u3000:：]+/g, "").trim();
}

function findColumn(cells: CellValue[], names: string[]): number {
  return (
    cells.find((cell) => {
      const header = normalizeHeader(cell.text);
      return names.some((name) => header.includes(name));
    })?.index ?? -1
  );
}

function getAttribute(element: Element, localName: string): string {
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.localName === localName) return attribute.value;
  }
  return "";
}

function cellsOf(row: Element): CellValue[] {
  const cells: CellValue[] = [];
  let index = 0;
  for (const cell of Array.from(row.children)) {
    if (cell.localName !== "Cell") continue;
    const indexed = Number(getAttribute(cell, "Index"));
    if (indexed > 0) index = indexed - 1;
    const data = Array.from(cell.children).find((child) => child.localName === "Data");
    cells.push({ index, text: (data?.textContent ?? cell.textContent ?? "").trim() });
    index += 1;
  }
  return cells;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parseExcelStart(raw: string): { date: string; start: string } | null {
  const value = raw.trim();
  if (!value) return null;

  if (/^\d+(\.\d+)?$/.test(value)) {
    const serial = Number(value);
    if (serial > 20000 && serial < 80000) {
      const millis = Date.UTC(1899, 11, 30) + Math.round(serial * 86400000);
      const date = new Date(millis);
      return {
        date: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
        start: `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`,
      };
    }
  }

  const normalized = value
    .replace(/[年/.]/g, "-")
    .replace(/[月]/g, "-")
    .replace(/[日]/g, "")
    .replace("T", " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return {
    date: `${year}-${pad(Number(month))}-${pad(Number(day))}`,
    start: `${pad(Number(hour ?? 0))}:${pad(Number(minute ?? 0))}`,
  };
}

function parseDurationText(text: string): number | undefined {
  const hour = text.match(/(\d+)\s*(?:小时|h)/i);
  const minute = text.match(/(\d+)\s*(?:分钟|分|min)/i);
  if (!hour && !minute) return undefined;
  return (hour ? Number(hour[1]) * 60 : 0) + (minute ? Number(minute[1]) : 0);
}

function shortHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 33) ^ value.charCodeAt(i);
  return (hash >>> 0).toString(36);
}

export function pomodoroKey(row: Pick<ParsedPomodoroRow, "date" | "start" | "task">): string {
  return `${row.date}|${row.start}|${row.task.trim()}`;
}

export function parsePomodoroSpreadsheetXml(xml: string, fileName = "番茄Todo导出.xls"): ParsePomodoroResult {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length) {
    throw new Error("文件不是有效的 XML，请确认是番茄Todo导出的 .xls");
  }
  const rows = Array.from(document.getElementsByTagName("*")).filter((element) => element.localName === "Row");
  if (!rows.length) throw new Error("文件里没有表格行，可能是空的导出文件。");

  // 番茄Todo 的实际导出前面有标题、导出范围等行，不能假设第一行是表头。
  let headerIndex = -1;
  let headerCells: CellValue[] = [];
  for (let index = 0; index < Math.min(rows.length, 30); index += 1) {
    const cells = cellsOf(rows[index]);
    if (!cells.length) continue;
    if (
      findColumn(cells, HEADER_MAP.task) >= 0 &&
      findColumn(cells, HEADER_MAP.minutes) >= 0 &&
      findColumn(cells, HEADER_MAP.start) >= 0
    ) {
      headerIndex = index;
      headerCells = cells;
      break;
    }
  }
  if (headerIndex < 0) {
    throw new Error("找不到表头：需要「专注时间 / 待办名称 / 专注时长」列。");
  }

  const headers = headerCells.map((cell) => cell.text).filter(Boolean);
  const startColumn = findColumn(headerCells, HEADER_MAP.start);
  const taskColumn = findColumn(headerCells, HEADER_MAP.task);
  const minuteColumn = findColumn(headerCells, HEADER_MAP.minutes);
  const noteColumn = findColumn(headerCells, HEADER_MAP.note);
  const statusColumn = findColumn(headerCells, HEADER_MAP.status);
  const completionColumn = findColumn(headerCells, HEADER_MAP.completion);

  const declared: ParsePomodoroResult["declared"] = {};
  for (const row of rows.slice(0, headerIndex)) {
    for (const cell of cellsOf(row)) {
      const text = cell.text.replace(/\s+/g, " ").trim();
      if (!text) continue;
      const range = text.match(/导出范围[:：]\s*(.+)$/);
      if (range) declared.range = range[1].trim();
      const count = text.match(/共\s*(\d+)\s*条记录/);
      if (count) declared.count = Number(count[1]);
      const duration = text.match(/时长共计([^（(]+)/);
      if (duration) {
        declared.durationText = duration[1].trim();
        declared.minutes = parseDurationText(declared.durationText);
      }
    }
  }

  const parsed: ParsedPomodoroRow[] = [];
  let skipped = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    const cells = cellsOf(row);
    if (!cells.length) continue;
    const at = (index: number) => (index >= 0 ? cells.find((cell) => cell.index === index)?.text ?? "" : "");
    const startValue = parseExcelStart(at(startColumn));
    const task = at(taskColumn).replace(/\s+/g, " ").trim();
    const minutes = Math.max(0, Math.round(Number(at(minuteColumn).replace(/[^\d.-]/g, "")) || 0));
    if (!startValue || !task) {
      skipped += 1;
      continue;
    }
    const date = startValue.date;
    const start = startValue.start;
    const note = at(noteColumn).trim();
    parsed.push({
      id: `pom-${date.replaceAll("-", "")}-${start.replace(":", "")}-${shortHash(pomodoroKey({ date, start, task }))}`,
      date,
      start,
      minutes,
      task,
      note: note || undefined,
      status: at(statusColumn) || undefined,
      completion: at(completionColumn) || undefined,
    });
  }

  if (!parsed.length) throw new Error("没有解析到有效记录：专注时间或待办名称为空。");
  return {
    fileName,
    rows: parsed,
    headers,
    skipped,
    declared,
    totalMinutes: parsed.reduce((total, row) => total + row.minutes, 0),
  };
}

export function classifyPomodoroTask(
  task: string,
  routes: Record<string, { cat: Session["cat"]; spaceId?: string; nodeId?: string }>,
): { cat: Session["cat"]; spaceId?: string; nodeId?: string } {
  if (routes[task]) return routes[task];
  const matched = Object.keys(routes)
    .filter((key) => key && task.includes(key))
    .sort((a, b) => b.length - a.length)[0];
  if (matched) return routes[matched];
  if (/学习计划|计划|复盘|整理/.test(task)) return { cat: "plan" };
  if (/cs|游戏|娱乐|视频|刷/.test(task)) return { cat: "leisure" };
  return { cat: "other" };
}

export function toSession(row: ParsedPomodoroRow, route: ReturnType<typeof classifyPomodoroTask>, importedAt: string): Session {
  return {
    id: row.id,
    date: row.date,
    start: row.start,
    minutes: row.minutes,
    task: row.task,
    cat: route.cat,
    spaceId: route.spaceId,
    nodeId: route.nodeId,
    note: row.note,
    source: "pomodoro",
    importedAt,
  };
}