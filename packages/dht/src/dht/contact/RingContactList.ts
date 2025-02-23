import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { OrderedMap } from '@js-sdsl/ordered-map'
import { RingDistance, RingId, RingIdRaw, getLeftDistance, getRightDistance, getRingIdFromPeerDescriptor, getRingIdFromRaw } from './ringIdentifiers'
import { DhtAddress, getNodeIdFromPeerDescriptor } from '../../identifiers'
import EventEmitter from 'eventemitter3'

export interface RingContacts { 
    left: PeerDescriptor[]
    right: PeerDescriptor[]
}
export interface RingContactListEvents {  
    ringContactAdded: (peerDescriptor: PeerDescriptor, closestPeers: RingContacts) => void
    ringContactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: RingContacts) => void
}
export class RingContactList<C extends { getPeerDescriptor(): PeerDescriptor }> extends EventEmitter<RingContactListEvents> {

    private readonly numNeighborsPerSide = 5
    private readonly referenceId: RingId
    private readonly excludedIds: Set<DhtAddress>
    private readonly leftNeighbors: OrderedMap<RingDistance, C>
    private readonly rightNeighbors: OrderedMap<RingDistance, C>
    private readonly emitEvents: boolean

    constructor(rawReferenceId: RingIdRaw, emitEvents: boolean, excludedIds?: Set<DhtAddress>) {
        super()
        this.referenceId = getRingIdFromRaw(rawReferenceId)
        this.emitEvents = emitEvents
        this.excludedIds = excludedIds ?? new Set()
        this.leftNeighbors = new OrderedMap<RingDistance, C>()
        this.rightNeighbors = new OrderedMap<RingDistance, C>()
    }

    addContact(contact: C): void {
        const id = getRingIdFromPeerDescriptor(contact.getPeerDescriptor())
        if (id === this.referenceId || this.excludedIds.has(getNodeIdFromPeerDescriptor(contact.getPeerDescriptor()))) {
            return
        }
        let elementAdded = false
        let elementRemoved = false

        const leftDistance = getLeftDistance(this.referenceId, id)
        const lastLeftNeighbor = this.leftNeighbors.back()
        if (lastLeftNeighbor === undefined || leftDistance < lastLeftNeighbor[0]) {
            this.leftNeighbors.setElement(leftDistance, contact)
            elementAdded = true
            if (this.leftNeighbors.size() > this.numNeighborsPerSide) {
                this.leftNeighbors.eraseElementByIterator(this.leftNeighbors.rBegin())
                elementRemoved = true
            }
        }

        const rightDistance = getRightDistance(this.referenceId, id)
        const lastRightNeighbor = this.rightNeighbors.back()
        if (lastRightNeighbor === undefined || rightDistance < lastRightNeighbor[0]) {
            this.rightNeighbors.setElement(rightDistance, contact)
            elementAdded = true
            if (this.rightNeighbors.size() > this.numNeighborsPerSide) {
                this.rightNeighbors.eraseElementByIterator(this.rightNeighbors.rBegin())
                elementRemoved = true
            }
        }

        if (this.emitEvents && (elementAdded || elementRemoved)) {
            const closestContacts = this.getClosestContacts()
            const closestDescriptors = { 
                left: closestContacts.left.map((c) => c.getPeerDescriptor()), 
                right: closestContacts.right.map((c) => c.getPeerDescriptor())
            }
            if (elementAdded) {
                this.emit('ringContactAdded', contact.getPeerDescriptor(), closestDescriptors)
            }
            if (elementRemoved) {
                this.emit('ringContactRemoved', contact.getPeerDescriptor(), closestDescriptors)
            }
        }
    }

    removeContact(contact?: C): void {
        if (contact === undefined) {
            return
        }

        const id = getRingIdFromPeerDescriptor(contact.getPeerDescriptor())
        const leftDistance = getLeftDistance(this.referenceId, id)
        const rightDistance = getRightDistance(this.referenceId, id)

        let elementRemoved = false
        if (this.leftNeighbors.eraseElementByKey(leftDistance)) {
            elementRemoved = true
        }
        if (this.rightNeighbors.eraseElementByKey(rightDistance)) {
            elementRemoved = true
        }

        if (this.emitEvents && elementRemoved) {
            const closestContacts = this.getClosestContacts()
            const closestDescriptors = { left: closestContacts.left.map((c) => c.getPeerDescriptor()), 
                right: closestContacts.right.map((c) => c.getPeerDescriptor()) }
            this.emit('ringContactRemoved', contact.getPeerDescriptor(), closestDescriptors)
        }
    }

    getContact(peerDescriptor: PeerDescriptor): C | undefined {
        const id = getRingIdFromPeerDescriptor(peerDescriptor)
        const leftDistance = getLeftDistance(this.referenceId, id)
        const rightDistance = getRightDistance(this.referenceId, id)
        if (this.leftNeighbors.getElementByKey(leftDistance)) {
            return this.leftNeighbors.getElementByKey(leftDistance)
        }
        if (this.rightNeighbors.getElementByKey(rightDistance)) {
            return this.rightNeighbors.getElementByKey(rightDistance)
        }
        return undefined
    }

    getClosestContacts(limitPerSide?: number): { left: C[], right: C[] } {
        const leftContacts: C[] = []
        const rightContacts: C[] = []

        let leftCount = 0
        for (const item of this.leftNeighbors) {
            if (limitPerSide != undefined && leftCount >= limitPerSide) {
                break
            }
            leftContacts.push(item[1])
            leftCount++
        } 

        let rightCount = 0
        for (const item of this.rightNeighbors) {
            if (limitPerSide != undefined && rightCount >= limitPerSide) {
                break
            }
            rightContacts.push(item[1])
            rightCount++
        }

        return { left: leftContacts, right: rightContacts }
    }

    getAllContacts(): C[] {
        const ret: C[] = []
        for (const item of this.leftNeighbors) {
            ret.push(item[1])
        }
        for (const item of this.rightNeighbors) {
            ret.push(item[1])
        }
        return ret
    }
}
