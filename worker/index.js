const Worker = require('webworker-threads').Worker;


const workerHelper = (fn) => {
    return new Promise((resolve) => {
        const worker = new Worker(function () {
            fn.bind(this)()
            // postMessage(/*"I'm working before postMessage('ali').");
            // this.onmessage = function(event) {
            //     postMessage('Hi ' + event.data);
            //     self.close();
            // };*/
        })

        worker.onmessage = function(event) {
            resolve(event.data)
            self.close()
        }
    })
}
