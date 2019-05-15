const { Readable, Transform } = require('stream')
const merge2 = require('merge2')
const cassandra = require('cassandra-driver')
const { StreamMessageFactory, StreamMessage } = require('streamr-client-protocol').MessageLayer

const parseRow = (row) => StreamMessageFactory.deserialize(row.payload.toString())

const encodeAsStreamrMessage = (msg) => StreamMessage.create(
    [msg.streamId, msg.streamPartition, msg.timestamp, msg.sequenceNo, msg.publisherId, msg.msgChainId],
    msg.previousTimestamp == null ? null : [msg.previousTimestamp, msg.previousSequenceNo],
    StreamMessage.CONTENT_TYPES.JSON,
    msg.payload,
    msg.signatureType,
    msg.signature,
)

class Storage {
    constructor(cassandraClient) {
        this.cassandraClient = cassandraClient
    }

    store(msg) {
        const insertStatement = 'INSERT INTO stream_data (id, partition, ts, sequence_no, publisher_id, msg_chain_id, payload) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?)'
        return this.cassandraClient.execute(insertStatement, [
            msg.streamId,
            msg.streamPartition,
            msg.timestamp,
            msg.sequenceNo,
            msg.publisherId,
            msg.msgChainId,
            Buffer.from(encodeAsStreamrMessage(msg).serialize()),
        ], {
            prepare: true,
        })
    }

    requestLast(streamId, streamPartition, n) {
        if (!Number.isInteger(n)) {
            throw new Error('n is not an integer')
        }
        const query = 'SELECT * FROM stream_data WHERE id = ? AND partition = ? ORDER BY ts DESC, sequence_no DESC LIMIT ?'
        const queryParams = [streamId, streamPartition, n]

        // Wrap as stream for consistency with other fetch functions
        const readableStream = new Readable({
            objectMode: true,
            read() {},
        })

        this.cassandraClient.execute(query, queryParams, {
            prepare: true,
        })
            .then((resultSet) => {
                resultSet.rows.reverse().forEach((r) => readableStream.push(parseRow(r)))
                readableStream.push(null)
            })
            .catch((err) => {
                readableStream.emit('error', err)
            })

        return readableStream
    }

    requestFrom(streamId, streamPartition, fromTimestamp, fromSequenceNo, publisherId, msgChainId) {
        if (!Number.isInteger(fromTimestamp)) {
            throw new Error('from is not an integer')
        }

        if (fromSequenceNo == null && publisherId == null && msgChainId == null) {
            const query = 'SELECT * FROM stream_data WHERE id = ? AND partition = ? AND ts >= ? ORDER BY ts ASC, sequence_no ASC'
            const queryParams = [streamId, streamPartition, fromTimestamp]
            return this._queryWithStreamingResults(query, queryParams)
        }

        // Cassandra doesn't allow ORs in WHERE clause so we need to do 2 queries.
        // Once a range (id/partition/ts/sequence_no) has been selected in Cassandra, filtering it by publisher_id requires to ALLOW FILTERING.
        const query1 = 'SELECT * FROM stream_data WHERE id = ? AND partition = ? AND ts = ? AND sequence_no >= ? AND publisher_id = ? ' +
            'AND msg_chain_id = ? ORDER BY ts ASC, sequence_no ASC ALLOW FILTERING'
        const query2 = 'SELECT * FROM stream_data WHERE id = ? AND partition = ? AND ts > ? AND publisher_id = ? ' +
            'AND msg_chain_id = ? ORDER BY ts ASC, sequence_no ASC ALLOW FILTERING'
        const queryParams1 = [streamId, streamPartition, fromTimestamp, fromSequenceNo, publisherId, msgChainId]
        const queryParams2 = [streamId, streamPartition, fromTimestamp, publisherId, msgChainId]
        const stream1 = this._queryWithStreamingResults(query1, queryParams1)
        const stream2 = this._queryWithStreamingResults(query2, queryParams2)
        return merge2(stream1, stream2)
    }

    requestRange(streamId, streamPartition, fromTimestamp, fromSequenceNo, toTimestamp, toSequenceNo, publisherId, msgChainId) {
        if (!Number.isInteger(fromTimestamp)) {
            throw new Error('from is not an integer')
        }
        if (!Number.isInteger(toTimestamp)) {
            throw new Error('to is not an integer')
        }

        if (fromSequenceNo == null && toSequenceNo == null && publisherId == null && msgChainId == null) {
            const query = 'SELECT * FROM stream_data WHERE id = ? AND partition = ? AND ts >= ? AND ts <= ? ORDER BY ts ASC, sequence_no ASC'
            const queryParams = [streamId, streamPartition, fromTimestamp, toTimestamp]
            return this._queryWithStreamingResults(query, queryParams)
        }

        // Cassandra doesn't allow ORs in WHERE clause so we need to do 3 queries.
        // Once a range (id/partition/ts/sequence_no) has been selected in Cassandra, filtering it by publisher_id requires to ALLOW FILTERING.
        const query1 = 'SELECT * FROM stream_data WHERE id = ? AND partition = ? AND ts = ? AND sequence_no >= ? AND publisher_id = ? ' +
            'AND msg_chain_id = ? ORDER BY ts ASC, sequence_no ASC ALLOW FILTERING'
        const query2 = 'SELECT * FROM stream_data WHERE id = ? AND partition = ? AND ts > ? AND ts < ? AND publisher_id = ? ' +
            'AND msg_chain_id = ? ORDER BY ts ASC, sequence_no ASC ALLOW FILTERING'
        const query3 = 'SELECT * FROM stream_data WHERE id = ? AND partition = ? AND ts = ? AND sequence_no <= ? AND publisher_id = ? ' +
            'AND msg_chain_id = ? ORDER BY ts ASC, sequence_no ASC ALLOW FILTERING'
        const queryParams1 = [streamId, streamPartition, fromTimestamp, fromSequenceNo, publisherId, msgChainId]
        const queryParams2 = [streamId, streamPartition, fromTimestamp, toTimestamp, publisherId, msgChainId]
        const queryParams3 = [streamId, streamPartition, toTimestamp, toSequenceNo, publisherId, msgChainId]
        const stream1 = this._queryWithStreamingResults(query1, queryParams1)
        const stream2 = this._queryWithStreamingResults(query2, queryParams2)
        const stream3 = this._queryWithStreamingResults(query3, queryParams3)
        return merge2(stream1, stream2, stream3)
    }

    close() {
        return this.cassandraClient.shutdown()
    }

    _queryWithStreamingResults(query, queryParams) {
        return this.cassandraClient.stream(query, queryParams, {
            prepare: true,
            autoPage: true,
        }).pipe(new Transform({
            objectMode: true,
            transform: (row, _, done) => {
                done(null, parseRow(row))
            },
        }))
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

const startCassandraStorage = async (contactPoints, localDataCenter, keyspace, username, password) => {
    const authProvider = new cassandra.auth.PlainTextAuthProvider(username || '', password || '')
    const cassandraClient = new cassandra.Client({
        contactPoints,
        localDataCenter,
        keyspace,
        authProvider,
    })
    const nbTrials = 20
    let retryCount = nbTrials
    let lastError = ''
    while (retryCount > 0) {
        /* eslint-disable no-await-in-loop */
        try {
            await cassandraClient.connect().catch((err) => { throw err })
            return new Storage(cassandraClient)
        } catch (err) {
            console.log('Cassandra not responding yet...')
            retryCount -= 1
            await sleep(5000)
            lastError = err
        }
        /* eslint-enable no-await-in-loop */
    }
    throw new Error(`Failed to connect to Cassandra after ${nbTrials} trials: ${lastError.toString()}`)
}

module.exports = {
    Storage,
    startCassandraStorage,
}
