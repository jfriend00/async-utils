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
    maxInterval: 3000,
    maxTries: 100,
    intervalsBeforeBackoff: 1,
    backoffFactor: 50,
    maxTime: 15000,
    functionTimeout: 100,
    testRejection: (e) => { return null;},
    testResolve: (val) => { return null;},
}).then(result => {
    console.log(result);
}).catch(err => {
    console.log(err);
});
