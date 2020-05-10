// this just re-exports everything that the sub-modules export
module.exports = [
    './mapConcurrent.js',
    './deferred.js',
    './utils.js',
    './rateMap.js',
    './concurrency.js',
].reduce((obj, file) => {
    const m = require(file);
    Object.assign(obj, m);
    return obj;
}, {});
