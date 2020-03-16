import { EventEmitter } from '@climba03003/event-emitter';
import { Connector } from '@climba03003/mongodb-connector';
import * as Validator from '@climba03003/validator';
import {
  Collection,
  CollectionInsertManyOptions,
  CollectionInsertOneOptions,
  CommonOptions,
  Cursor,
  DeleteWriteOpResultObject,
  FilterQuery,
  FindOneOptions,
  InsertOneWriteOpResult,
  InsertWriteOpResult,
  MongoClientOptions,
  ObjectId,
  UpdateManyOptions,
  UpdateOneOptions,
  UpdateQuery,
  UpdateWriteOpResult
} from 'mongodb';
import * as console from './utilities';

export function isUpdateQuery<TSchema>(value: UpdateQuery<TSchema> | Partial<TSchema>): value is UpdateQuery<TSchema> {
  const arr = [
    '$currentDate',
    '$inc',
    '$min',
    '$max',
    '$mul',
    '$rename',
    '$set',
    '$setOnInsert',
    '$unset',
    '$addToSet',
    '$pop',
    '$pull',
    '$push',
    '$pullAll',
    '$bit'
  ];
  const keys = Object.keys(value);
  return arr.some(key => keys.includes(key));
}

export function isPartial<TSchema>(value: UpdateQuery<TSchema> | Partial<TSchema>): value is Partial<TSchema> {
  return !isUpdateQuery(value);
}

export function serializeUpdateDocument<TSchema>(value: UpdateQuery<TSchema> | Partial<TSchema>): UpdateQuery<TSchema> {
  if (isPartial(value)) return { $set: value };
  return value;
}

export class Controller<TSchema> extends EventEmitter {
  protected __name!: string;
  protected __connector!: Connector;
  protected __collection!: Collection<TSchema>;
  protected __isConnected = false;

  constructor(
    name = 'default',
    opt: Partial<ControllerOptions> = {
      connector: Connector.instance()
    }
  ) {
    super();

    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.__bindEvent = this.__bindEvent.bind(this);

    opt = Object.assign({}, opt);

    // this.connect();

    this.off('connector-changed', this.__bindEvent);
    this.on('connector-changed', this.__bindEvent);

    this.name = name ?? 'default';
    this.connector = opt.connector ?? Connector.instance();

    this.off('collection-name-changed', this.connect);
    this.on('collection-name-changed', this.connect);
  }

  protected async connect(): Promise<void> {
    try {
      console.debug('[%s] Try to retrieve collection %s', this.name, this.name);
      this.collection = await this.connector.collection(this.name);
      this.__isConnected = true;
    } catch (err) {
      console.warn('[%s] Unexpected error occured \n %j', this.name, err);
    }
  }

  protected async disconnect(): Promise<void> {
    this.__isConnected = false;
  }

  //======================================================CREATE=========================================================

  //  Auto Select Between insertOne or insertMany'
  public async insert(
    docs: Array<OptionalId<TSchema>> | OptionalId<TSchema>,
    options?: CollectionInsertManyOptions | CollectionInsertOneOptions
  ): Promise<InsertManyResult<TSchema> | InsertOneResult<TSchema>> {
    if (!this.__isConnected) await this.connect();

    if (Validator.Array.isArray(docs)) {
      return await this.insertMany(docs, options);
    } else {
      return await this.insertOne(docs, options);
    }
  }

  // Insert One Document
  public async insertOne(
    docs: OptionalId<TSchema>,
    options?: CollectionInsertOneOptions
  ): Promise<InsertOneResult<TSchema>> {
    if (!this.__isConnected) await this.connect();
    const args: InsertOneArguments<TSchema> = { result: undefined, docs: docs, options: options };
    console.debug('[%s] Inserting document:\n %j', this.name, args.docs);
    await this.emit('pre-insert-one', args);
    args.docs = Object.assign({}, args.docs, { createdAt: new Date() });
    args.result = await this.collection.insertOne(args.docs, options);
    await this.emit('post-insert-one', args);
    console.debug('[%s] Inserted document:\n %j', this.name, args.docs);
    return args.result;
  }

  // Insert Many Documents
  public async insertMany(
    docs: Array<OptionalId<TSchema>>,
    options?: CollectionInsertManyOptions
  ): Promise<InsertManyResult<TSchema>> {
    if (!this.__isConnected) await this.connect();
    const args: InsertManyArguments<TSchema> = { result: undefined, docs: docs, options: options };
    console.debug('[%s] Inserting documents:\n %j', this.name, args.docs);
    await this.emit('pre-insert-many', args);
    args.docs = docs.map(function(docs) {
      return Object.assign({}, docs, { createdAt: new Date() });
    });
    args.result = await this.collection.insertMany(args.docs, options);
    await this.emit('post-insert-many', args);
    console.debug('[%s] Inserted documents:\n %j', this.name, args.docs);
    return args.result;
  }

  //======================================================CREATE=========================================================

  //=======================================================READ==========================================================

  // Find
  public async find(filter: FilterQuery<TSchema> = {}, options?: FindOneOptions): Promise<FindResult<TSchema>> {
    if (!this.__isConnected) await this.connect();
    const args: FindArguments<TSchema> = { result: undefined, filter: filter, options: options };
    console.debug('[%s] Finding documents:\n %j', this.name, args.filter);
    await this.emit('pre-find', args);
    args.result = await this.collection.find(args.filter, args.options);
    await this.emit('post-find', args);
    console.debug('[%s] Found documents:\n %j', this.name, args.filter);
    return args.result;
  }

  // Find One
  public async findOne(filter: FilterQuery<TSchema> = {}, options?: FindOneOptions): Promise<FindOneResult<TSchema>> {
    if (!this.__isConnected) await this.connect();
    const args: FindOneArguments<TSchema> = { result: undefined, filter: filter, options: options };
    console.debug('[%s] Finding document:\n %j', this.name, args.filter);
    await this.emit('pre-find-one', args);
    args.result = await this.collection.findOne(args.filter, args.options);
    await this.emit('post-find-one', args);
    console.debug('[%s] Found document:\n %j', this.name, args.filter);
    return args.result ?? null;
  }

  //=======================================================READ==========================================================

  //======================================================UPDATE=========================================================

  // Update One
  public async updateOne(
    filter: FilterQuery<TSchema>,
    update: UpdateQuery<TSchema> | Partial<TSchema>,
    options?: UpdateOneOptions
  ): Promise<UpdateOneResult<TSchema>> {
    if (!this.__isConnected) await this.connect();
    const args: UpdateOneArguments<TSchema> = { result: undefined, filter: filter, update: update, options: options };
    console.debug('[%s] Updating document:\n %j\n %j', this.name, args.filter, args.update);
    await this.emit('pre-update-one', args);
    // Partial TSchema should change to Update Query
    args.update = serializeUpdateDocument(args.update);
    args.update.$set = Object.assign({}, args.update.$set, { updatedAt: new Date() });
    args.result = await this.collection.updateOne(args.filter, args.update, args.options);
    await this.emit('post-update-one', args);
    console.debug('[%s] Updated document:\n %j\n %j', this.name, args.filter, args.update);
    return args.result;
  }

  // Update Many
  public async updateMany(
    filter: FilterQuery<TSchema>,
    update: UpdateQuery<TSchema> | Partial<TSchema>,
    options?: UpdateManyOptions
  ): Promise<UpdateManyResult<TSchema>> {
    if (!this.__isConnected) await this.connect();
    const args: UpdateManyArguments<TSchema> = { result: undefined, filter: filter, update: update, options: options };
    console.debug('[%s] Updating documents:\n %j\n %j', this.name, args.filter, args.update);
    await this.emit('pre-update-many', args);
    // Partial TSchema should change to Update Query
    args.update = serializeUpdateDocument(args.update);
    args.update.$set = Object.assign({}, args.update.$set, { updatedAt: new Date() });
    args.result = await this.collection.updateMany(args.filter, args.update, args.options);
    await this.emit('post-update-many', args);
    console.debug('[%s] Updated documents:\n %j\n %j', this.name, args.filter, args.update);
    return args.result;
  }

  //======================================================UPDATE=========================================================

  //======================================================DELETE=========================================================

  // Delete One
  public async deleteOne(
    filter: FilterQuery<TSchema>,
    options?: CommonOptions & { bypassDocumentValidation?: boolean }
  ): Promise<DeleteOneResult<TSchema>> {
    if (!this.__isConnected) await this.connect();
    const args: DeleteOneArguments<TSchema> = { result: undefined, filter: filter, options: options };
    console.debug('[%s] Deleting document:\n %j', this.name, args.filter);
    await this.emit('pre-delete-one', args);
    args.result = await this.collection.deleteOne(args.filter, args.options);
    await this.emit('post-delete-one', args);
    console.debug('[%s] Deleted document:\n %j', this.name, args.filter);
    return args.result;
  }

  // Delete Many
  public async deleteMany(filter: FilterQuery<TSchema>, options?: CommonOptions): Promise<DeleteManyResult<TSchema>> {
    if (!this.__isConnected) await this.connect();
    const args: DeleteManyArguments<TSchema> = { result: undefined, filter: filter, options: options };
    console.debug('[%s] Deleting documents:\n %j', this.name, args.filter);
    await this.emit('pre-delete-many', args);
    args.result = await this.collection.deleteMany(args.filter, args.options);
    await this.emit('post-delete-many', args);
    console.debug('[%s] Deleted documents:\n %j', this.name, args.filter);
    return args.result;
  }

  //======================================================DELETE=========================================================

  protected __bindEvent(): void {
    // update collection when connector connected
    this.connector.off('connected', this.connect);
    this.connector.on('connected', this.connect);
    // disable controller when connector disconnect
    this.connector.off('disconnect', this.disconnect);
    this.connector.on('disconnect', this.disconnect);
  }

  get name(): string {
    return this.__name;
  }

  set name(name: string) {
    const o = String(this.__name);
    if (!Validator.Empty.isEmpty(name) && Validator.String.isString(name) && !Validator.String.isIdentical(name, o)) {
      this.__name = name;
      this.emit('collection-name-changed', this.__name, o);
      this.emit('setting-changed', {
        type: 'collection-name',
        current: this.__name,
        previous: o
      });
    }
  }

  get connector(): Connector {
    return this.__connector;
  }

  set connector(connector: Connector) {
    const o = {
      connectionString: this.__connector?.connectionString,
      databaseName: this.__connector?.databaseName,
      options: this.__connector?.options
    };
    const n = {
      connectionString: connector?.connectionString,
      databaseName: connector?.databaseName,
      options: connector?.options
    };
    if (!Validator.Empty.isEmpty(connector) && !Validator.JSON.isIdentical(n, o)) {
      this.__connector = connector;
      this.emit('connector-changed', this.__connector, o);
      this.emit('setting-changed', {
        type: 'connector',
        current: this.__connector,
        previous: o
      });
    }
  }

  get collection(): Collection<TSchema> {
    return this.__collection;
  }

  set collection(collection: Collection<TSchema>) {
    const o = this.__collection;
    if (!Validator.Empty.isEmpty(collection) && !Validator.Object.isEqual(collection, o)) {
      this.__collection = collection;
      this.emit('collection-changed', this.__collection, o);
      this.emit('setting-changed', {
        type: 'collection',
        current: this.__collection,
        previous: o
      });
    }
  }
}

export interface Controller<TSchema> {
  insert(docs: OptionalId<TSchema>, options?: CollectionInsertOneOptions): Promise<InsertOneResult<TSchema>>;
  insert(docs: Array<OptionalId<TSchema>>, options?: CollectionInsertManyOptions): Promise<InsertManyResult<TSchema>>;

  on(eventName: 'pre-insert-one', listener: EventCallback<InsertOneArguments<TSchema>>): this;
  on(eventName: 'post-insert-one', listener: EventCallback<InsertOneArguments<TSchema>>): this;
  on(eventName: 'pre-insert-many', listener: EventCallback<InsertManyArguments<TSchema>>): this;
  on(eventName: 'post-insert-many', listener: EventCallback<InsertManyArguments<TSchema>>): this;
  on(eventName: 'pre-find', listener: EventCallback<FindArguments<TSchema>>): this;
  on(eventName: 'post-find', listener: EventCallback<FindArguments<TSchema>>): this;
  on(eventName: 'pre-find-one', listener: EventCallback<FindOneArguments<TSchema>>): this;
  on(eventName: 'post-find-one', listener: EventCallback<FindOneArguments<TSchema>>): this;
  on(eventName: 'pre-update-one', listener: EventCallback<UpdateOneArguments<TSchema>>): this;
  on(eventName: 'post-update-one', listener: EventCallback<UpdateOneArguments<TSchema>>): this;
  on(eventName: 'pre-update-many', listener: EventCallback<UpdateManyArguments<TSchema>>): this;
  on(eventName: 'post-update-many', listener: EventCallback<UpdateManyArguments<TSchema>>): this;
  on(eventName: 'pre-delete-one', listener: EventCallback<DeleteOneArguments<TSchema>>): this;
  on(eventName: 'post-delete-one', listener: EventCallback<DeleteOneArguments<TSchema>>): this;
  on(eventName: 'pre-delete-many', listener: EventCallback<DeleteManyArguments<TSchema>>): this;
  on(eventName: 'post-delete-many', listener: EventCallback<DeleteManyArguments<TSchema>>): this;
  on(eventName: 'collection-name-changed', listener: EventCollectionNameChangedCallback): this;
  on(eventName: 'collection-changed', listener: EventCollectoinCallback<TSchema>): this;
  on(eventName: 'connector-changed', listener: EventConnectorChangedCallback): this;
  on(eventName: 'setting-changed', listener: EventSettingChangedCallback): this;
}

export type ControllerOptions = {
  connector: Connector;
};

// We can use TypeScript Omit once minimum required TypeScript Version is above 3.5
export type Omit<T, K> = Pick<T, Exclude<keyof T, K>>;
// TypeScript Omit (Exclude to be specific) does not work for objects with an "any" indexed type
export type EnhancedOmit<T, K> = string | number extends keyof T
  ? T // T has indexed type e.g. { _id: string; [k: string]: any; } or it is "any"
  : Omit<T, K>;
export type ExtractIdType<TSchema> = TSchema extends { _id: infer U } // user has defined a type for _id
  ? {} extends U
    ? Exclude<U, {}>
    : unknown extends U
    ? ObjectId
    : U
  : ObjectId; // user has not defined _id on schema
// this makes _id optional
export type OptionalId<TSchema extends { _id?: any }> = ObjectId extends TSchema['_id'] // a Schema with ObjectId _id type or "any" or "indexed type" provided
  ? EnhancedOmit<TSchema, '_id'> & { _id?: ExtractIdType<TSchema> } // a Schema provided but _id type is not ObjectId
  : WithId<TSchema>;
// this adds _id as a required property
export type WithId<TSchema> = EnhancedOmit<TSchema, '_id'> & { _id: ExtractIdType<TSchema> };

export type EventCallback<Arguments> = (args: Arguments) => void;
export type EventCollectionNameChangedCallback = (current: string, previous: string) => void;
export type EventCollectoinCallback<TSchema> = (current: Collection<TSchema>, previous: Collection<TSchema>) => void;
export type EventConnectorChangedCallback = (
  current: Connector,
  previous: {
    connectionString: string;
    databaseName: string;
    options: MongoClientOptions;
  }
) => void;
export type EventSettingChangedCallback = (args: {
  type: 'collection-name' | 'collection' | 'connector';
  current: any;
  previous: any;
}) => void;

export type InsertOneResult<TSchema> = InsertOneWriteOpResult<WithId<TSchema>>;
export type InsertOneArguments<TSchema> = {
  result?: InsertOneResult<TSchema>;
  docs: OptionalId<TSchema>;
  options?: CollectionInsertOneOptions;
};

export type InsertManyResult<TSchema> = InsertWriteOpResult<WithId<TSchema>>;
export type InsertManyArguments<TSchema> = {
  result?: InsertManyResult<TSchema>;
  docs: Array<OptionalId<TSchema>>;
  options?: CollectionInsertManyOptions;
};

export type FindResult<TSchema> = Cursor<TSchema>;
export type FindArguments<TSchema> = {
  result?: FindResult<TSchema>;
  filter: FilterQuery<TSchema>;
  options?: FindOneOptions;
};

export type FindOneResult<TSchema> = TSchema | null;
export type FindOneArguments<TSchema> = {
  result?: FindOneResult<TSchema>;
  filter: FilterQuery<TSchema>;
  options?: FindOneOptions;
};

export type UpdateOneResult<TSchema> = UpdateWriteOpResult;
export type UpdateOneArguments<TSchema> = {
  result?: UpdateOneResult<TSchema>;
  filter: FilterQuery<TSchema>;
  update: UpdateQuery<TSchema> | Partial<TSchema>;
  options?: UpdateOneOptions;
};

export type UpdateManyResult<TSchema> = UpdateWriteOpResult;
export type UpdateManyArguments<TSchema> = {
  result?: UpdateManyResult<TSchema>;
  filter: FilterQuery<TSchema>;
  update: UpdateQuery<TSchema> | Partial<TSchema>;
  options?: UpdateManyOptions;
};

export type DeleteOneResult<TSchema> = DeleteWriteOpResultObject;
export type DeleteOneArguments<TSchema> = {
  result?: DeleteOneResult<TSchema>;
  filter: FilterQuery<TSchema>;
  options?: CommonOptions & { bypassDocumentValidation?: boolean };
};

export type DeleteManyResult<TSchema> = DeleteWriteOpResultObject;
export type DeleteManyArguments<TSchema> = {
  result?: DeleteManyResult<TSchema>;
  filter: FilterQuery<TSchema>;
  options?: CommonOptions;
};
