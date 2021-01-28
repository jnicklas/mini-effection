import { Operation } from './operation';
import { Task } from './task';
import { HaltError } from './halt-error';

export { Task } from './task';
export { Operation } from './operation';
export { sleep } from './sleep';

export function run<TOut, TArgs extends any[] = []>(operation?: Operation<TOut, TArgs>, ...args: TArgs): Task<TOut, TArgs> {
  return new Task(operation, args);
}
