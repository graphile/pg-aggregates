import type {} from "graphile-config";
import type {} from "graphile-build-pg";
import type { GraphQLFieldConfigMap, GraphQLOutputType } from "graphql";
import type { FieldArgs } from "grafast";
import type {
  PgSelectSingleStep,
  PgResource,
  PgCodecAttribute,
  PgResourceParameter,
} from "@dataplan/pg";
import { getComputedAttributeResources } from "./utils";

// @ts-ignore
const { version } = require("../package.json");

const isSuitableSource = (
  build: GraphileBuild.Build,
  resource: PgResource<any, any, any, any>
): boolean => {
  if (resource.parameters || !resource.codec.attributes) {
    return false;
  }
  if (!build.behavior.pgResourceMatches(resource, "select")) {
    return false;
  }

  return true;
};
const Plugin: GraphileConfig.Plugin = {
  name: "PgAggregatesAddAggregateTypesPlugin",
  version,
  provides: ["aggregates"],

  // Create the aggregates type for each table
  schema: {
    entityBehavior: {
      pgResource: "select",
    },

    hooks: {
      init(init, build, _context) {
        const {
          sql,
          graphql: { GraphQLList, GraphQLNonNull, GraphQLString },
          dataplanPg: { assertPgClassSingleStep, TYPES },
          grafast: { constant },
          inflection,
          input: {
            pgRegistry: { pgResources },
          },
        } = build;

        // TODO: should we be using the codec rather than the source here? What if two sources share the same codec?
        for (const resource of Object.values(pgResources)) {
          if (!isSuitableSource(build, resource)) {
            continue;
          }

          /* const AggregateContainerType = */
          build.registerObjectType(
            inflection.aggregateContainerType({ resource: resource }),
            {
              isPgAggregateContainerType: true,
              pgTypeResource: resource,
            },
            () => ({
              assertStep: assertPgClassSingleStep,
              fields: {
                keys: {
                  type: new GraphQLList(new GraphQLNonNull(GraphQLString)),
                  plan($pgSelectSingle: PgSelectSingleStep<any>) {
                    const $pgSelect = $pgSelectSingle.getClassStep();
                    const groups = $pgSelect.getGroups();
                    if (groups.length > 0) {
                      return $pgSelectSingle.select(
                        sql`json_build_array(${sql.join(
                          groups.map((g) => g.fragment),
                          ", "
                        )})`,
                        TYPES.json
                      );
                    } else {
                      return constant(null);
                    }
                  },
                },
              },
            }),
            `@graphile/pg-aggregates aggregate container type for ${resource.name}`
          );

          for (const aggregateSpec of build.pgAggregateSpecs) {
            const aggregateTypeName = inflection.aggregateType({
              resource: resource,
              aggregateSpec,
            });
            build.registerObjectType(
              aggregateTypeName,
              {
                isPgAggregateType: true,
                pgAggregateSpec: aggregateSpec,
                pgTypeResource: resource,
              },
              () => ({}),
              `${aggregateTypeName} aggregate type for '${resource.name}' source`
            );
          }
        }

        return init;
      },

      GraphQLObjectType_fields(inFields, build, context) {
        let fields = inFields;
        const {
          inflection,
          sql,
          graphql: { GraphQLNonNull, isOutputType },
        } = build;
        const {
          fieldWithHooks,
          Self,
          scope: {
            isPgAggregateContainerType,
            isPgAggregateType,
            pgTypeResource: resource,
            pgAggregateSpec: spec,
          },
        } = context;
        if (!resource || !isSuitableSource(build, resource)) {
          return fields;
        }

        // Hook the '*Aggregates' type for each source to add the "sum" operation
        if (isPgAggregateContainerType) {
          fields = build.extend(
            fields,
            build.pgAggregateSpecs.reduce((memo, aggregateSpec) => {
              return build.recoverable(memo, () => {
                const aggregateTypeName = inflection.aggregateType({
                  resource: resource,
                  aggregateSpec,
                });
                const AggregateType = build.getTypeByName(aggregateTypeName);
                if (!AggregateType || !isOutputType(AggregateType)) {
                  return memo;
                }
                const fieldName = inflection.aggregatesField({ aggregateSpec });
                return build.extend(
                  memo,
                  {
                    [fieldName]: fieldWithHooks(
                      {
                        fieldName,
                        isPgAggregateField: true,
                        pgAggregateSpec: aggregateSpec,
                        pgFieldResource: resource,
                      },
                      () => ({
                        description: `${aggregateSpec.HumanLabel} aggregates across the matching connection (ignoring before/after/first/last/offset)`,
                        type: AggregateType,
                        plan($pgSelectSingle: PgSelectSingleStep<any>) {
                          return $pgSelectSingle;
                        },
                      })
                    ),
                  },
                  `Adding aggregates field to ${Self.name}`
                );
              });
            }, Object.create(null) as GraphQLFieldConfigMap<unknown, unknown>),
            "Adding sum operation to aggregate type"
          );
        }

        // Hook the sum aggregates type to add fields for each numeric source attribute
        if (isPgAggregateType && spec) {
          fields = build.extend(
            fields,
            // Figure out the attributes that we're allowed to do a `SUM(...)` of
            Object.entries(resource.codec.attributes).reduce(
              (
                memo: GraphQLFieldConfigMap<any, any>,
                [attributeName, attribute]: [string, PgCodecAttribute]
              ) => {
                if (
                  (spec.shouldApplyToEntity &&
                    !spec.shouldApplyToEntity({
                      type: "attribute",
                      codec: resource.codec,
                      attributeName,
                    })) ||
                  !spec.isSuitableType(attribute.codec)
                ) {
                  return memo;
                }
                const codec = spec.pgTypeCodecModifier
                  ? spec.pgTypeCodecModifier(attribute.codec)
                  : attribute.codec;
                const Type = build.getGraphQLTypeByPgCodec(
                  codec,
                  "output"
                ) as GraphQLOutputType | null;
                if (!Type) {
                  return memo;
                }
                const fieldName = inflection.attribute({
                  attributeName,
                  codec: resource.codec,
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
                        return {
                          description: `${spec.HumanLabel} of ${fieldName} across the matching connection`,
                          type: spec.isNonNull
                            ? new GraphQLNonNull(Type)
                            : Type,
                          plan($pgSelectSingle: PgSelectSingleStep) {
                            // Note this expression is just an sql fragment, so you
                            // could add CASE statements, function calls, or whatever
                            // you need here
                            const sqlAttribute = sql.fragment`${
                              $pgSelectSingle.getClassStep().alias
                            }.${sql.identifier(attributeName)}`;
                            const sqlAggregate =
                              spec.sqlAggregateWrap(sqlAttribute);
                            return $pgSelectSingle.select(sqlAggregate, codec);
                          },
                        };
                      }
                    ),
                  },
                  `Add attribute '${attributeName}' compatible with this aggregate`
                );
              },
              Object.create(null)
            ),
            "Add attributes compatible with this aggregate"
          );

          const computedAttributeSources = getComputedAttributeResources(
            build,
            resource
          );
          fields = build.extend(
            fields,
            computedAttributeSources.reduce(
              (memo, computedAttributeResource) => {
                const codec = computedAttributeResource.codec;
                if (
                  (spec.shouldApplyToEntity &&
                    !spec.shouldApplyToEntity({
                      type: "computedAttribute",
                      resource: computedAttributeResource,
                    })) ||
                  !spec.isSuitableType(codec)
                ) {
                  return memo;
                }
                const fieldName = inflection.computedAttributeField({
                  resource: computedAttributeResource as PgResource<
                    any,
                    any,
                    any,
                    readonly PgResourceParameter[],
                    any
                  >,
                });
                const targetCodec = spec.pgTypeCodecModifier?.(codec) ?? codec;
                const targetType = build.getGraphQLTypeByPgCodec(
                  targetCodec,
                  "output"
                ) as GraphQLOutputType | undefined;
                if (!targetType) {
                  return memo;
                }
                return build.extend(
                  memo,
                  {
                    [fieldName]: fieldWithHooks(
                      {
                        fieldName,
                      },
                      () => {
                        const { makeFieldArgs, makeExpression } =
                          build.pgGetArgDetailsFromParameters(
                            computedAttributeResource,
                            computedAttributeResource.parameters!.slice(1)
                          );
                        return {
                          type: targetType,
                          description: `${
                            spec.HumanLabel
                          } of this field across the matching connection.${
                            computedAttributeResource.description
                              ? `\n\n---\n\n${computedAttributeResource.description}`
                              : ""
                          }`,
                          args: makeFieldArgs(),
                          plan(
                            $pgSelectSingle: PgSelectSingleStep<any>,
                            fieldArgs: FieldArgs
                          ) {
                            // Because we require that the computed attribute is
                            // evaluated inline, we have to convert it to an
                            // expression here; this is only needed because of the
                            // aggregation.
                            const src = makeExpression({
                              $placeholderable: $pgSelectSingle,
                              resource: computedAttributeResource,
                              fieldArgs,
                              initialArgs: [
                                $pgSelectSingle.getClassStep().alias,
                              ],
                            });

                            const sqlAggregate = spec.sqlAggregateWrap(src);
                            return $pgSelectSingle.select(
                              sqlAggregate,
                              targetCodec
                            );
                          },
                        };
                      }
                    ),
                  },
                  ""
                );
              },
              Object.create(null) as GraphQLFieldConfigMap<any, any>
            ),
            ""
          );
        }

        return fields;
      },
    },
  },
};

export { Plugin as PgAggregatesAddAggregateTypesPlugin };
