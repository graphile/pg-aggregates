import { makePluginByCombiningPlugins } from "graphile-utils";
import InflectionPlugin from "./InflectionPlugin";
import AggregateSpecsPlugin from "./AggregateSpecsPlugin";
import AddGroupByAggregateEnumsPlugin from "./AddGroupByAggregateEnumsPlugin";
import AddGroupByAggregateEnumValuesForColumnsPlugin from "./AddGroupByAggregateEnumValuesForColumnsPlugin";
import AddHavingAggregateTypesPlugin from "./AddHavingAggregateTypesPlugin";
import AddAggregateTypesPlugin from "./AddAggregateTypesPlugin";
import AddConnectionAggregatesPlugin from "./AddConnectionAggregatesPlugin";
import AddConnectionGroupedAggregatesPlugin from "./AddConnectionGroupedAggregatesPlugin";
import OrderByAggregatesPlugin from "./OrderByAggregatesPlugin";
import FilterRelationalAggregatesPlugin from "./FilterRelationalAggregatesPlugin";

export default makePluginByCombiningPlugins(
  InflectionPlugin,
  AggregateSpecsPlugin,
  AddGroupByAggregateEnumsPlugin,
  AddGroupByAggregateEnumValuesForColumnsPlugin,
  AddHavingAggregateTypesPlugin,
  AddAggregateTypesPlugin,
  AddConnectionAggregatesPlugin,
  AddConnectionGroupedAggregatesPlugin,
  OrderByAggregatesPlugin,
  FilterRelationalAggregatesPlugin
);
