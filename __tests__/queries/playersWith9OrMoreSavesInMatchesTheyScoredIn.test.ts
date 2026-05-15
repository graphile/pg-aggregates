import { testGraphQL } from "../helpers.js";

it(
  "PlayersWith9OrMoreSavesInMatchesTheyScoredIn",
  testGraphQL(/* GraphQL */ `
    query PlayersWith9OrMoreSavesInMatchesTheyScoredIn {
      allPlayers(
        filter: {
          matchStatsByPlayerId: {
            aggregates: {
              sum: { saves: { greaterThan: "9" }, rating: { lessThan: 143 } }
              filter: { goals: { greaterThan: 0 } }
            }
          }
        }
      ) {
        nodes {
          name
          matchStatsByPlayerId(filter: { goals: { greaterThan: 0 } }) {
            aggregates {
              sum {
                saves
                rating
                goals
              }
            }
          }
        }
      }
    }
  `)
);
