import { testGraphQL } from "../helpers.js";

it(
  "GameAggregates",
  testGraphQL(/* GraphQL */ `
    query GameAggregates {
      allMatchStats {
        aggregates {
          max {
            points
            goals
            saves
          }
          min {
            points
          }
        }
      }
      allPlayers(orderBy: [MATCH_STATS_BY_PLAYER_ID_SUM_GOALS_ASC]) {
        nodes {
          name
          matchStatsByPlayerId {
            totalCount
            aggregates {
              sum {
                points
                goals
                saves
              }
              average {
                points
                goals
                saves
                teamPosition
              }
            }
          }
        }
      }
    }
  `)
);
