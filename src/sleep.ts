import { operation } from './operation';

export const sleep = operation(function*(task, duration: number) {
  let timeoutId;
  try {
    yield new Promise((resolve) => {
      setTimeout(resolve, duration);
    });
  } finally {
    if(timeoutId) {
      clearTimeout(timeoutId);
    }
  }
});
