
/*
Derived from my original answer on Stackoverflow:
https://stackoverflow.com/questions/36730745/choose-proper-async-method-for-batch-processing-for-max-requests-sec/36736593#36736593

function rateMap(iterable, options, fn) {
  iterable is the data to iterate, passing each one in turn to the fn function.  It can be any finite iterable and can even
     be a custom, dynamic iterable that you dynamically decide when it's done.
  Besides an iterable, it can also be a plain number.  If it's a number, then that represents the
    number of times to call fn(i) with an increasing value each time (starting with 0).  This can be used
    to call your function N times in a row without having to manufacture an array of numbers.

  options is an object that contains one or more properties to control the asynchronous management
    of multiple calls to fn (details of the various options below)

  fn is the function to call for each value in the array.  The function will be
     passed one argument (the next value from the array) and it must return a promise
     that resolves to whatever result value you want

     If fn throws synchronously or rejects, all future iteration will be stopped immediately.  The promise that
       rateMap() returned will be rejected (like Promise.all() does).  Some requests already in flight will
       still be running, but no results will be retured.

  Returns a promise that resovles to an array of resolved values in order

    This promise will reject upon the first rejection it gets back from fn(), like Promise.all()
    does.  If you want it to complete all calls, regardless of rejections, then you
    have to wrap your fn() so it doesn't reject, just resolve to a null value or
    some other sentinel value that you can then detect or filter out of the final results

  Here's what the options object can contain:

  minSpacing - Defines the minimum period of time between two successive calls to fn().  This
    is optional and can be combined with any other option.  This prevents rapid fire requests.
    It's a simplistic form of rate limiting that only looks at the time since the previous
    request.

  duration - Defines a period of time in which consecutive requests are counted.
    This is optional.  If specified, requestsPerDuration must also be specified.

  requestsPerDuration - How many requests you can send within the duration
    This is optional.  If specified, duration must also be specified.

  So, duration and requestsPerDuration go together to define the rate limit.  If you set
    duration to 3000 and requestsPerDuration to 10, then rateMap() will manage things
    to not send more than 10 requests within any 3 second period of time

  If both duration and requestsPerDuration are zero or not present, then there is no rate limiting applied
    at all and only the other options will be applied.

  maxInFlight is the maximum number of requests that should be in flight at the same time.
    This is optional.  If all the requests are going to the same target server, this is often helpful
    to keep from overloading a target server that may not be efficient if you send it too many
    requests at once or may actually reject your requests if you send it too many.

  If no options are specified or all are zero, then no limitations at all are applied and
    this runs all the requests immediately and in parallel.  It would be roughly equivalent to
    Promise.all(array.map(fn)).

Usage Scenarios:
  Set only the minSpacing option - This gives you a Promise.all(array.map(fn)) type behavior,
    but with each of the requests spaced out by a minSpacing amount of time

  Set only the maxInFlight option - This runs no more than maxInFlight requests in parallel at once.
    So, it will start up maxInFlight requests and then each time one finishes, it will start up the
    next one.

  Set only duration and requestsPerDuration - This is pure rate limiting so you don't send more than
    requestsPerDuration requests within any duration time period.  So, if you set duration to 1000ms
    and requestsPerDuration to 2, then it won't ever send mroe than 2 requests per any one second
    of elapsed time.

  Set the minSpacing and maxInFlight - This runs the same as maxInFlight except don't send two requests
    one after another faster tahn minSpacing.

  Set all the options - This gives you rate limiting, plus minSpacing, plus maxInFlight protection.
    For any given next request, the most restrictive control will be followed so the next request
    must satisfy all criteria before it can be sent.

*/

let startT;

function time() {
    if (!startT) {
        startT = Date.now();
    }
    let delta = (Date.now() - startT) / 1000;
    return delta.toFixed(3);
}

let debugOn = process.env["DEBUG_RATE_LIMIT_MAP"] === "1";
let DBG;
if (debugOn) {
    DBG = function(...args) {
        args.unshift(time() + ": ");
        console.log(...args);
    }
} else {
    DBG = function() {};
}

// wrap our iterable so we have a look-ahead method call .isMore() that tells us
// if there's more data in the iterable or not
function proxyIterable(iterable) {
    const data = {};
    // we use an object with two methods isMore() and getNextValue() to let us
    // iterate either an iterable or our pseudo iterable
    // Critically, this also gives us "lookahead" capabilities to know if we're done or not
    // before fetching the actual next item of data which is not something an iterable normally has
    if (typeof iterable === "number") {
        // create a virtual array where we create values upon demand
        let index = 0;
        let length = iterable;
        data.isMore = function() {
            return index < length;
        }
        data.getNextValue = function() {
            if (data.isMore()) {
                return index++;
            } else {
                throw new Error("Went off the end of the proxy iterable");
            }
        }
    } else {
        // proxy the iterable so we have a lookahead method call .isMore()
        const iterator = iterable[Symbol.iterator]();
        // three possible states: "ready", "valueCached", "done"
        let state = "ready";
        let nextValue;
        data.isMore = function() {
            if (state === "done") return false;
            if (state === "valueCached") return true;
            // call the iterator to get the next value
            // cache it if present
            nextValue = iterator.next();
            if (nextValue.done) {
                state = "done";
                return false;
            } else {
                state = "valueCached";
                return true;
            }
        }
        data.getNextValue = function() {
            if (data.isMore()) {
                state = "ready";
                return nextValue.value;
            } else {
                throw new Error("Went off the end of the iterable");
            }
        }
    }
    return data;
}

function rateMap(iterable, options, fn) {
    return new Promise(function(resolve, reject) {
        const results = [];
        const data = proxyIterable(iterable);

        // Assign options to local variables with defaults
        let {
            maxInFlight = 0,
            requestsPerDuration = 0,
            duration = 0,
            minSpacing = 0
        } = options;

        if (maxInFlight < 0) {
            throw new Error("maxInFlight cannot be a negative value");
        } else if (maxInFlight === 0) {
            maxInFlight = Number.MAX_SAFE_INTEGER;
        }
        if (requestsPerDuration && duration <= 0) {
            throw new Error("If specifying requestsPerDuration, you must specify a positive duration");
        }
        if (requestsPerDuration === 0) {
            requestsPerDuration = Number.MAX_SAFE_INTEGER;
        }
        if (typeof fn !== "function") {
            throw new Error("Third parameter must be a callback function that is called for each item in the iterable");
        }

        let index = 0;              // keep track of where we are in the array
        let inFlightCntr = 0;       // how many requests currently in flight
        let doneCntr = 0;           // how many requests have finished
        let launchTimes = [];       // when we launched each request
        let cancel = false;
        let rateTimer = null;

        function runMore(reason) {

            function checkLimit(now, numRequests, duration, name) {
                let result = {name, amount: 0};
                if (duration && launchTimes.length >= numRequests) {
                    let delta = now - launchTimes[launchTimes.length - numRequests];
                    if (delta < duration) {
                        result.amount = duration - delta + 1;
                    }
                }
                return result;
            }

            // Conditions for not running more requests:
            //   cancel flag is set
            //   rateLimitTimer is running (we're actively rate limited until that timer fires)
            //   spacingTimer is running (too soon after the last request)
            //   No more items in the array to process
            //   Too many items inFlight already
            // DBG(`   Begin runMore(${reason})`);
            try {
                while (!cancel && !rateTimer && data.isMore() && inFlightCntr < maxInFlight) {
                    let now = Date.now();

                    // check for various limits on how soon we can send the next request
                    // set timer for the max time that we are limited for (to avoid setting one timer, and then another)
                    const rateLimitAmount = checkLimit(now, requestsPerDuration, duration, "rate limiting");
                    const minSpacingAmount = checkLimit(now, 1, minSpacing, "minSpacing");
                    let maxLimit = rateLimitAmount.amount > minSpacingAmount.amount ? rateLimitAmount: minSpacingAmount;
                    if (maxLimit.amount) {
                        let {amount, name} = maxLimit;
                        DBG(`      Setting ${name} timer for ${amount} ms from runMore(${reason})`);
                        rateTimer = setTimeout(() => {
                            rateTimer = null;
                            //console.log(`${time()}: Timer fired, about to runMore()`);
                            runMore(`from ${name} timer ${amount}`);
                        }, amount);
                        break;
                    }

                    let i = index++;
                    ++inFlightCntr;
                    DBG(`Launching request ${i + 1} - (${inFlightCntr}), runMore(${reason})`);
                    launchTimes.push(Date.now());
                    // keep launchTimes from growing indefinitely.
                    if (launchTimes.length > requestsPerDuration) {
                        // remove oldest launchTime
                        launchTimes.shift();
                    }
                    fn(data.getNextValue()).then(function(val) {
                        results[i] = val;
                        --inFlightCntr;
                        ++doneCntr;
                        //console.log(`${time()}: Complete request ${i} - (${inFlightCntr})`);
                        runMore(`from completion of request ${i + 1}`);
                    }, function(err) {
                        cancel = true;
                        reject(err);
                    });
                }
                // see if we're done
                if (inFlightCntr === 0 && !data.isMore()) {
                    DBG("Done");
                    resolve(results);
                }
            } catch(e) {
                // this could end up here if fn(data.getNextValue()) threw synchronously
                cancel = true;
                reject(e);
            }
        }
        runMore("from start");
    });
}

module.exports = { rateMap };
