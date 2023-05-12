const { version } = require("../package.json");

const Plugin: GraphileConfig.Plugin = {
  name: "PgAggregatesAddGroupByAggregateEnumsPlugin",
  version,
  provides: ["aggregates"],

  schema: {
    hooks: {
      // Create the group by enums for each table
      init(_, build) {
        const { inflection } = build;

        for (const resource of Object.values(
          build.input.pgRegistry.pgResources
        )) {
          if (
            resource.parameters ||
            !resource.codec.attributes ||
            resource.isUnique
          ) {
            continue;
          }
          const behavior = build.pgGetBehavior([
            resource.codec.extensions,
            resource.extensions,
          ]);
          if (!build.behavior.matches(behavior, "select", "select")) {
            continue;
          }
          if (!build.behavior.matches(behavior, "order", "order")) {
            continue;
          }

          const tableTypeName = inflection.tableType(resource.codec);
          /* const TableGroupByType = */
          build.registerEnumType(
            inflection.aggregateGroupByType({ resource }),
            {
              pgTypeResource: resource,
              isPgAggregateGroupEnum: true,
            },
            () => ({
              name: inflection.aggregateGroupByType({ resource }),
              description: build.wrapDescription(
                `Grouping methods for \`${tableTypeName}\` for usage during aggregation.`,
                "type"
              ),
              values: {
                /* no default values, these will be added via hooks */
              },
            }),
            `Adding connection "groupBy" enum type for ${resource.name}.`
          );
        }
        return _;
      },
    },
  },
};

export { Plugin as PgAggregatesAddGroupByAggregateEnumsPlugin };
