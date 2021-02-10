import type { GraphQLFieldConfigMap, GraphQLInputObjectType } from "graphql";
import type { Plugin } from "graphile-build";
import type { PgClass, PgProc, PgType, SQL } from "graphile-build-pg";
import {
  // @ts-ignore
  getComputedColumnDetails,
} from "graphile-build-pg";
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
} from "./interfaces";

const AddHavingAggregateTypesPlugin: Plugin = (builder) => {
  builder.hook("build", (build, _build, _context) => {
    const havingFilterByName: {
      [name: string]: GraphQLInputObjectType;
    } = {};
    function getHavingFilter(spec: string): GraphQLInputObjectType {
      const {
        newWithHooks,
        graphql: { GraphQLInputObjectType },
      } = build;

      const name = build.inflection.upperCamelCase(`having-${spec}-filter`);
      if (!(name in havingFilterByName)) {
        havingFilterByName[name] = newWithHooks(
          GraphQLInputObjectType,
          {
            name,
            fields: {},
          },
          {
            isPgHavingFilterInputType: true,
            pgHavingFilterSpec: spec,
          },
          true
        );
      }
      return havingFilterByName[name];
    }
    return build.extend(build, {
      pgHavingFilterTypeForTypeAndModifier(
        type: PgType,
        _modifier: null | number | string
      ) {
        switch (type.id) {
          case INT2_OID:
          case INT4_OID: {
            return getHavingFilter("int");
          }
          case BIGINT_OID: {
            return getHavingFilter("bigint");
          }
          case FLOAT4_OID:
          case FLOAT8_OID: {
            return getHavingFilter("float");
          }
          case MONEY_OID:
          case NUMERIC_OID: {
            return getHavingFilter("bigfloat");
          }
          case DATE_OID:
          case TIMESTAMP_OID:
          case TIMESTAMPTZ_OID: {
            return getHavingFilter("datetime");
          }
          case CHAR_OID:
          case TEXT_OID:
          case VARCHAR_OID: {
            return getHavingFilter("string");
          }
          default: {
            return null;
          }
        }
      },
    });
  });

  builder.hook(
    "init",
    (_, build) => {
      const {
        newWithHooks,
        pgIntrospectionResultsByKind: introspectionResultsByKind,
        graphql: { GraphQLInputObjectType, GraphQLList, GraphQLNonNull },
        inflection,
        pgOmit: omit,
        sqlCommentByAddingTags,
        describePgEntity,
      } = build;
      introspectionResultsByKind.class.forEach((table: PgClass) => {
        if (!table.isSelectable || omit(table, "order")) return;
        if (!table.namespace) return;

        const tableTypeName = inflection.tableType(table);
        const TableHavingInputType = newWithHooks(
          GraphQLInputObjectType,
          {
            name: inflection.aggregateHavingInputType(table),
            description: build.wrapDescription(
              `Conditions for \`${tableTypeName}\` aggregates.`,
              "type"
            ),
            fields: () => {
              return {
                AND: {
                  type: new GraphQLList(
                    new GraphQLNonNull(TableHavingInputType)
                  ),
                },
                OR: {
                  type: new GraphQLList(
                    new GraphQLNonNull(TableHavingInputType)
                  ),
                },
              };
            },
          },
          {
            __origin: `Adding connection "groupBy" having input type for ${describePgEntity(
              table
            )}. You can rename the table's GraphQL type via a 'Smart Comment':\n\n  ${sqlCommentByAddingTags(
              table,
              {
                name: "newNameHere",
              }
            )}`,
            pgIntrospection: table,
            isPgAggregateHavingInputType: true,
          }
        );
      });
      return _;
    },
    ["AddHavingAggregateTypesPlugin"]
  );

  builder.hook(
    "GraphQLInputObjectType:fields",
    function AddHavingAggregateTypesPluginAddColumns(fields, build, context) {
      const {
        inflection,
        graphql: { GraphQLInputObjectType },
        newWithHooks,
        pgIntrospectionResultsByKind,
      } = build;
      const {
        scope: { isPgAggregateHavingInputType, pgIntrospection },
        fieldWithHooks,
      } = context;
      if (!isPgAggregateHavingInputType || pgIntrospection.kind !== "class") {
        return fields;
      }
      const table: PgClass = pgIntrospection;
      return build.extend(
        fields,
        build.pgAggregateSpecs.reduce((aggregateFields, spec) => {
          const typeName = inflection.aggregateHavingAggregateInputType(
            table,
            spec
          );
          const SpecInput = newWithHooks(
            GraphQLInputObjectType,
            {
              name: typeName,
              fields: ({ fieldWithHooks }) => {
                let fields = {};

                fields = build.extend(
                  fields,
                  table.attributes.reduce((newFields, attr) => {
                    const fieldName = inflection.column(attr);
                    const HavingFilterType = build.pgHavingFilterTypeForTypeAndModifier(
                      attr.type,
                      attr.typeModifier
                    );
                    if (!HavingFilterType) {
                      console.log(
                        `No matching filter type for '${attr.type.id}'`
                      );
                      return newFields;
                    }
                    const newField = fieldWithHooks(
                      fieldName,
                      {
                        type: HavingFilterType,
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
                    (memo: GraphQLFieldConfigMap<any, any>, proc: PgProc) => {
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

                      const returnType = pgIntrospectionResultsByKind.type.find(
                        (t: PgType) => t.id === proc.returnTypeId
                      );
                      if (!returnType) {
                        throw new Error(
                          `Could not find return type for function '${proc.returnTypeId}'`
                        );
                      }
                      const HavingFilterType = build.pgHavingFilterTypeForTypeAndModifier(
                        returnType,
                        null
                      );
                      if (!HavingFilterType) {
                        console.log(
                          `No matching filter type for '${returnType.id}'`
                        );
                        return memo;
                      }
                      console.log(returnType.name, HavingFilterType);
                      const ComputedHavingInput = newWithHooks(
                        GraphQLInputObjectType,
                        {
                          name: inflection.aggregateHavingAggregateComputedColumnInputType(
                            table,
                            spec,
                            proc
                          ),
                          fields: {
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
              fieldName,
              {
                type: SpecInput,
              },
              {}
            ),
          });
        }, {}),
        `Adding columns to having filter for '${table.namespaceName}.${table.name}'`
      );
    }
  );

  builder.hook(
    "GraphQLInputObjectType:fields",
    function AddHavingAggregateTypesPluginAddHavingFilters(
      fields,
      build,
      context
    ) {
      const {
        inflection,
        graphql: { GraphQLInt, GraphQLFloat },
        pgSql: sql,
        getTypeByName,
      } = build;
      const {
        scope: { isPgHavingFilterInputType, pgHavingFilterSpec },
        fieldWithHooks,
      } = context;
      if (!isPgHavingFilterInputType) {
        return fields;
      }
      const FieldType = (() => {
        switch (pgHavingFilterSpec) {
          case "int": {
            return GraphQLInt;
          }
          case "bigint": {
            return getTypeByName(inflection.builtin("BigInt"));
          }
          case "float": {
            return GraphQLFloat;
          }
          case "bigfloat": {
            return getTypeByName(inflection.builtin("BigFloat"));
          }
          case "datetime": {
            return getTypeByName(inflection.builtin("Datetime"));
          }
          default: {
            return null;
          }
        }
      })();

      if (FieldType === null) {
        return fields;
      }
      function addBinaryOp(fieldName: string, infix: SQL) {
        fields = build.extend(fields, {
          [fieldName]: fieldWithHooks(
            fieldName,
            {
              type: FieldType,
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
    }
  );
};

export default AddHavingAggregateTypesPlugin;
