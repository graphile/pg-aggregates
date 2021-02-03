import { PgType, SQL } from "graphile-build-pg";
import { GraphQLOutputType } from "graphql";

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
   * Used to translate the type for the field; for example:
   *
   * - Sum over int should give bigint
   * - Average of int should be float
   * - Median of int should be int
   */
  typeModifier: (
    pgType: PgType,
    gqlType: GraphQLOutputType
  ) => GraphQLOutputType;

  /** Set true if the result is guaranteed to be non-null */
  isNonNull?: boolean;
}
