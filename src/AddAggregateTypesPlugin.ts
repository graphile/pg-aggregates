import type {} from "graphile-config";
import type {} from "graphile-build-pg";
import type {
  GraphQLResolveInfo,
  GraphQLFieldConfigMap,
  GraphQLOutputType,
} from "graphql";
import { AggregateSpec } from "./interfaces";
import { ExecutableStep } from "grafast";
import { PgSource, PgSourceParameter, PgTypeColumn } from "@dataplan/pg";

// @ts-ignore
const { version } = require("../package.json");

const isSuitableSource = (
  build: GraphileBuild.Build,
  source: PgSource<any, any, any, any>
): boolean => {
  if (source.parameters || !source.codec.columns) {
    return false;
  }
  const behavior = build.pgGetBehavior([
    source.codec.extensions,
    source.extensions,
  ]);

  if (build.behavior.matches(behavior, "select", "select")) {
    return false;
  }

  return true;
};
const Plugin: GraphileConfig.Plugin = {
  name: "PgAggregatesAddAggregateTypesPlugin",
  version,

  // Create the aggregates type for each table
  schema: {
    hooks: {
      init(init, build, _context) {
        const {
          graphql: {
            GraphQLObjectType,
            GraphQLList,
            GraphQLNonNull,
            GraphQLString,
          },
          inflection,
          input: { pgSources },
        } = build;

        // TODO: should we be using the codec rather than the source here? What if two sources share the same codec?
        for (const source of pgSources) {
          if (!isSuitableSource(build, source)) {
            continue;
          }

          /* const AggregateContainerType = */
          build.registerObjectType(
            inflection.aggregateContainerType({ source }),
            {
              isPgAggregateContainerType: true,
              pgTypeSource: source,
            },
            ExecutableStep as any,
            () => ({
              fields: {
                keys: {
                  type: new GraphQLList(new GraphQLNonNull(GraphQLString)),
                  resolver(parent: any) {
                    return parent.keys || [];
                  },
                },
              },
            }),
            `@graphile/pg-aggregates aggregate container type for ${source.name}`
          );

          for (const aggregateSpec of build.pgAggregateSpecs) {
            const aggregateTypeName = inflection.aggregateType({
              source,
              aggregateSpec,
            });
            build.registerObjectType(
              aggregateTypeName,
              {
                isPgAggregateType: true,
                pgAggregateSpec: aggregateSpec,
                pgTypeSource: source,
              },
              ExecutableStep as any,
              () => ({}),
              `${aggregateTypeName} aggregate type for '${source.name}' source`
            );
          }
        }

        return init;
      },

      GraphQLObjectType_fields(inFields, build, context) {
        let fields = inFields;
        const {
          inflection,
          graphql: { GraphQLObjectType },
          sql,
          graphql: { GraphQLNonNull },
        } = build;
        const {
          fieldWithHooks,
          Self,
          scope: {
            isPgAggregateContainerType,
            isPgAggregateType,
            pgTypeSource: source,
            pgAggregateSpec: spec,
          },
        } = context;
        if (!source || !isSuitableSource(build, source)) {
          return fields;
        }

        // Hook the '*Aggregates' type for each source to add the "sum" operation
        if (isPgAggregateContainerType) {
          fields = build.extend(
            fields,
            build.pgAggregateSpecs.reduce((memo, aggregateSpec) => {
              const aggregateTypeName = inflection.aggregateType({
                source,
                aggregateSpec,
              });
              const AggregateType =
                build.getOutputTypeByName(aggregateTypeName);
              const fieldName = inflection.aggregatesField({ aggregateSpec });
              return build.extend(
                memo,
                {
                  [fieldName]: fieldWithHooks(
                    {
                      fieldName,
                      isPgAggregateField: true,
                      pgAggregateSpec: aggregateSpec,
                      pgFieldSource: source,
                    },
                    () => ({
                      description: `${aggregateSpec.HumanLabel} aggregates across the matching connection (ignoring before/after/first/last/offset)`,
                      type: AggregateType,
                      resolve(
                        parent: any,
                        _args: any,
                        _context: any,
                        resolveInfo: GraphQLResolveInfo
                      ) {
                        const safeAlias =
                          getSafeAliasFromResolveInfo(resolveInfo);
                        return parent[safeAlias];
                      },
                    })
                  ),
                },
                `Adding aggregates field to ${Self.name}`
              );
            }, {} as GraphQLFieldConfigMap<unknown, unknown>),
            "Adding sum operation to aggregate type"
          );
        }

        // Hook the sum aggregates type to add fields for each numeric source column
        if (isPgAggregateType && spec) {
          fields = build.extend(
            fields,
            // Figure out the columns that we're allowed to do a `SUM(...)` of
            Object.entries(source.codec.columns).reduce(
              (
                memo: GraphQLFieldConfigMap<any, any>,
                [columnName, column]: [string, PgTypeColumn]
              ) => {
                if (
                  (spec.shouldApplyToEntity &&
                    !spec.shouldApplyToEntity(column)) ||
                  !spec.isSuitableType(column.codec)
                ) {
                  return memo;
                }
                const codec = spec.pgTypeCodecModifier
                  ? spec.pgTypeCodecModifier(column.codec)
                  : column.codec;
                const Type = build.getGraphQLTypeByPgCodec(
                  codec,
                  "output"
                ) as GraphQLOutputType | null;
                if (!Type) {
                  return memo;
                }
                const fieldName = inflection.column({
                  columnName,
                  codec: source.codec,
                });
                return build.extend(
                  memo,
                  {
                    [fieldName]: fieldWithHooks(
                      {
                        fieldName,

                        // In case anyone wants to hook us, describe ourselves
                        isPgConnectionAggregateField: true,
                        //pgFieldIntrospection: attr,
                        //TODO: add more details here
                      },
                      () => {
                        /*
                        addDataGenerator((parsedResolveInfoFragment: any) => {
                          return {
                            pgQuery: (queryBuilder: QueryBuilder) => {
                              // Note this expression is just an sql fragment, so you
                              // could add CASE statements, function calls, or whatever
                              // you need here
                              const sqlColumn = sql.fragment`${queryBuilder.getTableAlias()}.${sql.identifier(
                                attr.name
                              )}`;
                              const sqlAggregate =
                                spec.sqlAggregateWrap(sqlColumn);
                              queryBuilder.select(
                                sqlAggregate,
                                // We need a unique alias that we can later reference in the resolver
                                getSafeAliasFromAlias(
                                  parsedResolveInfoFragment.alias
                                )
                              );
                            },
                          };
                        });
                        */
                        return {
                          description: `${spec.HumanLabel} of ${fieldName} across the matching connection`,
                          type: spec.isNonNull
                            ? new GraphQLNonNull(Type)
                            : Type,
                          resolve(
                            parent: any,
                            _args: any,
                            _context: any,
                            resolveInfo: GraphQLResolveInfo
                          ) {
                            const safeAlias =
                              getSafeAliasFromResolveInfo(resolveInfo);
                            return parent[safeAlias];
                          },
                        };
                      }
                    ),
                  },
                  `Add column '${columnName}' compatible with this aggregate`
                );
              },
              Object.create(null)
            ),
            "Add columns compatible with this aggregate"
          );

          const computedColumnSources = build.input.pgSources.filter((s) => {
            if (!s.parameters) {
              return false;
            }
            if (s.codec.columns) {
              return false;
            }
            if (!s.isUnique) {
              return false;
            }
            if (s.codec.arrayOfCodec) {
              return false;
            }
            const firstParameter = s.parameters[0] as PgSourceParameter;
            if (firstParameter.codec !== source.codec) {
              return false;
            }
            return true;
          });

          fields = build.extend(
            fields,
            computedColumnSources.reduce((memo, computedColumnSource) => {
              const codec = computedColumnSource.codec;
              if (
                (spec.shouldApplyToEntity &&
                  !spec.shouldApplyToEntity({
                    type: "computedColumn",
                    source: computedColumnSource,
                  })) ||
                !spec.isSuitableType(codec)
              ) {
                return memo;
              }
              const fieldName = inflection.computedColumnField({
                source: computedColumnSource,
              });
              return build.extend(
                memo,
                {
                  [fieldName]: build.pgMakeProcField(fieldName, proc, build, {
                    fieldWithHooks,
                    computed: true,
                    aggregateWrapper: spec.sqlAggregateWrap,
                    pgTypeCodecModifier: spec.pgTypeCodecModifier,
                    description: `${
                      spec.HumanLabel
                    } of this field across the matching connection.${
                      proc.description ? `\n\n---\n\n${proc.description}` : ""
                    }`,
                  }),
                },
                ""
              );
            }, {} as GraphQLFieldConfigMap<any, any>),
            ""
          );
        }

        return fields;
      },
    },
  },
};

export { Plugin as PgAggregatesAddAggregateTypesPlugin };
