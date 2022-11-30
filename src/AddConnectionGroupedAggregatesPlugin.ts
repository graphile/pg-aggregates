import { PgSelectStep } from "@dataplan/pg";
import { getEnumValueConfig, InputStep } from "grafast";
import {
  GraphQLResolveInfo,
  GraphQLEnumType,
  GraphQLObjectType,
} from "graphql";

const { version } = require("../package.json");

function isValidEnum(enumType: GraphQLEnumType | undefined): boolean {
  try {
    if (!enumType) {
      return false;
    }
    if (!(enumType instanceof GraphQLEnumType)) {
      return false;
    }
    if (Object.keys(enumType.getValues()).length === 0) {
      return false;
    }
  } catch (e) {
    return false;
  }
  return true;
}

const Plugin: GraphileConfig.Plugin = {
  name: "PgAggregatesAddConnectionGroupedAggregatesPlugin",
  version,

  schema: {
    hooks: {
      GraphQLObjectType_fields(fields, build, context) {
        const {
          graphql: { GraphQLList, GraphQLNonNull },
          inflection,
          sql,
        } = build;
        const {
          fieldWithHooks,
          scope: {
            pgCodec,
            pgTypeSource,
            isConnectionType,
            isPgConnectionRelated,
          },
        } = context;

        const table =
          pgTypeSource ??
          build.input.pgSources.find(
            (s) => s.codec === pgCodec && !s.parameters
          );

        // If it's not a table connection, abort
        if (
          !isConnectionType ||
          !isPgConnectionRelated ||
          !table ||
          table.parameters ||
          !table.codec.columns
        ) {
          return fields;
        }

        const AggregateContainerType = build.getTypeByName(
          inflection.aggregateContainerType({ source: table })
        ) as GraphQLObjectType | undefined;

        if (
          !AggregateContainerType ||
          Object.keys(AggregateContainerType.getFields()).length === 0
        ) {
          // No aggregates for this connection, abort
          return fields;
        }

        const fieldName = inflection.groupedAggregatesContainerField({
          source: table,
        });
        const TableGroupByType = build.getTypeByName(
          inflection.aggregateGroupByType({ source: table })
        ) as GraphQLEnumType | undefined;
        const TableHavingInputType = build.getTypeByName(
          inflection.aggregateHavingInputType({ source: table })
        );
        const tableTypeName = inflection.tableType(table.codec);
        if (!TableGroupByType || !isValidEnum(TableGroupByType)) {
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
                  applyPlan(
                    $parent,
                    $pgSelect: PgSelectStep<any, any, any, any>,
                    input,
                    info
                  ) {
                    const $value = input.getRaw();
                    const val = $value.eval();
                    if (!Array.isArray(val)) {
                      throw new Error("Invalid!");
                    }
                    for (const group of val) {
                      const config = getEnumValueConfig(
                        TableGroupByType,
                        group
                      );
                      const plan = config?.extensions?.graphile?.applyPlan;
                      if (typeof plan === "function") {
                        plan($pgSelect);
                      } else {
                        // TODO: consider logging this lack of plan?
                      }
                    }
                    return null;
                  },
                },
                ...(TableHavingInputType
                  ? {
                      having: {
                        type: TableHavingInputType,
                        description: build.wrapDescription(
                          `Conditions on the grouped aggregates.`,
                          "arg"
                        ),
                        applyPlan(
                          $parent,
                          $pgSelect: PgSelectStep<any, any, any, any>
                        ) {
                          return $pgSelect.havingPlan();
                        },
                      },
                    }
                  : null),
              },
              plan($connection) {
                return $connection.cloneSubplanWithoutPagination("aggregate");
              },
            };
          }),
        };
      },
    },
  },
};
export { Plugin as PgAggregatesAddConnectionGroupedAggregatesPlugin };
