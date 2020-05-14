const {rateMap} = require('./rateMap.js');
const http = require('http');
const fs = require('fs');


let incomingRequestTimes = [];
let startT;

function time() {
    if (!startT) {
        startT = Date.now();
    }
    let delta = (Date.now() - startT) / 1000;
    return delta.toFixed(3);
}

// environment variable that turns debug tracing on
let debugOn = process.env["DEBUG_RATE_MAP_SERVER"] === "1";

function DBG(...args) {
    if (debugOn) {
        args.unshift(time() + ": ");
        console.log(...args);
    }
}

let requestCntr = 0;
let inFlightCntr = 0;

let server = http.createServer((req, res) => {
    if (req.url === "/start") {
        res.end("Started");
        return;
    }

    let cntr = incomingRequestTimes.length;
    if (cntr === 0) {
        startT = Date.now();
    }

    ++requestCntr;
    ++inFlightCntr;

    let thisRequestcntr = requestCntr;
    let now = Date.now();
    let delta = 0;
    if (incomingRequestTimes.length) {
        delta = now - incomingRequestTimes[incomingRequestTimes.length - 1];
    }
    DBG(`Incoming server request ${thisRequestcntr} - (${inFlightCntr}), ${delta}ms since prev request`);
    let r = rand(100, 4000);
    incomingRequestTimes.push(now);

    setTimeout(() => {
        DBG(`    Finishing server request ${thisRequestcntr} - (${inFlightCntr})`);
        --inFlightCntr;
        res.end("Got it");
    }, r);
});

server.listen(4000, run);

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
    console.log("relativeTimes:", relativeTimes);
}

async function run() {
    try {
        let runNumber = -1;
        let duration = 0;
        let requestsPerDuration = 0;
        let maxInFlight = 0;
        let totalToRun = 25;
        let minSpacing = 0;
        // command line args
        // node test-rateMap nnn duration=ddd requestsPerDuration=rrr maxInFlight=mmm
        function processRunNumber(arg) {
            runNumber = +arg;
        }

        function processDuration(arg, match) {
            duration = +match[1];
        }

        function processRequestsPerDuration(arg, match) {
            requestsPerDuration = +match[1];
        }

        function processMaxInFlight(arg, match) {
            maxInFlight = +match[1];
        }

        function processTotalToRun(arg, match) {
            totalToRun = +match[1];
        }

        function processMinSpacing(arg, match) {
            minSpacing = +match[1];
        }

        const regs = [
            { regex: /^\d+$/, fn: processRunNumber },
            { regex: /^duration=(\d+)$/i, fn: processDuration },
            { regex: /^requestsPerDuration=(\d+)$/i, fn: processRequestsPerDuration },
            { regex: /^maxInFlight=(\d+)$/i, fn: processMaxInFlight },
            { regex: /^totalToRun=(\d+)$/i, fn: processTotalToRun },
            { regex: /^minSpacing=(\d+)$/i, fn: processMinSpacing },
        ];

        if (process.argv.length > 2) {
            let match, arg;
            for (let i = 2; i < process.argv.length; i++) {
                arg = process.argv[i];
                // see if this arg matches any of our regexes
                let foundMatch = false;
                for (let item of regs) {
                    match = arg.match(item.regex);
                    if (match) {
                        item.fn(arg, match);
                        foundMatch = true;
                        break;
                    }
                }
                if (!foundMatch) {
                    console.log(`Unknown argument ${arg}`);
                    process.exit(1);
                }
            }
            if (runNumber !== -1) {
                let data = require('./runTimes.json');
                if (runNumber < data.length) {
                    console.log(`Running sequence #${runNumber}`);
                    sequence = data[runNumber];
                }
            }
        }

        // run one request just to make sure the server is fully initiated
        await makeHttpRequest("http://localhost:4000/start");

        console.log(`Sending ${requestsPerDuration} requests per ${duration} ms, maxInFlight = ${maxInFlight}`);
        // {maxInFlight: 0, requestsPerDuration: 0, duration: 0, minSpacing: 0}
        let options = {maxInFlight, requestsPerDuration, duration, minSpacing};
        let results = await rateMap(totalToRun, options, function(i) {
//        let results = await rateMap(new Set([2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36,38,40,42,44,46,48,50]), options, function(i) {
            return makeHttpRequest(`http://localhost:4000/${i}`, i).then(() => i);
        });
        // if we generated a new sequence, then save it
        if (runNumber === -1) {
            let data = require('./runTimes.json');
            data.push(sequence);
            fs.writeFileSync('./runTimes.json', JSON.stringify(data).replace(/\],\[/g, "],\n["));
            console.log(`Saving sequence #${data.length - 1}`);
        } else {
            console.log(`Finished sequence #${runNumber}`);
        }
        console.log("Results:", results);
        printStats(duration);
        console.log("Sequence:", sequence);
        //console.log(results);
    } catch(e) {
        console.log(e);
    } finally {
        server.close();
    }
}
