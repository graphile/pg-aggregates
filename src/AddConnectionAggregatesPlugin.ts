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
            /*
              addDataGenerator((parsedResolveInfoFragment: any) => {
                const safeAlias = getSafeAliasFromAlias(
                  parsedResolveInfoFragment.alias
                );
                const resolveData = getDataFromParsedResolveInfoFragment(
                  parsedResolveInfoFragment,
                  AggregateContainerType
                );
                return {
                  // This tells the query planner that we want to add an aggregate
                  pgNamedQuery: {
                    name: "aggregates",
                    query: (aggregateQueryBuilder: QueryBuilder) => {
                      aggregateQueryBuilder.select(() => {
                        const query = queryFromResolveData(
                          sql.identifier(Symbol()),
                          aggregateQueryBuilder.getTableAlias(), // Keep using our alias down the tree
                          resolveData,
                          { onlyJsonField: true },
                          (innerQueryBuilder: QueryBuilder) => {
                            innerQueryBuilder.parentQueryBuilder =
                              aggregateQueryBuilder;
                            innerQueryBuilder.select(
                              sql.fragment`sum(1)`,
                              "__force_aggregate__"
                            );
                          },
                          aggregateQueryBuilder.context
                        );
                        return sql.fragment`(${query})`;
                      }, safeAlias);
                    },
                  },
                };
              });
              */

            return {
              description: `Aggregates across the matching connection (ignoring before/after/first/last/offset)`,
              type: AggregateContainerType,
              /*
                resolve(
                  parent: any,
                  _args: any,
                  _context: any,
                  resolveInfo: GraphQLResolveInfo
                ) {
                  // Figure out the unique alias we chose earlier
                  const safeAlias = getSafeAliasFromResolveInfo(resolveInfo);
                  // All aggregates are stored into the aggregates object which is also identified by aggregateAlias, reference ours here
                  return parent.aggregates[safeAlias] || 0;
                },
                */
            };
          }),
        };
      },
    },
  },
};

export { Plugin as PgAggregatesAddConnectionAggregatesPlugin };
