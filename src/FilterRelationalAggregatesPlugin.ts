import type {
  PgCodec,
  PgCodecAttributes,
  PgConditionCapableParentStep,
  PgConditionStep,
  PgWhereConditionSpec,
} from "@dataplan/pg";
import type {
  ExecutableStep,
  FieldArgs,
  GrafastInputFieldConfigMap,
  ModifierStep,
} from "grafast";
import type {} from "graphile-build";
import type { GraphQLInputObjectType } from "graphql";
import type { PgSQL, SQL } from "pg-sql2";
import type {} from "postgraphile-plugin-connection-filter";

import type { AggregateSpec } from "./interfaces.js";

const { version } = require("../package.json");

declare global {
  namespace GraphileBuild {
    interface Build {
      PgAggregateConditionStep: PgAggregateConditionStepClass;
      PgAggregateConditionExpressionStep: PgAggregateConditionExpressionStepClass;
    }
  }
}

export const Plugin: GraphileConfig.Plugin = {
  name: "PgAggregatesFilterRelationalAggregatesPlugin",
  description: `\
Adds the ability to filter a collection by aggregates on relationships if you \
have postgraphile-plugin-connection-filter, e.g. filtering all players based on \
the sum of their points scored.`,
  version,

  // This has to run AFTER any plugins that provide `build.pgAggregateSpecs`
  // otherwise we might add codecs to build.allPgCodecs before all the relevant
  // codecs/specs are available.
  after: ["PgBasicsPlugin", "PgCodecsPlugin", "aggregates"],
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
    entityBehavior: {
      pgResource: "aggregates:filterBy aggregate:filterBy",
      pgCodecAttribute: "aggregate:filterBy",
    },

    hooks: {
      build(build) {
        const {
          EXPORTABLE,
          grafast: { ModifierStep },
        } = build;

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
        const PgAggregateConditionExpressionStep = EXPORTABLE(
          (ModifierStep) =>
            class PgAggregateConditionExpressionStep
              extends ModifierStep<PgAggregateConditionStep<any>>
              implements PgConditionCapableParentStep
            {
              alias: SQL;
              conditions: PgWhereConditionSpec<any>[] = [];
              constructor(
                $parent: PgAggregateConditionStep<any>,
                private spec: AggregateSpec,
                private pgWhereConditionSpecListToSQL: GraphileBuild.Build["dataplanPg"]["pgWhereConditionSpecListToSQL"]
              ) {
                super($parent);
                this.alias = $parent.alias;
              }

              placeholder(
                $step: ExecutableStep<any>,
                codec: PgCodec<any, any, any, any>
              ): SQL {
                return this.$parent.placeholder($step, codec);
              }

              where(condition: PgWhereConditionSpec<any>): void {
                this.conditions.push(condition);
              }

              apply(): void {
                const sqlCondition = this.pgWhereConditionSpecListToSQL(
                  this.alias,
                  this.conditions
                );
                if (sqlCondition) {
                  this.$parent.expression(sqlCondition);
                }
              }
            } as PgAggregateConditionExpressionStepClass,
          [ModifierStep]
        );
        const PgAggregateConditionStep = EXPORTABLE(
          (ModifierStep, PgAggregateConditionExpressionStep) =>
            class PgAggregateConditionStep<
              TParentStep extends PgConditionCapableParentStep
            > extends ModifierStep<TParentStep> {
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
                },
                private pgWhereConditionSpecListToSQL: GraphileBuild.Build["dataplanPg"]["pgWhereConditionSpecListToSQL"]
              ) {
                super($parent);
                const { sql, tableExpression, alias } = options;
                this.sql = sql;
                this.alias = sql.identifier(Symbol(alias ?? "aggregate"));
                this.tableExpression = tableExpression;
              }

              placeholder(
                $step: ExecutableStep<any>,
                codec: PgCodec<any, any, any, any>
              ): SQL {
                return this.$parent.placeholder($step, codec);
              }

              where(condition: PgWhereConditionSpec<any>): void {
                this.conditions.push(condition);
              }

              expression(expression: SQL): void {
                this.expressions.push(expression);
              }

              forAggregate(
                spec: AggregateSpec
              ): PgAggregateConditionExpressionStep {
                return new PgAggregateConditionExpressionStep(
                  this,
                  spec,
                  this.pgWhereConditionSpecListToSQL
                );
              }

              apply(): void {
                const { sql } = this;

                const sqlCondition = this.pgWhereConditionSpecListToSQL(
                  this.alias,
                  this.conditions
                );
                const where = sqlCondition
                  ? sql`where ${sqlCondition}`
                  : sql.blank;
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
group by ())`;
                return this.$parent.where(subquery);
              }
            } as PgAggregateConditionStepClass,
          [ModifierStep, PgAggregateConditionExpressionStep]
        );

        return build.extend(
          build,
          {
            PgAggregateConditionStep,
            PgAggregateConditionExpressionStep,
          },
          "Adding step classes from postgraphile-plugin-connection-filter"
        );
      },

      init(_, build) {
        const {
          inflection,
          dataplanPg: { PgConditionStep },
          EXPORTABLE,
        } = build;

        if (!inflection.filterType) {
          // Filter plugin is not enabled
          return _;
        }

        // Register the aggregate filter type for each table
        for (const foreignTable of Object.values(
          build.input.pgRegistry.pgResources
        )) {
          if (foreignTable.parameters || !foreignTable.codec.attributes) {
            continue;
          }
          if (
            !build.behavior.pgResourceMatches(
              foreignTable,
              "resource:aggregates:filterBy"
            )
          ) {
            continue;
          }

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
                pgResource: foreignTable,
                isPgConnectionAggregateFilter: true,
              },
              (): GraphileBuild.GrafastInputObjectTypeConfig => {
                return {
                  description: `A filter to be used against aggregates of \`${foreignTableTypeName}\` object types.`,
                  fields: () => {
                    const type = build.getTypeByName(
                      foreignTableFilterTypeName
                    ) as GraphQLInputObjectType;
                    if (!type) {
                      return {} as GrafastInputFieldConfigMap<any, any>;
                    }
                    return {
                      [filterFieldName]: {
                        description: `A filter that must pass for the relevant \`${foreignTableTypeName}\` object to be included within the aggregate.`,
                        type,
                        applyPlan: EXPORTABLE(
                          (PgConditionStep) =>
                            function (
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
                          [PgConditionStep]
                        ),
                        // No need to auto-apply since we're applied manually via `fieldArgs.apply($subQuery)` below.
                      },
                    };
                  },
                };
              },
              "Adding aggregate filter input type"
            );
          });

          // Register the aggregate spec filter type for each aggreage spec for each source
          for (const spec of build.pgAggregateSpecs) {
            if (
              !build.behavior.pgResourceMatches(
                foreignTable,
                `${spec.id}:resource:aggregates:filterBy`
              )
            ) {
              continue;
            }
            const filterTypeName = inflection.filterTableAggregateType(
              foreignTable,
              spec
            );
            build.registerInputObjectType(
              filterTypeName,
              {
                isPgConnectionAggregateAggregateFilter: true,
                pgConnectionAggregateFilterAggregateSpec: spec,
                pgTypeResource: foreignTable,
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
        const {
          extend,
          inflection,
          sql,
          pgAggregateSpecs,
          dataplanPg: { PgConditionStep, pgWhereConditionSpecListToSQL },
          PgAggregateConditionStep,
          EXPORTABLE,
        } = build;

        if (!inflection.filterType) {
          // Filter plugin is not enabled
          return inFields;
        }

        const {
          fieldWithHooks,
          scope: {
            foreignTable,
            isPgConnectionFilterMany,
            isPgConnectionAggregateFilter,
            pgResource,
            isPgConnectionAggregateAggregateFilter,
            pgConnectionAggregateFilterAggregateSpec: spec,
            pgTypeResource,
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
                  applyPlan: EXPORTABLE(
                    (
                      PgAggregateConditionStep,
                      pgWhereConditionSpecListToSQL,
                      sql
                    ) =>
                      function (
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
                          localAttributes,
                          remoteAttributes,
                          tableExpression,
                          alias,
                        } = $where.extensions.pgFilterRelation;
                        const $subQuery = new PgAggregateConditionStep(
                          $where,
                          {
                            sql,
                            tableExpression,
                            alias,
                          },
                          pgWhereConditionSpecListToSQL
                        );
                        localAttributes.forEach((localAttribute, i) => {
                          const remoteAttribute = remoteAttributes[i];
                          $subQuery.where(
                            sql`${$where.alias}.${sql.identifier(
                              localAttribute as string
                            )} = ${$subQuery.alias}.${sql.identifier(
                              remoteAttribute as string
                            )}`
                          );
                        });
                        fieldArgs.apply($subQuery);
                      },
                    [
                      PgAggregateConditionStep,
                      pgWhereConditionSpecListToSQL,
                      sql,
                    ]
                  ),
                  // No need to auto-apply, postgraphile-plugin-connection-filter explicitly calls fieldArgs.apply()
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
            !pgResource ||
            pgResource.parameters ||
            !pgResource.codec.attributes
          ) {
            return fields;
          }
          const foreignTable = pgResource;

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
                  applyPlan: EXPORTABLE(
                    (spec) =>
                      function (
                        $subquery: PgAggregateConditionStep<any>,
                        fieldArgs: FieldArgs
                      ) {
                        fieldArgs.apply($subquery.forAggregate(spec));
                      },
                    [spec]
                  ),
                  // No need to auto-apply since we're applied manually via `fieldArgs.apply($subQuery)` above.
                })),
              },
              `Adding aggregate '${spec.id}' filter input for '${pgResource.name}'. `
            );
          }, fields);
        })();

        // This hook adds matching attributes to the relevant aggregate types.
        fields = (() => {
          if (
            !isPgConnectionAggregateAggregateFilter ||
            !spec ||
            !pgTypeResource ||
            pgTypeResource.parameters ||
            !pgTypeResource.codec.attributes
          ) {
            return fields;
          }
          const table = pgTypeResource;

          const attributes: PgCodecAttributes = table.codec.attributes;

          return extend(
            fields,
            {
              ...Object.entries(attributes).reduce(
                (memo, [attributeName, attribute]) => {
                  if (
                    !build.behavior.pgCodecAttributeMatches(
                      [table.codec, attributeName],
                      `${spec.id}:attribute:aggregate:filterBy`
                    )
                  ) {
                    return memo;
                  }
                  if (
                    (spec.shouldApplyToEntity &&
                      !spec.shouldApplyToEntity({
                        type: "attribute",
                        codec: table.codec,
                        attributeName: attributeName,
                      })) ||
                    !spec.isSuitableType(attribute.codec)
                  ) {
                    return memo;
                  }
                  const attrCodec = spec.pgTypeCodecModifier
                    ? spec.pgTypeCodecModifier(attribute.codec)
                    : attribute.codec;
                  const fieldName = inflection.attribute({
                    codec: table.codec,
                    attributeName,
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
                    ? spec.pgTypeCodecModifier(attribute.codec)
                    : attribute.codec;
                  return build.extend(
                    memo,
                    {
                      [fieldName]: {
                        type: OperatorsType,
                        applyPlan: EXPORTABLE(
                          (
                            PgConditionStep,
                            attribute,
                            attributeName,
                            codec,
                            spec,
                            sql
                          ) =>
                            function (
                              $parent: PgAggregateConditionExpressionStep,
                              fieldArgs: FieldArgs
                            ) {
                              const $col = new PgConditionStep($parent);
                              $col.extensions.pgFilterAttribute = {
                                codec,
                                expression: spec.sqlAggregateWrap(
                                  sql`${$col.alias}.${sql.identifier(
                                    attributeName
                                  )}`,
                                  attribute.codec
                                ),
                              };

                              fieldArgs.apply($col);
                            },
                          [
                            PgConditionStep,
                            attribute,
                            attributeName,
                            codec,
                            spec,
                            sql,
                          ]
                        ),
                        // No need to auto-apply since we're called via `fieldArgs.apply($subquery.forAggregate(spec))` above
                      },
                    },
                    `Add aggregate '${attributeName}' filter for source '${table.name}' for spec '${spec.id}'`
                  );
                },
                Object.create(null) as GrafastInputFieldConfigMap<any, any>
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
                const computedAttributeDetails = getComputedAttributeDetails(
                  build,
                  table,
                  proc
                );
                if (!computedAttributeDetails) {
                  return memo;
                }
                const { pseudoAttributeName } = computedAttributeDetails;
                const fieldName = inflection.computedAttribute(
                  pseudoAttributeName,
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
                  const sqlComputedAttributeCall = sql.query`${sql.identifier(
                    proc.namespaceName,
                    proc.name
                  )}(${sourceAlias})`;
                  const sqlAggregate = spec.sqlAggregateWrap(
                    sqlComputedAttributeCall
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
            `Adding per-attribute '${spec.id}' aggregate filters for '${pgTypeResource.name}'`
          );
        })();

        return fields;
      },
    },
  },
};

export { Plugin as PgAggregatesFilterRelationalAggregatesPlugin };

interface PgAggregateConditionStep<
  TParentStep extends PgConditionCapableParentStep
> extends ModifierStep<TParentStep> {
  sql: PgSQL;
  tableExpression: SQL;
  alias: SQL;
  conditions: PgWhereConditionSpec<any>[];
  expressions: SQL[];
  placeholder(
    $step: ExecutableStep<any>,
    codec: PgCodec<any, any, any, any>
  ): SQL;
  where(condition: PgWhereConditionSpec<any>): void;
  expression(expression: SQL): void;
  forAggregate(spec: AggregateSpec): PgAggregateConditionExpressionStep;
  apply(): void;
}

interface PgAggregateConditionStepClass {
  new <TParentStep extends PgConditionCapableParentStep>(
    $parent: TParentStep,
    options: {
      sql: PgSQL;
      tableExpression: SQL;
      alias?: string;
    },
    pgWhereConditionSpecListToSQL: GraphileBuild.Build["dataplanPg"]["pgWhereConditionSpecListToSQL"]
  ): PgAggregateConditionStep<TParentStep>;
}

interface PgAggregateConditionExpressionStep
  extends ModifierStep<PgAggregateConditionStep<any>> {
  alias: SQL;
  conditions: PgWhereConditionSpec<any>[];

  placeholder(
    $step: ExecutableStep<any>,
    codec: PgCodec<any, any, any, any>
  ): SQL;

  where(condition: PgWhereConditionSpec<any>): void;

  apply(): void;
}

interface PgAggregateConditionExpressionStepClass {
  new (
    $parent: PgAggregateConditionStep<any>,
    spec: AggregateSpec,
    pgWhereConditionSpecListToSQL: GraphileBuild.Build["dataplanPg"]["pgWhereConditionSpecListToSQL"]
  ): PgAggregateConditionExpressionStep;
}
