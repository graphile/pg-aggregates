import { Plugin } from "graphile-build";
import {
  PgAttribute,
  QueryBuilder,
  PgProc,
  // @ts-ignore
  getComputedColumnDetails,
} from "graphile-build-pg";
import { GraphQLResolveInfo, GraphQLFieldConfigMap } from "graphql";
import { AggregateSpec } from "./interfaces";

/** If there's no args we can use `aggregates`, otherwise we need to alias to allow for groupBy etc */
function getAggregateAlias(safeAlias: string, args: { [key: string]: any }) {
  if (!args.groupBy || args.groupBy.length === 0) {
    return "aggregates";
  } else {
    return safeAlias;
  }
}

const AddAggregatesPlugin: Plugin = (builder) => {
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

    const AggregateContainerType = newWithHooks(
      GraphQLObjectType,
      {
        name: inflection.aggregateContainerType(table),
      },
      {
        isPgAggregateContainerType: true,
        pgIntrospection: table,
      },
      true
    );

    if (!AggregateContainerType) {
      // No aggregates for this connection, abort
      return fields;
    }

    const fieldName = inflection.aggregatesContainerField(table);
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
              AggregateContainerType
            );
            return {
              // This tells the query planner that we want to add an aggregate
              pgNamedQuery: {
                name: getAggregateAlias(
                  safeAlias,
                  parsedResolveInfoFragment.args
                ),
                query: (aggregateQueryBuilder: QueryBuilder) => {
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
              },
            };
          });

          return {
            description: `Aggregates across the matching connection (ignoring before/after/first/last/offset)`,
            type: AggregateContainerType,
            resolve(
              parent: any,
              args: any,
              _context: any,
              resolveInfo: GraphQLResolveInfo
            ) {
              // Figure out the unique alias we chose earlier
              const safeAlias = getSafeAliasFromResolveInfo(resolveInfo);
              const aggregateAlias = getAggregateAlias(safeAlias, args);
              // All aggregates are stored into the aggregates object which is also identified by aggregateAlias, reference ours here
              return parent[aggregateAlias][safeAlias] || 0;
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
      scope: { isPgAggregateContainerType, pgIntrospection: table },
    } = context;
    if (!isPgAggregateContainerType) {
      return fields;
    }

    return build.extend(
      fields,
      (build.pgAggregateSpecs as AggregateSpec[]).reduce(
        (memo: GraphQLFieldConfigMap<unknown, unknown>, spec) => {
          const AggregateType = newWithHooks(
            GraphQLObjectType,
            {
              name: inflection.aggregateType(table, spec),
            },
            {
              isPgAggregateType: true,
              pgAggregateSpec: spec,
              pgIntrospection: table,
            },
            true
          );

          if (!AggregateType) {
            // No aggregates for this connection for this spec, abort
            return memo;
          }
          const fieldName = inflection.aggregatesField(table, spec);
          return build.extend(memo, {
            ...fields,
            [fieldName]: pgField(
              build,
              fieldWithHooks,
              fieldName,
              {
                description: `${spec.HumanLabel} aggregates across the matching connection (ignoring before/after/first/last/offset)`,
                type: AggregateType,
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
              {
                isPgAggregateField: true,
                pgAggregateSpec: spec,
                pgFieldIntrospection: table,
              } // scope,
            ),
          });
        },
        {}
      )
    );
  });

  // Hook the sum aggregates type to add fields for each numeric table column
  builder.hook("GraphQLObjectType:fields", (fields, build, context) => {
    const {
      pgSql: sql,
      graphql: { GraphQLNonNull },
      inflection,
      getSafeAliasFromAlias,
      getSafeAliasFromResolveInfo,
      pgField,
      pgIntrospectionResultsByKind,
    } = build;
    const {
      fieldWithHooks,
      scope: {
        isPgAggregateType,
        pgIntrospection: table,
        pgAggregateSpec: spec,
      },
    } = context;
    if (!isPgAggregateType || !table || table.kind !== "class" || !spec) {
      return fields;
    }

    return {
      ...fields,
      // Figure out the columns that we're allowed to do a `SUM(...)` of
      ...table.attributes.reduce(
        (memo: GraphQLFieldConfigMap<any, any>, attr: PgAttribute) => {
          if (!spec.isSuitableType(attr.type)) {
            return memo;
          }
          const [pgType, pgTypeModifier] = spec.pgTypeAndModifierModifier
            ? spec.pgTypeAndModifierModifier(attr.type, attr.typeModifier)
            : [attr.type, attr.typeModifier];
          const Type = build.pgGetGqlTypeByTypeIdAndModifier(
            pgType.id,
            pgTypeModifier
          );
          if (!Type) {
            return memo;
          }
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
                      const sqlColumn = sql.fragment`${queryBuilder.getTableAlias()}.${sql.identifier(
                        attr.name
                      )}`;
                      const sqlAggregate = spec.sqlAggregateWrap(sqlColumn);
                      queryBuilder.select(
                        sqlAggregate,
                        // We need a unique alias that we can later reference in the resolver
                        getSafeAliasFromAlias(parsedResolveInfoFragment.alias)
                      );
                    },
                  };
                });
                return {
                  description: `${spec.HumanLabel} of ${fieldName} across the matching connection`,
                  type: spec.isNonNull ? new GraphQLNonNull(Type) : Type,
                  resolve(
                    parent: any,
                    _args: any,
                    _context: any,
                    resolveInfo: GraphQLResolveInfo
                  ) {
                    const safeAlias = getSafeAliasFromResolveInfo(resolveInfo);
                    return parent[safeAlias];
                  },
                };
              },
              {
                // In case anyone wants to hook us, describe ourselves
                isPgConnectionAggregateField: true,
                pgFieldIntrospection: attr,
              },
              false,
              {
                pgType,
                pgTypeModifier,
              }
            ),
          });
        },
        {}
      ),
      ...pgIntrospectionResultsByKind.procedure.reduce(
        (memo: GraphQLFieldConfigMap<any, any>, proc: PgProc) => {
          if (proc.returnsSet) {
            return memo;
          }
          const type = pgIntrospectionResultsByKind.typeById[proc.returnTypeId];
          if (!spec.isSuitableType(type)) {
            return memo;
          }
          const computedColumnDetails = getComputedColumnDetails(
            build,
            table,
            proc
          );
          if (!computedColumnDetails) {
            return memo;
          }
          const { pseudoColumnName } = computedColumnDetails;
          const fieldName = inflection.computedColumn(
            pseudoColumnName,
            proc,
            table
          );
          return build.extend(memo, {
            [fieldName]: build.pgMakeProcField(fieldName, proc, build, {
              fieldWithHooks,
              computed: true,
              aggregateWrapper: spec.sqlAggregateWrap,
              pgTypeAndModifierModifier: spec.pgTypeAndModifierModifier,
              description: `${
                spec.HumanLabel
              } of this field across the matching connection.${
                proc.description ? `\n\n---\n\n${proc.description}` : ""
              }`,
            }),
          });
        },
        {}
      ),
    };
  });
};

export default AddAggregatesPlugin;
