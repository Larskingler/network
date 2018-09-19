const events = require('events')
const encoder = require('./MessageEncoder')

module.exports = class Connection extends events.EventEmitter {
    constructor(socket) {
        super()
        this.id = socket.id
        this.socket = socket
        this.streams = []
    }

    addStream(stream) {
        this.streams.push(stream)
    }

    removeStream(streamId, streamPartition) {
        const i = this.streams.findIndex((s) => s.id === streamId && s.partition === streamPartition)
        if (i !== -1) {
            this.streams.splice(i, 1)
        }
    }

    getStreams() {
        return this.streams.slice() // return copy
    }

    sendBroadcast(msg) {
        this.socket.send(encoder.broadcastMessage(msg))
    }

    sendUnicast(msg, subId) {
        this.socket.send(encoder.unicastMessage(msg, subId))
    }

    sendSubscribed(response) {
        this.socket.send(encoder.subscribedMessage(response))
    }

    sendUnsubscribed(response) {
        this.socket.send(encoder.unsubscribedMessage(response))
    }

    sendResending(response) {
        this.socket.send(encoder.resendingMessage(response))
    }

    sendResent(response) {
        this.socket.send(encoder.resentMessage(response))
    }

    sendNoResend(response) {
        this.socket.send(encoder.noResendMessage(response))
    }

    sendError(response) {
        this.socket.send(encoder.errorMessage(response))
    }
}

