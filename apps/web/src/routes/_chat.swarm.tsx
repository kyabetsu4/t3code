import { createFileRoute } from "@tanstack/react-router";

import { SwarmBoardPage } from "../components/swarm/SwarmBoardPage";

export const Route = createFileRoute("/_chat/swarm")({
  component: SwarmBoardPage,
});
