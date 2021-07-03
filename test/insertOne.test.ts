import { Db, MongoClient } from 'mongodb'
import Controller from '../lib'
import { wait } from './wait'

describe('insertOne', function () {
  let connection: MongoClient
  let db: Db
  let ctr: Controller

  beforeAll(async function () {
    connection = await MongoClient.connect(process.env.MONGO_URL as string, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })
    db = await connection.db()
    ctr = new Controller(db.collection('insertOne'))
  })

  const docs = { foo: 'bar' }
  test('inserted', async function () {
    const result = await ctr.insertOne(docs)
    expect(result).toHaveProperty('foo')
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
