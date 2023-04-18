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

        for (const source of Object.values(
          build.input.pgRegistry.pgResources
        )) {
          if (
            source.parameters ||
            !source.codec.attributes ||
            source.isUnique
          ) {
            continue;
          }
          const behavior = build.pgGetBehavior([
            source.codec.extensions,
            source.extensions,
          ]);
          if (!build.behavior.matches(behavior, "select", "select")) {
            continue;
          }
          if (!build.behavior.matches(behavior, "order", "order")) {
            continue;
          }

          const tableTypeName = inflection.tableType(source.codec);
          /* const TableGroupByType = */
          build.registerEnumType(
            inflection.aggregateGroupByType({ resource: source }),
            {
              pgTypeResource: source,
              isPgAggregateGroupEnum: true,
            },
            () => ({
              name: inflection.aggregateGroupByType({ resource: source }),
              description: build.wrapDescription(
                `Grouping methods for \`${tableTypeName}\` for usage during aggregation.`,
                "type"
              ),
              values: {
                /* no default values, these will be added via hooks */
              },
            }),
            `Adding connection "groupBy" enum type for ${source.name}.`
          );
        }
        return _;
      },
    },
  },
};

export { Plugin as PgAggregatesAddGroupByAggregateEnumsPlugin };
