import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano } from '@ton/core';
import { ContractOpcodes, OpcodesLookup } from '../opCodes';
import { ContractMessageMeta, MetaMessage, StructureVisitor } from '../../scripts/meta/structureVisitor';

export type JettonWalletConfig = {
    balance : bigint,
    owner_address : Address,
    jetton_master_address : Address,
    jetton_wallet_code : Cell
};

export function jettonWalletConfigToCell(config: JettonWalletConfig): Cell {
    return beginCell()    
        .storeCoins  (config.balance)
        .storeAddress(config.owner_address)
        .storeAddress(config.jetton_master_address)
        .storeRef    (config.jetton_wallet_code)
    .endCell();
}

export class JettonWallet implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new JettonWallet(address);
    }

    static createFromConfig(config: JettonWalletConfig, code: Cell, workchain = 0) {
        const data = jettonWalletConfigToCell(config);
        const init = { code, data };
        return new JettonWallet(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }


    static transferMessage(
        jetton_amount: bigint, to: Address,
        responseAddress:Address,
        customPayload: Cell | null,
        forward_ton_amount: bigint,
        forwardPayload: Cell | null
    ) {

        return beginCell().storeUint(0xf8a7ea5, 32).storeUint(0, 64) // op, queryId
            .storeCoins(jetton_amount)
            .storeAddress(to)
            .storeAddress(responseAddress)
            .storeMaybeRef(customPayload)
            .storeCoins(forward_ton_amount)
            .storeMaybeRef(forwardPayload)
        .endCell();
    }

    static transferMessageComment(
        jetton_amount: bigint, to: Address,
        responseAddress:Address,
        customPayload: Cell | null,
        comment: string
    ) {
        let forwardPayload : Cell = beginCell().endCell()
        if (comment != "") {            
            forwardPayload = beginCell()
                .storeUint(0x00000000, 32)
                .storeBuffer(Buffer.from(comment))
            .endCell()
        }
        return this.transferMessage(jetton_amount, to, responseAddress, customPayload, toNano(0.0), forwardPayload)
    }
    
    async sendTransfer(
        provider: ContractProvider, via: Sender,
        value: bigint,
        jetton_amount: bigint, to: Address,
        responseAddress:Address,
        customPayload: Cell | null,
        forward_ton_amount: bigint,
        forwardPayload: Cell,        
    ) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonWallet.transferMessage(jetton_amount, to, responseAddress, customPayload, forward_ton_amount, forwardPayload),
            value:value,
        });
    }

    async sendTransferWithComment(
        provider: ContractProvider, via: Sender,
        value: bigint,
        jetton_amount: bigint,
        to: Address,
        responseAddress:Address,
        comment : string       
    ) {
        let forwardPayload : Cell = beginCell().endCell()
        if (comment != "") {            
            forwardPayload = beginCell()
                .storeUint(0x00000000, 32)
                .storeBuffer(Buffer.from(comment))
            .endCell()
        }

        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonWallet.transferMessage(jetton_amount, to, responseAddress, beginCell().endCell(), toNano(0.0), forwardPayload),
            value:value
        });
    }


    /*
      burn#595f07bc query_id:uint64 amount:(VarUInteger 16)
                    response_destination:MsgAddress custom_payload:(Maybe ^Cell)
                    = InternalMsgBody;
    */
    static burnMessage(jetton_amount: bigint,
                       responseAddress:Address,
                       customPayload: Cell | null) {
        return beginCell().storeUint(0x595f07bc, 32).storeUint(0, 64) // op, queryId
                          .storeCoins(jetton_amount).storeAddress(responseAddress)
                          .storeMaybeRef(customPayload)
               .endCell();
    }

    async sendBurn(provider: ContractProvider, via: Sender, value: bigint,
                          jetton_amount: bigint,
                          responseAddress:Address,
                          customPayload: Cell) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonWallet.burnMessage(jetton_amount, responseAddress, customPayload),
            value:value
        });

    }
    /*
      withdraw_tons#107c49ef query_id:uint64 = InternalMsgBody;
    */
    static withdrawTonsMessage() {
        return beginCell().storeUint(0x6d8e5e3c, 32).storeUint(0, 64) // op, queryId
               .endCell();
    }

    async sendWithdrawTons(provider: ContractProvider, via: Sender) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonWallet.withdrawTonsMessage(),
            value:toNano('0.1')
        });

    }
    /*
      withdraw_jettons#10 query_id:uint64 wallet:MsgAddressInt amount:Coins = InternalMsgBody;
    */
    static withdrawJettonsMessage(from:Address, amount:bigint) {
        return beginCell()
            .storeUint(0x768a50b2, 32)
            .storeUint(0, 64) // op, queryId
            .storeAddress(from)
            .storeCoins(amount)
            .storeMaybeRef(null)
        .endCell();
    }

    async sendWithdrawJettons(provider: ContractProvider, via: Sender, from:Address, amount:bigint) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonWallet.withdrawJettonsMessage(from, amount),
            value:toNano('0.1')
        });

    }


    async getJettonBalance(provider: ContractProvider) {
        let state = await provider.getState();
        if (state.state.type !== 'active') {
            return 0n;
        }
        let res = await provider.get('get_wallet_data', []);
        return res.stack.readBigNumber();
    }

    async getWalletData(provider: ContractProvider) {
        const result = await provider.get('get_wallet_data', []);
        return {
            balance: result.stack.readBigNumber(),
            ownerAddress: result.stack.readAddress(),
            jettonMasterAddress: result.stack.readAddress(),
            jettonWalletCode: result.stack.readCell(),
        };
    }


    static metaDescription : MetaMessage[] =     
    [
        {
            opcode : ContractOpcodes.JETTON_TRANSFER,
            description : "Jetton transfer initiation",
    
            acceptor : (visitor: StructureVisitor) => {
                visitor.visitField({ name:`op`,               type:`Uint`,    size:32,   meta:"op", comment: ""})    
                visitor.visitField({ name:`query_id`,         type:`Uint`,    size:64,   meta:"",   comment: "queryid as of the TON documentation"}) 
                visitor.visitField({ name:`jetton_amount`,    type:`Coins`,   size:124,  meta:"",   comment: "Amount of coins sent to the router"}) 
                visitor.visitField({ name:`to_owner_address`, type:`Address`, size:267,  meta:"",   comment: "User that originated the transfer"})
                visitor.visitField({ name:`response_address`, type:`Address`, size:267,  meta:"",   comment: "User that waits for the response"}) 
                visitor.visitField({ name:`custom_payload`,   type:`Cell`,    size:0,    meta:"Maybe, Payload",comment: "Payload for processing by jetton itself"}) 
                visitor.visitField({ name:`forward_ton`,      type:`Coins`,   size:124,  meta:"",   comment: "Amount of to attach to forward payload"})
                visitor.visitField({ name:`forward_payload`,  type:`Cell`,    size:0,    meta:"Either,Maybe,Payload",comment: "Payload for processing"}) 
            } 
        },
        {
            opcode : ContractOpcodes.JETTON_INTERNAL_TRANSFER,
            description : "Jetton transfer message between wallets",
    
            acceptor : (visitor: StructureVisitor) => {
                visitor.visitField({ name:`op`,               type:`Uint`,    size:32,   meta:"op", comment: ""})    
                visitor.visitField({ name:`query_id`,         type:`Uint`,    size:64,   meta:"",   comment: "queryid as of the TON documentation"}) 
                visitor.visitField({ name:`jetton_amount`,    type:`Coins`,   size:124,  meta:"",   comment: "Amount of coins sent to the router"}) 
                visitor.visitField({ name:`from_address`,     type:`Address`, size:267,  meta:"",   comment: "User that originated the transfer"})
                visitor.visitField({ name:`response_address`, type:`Address`, size:267,  meta:"",   comment: "User that waits for the response"})                
                visitor.visitField({ name:`forward_ton`,      type:`Coins`,   size:124,  meta:"",   comment: "Amount of to attach to forward payload"})
                visitor.visitField({ name:`forward_payload`,  type:`Cell`,    size:0,    meta:"Either,Maybe,Payload",comment: "Payload for processing"}) 
            } 
        },


    ]
       

}
