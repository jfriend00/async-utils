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
    const p = new Promise((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
    });
    // make the this.promise property a getter so it can't be set
    Object.defineProperty(this, "promise", {
        get: () => p,
        enumerable: true 
    });
    this.then = p.then.bind(p);
    this.catch = p.catch.bind(p);
    if (p.finally) {
        this.finally = p.finally.bind(p);
    }
}

module.exports = { Deferred };
