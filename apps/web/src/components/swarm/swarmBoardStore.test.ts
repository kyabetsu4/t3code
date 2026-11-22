import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  addSwarmWorker,
  clearSwarmBoard,
  getSwarmBoardSnapshot,
  killSwarmWorker,
  parseMentions,
  postSwarmMessage,
  setSwarmTitle,
  setSwarmWorkerStatus,
} from "./swarmBoardStore";

describe("swarmBoardStore", () => {
  beforeEach(() => {
    clearSwarmBoard();
  });

  it("parses unique lowercase @mentions", () => {
    expect(parseMentions("@Explorer check @builder-1 and @explorer again")).toEqual([
      "explorer",
      "builder-1",
    ]);
  });

  it("adds a worker, posts its brief, and wakes waiting workers on @mention", () => {
    setSwarmTitle("Auth Refactor Swarm");
    addSwarmWorker({
      name: "reviewer",
      role: "Code Reviewer",
      brief: "Audit auth middleware",
      workspaceMode: "share",
    });

    let state = getSwarmBoardSnapshot();
    expect(state.title).toBe("Auth Refactor Swarm");
    expect(state.workers).toHaveLength(1);
    const worker = state.workers[0]!;
    expect(worker.name).toBe("reviewer");
    expect(worker.status).toBe("working");
    expect(worker.workspaceMode).toBe("share");
    expect(state.messages[0]?.mentions).toEqual(["reviewer"]);

    setSwarmWorkerStatus(worker.id, "waiting");
    state = getSwarmBoardSnapshot();
    expect(state.workers[0]?.status).toBe("waiting");

    postSwarmMessage({
      sender: "coordinator",
      body: "@reviewer please re-check the updated PR",
      kind: "handoff",
    });
    state = getSwarmBoardSnapshot();
    expect(state.workers[0]?.status).toBe("working");

    killSwarmWorker(worker.id);
    state = getSwarmBoardSnapshot();
    expect(state.workers[0]?.status).toBe("killed");
  });
});
