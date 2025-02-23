import 'reflect-metadata'

import { Wallet } from '@ethersproject/wallet'
import { StreamMessageType } from '@streamr/protocol'
import { fastWallet } from '@streamr/test-utils'
import { collect, toEthereumAddress, wait } from '@streamr/utils'
import range from 'lodash/range'
import { createPrivateKeyAuthentication } from '../../src/Authentication'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { GroupKey } from '../../src/encryption/GroupKey'
import { StreamPermission } from '../../src/permission'
import { MessageFactory } from '../../src/publish/MessageFactory'
import { createGroupKeyQueue, createStreamRegistry } from '../test-utils/utils'
import { FakeEnvironment } from './../test-utils/fake/FakeEnvironment'

const PUBLISHER_COUNT = 50
const MESSAGE_COUNT_PER_PUBLISHER = 3

interface PublisherInfo {
    wallet: Wallet
    groupKey: GroupKey
    client?: StreamrClient
}

const PUBLISHERS: PublisherInfo[] = range(PUBLISHER_COUNT).map(() => ({
    wallet: fastWallet(),
    groupKey: GroupKey.generate()
}))

describe('parallel key exchange', () => {

    let environment: FakeEnvironment
    let stream: Stream
    let subscriber: StreamrClient

    beforeAll(async () => {
        environment = new FakeEnvironment()
        subscriber = environment.createClient()
        stream = await subscriber.createStream('/path')
        await Promise.all(PUBLISHERS.map(async (publisher) => {
            await stream.grantPermissions({
                user: publisher.wallet.address,
                permissions: [StreamPermission.PUBLISH]
            })
            publisher.client = environment.createClient({
                auth: {
                    privateKey: publisher.wallet.privateKey
                }
            })
            await publisher.client.addEncryptionKey(publisher.groupKey, toEthereumAddress(publisher.wallet.address))
        }))
    }, 20000)

    afterAll(async () => {
        await environment.destroy()
    })

    it('happy path', async () => {
        const sub = await subscriber.subscribe(stream.id)

        for (const publisher of PUBLISHERS) {
            const authentication = createPrivateKeyAuthentication(publisher.wallet.privateKey, undefined as any)
            const messageFactory = new MessageFactory({
                streamId: stream.id,
                authentication,
                streamRegistry: createStreamRegistry({
                    partitionCount: 1,
                    isPublicStream: false,
                    isStreamPublisher: true
                }),
                groupKeyQueue: await createGroupKeyQueue(authentication, publisher.groupKey)
            })
            for (let i = 0; i < MESSAGE_COUNT_PER_PUBLISHER; i++) {
                const msg = await messageFactory.createMessage({
                    foo: 'bar'
                }, {
                    timestamp: Date.now()
                })
                const node = await publisher.client!.getNode()
                await node.broadcast(msg)
                await wait(10)
            }
        }

        const expectedMessageCount = PUBLISHER_COUNT * MESSAGE_COUNT_PER_PUBLISHER
        const messages = await collect(sub, expectedMessageCount)
        expect(messages).toHaveLength(expectedMessageCount)
        expect(messages.filter((msg) => !((msg.content as any).foo === 'bar'))).toEqual([])
        expect(environment.getNetwork().getSentMessages({
            messageType: StreamMessageType.GROUP_KEY_REQUEST
        })).toHaveLength(PUBLISHER_COUNT)
    }, 30 * 1000)
})
