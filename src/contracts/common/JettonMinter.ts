import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano, internal as internal_relaxed, storeMessageRelaxed } from '@ton/core';

import { Op } from './JettonConstants';
import { Maybe } from '@ton/core/dist/utils/maybe';
import { ContractMessageMeta } from '../../scripts/meta/structureVisitor';
import { ParseDataVisitor } from '../../scripts/meta/parseDataVisitor';
import { ContractOpcodes } from '../opCodes';
import { MetaMessage, StructureVisitor } from '../../scripts/meta/structureVisitor';

export type JettonMinterContent = {
    type:0|1,
    uri:string
};

export type JettonMinterConfig = {
    admin: Address; 
    content: Cell; 
    wallet_code: Cell
};

export function jettonMinterConfigToCell(config: JettonMinterConfig): Cell {
    return beginCell()
                      .storeCoins(0)
                      .storeAddress(config.admin)
                      .storeRef(config.content)
                      .storeRef(config.wallet_code)
           .endCell();
}

export function jettonContentToCell(content:JettonMinterContent) {
    return beginCell()
                      .storeUint(content.type, 8)
                      .storeStringTail(content.uri) //Snake logic under the hood
           .endCell();
}

export type StablecoinMinterConfigFull = {
    supply: bigint,
    admin: Address,
    //Makes no sense to update transfer admin. ...Or is it?
    transfer_admin: Address | null,
    wallet_code: Cell,
    jetton_content: Cell 
}

export function stablecoinMinterConfigFullToCell(config: StablecoinMinterConfigFull): Cell {
    return beginCell()
        .storeCoins(config.supply)
        .storeAddress(config.admin)
        .storeAddress(config.transfer_admin)
        .storeRef(config.wallet_code)
        .storeRef(config.jetton_content)
    .endCell()
}

export class JettonMinter implements Contract {
    constructor(
        readonly address: Address, 
        readonly init?: { code: Cell; data: Cell }
    ) 
    {}

    static createFromAddress(address: Address) {
        return new JettonMinter(address);
    }

    static createFromConfig(config: JettonMinterConfig, code: Cell, workchain = 0) {
        const data = jettonMinterConfigToCell(config);
        const init = { code, data };
        const address : Address =  contractAddress(workchain, init)
        return new JettonMinter(address, init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    static TOP_UP_OPERATION : number = 0xd372158c;

    async sendStableDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(JettonMinter.TOP_UP_OPERATION, 32).storeUint(0, 64).endCell(),
        });
    }

    protected static jettonInternalTransfer(jetton_amount: bigint,
                                            forward_ton_amount: bigint,
                                            response_addr?: Address,
                                            query_id: number | bigint = 0) {
        return beginCell()
                .storeUint(Op.internal_transfer, 32)
                .storeUint(query_id, 64)
                .storeCoins(jetton_amount)
                .storeAddress(null)
                .storeAddress(response_addr)
                .storeCoins(forward_ton_amount)
                .storeBit(false)
               .endCell();

    }
    static mintMessage(from: Address, to: Address, jetton_amount: bigint, forward_ton_amount: bigint, total_ton_amount: bigint, query_id: number | bigint = 0) {
		const mintMsg = beginCell().storeUint(Op.internal_transfer, 32)
                                   .storeUint(0, 64)
                                   .storeCoins(jetton_amount)
                                   .storeAddress(null)
                                   .storeAddress(from) // Response addr
                                   .storeCoins(forward_ton_amount)
                                   .storeMaybeRef(null)
                    .endCell();

        return beginCell().storeUint(Op.mint, 32).storeUint(query_id, 64) // op, queryId
                          .storeAddress(to)
                          .storeCoins(total_ton_amount)
                          .storeCoins(jetton_amount)
                          .storeRef(mintMsg)
               .endCell();
    }
    async sendMint(provider: ContractProvider, via: Sender, to: Address, jetton_amount: bigint, forward_ton_amount: bigint, total_ton_amount: bigint) {
        if(total_ton_amount <= forward_ton_amount) {
            throw new Error("Total ton amount should be > forward amount");
        }
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonMinter.mintMessage(this.address, to, jetton_amount, forward_ton_amount, total_ton_amount),
            value: total_ton_amount,
        });
    }

    /* provide_wallet_address#2c76b973 query_id:uint64 owner_address:MsgAddress include_address:Bool = InternalMsgBody;
    */
    static discoveryMessage(owner: Address, include_address: boolean) {
        return beginCell().storeUint(0x2c76b973, 32).storeUint(0, 64) // op, queryId
                          .storeAddress(owner).storeBit(include_address)
               .endCell();
    }

    async sendDiscovery(provider: ContractProvider, via: Sender, owner: Address, include_address: boolean, value:bigint = toNano('0.1')) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonMinter.discoveryMessage(owner, include_address),
            value: value,
        });
    }

    static changeAdminMessage(newOwner: Address) {
        return beginCell().storeUint(Op.change_admin, 32).storeUint(0, 64) // op, queryId
                          .storeAddress(newOwner)
               .endCell();
    }

    async sendChangeAdmin(provider: ContractProvider, via: Sender, newOwner: Address) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonMinter.changeAdminMessage(newOwner),
            value: toNano("0.05"),
        });
    }
    static changeContentMessage(content: Cell) {
        return beginCell().storeUint(Op.change_content, 32).storeUint(0, 64) // op, queryId
                          .storeRef(content)
               .endCell();
    }

    async sendChangeContent(provider: ContractProvider, via: Sender, content: Cell) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonMinter.changeContentMessage(content),
            value: toNano("0.05"),
        });
    }

    //
    //   Getters
    //
    async getWalletAddress(provider: ContractProvider, owner: Address): Promise<Address> {
        const res = await provider.get('get_wallet_address', [{ type: 'slice', cell: beginCell().storeAddress(owner).endCell() }])
        return res.stack.readAddress()
    }

    async getJettonData(provider: ContractProvider) {
        let res = await provider.get('get_jetton_data', []);
        let totalSupply = res.stack.readBigNumber();
        let mintable = res.stack.readBoolean();

        // let adminAddress = res.stack.readAddress(); Well..... 
        let adminAddress = res.stack.readAddressOpt();

        let content = res.stack.readCell();
        let walletCode = res.stack.readCell();
        return {
            totalSupply,
            mintable,
            adminAddress,
            content,
            walletCode
        };
    }

    async getTotalSupply(provider: ContractProvider) {
        let res = await this.getJettonData(provider);
        return res.totalSupply;
    }
    async getAdminAddress(provider: ContractProvider) {
        let res = await this.getJettonData(provider);
        return res.adminAddress;
    }
    async getContent(provider: ContractProvider) {
        let res = await this.getJettonData(provider);
        return res.content;
    }


    /**
     * Visitor pattern for the operations
     **/
    
    static metaDescription : MetaMessage[] =     
    [
    {
        opcode : ContractOpcodes.JETTON_PROVIDE_WALLET_ADDRESS,
        description : "Message that reads wallet address onchain",

        acceptor : (visitor: StructureVisitor) => {
            visitor.visitField({ name:`op`,               type:`Uint`,    size:32,  meta:"op",   comment: ""})    
            visitor.visitField({ name:`query_id`,         type:`Uint`,    size:64,  meta:""  ,   comment : "queryid as of the TON documentation"}) 

            visitor.visitField({ name:`owner`,             type:`Address`, size:267, meta:"" ,        comment: "Owner for which to query"})
            visitor.visitField({ name:`include_owner `,    type:`Uint`,    size:1,   meta:"Boolean" , comment: ""})
        }
    },
    {
        opcode : ContractOpcodes.JETTON_TAKE_WALLET_ADDRESS,
        description : "Message that returns wallet address onchain",

        acceptor : (visitor: StructureVisitor) => {
            visitor.visitField({ name:`op`,          type:`Uint`,    size:32,  meta:"op",   comment: ""})    
            visitor.visitField({ name:`query_id`,    type:`Uint`,    size:64,  meta:""  ,   comment : "queryid as of the TON documentation"}) 

            visitor.visitField({ name:`wallet`,      type:`Address`, size:267, meta:"" ,    comment: "Wallet for which the query was made"})

            visitor.enterCell( { name:`owner_cell`,  type:`Maybe`  ,                     comment : "Cell With Owner"})
            visitor.visitField({ name:`owner`,       type:`Address`, size:267, meta:"" , comment: "Owner"})           
            visitor.leaveCell({})          
        }
    }
    ]

    /** 
    *  Debug methods to parse the message inputs
    *  This could be autogenerated
    **/

    static printParsedInput(body: Cell) : ContractMessageMeta[] 
    {
        let result : ContractMessageMeta[] = []
        let p = body.beginParse()
        let op : number  = p.preloadUint(32)

        for (let meta of this.metaDescription) {
            if (op == meta.opcode) {
                let visitor = new ParseDataVisitor
                visitor.visitCell(body, meta.acceptor)
                result = [...result, ...visitor.result]
            }
        }
        return result;
    }

}
