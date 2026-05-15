import { testGraphQL } from "../helpers.js";

it(
  "GroupedAggregatesByDerivative",
  testGraphQL(/* GraphQL */ `
    query GroupedAggregatesByDerivative {
      allMatchStats {
        byDay: groupedAggregates(groupBy: [CREATED_AT_TRUNCATED_TO_DAY]) {
          keys # The timestamp truncated to the beginning of the day
          average {
            points
          }
        }
        byHour: groupedAggregates(groupBy: [CREATED_AT_TRUNCATED_TO_HOUR]) {
          keys # The timestamp truncated to the beginning of the hour
          average {
            points
          }
        }
      }
    }
  `)
);
