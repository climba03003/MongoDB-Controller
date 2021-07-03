import { Db, MongoClient } from 'mongodb'
import Controller from '../lib'
import { wait } from './wait'

describe('find', function () {
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
    ctr = new Controller(db.collection('find'))
    await ctr.insertMany([docs, docs, docs])
  })

  test('3 result', async function () {
    const result = await ctr.find({})
    expect(result).toHaveLength(3)
    expect(result[0]).toHaveProperty('foo')
    expect(result[0]).toHaveProperty('id')
    expect(result[0]).toHaveProperty('createdAt')
    expect(result[0]).toHaveProperty('updatedAt')
    expect(result[1]).toHaveProperty('foo')
    expect(result[1]).toHaveProperty('id')
    expect(result[1]).toHaveProperty('createdAt')
    expect(result[1]).toHaveProperty('updatedAt')
    expect(result[2]).toHaveProperty('foo')
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
