import type { PgSelectStep } from "@dataplan/pg";
import type { GraphQLEnumType, GraphQLObjectType } from "graphql";

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
  } catch (e) {
    return false;
  }
  return true;
}

const Plugin: GraphileConfig.Plugin = {
  name: "PgAggregatesAddConnectionGroupedAggregatesPlugin",
  version,
  provides: ["aggregates"],

  schema: {
    hooks: {
      GraphQLObjectType_fields(fields, build, context) {
        const {
          graphql: { GraphQLList, GraphQLNonNull },
          grafast: { getEnumValueConfig },
          inflection,
          EXPORTABLE
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
        );
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
                  applyPlan: EXPORTABLE( (TableGroupByType, getEnumValueConfig) => function (_$parent, $pgSelect: PgSelectStep<any>, input) {
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
                      const plan = config?.extensions?.grafast?.applyPlan;
                      if (typeof plan === "function") {
                        plan($pgSelect);
                      } else {
                        // TODO: consider logging this lack of plan?
                      }
                    }
                    return null;
                  }, [TableGroupByType, getEnumValueConfig]),
                  autoApplyAfterParentPlan: true,
                },
                ...(TableHavingInputType
                  ? {
                      having: {
                        type: TableHavingInputType,
                        description: build.wrapDescription(
                          `Conditions on the grouped aggregates.`,
                          "arg"
                        ),
                        applyPlan(_$parent, $pgSelect: PgSelectStep<any>) {
                          return $pgSelect.havingPlan();
                        },
                        autoApplyAfterParentPlan: true,
                      },
                    }
                  : null),
              },
              plan: EXPORTABLE(
                () =>
                  function plan($connection) {
                    return $connection.cloneSubplanWithoutPagination(
                      "aggregate"
                    );
                  },
                []
              ),
            };
          }),
        };
      },
    },
  },
};
export { Plugin as PgAggregatesAddConnectionGroupedAggregatesPlugin };
