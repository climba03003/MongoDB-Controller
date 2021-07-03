import { Db, MongoClient } from 'mongodb'
import Controller, { WithBasicSchema } from '../lib'
import { wait } from './wait'

describe('findById', function () {
  let connection: MongoClient
  let db: Db
  let ctr: Controller
  let inserted: Array<WithBasicSchema<any>>
  const docs = { foo: 'bar' }

  beforeAll(async function () {
    connection = await MongoClient.connect(process.env.MONGO_URL as string, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })
    db = await connection.db()
    ctr = new Controller(db.collection('findById'))
    inserted = await ctr.insertMany([docs, docs, docs])
  })

  test('1 result', async function () {
    const result = await ctr.findById(inserted[0].id)
    expect(result).toHaveProperty('foo')
    expect(result).toHaveProperty('id')
    expect(result).toHaveProperty('createdAt')
    expect(result).toHaveProperty('updatedAt')
  })

  test('null', async function () {
    const result = await ctr.findOne({ bar: 'baz' })
    expect(result).toStrictEqual(null)
  })

  afterAll(async function () {
    await ctr.resetDatabase()
    await wait(50)
    await connection.close()
  })
})
