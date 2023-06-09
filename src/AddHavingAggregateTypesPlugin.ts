import type {
  PgConditionLikeStep,
  PgResourceParameter,
  PgCodec,
  PgCodecAttribute,
  PgCodecWithAttributes,
  PgResource,
} from "@dataplan/pg";
import { TYPES, BooleanFilterStep, OrFilterStep } from "@dataplan/pg";
import type { GrafastInputFieldConfigMap } from "grafast";
import type { GraphQLInputObjectType, GraphQLInputType } from "graphql";
import type { SQL } from "pg-sql2";
import type { AggregateSpec } from "./interfaces";
import { CORE_HAVING_FILTER_SPECS } from "./interfaces";
import { getComputedAttributeResources } from "./utils";

const { version } = require("../package.json");

const Plugin: GraphileConfig.Plugin = {
  name: "PgAggregatesAddHavingAggregateTypesPlugin",
  version,
  provides: ["aggregates"],

  schema: {
    entityBehavior: {
      pgResource: "order",
    },

    hooks: {
      build(build) {
        return build.extend(
          build,
          {
            pgHavingFilterTypeNameForCodec(codec: PgCodec<any, any, any, any>) {
              switch (codec) {
                case TYPES.int2:
                case TYPES.int: {
                  return build.inflection.aggregateHavingFilterInputType("int");
                }
                case TYPES.bigint: {
                  return build.inflection.aggregateHavingFilterInputType(
                    "bigint"
                  );
                }
                case TYPES.float4:
                case TYPES.float: {
                  return build.inflection.aggregateHavingFilterInputType(
                    "float"
                  );
                }
                case TYPES.money:
                case TYPES.numeric: {
                  return build.inflection.aggregateHavingFilterInputType(
                    "bigfloat"
                  );
                }
                case TYPES.date:
                case TYPES.timestamp:
                case TYPES.timestamptz: {
                  return build.inflection.aggregateHavingFilterInputType(
                    "datetime"
                  );
                }
                case TYPES.char:
                case TYPES.text:
                case TYPES.varchar: {
                  return build.inflection.aggregateHavingFilterInputType(
                    "string"
                  );
                }
                default: {
                  return null;
                }
              }
            },
          },
          "adding pgHavingFilterTypeForTypeAndModifier"
        );
      },

      init(_, build, _context) {
        const {
          graphql: { GraphQLList, GraphQLNonNull },
          inflection,
          sql,
        } = build;

        for (const spec of CORE_HAVING_FILTER_SPECS) {
          const name = build.inflection.aggregateHavingFilterInputType(spec);
          build.registerInputObjectType(
            name,
            {
              isPgHavingFilterInputType: true,
              pgHavingFilterSpec: spec,
            },
            () => ({
              name,
              fields: Object.create(null),
            }),
            ""
          );
        }

        for (const resource of Object.values(
          build.input.pgRegistry.pgResources
        )) {
          if (
            resource.parameters ||
            !resource.codec.attributes ||
            resource.isUnique
          ) {
            continue;
          }
          if (!build.behavior.pgResourceMatches(resource, "order")) {
            continue;
          }

          const tableTypeName = inflection.tableType(resource.codec);

          const tableHavingInputTypeName = inflection.aggregateHavingInputType({
            resource: resource,
          });
          build.registerInputObjectType(
            tableHavingInputTypeName,
            {
              pgTypeResource: resource,
              isPgAggregateHavingInputType: true,
            },
            () => ({
              name: inflection.aggregateHavingInputType({ resource: resource }),
              description: build.wrapDescription(
                `Conditions for \`${tableTypeName}\` aggregates.`,
                "type"
              ),
              fields: () => {
                return {
                  AND: {
                    type: new GraphQLList(
                      new GraphQLNonNull(
                        build.getInputTypeByName(tableHavingInputTypeName)
                      )
                    ),
                    applyPlan($where, input) {
                      input.apply($where);
                      return null;
                    },
                  },
                  OR: {
                    type: new GraphQLList(
                      new GraphQLNonNull(
                        build.getInputTypeByName(tableHavingInputTypeName)
                      )
                    ),
                    applyPlan($where, input) {
                      const $or = new OrFilterStep($where);
                      input.apply($or);
                      return null;
                    },
                  },
                };
              },
            }),
            `Adding connection "groupBy" having input type for ${resource.name}.`
          );

          const computedAttributeResources = getComputedAttributeResources(
            build,
            resource
          );

          for (const aggregateSpec of build.pgAggregateSpecs) {
            for (const computedAttributeResource of computedAttributeResources) {
              const argsTypeName =
                inflection.aggregateHavingAggregateComputedAttributeArgsInputType(
                  {
                    resource: resource,
                    aggregateSpec,
                    computedAttributeResource: computedAttributeResource,
                  }
                );
              build.registerInputObjectType(
                argsTypeName,
                {},
                () => {
                  const { argDetails } = build.pgGetArgDetailsFromParameters(
                    computedAttributeResource,
                    computedAttributeResource.parameters!.slice(1)
                  );
                  return {
                    fields: argDetails.reduce(
                      (memo, { inputType, graphqlArgName }) => {
                        memo[graphqlArgName] = {
                          type: inputType,
                          // NO PLAN NEEDED!
                        };
                        return memo;
                      },
                      Object.create(null) as GrafastInputFieldConfigMap<
                        any,
                        any
                      >
                    ),
                  };
                },
                ""
              );
              const computedHavingInputName =
                inflection.aggregateHavingAggregateComputedAttributeInputType({
                  resource: resource,
                  aggregateSpec,
                  computedAttributeResource: computedAttributeResource,
                });
              /*const ComputedHavingInput =*/
              build.registerInputObjectType(
                computedHavingInputName,
                {},
                () => {
                  const havingFilterTypeName =
                    build.pgHavingFilterTypeNameForCodec(
                      computedAttributeResource.codec
                    );
                  const HavingFilterType = havingFilterTypeName
                    ? (build.getTypeByName(havingFilterTypeName) as
                        | GraphQLInputObjectType
                        | undefined)
                    : undefined;
                  const ArgsType = build.getTypeByName(argsTypeName) as
                    | GraphQLInputObjectType
                    | undefined;
                  if (!HavingFilterType || !ArgsType) {
                    return { fields: Object.create(null) };
                  }
                  const requiresAtLeastOneArg = (
                    computedAttributeResource.parameters as PgResourceParameter[]
                  )
                    .slice(1)
                    .some((p) => p.required);
                  return {
                    fields: {
                      ...(ArgsType
                        ? {
                            args: {
                              type: build.nullableIf(
                                !requiresAtLeastOneArg,
                                ArgsType
                              ),
                              // NO PLAN NEEDED
                            },
                          }
                        : null),
                      filter: {
                        type: new GraphQLNonNull(HavingFilterType),
                        applyPlan($filter) {
                          return $filter;
                        },
                      },
                    },
                  };
                },
                ""
              );
            }

            const typeName = inflection.aggregateHavingAggregateInputType({
              resource: resource,
              aggregateSpec,
            });
            build.registerInputObjectType(
              typeName,
              {},
              () => ({
                name: typeName,
                fields: ({ fieldWithHooks }) => {
                  let fields = Object.create(
                    null
                  ) as GrafastInputFieldConfigMap<any, any>;

                  fields = build.extend(
                    fields,
                    Object.entries(resource.codec.attributes!).reduce(
                      (
                        newFields,
                        [attributeName, attribute]: [string, PgCodecAttribute]
                      ) => {
                        const fieldName = inflection.attribute({
                          codec: resource.codec as PgCodecWithAttributes,
                          attributeName: attributeName,
                        });
                        const havingFilterTypeName =
                          build.pgHavingFilterTypeNameForCodec(attribute.codec);
                        const HavingFilterType = havingFilterTypeName
                          ? build.getTypeByName(havingFilterTypeName)
                          : undefined;
                        if (!HavingFilterType) {
                          return newFields;
                        }
                        const newField = fieldWithHooks({ fieldName }, () => ({
                          type: HavingFilterType,
                          applyPlan($having: PgConditionLikeStep) {
                            const attributeExpression = sql.fragment`${
                              $having.alias
                            }.${sql.identifier(attributeName)}`;
                            const aggregateExpression =
                              aggregateSpec.sqlAggregateWrap(
                                attributeExpression
                              );
                            return new BooleanFilterStep(
                              $having,
                              aggregateExpression
                            );
                          },
                        }));
                        return build.extend(
                          newFields,
                          { [fieldName]: newField },
                          `Adding attribute '${attributeName}' to having filter type for '${resource.name}'`
                        );
                      },
                      Object.create(null)
                    ),
                    ""
                  );

                  fields = build.extend(
                    fields,
                    computedAttributeResources.reduce(
                      (memo, computedAttributeResource) => {
                        const codec = computedAttributeResource.codec;
                        if (
                          (aggregateSpec.shouldApplyToEntity &&
                            !aggregateSpec.shouldApplyToEntity({
                              type: "computedAttribute",
                              resource: computedAttributeResource,
                            })) ||
                          !aggregateSpec.isSuitableType(codec)
                        ) {
                          return memo;
                        }
                        const argsTypeName =
                          inflection.aggregateHavingAggregateComputedAttributeArgsInputType(
                            {
                              resource: resource,
                              aggregateSpec,
                              computedAttributeResource:
                                computedAttributeResource,
                            }
                          );
                        const havingFilterTypeName =
                          build.pgHavingFilterTypeNameForCodec(
                            computedAttributeResource.codec
                          );
                        const HavingFilterType = havingFilterTypeName
                          ? (build.getTypeByName(havingFilterTypeName) as
                              | GraphQLInputObjectType
                              | undefined)
                          : undefined;
                        const ArgsType = build.getTypeByName(argsTypeName) as
                          | GraphQLInputObjectType
                          | undefined;
                        const computedHavingInputName =
                          inflection.aggregateHavingAggregateComputedAttributeInputType(
                            {
                              resource: resource,
                              aggregateSpec,
                              computedAttributeResource:
                                computedAttributeResource,
                            }
                          );
                        const ComputedHavingInput = build.getTypeByName(
                          computedHavingInputName
                        ) as GraphQLInputObjectType | undefined;
                        if (
                          !HavingFilterType ||
                          !ArgsType ||
                          !ComputedHavingInput
                        ) {
                          return memo;
                        }
                        const fieldName = inflection.computedAttributeField({
                          resource: computedAttributeResource as PgResource<
                            any,
                            any,
                            any,
                            PgResourceParameter[],
                            any
                          >,
                        });
                        const { makeExpression } =
                          build.pgGetArgDetailsFromParameters(
                            computedAttributeResource,
                            computedAttributeResource.parameters!.slice(1)
                          );

                        const newField = fieldWithHooks(
                          { fieldName },
                          {
                            type: ComputedHavingInput,
                            applyPlan($having, fieldArgs) {
                              // Because we require that the computed attribute is
                              // evaluated inline, we have to convert it to an
                              // expression here; this is only needed because of the
                              // aggregation.
                              const src = makeExpression({
                                $placeholderable: $having,
                                resource: computedAttributeResource,
                                fieldArgs,
                                path: ["args"],
                                initialArgs: [$having.alias],
                              });

                              const aggregateExpression =
                                aggregateSpec.sqlAggregateWrap(src);
                              const $filter = new BooleanFilterStep(
                                $having,
                                aggregateExpression
                              );
                              fieldArgs.apply($filter, "filter");
                            },
                          }
                        );
                        return build.extend(
                          memo,
                          { [fieldName]: newField },
                          `Adding computed attribute function '${computedAttributeResource.name}' to having filter type for '${resource.name}'`
                        );
                      },
                      Object.create(null) as GrafastInputFieldConfigMap<
                        any,
                        any
                      >
                    ),
                    ""
                  );

                  return fields;
                },
              }),
              ""
            );
          }
        }

        return _;
      },

      GraphQLInputObjectType_fields(inFields, build, context) {
        const { sql, inflection } = build;
        const {
          scope: {
            isPgHavingFilterInputType,
            pgHavingFilterSpec,
            isPgAggregateHavingInputType,
            pgTypeResource: table,
          },
          fieldWithHooks,
        } = context;
        let fields = inFields;
        fields = (() => {
          if (
            !isPgAggregateHavingInputType ||
            !table ||
            table.parameters ||
            !table.codec.attributes
          ) {
            return fields;
          }
          return build.extend(
            fields,
            build.pgAggregateSpecs.reduce(
              (aggregateFields: any, aggregateSpec: AggregateSpec) => {
                const typeName = inflection.aggregateHavingAggregateInputType({
                  resource: table,
                  aggregateSpec,
                });
                const SpecInput = build.getTypeByName(typeName) as
                  | GraphQLInputObjectType
                  | undefined;
                if (!SpecInput) {
                  return aggregateFields;
                }
                const fieldName = inflection.aggregatesField({ aggregateSpec });
                return build.extend(
                  aggregateFields,
                  {
                    [fieldName]: fieldWithHooks(
                      { fieldName }, // e.g. 'average' or 'stddevPopulation'
                      {
                        type: SpecInput,
                        applyPlan($having) {
                          return $having;
                        },
                      }
                    ),
                  },
                  ""
                );
              },
              Object.create(null)
            ),
            `Adding attributes to having filter for '${table.name}'`
          );
        })();

        fields = (() => {
          if (!isPgHavingFilterInputType) {
            return fields;
          }
          const codec = (() => {
            switch (pgHavingFilterSpec) {
              case "int":
                return TYPES.int;
              case "bigint":
                return TYPES.bigint;
              case "float":
                return TYPES.float;
              case "bigfloat":
                return TYPES.numeric;
              case "datetime":
                return TYPES.timestamptz;
              default: {
                return null;
              }
            }
          })();

          if (codec === null) {
            return fields;
          }
          const FieldType = build.getGraphQLTypeByPgCodec(codec, "input") as
            | GraphQLInputType
            | undefined;
          if (FieldType === null) {
            return fields;
          }

          function addBinaryOp(fieldName: string, infix: SQL) {
            fields = build.extend(
              fields,
              {
                [fieldName]: fieldWithHooks(
                  { fieldName },
                  {
                    type: FieldType,
                    applyPlan($booleanFilter: BooleanFilterStep, input) {
                      const val = input.get();
                      $booleanFilter.having(
                        sql`(${sql.parens(
                          $booleanFilter.expression
                        )} ${infix} ${$booleanFilter.placeholder(val, codec!)})`
                      );
                    },
                  }
                ),
              },
              ""
            );
          }
          switch (pgHavingFilterSpec) {
            case "int":
            case "bigint":
            case "float":
            case "bigfloat":
            case "datetime": {
              addBinaryOp("equalTo", sql.fragment`=`);
              addBinaryOp("notEqualTo", sql.fragment`<>`);
              addBinaryOp("greaterThan", sql.fragment`>`);
              addBinaryOp("greaterThanOrEqualTo", sql.fragment`>=`);
              addBinaryOp("lessThan", sql.fragment`<`);
              addBinaryOp("lessThanOrEqualTo", sql.fragment`<=`);
            }
          }
          return fields;
        })();
        return fields;
      },
    },
  },
};

export { Plugin as PgAggregatesAddHavingAggregateTypesPlugin };
