import { PgTypeCodec, TYPES } from "@dataplan/pg";
import { getBehavior } from "graphile-build-pg/dist/behavior";
import type { GraphQLFieldConfigMap, GraphQLInputObjectType } from "graphql";
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

const { version } = require("../package.json");

export { Plugin as PgAggregatesAddHavingAggregateTypesPlugin };

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
          const behavior = getBehavior([
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
        }

        return _;
      },

      GraphQLInputObjectType_fields(inFields, build, context) {
        let fields = inFields;
        fields = (() => {
          const {
            inflection,
            graphql: { GraphQLInputObjectType },
            sql,
          } = build;
          const {
            scope: { isPgAggregateHavingInputType, pgTypeSource: table },
            fieldWithHooks,
          } = context;
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
              (aggregateFields: any, spec: AggregateSpec) => {
                const typeName = inflection.aggregateHavingAggregateInputType(
                  table,
                  spec
                );
                const SpecInput = newWithHooks(
                  GraphQLInputObjectType,
                  {
                    name: typeName,
                    fields: ({ fieldWithHooks }: any) => {
                      let fields = {};

                      fields = build.extend(
                        fields,
                        table.attributes.reduce((newFields, attr) => {
                          const fieldName = inflection.column(attr);
                          const HavingFilterType =
                            build.pgHavingFilterTypeForTypeAndModifier(
                              attr.type,
                              attr.typeModifier
                            );
                          if (!HavingFilterType) {
                            return newFields;
                          }
                          const newField = fieldWithHooks(
                            fieldName,
                            {
                              type: HavingFilterType,
                              extensions: {
                                graphile: {
                                  toSql(
                                    val: any,
                                    details: {
                                      aggregateSpec: AggregateSpec;
                                      tableAlias: SQL;
                                    }
                                  ) {
                                    const { tableAlias, aggregateSpec } =
                                      details;
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
                            },
                            {}
                          );
                          return build.extend(
                            newFields,
                            { [fieldName]: newField },
                            `Adding column '${attr.name}' to having filter type for '${table.namespaceName}.${table.name}'`
                          );
                        }, {})
                      );

                      fields = build.extend(
                        fields,
                        pgIntrospectionResultsByKind.procedure.reduce(
                          (
                            memo: GraphQLFieldConfigMap<any, any>,
                            proc: PgProc
                          ) => {
                            if (proc.returnsSet) {
                              return memo;
                            }
                            const type =
                              pgIntrospectionResultsByKind.typeById[
                                proc.returnTypeId
                              ];
                            if (
                              (spec.shouldApplyToEntity &&
                                !spec.shouldApplyToEntity(proc)) ||
                              !spec.isSuitableType(type)
                            ) {
                              return memo;
                            }
                            const computedColumnDetails =
                              getComputedColumnDetails(build, table, proc);
                            if (!computedColumnDetails) {
                              return memo;
                            }
                            const details = procFieldDetails(proc, build, {
                              computed: true,
                            });
                            const { inputs, makeSqlFunctionCall } = details;
                            const { pseudoColumnName } = computedColumnDetails;
                            const fieldName = inflection.computedColumn(
                              pseudoColumnName,
                              proc,
                              table
                            );

                            const returnType =
                              pgIntrospectionResultsByKind.type.find(
                                (t: PgType) => t.id === proc.returnTypeId
                              );
                            if (!returnType) {
                              throw new Error(
                                `Could not find return type for function '${proc.returnTypeId}'`
                              );
                            }
                            const HavingFilterType =
                              build.pgHavingFilterTypeForTypeAndModifier(
                                returnType,
                                null
                              );
                            if (!HavingFilterType) {
                              return memo;
                            }
                            const ArgsType = newWithHooks(
                              GraphQLInputObjectType,
                              {
                                name: inflection.aggregateHavingAggregateComputedColumnArgsInputType(
                                  table,
                                  spec,
                                  proc
                                ),
                                fields: inputs,
                              },
                              {},
                              true
                            );
                            const ComputedHavingInput = newWithHooks(
                              GraphQLInputObjectType,
                              {
                                name: inflection.aggregateHavingAggregateComputedColumnInputType(
                                  table,
                                  spec,
                                  proc
                                ),
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
                              },
                              {}
                            );
                            const newField = fieldWithHooks(
                              fieldName,
                              {
                                type: ComputedHavingInput,
                                extensions: {
                                  graphile: {
                                    toSql(
                                      val: { args?: any; filter: any },
                                      details: any
                                    ) {
                                      const { tableAlias, aggregateSpec } =
                                        details;
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
                              },
                              {}
                            );
                            return build.extend(
                              memo,
                              { [fieldName]: newField },
                              `Adding computed column function '${proc.namespaceName}.${proc.name}' to having filter type for '${table.namespaceName}.${table.name}'`
                            );
                          },
                          {}
                        )
                      );

                      return fields;
                    },
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
                  },
                  {},
                  true
                );
                if (!SpecInput) {
                  return aggregateFields;
                }
                const fieldName = inflection.aggregatesField(spec);
                return build.extend(aggregateFields, {
                  [fieldName]: fieldWithHooks(
                    fieldName, // e.g. 'average' or 'stddevPopulation'
                    {
                      type: SpecInput,
                      extensions: {
                        graphile: {
                          toSql(val: any, details: any) {
                            return (
                              SpecInput.extensions?.graphile?.toSql?.(val, {
                                ...details,
                                aggregateSpec: spec,
                              }) ?? sql.true
                            );
                          },
                        },
                      },
                    },
                    {}
                  ),
                });
              },
              {}
            ),
            `Adding columns to having filter for '${table.namespaceName}.${table.name}'`
          );
        })();

        fields = (() => {
          const { pgSql: sql, pgIntrospectionResultsByKind, gql2pg } = build;
          const {
            scope: { isPgHavingFilterInputType, pgHavingFilterSpec },
            fieldWithHooks,
          } = context;
          if (!isPgHavingFilterInputType) {
            return fields;
          }
          const pgType = (() => {
            switch (pgHavingFilterSpec) {
              case "int": {
                return pgIntrospectionResultsByKind.type.find(
                  (t: PgType) => t.id === INT4_OID
                );
              }
              case "bigint": {
                return pgIntrospectionResultsByKind.type.find(
                  (t: PgType) => t.id === BIGINT_OID
                );
              }
              case "float": {
                return pgIntrospectionResultsByKind.type.find(
                  (t: PgType) => t.id === FLOAT8_OID
                );
              }
              case "bigfloat": {
                return pgIntrospectionResultsByKind.type.find(
                  (t: PgType) => t.id === NUMERIC_OID
                );
              }
              case "datetime": {
                return pgIntrospectionResultsByKind.type.find(
                  (t: PgType) => t.id === TIMESTAMPTZ_OID
                );
              }
              default: {
                return null;
              }
            }
          })();

          if (pgType === null) {
            return fields;
          }
          const FieldType = build.pgGetGqlInputTypeByTypeIdAndModifier(
            pgType.id,
            null
          );
          if (FieldType === null) {
            return fields;
          }

          function addBinaryOp(fieldName: string, infix: SQL) {
            fields = build.extend(fields, {
              [fieldName]: fieldWithHooks(
                fieldName,
                {
                  type: FieldType,
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
                },
                {}
              ),
            });
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

export default AddHavingAggregateTypesPlugin;
