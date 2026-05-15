import { testGraphQL } from "../helpers.js";

it(
  "calculates film aggregates",
  testGraphQL(/* GraphQL */ `
    {
      allFilms {
        aggregates {
          distinctCount {
            rowId
            name
            yearOfRelease
            computedColumn
          }
          sum {
            computedColumn # adds 10
            computedColumnWithArguments(numberToAdd: 11) # should be as above, plus distinctCount
            yearOfRelease
            boxOfficeInBillions
          }
        }
      }
    }
  `)
);
