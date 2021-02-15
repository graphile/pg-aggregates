import type { Plugin } from "graphile-build";
import type { QueryBuilder } from "graphile-build-pg";
import type { GraphQLResolveInfo, GraphQLObjectType } from "graphql";

const AddAggregatesPlugin: Plugin = (builder) => {
  // Hook all connections to add the 'aggregates' field
  builder.hook("GraphQLObjectType:fields", (fields, build, context) => {
    const {
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

    const fieldName = inflection.aggregatesContainerField(table);
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
                name: "aggregates",
                query: (aggregateQueryBuilder: QueryBuilder) => {
                  aggregateQueryBuilder.select(() => {
                    const query = queryFromResolveData(
                      sql.identifier(Symbol()),
                      aggregateQueryBuilder.getTableAlias(), // Keep using our alias down the tree
                      resolveData,
                      { onlyJsonField: true },
                      (innerQueryBuilder: QueryBuilder) => {
                        innerQueryBuilder.parentQueryBuilder = aggregateQueryBuilder;
                        innerQueryBuilder.select(
                          sql.fragment`sum(1)`,
                          "__force_aggregate__"
                        );
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
            description: `Aggregates across the matching connection (ignoring before/after/first/last/offset)`,
            type: AggregateContainerType,
            resolve(
              parent: any,
              _args: any,
              _context: any,
              resolveInfo: GraphQLResolveInfo
            ) {
              // Figure out the unique alias we chose earlier
              const safeAlias = getSafeAliasFromResolveInfo(resolveInfo);
              // All aggregates are stored into the aggregates object which is also identified by aggregateAlias, reference ours here
              return parent.aggregates[safeAlias] || 0;
            },
          };
        },
        {}
      ),
    };
  });
};

export default AddAggregatesPlugin;
