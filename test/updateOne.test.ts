import { Db, MongoClient } from 'mongodb'
import Controller from '../lib'
import { wait } from './wait'

describe('updateOne', function () {
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
    ctr = new Controller<{ hello: string }>(db.collection('updateOne'))
    await ctr.insertMany([docs, docs, docs])
  })

  test('1 result', async function () {
    const result = await ctr.updateOne({}, {
      bar: 'baz'
    })
    expect(result).toHaveProperty('bar')
    expect(result).toHaveProperty('id')
    expect(result).toHaveProperty('createdAt')
    expect(result).toHaveProperty('updatedAt')
  })

  test('updatequery', async function () {
    const result = await ctr.updateOne({}, {
      $set: {
        hello: 'world'
      }
    })
    expect(result).toHaveProperty('hello')
    expect(result).toHaveProperty('id')
    expect(result).toHaveProperty('createdAt')
    expect(result).toHaveProperty('updatedAt')
  })

  afterAll(async function () {
    await ctr.resetDatabase()
    await wait(50)
    await connection.close()
  })
})
