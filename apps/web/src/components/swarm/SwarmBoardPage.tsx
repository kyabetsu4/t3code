import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import {
  ArrowUpRightIcon,
  BotIcon,
  CpuIcon,
  GitBranchIcon,
  Link2Icon,
  MessageSquarePlusIcon,
  NetworkIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
  SendIcon,
  SkullIcon,
  Trash2Icon,
} from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { environmentThreadShells } from "~/state/threads";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { SidebarInset } from "~/components/ui/sidebar";
import { Textarea } from "~/components/ui/textarea";
import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem } from "~/components/WorkspaceBreadcrumb";
import { WorkspacePageHeader } from "~/components/WorkspacePageHeader";
import {
  addSwarmWorker,
  killSwarmWorker,
  linkSwarmWorkerThread,
  postSwarmMessage,
  removeSwarmWorker,
  resetDemoSwarmBoard,
  setSwarmTitle,
  setSwarmWorkerStatus,
  useSwarmBoard,
  type LinkedThreadRef,
  type SwarmMessageKind,
  type SwarmWorker,
  type SwarmWorkerStatus,
  type SwarmWorkspaceMode,
} from "./swarmBoardStore";

const STATUS_ORDER: ReadonlyArray<SwarmWorkerStatus> = ["working", "waiting", "stopped", "killed"];

function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  return `${diffHours}h ago`;
}

function statusBadgeVariant(
  status: SwarmWorkerStatus,
): "success" | "warning" | "secondary" | "destructive" {
  switch (status) {
    case "working":
      return "success";
    case "waiting":
      return "warning";
    case "stopped":
      return "secondary";
    case "killed":
      return "destructive";
  }
}

function messageKindVariant(kind: SwarmMessageKind): "info" | "success" | "secondary" | "outline" {
  switch (kind) {
    case "brief":
      return "info";
    case "handoff":
      return "success";
    case "system":
      return "outline";
    case "update":
      return "secondary";
  }
}

function renderMessageBody(body: string) {
  const nodes: Array<ReactNode> = [];
  const regex = /(@[a-z0-9_-]+)/gi;
  let lastIndex = 0;
  for (const match of body.matchAll(regex)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      nodes.push(<span key={`text-${lastIndex}`}>{body.slice(lastIndex, start)}</span>);
    }
    const token = match[0];
    nodes.push(
      <span
        key={`mention-${start}-${token}`}
        className="rounded bg-primary/15 px-1 py-0.5 font-mono text-xs font-medium text-primary"
      >
        {token}
      </span>,
    );
    lastIndex = start + token.length;
  }
  if (lastIndex < body.length) {
    nodes.push(<span key={`text-${lastIndex}`}>{body.slice(lastIndex)}</span>);
  }
  return nodes;
}

export function SwarmBoardPage() {
  const gt = useGT();
  const navigate = useNavigate();
  const board = useSwarmBoard();
  const threadShells = useAtomValue(environmentThreadShells.threadShellsAtom);

  const [statusFilter, setStatusFilter] = useState<SwarmWorkerStatus | "all">("all");
  const [sender, setSender] = useState("coordinator");
  const [composerBody, setComposerBody] = useState("");
  const [composerKind, setComposerKind] = useState<SwarmMessageKind>("update");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(board.title);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [workerName, setWorkerName] = useState("");
  const [workerRole, setWorkerRole] = useState("");
  const [workerBrief, setWorkerBrief] = useState("");
  const [workerModel, setWorkerModel] = useState("inherit");
  const [workerWorkspace, setWorkerWorkspace] = useState<SwarmWorkspaceMode>("inherit");
  const [workerThreadKey, setWorkerThreadKey] = useState("");

  const threadMap = new Map<string, (typeof threadShells)[number]>();
  for (const thread of threadShells) {
    threadMap.set(`${thread.environmentId}:${thread.id}`, thread);
  }

  const counts: Record<SwarmWorkerStatus, number> = {
    working: 0,
    waiting: 0,
    stopped: 0,
    killed: 0,
  };
  for (const worker of board.workers) {
    counts[worker.status] += 1;
  }

  const filteredWorkers =
    statusFilter === "all" ? board.workers : board.workers.filter((w) => w.status === statusFilter);
  const visibleWorkers = [...filteredWorkers].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
  );

  const activeWorkers = board.workers.filter((w) => w.status !== "killed");

  const handleOpenAddDialog = () => {
    setWorkerName("");
    setWorkerRole("");
    setWorkerBrief("");
    setWorkerModel("inherit");
    setWorkerWorkspace("inherit");
    setWorkerThreadKey("");
    setAddDialogOpen(true);
  };

  const handleCreateWorker = (event: FormEvent) => {
    event.preventDefault();
    if (!workerName.trim()) return;
    let linkedThreadRef: LinkedThreadRef | null = null;
    if (workerThreadKey) {
      const [environmentId, threadId] = workerThreadKey.split(":");
      if (environmentId && threadId) {
        linkedThreadRef = { environmentId, threadId };
      }
    }
    addSwarmWorker({
      name: workerName,
      role: workerRole,
      brief: workerBrief,
      model: workerModel,
      workspaceMode: workerWorkspace,
      linkedThreadRef,
    });
    setAddDialogOpen(false);
  };

  const handleSendMessage = () => {
    if (!composerBody.trim()) return;
    postSwarmMessage({
      sender,
      body: composerBody,
      kind: composerKind,
    });
    setComposerBody("");
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const handleMentionWorker = (name: string) => {
    const token = `@${name} `;
    setComposerBody((prev) =>
      prev.includes(token) ? prev : `${prev}${prev && !prev.endsWith(" ") ? " " : ""}${token}`,
    );
  };

  const handleSaveTitle = () => {
    setSwarmTitle(titleDraft);
    setEditingTitle(false);
  };

  const handleOpenThread = (ref: LinkedThreadRef) => {
    void navigate({
      to: "/$environmentId/$threadId",
      params: {
        environmentId: ref.environmentId,
        threadId: ref.threadId,
      },
    });
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div className="flex min-h-0 flex-1 flex-col bg-background">
        <WorkspacePageHeader electron={isElectron} className="relative bg-background">
          <WorkspaceBreadcrumb ariaLabel={gt("Swarm board breadcrumb")}>
            <WorkspaceBreadcrumbItem current>
              <div className="flex items-center gap-2">
                <NetworkIcon className="size-4 text-primary" />
                {editingTitle ? (
                  <form
                    className="flex items-center gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSaveTitle();
                    }}
                  >
                    <Input
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      onBlur={handleSaveTitle}
                      className="h-7 w-48"
                      autoFocus
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setTitleDraft(board.title);
                      setEditingTitle(true);
                    }}
                    className="truncate text-left font-medium hover:underline"
                    aria-label={gt("Rename swarm")}
                  >
                    {board.title}
                  </button>
                )}
              </div>
            </WorkspaceBreadcrumbItem>
          </WorkspaceBreadcrumb>

          <div className="hidden items-center gap-1.5 md:flex">
            <Badge variant="success" size="sm">
              {counts.working} {gt("working")}
            </Badge>
            <Badge variant="warning" size="sm">
              {counts.waiting} {gt("waiting")}
            </Badge>
            {counts.stopped > 0 ? (
              <Badge variant="secondary" size="sm">
                {counts.stopped} {gt("stopped")}
              </Badge>
            ) : null}
          </div>

          <div className="min-w-0 flex-1" />

          <div className="flex items-center gap-1.5 [-webkit-app-region:no-drag]">
            <Button size="sm" variant="outline" onClick={resetDemoSwarmBoard}>
              <RotateCcwIcon className="size-3.5" />
              <span className="hidden sm:inline">
                <T>Reset</T>
              </span>
            </Button>
            <Button size="sm" onClick={handleOpenAddDialog}>
              <PlusIcon className="size-3.5" />
              <span>
                <T>Add Worker</T>
              </span>
            </Button>
          </div>
        </WorkspacePageHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-border lg:grid-cols-[minmax(320px,420px)_1fr] lg:divide-x lg:divide-y-0">
          {/* Left column: Swarm Roster */}
          <section className="flex min-h-0 flex-col bg-muted/20">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <div className="flex items-center gap-2">
                <BotIcon className="size-4 text-muted-foreground" />
                <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  <T>Roster</T> ({board.workers.length})
                </h2>
              </div>
              <div className="flex items-center gap-1">
                {(["all", "working", "waiting", "stopped"] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setStatusFilter(filter)}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-xs font-medium capitalize transition-colors",
                      statusFilter === filter
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {filter === "all"
                      ? gt("All")
                      : filter === "working"
                        ? gt("Working")
                        : filter === "waiting"
                          ? gt("Waiting")
                          : gt("Stopped")}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
              {visibleWorkers.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center">
                  <BotIcon className="mb-2 size-6 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">
                    <T>No workers in this view</T>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <T>Add a worker to assign tasks on the shared board.</T>
                  </p>
                </div>
              ) : (
                visibleWorkers.map((worker) => (
                  <WorkerCard
                    key={worker.id}
                    worker={worker}
                    linkedThreadTitle={
                      worker.linkedThreadRef
                        ? (threadMap.get(
                            `${worker.linkedThreadRef.environmentId}:${worker.linkedThreadRef.threadId}`,
                          )?.title ?? null)
                        : null
                    }
                    availableThreads={threadShells}
                    onMention={() => handleMentionWorker(worker.name)}
                    onToggleStatus={() =>
                      setSwarmWorkerStatus(
                        worker.id,
                        worker.status === "working" ? "waiting" : "working",
                      )
                    }
                    onKill={() => killSwarmWorker(worker.id)}
                    onRemove={() => removeSwarmWorker(worker.id)}
                    onOpenThread={handleOpenThread}
                    onLinkThread={(ref) => linkSwarmWorkerThread(worker.id, ref)}
                  />
                ))
              )}
            </div>
          </section>

          {/* Right column: Shared Message Board */}
          <section className="flex min-h-0 flex-col bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div className="flex items-center gap-2">
                <MessageSquarePlusIcon className="size-4 text-muted-foreground" />
                <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  <T>Shared Message Board</T>
                </h2>
              </div>
              <span className="text-xs text-muted-foreground">
                {board.messages.length} {gt("posts")}
              </span>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {board.messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <p className="text-sm font-medium text-foreground">
                    <T>The board is empty</T>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <T>Post a brief or @mention a worker below to kick off the swarm.</T>
                  </p>
                </div>
              ) : (
                board.messages.map((message) => (
                  <article
                    key={message.id}
                    className={cn(
                      "rounded-lg border p-3 transition-colors",
                      message.kind === "system"
                        ? "border-border/60 bg-muted/30"
                        : "border-border bg-card",
                    )}
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {message.sender === "coordinator"
                          ? gt("coordinator")
                          : message.sender === "system"
                            ? gt("system")
                            : `@${message.sender}`}
                      </span>
                      <Badge variant={messageKindVariant(message.kind)} size="sm">
                        {message.kind}
                      </Badge>
                      <span className="ml-auto text-2xs text-muted-foreground">
                        {formatRelativeTime(message.createdAt)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                      {renderMessageBody(message.body)}
                    </p>
                  </article>
                ))
              )}
            </div>

            {/* Board Composer */}
            <div className="border-t border-border bg-muted/15 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">
                  <T>Post as:</T>
                </span>
                <select
                  aria-label={gt("Message sender")}
                  value={sender}
                  onChange={(e) => setSender(e.target.value)}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground"
                >
                  <option value="coordinator">{gt("coordinator")}</option>
                  {activeWorkers.map((w) => (
                    <option key={w.id} value={w.name}>
                      @{w.name}
                    </option>
                  ))}
                </select>

                <select
                  aria-label={gt("Message kind")}
                  value={composerKind}
                  onChange={(e) => setComposerKind(e.target.value as SwarmMessageKind)}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                >
                  <option value="brief">{gt("brief")}</option>
                  <option value="update">{gt("update")}</option>
                  <option value="handoff">{gt("handoff")}</option>
                </select>

                <div className="ml-auto flex flex-wrap items-center gap-1">
                  {activeWorkers.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => handleMentionWorker(w.name)}
                      className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-2xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                    >
                      @{w.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-end gap-2">
                <Textarea
                  value={composerBody}
                  onChange={(e) => setComposerBody(e.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={gt("Post a brief or @mention a worker (Ctrl+Enter to send)...")}
                  className="min-h-16 flex-1 resize-none"
                />
                <Button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={!composerBody.trim()}
                  className="shrink-0"
                >
                  <SendIcon className="size-3.5" />
                  <span>
                    <T>Post</T>
                  </span>
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Add Worker Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateWorker}>
            <DialogHeader>
              <DialogTitle>
                <T>Add Swarm Worker</T>
              </DialogTitle>
              <DialogDescription>
                <T>Spawn a worker on the board and post its initial @mention brief.</T>
              </DialogDescription>
            </DialogHeader>

            <div className="my-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="swarm-worker-name">
                    <T>Roster Name</T>
                  </Label>
                  <Input
                    id="swarm-worker-name"
                    value={workerName}
                    onChange={(e) => setWorkerName(e.target.value)}
                    placeholder={gt("e.g. reviewer")}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="swarm-worker-role">
                    <T>Role</T>
                  </Label>
                  <Input
                    id="swarm-worker-role"
                    value={workerRole}
                    onChange={(e) => setWorkerRole(e.target.value)}
                    placeholder={gt("e.g. Code Reviewer")}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="swarm-worker-brief">
                  <T>Brief</T>
                </Label>
                <Textarea
                  id="swarm-worker-brief"
                  value={workerBrief}
                  onChange={(e) => setWorkerBrief(e.target.value)}
                  placeholder={gt("What this worker owns and what done looks like...")}
                  className="min-h-18"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="swarm-worker-model">
                    <T>Model</T>
                  </Label>
                  <Input
                    id="swarm-worker-model"
                    value={workerModel}
                    onChange={(e) => setWorkerModel(e.target.value)}
                    placeholder="inherit"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="swarm-worker-workspace">
                    <T>Workspace</T>
                  </Label>
                  <select
                    id="swarm-worker-workspace"
                    value={workerWorkspace}
                    onChange={(e) => setWorkerWorkspace(e.target.value as SwarmWorkspaceMode)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  >
                    <option value="inherit">inherit</option>
                    <option value="share">share</option>
                    <option value="branch">branch</option>
                  </select>
                </div>
              </div>

              {threadShells.length > 0 ? (
                <div className="space-y-1.5">
                  <Label htmlFor="swarm-worker-thread">
                    <T>Link T3 Thread (optional)</T>
                  </Label>
                  <select
                    id="swarm-worker-thread"
                    value={workerThreadKey}
                    onChange={(e) => setWorkerThreadKey(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  >
                    <option value="">{gt("None")}</option>
                    {threadShells.map((thread) => (
                      <option
                        key={`${thread.environmentId}:${thread.id}`}
                        value={`${thread.environmentId}:${thread.id}`}
                      >
                        {thread.title}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
                <T>Cancel</T>
              </Button>
              <Button type="submit" disabled={!workerName.trim()}>
                <T>Spawn Worker</T>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SidebarInset>
  );
}

function WorkerCard({
  worker,
  linkedThreadTitle,
  availableThreads,
  onMention,
  onToggleStatus,
  onKill,
  onRemove,
  onOpenThread,
  onLinkThread,
}: {
  readonly worker: SwarmWorker;
  readonly linkedThreadTitle: string | null;
  readonly availableThreads: ReadonlyArray<{
    readonly environmentId: string;
    readonly id: string;
    readonly title: string;
  }>;
  readonly onMention: () => void;
  readonly onToggleStatus: () => void;
  readonly onKill: () => void;
  readonly onRemove: () => void;
  readonly onOpenThread: (ref: LinkedThreadRef) => void;
  readonly onLinkThread: (ref: LinkedThreadRef | null) => void;
}) {
  const gt = useGT();
  const [linking, setLinking] = useState(false);

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-3 shadow-xs transition-colors",
        worker.status === "killed" && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                worker.status === "working" && "animate-pulse bg-success",
                worker.status === "waiting" && "bg-warning",
                worker.status === "stopped" && "bg-muted-foreground",
                worker.status === "killed" && "bg-destructive",
              )}
            />
            <span className="truncate font-mono text-sm font-semibold text-foreground">
              @{worker.name}
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">{worker.role}</p>
        </div>
        <Badge variant={statusBadgeVariant(worker.status)} size="sm">
          {worker.status}
        </Badge>
      </div>

      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-foreground/80">{worker.brief}</p>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono">
          <CpuIcon className="size-3" />
          {worker.model}
        </span>
        <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono">
          <GitBranchIcon className="size-3" />
          {worker.workspaceMode}
        </span>
        {worker.linkedThreadRef ? (
          <button
            type="button"
            onClick={() => worker.linkedThreadRef && onOpenThread(worker.linkedThreadRef)}
            className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-primary hover:bg-primary/20"
          >
            <ArrowUpRightIcon className="size-3" />
            <span className="max-w-36 truncate">{linkedThreadTitle ?? gt("Open thread")}</span>
          </button>
        ) : null}
      </div>

      {linking && availableThreads.length > 0 ? (
        <div className="mt-2">
          <select
            aria-label={gt("Select thread to link")}
            value={
              worker.linkedThreadRef
                ? `${worker.linkedThreadRef.environmentId}:${worker.linkedThreadRef.threadId}`
                : ""
            }
            onChange={(e) => {
              const val = e.target.value;
              if (!val) {
                onLinkThread(null);
              } else {
                const [environmentId, threadId] = val.split(":");
                if (environmentId && threadId) {
                  onLinkThread({ environmentId, threadId });
                }
              }
              setLinking(false);
            }}
            className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
          >
            <option value="">{gt("Unlinked")}</option>
            {availableThreads.map((t) => (
              <option key={`${t.environmentId}:${t.id}`} value={`${t.environmentId}:${t.id}`}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-1 border-t border-border/60 pt-2">
        {worker.status !== "killed" ? (
          <>
            <Button type="button" size="xs" variant="ghost" onClick={onMention}>
              <span>@</span>
              <span>
                <T>Mention</T>
              </span>
            </Button>
            <Button type="button" size="xs" variant="ghost" onClick={onToggleStatus}>
              {worker.status === "working" ? (
                <>
                  <PauseIcon className="size-3" />
                  <span>
                    <T>Wait</T>
                  </span>
                </>
              ) : (
                <>
                  <PlayIcon className="size-3" />
                  <span>
                    <T>Wake</T>
                  </span>
                </>
              )}
            </Button>
            {availableThreads.length > 0 ? (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => setLinking((prev) => !prev)}
              >
                <Link2Icon className="size-3" />
                <span>
                  <T>Link</T>
                </span>
              </Button>
            ) : null}
            <Button
              type="button"
              size="xs"
              variant="ghost-destructive"
              className="ml-auto"
              onClick={onKill}
              aria-label={gt("Kill worker")}
            >
              <SkullIcon className="size-3" />
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="xs"
            variant="ghost-muted"
            className="ml-auto"
            onClick={onRemove}
          >
            <Trash2Icon className="size-3" />
            <span>
              <T>Remove</T>
            </span>
          </Button>
        )}
      </div>
    </div>
  );
}
