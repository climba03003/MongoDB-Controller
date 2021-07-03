import { Db, MongoClient } from 'mongodb'
import * as pino from 'pino'
import Controller from '../lib'
import { wait } from './wait'

describe('constructor', function () {
  let connection: MongoClient
  let db: Db

  beforeAll(async function () {
    connection = await MongoClient.connect(process.env.MONGO_URL as string, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })
    db = await connection.db()
  })

  test('collection', function () {
    const ctr = new Controller(db.collection('constructor'))
    expect(ctr).toBeInstanceOf(Controller)
  })

  test('options', function () {
    const ctr = new Controller(db.collection('constructor'), {
      logger: { level: 'trace' }
    })
    expect(ctr).toBeInstanceOf(Controller)
  })

  test('options', function () {
    const logger = pino({ name: 'bcdefg' })
    const ctr = new Controller(db.collection('constructor'), {
      logger: logger
    })
    expect(ctr).toBeInstanceOf(Controller)
    expect(ctr.logger).toStrictEqual(logger)
  })

  test('empty options', function () {
    const ctr = new Controller(db.collection('constructor'), {})
    expect(ctr).toBeInstanceOf(Controller)
  })

  test('undefined', function () {
    expect(() => {
      // eslint-disable-next-line no-new
      new Controller()
    }).toThrowError()
  })

  afterAll(async function () {
    await wait(50)
    await connection.close()
  })
})
