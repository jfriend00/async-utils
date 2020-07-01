const {delay, timeout} = require('./utils');

let startT;

function time() {
    if (!startT) {
        startT = Date.now();
    }
    let delta = (Date.now() - startT) / 1000;
    return delta.toFixed(3);
}

// environment variable that turns debug tracing on
let debugOn = process.env["DEBUG_PROMISE_RETRY"] === "1";

function DBG(...args) {
    if (debugOn) {
        args.unshift(time() + ": ");
        console.log(...args);
    }
}


/*
    fn is a function to call with retry until it resolves and until
        limits specified in the options object are encountered

    All options below are optional

    options
        startInterval           - how often to retry initially in ms (default 1000)
        maxInterval             - longest the interval can go with backoff (default is no limit)
        maxTries                - max total attempts (default 10)
        intervalsBeforeBackoff  - how many retries before starting backoff (default 3)
        backoffFactor           - how much to backoff each time after startBackoff (default 30)
                                    this is an integer percentage such as 50 which would mean
                                    to increase the delay by 50% each time you retry after startBackoff
        maxTime                 - max time in ms to continuing doing retries.  If both maxTries and maxTime
                                    are specified, then the first limit to be reached will be observed
        functionTimeout         - max time to wait for fn() promise to resolve/reject (default infinite)
        includeRetryData        - add retryData property to a returned error object (default true)

        args                    - array of arguments [arg1, arg2, arg3] to be passed to fn
                                    as fn(arg1, arg2, arg3) - (default - no arguments)

        testRejection           - callback function that, if present, is called to test a rejected promise
        testResolve             - callback function that, if present, is called to test a resolved promise
              Both these callbacks (if present) must return an object with these properties:
                  {action: 'resolve', value: val}     resolve with the included val
                  {action: 'reject', value: val}      reject with the val as the reason
                  {action: 'retry'}                   retry (value properties is not used)

        The default testRejection() retries any rejection.
        The default testResolve() finishes on any resolved promise.

        A typical use case for testResolve() would be if you get timeout responses from an http server
        such as 408 (Request Timeout) or 504 (Gateway Timeout) response from the server and though
        those are not rejections for some http libraries (since a response was returned from the
        server), you still want to retry them.

*/

function retry(fn, options = {}) {
    // load options with defaults
    let {
        startInterval = 1000,
        maxInterval = 0,
        maxTries = 0,
        intervalsBeforeBackoff = 3,
        backoffFactor = 30,
        maxTime = 0,
        functionTimeout = 0,
        includeRetryData = true,
        args = [],
        testRejection = (e) => ({action: 'retry'}),                // default is to retry all rejections
        testResolve = (val) => ({action: 'resolve', value: val}),  // default is to resolve
    } = options;

    let retryCntr = 0;
    let firstError;
    let currentInterval = startInterval;
    let startTime = Date.now();

    if (maxInterval && maxInterval < startInterval) {
        return Promise.reject(new Error('maxInterval (if specified) must be greater than startInterval'));
    }

    // create an error object with retry data in it
    function error(reason) {
        const data = {
            retries: retryCntr,
            elapsedTime: Date.now() - startTime,
            reason: reason
        };
        let e = typeof firstError === "object" ? firstError : new Error("timeout");
        if (includeRetryData) {
            e.retryData = data;
        }
        return Promise.reject(e);
    }

    // here's where the retry timing logic is implemented
    function nextDelay() {
        if (maxTries && retryCntr >= maxTries) {
            DBG(`Exceeded maxTries of ${maxTries}`)
            return error('maxTries exceeded');
        }
        ++retryCntr;

        if (retryCntr > intervalsBeforeBackoff && backoffFactor) {
            // increase currentInterval by backoffFactor
            let newInterval = Math.round(currentInterval * ((100 + backoffFactor) / 100));
            if (maxInterval) {
                newInterval = Math.min(maxInterval, newInterval);
            }
            if (newInterval > currentInterval) {
                DBG(`Increasing interval to ${newInterval}`);
            }
            currentInterval = newInterval;
        }
        // if setting this interval would take us past maxTime, then no point
        if (maxTime && Date.now() + currentInterval - startTime > maxTime) {
            DBG(`Next retry interval would exceed maxTime of ${maxTime}`);
            return error('maxTime would be exceeded waiting for next retry');
        }
        DBG(`Waiting ${currentInterval} for next retry`);
        return delay(currentInterval);
    }

    async function runAgain() {

        async function processCallback(fn, arg, name) {
            let testResult = await fn(arg);
            switch(testResult.action) {
                case "reject":
                    return Promise.reject(testResult.value);
                case "resolve":
                    return testResult.value;
                case "retry":
                    return nextDelay().then(runAgain);
                case "default":
                    return Promise.reject(new Error(`Invalid return value from ${name} callback`));
            }
        }

        try {
            let val;
            if (functionTimeout) {
                val = await timeout(fn(...args), functionTimeout, new Error("function timeout"));
            } else {
                val = await fn(...args);
            }
            return processCallback(testResolve, val, 'testResolve');
        } catch(e) {
            //DBG(`Got rejection with ${e.message}`);
            if (!firstError) {
                firstError = e;
            }
            return processCallback(testRejection, e, 'testRejection');
        }
    }
    return runAgain();
}

// get a wrapped function with prepackaged options
// keeps you from having to repeat the same set of options over and over
retry.makeNewRetry = function(defaults) {
    return function(fn, options = {}) {
        return retry(fn, Object.assign(defaults, options));
    }
}

/*
    retry.fs(fn, options)

    special version of retry() that looks for specific file system errors and retries them,
    but errors out (without retry) on other errors

    The specific errors it looks for are the sme ones that fs.rmdir() looks for when using the recursive flag
    EBUSY, EMFILE, ENFILE, ENOTEMPTY, or EPERM

    All retry() options are supports except for testRejection because that's overriden to look for
    these specific errors

    This uses a few different defaults that are appropriate for file sytem operations:
      startInterval: 50
      maxTries: 5
    But, these are overridable if you pass your own options for them.
*/

const fsRetryCodes = new Set(['EBUSY', 'EMFILE', 'ENFILE', 'ENOTEMPTY', 'EPERM']);

retry.fs = function(fn, options = {}) {
    let opts = Object.assign({startInterval: 50, maxTries: 5}, options);
    // forcefully override the testRejection option
    opts.testRejection = function(e) {
        if (e.code && fsRetryCodes.has(e.code)) {
            return {action: 'retry'};
        } else {
            return {action: 'reject', value: e};
        }
    }
    return retry(fn, opts);
}

/*

Note for future http-related pre-built retry options (info from retry options in got() library)
retry statusCodes: 408 413 429 500 502 503 504 521 522 524
retry errorCodes:  ETIMEDOUT ECONNRESET EADDRINUSE ECONNREFUSED EPIPE ENOTFOUND ENETUNREACH EAI_AGAIN

*/



/*
    retryify adds retry behavior to any function that returns a promise
        returns a new function that has the retry behavior

    retryFn is the retry function
        defaults to the regular retry function and its defaults
        can also be set to retry.fs which has much shorter defaults
        or can be set to any retry function you make with retry.makeNewRetry()

    options is which options you want for the retry

    This can be called as:
      let retryFunction = retryify(fn);
      let retryFunction = retryify(fn, retryFn);
      let retryFunction = retryify(fn, options);
      let retryFunction = retryify(fn, retryFn, options);
*/
function retryify(fn, retryFn = retry, options = {}) {
    // check which args were passed
    if (typeof retryFn !== "function") {
        options = retryFn;
        whichRetry = retry;
    }
    return function(...args) {
        return retryFn(function() {
            return fn(...args);
        }, options);
    }
}

/*
    retryifyAll creates and returns a new object that has retry versions of all
    functions attached to the object you pass it.

    This does not modify the object you passed in.  It does bind the newly created
    methods to the original object so "this" will be set to the original object
    when they are called.
*/
function retryifyAll(obj, retryFn = retry, options = {}) {
    const retryObj = {};
    Object.getOwnPropertyNames(obj).forEach(prop => {
        if (typeof obj[prop] === "function") {
            retryObj[prop] = retryify(obj[prop].bind(obj), retryFn, options);
        }
    });
    return retryObj;
}

module.exports = { retry, retryify, retryifyAll};
