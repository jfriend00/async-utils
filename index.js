// this just re-exports everything that the sub-modules export
module.exports = [
    './mapConcurrent.js',
    './deferred.js',
    './delay.js',
].reduce((obj, file) => {
    const m = require(file);
    Object.assign(obj, m);
    return obj;
}, {});
