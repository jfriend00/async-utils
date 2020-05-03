// My ansewr on Stackoverflow:
// https://stackoverflow.com/questions/36730745/choose-proper-async-method-for-batch-processing-for-max-requests-sec/36736593#36736593
function rateLimitMap(array, requestsPerSec, maxInFlight, fn) {
    return new Promise(function(resolve, reject) {
        let index = 0;
        let inFlightCntr = 0;
        let doneCntr = 0;
        let launchTimes = [];
        let results = new Array(array.length);
        let cancel = false;

        // calculate num requests in last second
        function calcRequestsInLastSecond() {
            let now = Date.now();
            // look backwards in launchTimes to see how many were launched within the last second
            let cnt = 0;
            for (let i = launchTimes.length - 1; i >= 0; i--) {
                if (now - launchTimes[i] < 1000) {
                    ++cnt;
                } else {
                    break;
                }
            }
            return cnt;
        }

        function runMore() {
            while (!cancel && index < array.length && inFlightCntr < maxInFlight && calcRequestsInLastSecond() < requestsPerSec) {
                (function(i) {
                    ++inFlightCntr;
                    launchTimes.push(Date.now());
                    fn(array[i]).then(function(val) {
                        results[i] = val;
                        --inFlightCntr;
                        ++doneCntr;
                        runMore();
                    }, function(err) {
                        cancel = true;
                        reject(err);
                    });
                })(index);
                ++index;
            }
            // see if we're done
            if (doneCntr === array.length) {
                resolve(results);
            } else if (launchTimes.length > requestsPerSec) {
                // calc how long we have to wait before sending more
                let delta = 1000 - (Date.now() - launchTimes[launchTimes.length - requestsPerSec]);
                if (delta > 0) {
                    setTimeout(runMore, delta);
                }

            }
        }
        runMore();
    });
}

module.exports = { rateLimitMap };
