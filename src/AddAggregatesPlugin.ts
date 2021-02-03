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
    const { pgSql: sql } = build;
    const isNumberLike = (pgType: PgType): boolean => pgType.category === "N";
    /** Maps from the data type of the column to the data type of the sum aggregate */
    /** BigFloat is our fallback type; it should be valid for almost all numeric types */
    const convertWithMapAndFallback = (
      dataTypeToAggregateTypeMap: { [key: string]: string },
      fallback: string
    ) => {
      return (
        pgType: PgType,
        _pgTypeModifier: number | string | null
      ): [PgType, null | number | string] => {
        const targetTypeId = dataTypeToAggregateTypeMap[pgType.id] || fallback;

        const targetType = build.pgIntrospectionResultsByKind.type.find(
          (t: PgType) => t.id === targetTypeId
        );

        if (!targetType) {
          throw new Error(
            `Could not find PostgreSQL type with oid '${targetTypeId}' whilst processing aggregate.`
          );
        }

        return [targetType, null];
      };
    };
    const pgAggregateSpecs: AggregateSpec[] = [
      {
        id: "sum",
        humanLabel: "sum",
        HumanLabel: "Sum",
        isSuitableType: isNumberLike,
        // I've wrapped it in `coalesce` so that it cannot be null
        sqlAggregateWrap: (sqlFrag) =>
          sql.fragment`coalesce(sum(${sqlFrag}), 0)`,
        isNonNull: true,

        // A SUM(...) often ends up significantly larger than any individual
        // value; see
        // https://www.postgresql.org/docs/current/functions-aggregate.html for
        // how the sum aggregate changes result type.
        pgTypeAndModifierModifier: convertWithMapAndFallback(
          {
            21: "20", // smallint -> bigint
            23: "20", // integer -> bigint
            20: "1700", // bigint -> numeric
            700: "700", // real -> real
            701: "701", // double precision -> double precision
            1186: "1186", // interval -> interval
            790: "790", // money -> money
          },
          "1700" /* numeric */
        ),
      },
      {
        id: "min",
        humanLabel: "minimum",
        HumanLabel: "Minimum",
        isSuitableType: isNumberLike,
        sqlAggregateWrap: (sqlFrag) => sql.fragment`min(${sqlFrag})`,
      },
      {
        id: "max",
        humanLabel: "maximum",
        HumanLabel: "Maximum",
        isSuitableType: isNumberLike,
        sqlAggregateWrap: (sqlFrag) => sql.fragment`max(${sqlFrag})`,
      },
      {
        id: "average",
        humanLabel: "mean average",
        HumanLabel: "Mean average",
        isSuitableType: isNumberLike,
        sqlAggregateWrap: (sqlFrag) => sql.fragment`avg(${sqlFrag})`,

        // An AVG(...) ends up more precise than any individual value; see
        // https://www.postgresql.org/docs/current/functions-aggregate.html for
        // how the avg aggregate changes result type.
        pgTypeAndModifierModifier: convertWithMapAndFallback(
          {
            21: "1700", // smallint -> numeric
            23: "1700", // integer -> numeric
            20: "1700", // bigint -> numeric
            1700: "1700", // numeric -> numeric
            700: "701", // real -> double precision
            701: "701", // double precision -> double precision
            1186: "1186", // interval -> interval
          },
          "1700" /* numeric */
        ),
      },
      {
        id: "stddevSample",
        humanLabel: "sample standard deviation",
        HumanLabel: "Sample standard deviation",
        isSuitableType: isNumberLike,
        sqlAggregateWrap: (sqlFrag) => sql.fragment`stddev_samp(${sqlFrag})`,

        // See https://www.postgresql.org/docs/current/functions-aggregate.html
        // for how this aggregate changes result type.
        pgTypeAndModifierModifier: convertWithMapAndFallback(
          {
            700: "701", // real -> double precision
            701: "701", // double precision -> double precision
          },
          "1700" /* numeric */
        ),
      },
      {
        id: "stddevPopulation",
        humanLabel: "population standard deviation",
        HumanLabel: "Population standard deviation",
        isSuitableType: isNumberLike,
        sqlAggregateWrap: (sqlFrag) => sql.fragment`stddev_pop(${sqlFrag})`,

        // See https://www.postgresql.org/docs/current/functions-aggregate.html
        // for how this aggregate changes result type.
        pgTypeAndModifierModifier: convertWithMapAndFallback(
          {
            700: "701", // real -> double precision
            701: "701", // double precision -> double precision
          },
          "1700" /* numeric */
        ),
      },
      {
        id: "varianceSample",
        humanLabel: "sample variance",
        HumanLabel: "Sample variance",
        isSuitableType: isNumberLike,
        sqlAggregateWrap: (sqlFrag) => sql.fragment`var_samp(${sqlFrag})`,

        // See https://www.postgresql.org/docs/current/functions-aggregate.html
        // for how this aggregate changes result type.
        pgTypeAndModifierModifier: convertWithMapAndFallback(
          {
            700: "701", // real -> double precision
            701: "701", // double precision -> double precision
          },
          "1700" /* numeric */
        ),
      },
      {
        id: "variancePopulation",
        humanLabel: "population variance",
        HumanLabel: "Population variance",
        isSuitableType: isNumberLike,
        sqlAggregateWrap: (sqlFrag) => sql.fragment`var_pop(${sqlFrag})`,

        // See https://www.postgresql.org/docs/current/functions-aggregate.html
        // for how this aggregate changes result type.
        pgTypeAndModifierModifier: convertWithMapAndFallback(
          {
            700: "701", // real -> double precision
            701: "701", // double precision -> double precision
          },
          "1700" /* numeric */
        ),
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
