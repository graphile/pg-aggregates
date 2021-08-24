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

// This is a PostGraphile plugin; see
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
