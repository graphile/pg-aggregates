import { PgAggregatesInflectorsPlugin } from "./InflectionPlugin.js";
import { PgAggregatesSpecsPlugin } from "./AggregateSpecsPlugin.js";
import { PgAggregatesAddGroupByAggregateEnumsPlugin } from "./AddGroupByAggregateEnumsPlugin.js";
import { PgAggregatesAddGroupByAggregateEnumValuesForAttributesPlugin } from "./AddGroupByAggregateEnumValuesForAttributesPlugin.js";
import { PgAggregatesAddHavingAggregateTypesPlugin } from "./AddHavingAggregateTypesPlugin.js";
import { PgAggregatesAddAggregateTypesPlugin } from "./AddAggregateTypesPlugin.js";
import { PgAggregatesAddConnectionAggregatesPlugin } from "./AddConnectionAggregatesPlugin.js";
import { PgAggregatesAddConnectionGroupedAggregatesPlugin } from "./AddConnectionGroupedAggregatesPlugin.js";
import { PgAggregatesOrderByAggregatesPlugin } from "./OrderByAggregatesPlugin.js";
import { PgAggregatesFilterRelationalAggregatesPlugin } from "./FilterRelationalAggregatesPlugin.js";

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
