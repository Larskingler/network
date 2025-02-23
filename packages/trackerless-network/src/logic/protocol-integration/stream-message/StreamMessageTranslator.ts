import {
    MessageID as OldMessageID,
    StreamMessage as OldStreamMessage,
    StreamMessageType as OldStreamMessageType,
    MessageRef as OldMessageRef,
    EncryptedGroupKey as OldEncryptedGroupKey,
    StreamID,
    EncryptionType as OldEncryptionType,
    SignatureType as OldSignatureType,
    ContentType as OldContentType
} from '@streamr/protocol'
import {
    ContentType,
    GroupKey,
    EncryptionType,
    GroupKeyRequest,
    GroupKeyResponse,
    MessageRef,
    SignatureType,
    StreamMessage,
    MessageID
} from '../../../proto/packages/trackerless-network/protos/NetworkRpc'
import { toEthereumAddress, binaryToHex, hexToBinary } from '@streamr/utils'

const oldToNewEncryptionType = (type: OldEncryptionType): EncryptionType => {
    if (type === OldEncryptionType.AES) {
        return EncryptionType.AES
    }
    return EncryptionType.NONE
}

const newToOldEncryptionType = (type: EncryptionType): OldEncryptionType => {
    if (type === EncryptionType.AES) {
        return OldEncryptionType.AES
    }
    return OldEncryptionType.NONE
}

const oldToNewContentType = (type: OldContentType): ContentType => {
    if (type === OldContentType.JSON) {
        return ContentType.JSON
    }
    return ContentType.BINARY
}

const newToOldContentType = (type: ContentType): OldContentType => {
    if (type === ContentType.JSON) {
        return OldContentType.JSON
    }
    return OldContentType.BINARY
}

const oldToNewSignatureType = (type: OldSignatureType): SignatureType => {
    if (type === OldSignatureType.LEGACY_SECP256K1) {
        return SignatureType.LEGACY_SECP256K1
    }
    return SignatureType.SECP256K1
}

const newToOldSignatureType = (type: SignatureType): OldSignatureType => {
    if (type === SignatureType.LEGACY_SECP256K1) {
        return OldSignatureType.LEGACY_SECP256K1
    }
    return OldSignatureType.SECP256K1

}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class StreamMessageTranslator {

    static toProtobuf(msg: OldStreamMessage): StreamMessage {
        const messageId: MessageID = {
            timestamp: msg.getTimestamp(),
            sequenceNumber: msg.getSequenceNumber(),
            streamId: msg.getStreamId() as string,
            streamPartition: msg.getStreamPartition(),
            publisherId: hexToBinary(msg.getPublisherId()),
            messageChainId: msg.getMsgChainId()
        }
        let previousMessageRef: MessageRef | undefined = undefined
        if (msg.prevMsgRef) {
            previousMessageRef = {
                timestamp: msg.prevMsgRef.timestamp,
                sequenceNumber: msg.prevMsgRef.sequenceNumber
            }
        }
        let body: StreamMessage['body']
        if (msg.messageType === OldStreamMessageType.MESSAGE) {
            let newGroupKey: GroupKey | undefined = undefined
            if (msg.newGroupKey) {
                newGroupKey = {
                    id: msg.newGroupKey.id,
                    data: msg.newGroupKey.data
                }
            }
            body = {
                oneofKind: 'contentMessage',
                contentMessage: {
                    content: msg.content,
                    contentType: oldToNewContentType(msg.contentType),
                    encryptionType: oldToNewEncryptionType(msg.encryptionType),
                    groupKeyId: msg.groupKeyId ?? undefined,
                    newGroupKey
                }
            }
        } else if (msg.messageType === OldStreamMessageType.GROUP_KEY_REQUEST) {
            body = {
                oneofKind: 'groupKeyRequest',
                groupKeyRequest: GroupKeyRequest.fromBinary(msg.content)
            }
        } else if (msg.messageType === OldStreamMessageType.GROUP_KEY_RESPONSE) {
            body = {
                oneofKind: 'groupKeyResponse',
                groupKeyResponse: GroupKeyResponse.fromBinary(msg.content)
            }
        } else {
            throw new Error('invalid message type')
        }
        const translated: StreamMessage = {
            messageId,
            previousMessageRef,
            signature: msg.signature,
            signatureType: oldToNewSignatureType(msg.signatureType),
            body
        }
        return translated
    }

    static toClientProtocol(msg: StreamMessage): OldStreamMessage {
        let messageType: OldStreamMessageType
        let content: Uint8Array
        let contentType: OldContentType = OldContentType.BINARY
        let encryptionType: OldEncryptionType = OldEncryptionType.NONE
        let newGroupKey: OldEncryptedGroupKey | undefined = undefined
        let groupKeyId: string | undefined = undefined
        if (msg.body.oneofKind === 'contentMessage') {
            messageType = OldStreamMessageType.MESSAGE
            content = msg.body.contentMessage.content
            contentType = newToOldContentType(msg.body.contentMessage.contentType)
            encryptionType = newToOldEncryptionType(msg.body.contentMessage.encryptionType)
            if (msg.body.contentMessage.newGroupKey) {
                newGroupKey = new OldEncryptedGroupKey(
                    msg.body.contentMessage.newGroupKey.id,
                    msg.body.contentMessage.newGroupKey.data
                )
            }
            groupKeyId = msg.body.contentMessage.groupKeyId
        } else if (msg.body.oneofKind === 'groupKeyRequest') {
            messageType = OldStreamMessageType.GROUP_KEY_REQUEST
            try {
                content = GroupKeyRequest.toBinary(msg.body.groupKeyRequest)
            } catch (err) {
                throw new Error(`invalid group key request: ${err}`)
            }
        } else if (msg.body.oneofKind === 'groupKeyResponse') {
            messageType = OldStreamMessageType.GROUP_KEY_RESPONSE
            try {
                content = GroupKeyResponse.toBinary(msg.body.groupKeyResponse)
            } catch (err) {
                throw new Error(`invalid group key response: ${err}`)
            }
        } else {
            throw new Error('invalid message type')
        }
        const messageId = new OldMessageID(
            msg.messageId!.streamId as StreamID,
            msg.messageId!.streamPartition,
            Number(msg.messageId!.timestamp),
            msg.messageId!.sequenceNumber,
            toEthereumAddress(binaryToHex(msg.messageId!.publisherId, true)),
            msg.messageId!.messageChainId
        )
        let prevMsgRef: OldMessageRef | undefined = undefined
        if (msg.previousMessageRef) {
            prevMsgRef = new OldMessageRef(Number(msg.previousMessageRef.timestamp), msg.previousMessageRef.sequenceNumber)
        }
        const translated = new OldStreamMessage({
            messageId,
            prevMsgRef,
            messageType,
            content,
            contentType,
            signature: msg.signature,
            signatureType: newToOldSignatureType(msg.signatureType),
            encryptionType,
            groupKeyId,
            newGroupKey
        })
        return translated
    }
}
