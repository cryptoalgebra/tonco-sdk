import { Address, beginCell, Builder, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano } from '@ton/core';
import { beginMessage, JettonMinterContractBase } from '../3rd-party/abcJettonMinter';

export const jMinterOpcodes = {
    burnNotification: 0x7bdd97de,
    mint: 21,
    changeAdmin: 3,
    changeContent: 4,
    internalTransfer: 0x178d4519
} as const;

export const jMinterDiscOpcodes = {
    ...jMinterOpcodes,
    provideWalletAddress: 0x2c76b973,
    takeWalletAddress: 0xd1735400,
} as const;


export type MinterConfig = {
    id?: number,
    walletCode: Cell,
    content: Cell,
};

export function minterConfigToCell(config: MinterConfig): Cell {
    return beginCell()
        .storeUint(config.id || 0, 32)
        .storeRef(config.walletCode)
        .storeRef(config.content)
        .endCell();
}

export const proxyOpCodesV2 = {
    ...jMinterDiscOpcodes,
    deployWallet: 0x4f5f4313
} as const;


export class PTonMinterV2 extends JettonMinterContractBase<typeof proxyOpCodesV2> {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell; }) {
        super(proxyOpCodesV2, address, init)
    }

    static createFromConfig(config: MinterConfig, code: Cell, workchain = 0) {
        return this.createFromConfigBase(config, minterConfigToCell, code, workchain)
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }


    /**
     *
     *  @param opts 
     *          opts.value - note it is ignored
     * 
     **/

    static messageDeployWallet( opts : {value?: bigint, ownerAddress: Address,  excessesAddress?: Address }, excessesDefault : Address ) : Cell
    {
        return beginMessage(proxyOpCodesV2.deployWallet)
                .storeAddress(opts.ownerAddress)
                .storeAddress(opts.excessesAddress || excessesDefault)
        .endCell()
    }

    static unpackDeployWalletMessage(c: Cell) : {owner : Address, excessesAddress : Address}
    {
        let s = c.beginParse()
        let op = s.loadUint(32)
        if (op != proxyOpCodesV2.deployWallet)
            throw Error("Wrong opcode")
        let query_id = s.loadUint(64)
        let owner = s.loadAddress()
        let excessesAddress = s.loadAddress()

        return {owner, excessesAddress}
    }
    
    async sendDeployWallet(provider: ContractProvider, via: Sender, opts: {
        value?: bigint,
        ownerAddress: Address,
        excessesAddress?: Address
    }, value?: bigint) {
        await provider.internal(via, {
            value: value ?? toNano("1"),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: PTonMinterV2.messageDeployWallet(opts, via.address!)
        });
    }
}
