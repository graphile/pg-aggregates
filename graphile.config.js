// @ts-check
const { PostGraphileAmberPreset } = require("postgraphile/presets/amber");
const {
  PostGraphileConnectionFilterPreset,
} = require("postgraphile-plugin-connection-filter");
const { PgAggregatesPreset } = require("./dist/index.js");
const { makePgService } = require("@dataplan/pg/adaptors/pg");

/** @type {GraphileConfig.Preset} */
const preset = {
  extends: [
    PostGraphileAmberPreset,
    PostGraphileConnectionFilterPreset,
    PgAggregatesPreset,
  ],
  disablePlugins: ["PgIndexBehaviorsPlugin"],
  pgServices: [
    makePgService({
      connectionString: "postgres:///graphile_aggregates",
      schemas: ["test"],
    }),
  ],
  schema: {
    connectionFilterRelations: true,
  },
  grafast: {
    explain: true,
  },
};

// export default preset;
module.exports = preset;
