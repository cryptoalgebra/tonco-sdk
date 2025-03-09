import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Dictionary, ExternalAddress, Sender, SendMode, Slice } from '@ton/core';
import { beginMessage } from '../3rd-party/abcJettonMinter';
import { JettonWalletContractBase } from '../3rd-party/abcJettonWallet';
import { ContractOpcodes, OpcodesLookup } from '../opCodes';
import { ContractMessageMeta } from '../../scripts/meta/structureVisitor';

export type WalletConfig = {
    balance: bigint,
    ownerAddress: Address,
    minterAddress: Address,
};

export function walletConfigToCell(config: WalletConfig): Cell {
    return beginCell()
        .storeCoins(config.balance)
        .storeAddress(config.ownerAddress)
        .storeAddress(config.minterAddress)
        .endCell();
}

export const jWalletOpcodes = {
    transfer: 0xf8a7ea5,
    internalTransfer: 0x178d4519,
    burn: 0x595f07bc,
} as const;

export const proxyWalletOpcodesV2 = {
    ...jWalletOpcodes,
    resetGas: 0x29d22935,
    tonTransfer: 0x01f3835d
} as const;

export class PTonWalletV2 extends JettonWalletContractBase<typeof proxyWalletOpcodesV2> {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell; }) {
        super(proxyWalletOpcodesV2, address, init)
    }

    static createFromConfig(config: WalletConfig, code: Cell, workchain = 0) {
        return this.createFromConfigBase(config, walletConfigToCell, code, workchain)
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    static tonTransferMessage(opts: {
            tonAmount: bigint,
            refundAddress: Address | ExternalAddress | null
            fwdPayload: Cell | Slice,          
            noPayloadOverride?: boolean // only used to test refund
        } )
    {
        let msg_builder = beginCell()
            .storeUint   (proxyWalletOpcodesV2.tonTransfer, 32)
            .storeUint   (0, 64)                 // query_id 
            .storeCoins  (opts.tonAmount)        // ton To Send. It would we wrapped and then lp minted from them
            .storeAddress(opts.refundAddress)

        if (! opts.noPayloadOverride) 
        {
            if (opts.fwdPayload instanceof Cell) {
                msg_builder = msg_builder
                    .storeUint(1, 1)             // flag that shows that payload is a cell  
                    .storeRef(opts.fwdPayload)   // Payload Instructions for the reciever
            } else {
                msg_builder = msg_builder
                    .storeUint(0, 1)
                    .storeSlice(opts.fwdPayload)
            }
        }
        return msg_builder.endCell()
    }

    async sendTonTransfer(provider: ContractProvider, via: Sender, opts: {
            tonAmount: bigint,
            refundAddress: Address | ExternalAddress | null
            fwdPayload: Cell | Slice,
            gas: bigint,
            noPayloadOverride?: boolean // only used to test refund
        }, value?: bigint
    ) {

        let message : Cell = PTonWalletV2.tonTransferMessage({
            tonAmount : opts.tonAmount,
            refundAddress : opts.refundAddress,
            fwdPayload : opts.fwdPayload,
            noPayloadOverride : opts.noPayloadOverride            
        })

        await provider.internal(via, {
            value: value ?? (opts.tonAmount + opts.gas),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: message,
        });
    }

    async sendResetGas(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value: value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint   (proxyWalletOpcodesV2.resetGas, 32)
                .storeUint   (0, 64)                 // query_id 
            .endCell(),
        });
    }


    static printParsedInput(body: Cell) : ContractMessageMeta[] {
        let result : ContractMessageMeta[] = []
  
        const OpLookup : {[key : number] : string} = OpcodesLookup
        let p = body.beginParse()        
        let op : number  = p.preloadUint(32)
        

        if (op == ContractOpcodes.JETTON_TRANSFER)
        {          
            result.push({ name:`op`                    , value: `${p.loadUint(32) }`, type:`Uint(32),op`})  
            result.push({ name:`query_id`              , value: `${p.loadUint(64) }`, type:`Uint(64) ` })              
            result.push({ name:`jetton_amount`         , value: `${p.loadCoins()  }`, type:`Coins()  ` })             
            result.push({ name:`to_owner_address`      , value: `${p.loadAddress()}`, type:`Address()` })                
            result.push({ name:`response_address`      , value: `${p.loadAddress()}`, type:`Address()` })                

            let customPayload = p.loadMaybeRef()
            if (customPayload) {
                result.push({ name:`custom_payload`    , value: customPayload.toBoc().toString('hex') , type:`Cell()` })
            } else {
                result.push({ name:`custom_payload`    , value: `none` , type:`Cell()` })
            }
            result.push({ name:`forward_ton`           , value: `${p.loadCoins()}` , type:`Coins()` })                
            let forwardPayload = p.loadMaybeRef()
            if (forwardPayload) {
                result.push({ name:`forward_payload`   , value: forwardPayload.toBoc().toString('hex') , type:`Cell(), Payload` })
            } else {
                result.push({ name:`forward_payload`   , value: `none` , type:`Cell()` })
            }
        }

        if (op == ContractOpcodes.TONPROXY_MINTER_TON_TRANSFER)
        {     
            result.push({ name:`op`                , value: `${p.loadUint(32) }`, type:`Uint(32) op`})  
            result.push({ name:`query_id`          , value: `${p.loadUint(64) }`, type:`Uint(64)` })              
            result.push({ name:`ton_amount`        , value: `${p.loadCoins()  }`, type:`Coins()  ` })          
            result.push({ name:`refund_address`    , value: `${p.loadAddress()}`, type:`Address()` })             
        }


        return result
    } 

}
