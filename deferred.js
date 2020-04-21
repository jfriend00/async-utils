// ES6 version
// can be used as either:
//    let d = Promise.Deferred();
//    let d = new Promise.Deferred();
//    d.then(...)
//    d.resolve(x);
function Deferred() {
    if (!(this instanceof Deferred)) {
        return new Deferred();
    }
    const p = this.promise = new Promise((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
    });
    this.then = p.then.bind(p);
    this.catch = p.catch.bind(p);
    if (p.finally) {
        this.finally = p.finally.bind(p);
    }
}

module.exports = Deferred;
