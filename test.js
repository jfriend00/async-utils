const {
    promiseSettleWithVal,
    promiseTimeout,
    promiseAllDone,
    delay,
    promisifyAll,
    promisifyObj,
    getPeekIterator,
    getDefaultPeekIterator,
} = require('./utils.js');

function testPeekIterator() {
    let data = [0,1,2,3,4,5,6,7,8,9];

    let iter = getDefaultPeekIterator(data);
    while(iter.isMore()) {
        console.log(iter.nextValue());
    }

    iter = getPeekIterator(data.entries());
    while(iter.isMore()) {
        console.log(iter.nextValue());
    }
}

testPeekIterator();

function testDelay() {
    delay(2000, "Hello").then(console.log.bind(console));
}

testDelay();

function testPromiseTimeout() {
    return promiseTimeout(delay(2000, "Hello"), 100, new Error("My Timeout"));
}

testPromiseTimeout().then(result => {
    console.log(result);
}).catch(err => {
    console.log(err);
});

promiseSettleWithVal([testPromiseTimeout(), delay(200, "Hi")]).then(results => {
    console.log(results);
}).catch(err => {
    console.log(err);
});

promiseAllDone([testPromiseTimeout(), delay(5000, "Hi")]).then(results => {
    console.log(results);
}).catch(err => {
    console.log(err);
});

const fs = promisifyAll(require('fs'));

fs.readFileAsync("test.js").then(result => {
    console.log(result.toString().split("\n").slice(0, 10).join("\n"));
}).catch(err => {
    console.log(err);
});

const fs2 = promisifyAll(require('fs'), "Promise");

fs2.readFilePromise("test.js").then(result => {
    console.log(result.toString().split("\n").slice(0, 10).join("\n"));
}).catch(err => {
    console.log(err);
});
