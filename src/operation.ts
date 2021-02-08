import { Task } from './task';

export type OperationGenerator<TOut> = Generator<Operation<any>, TOut | undefined, any>;

export type OperationFunction<TOut> = (task: Task<TOut>) => OperationGenerator<TOut>;

export type Operation<TOut> =
  OperationFunction<TOut> |
  OperationGenerator<TOut> |
  PromiseLike<TOut> |
  undefined

export function operation<TOut, TArgs extends unknown[]>(fn: (task: Task<TOut>, ...args: TArgs) => OperationGenerator<TOut>): (...args: TArgs) => Operation<TOut> {
  return (...args: TArgs) => (task) => fn(task, ...args)
}
