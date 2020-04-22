// ES6 version
// can be used as either:
//    let d = Promise.Deferred();
//    let d = new Promise.Deferred();
//    d.then(...)
//    d.resolve(x);
function Deferred() {
    if (!(this instanceof Deferred)) {
        return new Deferred();
    }
    const p = this.promise = new Promise((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
    });
    this.then = p.then.bind(p);
    this.catch = p.catch.bind(p);
    if (p.finally) {
        this.finally = p.finally.bind(p);
    }
}

// Like Promise.allSettled, but instead of resolving to an array of objects that have
// the status in it, the array is just the resolved values with a sentinel errorVal
// in place of the errors (often null)
// returns promise that resolves to an array
function promiseSettleWithVal(promises, errorVal = null) {
    return Promise.allSettled(promises).then(results => {
        return results.map(result => {
            return result.status === 'filfilled' ? result.value : errorVal;
        })
    });
}

// Used to add a timeout to a promise, will reject
//   if timeout reached before promise resolves
// promiseTimeout(p).then(...).catch(...)
// promiseTimeout(promise, timeMs, [error object])
// If error object not passed, then new Error("Timeout"); will be used
// Returns promise
function promiseTimeout(p, t, e) {
    let timer;
    const pTimeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => {
            if (!e) {
                e = new Error("Timeout");
            }
            timer = null;
            reject(e);
        }, t);
    });
    return Promise.race([p, pTimeout]).finally(() => {
        // don't leave timer running if it wasn't used
        // so process can shut-down automatically, GC can run sooner, etc...
        if (timer) {
            clearTimeout(timer);
        }
    });
}

module.exports = { Deferred, promiseSettleWithVal, promiseTimeout };
