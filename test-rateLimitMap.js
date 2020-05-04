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
    if (req.url === "/start") {
        res.end("Started");
        return;
    }

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

function printStats(duration) {
    let maxRequestsPerDuration = 0;
    let maxStart = 0;
    for (let i = 0; i < incomingRequestTimes.length; i++) {
        let startT = incomingRequestTimes[i];
        let cntr = 1;
        for (let j = i + 1; j < incomingRequestTimes.length; j++) {
            if (incomingRequestTimes[j] - startT < duration) {
                ++cntr;
            } else {
                break;
            }
        }
        if (cntr > maxRequestsPerDuration) {
            maxRequestsPerDuration = cntr;
            maxStart = i;
        }
    }
    console.log(`maxRequestsPer ${duration} ms is ${maxRequestsPerDuration}`);
    console.log(`    starting at request ${maxStart}`);
    let start;
    let relativeTimes = incomingRequestTimes.map((val, index) => {
        if (index === 0) {
            start = val;
            return 0;
        } else {
            return val - start;
        }
    });
    console.log(relativeTimes);
}

async function run() {
    try {
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
        const requestsPerDuration = 30;
        const duration = 1000;
        const maxInFlight = 5;

        // run one request just to make sure the server is fully initiated
        await makeHttpRequest("http://localhost:4000/start");

        console.log(`Sending ${requestsPerDuration} requests per ${duration} ms, maxInFlight = ${maxInFlight}`);
        let results = await rateLimitMap(makeArray(25), maxInFlight, requestsPerDuration, duration, function(i) {
            return makeHttpRequest(`http://localhost:4000/${i}`, i);
        });
        // if we generated a new sequence, then save it
        if (runNumber === -1) {
            let data = require('./runTimes.json');
            data.push(sequence);
            fs.writeFileSync('./runTimes.json', JSON.stringify(data).replace(/\],\[/g, "],\n["));
            console.log(`Saving sequence #${data.length - 1}`);
        }
        printStats(duration);
        console.log(sequence);
        //console.log(results);
    } catch(e) {
        console.log(e);
    } finally {
        server.close();
    }
}
