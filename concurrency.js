const { Deferred } = require('./deferred.js');

// This can be used as a resource list for any type of resource
// I've used it for Worker threads
// The basic idea is that some outside code adds some number of resources to this list.
// Then when someone wants one, they call get() and they get a promise that resolves when
//   they get one of the resources.  When they are done with the resource, they put it back
//   with add()
// If multiple people call get() and are waiting for a resource, then when one is
//   added back, they go out in FIFO order.
//
//  The constructor takes an optional array of starting resources

class ResourceList {
    constructor(resources) {
        this.resources = [];
        this.deferredQueue = [];
        if (resources) {
            this.resources.push(...resources);
        }
    }
    add(resource) {
        this.resources.push(resource);

        // if someone is waiting for a resource,
        // pull the oldest resource out of the list and
        // give it to the oldest deferred that is waiting
        while (this.deferredQueue.length && this.resources.length) {
            let d = this.deferredQueue.shift();
            d.resolve(this.resources.shift());
        }
    }
    // if there's a resource, get one immediately
    // if not, return a promise that resolves with a resource
    //    when next one is available
    get() {
        if (this.resources.length) {
            return Promise.resolve(this.resources.shift());
        } else {
            let d = new Deferred();
            this.deferredQueue.push(d);
            return d.promise;
        }
    }
}
