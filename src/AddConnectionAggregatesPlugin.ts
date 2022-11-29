import { PgSelectStep } from "@dataplan/pg";
import { ConnectionStep } from "grafast";
import type { GraphQLResolveInfo, GraphQLObjectType } from "graphql";

const { version } = require("../package.json");

const Plugin: GraphileConfig.Plugin = {
  name: "PgAggregatesAddConnectionAggregatesPlugin",
  version,

  schema: {
    hooks: {
      // Hook all connections to add the 'aggregates' field
      GraphQLObjectType_fields(fields, build, context) {
        const { inflection, sql } = build;
        const {
          fieldWithHooks,
          scope: {
            pgCodec,
            pgTypeSource,
            isConnectionType,
            isPgConnectionRelated,
          },
        } = context;

        const table =
          pgTypeSource ??
          build.input.pgSources.find(
            (s) => s.codec === pgCodec && !s.parameters
          );

        // If it's not a table connection, abort
        if (
          !isConnectionType ||
          !isPgConnectionRelated ||
          !table ||
          table.parameters ||
          !table.codec.columns
        ) {
          return fields;
        }

        const AggregateContainerType = build.getTypeByName(
          inflection.aggregateContainerType({ source: table })
        ) as GraphQLObjectType | undefined;

        if (
          !AggregateContainerType ||
          Object.keys(AggregateContainerType.getFields()).length === 0
        ) {
          // No aggregates for this connection, abort
          return fields;
        }

        const fieldName = inflection.aggregatesContainerField({
          source: table,
        });
        return {
          ...fields,
          [fieldName]: fieldWithHooks({ fieldName }, () => {
            return {
              description: `Aggregates across the matching connection (ignoring before/after/first/last/offset)`,
              type: AggregateContainerType,
              plan($connection) {
                return $connection
                  .cloneSubplanWithoutPagination("aggregate")
                  .single();
              },
            };
          }),
        };
      },
    },
  },
};

export { Plugin as PgAggregatesAddConnectionAggregatesPlugin };
