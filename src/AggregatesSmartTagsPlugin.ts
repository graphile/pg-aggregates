import "graphile-config";

import { gatherConfig } from "graphile-build";
import { addBehaviorToTags } from "graphile-build-pg";

// @ts-ignore
const { version } = require("../package.json");

declare global {
  namespace GraphileConfig {
    interface GatherHelpers {
      pgV4AggregatesSmartTags: Record<string, never>;
    }
  }
}

const EMPTY_OBJECT = Object.freeze({});

export const PgAggregatesSmartTagsPlugin: GraphileConfig.Plugin = {
  name: "PgAggregatesSmartTagsPlugin",
  description:
    "For compatibility with PostGraphile v4 schemas, this plugin attempts to convert `@aggregates` V4 smart tags to V5 behaviors",
  version,
  before: [
    "PgAggregatesAddAggregateTypesPlugin",
    "PgAggregatesFilterRelationalAggregatesPlugin",
    "PgAggregatesOrderByAggregatesPlugin",
  ],
  provides: ["smart-tags"],

  gather: gatherConfig({
    namespace: "pgV4AggregatesSmartTags",
    initialCache() {
      return EMPTY_OBJECT;
    },
    initialState() {
      return EMPTY_OBJECT;
    },
    helpers: {},
    hooks: {
      // Run in the 'introspection' phase before anything uses the tags
      pgIntrospection_introspection(info, event) {
        for (const pgClass of event.introspection.classes) {
          processTags(pgClass.getTags());
        }
      },
    },
  }),
};

function processTags(
  tags: Partial<GraphileBuild.PgSmartTagsDict> | undefined,
): void {
  switch (tags?.aggregates) {
    case "on":
      addBehaviorToTags(tags, "+aggregates +aggregates:filterBy +aggregates:orderBy");
      break;
    case "off":
      addBehaviorToTags(tags, "-aggregates -aggregates:filterBy -aggregates:orderBy");
      break;
  }
}
