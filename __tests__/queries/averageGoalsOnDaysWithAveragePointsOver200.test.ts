import { testGraphQL } from "../helpers.js";

it(
  "AverageGoalsOnDaysWithAveragePointsOver200",
  testGraphQL(/* GraphQL */ `
    query AverageGoalsOnDaysWithAveragePointsOver200 {
      allMatchStats {
        byDay: groupedAggregates(
          groupBy: [CREATED_AT_TRUNCATED_TO_DAY]
          having: { average: { points: { greaterThan: 200 } } }
        ) {
          keys
          average {
            goals
          }
        }
      }
    }
  `)
);
