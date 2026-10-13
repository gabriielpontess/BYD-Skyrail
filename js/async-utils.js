export function withTimeout(promise, timeoutMs, message = 'Operação excedeu o tempo limite.') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(message);
      error.name = 'TimeoutError';
      reject(error);
    }, Math.max(0, Number(timeoutMs) || 0));
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}
