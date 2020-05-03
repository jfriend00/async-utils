const {rateLimitMap} = require('./rateLimitMap.js');
const http = require('http');
const fs = require('fs');


let incomingRequestTimes = [];
let startT;

function time() {
    let delta = (Date.now() - startT) / 1000;
    return delta.toFixed(3);
}

let server = http.createServer((req, res) => {
    let cntr = incomingRequestTimes.length;
    if (cntr === 0) {
        startT = Date.now();
    }
    let r = rand(100, 4000);
    //console.log(`${cntr}: ${time()}, Will wait ${r}, Received request: ${req.url}`);
    incomingRequestTimes.push(Date.now());

    setTimeout(() => {
        //console.log(`  ${cntr}: ${time()}: Sending response`);
        res.end("Got it");
    }, r);
});

server.listen(4000, run);

function makeArray(n) {
    let array = [];
    for (let i = 1; i <= n; i++) {
        array.push(i);
    }
    return array;
}


let sequence = [];
let sequenceCntr = 0;
let usePreGeneratedSequence = false;

function rand(min, max) {
    if (sequenceCntr === 0) {
        usePreGeneratedSequence = sequence.length !== 0;
    }
    if (usePreGeneratedSequence) {
        if (sequenceCntr >= sequence.length) {
            sequenceCntr = 0;
        }
        return sequence[sequenceCntr++];
    } else {
        let r = Math.floor(Math.random() * (max - min)) + min;
        sequence.push(r);
        sequenceCntr++;
        return r;
    }
}

function makeHttpRequest(url, data) {
    return new Promise((resolve, reject) => {
        let req = http.request(url, (res) => {
            res.on('data', data => {
                // do nothing with data here
            }).on('end', () => {
                resolve(data);
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// I don't think this diagnostic is working properly, need to fix
function printStats(duration) {
    duration *= 1000;
    let maxRequestsPerDuration = 0;
    let startSequence = 0;
    for (let i = 1; i < incomingRequestTimes.length; i++) {
        // go back in the array to see how many requests were in duration
        let lastTime = incomingRequestTimes[i];
        let qty = 1;
        for (let j = i - 1; j >= 0; j--) {
            if (lastTime - incomingRequestTimes[j] > duration) {
                if (qty > maxRequestsPerDuration) {
                    startSequence = j;
                    maxRequestsPerDuration = qty;
                }
                break;
            } else {
                ++qty;
            }
        }
    }
    console.log(`maxRequestsPer ${duration / 1000} sec is ${maxRequestsPerDuration}`);
    console.log(`    starting at request ${startSequence}`);
    return ;
}

function run() {

    let runNumber = -1;
    if (process.argv.length > 2) {
        runNumber = +process.argv[2];
        let data = require('./runTimes.json');
        if (runNumber < data.length) {
            sequence = data[runNumber];
        }
    }

    // 2 requests per second
    // rateLimitMap(array, maxInFlight, requestsPerDuration, duration, fn)
    const numRequests = 5;
    const duration = 1;
    const max = 10;
    console.log(`Sending ${numRequests} requests per ${duration} seconds, maxInFlight = ${max}`);
    rateLimitMap(makeArray(25), max, numRequests, duration, function(i) {
        return makeHttpRequest(`http://localhost:4000/${i}`, i);
    }).then(result => {
        // if we generated a new sequence, then save it
        if (runNumber === -1) {
            let data = require('./runTimes.json');
            data.push(sequence);
            fs.writeFileSync('./runTimes.json', JSON.stringify(data).replace(/\],\[/g, "],\n["));
            console.log(`Saving sequence #${data.length - 1}`);
        }
        printStats(1);
        console.log(result);
        server.close();

    }).catch(err => {
        console.log(err);
    });
}
