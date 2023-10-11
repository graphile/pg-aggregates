import { PgAggregatesAddAggregateTypesPlugin } from "./AddAggregateTypesPlugin.js";
import { PgAggregatesAddConnectionAggregatesPlugin } from "./AddConnectionAggregatesPlugin.js";
import { PgAggregatesAddConnectionGroupedAggregatesPlugin } from "./AddConnectionGroupedAggregatesPlugin.js";
import { PgAggregatesAddGroupByAggregateEnumsPlugin } from "./AddGroupByAggregateEnumsPlugin.js";
import { PgAggregatesAddGroupByAggregateEnumValuesForAttributesPlugin } from "./AddGroupByAggregateEnumValuesForAttributesPlugin.js";
import { PgAggregatesAddHavingAggregateTypesPlugin } from "./AddHavingAggregateTypesPlugin.js";
import { PgAggregatesSpecsPlugin } from "./AggregateSpecsPlugin.js";
import { PgAggregatesSmartTagsPlugin } from "./AggregatesSmartTagsPlugin.js";
import { PgAggregatesFilterRelationalAggregatesPlugin } from "./FilterRelationalAggregatesPlugin.js";
import { PgAggregatesInflectorsPlugin } from "./InflectionPlugin.js";
import { PgAggregatesOrderByAggregatesPlugin } from "./OrderByAggregatesPlugin.js";

export const PgAggregatesPreset: GraphileConfig.Preset = {
  plugins: [
    PgAggregatesInflectorsPlugin,
    PgAggregatesSmartTagsPlugin,
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

// :args src/InflectionPlugin.ts src/AggregateSpecsPlugin.ts src/AddGroupByAggregateEnumsPlugin.ts src/AddGroupByAggregateEnumValuesForAttributesPlugin.ts src/AddHavingAggregateTypesPlugin.ts src/AddAggregateTypesPlugin.ts src/AddConnectionAggregatesPlugin.ts src/AddConnectionGroupedAggregatesPlugin.ts src/OrderByAggregatesPlugin.ts src/FilterRelationalAggregatesPlugin.ts src/AggregatesSmartTagsPlugin.ts
