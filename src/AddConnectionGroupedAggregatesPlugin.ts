import { Plugin } from "graphile-build";
import {
  QueryBuilder,
  // @ts-ignore
  getComputedColumnDetails,
} from "graphile-build-pg";
import type {
  GraphQLResolveInfo,
  GraphQLEnumType,
  GraphQLObjectType,
} from "graphql";

function isValidEnum(enumType: GraphQLEnumType): boolean {
  try {
    if (!enumType) {
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

const AddConnectionGroupedAggregatesPlugin: Plugin = (builder) => {
  builder.hook("GraphQLObjectType:fields", (fields, build, context) => {
    const {
      graphql: { GraphQLList, GraphQLNonNull },
      inflection,
      getSafeAliasFromResolveInfo,
      pgSql: sql,
      getSafeAliasFromAlias,
      pgQueryFromResolveData: queryFromResolveData,
    } = build;
    const {
      fieldWithHooks,
      scope: { isPgRowConnectionType, pgIntrospection: table },
    } = context;

    // If it's not a table connection, abort
    if (
      !isPgRowConnectionType ||
      !table ||
      table.kind !== "class" ||
      !table.namespace
    ) {
      return fields;
    }

    const AggregateContainerType:
      | GraphQLObjectType
      | undefined = build.getTypeByName(
      inflection.aggregateContainerType(table)
    );

    if (
      !AggregateContainerType ||
      Object.keys(AggregateContainerType.getFields()).length === 0
    ) {
      // No aggregates for this connection, abort
      return fields;
    }

    const fieldName = inflection.groupedAggregatesContainerField(table);
    const TableGroupByType = build.getTypeByName(
      inflection.aggregateGroupByType(table)
    );
    const tableTypeName = inflection.tableType(table);
    if (!isValidEnum(TableGroupByType)) {
      return fields;
    }

    return {
      ...fields,
      [fieldName]: fieldWithHooks(
        fieldName,
        ({ addDataGenerator, getDataFromParsedResolveInfoFragment }: any) => {
          addDataGenerator((parsedResolveInfoFragment: any) => {
            const safeAlias = getSafeAliasFromAlias(
              parsedResolveInfoFragment.alias
            );
            const resolveData = getDataFromParsedResolveInfoFragment(
              parsedResolveInfoFragment,
              AggregateContainerType
            );
            return {
              // This tells the query planner that we want to add an aggregate
              pgNamedQuery: {
                name: safeAlias,
                query: (aggregateQueryBuilder: QueryBuilder) => {
                  // TODO: aggregateQueryBuilder.groupBy();
                  // TODO: aggregateQueryBuilder.select();
                  aggregateQueryBuilder.select(() => {
                    const query = queryFromResolveData(
                      sql.identifier(Symbol()),
                      aggregateQueryBuilder.getTableAlias(), // Keep using our alias down the tree
                      resolveData,
                      { onlyJsonField: true },
                      (innerQueryBuilder: QueryBuilder) => {
                        innerQueryBuilder.parentQueryBuilder = aggregateQueryBuilder;
                      },
                      aggregateQueryBuilder.context
                    );
                    return sql.fragment`(${query})`;
                  }, safeAlias);
                },
              },
            };
          });

          return {
            description: `Grouped aggregates across the matching connection (ignoring before/after/first/last/offset)`,
            type: AggregateContainerType,
            args: {
              groupBy: {
                type: new GraphQLNonNull(
                  new GraphQLList(new GraphQLNonNull(TableGroupByType))
                ),
                description: build.wrapDescription(
                  `The method to use when grouping \`${tableTypeName}\` for these aggregates.`,
                  "arg"
                ),
              },
            },
            resolve(
              parent: any,
              _args: any,
              _context: any,
              resolveInfo: GraphQLResolveInfo
            ) {
              // Figure out the unique alias we chose earlier
              const safeAlias = getSafeAliasFromResolveInfo(resolveInfo);
              // All aggregates are stored into the aggregates object which is also identified by safeAlias, reference ours here
              return parent[safeAlias][safeAlias];
            },
          };
        },
        {}
      ),
    };
  });
};

export default AddConnectionGroupedAggregatesPlugin;
