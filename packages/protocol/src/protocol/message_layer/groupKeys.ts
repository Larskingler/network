import { EthereumAddress } from '@streamr/utils'

export interface EncryptedGroupKey {
    groupKeyId: string
    data: Uint8Array
}

export interface GroupKeyRequest {
    requestId: string
    recipient: EthereumAddress
    rsaPublicKey: string
    groupKeyIds: string[]
}

export interface GroupKeyResponse {
    requestId: string
    recipient: EthereumAddress
    encryptedGroupKeys: EncryptedGroupKey[]
}
