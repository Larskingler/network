/* eslint-disable max-len */
import assert from 'assert'
import { createSignature, verifySignature } from '../src/signingUtils'
import { toEthereumAddress } from '../src/EthereumAddress'
import { hexToBinary } from '../src/binaryUtils'

const privateKey = hexToBinary('23bead9b499af21c4c16e4511b3b6b08c3e22e76e0591f5ab5ba8d4c3a5b1820')

describe('createSignature', () => {
    it('produces correct signature', async () => {
        const payload = Buffer.from('data-to-sign')
        const signature = createSignature(payload, privateKey)
        expect(signature).toStrictEqual(hexToBinary('787cd72924153c88350e808de68b68c88030cbc34d053a5c696a5893d5e6fec1687c1b6205ec99aeb3375a81bf5cb8857ae39c1b55a41b32ed6399ae8da456a61b'))
    })
})

describe('verifySignature', () => {
    it('returns true on valid signature', async () => {
        const address = toEthereumAddress('0x752C8dCAC0788759aCB1B4BB7A9103596BEe3e6c')
        const payload = Buffer.from('ogzCJrTdQGuKQO7nkLd3Rw0156700333876720x752c8dcac0788759acb1b4bb7a9103596bee3e6ckxYyLiSUQO0SRvMx6gA115670033387671{"numero":86}')
        const signature = hexToBinary('0xc97f1fbb4f506a53ecb838db59017f687892494a9073315f8a187846865bf8325333315b116f1142921a97e49e3881eced2b176c69f9d60666b98b7641ad11e01b')
        const isValid = verifySignature(address, payload, signature)
        assert(isValid)
    })

    it('returns false on invalid signature', async () => {
        const address = toEthereumAddress('0x752C8dCAC0788759aCB1B4BB7A9103596BEe3e6c')
        const payload = Buffer.from('ogzCJrTdQGuKQO7nkLd3Rw0156700333876720x752c8dcac0788759acb1b4bb7a9103596bee3e6ckxYyLiSUQO0SRvMx6gA115670033387671{"numero":86}')
        const signature = hexToBinary('0xf00f00bb4f506a53ecb838db59017f687892494a9073315f8a187846865bf8325333315b116f1142921a97e49e3881eced2b176c69f9d60666b98b7641ad11e01b')
        const isValid = verifySignature(address, payload, signature)
        assert(!isValid)
    })

    it('returns false if the message is tampered', async () => {
        const address = toEthereumAddress('0x752C8dCAC0788759aCB1B4BB7A9103596BEe3e6c')
        const payload = Buffer.from('foo_ogzCJrTdQGuKQO7nkLd3Rw0156700333876720x752c8dcac0788759acb1b4bb7a9103596bee3e6ckxYyLiSUQO0SRvMx6gA115670033387671{"numero":86}')
        const signature = hexToBinary('0xc97f1fbb4f506a53ecb838db59017f687892494a9073315f8a187846865bf8325333315b116f1142921a97e49e3881eced2b176c69f9d60666b98b7641ad11e01b')
        const isValid = verifySignature(address, payload, signature)
        assert(!isValid)
    })
})
