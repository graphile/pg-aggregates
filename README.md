# @graphile/pg-aggregates

Adds a powerful suite of aggregate functionality to a PostGraphile schema:
calculating aggregates, grouped aggregates, applying conditions to grouped
aggregates, ordering by relational aggregates, filtering by the results of
aggregates on related connections, etc.

**IMPORTANT**: aggregates are added to connections, they do _not_ work with
"simple collections".

<!-- SPONSORS_BEGIN -->

## Crowd-funded open-source software

To help us develop this software sustainably under the MIT license, we ask all
individuals and businesses that use it to help support its ongoing maintenance
and development via sponsorship.

### [Click here to find out more about sponsors and sponsorship.](https://www.graphile.org/sponsor/)

And please give some love to our featured sponsors 🤩:

<table><tr>
<td align="center"><a href="https://www.the-guild.dev/"><img src="https://graphile.org/images/sponsors/theguild.png" width="90" height="90" alt="The Guild" /><br />The Guild</a> *</td>
<td align="center"><a href="https://dovetailapp.com/"><img src="https://graphile.org/images/sponsors/dovetail.png" width="90" height="90" alt="Dovetail" /><br />Dovetail</a> *</td>
<td align="center"><a href="https://qwick.com/"><img src="https://graphile.org/images/sponsors/qwick.png" width="90" height="90" alt="Qwick" /><br />Qwick</a> *</td>
<td align="center"><a href="https://www.netflix.com/"><img src="https://graphile.org/images/sponsors/Netflix.png" width="90" height="90" alt="Netflix" /><br />Netflix</a> *</td>
</tr><tr>
<td align="center"><a href=""><img src="https://graphile.org/images/sponsors/chadf.png" width="90" height="90" alt="Chad Furman" /><br />Chad Furman</a> *</td>
<td align="center"><a href="https://stellate.co/"><img src="https://graphile.org/images/sponsors/Stellate.png" width="90" height="90" alt="Stellate" /><br />Stellate</a> *</td>
</tr></table>

<em>\* Sponsors the entire Graphile suite</em>

<!-- SPONSORS_END -->

## Status

This module is currently "experimental" status; we may change any part of it in
a semver minor release.

## Usage

Requires PostGraphile v4.12.0-alpha.0 or higher.

Install with:

```
yarn add postgraphile @graphile/pg-aggregates
```

CLI usage via `--append-plugins`:

```
postgraphile --append-plugins @graphile/pg-aggregates -c postgres://localhost/my_db ...
```

Library usage via `appendPlugins`:

```ts
import PgAggregatesPlugin from "@graphile/pg-aggregates";
// or: const PgAggregatesPlugin = require("@graphile/pg-aggregates").default;

const middleware = postgraphile(DATABASE_URL, SCHEMAS, {
  appendPlugins: [PgAggregatesPlugin],
});
```

If you want you could install our [example schema](__tests__/schema.sql) and
then issue a GraphQL query such as:

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

To filter by aggregates on related tables, you will also need
[postgraphile-plugin-connection-filter](https://github.com/graphile-contrib/postgraphile-plugin-connection-filter),
and you will need to enable `graphileBuildOptions.connectionFilterRelations`
[as documented here](https://github.com/graphile-contrib/postgraphile-plugin-connection-filter#connectionfilterrelations).

```js
app.use(
  postgraphile(DATABASE_URL, SCHEMA_NAME, {
    graphileBuildOptions: {
      connectionFilterRelations: true,
    },
  })
);
```

## Interaction with connection parameters

Aggregates respect the conditions/filters of the connection but are unaffected
by the pagination of the connection (they ignore the
`first`/`last`/`after`/`before`/`orderBy` parameters). You may retrieve
(optionally paginated) node data from a connection at the same time as
retrieving aggregates from it. Aggregates are supported on connections at any
level of the GraphQL query.

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

## Ordering by aggregates

This plugin automatically adds some additional `orderBy` criteria to your graph
allowing you to order by aggregates over relations; e.g. you could find the top
5 players ordered by their average points scored in each match, and grab some
more aggregate information about them too:

```graphql
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
```

## Filtering by aggregates

(You will need `postgraphile-plugin-connection-filter` for this; see above.)

```graphql
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
```

## Grouped aggregates

We also support grouping your data via the value of one of your columns or a
derivative thereof; and calculating aggregates over each of the matching groups.
Out of the box we support two derivatives:

- `truncated-to-hour` (applies to timestamp-like values) - truncates to the
  beginning of the (UTC) hour
- `truncated-to-day` (applies to timestamp-like values) - truncates to the
  beginning of the (UTC) day

See
[Defining your own grouping derivatives](#defining-your-own-grouping-derivatives)
below for details on how to add your own grouping derivatives.

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

each entry in the `groupedAggregates` result will have a `keys` entry that will
be a list containing one value which will be the year of release (as a string).
The values in the `keys` list are always stringified, this is a known limitation
due to interactions with GraphQL.

### Having

If these grouped aggregates are returning too much data, you can filter the
groups down by applying a `having` clause against them; for example you could
see the average number of goals on days where the average points score was over
200:

```graphql
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
```

## Defining your own aggregates

You can add your own aggregates by using a plugin to add your own aggregate
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

## Defining your own grouping derivatives

You may add your own derivatives by adding a group by spec to
`build.pgAggregateGroupBySpecs` via a plugin. Derivative specs are fairly
straightforward, for example here's the spec for "truncated-to-hour":

```ts
const TIMESTAMP_OID = "1114";
const TIMESTAMPTZ_OID = "1184";

const truncatedToHourSpec = {
  // A unique identifier for this spec, will be used to generate its name:
  id: "truncated-to-hour",

  // A filter to determine which column/function return types this derivative
  // is valid against:
  isSuitableType: (pgType) =>
    pgType.id === TIMESTAMP_OID || pgType.id === TIMESTAMPTZ_OID,

  // The actual derivative - given the SQL fragment `sqlFrag` which represents
  // the column/function call, return a new SQL fragment that represents the
  // derived value, in this case a truncated timestamp:
  sqlWrap: (sqlFrag) => sql.fragment`date_trunc('hour', ${sqlFrag})`,
};
```

Building that up with a few more different intervals into a full PostGraphile
plugin, you might write something like:

```ts
// Constants from PostgreSQL
const TIMESTAMP_OID = "1114";
const TIMESTAMPTZ_OID = "1184";

// Determine if a given type is a timestamp/timestamptz
const isTimestamp = (pgType) =>
  pgType.id === TIMESTAMP_OID || pgType.id === TIMESTAMPTZ_OID;

// Build a spec that truncates to the given interval
const tsTruncateSpec = (sql, interval) => ({
  // `id` has to be unique, derive it from the `interval`:
  id: `truncated-to-${interval}`,

  // Only apply to timestamp fields:
  isSuitableType: isTimestamp,

  // Given the column value represented by the SQL fragment `sqlFrag`, wrap it
  // with a `date_trunc()` call, passing the relevant interval.
  sqlWrap: (sqlFrag) =>
    sql.fragment`date_trunc(${sql.literal(interval)}, ${sqlFrag})`,
});

// This is the PostGraphile plugin; see:
// https://www.graphile.org/postgraphile/extending/
const DateTruncAggregateGroupSpecsPlugin = (builder) => {
  builder.hook("build", (build) => {
    const { pgSql: sql } = build;

    build.pgAggregateGroupBySpecs = [
      // Copy all existing specs, except the ones we're replacing
      ...build.pgAggregateGroupBySpecs.filter(
        (spec) => !["truncated-to-day", "truncated-to-hour"].includes(spec.id)
      ),

      // Add our timestamp specs
      tsTruncateSpec(sql, "year"),
      tsTruncateSpec(sql, "month"),
      tsTruncateSpec(sql, "week"),
      tsTruncateSpec(sql, "day"),
      tsTruncateSpec(sql, "hour"),
      // Other values: microseconds, milliseconds, second, minute, quarter,
      // decade, century, millennium.
      // See https://www.postgresql.org/docs/current/functions-datetime.html#FUNCTIONS-DATETIME-TRUNC
    ];

    return build;
  });
};

module.exports = DateTruncAggregateGroupSpecsPlugin;
```

Finally pass this plugin into PostGraphile via `--append-plugins` or
`appendPlugins: [...]` - see https://www.graphile.org/postgraphile/extending/

See [src/AggregateSpecsPlugin.ts](src/AggregateSpecsPlugin.ts) for examples and
more information.

## Disable aggregates

By default, aggregates are created for all tables. This significantly increases
the size of your GraphQL schema, and could also be a security (DoS) concern as
aggregates can be expensive. We recommend that you use the
`disableAggregatesByDefault: true` option to disable aggregates by default, and
then enable them only for the tables you need:

```ts
const middleware = postgraphile(DATABASE_URL, SCHEMAS, {
  // ...
  appendPlugins: [
    // ...
    PgAggregatesPlugin,
  ],

  graphileBuildOptions: {
    // Disable aggregates by default; opt each table in via the `@aggregates` smart tag
    disableAggregatesByDefault: true,
  },
});
```

Enable aggregates for a specific table:

```json
"class": {
  "my_schema.my_table": {
    "tags": {
      "aggregates": "on"
    }
  }
}
```

or:

```sql
COMMENT ON TABLE my_schema.my_table IS E'@aggregates on';
```

You also can keep aggregates enabled by default, but disable aggregates for
specific tables:

```json
"class": {
  "my_schema.my_table": {
    "tags": {
      "aggregates": "off"
    }
  }
}
```

or:

```sql
COMMENT ON TABLE my_schema.my_table IS E'@aggregates off';
```

## Thanks

This plugin was started as a proof of concept in 2019 thanks to sponsorship from
OneGraph, and was made into fully featured released module thanks to sponsorship
from Surge in 2021. It is maintained thanks to the support of
[Graphile's sponsors](https://graphile.org/sponsor/) - thank you sponsors!
