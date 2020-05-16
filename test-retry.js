const { promiseRetry } = require('./retry.js');
const { delay, delayErr } = require('./utils.js')

function rejectNTimes(n, t = 0) {
    let cntr = 0;
    return function(...args) {
        ++cntr;
        if (cntr <= n) {
            return delayErr(t, "simulated error");
        } else {
            return delay(t, "good data");
        }
    }
}

promiseRetry(rejectNTimes(1000, 20), {
    startInterval: 100,
    maxInterval: 100000,
    maxTries: 1000,
    intervalsBeforeBackoff: 1,
    backoffFactor: 50,
    maxTime: 150000,
    functionTimeout: 100,
    includeRetryData: true,
    args: [1,2],
    testRejection: (e) => ({action: "retry"}),
    testResolve: (val) => ({action: "resolve", value: val}),
}).then(result => {
    console.log(result);
}).catch(err => {
    console.log(err);
});
