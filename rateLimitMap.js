// My ansewr on Stackoverflow:
// https://stackoverflow.com/questions/36730745/choose-proper-async-method-for-batch-processing-for-max-requests-sec/36736593#36736593

/*
  array is the array to iterate, passing each on in turn to the fn functoin

  duration is in milliseconds
    Defines a period of time in which consecutive requests are counted.

  requestsPerDuration is how many requests you can send within the duration
    It must be an integer.

  So, duration and requestsPerDuration go together to define the rate limit.  If you set
  duration to 3000 and requestsPerDuration to 10, then rateLimitMap() will manage things
  to not send more than 10 requests within any 3 second period of time

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
        if (typeof fn !== "function") {
            reject(new Error("fifth parameter must be a callback function that is called for each item in the array"));
            return;
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
            try {
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
            } catch(e) {
                // this could end up here if fn(array[i]) threw synchronously
                cancel = true;
                reject(e);
            }
        }
        runMore("from start");
    });
}

module.exports = { rateLimitMap };
