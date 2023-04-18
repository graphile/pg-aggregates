import { PgAggregatesInflectorsPlugin } from "./InflectionPlugin";
import { PgAggregatesSpecsPlugin } from "./AggregateSpecsPlugin";
import { PgAggregatesAddGroupByAggregateEnumsPlugin } from "./AddGroupByAggregateEnumsPlugin";
import { PgAggregatesAddGroupByAggregateEnumValuesForAttributesPlugin } from "./AddGroupByAggregateEnumValuesForAttributesPlugin";
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
    PgAggregatesAddGroupByAggregateEnumValuesForAttributesPlugin,
    PgAggregatesAddHavingAggregateTypesPlugin,
    PgAggregatesAddAggregateTypesPlugin,
    PgAggregatesAddConnectionAggregatesPlugin,
    PgAggregatesAddConnectionGroupedAggregatesPlugin,
    PgAggregatesOrderByAggregatesPlugin,
    PgAggregatesFilterRelationalAggregatesPlugin,
  ],
};

// :args src/InflectionPlugin.ts src/AggregateSpecsPlugin.ts src/AddGroupByAggregateEnumsPlugin.ts src/AddGroupByAggregateEnumValuesForAttributesPlugin.ts src/AddHavingAggregateTypesPlugin.ts src/AddAggregateTypesPlugin.ts src/AddConnectionAggregatesPlugin.ts src/AddConnectionGroupedAggregatesPlugin.ts src/OrderByAggregatesPlugin.ts src/FilterRelationalAggregatesPlugin.ts
