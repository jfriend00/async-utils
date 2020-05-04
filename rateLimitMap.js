// My ansewr on Stackoverflow:
// https://stackoverflow.com/questions/36730745/choose-proper-async-method-for-batch-processing-for-max-requests-sec/36736593#36736593

/*
  array is the array to iterate, passing each on in turn to the fn functoin

  requestsPerDuration is how many requests you can send within a the duration
    It must be an integer.  You can get fractional requests per second by setting the
    duration accordingly.  Duration values are in seconds.  For example:

  duration is in milliseconds

        requestsPerDuration         duration        requestsPerSec
        --------------------------------------------------------
        1                           1000       =>      1
        2                           1000       =>      2
        1                           2000       =>      0.5
        1                           3000       =>      0.33
        5                           2000       =>      2.5

   maxInFlight is the maximum number of requests that should be in flight at the same time
      If there is no limit for maxInFlight and the only limit is by time, then pass 0

   fn is the function to call for each value in the array.  The function will be
      passed one argument (the next value from the array) and it must return a promise
      that resolves to whatever result value you want

   Returns a promise that resovles to an array of resolved values in order

   This will reject upon the first rejection it gets back from fn() like Promise.all()
   does.  If you want it to complete all calls, regardless of rejections, then you
   have to wrap your fn() so it doesn't reject, just resolve to a null value or
   some other sentinel value that you can then detect or filter out of the final results

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

function rateLimitMap(array, maxInFlight, requestsPerDuration, duration, fn) {
    return new Promise(function(resolve, reject) {
        if (maxInFlight <= 0) {
            maxInFlight = Number.MAX_SAFE_INTEGER;
        }
        if (!Number.isInteger(requestsPerDuration) || !Number.isInteger(duration) || duration <= 0 || requestsPerDuration <= 0) {
            reject(new Error("requestsPerDuration and duration arguments must be positive integers"));
            return;
        }
        let index = 0;              // keep track of where we are in the array
        let inFlightCntr = 0;       // how many requests currently in flight
        let doneCntr = 0;           // how many requests have finished
        let launchTimes = [];       // when we launched each request
        let results = new Array(array.length);
        let cancel = false;
        let rateLimitTimer;

        function runMore(reason) {
            // Conditions for not running more requests:
            //   cancel flag is set
            //   rateLimitTimer is running (we're actively rate limited until that timer fires)
            //   No more items in the array to process
            //   Too many items inFlight already
            // DBG(`   Begin runMore(${reason})`);
            while (!cancel && !rateLimitTimer && index < array.length && inFlightCntr < maxInFlight) {
                // check out rate limit
                // by looking back at the launchTime of the requestsPerDuration previous
                if (launchTimes.length >= requestsPerDuration) {
                    let now = Date.now();
                    let delta = duration - (now - launchTimes[launchTimes.length - requestsPerDuration]);
                    // if duration time hasn't passed yet, then we are rated limited
                    if (delta > 0) {
                        // set our timer for 1ms past our deadline so we land just past the rate limit
                        ++delta;
                        DBG(`      Rate Limited - setting timer for ${delta} ms from runMore(${reason})`);
                        rateLimitTimer = setTimeout(() => {
                            rateLimitTimer = null;
                            //console.log(`${time()}: Timer fired, about to runMore()`);
                            runMore(`from timer ${delta}`);
                        }, delta);
                        break;
                    }
                }
                let i = index++;
                ++inFlightCntr;
                launchTimes.push(Date.now());
                DBG(`Launching request ${i + 1} - (${inFlightCntr}), runMore(${reason})`);
                fn(array[i]).then(function(val) {
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
            if (doneCntr === array.length) {
                DBG("Done");
                resolve(results);
            }
        }
        runMore("from start");
    });
}

module.exports = { rateLimitMap };
