import { testGraphQL } from "../helpers.js";

it(
  "FocussedOrderedAggregate",
  testGraphQL(/* GraphQL */ `
    query FocussedOrderedAggregate {
      allPlayers(
        first: 5
        orderBy: [MATCH_STATS_BY_PLAYER_ID_AVERAGE_POINTS_DESC]
      ) {
        nodes {
          name
          matchStatsByPlayerId {
            totalCount
            aggregates {
              sum {
                goals
              }
              average {
                points
              }
            }
          }
        }
      }
    }
  `)
);
