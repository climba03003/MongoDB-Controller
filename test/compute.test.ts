import AggregateBuild from '@climba03003/mongodb-aggregate-builder'
import { Db, MongoClient } from 'mongodb'
import Controller from '../lib'
import { wait } from './wait'

describe('constructor', function () {
  let connection: MongoClient
  let db: Db
  let ctr: Controller

  beforeAll(async function () {
    connection = await MongoClient.connect(process.env.MONGO_URL as string, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })
    db = await connection.db()
    ctr = new Controller(db.collection('compute'))
  })

  test('computeQuery - empty', function () {
    const query = ctr.computeQuery()
    expect(query.toArray()).toStrictEqual([{ $match: {} }])
  })

  test('computeQuery - search with string', function () {
    ctr.searchFields = ['id', 'foo', 'bar']
    const query = ctr.computeQuery('baz')
    expect(query.toArray()).toStrictEqual([
      {
        $match: {
          $and: [{ $or: [{ id: 'baz' }, { foo: 'baz' }, { bar: 'baz' }] }]
        }
      }
    ])
  })

  test('computeQuery - search with stringify json', function () {
    ctr.searchFields = ['id']
    const query = ctr.computeQuery(
      JSON.stringify({ $regex: 'baz', $options: 'i' })
    )
    expect(query.toArray()).toStrictEqual([
      {
        $match: { $and: [{ $or: [{ id: { $regex: 'baz', $options: 'i' } }] }] }
      }
    ])
  })

  test('computeQuery - search with json', function () {
    ctr.searchFields = ['id']
    const query = ctr.computeQuery({ $regex: 'baz', $options: 'i' })
    expect(query.toArray()).toStrictEqual([
      {
        $match: { $and: [{ $or: [{ id: { $regex: 'baz', $options: 'i' } }] }] }
      }
    ])
  })

  test('computeQuery - invalid $function', function () {
    expect(() =>
      ctr.computeQuery({ $function: { body: '', lang: 'js' } })
    ).toThrowError()
  })

  test('computeQuery - invalid $accumulator', function () {
    expect(() =>
      ctr.computeQuery({ $accumulator: { accumulate: '', lang: 'js' } })
    ).toThrowError()
  })

  test('computeQuery - filter with string', function () {
    ctr.searchFields = []
    const query = ctr.computeQuery('baz', 'foo:baz,bar:baz')
    expect(query.toArray()).toStrictEqual([
      { $match: { $and: [{ foo: 'baz' }, { bar: 'baz' }] } }
    ])
  })

  test('computeQuery - filter with json', function () {
    ctr.searchFields = []
    const query = ctr.computeQuery(
      'baz',
      `foo:${JSON.stringify({ $regex: 'baz', $option: 'i' })},bar:baz`
    )
    expect(query.toArray()).toStrictEqual([
      {
        $match: {
          $and: [{ foo: { $regex: 'baz', $option: 'i' } }, { bar: 'baz' }]
        }
      }
    ])
  })

  test('computeQuery - filter with number', function () {
    ctr.searchFields = []
    const query = ctr.computeQuery('baz', 'foo:true,bar:1,baz:1.01')
    expect(query.toArray()).toStrictEqual([
      { $match: { $and: [{ foo: true }, { bar: 1 }, { baz: 1.01 }] } }
    ])
  })

  test('computeQuery - search with auto regexp', function () {
    ctr.searchFields = ['id']
    ctr.autoRegExpSearch = true
    const query = ctr.computeQuery('baz')
    expect(query.toArray()).toStrictEqual([
      {
        $match: { $and: [{ $or: [{ id: { $regex: 'baz', $options: 'i' } }] }] }
      }
    ])
  })

  test('computeQuery - search with stringify json and auto regexp', function () {
    ctr.searchFields = ['id']
    ctr.autoRegExpSearch = true
    const query = ctr.computeQuery(
      JSON.stringify({ $regex: 'baz', $options: 'i' })
    )
    expect(query.toArray()).toStrictEqual([
      {
        $match: { $and: [{ $or: [{ id: { $regex: 'baz', $options: 'i' } }] }] }
      }
    ])
  })

  test('computeQuery - filter with date', function () {
    ctr.searchFields = []
    const start = new Date('2020-01-01T00:00:00.000Z')
    const end = new Date('2020-12-31T23:59:59.999Z')
    const query = ctr.computeQuery(
      '',
      'createdAt:{"$gt":"2020-01-01T00:00:00.000Z","$lt":"2020-12-31T23:59:59.999Z"}'
    )
    expect(query.toArray()).toStrictEqual([
      { $match: { $and: [{ createdAt: { $gt: start, $lt: end } }] } }
    ])
  })

  test('computeQuery - filter with $expr', function () {
    ctr.searchFields = []
    const query = ctr.computeQuery(
      '',
      '$expr:{"$gte":["$createdAt",{"$dateFromString":{"dateString":"2021-01-01T00:00:00.000Z"}}]}'
    )
    expect(query.toArray()).toStrictEqual([
      {
        $match: {
          $and: [
            {
              $expr: {
                $gte: [
                  '$createdAt',
                  {
                    $dateFromString: { dateString: '2021-01-01T00:00:00.000Z' }
                  }
                ]
              }
            }
          ]
        }
      }
    ])
  })

  test('computeQuery - filter with null', function () {
    ctr.searchFields = ['id']
    ctr.autoRegExpSearch = true
    const query = ctr.computeQuery(null)
    expect(query.toArray()).toStrictEqual([{ $match: {} }])
  })

  test('computeQuery - ensure $regex to string', function () {
    ctr.searchFields = ['id']
    ctr.autoRegExpSearch = true
    const query = ctr.computeQuery({ $regex: '999', $options: 'i' })
    expect(query.toArray()).toStrictEqual([
      {
        $match: { $and: [{ $or: [{ id: { $regex: '999', $options: 'i' } }] }] }
      }
    ])
  })

  test('computeSort', function () {
    const sort = ctr.computeSort()
    expect(sort).toStrictEqual(false)
  })

  test('computeSort', function () {
    const sort = ctr.computeSort('+foo,')
    expect(sort).not.toBeFalsy()
    const builder = sort as AggregateBuild
    expect(builder.toArray()).toStrictEqual([{ $sort: { foo: 1 } }])
  })

  test('computeSort', function () {
    const sort = ctr.computeSort('foo,')
    expect(sort).not.toBeFalsy()
    const builder = sort as AggregateBuild
    expect(builder.toArray()).toStrictEqual([{ $sort: { foo: 1 } }])
  })

  test('computeSort', function () {
    const sort = ctr.computeSort('-foo,bar')
    expect(sort).not.toBeFalsy()
    const builder = sort as AggregateBuild
    expect(builder.toArray()).toStrictEqual([{ $sort: { foo: -1, bar: 1 } }])
  })

  test('computeSort', function () {
    const sort = ctr.computeSort('+foo,-bar')
    expect(sort).not.toBeFalsy()
    const builder = sort as AggregateBuild
    expect(builder.toArray()).toStrictEqual([{ $sort: { foo: 1, bar: -1 } }])
  })

  test('computeSort', function () {
    // leading space due to plus is represent space in querystring
    const sort = ctr.computeSort(' foo,-bar')
    expect(sort).not.toBeFalsy()
    const builder = sort as AggregateBuild
    expect(builder.toArray()).toStrictEqual([{ $sort: { foo: 1, bar: -1 } }])
  })

  test('computeOption', function () {
    const option = ctr.computeOption()
    expect(option).toStrictEqual(false)
  })

  test('computeOption', function () {
    const option = ctr.computeOption(10, 10)
    expect(option).not.toBeFalsy()
    const builder = option as AggregateBuild
    expect(builder.toArray()).toStrictEqual([{ $limit: 100 }, { $skip: 90 }])
  })

  test('computeOption', function () {
    const option = ctr.computeOption(0, 10)
    expect(option).not.toBeFalsy()
    const builder = option as AggregateBuild
    expect(builder.toArray()).toStrictEqual([{ $limit: 10 }, { $skip: 0 }])
  })

  afterAll(async function () {
    await wait(50)
    await connection.close()
  })
})
