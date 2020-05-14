const { promiseRetry } = require('./retry.js');
const { delay, delayErr } = require('./utils.js')

function rejectNTimes(n, t = 0) {
    let cntr = 0;
    return function() {
        ++cntr;
        if (cntr <= n) {
            return delayErr(t, "simulated error");
        } else {
            return delay(t, "good data");
        }
    }
}

promiseRetry(rejectNTimes(5, 20), {
    startInterval: 100,
    maxInterval: 1000,
    maxTries: 3,
    intervalsBeforeBackoff: 1,
    backoffFactor: 50,
    maxTime: 500,
    functionTimeout: 100,
    includeRetryData: true,
    testRejection: (e) => { return null;},
    testResolve: (val) => { return val;},
}).then(result => {
    console.log(result);
}).catch(err => {
    console.log(err);
});