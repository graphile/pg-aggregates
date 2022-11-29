import {
  GraphQLResolveInfo,
  GraphQLEnumType,
  GraphQLObjectType,
} from "graphql";

const { version } = require("../package.json");

function isValidEnum(enumType: GraphQLEnumType | undefined): boolean {
  try {
    if (!enumType) {
      return false;
    }
    if (!(enumType instanceof GraphQLEnumType)) {
      return false;
    }
    if (Object.keys(enumType.getValues()).length === 0) {
      return false;
    }
  } catch (e) {
    return false;
  }
  return true;
}

const Plugin: GraphileConfig.Plugin = {
  name: "PgAggregatesAddConnectionGroupedAggregatesPlugin",
  version,

  schema: {
    hooks: {
      GraphQLObjectType_fields(fields, build, context) {
        const {
          graphql: { GraphQLList, GraphQLNonNull },
          inflection,
          sql,
        } = build;
        const {
          fieldWithHooks,
          scope: {
            isConnectionType,
            isPgConnectionRelated,
            pgTypeSource: table,
          },
        } = context;

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

        const fieldName = inflection.groupedAggregatesContainerField({
          source: table,
        });
        const TableGroupByType = build.getTypeByName(
          inflection.aggregateGroupByType({ source: table })
        ) as GraphQLEnumType | undefined;
        const TableHavingInputType = build.getTypeByName(
          inflection.aggregateHavingInputType({ source: table })
        );
        const tableTypeName = inflection.tableType(table.codec);
        if (!TableGroupByType || !isValidEnum(TableGroupByType)) {
          return fields;
        }

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
                  // Push a query container
                  pgNamedQueryContainer: {
                    name: safeAlias,
                    query: ({
                      queryBuilder,
                      innerQueryBuilder,
                      options,
                    }: {
                      queryBuilder: QueryBuilder;
                      innerQueryBuilder: QueryBuilder;
                      options: any;
                    }) => {
                      const args = parsedResolveInfoFragment.args;
                      const groupBy: SQL[] = args.groupBy.map((b: any) =>
                        b.spec(queryBuilder.getTableAlias())
                      );
                      const having: SQL | null = args.having
                        ? TableHavingInputType.extensions.graphile.toSql(
                            args.having,
                            { tableAlias: queryBuilder.getTableAlias() }
                          )
                        : null;
                      if (having && groupBy.length === 0) {
                        throw new Error(
                          "Must not provide having without also providing groupBy"
                        );
                      }
                      innerQueryBuilder.select(
                        () =>
                          sql.fragment`json_build_array(${sql.join(
                            groupBy.map((b) => sql.fragment`(${b})::text`),
                            ", "
                          )})`,
                        "keys"
                      );
                      return sql.fragment`\
coalesce((select json_agg(j.data) from (
  select ${innerQueryBuilder.build({ onlyJsonField: true })} as data
  from ${queryBuilder.getTableExpression()} as ${queryBuilder.getTableAlias()}
  where ${queryBuilder.buildWhereClause(false, false, options)}
  ${
    groupBy.length > 0
      ? sql.fragment`group by ${sql.join(groupBy, ", ")}`
      : sql.blank
  }
  ${having ? sql.fragment`having ${having}` : sql.empty}
) j), '[]'::json)`;
                    },
                  },
                  // This tells the query planner that we want to add an aggregate
                  pgNamedQuery: {
                    name: safeAlias,
                    query: (aggregateQueryBuilder: QueryBuilder) => {
                      // TODO: aggregateQueryBuilder.groupBy();
                      // TODO: aggregateQueryBuilder.select();
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
              description: `Grouped aggregates across the matching connection (ignoring before/after/first/last/offset)`,
              type: new GraphQLList(new GraphQLNonNull(AggregateContainerType)),
              args: {
                groupBy: {
                  type: new GraphQLNonNull(
                    new GraphQLList(new GraphQLNonNull(TableGroupByType))
                  ),
                  description: build.wrapDescription(
                    `The method to use when grouping \`${tableTypeName}\` for these aggregates.`,
                    "arg"
                  ),
                },
                ...(TableHavingInputType
                  ? {
                      having: {
                        type: TableHavingInputType,
                        description: build.wrapDescription(
                          `Conditions on the grouped aggregates.`,
                          "arg"
                        ),
                      },
                    }
                  : null),
              },
              /*
                resolve(
                  parent: any,
                  _args: any,
                  _context: any,
                  resolveInfo: GraphQLResolveInfo
                ) {
                  const safeAlias = getSafeAliasFromResolveInfo(resolveInfo);
                  return parent[safeAlias].map((entry: any) => ({
                    /* Rewrite the object due to aliasing * /
                    ...entry[safeAlias],
                    keys: entry.keys,
                  }));
                },
                */
            };
          }),
        };
      },
    },
  },
};
export { Plugin as PgAggregatesAddConnectionGroupedAggregatesPlugin };
