node \
  --inspect \
  ../build/postgraphile/cli.js \
  --append-plugins \
    `pwd`/node_modules/postgraphile-plugin-connection-filter,`pwd`/dist/index.js,`pwd`/__tests__/date_trunc_aggregate_group_specs_plugin.js \
  -c graphile_aggregates \
  -s test \
  --enhance-graphiql \
  --allow-explain \
  --watch \
  --dynamic-json \
  --show-error-stack=json \
  --extended-errors severity,code,detail,hint,position,internalPosition,internalQuery,where,schema,table,column,dataType,constraint,file,line,routine
