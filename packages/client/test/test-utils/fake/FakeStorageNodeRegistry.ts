import { EthereumAddress } from '@streamr/utils'
import { Methods } from '@streamr/test-utils'
import { Lifecycle, scoped } from 'tsyringe'
import { StorageNodeMetadata, StorageNodeRegistry } from '../../../src/registry/StorageNodeRegistry'
import { FakeChain } from './FakeChain'

@scoped(Lifecycle.ContainerScoped)
export class FakeStorageNodeRegistry implements Methods<StorageNodeRegistry> {

    private readonly chain: FakeChain

    constructor(chain: FakeChain) {
        this.chain = chain
    }

    // eslint-disable-next-line class-methods-use-this
    async setStorageNodeMetadata(_metadata: StorageNodeMetadata | undefined): Promise<void> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    async getStorageNodeMetadata(nodeAddress: EthereumAddress): Promise<StorageNodeMetadata> {
        const metadata = this.chain.storageNodeMetadatas.get(nodeAddress)
        if (metadata !== undefined) {
            return metadata
        } else {
            throw new Error(`Node not found: ${nodeAddress}`)
        }
    }
}
