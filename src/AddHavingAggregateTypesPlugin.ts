import { PgTypeCodec, PgTypeColumn, TYPES } from "@dataplan/pg";
import { GraphileFieldConfig, GraphileInputFieldConfigMap } from "grafast";
import type {
  GraphQLFieldConfigMap,
  GraphQLInputObjectType,
  GraphQLInputType,
} from "graphql";
import { SQL } from "pg-sql2";
import {
  INT2_OID,
  INT4_OID,
  BIGINT_OID,
  FLOAT4_OID,
  FLOAT8_OID,
  MONEY_OID,
  NUMERIC_OID,
  DATE_OID,
  TIMESTAMP_OID,
  TIMESTAMPTZ_OID,
  CHAR_OID,
  TEXT_OID,
  VARCHAR_OID,
  AggregateSpec,
  CORE_HAVING_FILTER_SPECS,
} from "./interfaces";
import { getComputedColumnSources } from "./utils";

const { version } = require("../package.json");

const Plugin: GraphileConfig.Plugin = {
  name: "PgAggregatesAddHavingAggregateTypesPlugin",
  version,

  schema: {
    hooks: {
      build(build) {
        return build.extend(
          build,
          {
            pgHavingFilterTypeNameForCodec(
              codec: PgTypeCodec<any, any, any, any>
            ) {
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
          graphql: { GraphQLInputObjectType, GraphQLList, GraphQLNonNull },
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
              fields: {},
              // TODO: plan
              /*
              extensions: {
                graphile: {
                  toSql(argValue: any, details: any) {
                    const fragments: SQL[] = [];
                    if (argValue != null) {
                      const fields = Self.getFields();
                      Object.keys(fields).forEach((fieldName) => {
                        const field = fields[fieldName];
                        const value = argValue[fieldName];
                        if (value == null) {
                          return;
                        }
                        const toSql = field.extensions?.graphile?.toSql;
                        if (typeof toSql === "function") {
                          fragments.push(toSql(value, details));
                        }
                      });
                    }
                    return fragments.length > 0
                      ? sql.fragment`(${sql.join(fragments, ") AND (")})`
                      : sql.true;
                  },
                },
              },
              */
            }),
            ""
          );
        }

        for (const source of build.input.pgSources) {
          if (source.parameters || !source.codec.columns || source.isUnique) {
            continue;
          }
          const behavior = build.pgGetBehavior([
            source.codec.extensions,
            source.extensions,
          ]);
          if (!build.behavior.matches(behavior, "order", "order")) {
            continue;
          }

          const tableTypeName = inflection.tableType(source.codec);

          const tableHavingInputTypeName = inflection.aggregateHavingInputType({
            source,
          });
          build.registerInputObjectType(
            tableHavingInputTypeName,
            {
              pgTypeSource: source,
              isPgAggregateHavingInputType: true,
            },
            () => ({
              name: inflection.aggregateHavingInputType({ source }),
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
                    /*
                    extensions: {
                      graphile: {
                        toSql(val: any, details: any) {
                          if (val) {
                            const children = val.map((item: any) =>
                              TableHavingInputType.extensions.graphile.toSql(
                                item,
                                details
                              )
                            );
                            if (children.length > 0) {
                              return sql.fragment`(${sql.join(
                                children,
                                ") AND ("
                              )})`;
                            }
                          }
                          return sql.true;
                        },
                      },
                    },
                    */
                  },
                  OR: {
                    type: new GraphQLList(
                      new GraphQLNonNull(
                        build.getInputTypeByName(tableHavingInputTypeName)
                      )
                    ),
                    /*
                    extensions: {
                      graphile: {
                        toSql(val: any, details: any) {
                          if (val) {
                            const children = val.map((item: any) =>
                              TableHavingInputType.extensions.graphile.toSql(
                                item,
                                details
                              )
                            );
                            if (children.length > 0) {
                              return sql.fragment`(${sql.join(
                                children,
                                ") OR ("
                              )})`;
                            }
                          }
                          return sql.true;
                        },
                      },
                    },
                    */
                  },
                };
              },
              /*
              extensions: {
                graphile: {
                  toSql(argValue: any, details: any) {
                    const fragments: SQL[] = [];
                    if (argValue != null) {
                      const fields = TableHavingInputType.getFields();
                      Object.keys(fields).forEach((fieldName) => {
                        const field = fields[fieldName];
                        const value = argValue[fieldName];
                        if (value == null) {
                          return;
                        }
                        const toSql = field.extensions?.graphile?.toSql;
                        if (typeof toSql === "function") {
                          fragments.push(toSql(value, details));
                        }
                      });
                    }
                    return fragments.length > 0
                      ? sql.fragment`(${sql.join(fragments, ") AND (")})`
                      : sql.true;
                  },
                },
              },
              */
            }),
            `Adding connection "groupBy" having input type for ${source.name}.`
          );

          const computedColumnSources = getComputedColumnSources(build, source);

          for (const aggregateSpec of build.pgAggregateSpecs) {
            for (const computedColumnSource of computedColumnSources) {
              const argsTypeName =
                inflection.aggregateHavingAggregateComputedColumnArgsInputType({
                  source,
                  aggregateSpec,
                  computedColumnSource,
                });
              build.registerInputObjectType(
                argsTypeName,
                {},
                () => {
                  const argDetails = build.pgGetArgDetailsFromParameters(
                    computedColumnSource,
                    computedColumnSource.parameters.slice(1)
                  );
                  return {
                    fields: argDetails.reduce(
                      (memo, { inputType, graphqlArgName }) => {
                        memo[graphqlArgName] = {
                          type: inputType,
                        };
                        return memo;
                      },
                      {} as GraphileInputFieldConfigMap<any, any>
                    ),
                  };
                },
                ""
              );
              const computedHavingInputName =
                inflection.aggregateHavingAggregateComputedColumnInputType({
                  source,
                  aggregateSpec,
                  computedColumnSource,
                });
              const ComputedHavingInput = build.registerInputObjectType(
                computedHavingInputName,
                {},
                () => {
                  const havingFilterTypeName =
                    build.pgHavingFilterTypeNameForCodec(
                      computedColumnSource.codec
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
                    return { fields: {} };
                  }
                  return {
                    fields: {
                      ...(ArgsType
                        ? {
                            args: {
                              type: ArgsType,
                            },
                          }
                        : null),
                      filter: {
                        type: HavingFilterType,
                      },
                    },
                  };
                },
                ""
              );
            }

            const typeName = inflection.aggregateHavingAggregateInputType({
              source,
              aggregateSpec,
            });
            const name = typeName;
            build.registerInputObjectType(
              typeName,
              {},
              () => ({
                name: typeName,
                fields: ({ fieldWithHooks }) => {
                  let fields = Object.create(
                    null
                  ) as GraphileInputFieldConfigMap<any, any>;

                  fields = build.extend(
                    fields,
                    Object.entries(source.codec.columns).reduce(
                      (
                        newFields,
                        [columnName, column]: [string, PgTypeColumn]
                      ) => {
                        const fieldName = inflection.column({
                          codec: source.codec,
                          columnName,
                        });
                        const havingFilterTypeName =
                          build.pgHavingFilterTypeNameForCodec(column.codec);
                        const HavingFilterType = havingFilterTypeName
                          ? build.getTypeByName(havingFilterTypeName)
                          : undefined;
                        if (!HavingFilterType) {
                          return newFields;
                        }
                        const newField = fieldWithHooks({ fieldName }, () => ({
                          type: HavingFilterType,
                          /*
                            extensions: {
                              graphile: {
                                toSql(
                                  val: any,
                                  details: {
                                    aggregateSpec: AggregateSpec;
                                    tableAlias: SQL;
                                  }
                                ) {
                                  const { tableAlias, aggregateSpec } = details;
                                  const columnExpression = sql.fragment`${tableAlias}.${sql.identifier(
                                    attr.name
                                  )}`;
                                  const aggregateExpression =
                                    aggregateSpec.sqlAggregateWrap(
                                      columnExpression
                                    );
                                  return (
                                    HavingFilterType.extensions?.graphile?.toSql?.(
                                      val,
                                      { ...details, aggregateExpression }
                                    ) ?? sql.true
                                  );
                                },
                              },
                            },
                            */
                        }));
                        return build.extend(
                          newFields,
                          { [fieldName]: newField },
                          `Adding column '${columnName}' to having filter type for '${source.name}'`
                        );
                      },
                      {}
                    ),
                    ""
                  );

                  fields = build.extend(
                    fields,
                    computedColumnSources.reduce(
                      (memo, computedColumnSource) => {
                        const codec = computedColumnSource.codec;
                        if (
                          (aggregateSpec.shouldApplyToEntity &&
                            !aggregateSpec.shouldApplyToEntity({
                              type: "computedColumn",
                              source: computedColumnSource,
                            })) ||
                          !aggregateSpec.isSuitableType(codec)
                        ) {
                          return memo;
                        }
                        const argsTypeName =
                          inflection.aggregateHavingAggregateComputedColumnArgsInputType(
                            {
                              source,
                              aggregateSpec,
                              computedColumnSource,
                            }
                          );
                        const havingFilterTypeName =
                          build.pgHavingFilterTypeNameForCodec(
                            computedColumnSource.codec
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
                          inflection.aggregateHavingAggregateComputedColumnInputType(
                            {
                              source,
                              aggregateSpec,
                              computedColumnSource,
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
                        const fieldName = inflection.aggregatesField({
                          aggregateSpec,
                        });
                        const newField = fieldWithHooks(
                          { fieldName },
                          {
                            type: ComputedHavingInput,
                            /*
                            extensions: {
                              graphile: {
                                toSql(
                                  val: { args?: any; filter: any },
                                  details: any
                                ) {
                                  const { tableAlias, aggregateSpec } = details;
                                  const functionCallExpression =
                                    makeSqlFunctionCall(val.args, {
                                      implicitArgs: [tableAlias],
                                    });
                                  const aggregateExpression =
                                    aggregateSpec.sqlAggregateWrap(
                                      functionCallExpression
                                    );
                                  return HavingFilterType.extensions.graphile.toSql(
                                    val.filter,
                                    { ...details, aggregateExpression }
                                  );
                                },
                              },
                            },
                            */
                          }
                        );
                        return build.extend(
                          memo,
                          { [fieldName]: newField },
                          `Adding computed column function '${computedColumnSource.name}' to having filter type for '${source.name}'`
                        );
                      },
                      Object.create(null) as GraphileInputFieldConfigMap<
                        any,
                        any
                      >
                    ),
                    ""
                  );

                  return fields;
                },
                /*
                extensions: {
                  graphile: {
                    toSql(argValue: any, details: any) {
                      const fragments: SQL[] = [];
                      if (argValue != null) {
                        const fields = SpecInput.getFields();
                        Object.keys(fields).forEach((fieldName) => {
                          const field = fields[fieldName];
                          const value = argValue[fieldName];
                          if (value == null) {
                            return;
                          }
                          const toSql = field.extensions?.graphile?.toSql;
                          if (typeof toSql === "function") {
                            fragments.push(toSql(value, details));
                          }
                        });
                      }
                      return fragments.length > 0
                        ? sql.fragment`(${sql.join(fragments, ") AND (")})`
                        : sql.true;
                    },
                  },
                },
                */
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
          graphql: { GraphQLInputObjectType },
        } = build;
        const {
          scope: {
            isPgHavingFilterInputType,
            pgHavingFilterSpec,
            isPgAggregateHavingInputType,
            pgTypeSource: table,
          },
          fieldWithHooks,
        } = context;
        let fields = inFields;
        fields = (() => {
          if (
            !isPgAggregateHavingInputType ||
            !table ||
            table.parameters ||
            !table.codec.columns
          ) {
            return fields;
          }
          return build.extend(
            fields,
            build.pgAggregateSpecs.reduce(
              (aggregateFields: any, aggregateSpec: AggregateSpec) => {
                const typeName = inflection.aggregateHavingAggregateInputType({
                  source: table,
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
                        /*
                        extensions: {
                          graphile: {
                            toSql(val: any, details: any) {
                              return (
                                SpecInput.extensions?.graphile?.toSql?.(val, {
                                  ...details,
                                  aggregateSpec,
                                }) ?? sql.true
                              );
                            },
                          },
                        },
                        */
                      }
                    ),
                  },
                  ""
                );
              },
              {}
            ),
            `Adding columns to having filter for '${table.name}'`
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
                    /*
                    extensions: {
                      graphile: {
                        toSql(val: any, details: { aggregateExpression: SQL }) {
                          if (val != null) {
                            const { aggregateExpression } = details;

                            return sql.fragment`(${aggregateExpression} ${infix} ${gql2pg(
                              val,
                              pgType,
                              null
                            )})`;
                          } else {
                            return sql.true;
                          }
                        },
                      },
                    },
                    */
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
