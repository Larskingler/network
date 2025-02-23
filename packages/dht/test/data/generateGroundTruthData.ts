import fs from 'fs'
import crypto from 'crypto'
import KBucket from 'k-bucket'
import { DhtAddressRaw } from '../../src/identifiers'

const ID_LENGTH = 20
const NUM_NODES = 900
const NUM_NEAREST = 10

const generateId = function(): DhtAddressRaw {
    return crypto.randomBytes(ID_LENGTH)
}

const findNNearestNeighbors = function(ownIndex: number, ownId: DhtAddressRaw, nodes: Array<DhtAddressRaw>, n: number): Array<number> {
    const retIndex: Array<number> = []

    for (let i = 0; i < n; i++) {
        let closestIndex: number = Number.MAX_VALUE 
        let closestDistance: number = Number.MAX_VALUE
        
        for (let j = 0; j < nodes.length; j++) {
            if (j == ownIndex || retIndex.includes(j)) {
                continue
            }
            const distance = KBucket.distance(ownId, nodes[j])
            if (distance < closestDistance) {
                closestDistance = distance
                closestIndex = j
            }
        }
        retIndex.push(closestIndex)
    }
    return retIndex
}

const writer = fs.createWriteStream('nodeids.json', {})
const neighborWriter = fs.createWriteStream('orderedneighbors.json', {})

neighborWriter.write('{\n')

const nodes: Array<DhtAddressRaw> = []

// generate nodeIds

for (let i = 0; i < NUM_NODES; i++) {
    const id = generateId()
    nodes.push(id)
}

writer.write(JSON.stringify(nodes, null, 4))
writer.end()

for (let i = 0; i < NUM_NODES; i++) {

    const neighborIds = findNNearestNeighbors(i, nodes[i], nodes, NUM_NEAREST)

    const neighborNames: Array<{ name: number, distance: number, id: DhtAddressRaw }> = []
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let j = 0; j < neighborIds.length; j++) {
        neighborNames.push({ name: neighborIds[j], distance: KBucket.distance(nodes[i], nodes[neighborIds[j]]), id: nodes[neighborIds[j]] })
    }
    neighborWriter.write('"' + i + '": ' + JSON.stringify(neighborNames))
    process.stdout.write('.')

    if (i != NUM_NODES - 1) {
        neighborWriter.write(',\n')
    }
}

neighborWriter.write('}')
neighborWriter.end()
