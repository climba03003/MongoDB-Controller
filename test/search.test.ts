import { Db, MongoClient } from 'mongodb'
import Controller from '../lib'
import { wait } from './wait'

describe('constructor', function () {
  let connection: MongoClient
  let db: Db
  let controller: Controller

  beforeAll(async function () {
    connection = await MongoClient.connect(process.env.MONGO_URL as string, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })
    db = await connection.db()
    controller = new Controller(db.collection('search'))
    await controller.insertMany([
      { foo: 'bar' },
      { bar: 'baz' },
      { hello: 'world' }
    ])
  })
  test('empty', async function () {
    const result = await controller.search()
    expect(result.length).toStrictEqual(3)
    expect(result[0].foo).toStrictEqual('bar')
    expect(result[1].bar).toStrictEqual('baz')
    expect(result[2].hello).toStrictEqual('world')
  })

  afterAll(async function () {
    await wait(50)
    await connection.close()
  })
})
