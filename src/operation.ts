import { Task } from './task';

export type Operation<TOut, TArgs extends any[] = []> =
  ((task: Task<TOut>, ...args: TArgs) => Generator<Operation<any, any>, TOut | undefined, any>) |
  Generator<Operation<any, any>, TOut | undefined, any> |
  PromiseLike<TOut> |
  undefined
