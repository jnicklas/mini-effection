import { SuspendController } from './controller/suspend-controller';
import { PromiseController } from './controller/promise-controller';
import { FunctionContoller } from './controller/function-controller';
import { Controller } from './controller/controller';
import { Operation } from './operation';
import { Deferred } from './deferred';
import { isPromise } from './predicates';
import { Trapper } from './trapper';
import { swallowHalt, isHaltError } from './halt-error';
import { EventEmitter } from 'events';
import { StateMachine, State } from './state-machine';
import { HaltError } from './halt-error';

let COUNTER = 0;

export interface Controls<TOut> {
  halted(): void;
  resolve(value: TOut): void;
  reject(error: Error): void;
}

export interface TaskOptions {
  blockParent?: boolean;
  ignoreChildErrors?: boolean;
}

export class Task<TOut = unknown> extends EventEmitter implements Promise<TOut>, Trapper {
  public id = ++COUNTER;

  public readonly children: Set<Task> = new Set();
  private trappers: Set<Trapper> = new Set();

  private controller: Controller<TOut>;
  private deferred = Deferred<TOut>();

  private stateMachine = new StateMachine(this);

  public result?: TOut;
  public error?: Error;

  private controls: Controls<TOut> = {
    resolve: (result: TOut) => {
      this.stateMachine.resolve();
      this.result = result;
      this.children.forEach((c) => {
        if(!c.options.blockParent) {
          c.halt()
        }
      });
      this.resume();
    },

    reject: (error: Error) => {
      this.stateMachine.reject();
      this.result = undefined; // clear result if it has previously been set
      this.error = error;
      this.children.forEach((c) => c.halt());
      this.resume();
    },

    halted: () => {
      this.stateMachine.halt();
      this.children.forEach((c) => c.halt());
      this.resume();
    },
  }

  get state(): State {
    return this.stateMachine.current;
  }

  constructor(private operation: Operation<TOut>, public options: TaskOptions = {}) {
    super();
    if(!operation) {
      this.controller = new SuspendController(this.controls);
    } else if(isPromise(operation)) {
      this.controller = new PromiseController(this.controls, operation);
    } else if(typeof(operation) === 'function') {
      this.controller = new FunctionContoller(this.controls, operation);
    } else {
      throw new Error(`unkown type of operation: ${operation}`);
    }
    this.deferred.promise.catch(() => {}); // prevent uncaught promise warnings
  }

  start() {
    this.stateMachine.start();
    this.controller.start(this);
  }

  private resume() {
    if(this.stateMachine.isFinishing && this.children.size === 0) {
      this.stateMachine.finish();

      this.trappers.forEach((trapper) => trapper.trap(this as Task));

      if(this.state === 'completed') {
        this.deferred.resolve(this.result!);
      } else if(this.state === 'halted') {
        this.deferred.reject(new HaltError());
      } else if(this.state === 'errored') {
        this.deferred.reject(this.error!);
      }
    }
  }

  then<TResult1 = TOut, TResult2 = never>(onfulfilled?: ((value: TOut) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<TResult1 | TResult2> {
    return this.deferred.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): Promise<TOut | TResult> {
    return this.deferred.promise.catch(onrejected);
  }

  catchHalt(): Promise<TOut | undefined> {
    return this.deferred.promise.catch(swallowHalt);
  }

  finally(onfinally?: (() => void) | null | undefined): Promise<TOut> {
    return this.deferred.promise.finally(onfinally);
  }

  spawn<R>(operation?: Operation<R>, options?: TaskOptions): Task<R> {
    if(this.state !== 'running') {
      throw new Error('cannot spawn a child on a task which is not running');
    }
    let child = new Task(operation, options);
    this.link(child as Task);
    child.start();
    return child;
  }

  link(child: Task) {
    if(!this.children.has(child)) {
      child.addTrapper(this);
      this.children.add(child);
      this.emit('link', child);
    }
  }

  unlink(child: Task) {
    if(this.children.has(child)) {
      child.removeTrapper(this);
      this.children.delete(child);
      this.emit('unlink', child);
    }
  }

  trap(child: Task) {
    if(this.children.has(child)) {
      if(child.state === 'errored' && !this.options.ignoreChildErrors) {
        this.controls.reject(child.error!);
      }
      this.unlink(child);
    }
    this.resume();
  }

  addTrapper(trapper: Trapper) {
    this.trappers.add(trapper);
  }

  removeTrapper(trapper: Trapper) {
    this.trappers.delete(trapper);
  }

  async halt() {
    this.controller.halt();
    await this.catch(() => {});
  }

  get [Symbol.toStringTag](): string {
    return `[Task ${this.id}]`
  }
}
