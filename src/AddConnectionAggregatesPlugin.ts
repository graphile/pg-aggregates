import type { GraphQLObjectType } from "graphql";

import { EXPORTABLE } from "./EXPORTABLE.js";

const { version } = require("../package.json");

const Plugin: GraphileConfig.Plugin = {
  name: "PgAggregatesAddConnectionAggregatesPlugin",
  description: "Adds the `aggregates` field to connections.",
  version,
  provides: ["aggregates"],

  schema: {
    hooks: {
      // Hook all connections to add the 'aggregates' field
      GraphQLObjectType_fields(fields, build, context) {
        const { inflection } = build;
        const {
          fieldWithHooks,
          scope: {
            pgCodec,
            pgTypeResource,
            isConnectionType,
            isPgConnectionRelated,
          },
        } = context;

        const table =
          pgTypeResource ??
          Object.values(build.input.pgRegistry.pgResources).find(
            (s) => s.codec === pgCodec && !s.parameters
          );

        // If it's not a table connection, abort
        if (
          !isConnectionType ||
          !isPgConnectionRelated ||
          !table ||
          table.parameters ||
          !table.codec.attributes
        ) {
          return fields;
        }

        if (!build.behavior.pgResourceMatches(table, `resource:aggregates`)) {
          return fields;
        }

        const AggregateContainerType = build.getTypeByName(
          inflection.aggregateContainerType({ resource: table })
        ) as GraphQLObjectType | undefined;

        if (
          !AggregateContainerType ||
          Object.keys(AggregateContainerType.getFields()).length === 0
        ) {
          // No aggregates for this connection, abort
          return fields;
        }

        const fieldName = inflection.aggregatesContainerField({
          resource: table,
        });
        return {
          ...fields,
          [fieldName]: fieldWithHooks({ fieldName }, () => {
            return {
              description: `Aggregates across the matching connection (ignoring before/after/first/last/offset)`,
              type: AggregateContainerType,
              plan: EXPORTABLE(
                () =>
                  function plan($connection) {
                    return $connection
                      .cloneSubplanWithoutPagination("aggregate")
                      .single();
                  },
                []
              ),
            };
          }),
        };
      },
    },
  },
};

export { Plugin as PgAggregatesAddConnectionAggregatesPlugin };
