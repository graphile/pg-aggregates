import { postgraphilePresetAmber } from "postgraphile/presets/amber";
import { PostGraphileConnectionFilterPreset } from "postgraphile-plugin-connection-filter";
import { PgAggregatesPreset } from "./dist/index.js";
import { makePgService } from "@dataplan/pg/adaptors/pg";

/** @type {GraphileConfig.Preset} */
const preset = {
  extends: [
    postgraphilePresetAmber,
    PostGraphileConnectionFilterPreset,
    PgAggregatesPreset,
  ],
  pgServices: [
    makePgService({
      connectionString: "graphile_aggregates",
      schemas: ["test"],
    }),
  ],
  grafast: {
    explain: true,
  },
};

export default preset;
