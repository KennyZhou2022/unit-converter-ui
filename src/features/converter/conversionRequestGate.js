export function createConversionRequestGate() {
  let latestRequest = 0;
  return {
    next() {
      latestRequest += 1;
      return latestRequest;
    },
    isCurrent(request) {
      return request === latestRequest;
    },
  };
}
