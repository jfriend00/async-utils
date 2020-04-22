// return a promise that resolves after a delay
function delay(t, val) {
   return new Promise(function(resolve) {
       setTimeout(resolve, t, val);
   });
}

module.exports = { delay };
