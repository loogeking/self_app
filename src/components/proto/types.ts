export type Space = {
  id: string;
  name: string;
  color: string;
  description: string;
  deadline?: string;
};

export type NodeState = "empty" | "marked" | "noted";

export type KNode = {
  id: string;
  spaceId: string;
  parentId: string | null;
  title: string;
  state: NodeState;
  notes: number;
  lastAt?: string;
  source?: string;
  summary?: string;
  custom?: boolean;
};

export type DocKind = "pdf" | "md" | "image" | "review";

export type Doc = {
  id: string;
  spaceId: string;
  nodeId?: string;
  title: string;
  kind: DocKind;
  summary: string;
  body?: string;
  pages?: number;
  size?: string;
  mime?: string;
  fileKey?: string;
  fileName?: string;
  updatedAt: string;
  tags?: string[];
};

export type PlanStatus = "todo" | "doing" | "done" | "partial" | "shelved";

export type PlanItem = {
  id: string;
  spaceId: string;
  nodeId?: string;
  title: string;
  scope: string;
  basis: string;
  priority: 1 | 2 | 3;
  deadline?: string;
  status: PlanStatus;
  goalAmount?: number;
  doneAmount?: number;
  unit?: string;
  progressNote?: string;
  deferredFrom?: string;
  deferredTo?: string;
  deferReason?: string;
  updatedAt?: string;
};

export type SessionCat = "study" | "plan" | "leisure" | "other";

export type Session = {
  id: string;
  date: string;
  start: string;
  minutes: number;
  task: string;
  cat: SessionCat;
  spaceId?: string;
  nodeId?: string;
  note?: string;
  source?: "seed" | "pomodoro" | "manual";
  importedAt?: string;
};

export type ImportBatch = {
  id: string;
  fileName: string;
  importedAt: string;
  rows: number;
  duplicates: number;
  from: string;
  to: string;
};

export type TaskRoute = {
  cat: SessionCat;
  spaceId?: string;
  nodeId?: string;
};

export type DailyReview = {
  date: string;
  text: string;
  tags: string[];
  savedAt?: string;
};

export type AiProvider = "deepseek" | "openai" | "custom";

export type AiConfig = {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
};

export type Profile = {
  goal: string;
  examDate: string;
  weak: string;
  busy: string;
  availableDays: string;
};

export type Prefs = {
  weekStart: "monday" | "sunday";
  reviewDay: string;
  reviewTime: string;
  planMap: Record<string, SessionCat>;
  taskRoutes?: Record<string, TaskRoute>;
};

export type AppData = {
  spaces: Space[];
  nodes: KNode[];
  docs: Doc[];
  plans: PlanItem[];
  sessions: Session[];
  reviews: DailyReview[];
  profile: Profile;
  prefs: Prefs;
  imports?: ImportBatch[];
  ai?: AiConfig;
};

export type View = "today" | "map" | "plan" | "library" | "review" | "settings";
