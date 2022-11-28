import { PgAggregatesInflectorsPlugin } from "./InflectionPlugin";
import { PgAggregatesSpecsPlugin } from "./AggregateSpecsPlugin";
import { PgAggregatesAddGroupByAggregateEnumsPlugin } from "./AddGroupByAggregateEnumsPlugin";
import { PgAggregatesAddGroupByAggregateEnumValuesForColumnsPlugin } from "./AddGroupByAggregateEnumValuesForColumnsPlugin";
import { PgAggregatesAddHavingAggregateTypesPlugin } from "./AddHavingAggregateTypesPlugin";
import { PgAggregatesAddAggregateTypesPlugin } from "./AddAggregateTypesPlugin";
import { PgAggregatesAddConnectionAggregatesPlugin } from "./AddConnectionAggregatesPlugin";
import { PgAggregatesAddConnectionGroupedAggregatesPlugin } from "./AddConnectionGroupedAggregatesPlugin";
import { PgAggregatesOrderByAggregatesPlugin } from "./OrderByAggregatesPlugin";
import { PgAggregatesFilterRelationalAggregatesPlugin } from "./FilterRelationalAggregatesPlugin";

export const PgAggregatesPreset: GraphileConfig.Preset = {
  plugins: [
    PgAggregatesInflectorsPlugin,
    PgAggregatesSpecsPlugin,
    PgAggregatesAddGroupByAggregateEnumsPlugin,
    PgAggregatesAddGroupByAggregateEnumValuesForColumnsPlugin,
    PgAggregatesAddHavingAggregateTypesPlugin,
    PgAggregatesAddAggregateTypesPlugin,
    PgAggregatesAddConnectionAggregatesPlugin,
    PgAggregatesAddConnectionGroupedAggregatesPlugin,
    PgAggregatesOrderByAggregatesPlugin,
    PgAggregatesFilterRelationalAggregatesPlugin,
  ],
};
