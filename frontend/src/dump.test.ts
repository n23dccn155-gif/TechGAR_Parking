import { test } from "vitest";
import { LANE_GRAPH } from "./routing/laneGraph";
import { PARKING_GEOMETRY } from "./geometry/parkingGeometry";
import fs from "fs";
import os from "os";
import path from "path";
import { expect } from "vitest";

test("dump graph", () => {
  const data = {
    ...LANE_GRAPH,
    spots: PARKING_GEOMETRY.spots
  };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "techgar-graph-test-"));
  const output = path.join(directory, "graph.json");
  try {
    fs.writeFileSync(output, JSON.stringify(data, null, 2));
    expect(JSON.parse(fs.readFileSync(output, "utf8")).spots).toHaveLength(PARKING_GEOMETRY.spots.length);
  } finally {
    fs.unlinkSync(output);
    fs.rmdirSync(directory);
  }
});
