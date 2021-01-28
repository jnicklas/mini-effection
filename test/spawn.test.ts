import { describe, beforeEach, it } from 'mocha';
import * as expect from 'expect';

import { run, Task } from '../src/index';
import { Deferred } from '../src/deferred';

process.on('unhandledRejection', (reason, promise) => {
  // silence warnings in tests
});

function* sleep(ms: number) {
  let timeout;
  let deferred = Deferred();
  try {
    timeout = setTimeout(deferred.resolve, ms);
    yield deferred.promise;
  } finally {
    timeout && clearTimeout(timeout);
  }
};

describe('spawn', () => {
  it('can spawn a new child task', async () => {
    let root = run(function*(context: Task) {
      let child = context.spawn(function*() {
        let one: number = yield Promise.resolve(12);
        let two: number = yield Promise.resolve(55);

        return one + two;
      });

      return yield child;
    });
    await expect(root).resolves.toEqual(67);
    expect(root.state).toEqual('completed');
  });

  it.only('can spawn a new child task with arguments', async () => {
    function* add(task: Task, one: number, two: number) {
      return one + two;
    };

    let root = run(function*(context: Task) {
      return yield context.spawn(add, 12, 55);
    });
    await expect(root).resolves.toEqual(67);
    expect(root.state).toEqual('completed');
  });


  it('halts child when halted', async () => {
    let child: Task<void> | undefined;
    let root = run(function*(context: Task) {
      child = context.spawn(function*() {
        yield;
      });

      yield;
    });

    await root.halt();

    await expect(child).rejects.toHaveProperty('message', 'halted')
    expect(root.state).toEqual('halted');
    expect(child && child.state).toEqual('halted');
  });

  it('halts child when finishing normally', async () => {
    let child: Task<void> | undefined;
    let root = run(function*(context: Task) {
      child = context.spawn(function*() {
        yield;
      });

      return 1;
    });

    await expect(root).resolves.toEqual(1);
    await expect(child).rejects.toHaveProperty('message', 'halted')
    expect(root.state).toEqual('completed');
    expect(child && child.state).toEqual('halted');
  });

  it('halts child when errored', async () => {
    let child;
    let root = run(function*(context: Task) {
      child = context.spawn(function*() {
        yield;
      });

      throw new Error('boom');
    });

    await expect(root).rejects.toHaveProperty('message', 'boom');
    await expect(child).rejects.toHaveProperty('message', 'halted');
  });

  it('rejects parent when child errors', async () => {
    let child;
    let error = new Error("moo");
    let root = run(function*(context: Task) {
      child = context.spawn(function*() {
        throw error;
      });

      yield;
    });

    await expect(child).rejects.toEqual(error);
    await expect(root).rejects.toEqual(error);
    expect(root.state).toEqual('errored');
  });

  it('finishes normally when child halts', async () => {
    let child;
    let root = run(function*(context: Task<string>) {
      child = context.spawn();
      yield child.halt();

      return "foo";
    });

    await expect(child).rejects.toHaveProperty('message', 'halted');
    await expect(root).resolves.toEqual("foo");
    expect(root.state).toEqual('completed');
  });

  it('rejects when child errors during completing', async () => {
    let child;
    let root = run(function*(context: Task<string>) {
      child = context.spawn(function*() {
        try {
          yield
        } finally {
          throw new Error("moo");
        }
      });
      return "foo";
    });

    await expect(root).rejects.toHaveProperty('message', 'moo');
    expect(root.state).toEqual('errored');
  });

  it('rejects when child errors during halting', async () => {
    let child;
    let root = run(function*(context: Task<string>) {
      child = context.spawn(function*(foo) {
        try {
          yield
        } finally {
          throw new Error("moo");
        }
      });
      yield;
      return "foo";
    });

    root.halt();

    await expect(root).rejects.toHaveProperty('message', 'moo');
    expect(root.state).toEqual('errored');
  });

  it('throws an error when called after controller finishes', async () => {
    let child;
    let root = run(function*(context: Task) {
      child = context.spawn(function*() {
        try {
          yield sleep(1);
        } finally {
          yield sleep(100);
        }
      });

      yield sleep(10);
    });

    await run(sleep(20));

    expect(() => root.spawn()).toThrowError('cannot spawn a child on a task which is not running');
  });
});
