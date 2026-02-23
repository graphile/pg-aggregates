import type {
  PgBooleanFilter,
  PgCodec,
  PgCodecAttribute,
  PgCodecWithAttributes,
  PgCondition,
  PgConditionCapableParent,
  PgConditionLike,
  PgResource,
  PgResourceParameter,
  PgSelectArgumentDigest,
} from "@dataplan/pg";
import type {
  GrafastInputFieldConfigMap,
  InputObjectFieldApplyResolver,
} from "grafast";
import type {
  GraphQLInputObjectType,
  GraphQLInputType,
  GraphQLNamedType,
} from "graphql";
import type { SQL } from "pg-sql2";

import { EXPORTABLE } from "./EXPORTABLE.js";
import type { AggregateSpec } from "./interfaces.js";
import { CORE_HAVING_FILTER_SPECS } from "./interfaces.js";
import { getComputedAttributeResources } from "./utils.js";

const { version } = require("../package.json");

declare global {
  namespace GraphileBuild {
    interface BehaviorStrings {
      "resource:groupedAggregates:having": true;
      having: true;
      "resource:havingBy": true;
      "attribute:havingBy": true;
      havingBy: true;

      "sum:resource:groupedAggregates:having": true;
      "distinctCount:resource:groupedAggregates:having": true;
      "min:resource:groupedAggregates:having": true;
      "max:resource:groupedAggregates:having": true;
      "average:resource:groupedAggregates:having": true;
      "stddevSample:resource:groupedAggregates:having": true;
      "stddevPopulation:resource:groupedAggregates:having": true;
      "varianceSample:resource:groupedAggregates:having": true;
      "variancePopulation:resource:groupedAggregates:having": true;
    }
  }
}

const pgAggregatesApplyAnd = EXPORTABLE(
  () =>
    function apply($where: PgConditionCapableParent) {
      return $where;
    },
  [],
  "pgAggregatesApplyAnd"
);

const pgAggregatesApplyHaving = EXPORTABLE(
  () =>
    function apply($filter: PgConditionLike) {
      return $filter;
    },
  [],
  "pgAggregatesApplyHaving"
);

const pgAggregatesApplyAttributeFilter = EXPORTABLE(
  () =>
    (
      PgBooleanFilter: GraphileBuild.Build["dataplanPg"]["PgBooleanFilter"],
      aggregateSpec: AggregateSpec,
      attribute: PgCodecAttribute,
      attributeName: string,
      sql: GraphileBuild.Build["sql"],
      $having: PgConditionLike
    ) => {
      const attributeExpression = sql.fragment`${
        $having.alias
      }.${sql.identifier(attributeName)}`;
      const aggregateExpression = aggregateSpec.sqlAggregateWrap(
        attributeExpression,
        attribute.codec
      );
      return new PgBooleanFilter($having, aggregateExpression);
    },
  [],
  "pgAggregatesApplyAttributeFilter"
);

const pgAggregatesApplyComputedColumnFilter = EXPORTABLE(
  () =>
    (
      PgBooleanFilter: GraphileBuild.Build["dataplanPg"]["PgBooleanFilter"],
      aggregateSpec: AggregateSpec,
      computedAttributeResource: PgResource,
      from: (...args: PgSelectArgumentDigest[]) => SQL,
      getNullableType: GraphileBuild.Build["graphql"]["getNullableType"],
      isInputObjectType: GraphileBuild.Build["graphql"]["isInputObjectType"],
      makeArgsRuntime: ReturnType<
        GraphileBuild.Build["pgGetArgDetailsFromParameters"]
      >["makeArgsRuntime"],
      parameterAnalysis: ReturnType<
        GraphileBuild.Build["dataplanPg"]["generatePgParameterAnalysis"]
      >,
      parameters: readonly PgResourceParameter[] | undefined,
      pgFromExpressionRuntime: GraphileBuild.Build["dataplanPg"]["pgFromExpressionRuntime"],
      $having: PgCondition,
      input: Record<string, unknown> | null,
      { field, schema }: Parameters<InputObjectFieldApplyResolver>[2]
    ) => {
      if (input == null) {
        return;
      }
      const fieldType = getNullableType(field.type);
      if (!isInputObjectType(fieldType)) {
        throw new Error(`Expected an input object type (${field.type})`);
      }
      const argsField = fieldType.getFields().args;
      const firstArg = {
        placeholder: $having.alias,
        position: 0,
      };
      let src: SQL;
      if (argsField && input.args != null) {
        const argsType = getNullableType(fieldType.getFields().args.type);
        if (!isInputObjectType(argsType)) {
          throw new Error(`Expected an input object type (${argsType})`);
        }
        const fields = argsType.getFields();
        // Because we require that the computed attribute is
        // evaluated inline, we have to convert it to an
        // expression here; this is only needed because of the
        // aggregation.
        src = pgFromExpressionRuntime(
          from,
          parameters!,
          [firstArg, ...makeArgsRuntime(schema, fields, input.args)],
          parameterAnalysis
        );
      } else {
        src = pgFromExpressionRuntime(
          from,
          parameters!,
          [firstArg],
          parameterAnalysis
        );
      }

      const aggregateExpression = aggregateSpec.sqlAggregateWrap(
        src,
        computedAttributeResource.codec
      );
      const $filter = new PgBooleanFilter($having, aggregateExpression);
      // fieldArgs.apply($filter, "filter");
      return $filter;
    },
  [],
  "pgAggregatesApplyComputedColumnFilter"
);

const pgAggregatesPlanAggregatesField = EXPORTABLE(
  () =>
    function apply($having: PgConditionLike) {
      return $having;
    },
  [],
  "pgAggregatesPlanAggregatesField"
);

const pgAggregatesApplyHavingBinaryOperation = EXPORTABLE(
  () =>
    (
      codec:
        | GraphileBuild.Build["dataplanPg"]["TYPES"]["int"]
        | GraphileBuild.Build["dataplanPg"]["TYPES"]["bigint"]
        | GraphileBuild.Build["dataplanPg"]["TYPES"]["float"]
        | GraphileBuild.Build["dataplanPg"]["TYPES"]["numeric"]
        | GraphileBuild.Build["dataplanPg"]["TYPES"]["timestamptz"],
      infix: () => SQL,
      sql: GraphileBuild.Build["sql"],
      sqlValueWithCodec: GraphileBuild.Build["dataplanPg"]["sqlValueWithCodec"],
      $booleanFilter: PgBooleanFilter,
      input: unknown
    ) => {
      if (input == null) return;
      $booleanFilter.having(
        sql`(${sql.parens(
          $booleanFilter.expression
        )} ${infix()} ${sqlValueWithCodec(input, codec!)})`
      );
    },
  [],
  "pgAggregatesApplyHavingBinaryOperation"
);

const Plugin: GraphileConfig.Plugin = {
  name: "PgAggregatesAddHavingAggregateTypesPlugin",
  description: `\
Creates the types for the 'having' clause in groupedAggregates, the fields \
below that for each aggregate spec, and adds fields for attributes and computed \
columns.`,
  version,
  provides: ["aggregates"],
  after: ["PgBasicsPlugin"],

  schema: {
    behaviorRegistry: {
      add: {
        having: {
          description:
            "Should we add a 'having' option to aggregates on this resource?",
          entities: ["pgResource"],
        },
        havingBy: {
          description:
            "Should this function-like resource, or attribute, be usable in the 'having' clause when aggregating?",
          entities: ["pgResource", "pgCodecAttribute"],
        },
      },
    },

    entityBehavior: {
      // having - for connections' groupedAggregates field
      // havingBy - for computed column functions acting like attributes
      pgResource: ["order", "having", "havingBy"],
      pgCodecAttribute: ["havingBy"],
    },

    hooks: {
      build(build) {
        if (!build.dataplanPg) {
          throw new Error(`PgBasicsPlugin must be loaded first`);
        }
        const {
          dataplanPg: { TYPES },
        } = build;
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
          graphql: {
            GraphQLList,
            GraphQLNonNull,
            getNullableType,
            isInputObjectType,
          },
          inflection,
          sql,
          dataplanPg: {
            PgOrFilter,
            PgBooleanFilter,
            pgFromExpressionRuntime,
            generatePgParameterAnalysis,
          },
          EXPORTABLE,
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
          if (
            !build.behavior.pgResourceMatches(
              resource,
              "resource:groupedAggregates:having"
            )
          ) {
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
            (): Omit<GraphileBuild.GrafastInputObjectTypeConfig, "name"> => ({
              description: build.wrapDescription(
                `Conditions for \`${tableTypeName}\` aggregates.`,
                "type"
              ),
              fields: (): GrafastInputFieldConfigMap<any> => {
                return {
                  AND: {
                    type: new GraphQLList(
                      new GraphQLNonNull(
                        build.getInputTypeByName(tableHavingInputTypeName)
                      )
                    ),
                    apply: pgAggregatesApplyAnd,
                    // No need to auto-apply, the having field calls `fieldArgs.apply(...)`
                  },
                  OR: {
                    type: new GraphQLList(
                      new GraphQLNonNull(
                        build.getInputTypeByName(tableHavingInputTypeName)
                      )
                    ),
                    apply: EXPORTABLE(
                      (PgOrFilter) => ($where) => new PgOrFilter($where),
                      [PgOrFilter]
                    ),
                    // No need to auto-apply, the having field calls `fieldArgs.apply(...)`
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
                  return {
                    fields: () => {
                      const { argDetails } =
                        build.pgGetArgDetailsFromParameters(
                          computedAttributeResource,
                          computedAttributeResource.parameters!.slice(1)
                        );
                      return argDetails.reduce(
                        (memo, { inputType, graphqlArgName }) => {
                          memo[graphqlArgName] = {
                            type: inputType,
                            // NO PLAN NEEDED!
                          };
                          return memo;
                        },
                        Object.create(null) as GrafastInputFieldConfigMap<any>
                      );
                    },
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
                  return {
                    fields: () => {
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
                          apply: pgAggregatesApplyHaving,
                          // No need to auto-apply, parent calls `fieldArgs.apply($filter, "filter")` below
                        },
                      } as GrafastInputFieldConfigMap<any>;
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
                fields: ({
                  fieldWithHooks,
                }: GraphileBuild.ContextInputObjectFields) => {
                  let fields = Object.create(
                    null
                  ) as GrafastInputFieldConfigMap<any>;

                  fields = build.extend(
                    fields,
                    Object.entries(resource.codec.attributes!).reduce(
                      (
                        newFields,
                        [attributeName, attribute]: [string, PgCodecAttribute]
                      ) => {
                        if (
                          !build.behavior.pgCodecAttributeMatches(
                            [resource.codec, attributeName],
                            "attribute:havingBy"
                          )
                        ) {
                          return newFields;
                        }
                        const fieldName = inflection.attribute({
                          codec: resource.codec as PgCodecWithAttributes,
                          attributeName: attributeName,
                        });
                        const havingFilterTypeName =
                          build.pgHavingFilterTypeNameForCodec(attribute.codec);
                        const HavingFilterType = havingFilterTypeName
                          ? (build.getTypeByName(
                              havingFilterTypeName
                            ) as GraphQLInputType & GraphQLNamedType)
                          : undefined;
                        if (!HavingFilterType) {
                          return newFields;
                        }
                        const newField = fieldWithHooks({ fieldName }, () => ({
                          type: HavingFilterType,
                          apply: EXPORTABLE(
                            (
                                PgBooleanFilter,
                                aggregateSpec,
                                attribute,
                                attributeName,
                                pgAggregatesApplyAttributeFilter,
                                sql
                              ) =>
                              ($having: PgConditionLike) => {
                                return pgAggregatesApplyAttributeFilter(
                                  PgBooleanFilter,
                                  aggregateSpec,
                                  attribute,
                                  attributeName,
                                  sql,
                                  $having
                                );
                              },
                            [
                              PgBooleanFilter,
                              aggregateSpec,
                              attribute,
                              attributeName,
                              pgAggregatesApplyAttributeFilter,
                              sql,
                            ]
                          ),
                        }));
                        return build.extend(
                          newFields,
                          { [fieldName]: newField },
                          `Adding attribute '${attributeName}' to having filter type for '${resource.name}'`
                        );
                      },
                      Object.create(null) as GrafastInputFieldConfigMap<any>
                    ),
                    ""
                  );

                  fields = build.extend(
                    fields,
                    computedAttributeResources.reduce(
                      (memo, computedAttributeResource) => {
                        if (
                          !build.behavior.pgResourceMatches(
                            computedAttributeResource,
                            "resource:havingBy"
                          )
                        ) {
                          return memo;
                        }
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
                        const { from: rawFrom, parameters } =
                          computedAttributeResource;
                        const { makeArgsRuntime } =
                          build.pgGetArgDetailsFromParameters(
                            computedAttributeResource,
                            parameters!.slice(1)
                          );
                        const parameterAnalysis = generatePgParameterAnalysis(
                          parameters!
                        );
                        const from =
                          typeof rawFrom === "function"
                            ? rawFrom
                            : () => rawFrom;

                        const newField = fieldWithHooks(
                          { fieldName },
                          {
                            type: ComputedHavingInput,
                            apply: EXPORTABLE(
                              (
                                  PgBooleanFilter,
                                  aggregateSpec,
                                  computedAttributeResource,
                                  from,
                                  getNullableType,
                                  isInputObjectType,
                                  makeArgsRuntime,
                                  parameterAnalysis,
                                  parameters,
                                  pgAggregatesApplyComputedColumnFilter,
                                  pgFromExpressionRuntime
                                ) =>
                                (
                                  $having: PgCondition,
                                  input: Record<string, unknown> | null,
                                  info
                                ) => {
                                  return pgAggregatesApplyComputedColumnFilter(
                                    PgBooleanFilter,
                                    aggregateSpec,
                                    computedAttributeResource,
                                    from,
                                    getNullableType,
                                    isInputObjectType,
                                    makeArgsRuntime,
                                    parameterAnalysis,
                                    parameters,
                                    pgFromExpressionRuntime,
                                    $having,
                                    input,
                                    info
                                  );
                                },
                              [
                                PgBooleanFilter,
                                aggregateSpec,
                                computedAttributeResource,
                                from,
                                getNullableType,
                                isInputObjectType,
                                makeArgsRuntime,
                                parameterAnalysis,
                                parameters,
                                pgAggregatesApplyComputedColumnFilter,
                                pgFromExpressionRuntime,
                              ]
                            ),
                            // No need to auto-apply, parent does `return $having;`
                          }
                        );
                        return build.extend(
                          memo,
                          { [fieldName]: newField },
                          `Adding computed attribute function '${computedAttributeResource.name}' to having filter type for '${resource.name}'`
                        );
                      },
                      Object.create(null) as GrafastInputFieldConfigMap<any>
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
        const {
          sql,
          inflection,
          dataplanPg: { TYPES, sqlValueWithCodec },
          EXPORTABLE,
        } = build;
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
                if (
                  !build.behavior.pgResourceMatches(
                    table,
                    `${aggregateSpec.id}:resource:groupedAggregates:having`
                  )
                ) {
                  return aggregateFields;
                }
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
                        apply: pgAggregatesPlanAggregatesField,
                        // No need to auto-apply, `filter` field does `return new PgBooleanFilter($having, aggregateExpression)`
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
          const rawCodec = (() => {
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

          if (rawCodec === null) {
            return fields;
          }
          const codec = rawCodec;
          const FieldType = build.getGraphQLTypeByPgCodec(
            codec,
            "input"
          ) as GraphQLInputType;
          if (FieldType == null) {
            return fields;
          }

          function addBinaryOp(fieldName: string, infix: () => SQL) {
            fields = build.extend(
              fields,
              {
                [fieldName]: fieldWithHooks(
                  { fieldName },
                  {
                    type: FieldType,
                    apply: EXPORTABLE(
                      (
                          codec,
                          infix,
                          pgAggregatesApplyHavingBinaryOperation,
                          sql,
                          sqlValueWithCodec
                        ) =>
                        ($booleanFilter: PgBooleanFilter, input: unknown) => {
                          return pgAggregatesApplyHavingBinaryOperation(
                            codec,
                            infix,
                            sql,
                            sqlValueWithCodec,
                            $booleanFilter,
                            input
                          );
                        },
                      [
                        codec,
                        infix,
                        pgAggregatesApplyHavingBinaryOperation,
                        sql,
                        sqlValueWithCodec,
                      ]
                    ),
                    // No need to auto-apply
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
              addBinaryOp(
                "equalTo",
                EXPORTABLE((sql) => () => sql.fragment`=`, [sql])
              );
              addBinaryOp(
                "notEqualTo",
                EXPORTABLE((sql) => () => sql.fragment`<>`, [sql])
              );
              addBinaryOp(
                "greaterThan",
                EXPORTABLE((sql) => () => sql.fragment`>`, [sql])
              );
              addBinaryOp(
                "greaterThanOrEqualTo",
                EXPORTABLE((sql) => () => sql.fragment`>=`, [sql])
              );
              addBinaryOp(
                "lessThan",
                EXPORTABLE((sql) => () => sql.fragment`<`, [sql])
              );
              addBinaryOp(
                "lessThanOrEqualTo",
                EXPORTABLE((sql) => () => sql.fragment`<=`, [sql])
              );
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
