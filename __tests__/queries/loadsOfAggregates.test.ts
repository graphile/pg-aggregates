import { testGraphQL } from "../helpers.js";

it(
  "LoadsOfAggregates",
  testGraphQL(/* GraphQL */ `
    query LoadsOfAggregates {
      allFilms {
        aggregates {
          average {
            durationInMinutes
          }
        }
      }
    }
  `)
);
