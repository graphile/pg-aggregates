import { testGraphQL } from "../helpers.js";

it(
  "AverageDurationByYearOfRelease",
  testGraphQL(/* GraphQL */ `
    query AverageDurationByYearOfRelease {
      allFilms {
        groupedAggregates(groupBy: [YEAR_OF_RELEASE]) {
          keys
          average {
            durationInMinutes
          }
        }
      }
    }
  `)
);
