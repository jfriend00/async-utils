const {
    settleWithVal,
    timeout,
    allDone,
    delay,
    promisifyAll,
    promisifyObj,
    getPeekIterator,
    getDefaultPeekIterator,
} = require('../utils.js');

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

function testTimeout() {
    return timeout(delay(2000, "Hello"), 100, new Error("My Timeout"));
}

timeout().then(result => {
    console.log(result);
}).catch(err => {
    console.log(err);
});

settleWithVal([testTimeout(), delay(200, "Hi")]).then(results => {
    console.log(results);
}).catch(err => {
    console.log(err);
});

allDone([testTimeout(), delay(5000, "Hi")]).then(results => {
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


const { Deferred } = require('../deferred.js');
let x = new Deferred();
x.then(val => {
    console.log('Deferred resolving', val);
});
x.promise.then(val => {
    console.log('From promise, Deferred resolving', val);
});
x.resolve('Hi there!');
