import { Db, MongoClient } from 'mongodb'
import Controller from '../lib'
import { wait } from './wait'

describe('deleteOne', function () {
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
    ctr = new Controller(db.collection('deleteOne'))
    await ctr.insertMany([docs, docs, docs])
  })

  test('1 result', async function () {
    const result = await ctr.deleteOne({})
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
