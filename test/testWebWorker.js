var Worker = require('webworker-threads').Worker;
// var w = new Worker('worker.js'); // Standard API

console.log('begin a worker:', (new Date()).getTime())

new Promise(resolve => {
    console.log('begin to define worker:', (new Date()).getTime())

    var worker = new Worker(function(){
        console.log('begin to exec worker:', (new Date()).getTime())

        postMessage('I\'m working before postMessage(ali).')
        this.onmessage = function(event) {
            postMessage('Hi ' + event.data)
            self.close()
        }
    })

    worker.onmessage = function(event) {
        console.log('Worker said: ' + event.data)
    }

    worker.postMessage('ali');
})

console.log('after a worker:', new Date().getTime())
