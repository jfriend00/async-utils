
/*
Derived from my original answer on Stackoverflow:
https://stackoverflow.com/questions/36730745/choose-proper-async-method-for-batch-processing-for-max-requests-sec/36736593#36736593

function rateMap(iterable, options, fn) {
  iterable is the data to iterate, passing each one in turn to the fn function.  It can be any finite iterable
    (anything that Array.from(iterable) can handle)
  This can be an iterable or a plain number.  If it's a number, then that represents the
    number of times to call fn(i) with an increasing value each time (starting with 0).  This can be used
    to call your function N times in a row without having to manufacture an array of numbers.

  options is an object that contains one or more properties to control the asynchronous management
    of multiple calls to fn

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

// possible improvement to actually iterate the iterable without converting to an array

function rateMap(iterable, options, fn) {
    return new Promise(function(resolve, reject) {
        const data = {};
        if (typeof iterable === "number") {
            // create a pseudo array
            data.length = iterable,
            data.getValue = function(i) { return i;}
        } else {
            // proxy the actual array
            let array = Array.from(iterable);
            Object.defineProperty(data, 'length', {get: function() {return array.length;}});
            data.getValue = function(i) {return array[i];};
        }
        const results = new Array(data.length);

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
        if (duration === 0) {
            duration = Number.MAX_SAFE_INTEGER;
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
            // Conditions for not running more requests:
            //   cancel flag is set
            //   rateLimitTimer is running (we're actively rate limited until that timer fires)
            //   spacingTimer is running (too soon after the last request)
            //   No more items in the array to process
            //   Too many items inFlight already
            // DBG(`   Begin runMore(${reason})`);
            try {
                while (!cancel && !rateTimer && index < data.length && inFlightCntr < maxInFlight) {
                    // check for rate limiting
                    // by looking back at the launchTime of the requestsPerDuration previous
                    let now = Date.now();
                    if (launchTimes.length >= requestsPerDuration) {
                        let delta = now - launchTimes[launchTimes.length - requestsPerDuration];
                        // if duration time hasn't passed yet, then we are rated limited
                        if (delta < duration) {
                            // set our timer for 1ms past our deadline so we land just past the rate limit
                            let amount = duration - delta + 1;
                            DBG(`      Rate Limited - setting timer for ${amount} ms from runMore(${reason})`);
                            rateTimer = setTimeout(() => {
                                rateTimer = null;
                                //console.log(`${time()}: Timer fired, about to runMore()`);
                                runMore(`from rate limiting timer ${amount}`);
                            }, amount);
                            break;
                        }
                    }

                    // check for minimum spacing
                    if (minSpacing && launchTimes.length) {
                        let delta = now - launchTimes[launchTimes.length - 1];
                        if (delta < minSpacing) {
                            let amount = minSpacing - delta;
                            DBG(`      Setting minSpacing timer for ${amount} ms from runMore(${reason})`);
                            rateTimer = setTimeout(() => {
                                rateTimer = null;
                                runMore(`from minSpacing timer ${amount}`);
                            }, amount);
                            break;
                        }
                    }

                    let i = index++;
                    ++inFlightCntr;
                    launchTimes.push(Date.now());
                    DBG(`Launching request ${i + 1} - (${inFlightCntr}), runMore(${reason})`);
                    fn(data.getValue(i)).then(function(val) {
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
                if (doneCntr === data.length) {
                    DBG("Done");
                    resolve(results);
                }
            } catch(e) {
                // this could end up here if fn(data.getValue(i)) threw synchronously
                cancel = true;
                reject(e);
            }
        }
        runMore("from start");
    });
}

module.exports = { rateMap };
