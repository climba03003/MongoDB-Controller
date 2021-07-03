import { isUpdateQuery, mergeUpdateQueryData, retrieveUpdateQueryData } from '../lib'

describe('isUpdateQuery', function () {
  test.concurrent.each(['$currentDate', '$inc', '$min', '$max', '$mul', '$rename', '$set', '$setOnInsert', '$unset', '$addToSet', '$pop', '$pull', '$push', '$pushAll', '$bit'])('%s', async function (key) {
    expect(isUpdateQuery({ [key]: {} })).toStrictEqual(true)
  })

  test('document', function () {
    expect(isUpdateQuery({ foo: 'bar' })).toStrictEqual(false)
  })
})

describe('retrieveUpdateQueryData', function () {
  test('have $set', function () {
    const result = retrieveUpdateQueryData({ $set: { foo: 'bar' } })
    expect(result).toStrictEqual({ foo: 'bar' })
  })

  test('empty $set', function () {
    const result = retrieveUpdateQueryData({ $set: undefined })
    expect(result).toStrictEqual({})
  })

  test('update query with no $set', function () {
    const result = retrieveUpdateQueryData({ $pull: { foo: 'bar' } })
    expect(result).toStrictEqual({})
  })

  test('document', function () {
    const result = retrieveUpdateQueryData({ foo: 'bar' })
    expect(result).toStrictEqual({ foo: 'bar' })
  })
})

describe('mergeUpdateQueryData', function () {
  const from = { foo: 'bar', bar: 'baz' }
  const to = { foo: 'hello', hello: 'world' }
  const res = { foo: 'hello', bar: 'baz', hello: 'world' }

  test('document + document', function () {
    const result = mergeUpdateQueryData<any>(from, to)
    expect(result).toStrictEqual({ $set: res })
  })

  test('$set + document', function () {
    const result = mergeUpdateQueryData<any>({ $set: from }, to)
    expect(result).toStrictEqual({ $set: res })
  })

  test('document + $set', function () {
    const result = mergeUpdateQueryData<any>(from, { $set: to })
    expect(result).toStrictEqual({ $set: res })
  })

  test('$set + $set', function () {
    const result = mergeUpdateQueryData<any>({ $set: from }, { $set: to })
    expect(result).toStrictEqual({ $set: res })
  })

  test('$pull + document', function () {
    const result = mergeUpdateQueryData<any>({ $pull: from }, to)
    expect(result).toStrictEqual({ $pull: from, $set: to })
  })
})
