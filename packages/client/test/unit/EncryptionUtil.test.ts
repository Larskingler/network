import {
    EncryptedGroupKey,
    EncryptionType,
    StreamPartIDUtils,
    toStreamID,
    toStreamPartID
} from '@streamr/protocol'
import { fastWallet } from '@streamr/test-utils'
import { GroupKey } from '../../src/encryption/GroupKey'
import { EncryptionUtil } from '../../src/encryption/EncryptionUtil'
import { createMockMessage } from '../test-utils/utils'
import { hexToBinary, binaryToUtf8 } from '@streamr/utils'

const STREAM_ID = toStreamID('streamId')

describe('EncryptionUtil', () => {
    it('aes decryption after encryption equals the initial plaintext', () => {
        const key = GroupKey.generate()
        const plaintext = 'some random text'
        const ciphertext = EncryptionUtil.encryptWithAES(Buffer.from(plaintext, 'utf8'), key.data)
        expect(EncryptionUtil.decryptWithAES(ciphertext, key.data).toString('utf8')).toStrictEqual(plaintext)
    })

    it('aes encryption preserves size (plus iv)', () => {
        const key = GroupKey.generate()
        const plaintext = 'some random text'
        const plaintextBuffer = Buffer.from(plaintext, 'utf8')
        const ciphertext = EncryptionUtil.encryptWithAES(plaintextBuffer, key.data)
        expect(ciphertext.length).toStrictEqual(plaintextBuffer.length + 16)
    })

    it('multiple same encrypt() calls use different ivs and produce different ciphertexts', () => {
        const key = GroupKey.generate()
        const plaintext = 'some random text'
        const cipher1 = EncryptionUtil.encryptWithAES(Buffer.from(plaintext, 'utf8'), key.data)
        const cipher2 = EncryptionUtil.encryptWithAES(Buffer.from(plaintext, 'utf8'), key.data)
        expect(cipher1.slice(0, 16)).not.toStrictEqual(cipher2.slice(0, 16))
        expect(cipher1.slice(16)).not.toStrictEqual(cipher2.slice(16))
    })

    it('StreamMessage decryption: happy path', async () => {
        const key = GroupKey.generate()
        const nextKey = GroupKey.generate()
        const streamMessage = await createMockMessage({
            streamPartId: StreamPartIDUtils.parse('stream#0'),
            publisher: fastWallet(),
            content: {
                foo: 'bar'
            },
            encryptionKey: key,
            nextEncryptionKey: nextKey
        })
        EncryptionUtil.decryptStreamMessage(streamMessage, key)
        expect(binaryToUtf8(streamMessage.getSerializedContent())).toStrictEqual('{"foo":"bar"}')
        expect(streamMessage.encryptionType).toStrictEqual(EncryptionType.NONE)
        expect(streamMessage.groupKeyId).toBe(key.id)
        expect(streamMessage.newGroupKey).toEqual(nextKey)
    })

    it('StreamMessage decryption throws if newGroupKey invalid', async () => {
        const key = GroupKey.generate()
        const msg = await createMockMessage({
            publisher: fastWallet(),
            streamPartId: toStreamPartID(STREAM_ID, 0),
            encryptionKey: key
        })
        msg.newGroupKey = {
            groupKeyId: 'mockId',
            data: hexToBinary('0x1234'),
            serialized: ''
        } as EncryptedGroupKey
        expect(() => EncryptionUtil.decryptStreamMessage(msg, key)).toThrow('Could not decrypt new group key')
    })
})
