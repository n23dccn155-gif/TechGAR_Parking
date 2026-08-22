import { test } from "vitest";
import { LANE_GRAPH } from "./routing/laneGraph";
import { PARKING_GEOMETRY } from "./geometry/parkingGeometry";
import fs from "fs";

test("dump graph", () => {
  const data = {
    ...LANE_GRAPH,
    spots: PARKING_GEOMETRY.spots
  };
  fs.writeFileSync("graph.json", JSON.stringify(data, null, 2));
});
