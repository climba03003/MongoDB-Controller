import { Db, MongoClient } from 'mongodb'
import Controller from '../lib'
import { wait } from './wait'

describe('updateMany', function () {
  let connection: MongoClient
  let db: Db
  let ctr: Controller
  const docs = { foo: 'bar' }

  beforeAll(async function () {
    connection = await MongoClient.connect(process.env.MONGO_URL as string, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })
    db = await connection.db()
    ctr = new Controller(db.collection('updateMany'))
    await ctr.insertMany([docs, docs, docs])
  })

  test('3 result', async function () {
    const result = await ctr.updateMany({}, {
      bar: 'baz'
    })
    expect(result).toHaveLength(3)
    expect(result[0]).toHaveProperty('bar')
    expect(result[0]).toHaveProperty('id')
    expect(result[0]).toHaveProperty('createdAt')
    expect(result[0]).toHaveProperty('updatedAt')
    expect(result[1]).toHaveProperty('bar')
    expect(result[1]).toHaveProperty('id')
    expect(result[1]).toHaveProperty('createdAt')
    expect(result[1]).toHaveProperty('updatedAt')
    expect(result[2]).toHaveProperty('bar')
    expect(result[2]).toHaveProperty('id')
    expect(result[2]).toHaveProperty('createdAt')
    expect(result[2]).toHaveProperty('updatedAt')
  })

  test('update query', async function () {
    const result = await ctr.updateMany({}, {
      $set: {
        hello: 'world'
      }
    })
    expect(result).toHaveLength(3)
    expect(result[0]).toHaveProperty('hello')
    expect(result[0]).toHaveProperty('id')
    expect(result[0]).toHaveProperty('createdAt')
    expect(result[0]).toHaveProperty('updatedAt')
    expect(result[1]).toHaveProperty('hello')
    expect(result[1]).toHaveProperty('id')
    expect(result[1]).toHaveProperty('createdAt')
    expect(result[1]).toHaveProperty('updatedAt')
    expect(result[2]).toHaveProperty('hello')
    expect(result[2]).toHaveProperty('id')
    expect(result[2]).toHaveProperty('createdAt')
    expect(result[2]).toHaveProperty('updatedAt')
  })

  afterAll(async function () {
    await ctr.resetDatabase()
    await wait(50)
    await connection.close()
  })
})
