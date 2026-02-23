import type { PgSelectStep } from "@dataplan/pg";
import type {
  GraphQLEnumType,
  GraphQLInputType,
  GraphQLObjectType,
} from "graphql";
import type { ConnectionStep, FieldArg } from "postgraphile/grafast";

import { EXPORTABLE } from "./EXPORTABLE";

const { version } = require("../package.json");

function isValidEnum(
  build: GraphileBuild.Build,
  enumType: GraphQLEnumType | undefined
): boolean {
  try {
    if (!enumType) {
      return false;
    }
    if (!(enumType instanceof build.graphql.GraphQLEnumType)) {
      return false;
    }
    if (Object.keys(enumType.getValues()).length === 0) {
      return false;
    }
  } catch {
    return false;
  }
  return true;
}

declare global {
  namespace GraphileBuild {
    interface BehaviorStrings {
      "resource:groupedAggregates": true;
      groupedAggregates: true;
    }
  }
}
const pgAggregateCloneSubplanWithoutPaginationAsAggregate = EXPORTABLE(
  () =>
    function plan($connection: ConnectionStep<any>) {
      return $connection.cloneSubplanWithoutPagination("aggregate");
    },
  [],
  "pgAggregateCloneSubplanWithoutPaginationAsAggregate"
);

const pgAggregatesApplyGroupedAggregate = EXPORTABLE(
  () =>
    function (_$parent: any, $pgSelect: PgSelectStep, input: FieldArg) {
      return input.apply($pgSelect);
    },
  [],
  "pgAggregatesApplyGroupedAggregate"
);

const pgAggregatesApplyConditionsToGroupedAggregates = EXPORTABLE(
  () =>
    function applyPlan(
      _$parent: unknown,
      $pgSelect: PgSelectStep,
      input: FieldArg
    ) {
      return input.apply($pgSelect, (queryBuilder) =>
        queryBuilder.havingBuilder()
      );
    },
  [],
  "pgAggregatesApplyConditionsToGroupedAggregates"
);

const Plugin: GraphileConfig.Plugin = {
  name: "PgAggregatesAddConnectionGroupedAggregatesPlugin",
  description: "Adds the groupedAggregates field to connections.",
  version,
  provides: ["aggregates"],

  schema: {
    behaviorRegistry: {
      add: {
        "resource:groupedAggregates": {
          description: "Should we enable grouped aggregates on this resource?",
          entities: ["pgResource"],
        },
        groupedAggregates: {
          description: "Should we enable grouped aggregates on this resource?",
          entities: ["pgResource"],
        },
      },
    },
    entityBehavior: {
      pgResource: [
        "resource:groupedAggregates",
        "resource:groupedAggregates:having",
      ],
    },

    hooks: {
      GraphQLObjectType_fields(fields, build, context) {
        const {
          graphql: { GraphQLList, GraphQLNonNull },
          inflection,
        } = build;
        const {
          fieldWithHooks,
          scope: {
            pgCodec,
            pgTypeResource,
            isConnectionType,
            isPgConnectionRelated,
          },
        } = context;

        const table =
          pgTypeResource ??
          Object.values(build.input.pgRegistry.pgResources).find(
            (s) => s.codec === pgCodec && !s.parameters
          );

        // If it's not a table connection, abort
        if (
          !isConnectionType ||
          !isPgConnectionRelated ||
          !table ||
          table.parameters ||
          !table.codec.attributes
        ) {
          return fields;
        }

        if (
          !build.behavior.pgResourceMatches(table, `resource:groupedAggregates`)
        ) {
          return fields;
        }

        const AggregateContainerType = build.getTypeByName(
          inflection.aggregateContainerType({ resource: table })
        ) as GraphQLObjectType | undefined;

        if (
          !AggregateContainerType ||
          Object.keys(AggregateContainerType.getFields()).length === 0
        ) {
          // No aggregates for this connection, abort
          return fields;
        }

        const fieldName = inflection.groupedAggregatesContainerField({
          resource: table,
        });
        const TableGroupByType = build.getTypeByName(
          inflection.aggregateGroupByType({ resource: table })
        ) as GraphQLEnumType | undefined;
        const TableHavingInputType = build.getTypeByName(
          inflection.aggregateHavingInputType({ resource: table })
        ) as GraphQLInputType;
        const tableTypeName = inflection.tableType(table.codec);
        if (!TableGroupByType || !isValidEnum(build, TableGroupByType)) {
          return fields;
        }

        return {
          ...fields,
          [fieldName]: fieldWithHooks({ fieldName }, () => {
            return {
              description: `Grouped aggregates across the matching connection (ignoring before/after/first/last/offset)`,
              type: new GraphQLList(new GraphQLNonNull(AggregateContainerType)),
              args: {
                groupBy: {
                  type: new GraphQLNonNull(
                    new GraphQLList(new GraphQLNonNull(TableGroupByType))
                  ),
                  description: build.wrapDescription(
                    `The method to use when grouping \`${tableTypeName}\` for these aggregates.`,
                    "arg"
                  ),
                  applyPlan: pgAggregatesApplyGroupedAggregate,
                },
                ...(TableHavingInputType
                  ? {
                      having: {
                        type: TableHavingInputType,
                        description: build.wrapDescription(
                          `Conditions on the grouped aggregates.`,
                          "arg"
                        ),
                        applyPlan:
                          pgAggregatesApplyConditionsToGroupedAggregates,
                      },
                    }
                  : null),
              },
              plan: pgAggregateCloneSubplanWithoutPaginationAsAggregate,
            };
          }),
        };
      },
    },
  },
};
export { Plugin as PgAggregatesAddConnectionGroupedAggregatesPlugin };
