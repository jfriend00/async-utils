// My ansewr on Stackoverflow:
// https://stackoverflow.com/questions/36730745/choose-proper-async-method-for-batch-processing-for-max-requests-sec/36736593#36736593

/*
  array is the array to iterate, passing each on in turn to the fn functoin

  requestsPerDuration is how many requests you can send within a the duration
    It must be an integer.  You can get fractional requests per second by setting the
    duration accordingly.  Duration values are in seconds.  For example:

        requestsPerDuration         duration        requestsPerSec
        --------------------------------------------------------
        1                           1       =>      1
        2                           1       =>      2
        1                           2       =>      0.5
        1                           3       =>      0.33
        5                           2       =>      2.5

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

function rateLimitMap(array, maxInFlight, requestsPerDuration, duration, fn) {
    return new Promise(function(resolve, reject) {
        if (maxInFlight <= 0) {
            maxInFlight = Number.MAX_SAFE_INTEGER;
        }
        if (!Number.isInteger(requestsPerDuration) || !Number.isInteger(duration)) {
            reject(new Error("requestsPerDuration and duration arguments must be integers"));
            return;
        }
        duration = (duration * 1000);        // make it millisconds
        let index = 0;              // keep track of where we are in the array
        let inFlightCntr = 0;       // how many requests currently in flight
        let doneCntr = 0;           // how many requests have finished
        let launchTimes = [];       // when we launched each request
        let results = new Array(array.length);
        let cancel = false;
        let timer;

        // calculate num requests in last duration
        function calcRequestsInLastDuration() {
            let now = Date.now();
            // look backwards in launchTimes to see how many were launched within the last duration
            let cnt = 0;
            for (let i = launchTimes.length - 1; i >= 0; i--) {
                if (now - launchTimes[i] <= duration) {
                    ++cnt;
                } else {
                    break;
                }
            }
            return cnt;
        }

        function runMore() {
            //console.log(`${time()}: Entering runMore()`);
            while (!cancel && index < array.length && inFlightCntr < maxInFlight && calcRequestsInLastDuration() < requestsPerDuration) {
                let i = index++;
                ++inFlightCntr;
                launchTimes.push(Date.now());
                console.log(`${time()}: Launching request ${i + 1} - (${inFlightCntr})`);
                fn(array[i]).then(function(val) {
                    results[i] = val;
                    --inFlightCntr;
                    ++doneCntr;
                    //console.log(`${time()}: Complete request ${i} - (${inFlightCntr})`);
                    runMore();
                }, function(err) {
                    cancel = true;
                    reject(err);
                });
            }
            // see if we're done
            if (doneCntr === array.length) {
                resolve(results);
            } else if (!timer && inFlightCntr < maxInFlight && launchTimes.length >= requestsPerDuration) {
                // only do this if we don't already have a timer running and
                //    if we don't already have max requests going.  A completion of a request
                //    will trigger the next one to go if we already have max requests going
                // calc how long we have to wait before sending more
                // if we already have a timer, then we've already calculated that so let that timer keep going
                let delta = duration - (Date.now() - launchTimes[launchTimes.length - requestsPerDuration]);
                if (delta > 0) {
                    console.log(`${time()}: Setting time to runMore() in ${delta} ms`);
                    timer = setTimeout(() => {
                        timer = null;
                        //console.log(`${time()}: Timer fired, about to runMore()`);
                        runMore();
                    }, delta);
                }
            } else {
                // we need to figure out how long to wait
                // console.log("got here");
            }
        }
        runMore();
    });
}

module.exports = { rateLimitMap };
