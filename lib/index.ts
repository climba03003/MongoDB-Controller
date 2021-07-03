import EventEmitter from '@climba03003/event-emitter'
import AggregateBuilder, {
  MatchPipeline,
  SortPipeline
} from '@climba03003/mongodb-aggregate-builder'
import * as Validator from '@climba03003/validator'
import {
  Collection,
  CollectionInsertManyOptions,
  CollectionInsertOneOptions,
  CommonOptions,
  FilterQuery,
  FindOneOptions,
  UpdateManyOptions,
  UpdateOneOptions,
  UpdateQuery
} from 'mongodb'
import type { Logger, LoggerOptions } from 'pino'
import * as pino from 'pino'
import * as uuid from 'uuid'
import {
  kAddHooks,
  kAppendBasicSchema,
  kAppendUpdatedSchema,
  kCollection,
  kCreateIndex,
  kNormalizeFilter,
  kTransformRegExpSearch
} from './constant'
import {
  isPinoLogger,
  isUpdateQuery,
  OptionalBasicSchema,
  WithBasicSchema
} from './util'

export interface ControllerOptions {
  logger?: LoggerOptions | Logger
  searchFields?: string[]
  filterRegExp?: RegExp
  autoRegExpSearch?: boolean
  buildAggregateBuilder?(): AggregateBuilder
}

export class Controller<T = any> extends EventEmitter {
  private [kCollection]: Collection
  collectionName: string
  logger: Logger
  searchFields: string[]
  filterRegExp: RegExp
  autoRegExpSearch: boolean

  get collection (): Collection {
    return this[kCollection]
  }

  set collection (collection: Collection) {
    this[kCollection] = collection
  }

  constructor (collection?: Collection, options?: ControllerOptions) {
    super()
    if (Validator.isEmpty(collection)) {
      throw new Error('collection cannot be empty')
    }
    this.collection = collection
    this.collectionName = this.collection.collectionName
    if (isPinoLogger(options?.logger)) {
      this.logger = options?.logger as Logger
    } else {
      this.logger = pino({
        name: `controller/${this.collectionName}`,
        level: 'info',
        ...options?.logger
      })
    }
    this.searchFields = options?.searchFields ?? []
    this.filterRegExp =
      options?.filterRegExp ??
      /([a-zA-Z0-9.$]+):([a-zA-Z0-9-\u3000\u3400-\u4DBF\u4E00-\u9FFF.]+|{.+?}),/g
    this.autoRegExpSearch = options?.autoRegExpSearch ?? false
    this[kAddHooks]()
    void this.emit('created')
  }

  /**
   * Index
   */
  async [kCreateIndex] (): Promise<void> {
    this.logger.trace('[func Symbol("createIndex")]')
    await this.collection.createIndex(
      {
        id: 1
      },
      {
        unique: true
      }
    )
  }

  /**
   * Optional Create Index
   */
  async createIndex (): Promise<void> {
    this.logger.trace('[func createIndex]')
  }

  [kAddHooks] (): void {
    this.logger.trace('[func Symbol("addHooks")]')
    const createIndex = async (): Promise<void> => {
      await this[kCreateIndex]()
      await this.createIndex()
    }
    this.once('created', createIndex)
    this.once('post-reset', createIndex)
  }

  [kAppendBasicSchema] (
    docs: T | T[]
  ): WithBasicSchema<T> | Array<WithBasicSchema<T>> {
    this.logger.trace('[func Symbol("appendBasicSchema")]')
    const now = new Date()
    if (Validator.isArray(docs)) {
      return docs.map(function (d) {
        return Object.assign({}, d, {
          id: uuid.v4(),
          createdAt: now,
          updatedAt: now
        })
      })
    } else {
      return Object.assign({}, docs, {
        id: uuid.v4(),
        createdAt: now,
        updatedAt: now
      })
    }
  }

  [kAppendUpdatedSchema] (
    docs: T | UpdateQuery<T>
  ): OptionalBasicSchema<T> | UpdateQuery<OptionalBasicSchema<T>> {
    this.logger.trace('[func Symbol("appendUpdatedSchema")]')
    if (isUpdateQuery(docs)) {
      const item: OptionalBasicSchema<T> = this[kAppendBasicSchema](
        docs.$set as T
      )
      delete item.id
      delete item.createdAt
      docs.$set = item
      return docs
    } else {
      const result: OptionalBasicSchema<T> = this[kAppendBasicSchema](docs)
      delete result.id
      delete result.createdAt
      return result
    }
  }

  [kNormalizeFilter] (text: string | object): unknown {
    const normalize = this[kNormalizeFilter].bind(this)
    // security guard
    const tmp =
      Validator.isObject(text) && !Validator.isNull(text)
        ? JSON.stringify(text)
        : String(text)
    if (tmp.includes('$function') || tmp.includes('$accumulator')) {
      throw new Error('invalid operator found')
    }
    // start normalize
    if (
      Validator.isString(text) &&
      text.startsWith('{') &&
      text.endsWith('}')
    ) {
      return normalize(JSON.parse(text))
    }
    if (
      tmp.toLocaleLowerCase() === 'true' ||
      tmp.toLocaleLowerCase() === 'false'
    ) {
      return Boolean(tmp)
    }
    if (!isNaN(tmp as never as number)) {
      return Number(tmp)
    }
    if (Validator.Date.isISO8601Date(tmp)) {
      return new Date(tmp)
    }
    if (Validator.isArray(text)) {
      return text.map(normalize)
    }
    if (
      !Validator.isNumber(text) &&
      !Validator.isString(text) &&
      Validator.isJSON(text)
    ) {
      const o = JSON.parse(tmp)
      Object.entries(o).forEach(function ([k, v]) {
        // keep $expr $dateFromString work as before
        // $regex must be string
        if (k === 'dateString' || k === '$regex') {
          o[k] = String(v)
        } else {
          o[k] = normalize(v as string)
        }
      })
      return o
    }
    return text
  }

  [kTransformRegExpSearch] (text: string | object): unknown {
    if (
      typeof text === 'string' &&
      !text.startsWith('{') &&
      !text.endsWith('}')
    ) {
      return { $regex: text, $options: 'i' }
    } else {
      return text
    }
  }

  async count (search?: string, filter?: string): Promise<number> {
    this.logger.trace('[func count]')
    await this.emit('pre-count', search, filter)
    const found = await this.search(search, filter)
    const result = found.length
    await this.emit('post-count', result, search, filter)
    return result
  }

  async search<U = any>(
    search?: string,
    filter?: string,
    sort?: string,
    page?: number,
    pageSize?: number
  ): Promise<U[]> {
    this.logger.trace('[func search]')
    await this.emit('pre-search', search, filter, sort, page, pageSize)
    const pipeline = this.computePipeline(
      search,
      filter,
      sort,
      page,
      pageSize
    ).toArray()
    const result = await this.collection.aggregate(pipeline).toArray()
    await this.emit(
      'post-search',
      result,
      search,
      filter,
      sort,
      page,
      pageSize
    )
    return result
  }

  async insertOne (
    docs: T,
    options?: CollectionInsertOneOptions
  ): Promise<T | null> {
    this.logger.trace('[func insertOne]')
    const doc = this[kAppendBasicSchema](docs)
    await this.emit('pre-insert-one', doc, options)
    await this.collection.insertOne(doc, options)
    const result = await this.collection.findOne({
      id: doc.id
    })
    await this.emit('post-insert-one', result, doc, options)
    return result
  }

  async insertMany (
    docs: T[],
    options?: CollectionInsertManyOptions
  ): Promise<T[]> {
    this.logger.trace('[func insertMany]')
    const doc = this[kAppendBasicSchema](docs)
    await this.emit('pre-insert-many', doc, options)
    await this.collection.insertMany(doc, options)
    const result = await this.collection
      .find(
        {
          id: {
            $in: doc.map((d) => d.id)
          }
        },
        {
          sort: {
            createdAt: 1
          }
        }
      )
      .toArray()
    await this.emit('post-insert-many', result, doc, options)
    return result
  }

  async find (
    filter: FilterQuery<T>,
    options?: FindOneOptions<any>
  ): Promise<T[]> {
    this.logger.trace('[func find]')
    await this.emit('pre-find', filter, options)
    // TODO: upstream required the as statement here
    const result = await this.collection
      .find(filter, options as FindOneOptions<any>)
      .toArray()
    await this.emit('post-find', result, filter, options)
    return result
  }

  async findOne (
    filter: FilterQuery<T>,
    options?: FindOneOptions<any>
  ): Promise<T | null> {
    this.logger.trace('[func findOne]')
    await this.emit('pre-find-one', filter, options)
    const result = await this.collection.findOne(filter, options)
    await this.emit('post-find-one', result, filter, options)
    return result
  }

  async findById (id: string, options?: FindOneOptions<any>): Promise<T | null> {
    this.logger.trace('[func findById]')
    await this.emit('pre-find-by-id', id, options)
    const result = await this.collection.findOne({ id }, options)
    await this.emit('post-find-by-id', result, id, options)
    return result
  }

  async updateOne (
    filter: FilterQuery<T>,
    docs: T | UpdateQuery<T>,
    options?: UpdateOneOptions
  ): Promise<T | null> {
    this.logger.trace('[func updateOne]')
    const doc = this[kAppendUpdatedSchema](docs)
    await this.emit('pre-update-one', filter, doc, options)
    if (isUpdateQuery(doc)) {
      await this.collection.updateOne(filter, doc, options)
    } else {
      await this.collection.updateOne(filter, { $set: doc }, options)
    }
    const result = await this.collection.findOne(filter)
    await this.emit('post-update-one', result, filter, doc, options)
    return result
  }

  async updateMany (
    filter: FilterQuery<T>,
    docs: T | UpdateQuery<T>,
    options?: UpdateManyOptions
  ): Promise<T[]> {
    this.logger.trace('[func updateMany]')
    const doc = this[kAppendUpdatedSchema](docs)
    await this.emit('pre-update-many', filter, doc, options)
    if (isUpdateQuery(doc)) {
      await this.collection.updateMany(filter, doc, options)
    } else {
      await this.collection.updateMany(filter, { $set: doc }, options)
    }
    const result = await this.collection.find(filter).toArray()
    await this.emit('post-update-many', result, filter, doc, options)
    return result
  }

  async updateById (
    id: string,
    docs: T | UpdateQuery<T>,
    options?: FindOneOptions<any>
  ): Promise<T | null> {
    this.logger.trace('[func updateById]')
    const doc = this[kAppendUpdatedSchema](docs)
    await this.emit('pre-update-by-id', id, doc, options)
    if (isUpdateQuery(doc)) {
      await this.collection.updateOne({ id }, doc, options)
    } else {
      await this.collection.updateOne({ id }, { $set: doc }, options)
    }
    const result = await this.collection.findOne({ id }, options)
    await this.emit('post-update-by-id', result, id, doc, options)
    return result
  }

  async deleteOne (
    filter: FilterQuery<T>,
    options?: CommonOptions & { bypassDocumentValidation?: boolean }
  ): Promise<T | null> {
    this.logger.trace('[func deleteOne]')
    const result = await this.collection.findOne(filter)
    await this.emit('pre-delete-one', filter, options)
    await this.collection.deleteOne(filter, options)
    await this.emit('post-delete-one', result, filter, options)
    return result
  }

  async deleteMany (
    filter: FilterQuery<T>,
    options?: CommonOptions & { bypassDocumentValidation?: boolean }
  ): Promise<T[]> {
    this.logger.trace('[func deleteMany]')
    const result = await this.collection.find(filter).toArray()
    await this.emit('pre-delete-many', filter, options)
    await this.collection.deleteMany(filter, options)
    await this.emit('post-delete-many', result, filter, options)
    return result
  }

  async deleteById (
    id: string,
    options?: CommonOptions & { bypassDocumentValidation?: boolean }
  ): Promise<T | null> {
    this.logger.trace('[func deleteById]')
    const result = await this.collection.findOne({ id }, options)
    await this.emit('pre-delete-by-id', id, options)
    await this.collection.deleteOne({ id }, options)
    await this.emit('post-delete-by-id', result, id, options)
    return result
  }

  async resetDatabase (): Promise<boolean> {
    this.logger.trace('[func resetDatabase]')
    await this.emit('pre-reset')
    await this.collection.drop()
    await this.emit('post-reset')
    return true
  }

  // query format search=<string> filter=foo:a,bar:b
  computeQuery (search?: any, filter?: any, ..._args: any[]): AggregateBuilder {
    const normalize = this[kNormalizeFilter].bind(this)
    const transformRegExpSearch = this[kTransformRegExpSearch].bind(this)
    this.logger.trace('[func computeQuery]')
    const opt: MatchPipeline = {}
    const arr: any[] = []
    const builder = new AggregateBuilder()
    if (
      (Validator.isString(search) || Validator.isObject(search)) &&
      Validator.isExist(search) &&
      this.searchFields.length > 0
    ) {
      // search should use regex to maximize search result
      if (this.autoRegExpSearch) {
        search = transformRegExpSearch(search)
      }
      const sub: any[] = []
      this.searchFields.forEach(function (fields) {
        sub.push({ [fields]: normalize(search) })
      })
      arr.push({ $or: sub })
    }
    if (typeof filter === 'string') {
      if (!filter.endsWith(',')) filter = filter + ','
      let found = this.filterRegExp.exec(filter)
      while (found !== null) {
        const [, key, value] = found
        arr.push({ [key]: normalize(value) })
        found = this.filterRegExp.exec(filter)
      }
    }
    if (arr.length > 0) {
      opt.$and = arr
    }
    builder.match(opt)
    return builder
  }

  // sort format +foo,-bar (+) can be omit
  computeSort (sort?: string): AggregateBuilder | false {
    this.logger.trace('[func computeSort]')
    if (typeof sort === 'string') {
      const opt: SortPipeline = {}
      const builder = new AggregateBuilder()
      sort.split(',').forEach(function (o) {
        const orderKey = o.startsWith('-') ? '-' : '+'
        const key = o.replace(orderKey, '').trim()
        const order = orderKey === '-' ? -1 : 1
        // prevent empty key
        if (Validator.isExist(key)) opt[key] = order
      })
      builder.sort(opt)
      return builder
    } else {
      return false
    }
  }

  computeOption (page?: number, pageSize?: number): AggregateBuilder | false {
    this.logger.trace('[func computeOption]')
    if (typeof page !== 'undefined' && typeof pageSize !== 'undefined') {
      const builder = new AggregateBuilder()
      const skip = page > 0 ? (page - 1) * pageSize : 0
      builder.limit(pageSize + skip)
      builder.skip(skip)
      return builder
    } else {
      return false
    }
  }

  computePipeline (
    search?: string,
    filter?: string,
    sort?: string,
    page?: number,
    pageSize?: number
  ): AggregateBuilder {
    const builder = this.buildAggregateBuilder()
    builder.concat(this.computeQuery(search, filter))
    const s = this.computeSort(sort)
    if (s !== false) builder.concat(s)
    const p = this.computeOption(page, pageSize)
    if (p !== false) builder.concat(p)
    return builder
  }

  buildAggregateBuilder (): AggregateBuilder {
    return new AggregateBuilder()
  }
}

/**
 * Overload Methods
 */
export interface Controller<T = any> {
  [kAppendBasicSchema](docs: T): WithBasicSchema<T>
  [kAppendBasicSchema](docs: T[]): Array<WithBasicSchema<T>>
  [kAppendUpdatedSchema](docs: T): OptionalBasicSchema<T>
  [kAppendUpdatedSchema](
    docs: UpdateQuery<T>
  ): UpdateQuery<OptionalBasicSchema<T>>

  on(event: 'created', callback: () => void | Promise<void>): this
  on(event: 'pre-reset', callback: () => void | Promise<void>): this
  on(event: 'post-reset', callback: () => void | Promise<void>): this
  on(
    event: 'pre-insert-one',
    callback: (
      docs: T,
      options?: CollectionInsertOneOptions
    ) => void | Promise<void>
  ): this
  on(
    event: 'post-insert-one',
    callback: (
      result: T | null,
      docs: T,
      options?: CollectionInsertOneOptions
    ) => void | Promise<void>
  ): this
  on(
    event: 'pre-insert-many',
    callback: (
      docs: T[],
      options?: CollectionInsertOneOptions
    ) => void | Promise<void>
  ): this
  on(
    event: 'post-insert-many',
    callback: (
      result: T[],
      docs: T[],
      options?: CollectionInsertOneOptions
    ) => void | Promise<void>
  ): this
  on(
    event: 'pre-find',
    callback: (
      filter: FilterQuery<T>,
      options?: FindOneOptions<any>
    ) => void | Promise<void>
  ): this
  on(
    event: 'post-find',
    callback: (
      result: T[],
      filter: FilterQuery<T>,
      options?: FindOneOptions<any>
    ) => void | Promise<void>
  ): this
  on(
    event: 'pre-find-one',
    callback: (
      filter: FilterQuery<T>,
      options?: FindOneOptions<any>
    ) => void | Promise<void>
  ): this
  on(
    event: 'post-find-one',
    callback: (
      result: T | null,
      filter: FilterQuery<T>,
      options?: FindOneOptions<any>
    ) => void | Promise<void>
  ): this
  on(
    event: 'pre-find-by-id',
    callback: (
      id: string,
      options?: FindOneOptions<any>
    ) => void | Promise<void>
  ): this
  on(
    event: 'post-find-by-id',
    callback: (
      result: T | null,
      id: string,
      options?: FindOneOptions<any>
    ) => void | Promise<void>
  ): this
  on(
    event: 'pre-update-one',
    callback: (
      filter: FilterQuery<T>,
      docs: T,
      options?: UpdateOneOptions
    ) => void | Promise<void>
  ): this
  on(
    event: 'post-update-one',
    callback: (
      result: T | null,
      filter: FilterQuery<T>,
      docs: T,
      options?: UpdateOneOptions
    ) => void | Promise<void>
  ): this
  on(
    event: 'pre-update-many',
    callback: (
      filter: FilterQuery<T>,
      docs: T,
      options?: UpdateManyOptions
    ) => void | Promise<void>
  ): this
  on(
    event: 'post-update-many',
    callback: (
      result: T[],
      filter: FilterQuery<T>,
      docs: T,
      options?: UpdateManyOptions
    ) => void | Promise<void>
  ): this
  on(
    event: 'pre-update-by-id',
    callback: (
      id: string,
      docs: T,
      options?: UpdateOneOptions
    ) => void | Promise<void>
  ): this
  on(
    event: 'post-update-by-id',
    callback: (
      result: T | null,
      id: string,
      docs: T,
      options?: UpdateOneOptions
    ) => void | Promise<void>
  ): this
  on(
    event: 'pre-delete-one',
    callback: (
      filter: FilterQuery<T>,
      options?: CommonOptions & { bypassDocumentValidation?: boolean }
    ) => void | Promise<void>
  ): this
  on(
    event: 'post-delete-one',
    callback: (
      result: T | null,
      filter: FilterQuery<T>,
      options?: CommonOptions & { bypassDocumentValidation?: boolean }
    ) => void | Promise<void>
  ): this
  on(
    event: 'pre-delete-many',
    callback: (
      filter: FilterQuery<T>,
      options?: CommonOptions & { bypassDocumentValidation?: boolean }
    ) => void | Promise<void>
  ): this
  on(
    event: 'post-delete-many',
    callback: (
      result: T[],
      filter: FilterQuery<T>,
      options?: CommonOptions & { bypassDocumentValidation?: boolean }
    ) => void | Promise<void>
  ): this
  on(
    event: 'pre-delete-by-id',
    callback: (
      id: string,
      options?: CommonOptions & { bypassDocumentValidation?: boolean }
    ) => void | Promise<void>
  ): this
  on(
    event: 'post-delete-by-id',
    callback: (
      result: T | null,
      id: string,
      options?: CommonOptions & { bypassDocumentValidation?: boolean }
    ) => void | Promise<void>
  ): this

  once(event: 'created', callback: () => void | Promise<void>): this
  once(event: 'pre-reset', callback: () => void | Promise<void>): this
  once(event: 'post-reset', callback: () => void | Promise<void>): this
  once(
    event: 'pre-insert-one',
    callback: (
      docs: T,
      options?: CollectionInsertOneOptions
    ) => void | Promise<void>
  ): this
  once(
    event: 'post-insert-one',
    callback: (
      result: T | null,
      docs: T,
      options?: CollectionInsertOneOptions
    ) => void | Promise<void>
  ): this
  once(
    event: 'pre-insert-many',
    callback: (
      docs: T[],
      options?: CollectionInsertOneOptions
    ) => void | Promise<void>
  ): this
  once(
    event: 'post-insert-many',
    callback: (
      result: T[],
      docs: T[],
      options?: CollectionInsertOneOptions
    ) => void | Promise<void>
  ): this
  once(
    event: 'pre-find',
    callback: (
      filter: FilterQuery<T>,
      options?: FindOneOptions<any>
    ) => void | Promise<void>
  ): this
  once(
    event: 'post-find',
    callback: (
      result: T[],
      filter: FilterQuery<T>,
      options?: FindOneOptions<any>
    ) => void | Promise<void>
  ): this
  once(
    event: 'pre-find-one',
    callback: (
      filter: FilterQuery<T>,
      options?: FindOneOptions<any>
    ) => void | Promise<void>
  ): this
  once(
    event: 'post-find-one',
    callback: (
      result: T | null,
      filter: FilterQuery<T>,
      options?: FindOneOptions<any>
    ) => void | Promise<void>
  ): this
  once(
    event: 'pre-find-by-id',
    callback: (
      id: string,
      options?: FindOneOptions<any>
    ) => void | Promise<void>
  ): this
  once(
    event: 'post-find-by-id',
    callback: (
      result: T | null,
      id: string,
      options?: FindOneOptions<any>
    ) => void | Promise<void>
  ): this
  once(
    event: 'pre-update-one',
    callback: (
      filter: FilterQuery<T>,
      docs: T,
      options?: UpdateOneOptions
    ) => void | Promise<void>
  ): this
  once(
    event: 'post-update-one',
    callback: (
      result: T | null,
      filter: FilterQuery<T>,
      docs: T,
      options?: UpdateOneOptions
    ) => void | Promise<void>
  ): this
  once(
    event: 'pre-update-many',
    callback: (
      filter: FilterQuery<T>,
      docs: T,
      options?: UpdateManyOptions
    ) => void | Promise<void>
  ): this
  once(
    event: 'post-update-many',
    callback: (
      result: T[],
      filter: FilterQuery<T>,
      docs: T,
      options?: UpdateManyOptions
    ) => void | Promise<void>
  ): this
  once(
    event: 'pre-update-by-id',
    callback: (
      id: string,
      docs: T,
      options?: UpdateOneOptions
    ) => void | Promise<void>
  ): this
  once(
    event: 'post-update-by-id',
    callback: (
      result: T | null,
      id: string,
      docs: T,
      options?: UpdateOneOptions
    ) => void | Promise<void>
  ): this
  once(
    event: 'pre-delete-one',
    callback: (
      filter: FilterQuery<T>,
      options?: CommonOptions & { bypassDocumentValidation?: boolean }
    ) => void | Promise<void>
  ): this
  once(
    event: 'post-delete-one',
    callback: (
      result: T | null,
      filter: FilterQuery<T>,
      options?: CommonOptions & { bypassDocumentValidation?: boolean }
    ) => void | Promise<void>
  ): this
  once(
    event: 'pre-delete-many',
    callback: (
      filter: FilterQuery<T>,
      options?: CommonOptions & { bypassDocumentValidation?: boolean }
    ) => void | Promise<void>
  ): this
  once(
    event: 'post-delete-many',
    callback: (
      result: T[],
      filter: FilterQuery<T>,
      options?: CommonOptions & { bypassDocumentValidation?: boolean }
    ) => void | Promise<void>
  ): this
  once(
    event: 'pre-delete-by-id',
    callback: (
      id: string,
      options?: CommonOptions & { bypassDocumentValidation?: boolean }
    ) => void | Promise<void>
  ): this
  once(
    event: 'post-delete-by-id',
    callback: (
      result: T | null,
      id: string,
      options?: CommonOptions & { bypassDocumentValidation?: boolean }
    ) => void | Promise<void>
  ): this

  addListener(event: 'created', callback: () => void | Promise<void>): this
  addListener(event: 'pre-reset', callback: () => void | Promise<void>): this
  addListener(event: 'post-reset', callback: () => void | Promise<void>): this
  addListener(
    event: 'pre-insert-one',
    callback: (
      docs: T,
      options?: CollectionInsertOneOptions
    ) => void | Promise<void>
  ): this
  addListener(
    event: 'post-insert-one',
    callback: (
      result: T | null,
      docs: T,
      options?: CollectionInsertOneOptions
    ) => void | Promise<void>
  ): this
  addListener(
    event: 'pre-insert-many',
    callback: (
      docs: T[],
      options?: CollectionInsertOneOptions
    ) => void | Promise<void>
  ): this
  addListener(
    event: 'post-insert-many',
    callback: (
      result: T[],
      docs: T[],
      options?: CollectionInsertOneOptions
    ) => void | Promise<void>
  ): this
  addListener(
    event: 'pre-find',
    callback: (
      filter: FilterQuery<T>,
      options?: FindOneOptions<any>
    ) => void | Promise<void>
  ): this
  addListener(
    event: 'post-find',
    callback: (
      result: T[],
      filter: FilterQuery<T>,
      options?: FindOneOptions<any>
    ) => void | Promise<void>
  ): this
  addListener(
    event: 'pre-find-one',
    callback: (
      filter: FilterQuery<T>,
      options?: FindOneOptions<any>
    ) => void | Promise<void>
  ): this
  addListener(
    event: 'post-find-one',
    callback: (
      result: T | null,
      filter: FilterQuery<T>,
      options?: FindOneOptions<any>
    ) => void | Promise<void>
  ): this
  addListener(
    event: 'pre-find-by-id',
    callback: (
      id: string,
      options?: FindOneOptions<any>
    ) => void | Promise<void>
  ): this
  addListener(
    event: 'post-find-by-id',
    callback: (
      result: T | null,
      id: string,
      options?: FindOneOptions<any>
    ) => void | Promise<void>
  ): this
  addListener(
    event: 'pre-update-one',
    callback: (
      filter: FilterQuery<T>,
      docs: T,
      options?: UpdateOneOptions
    ) => void | Promise<void>
  ): this
  addListener(
    event: 'post-update-one',
    callback: (
      result: T | null,
      filter: FilterQuery<T>,
      docs: T,
      options?: UpdateOneOptions
    ) => void | Promise<void>
  ): this
  addListener(
    event: 'pre-update-many',
    callback: (
      filter: FilterQuery<T>,
      docs: T,
      options?: UpdateManyOptions
    ) => void | Promise<void>
  ): this
  addListener(
    event: 'post-update-many',
    callback: (
      result: T[],
      filter: FilterQuery<T>,
      docs: T,
      options?: UpdateManyOptions
    ) => void | Promise<void>
  ): this
  addListener(
    event: 'pre-update-by-id',
    callback: (
      id: string,
      docs: T,
      options?: UpdateOneOptions
    ) => void | Promise<void>
  ): this
  addListener(
    event: 'post-update-by-id',
    callback: (
      result: T | null,
      id: string,
      docs: T,
      options?: UpdateOneOptions
    ) => void | Promise<void>
  ): this
  addListener(
    event: 'pre-delete-one',
    callback: (
      filter: FilterQuery<T>,
      options?: CommonOptions & { bypassDocumentValidation?: boolean }
    ) => void | Promise<void>
  ): this
  addListener(
    event: 'post-delete-one',
    callback: (
      result: T | null,
      filter: FilterQuery<T>,
      options?: CommonOptions & { bypassDocumentValidation?: boolean }
    ) => void | Promise<void>
  ): this
  addListener(
    event: 'pre-delete-many',
    callback: (
      filter: FilterQuery<T>,
      options?: CommonOptions & { bypassDocumentValidation?: boolean }
    ) => void | Promise<void>
  ): this
  addListener(
    event: 'post-delete-many',
    callback: (
      result: T[],
      filter: FilterQuery<T>,
      options?: CommonOptions & { bypassDocumentValidation?: boolean }
    ) => void | Promise<void>
  ): this
  addListener(
    event: 'pre-delete-by-id',
    callback: (
      id: string,
      options?: CommonOptions & { bypassDocumentValidation?: boolean }
    ) => void | Promise<void>
  ): this
  addListener(
    event: 'post-delete-by-id',
    callback: (
      result: T | null,
      id: string,
      options?: CommonOptions & { bypassDocumentValidation?: boolean }
    ) => void | Promise<void>
  ): this
}

export * from './constant'
export * from './util'

export default Controller
