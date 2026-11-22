import { msg } from "gt-react";
import { useSyncExternalStore } from "react";

import { m } from "~/i18n/messages";

export type SwarmWorkerStatus = "working" | "waiting" | "stopped" | "killed";
export type SwarmWorkspaceMode = "inherit" | "share" | "branch";
export type SwarmMessageKind = "brief" | "update" | "handoff" | "system";

export interface LinkedThreadRef {
  readonly environmentId: string;
  readonly threadId: string;
}

export interface SwarmWorker {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly brief: string;
  readonly model: string;
  readonly workspaceMode: SwarmWorkspaceMode;
  readonly status: SwarmWorkerStatus;
  readonly linkedThreadRef: LinkedThreadRef | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface SwarmMessage {
  readonly id: string;
  readonly sender: string;
  readonly body: string;
  readonly mentions: ReadonlyArray<string>;
  readonly kind: SwarmMessageKind;
  readonly createdAt: number;
}

export interface SwarmBoardState {
  readonly title: string;
  readonly workers: ReadonlyArray<SwarmWorker>;
  readonly messages: ReadonlyArray<SwarmMessage>;
}

const STORAGE_KEY = "t3code:swarm-board:v1";

function createInitialState(): SwarmBoardState {
  const now = Date.now();
  return {
    title: m(msg("Feature Swarm")),
    workers: [
      {
        id: "worker-explorer",
        name: "explorer",
        role: "Codebase Explorer",
        brief: "Map out existing routes, state atoms, and UI primitives.",
        model: "inherit",
        workspaceMode: "inherit",
        status: "waiting",
        linkedThreadRef: null,
        createdAt: now - 180_000,
        updatedAt: now - 120_000,
      },
      {
        id: "worker-builder-1",
        name: "builder-1",
        role: "UI Implementer",
        brief: "Implement the feature components in an isolated workspace share.",
        model: "inherit",
        workspaceMode: "share",
        status: "working",
        linkedThreadRef: null,
        createdAt: now - 150_000,
        updatedAt: now - 30_000,
      },
      {
        id: "worker-verifier",
        name: "verifier",
        role: "Test & Typecheck Verifier",
        brief: "Run typecheck and tests after builder-1 reports ready.",
        model: "inherit",
        workspaceMode: "inherit",
        status: "waiting",
        linkedThreadRef: null,
        createdAt: now - 140_000,
        updatedAt: now - 90_000,
      },
    ],
    messages: [
      {
        id: "msg-1",
        sender: "coordinator",
        body: "@explorer Map the target files and state hooks, then post your findings for @builder-1.",
        mentions: ["explorer", "builder-1"],
        kind: "brief",
        createdAt: now - 175_000,
      },
      {
        id: "msg-2",
        sender: "explorer",
        body: "Findings posted: routes live under apps/web/src/routes and state atoms under apps/web/src/state. @builder-1 ready for implementation.",
        mentions: ["builder-1"],
        kind: "handoff",
        createdAt: now - 120_000,
      },
      {
        id: "msg-3",
        sender: "builder-1",
        body: "Working in shared workspace copy. Building the main board layout and roster controls.",
        mentions: [],
        kind: "update",
        createdAt: now - 30_000,
      },
    ],
  };
}

function loadState(): SwarmBoardState {
  if (typeof window === "undefined") {
    return createInitialState();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as Partial<SwarmBoardState>;
    if (
      typeof parsed.title === "string" &&
      Array.isArray(parsed.workers) &&
      Array.isArray(parsed.messages)
    ) {
      return {
        title: parsed.title,
        workers: parsed.workers,
        messages: parsed.messages,
      };
    }
  } catch {
    // Ignore malformed persisted state and fall back to default.
  }
  return createInitialState();
}

let currentState: SwarmBoardState = loadState();
const listeners = new Set<() => void>();

function emit(next: SwarmBoardState) {
  currentState = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota/storage errors.
    }
  }
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SwarmBoardState {
  return currentState;
}

export function parseMentions(body: string): Array<string> {
  const seen = new Set<string>();
  const matches = body.matchAll(/@([a-z0-9_-]+)/gi);
  for (const match of matches) {
    const token = match[1]?.toLowerCase();
    if (token) seen.add(token);
  }
  return Array.from(seen);
}

function normalizeWorkerName(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || `worker-${Math.random().toString(36).slice(2, 6)}`;
}

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function setSwarmTitle(title: string) {
  const trimmed = title.trim();
  if (!trimmed || trimmed === currentState.title) return;
  emit({
    ...currentState,
    title: trimmed,
  });
}

export function addSwarmWorker(input: {
  readonly name: string;
  readonly role: string;
  readonly brief: string;
  readonly model?: string;
  readonly workspaceMode?: SwarmWorkspaceMode;
  readonly linkedThreadRef?: LinkedThreadRef | null;
}) {
  const now = Date.now();
  const baseName = normalizeWorkerName(input.name);
  const existingNames = new Set(currentState.workers.map((w) => w.name));
  let finalName = baseName;
  let suffix = 2;
  while (existingNames.has(finalName)) {
    finalName = `${baseName}-${suffix}`;
    suffix += 1;
  }

  const worker: SwarmWorker = {
    id: uniqueId("worker"),
    name: finalName,
    role: input.role.trim() || "Swarm Worker",
    brief: input.brief.trim() || "Assigned to swarm.",
    model: input.model?.trim() || "inherit",
    workspaceMode: input.workspaceMode ?? "inherit",
    status: "working",
    linkedThreadRef: input.linkedThreadRef ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const briefMessage: SwarmMessage = {
    id: uniqueId("msg"),
    sender: "coordinator",
    body: `@${worker.name} ${worker.brief}`,
    mentions: [worker.name],
    kind: "brief",
    createdAt: now,
  };

  emit({
    ...currentState,
    workers: [...currentState.workers, worker],
    messages: [...currentState.messages, briefMessage],
  });
}

export function setSwarmWorkerStatus(workerId: string, status: SwarmWorkerStatus) {
  const now = Date.now();
  const target = currentState.workers.find((w) => w.id === workerId);
  if (!target || target.status === status) return;

  const workers = currentState.workers.map((w) =>
    w.id === workerId ? { ...w, status, updatedAt: now } : w,
  );
  const systemMessage: SwarmMessage = {
    id: uniqueId("msg"),
    sender: "system",
    body: `@${target.name} state changed to ${status}.`,
    mentions: [target.name],
    kind: "system",
    createdAt: now,
  };

  emit({
    ...currentState,
    workers,
    messages: [...currentState.messages, systemMessage],
  });
}

export function linkSwarmWorkerThread(workerId: string, linkedThreadRef: LinkedThreadRef | null) {
  const now = Date.now();
  emit({
    ...currentState,
    workers: currentState.workers.map((w) =>
      w.id === workerId ? { ...w, linkedThreadRef, updatedAt: now } : w,
    ),
  });
}

export function killSwarmWorker(workerId: string) {
  setSwarmWorkerStatus(workerId, "killed");
}

export function removeSwarmWorker(workerId: string) {
  emit({
    ...currentState,
    workers: currentState.workers.filter((w) => w.id !== workerId),
  });
}

export function postSwarmMessage(input: {
  readonly sender: string;
  readonly body: string;
  readonly kind?: SwarmMessageKind;
}) {
  const body = input.body.trim();
  if (!body) return;
  const now = Date.now();
  const mentions = parseMentions(body);
  const mentionSet = new Set(mentions);

  // Posting a message that @mentions a waiting or stopped worker wakes it up.
  const workers = currentState.workers.map((worker) => {
    if (
      mentionSet.has(worker.name) &&
      (worker.status === "waiting" || worker.status === "stopped")
    ) {
      return { ...worker, status: "working" as const, updatedAt: now };
    }
    return worker;
  });

  const message: SwarmMessage = {
    id: uniqueId("msg"),
    sender: input.sender.trim() || "coordinator",
    body,
    mentions,
    kind: input.kind ?? "update",
    createdAt: now,
  };

  emit({
    ...currentState,
    workers,
    messages: [...currentState.messages, message],
  });
}

export function clearSwarmBoard() {
  emit({
    title: m(msg("New Swarm")),
    workers: [],
    messages: [],
  });
}

export function resetDemoSwarmBoard() {
  emit(createInitialState());
}

export function getSwarmBoardSnapshot(): SwarmBoardState {
  return currentState;
}

export function useSwarmBoard(): SwarmBoardState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
