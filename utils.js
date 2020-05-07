
// Wraps an existing iterator and proxies it's .next().  But, adds a .peek() method that lets you look ahead
// and see if there are any more values before you act on them.  It allows you to make logic decisions
// based on whether there are any more values before you've permanently fetched the value.
// peek() actually causes the value to be retrieved from the original iterator when it is called so if there
// are side effects from retrieving a value from the original iterator, those side effecdts will occur when peek()
// is called, not when next() is called.
// You can call peek() as many times as you want on the same value.  Once it has retrieved the value from
// the original iterator, it caches that value until you call next() to fetch it.  You MUST call next() to
// be able to advance the iterator.  Repeated calls to peek() will just return the same value over and over.
function getPeekIterator(iterator) {
    // three states: "noValueCached", "valueCached", "done"
    let state = "noValueCached";
    let value;
    let newIterator = {};
    // retrieve next value without advanced iterator
    newIterator.peek = function() {
        if (state === "done") return {done: true};
        if (state === "valueCached") return value;
        // state must be "noValueCached"
        value = iterator.next();
        state = value.done ? "done" : "valueCached";
        return value;
    }
    // retrieve next value, advance iterator
    newIterator.next = function() {
        let nextVal = newIterator.peek();
        if (!nextVal.done) {
            // by putting the state to noValueCached, we "take" the value out of the cache
            // so the next time peek() is called it will get a new value
            state = "noValueCached";
        }
        return nextVal;
    }
    // simple boolean wrapper around .peek()
    // returns true if there's more data, returns false is there's no more data
    newIterator.isMore = function() {
        let val = newIterator.peek();
        return !val.done;
    }
    return newIterator;
}

// Pass an iterable (like an Array or Set or Map) and it will get the default iterator
// and pass that to getPeekIterator() for you to get a peekIterator for that default iterator
function getDefaultPeekIterator(iterable) {
    return getPeekIterator(iterable[Symbol.iterator]());
}

// Use promiseAllDone() when you want two possible outcomes:
// 1) If all promises resolve, you get an array of simple results (same output as Promise.all())
// 2) If any promise rejects, you get the first rejection as a rejected promise, but you don't
//    get the rejection until all the promises are completed in some way.
// So, it differs from Promise.all() in that it does not finish until all the promises have
//    finished, even if there's a rejection
// It differs from Promise.allSettled() in two ways.  First, it will reject if any promises
//    reject whereas Promise.allSettled() never rejects.  Second, when it resolves, it
//    resolves to a simple array of results, not an arrray of objects.
function promiseAllDone(promises) {
    return Promise.allSettled(promises).then(results => {
        return results.map(r => {
            if (r.status === 'rejected') {
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
            return result.status === 'fulfilled' ? result.value : errorVal;
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

// promisifyAll implemented using util.promisify
const promisify = require('util').promisify;

function promisifyObj(obj, suffix = "Async") {
    const type = typeof obj;
    if (!(type === "function" || type === "object")) {
        throw new Error("first argument to promisifyObj() must be function or object");
    }
    if (typeof suffix !== "string") {
        throw new Error("second argument to promisifyObj() must be a string");
    }
    Object.getOwnPropertyNames(obj).filter(prop => {
        // filter out non-function properties
        return typeof obj[prop] === "function";
    }).forEach(method => {
        const asyncName = method + suffix;
        if (!(asyncName in obj)) {
            obj[asyncName] = promisify(obj[method]);
        }
    });
    return obj;
}

function promisifyAll(obj, suffix = "Async") {
    promisifyObj(obj, suffix);
    if (typeof obj === "function" && typeof obj.prototype === "object" ) {
        promisifyObj(obj.prototype, suffix);
    }
    return obj;
}


module.exports = {
    promiseSettleWithVal,
    promiseTimeout,
    promiseAllDone,
    delay,
    promisifyAll,
    promisifyObj,
    getPeekIterator,
    getDefaultPeekIterator,
 };
