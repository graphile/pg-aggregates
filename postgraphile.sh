node \
  --inspect \
  ../build/postgraphile/cli.js \
  --append-plugins \
    `pwd`/node_modules/postgraphile-plugin-connection-filter,`pwd`/dist/index.js \
  -c graphile_aggregates \
  -s test \
  --enhance-graphiql \
  --allow-explain \
  --watch \
  --dynamic-json \
  --show-error-stack \
  --extended-errors severity,code,detail,hint,position,internalPosition,internalQuery,where,schema,table,column,dataType,constraint,file,line,routine
