import { Plugin, Build } from "graphile-build";
import {
  PgAttribute,
  QueryBuilder,
  PgProc,
  PgClass,
  PgType,
} from "graphile-build-pg";
import { GraphQLResolveInfo, GraphQLFieldConfigMap } from "graphql";

export const getComputedColumnDetails = (
  build: Build,
  table: PgClass,
  proc: PgProc
) => {
  if (!proc.isStable) return null;
  if (proc.namespaceId !== table.namespaceId) return null;
  if (!proc.name.startsWith(`${table.name}_`)) return null;
  if (proc.argTypeIds.length < 1) return null;
  if (proc.argTypeIds[0] !== table.type.id) return null;
  // TODO: Support computed columns with arguments
  if (proc.argTypeIds.length !== 1) return null;
  const argTypes = proc.argTypeIds.reduce((prev: PgType[], typeId, idx) => {
    if (
      proc.argModes.length === 0 || // all args are `in`
      proc.argModes[idx] === "i" || // this arg is `in`
      proc.argModes[idx] === "b" // this arg is `inout`
    ) {
      prev.push(build.pgIntrospectionResultsByKind.typeById[typeId]);
    }
    return prev;
  }, []);
  if (
    argTypes
      .slice(1)
      .some(
        type =>
          type.type === "c" &&
          type.classId &&
          build.pgIntrospectionResultsByKind.typeById[type.classId] &&
          build.pgIntrospectionResultsByKind.typeById[type.classId].isSelectable
      )
  ) {
    // Accepts two input tables? Skip.
    return null;
  }

  const pseudoColumnName = proc.name.substr(table.name.length + 1);
  return { argTypes, pseudoColumnName };
};

const AddAggregatesPlugin: Plugin = builder => {
  // Hook all connections to add the 'aggregates' field
  builder.hook("GraphQLObjectType:fields", (fields, build, context) => {
    const {
      newWithHooks,
      graphql: { GraphQLObjectType },
      inflection,
      getSafeAliasFromResolveInfo,
      pgSql: sql,
      getSafeAliasFromAlias,
      pgQueryFromResolveData: queryFromResolveData,
    } = build;
    const {
      fieldWithHooks,
      scope: { isPgRowConnectionType, pgIntrospection: table },
    } = context;

    // If it's not a table connection, abort
    if (
      !isPgRowConnectionType ||
      !table ||
      table.kind !== "class" ||
      !table.namespace
    ) {
      return fields;
    }

    const AggregateType = newWithHooks(
      GraphQLObjectType,
      {
        name: inflection.aggregateType(table),
      },
      {
        isPgAggregateType: true,
        pgIntrospection: table,
      },
      true
    );

    if (!AggregateType) {
      // No aggregates for this connection, abort
      return fields;
    }

    const fieldName = inflection.aggregatesField(table);
    return {
      ...fields,
      [fieldName]: fieldWithHooks(
        fieldName,
        ({ addDataGenerator, getDataFromParsedResolveInfoFragment }: any) => {
          addDataGenerator((parsedResolveInfoFragment: any) => {
            const safeAlias = getSafeAliasFromAlias(
              parsedResolveInfoFragment.alias
            );
            const resolveData = getDataFromParsedResolveInfoFragment(
              parsedResolveInfoFragment,
              AggregateType
            );
            return {
              // This tells the query planner that we want to add an aggregate
              pgAggregateQuery: (aggregateQueryBuilder: QueryBuilder) => {
                aggregateQueryBuilder.select(() => {
                  const query = queryFromResolveData(
                    sql.identifier(Symbol()),
                    aggregateQueryBuilder.getTableAlias(), // Keep using our alias down the tree
                    resolveData,
                    { onlyJsonField: true },
                    (innerQueryBuilder: QueryBuilder) => {
                      innerQueryBuilder.parentQueryBuilder = aggregateQueryBuilder;
                    },
                    aggregateQueryBuilder.context
                  );
                  return sql.fragment`(${query})`;
                }, safeAlias);
              },
            };
          });

          return {
            description: `Aggregates across the matching connection (ignoring before/after/first/last/offset)`,
            type: AggregateType,
            resolve(
              parent: any,
              _args: any,
              _context: any,
              resolveInfo: GraphQLResolveInfo
            ) {
              // Figure out the unique alias we chose earlier
              const safeAlias = getSafeAliasFromResolveInfo(resolveInfo);
              // All aggregates are stored into the 'aggregates' object, reference ours here
              return parent.aggregates[safeAlias] || 0;
            },
          };
        },
        {}
      ),
    };
  });

  // Hook the '*Aggregates' type for each table to add the "sum" operation
  builder.hook("GraphQLObjectType:fields", (fields, build, context) => {
    const {
      pgField,
      inflection,
      newWithHooks,
      graphql: { GraphQLObjectType },
      getSafeAliasFromResolveInfo,
    } = build;
    const {
      fieldWithHooks,
      scope: { isPgAggregateType, pgIntrospection: table },
    } = context;
    if (!isPgAggregateType) {
      return fields;
    }

    const AggregateSumType = newWithHooks(
      GraphQLObjectType,
      {
        name: inflection.aggregateSumType(table),
      },
      {
        isPgSumAggregateType: true,
        pgIntrospection: table,
      },
      true
    );

    if (!AggregateSumType) {
      // No sum aggregates for this connection, abort
      return fields;
    }

    const fieldName = inflection.aggregatesSumField(table);
    return {
      ...fields,
      [fieldName]: pgField(
        build,
        fieldWithHooks,
        fieldName,
        {
          description: `Sum aggregates across the matching connection (ignoring before/after/first/last/offset)`,
          type: AggregateSumType,
          resolve(
            parent: any,
            _args: any,
            _context: any,
            resolveInfo: GraphQLResolveInfo
          ) {
            const safeAlias = getSafeAliasFromResolveInfo(resolveInfo);
            return parent[safeAlias];
          },
        },
        {} // scope,
      ),
    };
  });

  // Hook the sum aggregates type to add fields for each numeric table column
  builder.hook("GraphQLObjectType:fields", (fields, build, context) => {
    const {
      pgSql: sql,
      graphql: { GraphQLNonNull, GraphQLFloat },
      inflection,
      getSafeAliasFromAlias,
      getSafeAliasFromResolveInfo,
      pgField,
      pgIntrospectionResultsByKind,
      pgColumnFilter,
    } = build;
    const {
      fieldWithHooks,
      scope: { isPgSumAggregateType, pgIntrospection: table },
    } = context;
    if (!isPgSumAggregateType || !table || table.kind !== "class") {
      return fields;
    }

    return {
      ...fields,
      // Figure out the columns that we're allowed to do a `SUM(...)` of
      ...table.attributes.reduce(
        (memo: GraphQLFieldConfigMap<any, any>, attr: PgAttribute) => {
          // Didn't use 'numeric' here because it'd be confusing with the 'NUMERIC' type.
          const attrIsNumberLike = attr.type.category === "N";
          if (attrIsNumberLike) {
            const fieldName = inflection.column(attr);
            return build.extend(memo, {
              [fieldName]: pgField(
                build,
                fieldWithHooks,
                fieldName,
                ({ addDataGenerator }: any) => {
                  addDataGenerator((parsedResolveInfoFragment: any) => {
                    return {
                      pgQuery: (queryBuilder: QueryBuilder) => {
                        // Note this expression is just an sql fragment, so you
                        // could add CASE statements, function calls, or whatever
                        // you need here
                        const expr = sql.fragment`${queryBuilder.getTableAlias()}.${sql.identifier(
                          attr.name
                        )}`;
                        queryBuilder.select(
                          // You can put any aggregate expression here; I've wrapped it in `coalesce` so that it cannot be null
                          sql.fragment`coalesce(sum(${expr}), 0)`,
                          // We need a unique alias that we can later reference in the resolver
                          getSafeAliasFromAlias(parsedResolveInfoFragment.alias)
                        );
                      },
                    };
                  });
                  return {
                    description: `Sum of ${fieldName} across the matching connection`,
                    type: new GraphQLNonNull(GraphQLFloat), // TODO: not necessarily the correct type
                    resolve(
                      parent: any,
                      _args: any,
                      _context: any,
                      resolveInfo: GraphQLResolveInfo
                    ) {
                      const safeAlias = getSafeAliasFromResolveInfo(
                        resolveInfo
                      );
                      return parent[safeAlias];
                    },
                  };
                },
                {
                  // In case anyone wants to hook us, describe ourselves
                  isPgConnectionSumField: true,
                  pgFieldIntrospection: attr,
                }
              ),
            });
          }
          return memo;
        },
        {}
      ),
      ...pgIntrospectionResultsByKind.procedure.reduce(
        (memo: GraphQLFieldConfigMap<any, any>, proc: PgProc) => {
          /* TODO: Do fields need to be omitted? */
          const attrIsNumberLike =
            pgIntrospectionResultsByKind.typeById[proc.returnTypeId]
              .category === "N";
          if (attrIsNumberLike && pgColumnFilter(proc, build, context)) {
            const computedColumnDetails = getComputedColumnDetails(
              build,
              table,
              proc
            );
            if (computedColumnDetails) {
              const fieldName = inflection.computedColumn(
                computedColumnDetails.pseudoColumnName,
                proc,
                table
              );
              return build.extend(memo, {
                [fieldName]: pgField(
                  build,
                  fieldWithHooks,
                  fieldName,
                  ({ addDataGenerator }: any) => {
                    addDataGenerator((parsedResolveInfoFragment: any) => {
                      return {
                        pgQuery: (queryBuilder: QueryBuilder) => {
                          // Note this expression is just an sql fragment, so you
                          // could add CASE statements, function calls, or whatever
                          // you need here
                          const expr = sql.fragment`${sql.identifier(
                            proc.namespaceName,
                            proc.name
                          )}(${queryBuilder.getTableAlias()})`;
                          queryBuilder.select(
                            // You can put any aggregate expression here; I've wrapped it in `coalesce` so that it cannot be null
                            sql.fragment`coalesce(sum(${expr}), 0)`,
                            // We need a unique alias that we can later reference in the resolver
                            getSafeAliasFromAlias(
                              parsedResolveInfoFragment.alias
                            )
                          );
                        },
                      };
                    });
                    return {
                      description: `Sum of ${fieldName} across the matching connection`,
                      type: new GraphQLNonNull(GraphQLFloat), // TODO: not necessarily the correct type
                      resolve(
                        parent: any,
                        _args: any,
                        _context: any,
                        resolveInfo: GraphQLResolveInfo
                      ) {
                        const safeAlias = getSafeAliasFromResolveInfo(
                          resolveInfo
                        );
                        return parent[safeAlias];
                      },
                    };
                  },
                  {
                    // In case anyone wants to hook us, describe ourselves
                    isPgConnectionSumField: true,
                    pgFieldIntrospection: proc,
                  }
                ),
              });
            }
          }
          return memo;
        },
        {}
      ),
    };
  });
};
export default AddAggregatesPlugin;
