import { Db, MongoClient } from 'mongodb'
import Controller from '../lib'
import { wait } from './wait'

describe('insertMany', function () {
  let connection: MongoClient
  let db: Db
  let ctr: Controller

  beforeAll(async function () {
    connection = await MongoClient.connect(process.env.MONGO_URL as string, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })
    db = await connection.db()
    ctr = new Controller(db.collection('insertMany'))
  })

  const docs = [{ foo: 'bar' }, { bar: 'baz' }]
  test('inserted', async function () {
    const result = await ctr.insertMany(docs)
    expect(result).toHaveLength(2)
    expect(result[0]).toHaveProperty('foo')
    expect(result[0]).toHaveProperty('id')
    expect(result[0]).toHaveProperty('createdAt')
    expect(result[0]).toHaveProperty('updatedAt')
    expect(result[1]).toHaveProperty('bar')
    expect(result[1]).toHaveProperty('id')
    expect(result[1]).toHaveProperty('createdAt')
    expect(result[1]).toHaveProperty('updatedAt')
  })

  afterAll(async function () {
    await ctr.resetDatabase()
    await wait(50)
    await connection.close()
  })
})
