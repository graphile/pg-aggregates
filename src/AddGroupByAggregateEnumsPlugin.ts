import type { Plugin } from "graphile-build";
import type { PgClass } from "graphile-build-pg";

const AddGroupByAggregateEnumsPlugin: Plugin = (builder) => {
  // Create the group by enums for each table
  builder.hook(
    "init",
    (_, build) => {
      const {
        newWithHooks,
        pgIntrospectionResultsByKind: introspectionResultsByKind,
        graphql: { GraphQLEnumType },
        inflection,
        pgOmit: omit,
        sqlCommentByAddingTags,
        describePgEntity,
      } = build;
      introspectionResultsByKind.class.forEach((table: PgClass) => {
        if (!table.isSelectable || omit(table, "order")) return;
        if (!table.namespace) return;

        const tableTypeName = inflection.tableType(table);
        /* const TableGroupByType = */
        newWithHooks(
          GraphQLEnumType,
          {
            name: inflection.aggregateGroupByType(table),
            description: build.wrapDescription(
              `Grouping methods for \`${tableTypeName}\` for usage during aggregation.`,
              "type"
            ),
            values: {
              /* no default values, these will be added via hooks */
            },
          },
          {
            __origin: `Adding connection "groupBy" enum type for ${describePgEntity(
              table
            )}. You can rename the table's GraphQL type via a 'Smart Comment':\n\n  ${sqlCommentByAddingTags(
              table,
              {
                name: "newNameHere",
              }
            )}`,
            pgIntrospection: table,
            isPgAggregateGroupEnum: true,
          },
          true /* ignore type if no values */
        );
      });
      return _;
    },
    ["AddGroupByAggregateEnumsPlugin"]
  );
};

export default AddGroupByAggregateEnumsPlugin;
