if (!("GRAPHILE_ENV" in process.env)) {
  process.env.GRAPHILE_ENV = "test";
}
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.jsx?$": `${__dirname}/.jest-babel-transform.js`,
    "^.+\\.tsx?$": `${__dirname}/.jest-babel-transform.js`,
  },
  testMatch: ["<rootDir>/**/__tests__/**/*.test.[jt]s?(x)"],
  moduleFileExtensions: ["js", "json", "jsx", "ts", "tsx", "node"],
  roots: [`<rootDir>`],
  snapshotSerializers: [
    `jest-serializer-graphql-schema`,
    `jest-serializer-simple`,
  ],
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },

  // Jest doesn't currently support prettier v3; see https://github.com/jestjs/jest/issues/14305
  prettierPath: require.resolve("@localrepo/prettier2-for-jest"),
};
