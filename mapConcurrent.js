// takes an array of items and a function that returns a promise
// Calls the function for each item in the array passing two arguments fn(val, index)
// Resolves to an array of results
// Stops on first rejection

// First written by me here on Stackoverflow
// https://stackoverflow.com/questions/46654265/promise-all-consumes-all-my-ram/46654592#46654592
function mapConcurrent(items, maxConcurrent, fn) {
    let index = 0;
    let inFlightCntr = 0;
    let doneCntr = 0;
    let results = new Array(items.length);
    let stop = false;

    return new Promise(function(resolve, reject) {

        function runNext() {
            let i = index;
            ++inFlightCntr;
            fn(items[index], index++).then(function(val) {
                ++doneCntr;
                --inFlightCntr;
                results[i] = val;
                run();
            }, function(err) {
                // set flag so we don't launch any more requests
                stop = true;
                reject(err);
            });
        }

        function run() {
            // launch as many as we're allowed to
            while (!stop && inFlightCntr < maxConcurrent && index < items.length) {
                runNext();
            }
            // if all are done, then resolve parent promise with results
            if (doneCntr === items.length) {
                resolve(results);
            }
        }

        run();
    });
}

module.exports = mapConcurrent;
