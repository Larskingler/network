import { StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import { EthereumAddress } from '@streamr/utils'
import { Methods } from '@streamr/test-utils'
import { Lifecycle, scoped } from 'tsyringe'
import { Stream } from '../../../src/Stream'
import { StreamIDBuilder } from '../../../src/StreamIDBuilder'
import { StreamStorageRegistry } from '../../../src/registry/StreamStorageRegistry'
import { FakeChain } from './FakeChain'
import { FakeNetwork } from './FakeNetwork'
import { FakeStorageNode } from './FakeStorageNode'

@scoped(Lifecycle.ContainerScoped)
export class FakeStreamStorageRegistry implements Methods<StreamStorageRegistry> {

    private readonly chain: FakeChain
    private readonly network: FakeNetwork
    private readonly streamIdBuilder: StreamIDBuilder

    constructor(
        chain: FakeChain,
        network: FakeNetwork,
        streamIdBuilder: StreamIDBuilder
    ) {
        this.chain = chain
        this.network = network
        this.streamIdBuilder = streamIdBuilder
    }

    async getStorageNodes(streamIdOrPath?: string): Promise<EthereumAddress[]> {
        if (streamIdOrPath !== undefined) {
            const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
            return this.chain.storageAssignments.get(streamId)
        } else {
            throw new Error('not implemented')
        }
    }

    async getRandomStorageNodeFor(streamPartId: StreamPartID): Promise<FakeStorageNode> {
        const nodeAddresses = await this.getStorageNodes(StreamPartIDUtils.getStreamID(streamPartId))
        if (nodeAddresses.length > 0) {
            const chosenAddress = nodeAddresses[Math.floor(Math.random() * nodeAddresses.length)]
            const storageNode = this.getStorageNode(chosenAddress)
            if (storageNode !== undefined) {
                return storageNode 
            } else {
                throw new Error('no storage node online: ' + chosenAddress)
            }
        } else {
            throw new Error('no storage node assignments for ' + streamPartId)
        }
    }

    async addStreamToStorageNode(streamIdOrPath: string, nodeAddress: EthereumAddress): Promise<void> {
        if (!(await this.isStoredStream(streamIdOrPath, nodeAddress))) {
            const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
            const node = this.getStorageNode(nodeAddress)
            if (node !== undefined) {
                this.chain.storageAssignments.add(streamId, nodeAddress)
                await node.addAssignment(streamId)
            } else {
                throw new Error(`No storage node ${nodeAddress} for ${streamId}`)
            }
        }
    }

    async removeStreamFromStorageNode(streamIdOrPath: string, nodeAddress: EthereumAddress): Promise<void> {
        if (await this.isStoredStream(streamIdOrPath, nodeAddress)) {
            const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
            const node = this.getStorageNode(nodeAddress)
            if (node !== undefined) {
                this.chain.storageAssignments.remove(streamId, nodeAddress)
            } else {
                throw new Error(`No storage node ${nodeAddress} for ${streamId}`)
            }
        }
    }

    async isStoredStream(streamIdOrPath: string, nodeAddress: EthereumAddress): Promise<boolean> {
        const assignments = await this.getStorageNodes(streamIdOrPath)
        return assignments.includes(nodeAddress)
    }

    private getStorageNode(address: EthereumAddress): FakeStorageNode | undefined {
        const node = this.network.getNodes().find((node) => (node instanceof FakeStorageNode) && (node.getAddress() === address))
        return node as (FakeStorageNode | undefined)
    }

    // eslint-disable-next-line class-methods-use-this
    getStoredStreams(): Promise<{ streams: Stream[], blockNumber: number }> {
        throw new Error('not implemented')
    }
}
