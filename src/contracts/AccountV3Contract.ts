import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from "@ton/core";
import { ContractOpcodes, } from "./opCodes";
import { ContractMessageMeta, MetaMessage, StructureVisitor } from "./meta/structureVisitor";
import { ParseDataVisitor } from "./meta/parseDataVisitor";


/** Initial data structures and settings **/
export type AccountV3ContractConfig = {    
    user: Address;
    pool: Address;
    stored0: bigint;
    stored1: bigint;

    /** Well... **/
    enough0: bigint;
    enough1: bigint;
};
  
export function accountv3ContractConfigToCell(config: AccountV3ContractConfig): Cell 
{
 /* let vaultCell = null
    if (config.vault !== undefined) { 
        //console.log("TRACE JETTON WALLET: ", config.vault.jetton0_wallet)
        //console.log("TRACE JETTON WALLET: ", config.vault.jetton1_wallet)
        let jw0 : Address = BLACK_HOLE_ADDRESS
        let jw1 : Address = BLACK_HOLE_ADDRESS

        vaultCell = beginCell()
            .storeAddress(jw0)
            .storeAddress(jw1)
            .storeCoins(0n)
            .storeCoins(0n)
            .storeRef(highloadWalletV3ConfigToCell(config.vault.wallet))
        .endCell()
    }*/


    return beginCell()
        .storeAddress(config.user)
        .storeAddress(config.pool)
        .storeRef(beginCell()
          .storeCoins  (config.stored0)
          .storeCoins  (config.stored1)
          .storeCoins  (config.enough0)
          .storeCoins  (config.enough1)
        .endCell())
    .endCell();
}


export class AccountV3Contract implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}
  
    static createFromConfig(
        config: AccountV3ContractConfig,
        code: Cell,
        workchain = 0
    ) {
        const data = accountv3ContractConfigToCell(config);
        const init = { code, data };
        const address = contractAddress(workchain, init);
    
        return new AccountV3Contract(address, init);
    }
  
    async sendDeploy(provider: ContractProvider, sender: Sender, value: bigint) {
        await provider.internal(sender, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }


    async sendResetGas(provider: ContractProvider, sender: Sender, value: bigint) {
        const msg_body = beginCell()
            .storeUint(ContractOpcodes.ACCOUNTV3_RESET_GAS, 32) // OP code
            .storeUint(0, 64) // QueryID what for?
        .endCell();

        return await provider.internal(sender, { value, sendMode: SendMode.PAY_GAS_SEPARATELY, body: msg_body });
    }

    /* Test only : Would be accepted only from pool */
    async sendAddLiquidity(
        provider: ContractProvider, 
        sender: Sender, 
        value: bigint,
        
        newAmount0: bigint,
        newAmount1: bigint,
        minLPOut: bigint
    ) {
      const msg_body = beginCell()
        .storeUint(ContractOpcodes.ACCOUNTV3_ADD_LIQUIDITY, 32) // OP code
        .storeCoins(newAmount0)
        .storeCoins(newAmount1)
        .storeCoins(minLPOut)     
      .endCell();

      return await provider.internal(sender, { value, sendMode: SendMode.PAY_GAS_SEPARATELY, body: msg_body });
    }

    async sendRefundMe(
        provider: ContractProvider, 
        sender: Sender, 
        value: bigint,
    ) {
        const msg_body = beginCell()
            .storeUint(ContractOpcodes.ACCOUNTV3_REFUND_ME, 32) // OP code
            .storeUint(0, 64) // query_id
        .endCell();

        return await provider.internal(sender, { value, sendMode: SendMode.PAY_GAS_SEPARATELY, body: msg_body });
    }

    async refundMe(provider: ContractProvider, sender: Sender, value: bigint) {
        const msg_body = beginCell()
            .storeUint(ContractOpcodes.ACCOUNTV3_REFUND_ME, 32) // OP code
        .endCell();

        return await provider.internal(sender, { value, sendMode: SendMode.PAY_GAS_SEPARATELY, body: msg_body });
    }

    /* Getters */       
    async getAccountData(provider: ContractProvider) {
      const { stack } = await provider.get("get_account_data", []);
      return {
          user_address: stack.readAddress(),
          pool_address: stack.readAddress(),
          amount0: stack.readBigNumber(),
          amount1: stack.readBigNumber(), 
          
          enought0: stack.readBigNumber(),
          enought1: stack.readBigNumber()         

      }
    }

    static metaDescription : MetaMessage[] =     
    [
    {
        opcode : ContractOpcodes.ACCOUNTV3_ADD_LIQUIDITY,
        description : "This operation adds liquidity and a minting request to the account. This contract is used as a barrier to " + 
        "collect together data about the proofs of funding two tokens and the request to mint some liquidity. " + 
        "Common usage is as follows - send one jetton with the mint instructions and the second jetton with the mint instructions. And as " +
        "soon as they will both arrive AccountV3 would trigger the minting request in the pool. This makes minting independent of the order in which " +
        "jettons arrive. " + "Account refers to jettons in the pool (account::pool_address) order",
        rights : "This operation is allowed for account::pool_address",
        acceptor : (visitor: StructureVisitor) => {
            visitor.visitField({ name:`op`,             type:`Uint`, size:32,  meta:"op", comment : ""})    
            visitor.visitField({ name:`query_id`,       type:`Uint`, size:64,  meta:"",   comment : "queryid as of the TON documentation"}) 
            visitor.visitField({ name:`new_amount0`,    type:`Coins`,size:124, meta:"",   comment : "Amount of jetton0 that is funded for the mint"}) 
            visitor.visitField({ name:`new_amount1`,    type:`Coins`,size:124, meta:"",   comment : "Amount of jetton1 that is funded for the mint"}) 
            visitor.visitField({ name:`new_enough0`,    type:`Coins`,size:124, meta:"",   comment : "Minimum amount of jetton0 totally collected on the account that is required to start the mint"}) 
            visitor.visitField({ name:`new_enough1`,    type:`Coins`,size:124, meta:"",   comment : "Minimum amount of jetton1 totally collected on the account that is required to start the mint"}) 
            visitor.visitField({ name:`liquidity`,      type:`Uint`, size:128, meta:"",   comment : "Amount of liquidity to mint"})
            visitor.visitField({ name:`tickLower`,      type:`Int`,  size:24,  meta:"",   comment : "lower bound of the range in which to mint"}) 
            visitor.visitField({ name:`tickUpper`,      type:`Int`,  size:24,  meta:"",   comment : "upper bound of the range in which to mint"})   
        }
    },
    {
        opcode : ContractOpcodes.ACCOUNTV3_RESET_GAS,
        name : "ACCOUNTV3_RESET_GAS",
        description : "This operation allows user to get back the gas it too much was sent",
        rights : "This operation is allowed for account::user_address",
        acceptor : (visitor: StructureVisitor) => {
            visitor.visitField({ name:`op`,             type:`Uint`, size:32,  meta:"op", comment: ""})    
            visitor.visitField({ name:`query_id`,       type:`Uint`, size:64,  meta:"",   comment: "queryid as of the TON documentation"}) 
        }
    },
    {
        opcode : ContractOpcodes.ACCOUNTV3_REFUND_ME,
        description : "This operation allows user to get back the coins if sending of the second coin in the mint failed. This method allows to trigger mint of 0 liquidity that "+
        "Would allow to return funds.",
        rights : "This operation is allowed for account::user_address",
        acceptor : (visitor: StructureVisitor) => {
            visitor.visitField({ name:`op`,             type:`Uint`, size:32,  meta:"op", comment: ""})    
            visitor.visitField({ name:`query_id`,       type:`Uint`, size:64,  meta:"",   comment: "queryid as of the TON documentation"}) 
        }
    }
    ]

    static printParsedInput(body: Cell) : ContractMessageMeta[] 
    {
        let result : ContractMessageMeta[] = []
        let p = body.beginParse()
        let op : number  = p.preloadUint(32)

        for (let meta of this.metaDescription) {
            if (op == meta.opcode) {
                let visitor = new ParseDataVisitor
                visitor.visitCell(body as Cell, meta.acceptor)
                result = [...result, ...visitor.result]
            }
        }
        return result;
    }

}
