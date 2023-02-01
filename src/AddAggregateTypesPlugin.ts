import type { Plugin } from "graphile-build";
import type {
  PgAttribute,
  QueryBuilder,
  PgProc,
  PgClass,
} from "graphile-build-pg";
import type { GraphQLResolveInfo, GraphQLFieldConfigMap } from "graphql";
import { AggregateSpec } from "./interfaces";

const AddAggregateTypesPlugin: Plugin = (builder, options) => {
  // Create the aggregates type for each table
  builder.hook("init", (init, build, _context) => {
    const {
      newWithHooks,
      graphql: {
        GraphQLObjectType,
        GraphQLList,
        GraphQLNonNull,
        GraphQLString,
      },
      inflection,
      pgIntrospectionResultsByKind,
      pgOmit: omit,
    } = build;

    pgIntrospectionResultsByKind.class.forEach((table: PgClass) => {
      if (!table.namespace) {
        return;
      }
      if (omit(table, "read")) {
        return;
      }
      if (table.tags.enum) {
        return;
      }
      if (!table.isSelectable) {
        return;
      }
      if (
        table.tags.aggregates === "off" || (
          options.disableAggregatesByDefault &&
          table.tags.aggregates !== "on"
        )
      ) {
        return;
      }

      /* const AggregateContainerType = */
      newWithHooks(
        GraphQLObjectType,
        {
          name: inflection.aggregateContainerType(table),
          fields: {
            keys: {
              type: new GraphQLList(new GraphQLNonNull(GraphQLString)),
              resolver(parent: any) {
                return parent.keys || [];
              },
            },
          },
        },
        {
          isPgAggregateContainerType: true,
          pgIntrospection: table,
        },
        true
      );
    });

    return init;
  });

  // Hook the '*Aggregates' type for each table to add the "sum" operation
  builder.hook(
    "GraphQLObjectType:fields",
    function addAggregateFieldsToAggregateType(fields, build, context) {
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
            const fieldName = inflection.aggregatesField(spec);
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
    }
  );

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
      pgGetComputedColumnDetails: getComputedColumnDetails,
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
          if (
            (spec.shouldApplyToEntity && !spec.shouldApplyToEntity(attr)) ||
            !spec.isSuitableType(attr.type)
          ) {
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
          if (
            (spec.shouldApplyToEntity && !spec.shouldApplyToEntity(proc)) ||
            !spec.isSuitableType(type)
          ) {
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

export default AddAggregateTypesPlugin;
