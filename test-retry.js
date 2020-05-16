const { retry, retryify, retryifyAll } = require('./retry.js');
const { delay, delayErr } = require('./utils.js')
const assert = require('assert').strict;

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

/*
retry(rejectNTimes(1000, 20), {
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
*/

const fsp = require('fs').promises;
/*
const rmdir = retry.wrap(fsp.rmdir);

retry.fs(rmdir('d:\\code\\test\\temp\\commands')).then(result => {
    console.log(result);
}).catch(err => {
    console.log(err);
});
*/

/*
const rmdirRetry = retryify(fsp.rmdir, retry.fs);

rmdirRetry('d:\\code\\test\\temp\\commands').then(result => {
    console.log(result);
}).catch(err => {
    console.log(err);
});
*/

const fspr = retryifyAll(fsp, retry.fs);
assert(fspr === retryifyAll(fsp, retry.fs), 'retryifyAll did not return same object');


fspr.rmdir('d:\\code\\test\\temp\\commands').then(result => {
    console.log(result);
}).catch(err => {
    console.log(err);
});
