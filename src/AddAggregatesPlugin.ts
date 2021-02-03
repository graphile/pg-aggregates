import { Plugin } from "graphile-build";
import {
  PgAttribute,
  QueryBuilder,
  PgProc,
  // @ts-ignore
  getComputedColumnDetails,
  PgType,
} from "graphile-build-pg";
import { GraphQLResolveInfo, GraphQLFieldConfigMap } from "graphql";
import { AggregateSpec } from "./interfaces";

const AddAggregatesPlugin: Plugin = (builder) => {
  builder.hook("build", (build) => {
    const pgAggregateSpecs: AggregateSpec[] = [
      {
        id: "sum",
        humanLabel: "sum",
        HumanLabel: "Sum",
        isSuitableType(pgType) {
          // Is number-like
          return pgType.category === "N";
        },
        sqlAggregateWrap(sqlFrag) {
          // You can put any aggregate expression here; I've wrapped it in `coalesce` so that it cannot be null
          return build.pgSql.fragment`coalesce(sum(${sqlFrag}), 0)`;
        },
        pgTypeAndModifierModifier(_pgType, _pgTypeModifier) {
          const bigint = build.pgIntrospectionResultsByKind.type.find(
            (t: PgType) => t.id === "20"
          );
          return [bigint, null];
        },
        isNonNull: true,
      },
      {
        id: "min",
        humanLabel: "minimum",
        HumanLabel: "Minimum",
        isSuitableType(pgType) {
          // Is number-like
          return pgType.category === "N";
        },
        sqlAggregateWrap(sqlFrag) {
          // You can put any aggregate expression here; I've wrapped it in `coalesce` so that it cannot be null
          return build.pgSql.fragment`min(${sqlFrag})`;
        },
      },
      {
        id: "max",
        humanLabel: "maximum",
        HumanLabel: "Maximum",
        isSuitableType(pgType) {
          // Is number-like
          return pgType.category === "N";
        },
        sqlAggregateWrap(sqlFrag) {
          // You can put any aggregate expression here; I've wrapped it in `coalesce` so that it cannot be null
          return build.pgSql.fragment`max(${sqlFrag})`;
        },
      },
    ];
    return build.extend(build, {
      pgAggregateSpecs,
    });
  });

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
            type: AggregateContainerType,
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
          const BaseType = build.pgGetGqlTypeByTypeIdAndModifier(
            pgType.id,
            pgTypeModifier
          );
          const Type = spec.graphqlTypeModifier
            ? spec.graphqlTypeModifier(BaseType, pgType, pgTypeModifier)
            : BaseType;
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
            }),
          });
        },
        {}
      ),
    };
  });
};
export default AddAggregatesPlugin;
