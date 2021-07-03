import { ObjectId, UpdateQuery } from 'mongodb'
import type { Logger } from 'pino'

export interface BasicSchema {
  id: string

  createdAt: Date
  updatedAt: Date
}

export type WithBasicSchema<T> = T & BasicSchema
export type OptionalBasicSchema<T> = T & Partial<BasicSchema>

export type WithId<T> = T & { _id: ObjectId }

export function isUpdateQuery <T> (docs: T | UpdateQuery<T>): docs is UpdateQuery<T> {
  const keys = Object.keys(docs)
  for (let i = keys.length - 1; i >= 0; i--) {
    if (['$currentDate', '$inc', '$min', '$max', '$mul', '$rename', '$set', '$setOnInsert', '$unset', '$addToSet', '$pop', '$pull', '$push', '$pushAll', '$bit'].includes(keys[i])) return true
  }
  return false
}

export function retrieveUpdateQueryData<T> (docs: T | UpdateQuery<T>): T {
  return isUpdateQuery(docs) ? Object.assign({}, docs.$set) as T : docs
}

export function mergeUpdateQueryData<T> (from: T | UpdateQuery<T>, to: T | UpdateQuery<T>): T | UpdateQuery<T> {
  const fromD = retrieveUpdateQueryData(from)
  const toD = retrieveUpdateQueryData(to)
  const data = Object.assign({}, fromD, toD)
  let result = {}
  if (isUpdateQuery(from)) result = { ...result, ...from }
  if (isUpdateQuery(to)) result = { ...result, ...to }
  return { ...result, $set: data }
}

export function isPinoLogger (p?: any): p is Logger {
  if (typeof p !== 'undefined' || p !== null) {
    return typeof p === 'object' && 'child' in p && typeof p.child === 'function'
  } else {
    return false
  }
}
