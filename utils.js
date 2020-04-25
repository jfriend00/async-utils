// like Promise.allSettled in that it doesn't resolve until all promises are done
// But it will still reject with the first error if there were any errors
// If there were no errors, it resolves with the full array of results
// Use it when you don't want it to resolve until all operations are done, but stil
// want a quick way to know when there's an error
function promiseAllDone(promises) {
    return Promise.allSettled(promises).then(results => {
        return results.map(r => {
            if (r.status === "rejected") {
                // reject with first error we found
                throw r.reason;
            }
            return r.value;
        });
    });
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

function delay(t, val) {
   return new Promise(function(resolve) {
       setTimeout(resolve, t, val);
   });
}


module.exports = { promiseSettleWithVal, promiseTimeout, promiseAllDone, delay };
