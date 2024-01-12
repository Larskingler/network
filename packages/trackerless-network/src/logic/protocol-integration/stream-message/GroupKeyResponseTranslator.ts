import { GroupKeyResponse as OldGroupKeyResponse } from '@streamr/protocol'
import { GroupKey, GroupKeyResponse } from '../../../proto/packages/trackerless-network/protos/NetworkRpc'
import { toEthereumAddress, binaryToHex, hexToBinary } from '@streamr/utils'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class GroupKeyResponseTranslator {

    static toProtobuf(msg: OldGroupKeyResponse): GroupKeyResponse {
        return {
            requestId: msg.requestId,
            recipientId: hexToBinary(msg.recipient),
            groupKeys: msg.encryptedGroupKeys.map((groupKey) => ({
                id: groupKey.groupKeyId,
                data: groupKey.data
            }))
        }
    }

    static toClientProtocol(msg: GroupKeyResponse): OldGroupKeyResponse {
        return {
            requestId: msg.requestId,
            recipient: toEthereumAddress(binaryToHex(msg.recipientId, true)),
            encryptedGroupKeys: msg.groupKeys.map((groupKey: GroupKey) => ({
                groupKeyId: groupKey.id,
                data: groupKey.data
            }))
        }
    }
}
