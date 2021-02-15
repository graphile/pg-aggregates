# @graphile/pg-aggregates

Adds a powerful suite of aggregate functionality to a PostGraphile schema:
calculating aggregates, grouped aggregates, applying conditions to grouped
aggregates, ordering by relational aggregates, etc.

**IMPORTANT**: aggregates are added to connections, they do _not_ work with
"simple collections".

## Usage

Install with:

```
yarn add postgraphile @graphile/pg-aggregates
```

CLI usage via `--append-plugins`:

```
postgraphile --append-plugins @graphile/pg-aggregates -c postgres://localhost/my_db ...
```

Library usage via `applyPlugins`:

```ts
import PgAggregatesPlugin from "@graphile/pg-aggregates";
// or: const PgAggregatesPlugin = require("@graphile/pg-aggregates").default;

const middleware = postgraphile(DATABASE_URL, SCHEMAS, {
  appendPlugins: [PgAggregatesPlugin],
});
```

Then issue a GraphQL query such as:

```graphql
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
```

or:

```graphql
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
```

## Interaction with connection parameters

Aggregates respect the conditions/filters of the connection but are unaffected
by the pagination of the connection (`first`/`last`/`after`/`before`/`orderBy`).
You may retrieve (optionally paginated) node data from a connection at the same
time as retrieving aggregates from it.

## Aggregates

Connection-wide aggregates are available via the `aggregates` field directly on
a GraphQL connection; for example:

```graphql
query LoadsOfAggregates {
  allFilms {
    aggregates {
      average {
        durationInMinutes
      }
    }
  }
}
```

We support the following aggregates out of the box:

- `sum` (applies to number-like fields) - the result of adding all the values
  together
- `distinctCount` (applies to all fields) - the count of the number of distinct
  values
- `min` (applies to number-like fields) - the smallest value
- `max` (applies to number-like fields) - the greatest value
- `average` (applies to number-like fields) - the average (arithmetic mean)
  value
- `stddevSample` (applies to number-like fields) - the sample standard deviation
  of the values
- `stddevPopulation` (applies to number-like fields) - the population standard
  deviation of the values
- `varianceSample` (applies to number-like fields) - the sample variance of the
  values
- `variancePopulation` (applies to number-like fields) - the population variance
  of the values

See [Defining your own aggregates](#defining-your-own-aggregates) below for
details on how to add your own aggregates.

Different aggregates apply to different data types; in general we attempt to add
aggregate entries for each column and
[computed column function](https://www.graphile.org/postgraphile/computed-columns/)
that appears to be compatible with the aggregate.

## Defining your own aggregates

You can also add your own aggregates by using a plugin to add your own aggregate
specs. Aggregate specs aren't too complicated, for example here is a spec that
could define the "min" aggregate:

```ts
const isNumberLike = (pgType) => pgType.category === "N";

const minSpec = {
  id: "min",
  humanLabel: "minimum",
  HumanLabel: "Minimum",
  isSuitableType: isNumberLike,
  sqlAggregateWrap: (sqlFrag) => sql.fragment`min(${sqlFrag})`,
};
```

See [src/AggregateSpecsPlugin.ts](src/AggregateSpecsPlugin.ts) for more
details/examples.

## Grouped aggregates

We also support grouping your data via the value of one of your columns,
no-additional-arguments computed columns, or a derivative thereof; and
calculating aggregates over each of the matching groups. Out of the box we
support two derivatives:

- `truncated-to-hour` (applies to timestamp-like values) - truncates to the
  beginning of the (UTC) hour
- `truncated-to-day` (applies to timestamp-like values) - truncates to the
  beginning of the (UTC) day

You may add your own derivatives by adding a group by spec; see
[src/AggregateSpecsPlugin.ts](src/AggregateSpecsPlugin.ts) for examples and more
information.

The aggregates supported over groups are the same as over the connection as a
whole (see [Aggregates](#aggregates) above), but in addition you may also
determine the `keys` that were used for the aggregate. There will be one key for
each of the `groupBy` values; for example in this query:

```graphql
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
```

each entry in the `groupedAggregates` result will have a `keys` entry containing
one value which will be the year of release (as a string). Keys are always
stringified, this is a known limitation due to interactions with GraphQL.
