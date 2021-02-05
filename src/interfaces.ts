import { PgType, SQL } from "graphile-build-pg";

export interface AggregateGroupBySpec {
  /** Must not change since it's used in type names/etc */
  id: string; // e.g. 'truncated-to-hour'

  /** Return true if we can process this type */
  isSuitableType: (pgType: PgType) => boolean;

  /** Wraps the SQL to return a derivative (e.g. sqlFrag => sql.fragment`date_trunc('hour', ${sqlFrag})`) */
  sqlWrap: (sqlFrag: SQL) => SQL;
}

export interface AggregateSpec {
  /** Must not change since it's used in type names/etc */
  id: string;

  /** Used in descriptions, starts with lowercase */
  humanLabel: string;

  /** Used in descriptions, starts with uppercase */
  HumanLabel: string;

  /** Return true if we can process this type */
  isSuitableType: (pgType: PgType) => boolean;

  /** Wraps the SQL in an aggregate call */
  sqlAggregateWrap: (sqlFrag: SQL) => SQL;

  /**
   * Used to translate the PostgreSQL return type for the aggregate; for example:
   *
   * - Sum over int should give bigint
   * - Average of int should be float
   * - Median of int should be int
   */
  pgTypeAndModifierModifier?: (
    pgType: PgType,
    pgTypeModifier: null | string | number
  ) => [PgType, null | string | number];

  /** Set true if the result is guaranteed to be non-null */
  isNonNull?: boolean;
}
