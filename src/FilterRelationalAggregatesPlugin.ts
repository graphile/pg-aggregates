import {
  PgTypeCodec,
  PgTypeColumns,
  PgConditionStep,
  PgConditionCapableParentStep,
  pgWhereConditionSpecListToSQL,
} from "@dataplan/pg";
import {
  ModifierStep,
  ExecutableStep,
  FieldArgs,
  GraphileInputFieldConfigMap,
} from "grafast";
import "postgraphile-plugin-connection-filter";
import type { GraphQLInputObjectType } from "graphql";
import { PgSQL, SQL } from "pg-sql2";
import { PgWhereConditionSpec } from "@dataplan/pg/dist/steps/pgCondition";
import { AggregateSpec } from "./interfaces";

const { version } = require("../package.json");

export const Plugin: GraphileConfig.Plugin = {
  name: "PgAggregatesFilterRelationalAggregatesPlugin",
  version,

  // This has to run AFTER any plugins that provide `build.pgAggregateSpecs`
  // otherwise we might add codecs to build.allPgCodecs before all the relevant
  // codecs/specs are available.
  after: ["PgCodecsPlugin", "aggregates"],
  provides: ["codecs"],
  before: ["PgConnectionArgFilterPlugin"],

  inflection: {
    add: {
      // TODO: rename this!
      filterTableAggregateType(_preset, foreignTable, spec) {
        const foreignTableTypeName = this.tableType(foreignTable.codec);
        return this.filterType(
          foreignTableTypeName + this.upperCamelCase(spec.id) + "Aggregate"
        );
      },
    },
  },

  schema: {
    hooks: {
      build(build) {
        if (!build.allPgCodecs) {
          throw new Error(
            "PgAggregatesFilterRelationalAggregatesPlugin must run after build.allPgCodecs has been established"
          );
        }
        if (!build.pgAggregateSpecs) {
          throw new Error(
            "PgAggregatesFilterRelationalAggregatesPlugin must run after build.pgAggregateSpecs has been established"
          );
        }

        // Add aggregate derivative codecs to `allPgCodecs`
        for (const spec of build.pgAggregateSpecs) {
          if (!spec.pgTypeCodecModifier) {
            continue;
          }
          for (const existingCodec of build.allPgCodecs) {
            if (spec.isSuitableType(existingCodec)) {
              const codec = spec.pgTypeCodecModifier(existingCodec);
              if (!build.allPgCodecs.has(codec)) {
                build.allPgCodecs.add(codec);
              }
            }
          }
        }

        return build;
      },

      init(_, build, context) {
        const { inflection } = build;

        // Register the aggregate filter type for each table
        for (const foreignTable of build.input.pgSources) {
          if (foreignTable.parameters || !foreignTable.codec.columns) {
            continue;
          }
          // TODO: if behavior includes filter:aggregates

          const foreignTableTypeName = inflection.tableType(foreignTable.codec);
          const foreignTableFilterTypeName =
            inflection.filterType(foreignTableTypeName);
          const foreignTableAggregateFilterTypeName = inflection.filterType(
            foreignTableTypeName + "Aggregates"
          );

          build.recoverable(null, () => {
            // TODO: inflect
            const filterFieldName = "filter";
            build.registerInputObjectType(
              foreignTableAggregateFilterTypeName,
              {
                pgSource: foreignTable,
                isPgConnectionAggregateFilter: true,
              },
              () => {
                const type = build.getTypeByName(
                  foreignTableFilterTypeName
                ) as GraphQLInputObjectType;
                if (!type) {
                  return {};
                }
                return {
                  description: `A filter to be used against aggregates of \`${foreignTableTypeName}\` object types.`,
                  fields: {
                    [filterFieldName]: {
                      description: `A filter that must pass for the relevant \`${foreignTableTypeName}\` object to be included within the aggregate.`,
                      type,
                      applyPlan(
                        $subquery: PgAggregateConditionStep<any>,
                        fieldArgs: FieldArgs
                      ) {
                        // Enable all the helpers
                        const $condition = new PgConditionStep(
                          $subquery,
                          false,
                          "AND"
                        );
                        fieldArgs.apply($condition);
                      },
                    },
                  },
                };
              },
              "Adding aggregate filter input type"
            );
          });

          // Register the aggregate spec filter type for each aggreage spec for each source
          for (const spec of build.pgAggregateSpecs) {
            const filterTypeName = inflection.filterTableAggregateType(
              foreignTable,
              spec
            );
            build.registerInputObjectType(
              filterTypeName,
              {
                isPgConnectionAggregateAggregateFilter: true,
                pgConnectionAggregateFilterAggregateSpec: spec,
                pgTypeSource: foreignTable,
              },
              () => ({}),
              `Add '${spec.id}' aggregate filter type for '${foreignTableTypeName}'`
            );
          }
        }

        return _;
      },

      // This hook adds 'aggregates' under a "backwards" relation, siblings of
      // every, some, none.
      // See https://github.com/graphile-contrib/postgraphile-plugin-connection-filter/blob/6223cdb1d2ac5723aecdf55f735a18f8e2b98683/src/PgConnectionArgFilterBackwardRelationsPlugin.ts#L374
      GraphQLInputObjectType_fields(inFields, build, context) {
        let fields = inFields;
        const { extend, inflection, sql, pgAggregateSpecs } = build;
        const {
          fieldWithHooks,
          scope: {
            foreignTable,
            isPgConnectionFilterMany,
            isPgConnectionAggregateFilter,
            pgSource,
            isPgConnectionAggregateAggregateFilter,
            pgConnectionAggregateFilterAggregateSpec: spec,
            pgTypeSource,
          },
        } = context;

        // Add 'aggregates' field to relation filters, next to `every`/`some`/`none`
        fields = (() => {
          if (!isPgConnectionFilterMany || !foreignTable) return fields;

          const foreignTableTypeName = inflection.tableType(foreignTable.codec);
          const foreignTableAggregateFilterTypeName = inflection.filterType(
            foreignTableTypeName + "Aggregates"
          );

          const fieldName = "aggregates";

          const AggregateType = build.getTypeByName(
            foreignTableAggregateFilterTypeName
          );
          if (!AggregateType) {
            return fields;
          }

          return build.extend(
            fields,
            {
              [fieldName]: fieldWithHooks(
                {
                  fieldName,
                  isPgConnectionFilterAggregatesField: true,
                },
                {
                  description: `Aggregates across related \`${foreignTableTypeName}\` match the filter criteria.`,
                  type: AggregateType,
                  applyPlan(
                    $where: PgConditionStep<any>,
                    fieldArgs: FieldArgs
                  ) {
                    // assertAllowed(fieldArgs, "object");
                    if (!$where.extensions.pgFilterRelation) {
                      throw new Error(
                        `Invalid use of filter, 'pgFilterRelation' expected`
                      );
                    }
                    const {
                      localColumns,
                      remoteColumns,
                      tableExpression,
                      alias,
                    } = $where.extensions.pgFilterRelation;
                    const $subQuery = new PgAggregateConditionStep($where, {
                      sql,
                      tableExpression,
                      alias,
                    });
                    localColumns.forEach((localColumn, i) => {
                      const remoteColumn = remoteColumns[i];
                      $subQuery.where(
                        sql`${$where.alias}.${sql.identifier(
                          localColumn as string
                        )} = ${$subQuery.alias}.${sql.identifier(
                          remoteColumn as string
                        )}`
                      );
                    });
                    fieldArgs.apply($subQuery);
                  },
                }
              ),
            },
            "Adding 'aggregates' filter field on relation"
          );
        })();

        // This hook adds our various aggregates to the 'aggregates' input defined in `AggregateType` above
        fields = (() => {
          if (
            !isPgConnectionAggregateFilter ||
            !pgSource ||
            pgSource.parameters ||
            !pgSource.codec.columns
          ) {
            return fields;
          }
          const foreignTable = pgSource;

          const foreignTableTypeName = inflection.tableType(foreignTable.codec);

          return pgAggregateSpecs.reduce((memo, spec) => {
            const filterTypeName = inflection.filterTableAggregateType(
              foreignTable,
              spec
            );
            const fieldName = inflection.camelCase(spec.id);

            const type = build.getTypeByName(filterTypeName);
            if (!type) {
              return memo;
            }
            return extend(
              memo,
              {
                [fieldName]: fieldWithHooks({ fieldName }, () => ({
                  type,
                  description: `${spec.HumanLabel} aggregate over matching \`${foreignTableTypeName}\` objects.`,
                  applyPlan(
                    $subquery: PgAggregateConditionStep<any>,
                    fieldArgs: FieldArgs
                  ) {
                    fieldArgs.apply($subquery.forAggregate(spec));
                  },
                })),
              },
              `Adding aggregate '${spec.id}' filter input for '${pgSource.name}'. `
            );
          }, fields);
        })();

        // This hook adds matching columns to the relevant aggregate types.
        fields = (() => {
          if (
            !isPgConnectionAggregateAggregateFilter ||
            !spec ||
            !pgTypeSource ||
            pgTypeSource.parameters ||
            !pgTypeSource.codec.columns
          ) {
            return fields;
          }
          const table = pgTypeSource;

          const columns: PgTypeColumns = table.codec.columns;

          return extend(
            fields,
            {
              ...Object.entries(columns).reduce(
                (memo, [columnName, column]) => {
                  if (
                    (spec.shouldApplyToEntity &&
                      !spec.shouldApplyToEntity({
                        type: "column",
                        codec: table.codec,
                        columnName,
                      })) ||
                    !spec.isSuitableType(column.codec)
                  ) {
                    return memo;
                  }
                  const attrCodec = spec.pgTypeCodecModifier
                    ? spec.pgTypeCodecModifier(column.codec)
                    : column.codec;
                  const fieldName = inflection.column({
                    codec: table.codec,
                    columnName,
                  });

                  const digest =
                    build.connectionFilterOperatorsDigest(attrCodec);
                  if (!digest) {
                    return memo;
                  }
                  const OperatorsType = build.getTypeByName(
                    digest.operatorsTypeName
                  ) as GraphQLInputObjectType;

                  if (!OperatorsType) {
                    return memo;
                  }

                  const codec = spec.pgTypeCodecModifier
                    ? spec.pgTypeCodecModifier(column.codec)
                    : column.codec;
                  return build.extend(
                    memo,
                    {
                      [fieldName]: {
                        type: OperatorsType,
                        applyPlan(
                          $parent: PgAggregateConditionExpressionStep,
                          fieldArgs: FieldArgs
                        ) {
                          const $col = new PgConditionStep($parent);
                          $col.extensions.pgFilterColumn = {
                            codec,
                            expression: spec.sqlAggregateWrap(
                              sql`${$col.alias}.${sql.identifier(columnName)}`
                            ),
                          };

                          fieldArgs.apply($col);
                        },
                      },
                    },
                    `Add aggregate '${columnName}' filter for source '${table.name}' for spec '${spec.id}'`
                  );
                },
                Object.create(null) as GraphileInputFieldConfigMap<any, any>
              ),

              /*
              ...pgIntrospectionResultsByKind.procedure.reduce((memo, proc) => {
                if (proc.returnsSet) {
                  return memo;
                }
                const type =
                  pgIntrospectionResultsByKind.typeById[proc.returnTypeId];
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

                const OperatorsType: GraphQLInputObjectType | undefined =
                  connectionFilterOperatorsType(newWithHooks, type.id, null);

                if (!OperatorsType) {
                  return memo;
                }

                const resolve: ConnectionFilterResolver = ({
                  sourceAlias,
                  fieldName,
                  fieldValue,
                  queryBuilder,
                }) => {
                  if (fieldValue == null) return null;
                  const sqlComputedColumnCall = sql.query`${sql.identifier(
                    proc.namespaceName,
                    proc.name
                  )}(${sourceAlias})`;
                  const sqlAggregate = spec.sqlAggregateWrap(
                    sqlComputedColumnCall
                  );
                  const frag = connectionFilterResolve(
                    fieldValue,
                    sqlAggregate,
                    OperatorsType.name,
                    queryBuilder,
                    type,
                    null,
                    fieldName
                  );
                  return frag;
                };
                connectionFilterRegisterResolver(Self.name, fieldName, resolve);

                return build.extend(memo, {
                  [fieldName]: {
                    type: OperatorsType,
                  },
                });
              }, Object.create(null) as GraphQLInputFieldConfigMap),
              */
            },
            `Adding per-column '${spec.id}' aggregate filters for '${pgTypeSource.name}'`
          );
        })();

        return fields;
      },
    },
  },
};

export { Plugin as PgAggregatesFilterRelationalAggregatesPlugin };

class PgAggregateConditionStep<TParentStep extends PgConditionCapableParentStep>
  extends ModifierStep<TParentStep>
  implements PgConditionCapableParentStep
{
  sql: PgSQL;
  tableExpression: SQL;
  alias: SQL;
  conditions: PgWhereConditionSpec<any>[] = [];
  expressions: SQL[] = [];
  constructor(
    $parent: TParentStep,
    options: {
      sql: PgSQL;
      tableExpression: SQL;
      alias?: string;
    }
  ) {
    super($parent);
    const { sql, tableExpression, alias } = options;
    this.sql = sql;
    this.alias = sql.identifier(Symbol(alias ?? "aggregate"));
    this.tableExpression = tableExpression;
  }

  placeholder(
    $step: ExecutableStep<any>,
    codec: PgTypeCodec<any, any, any, any>
  ): SQL {
    return this.$parent.placeholder($step, codec);
  }

  where(condition: PgWhereConditionSpec<any>): void {
    this.conditions.push(condition);
  }

  expression(expression: SQL): void {
    this.expressions.push(expression);
  }

  forAggregate(spec: AggregateSpec): PgAggregateConditionExpressionStep {
    return new PgAggregateConditionExpressionStep(this, spec);
  }

  apply(): void {
    const { sql } = this;

    const sqlCondition = pgWhereConditionSpecListToSQL(
      this.alias,
      this.conditions
    );
    const where = sqlCondition ? sql`where ${sqlCondition}` : sql.blank;
    const boolExpr =
      this.expressions.length === 0
        ? sql.true
        : sql.parens(
            sql.join(
              this.expressions.map((expr) => sql.parens(expr)),
              "\nand\n"
            )
          );
    const subquery = sql`(${sql.indent`\
select ${boolExpr}
from ${this.tableExpression} as ${this.alias}
${where}`}
group by true)`;
    return this.$parent.where(subquery);
  }
}

class PgAggregateConditionExpressionStep
  extends ModifierStep<PgAggregateConditionStep<any>>
  implements PgConditionCapableParentStep
{
  alias: SQL;
  conditions: PgWhereConditionSpec<any>[] = [];
  constructor(
    $parent: PgAggregateConditionStep<any>,
    private spec: AggregateSpec
  ) {
    super($parent);
    this.alias = $parent.alias;
  }

  placeholder(
    $step: ExecutableStep<any>,
    codec: PgTypeCodec<any, any, any, any>
  ): SQL {
    return this.$parent.placeholder($step, codec);
  }

  where(condition: PgWhereConditionSpec<any>): void {
    this.conditions.push(condition);
  }

  apply(): void {
    const sqlCondition = pgWhereConditionSpecListToSQL(
      this.alias,
      this.conditions
    );
    if (sqlCondition) {
      this.$parent.expression(sqlCondition);
    }
  }
}
