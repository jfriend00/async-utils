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
        includeRetryData        - add retryData property to a returns error object (default true)

        testRejection           - callback function that, if present, is called to test a rejected promise
        testResolve             - callback function that, if present, is called to test a resolved promise
              Both these callbacks (if present) must return an object with these properties:
                  {action: 'resolve', value: val}     resolve with the included val
                  {action: 'reject', value: val}      reject with the val as the reason
                  {action: 'retry'}                   retry (value properties is not used)

        The default testRejection() retries any rejection.
        The default testResolve() stops on any resolved promise.

        A typical use case for testResolve() would be if you get timeout responses from an http server
        such as 408 (Request Timeout) or 504 (Gateway Timeout) response from the server and though
        those are not rejections for some http libraries (since a response was returned from the
        server), you still want to retry them.

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
        includeRetryData = true,
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
                val = await promiseTimeout(fn(), functionTimeout, new Error("function timeout"));
            } else {
                val = await fn();
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
promiseRetry.get = function(defaults) {
    return function(fn, options = {}) {
        return promiseRetry(fn, Object.assign(defaults, options));
    }
}



module.exports = { promiseRetry };
