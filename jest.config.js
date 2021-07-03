const { defaults: tsjPreset } = require('ts-jest/presets')

module.exports = {
  transform: tsjPreset.transform,
  verbose: true,
  preset: '@shelf/jest-mongodb',
  testEnvironment: 'node',
  collectCoverageFrom: ['lib/**/*']
}
