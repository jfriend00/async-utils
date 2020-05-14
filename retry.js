const {delay, promiseTimeout} = require('./utils');

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

        testRejection           - callback function that, if present, is called to test a rejected promise
                                    It is called with the rejection as testRejection(reasons)
                                    Two possible return values:
                                        null - means to continue retrying this
                                        any other return value means to abort with that as the error
        testResolve             - callback function that, if present, is called to test a resolved promise
                                    Possible return values:
                                        null - means to continue retrying this (haven't gotten the
                                               desired answer yet)
                                        any other value means to resolve with this value

        Note that a couple of possible cases are not covered by the callbacks.  If you want to resolve when
        you encounter certain errors, then you can use your own fn.catch() to turn an error into a resolve.
        If you want to reject on certain resolved promises, then use your own fn.then() and turn certain
        resolutions into rejections yourself.

        The default testRejection() retries any rejection.
        The default testResolve() stops on any resolved promise.

        A typical use case for testResolve() would be if you get timeout responses from an http server
        such as 408 (Request Timeout) or 504 (Gateway Timeout) response from the server

*/

function promiseRetry(fn, options = {}) {
    // load options with defaults
    let {
        startInterval = 1000,
        maxInterval = 0,
        maxTries = 0,
        intervalsBeforeBackoff = 3,
        backoffFactor = 30,
        maxTime = 0,
        functionTimeout = 0,
        testRejection = (e) => null,
        testResolve = (val) => val,
    } = options;

    let retryCntr = 0;
    let firstError;
    let currentInterval = startInterval;
    let startTime = Date.now();

    // create an error object with retry data in it
    function error(reason) {
        const data = {
            retries: retryCntr,
            firstError: firstError,
            elapsedTime: Date.now() - startTime,
            reason: reason
        };
        let e = typeof firstError === "object" ? firstError : new Error("timeout");
        e.retryData = data;
        return Promise.reject(e);
    }

    // here's where the retry timing logic is implemented
    function nextDelay() {
        ++retryCntr;
        if (retryCntr > maxTries) {
            DBG(`Exceeded maxTries of ${maxTries}`)
            return error('maxTries exceeded');
        }
        if (retryCntr > intervalsBeforeBackoff) {
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
            return error('maxTime would be exceeded on next retry');
        }
        DBG(`Waiting ${currentInterval} for next retry`);
        return delay(currentInterval);
    }

    async function runAgain() {
        try {
            let val;
            if (functionTimeout) {
                val = await promiseTimeout(fn(), functionTimeout, new Error("function timeout"));
            } else {
                val = await fn();
            }
            let newVal = await testResolve(val);
            if (newVal !== null) {
                return newVal;
            }
            return nextDelay().then(runAgain);
        } catch(e) {
            if (!firstError) {
                firstError = e;
            }
            let testResult = await testRejection(e);
            if (testResult !== null) {
                throw testResult;
            }
            return nextDelay().then(runAgain);
        }
    }
    return runAgain();
}

// get a wrapped function with prepackaged options
// keeps you from having to repeat the same set of options over and over
promiseRetry.get(defaults) {
    return function(fn, options = {}) {
        return promiseRetry(fn, Object.assign(defaults, options));
    }
}

module.exports = { promiseRetry };
