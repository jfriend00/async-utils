// takes an array of items and a function that returns a promise
// Calls the function for each item in the array passing two arguments fn(val, index)
// Resolves to an array of results
// Stops on first rejection (with default options)

// First written by here on Stackoverflow
// https://stackoverflow.com/questions/46654265/promise-all-consumes-all-my-ram/46654592#46654592
// You can call this either like either of these:
// function mapConcurrent(items, maxConcurrent, fn) {
// function mapConcurrent(items, options, fn) {
// options object:
//    maxConcurrent: number       required
//    continueOnError: false      defaults to false
//    sentinelError: null         defaults to passing through actual Error object
//    filterErrors: false         defaults to false
// If stopOnError is false, then it places the error object in the
//   results and the caller has to check to see if the result is instanceof Error
//   to see which results succeeded or failed
// If sentinelError is present and stopOnError is false, then the sentinelError value
//   will be placed in the results instead of the promise reject reason
// If filterErrors is true and  stopOnError is false, it will filter
//   any errors out of the resolved array.  Note, this means the resulting array
//   may be shorter than the input array.
// Note: if continueOnError is not explicitly set to true, then the sentinelError
//   and filterErrors options are not used
const errSymbol = Symbol('errSymbol');

function mapConcurrent(iterable, opts, fn) {
    // prepare arguments/options
    const items = Array.from(iterable);
    let maxConcurrent;
    if (typeof opts !== "object") {
        maxConcurrent = opts;
    } else {
        maxConcurrent = options.maxConcurrent;
    }
    // initialize options object, using default values
    let options = Object.assign({
        continueOnError: false,
        filterErrors: false
    }, opts);

    if (options.filterErrors) {
        options.sentinelError = errSymbol;
    }

    if (typeof maxConcurrent !== "number") {
        throw new TypeError("Must pass maxConcurrent option as a number to mapConcurrent()");
    }
    if (typeof fn !== "function") {
        throw new TypeError("Must pass callback function to mapConcurrent()");
    }

    // housekeeping variables
    let index = 0;
    let inFlightCntr = 0;
    let doneCntr = 0;
    let stop = false;
    let results = new Array(items.length);

    return new Promise(function(resolve, reject) {

        function runNext() {
            let i = index;
            ++inFlightCntr;

            function handleError() {
                if (!options.continueOnEror) {
                    // set flag so we don't launch any more requests
                    // as other requests that are currently in flight finish
                    stop = true;
                    reject(err);
                } else {
                    // we are supposed to continue on error here
                    ++doneCntr;
                    --inFlightCntr;
                    if (Object.hasOwnProperty(options, "sentinelError")) {
                        // if sentinelError property passed in, use that error value
                        results[i] = options.sentinelError;
                    } else {
                        // otherwise just put the error object in
                        results[i] = err;
                    }
                    // then because options.stopOnError was false, keep going
                    run();
                }
            }

            // catch any synchronous exceptions
            try {
                fn(items[index], index++).then(function(val) {
                    ++doneCntr;
                    --inFlightCntr;
                    results[i] = val;
                    run();
                }, handleError);
            } catch (e) {
                // fn() shouldn't through synchronously, but we catch it anyway
                handleError(e);
            }
        }

        function run() {
            // launch as many as we're allowed to
            while (!stop && inFlightCntr < maxConcurrent && index < items.length) {
                runNext();
            }
            // if all are done, then resolve parent promise with results
            if (doneCntr === items.length) {
                if (options.filterError) {
                    results = results.filter(val => val !== errSymbol);
                } else {
                    resolve(results);
                }
            }
        }

        run();
    });
}

module.exports = { mapConcurrent };
