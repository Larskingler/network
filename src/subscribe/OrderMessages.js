import { Utils } from 'streamr-client-protocol'

import { pipeline } from '../utils/iterators'
import PushQueue from '../utils/PushQueue'
import { validateOptions } from '../stream/utils'

import resendStream from './resendStream'

const { OrderingUtil } = Utils

/**
 * Wraps OrderingUtil into a pipeline.
 * Implements gap filling
 */

export default function OrderMessages(client, options = {}) {
    const { gapFillTimeout, retryResendAfter, gapFill = true } = client.options
    const { streamId, streamPartition } = validateOptions(options)

    const outStream = new PushQueue() // output buffer

    let done = false
    const resendStreams = new Set() // holds outstanding resends for cleanup

    const orderingUtil = new OrderingUtil(streamId, streamPartition, (orderedMessage) => {
        if (!outStream.isWritable() || done) {
            return
        }

        outStream.push(orderedMessage)
    }, async (from, to, publisherId, msgChainId) => {
        if (done || !gapFill) { return }
        client.debug('gap %o', {
            streamId, streamPartition, publisherId, msgChainId, from, to,
        })

        // eslint-disable-next-line no-use-before-define
        const resendMessageStream = resendStream(client, {
            streamId, streamPartition, from, to, publisherId, msgChainId,
        })

        try {
            if (done) { return }
            resendStreams.add(resendMessageStream)
            await resendMessageStream.subscribe()
            if (done) { return }

            for await (const { streamMessage } of resendMessageStream) {
                if (done) { return }
                orderingUtil.add(streamMessage)
            }
        } finally {
            resendStreams.delete(resendMessageStream)
            await resendMessageStream.cancel()
        }
    }, gapFillTimeout, retryResendAfter)

    const markMessageExplicitly = orderingUtil.markMessageExplicitly.bind(orderingUtil)

    return Object.assign(pipeline([
        // eslint-disable-next-line require-yield
        async function* WriteToOrderingUtil(src) {
            for await (const msg of src) {
                if (!gapFill) {
                    orderingUtil.markMessageExplicitly(msg)
                }

                orderingUtil.add(msg)
                // note no yield
                // orderingUtil writes to outStream itself
            }
        },
        outStream, // consumer gets outStream
    ], async (err) => {
        done = true
        orderingUtil.clearGaps()
        resendStreams.forEach((s) => s.cancel())
        resendStreams.clear()
        await outStream.cancel(err)
        orderingUtil.clearGaps()
    }), {
        markMessageExplicitly,
    })
}
