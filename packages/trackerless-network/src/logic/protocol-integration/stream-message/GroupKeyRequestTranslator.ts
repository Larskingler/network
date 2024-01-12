import { GroupKeyRequest as OldGroupKeyRequest } from '@streamr/protocol'
import { GroupKeyRequest } from '../../../proto/packages/trackerless-network/protos/NetworkRpc'
import { toEthereumAddress, binaryToHex, binaryToUtf8, hexToBinary, utf8ToBinary } from '@streamr/utils'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class GroupKeyRequestTranslator {

    static toProtobuf(msg: OldGroupKeyRequest): GroupKeyRequest {
        return {
            requestId: msg.requestId,
            recipientId: hexToBinary(msg.recipient),
            rsaPublicKey: utf8ToBinary(msg.rsaPublicKey),
            groupKeyIds: [...msg.groupKeyIds]
        }
    }

    static toClientProtocol(msg: GroupKeyRequest): OldGroupKeyRequest {
        return {
            requestId: msg.requestId,
            recipient: toEthereumAddress(binaryToHex(msg.recipientId, true)),
            rsaPublicKey: binaryToUtf8(msg.rsaPublicKey),
            groupKeyIds: msg.groupKeyIds
        }
    }

}
