import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, Slice } from "@ton/core";
import { ContractOpcodes, OpcodesLookup } from "./opCodes";
import { nftContentPackedDefault, nftItemContentPackedDefault } from "./PoolV3Contract";
import { FEE_DENOMINATOR, IMPOSSIBLE_FEE } from "./frontmath/frontMath";
import { BLACK_HOLE_ADDRESS } from "./tonUtils";
import { ContractMessageMeta, MetaMessage, StructureVisitor } from "../scripts/meta/structureVisitor";
import { ContractErrors } from "./opCodes";
import { ParseDataVisitor } from "../scripts/meta/parseDataVisitor";
import { HighloadWalletV3Config, highloadWalletV3ConfigToCell } from "./highload/HighloadWalletV3";


/** Initial data structures and settings **/
export const TIMELOCK_DELAY_DEFAULT : bigint = 2n * 24n * 60n * 60n;

export type RouterV3ContractConfig = {    
    adminAddress : Address,  
    poolAdminAddress? : Address,  
    pTonAddress? : Address, 
    
    poolFactoryAddress : Address,
    flags? : bigint,
    poolv3_code : Cell;    
    accountv3_code : Cell;
    position_nftv3_code : Cell;       

    timelockDelay? : bigint;

    vault? : {
        jetton0_wallet : Address,
        jetton1_wallet : Address,        
        wallet : HighloadWalletV3Config
    }

    nonce? : bigint;
}


export function routerv3ContractConfigToCell(config: RouterV3ContractConfig): Cell {

    
    let vaultCell = null
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
    }

    return beginCell()
        .storeAddress(config.adminAddress)
        .storeAddress(config.poolAdminAddress ?? config.adminAddress) 
        .storeAddress(config.poolFactoryAddress)
        .storeUint(config.flags ?? 0, 64)        
        .storeUint(0, 64)     // seqno 

        .storeRef(beginCell()
            .storeAddress(config.pTonAddress ?? BLACK_HOLE_ADDRESS)
            .storeCoins(0n)

            .storeRef(config.poolv3_code)
            .storeRef(config.accountv3_code)
            .storeRef(config.position_nftv3_code)
        .endCell())   

        .storeRef(beginCell()
            .storeUint(config.timelockDelay ?? TIMELOCK_DELAY_DEFAULT, 64)   // timelock Delay
            .storeUint(0,3)   // 3 maybe refs for active timelocks
        .endCell())
        .storeMaybeRef(vaultCell)
        .storeUint(config.nonce ?? 0, 64)
    .endCell()    
}

export function routerv3ContractCellToConfig(c: Cell): RouterV3ContractConfig {
    let s : Slice = c.beginParse()

    const adminAddress : Address = s.loadAddress()
    const poolAdminAddress   : Address = s.loadAddress()
    const poolFactoryAddress : Address = s.loadAddress()
    const flags = s.loadUintBig(64)
    
    const seqno = s.loadUintBig(64)

    const subcodes = s.loadRef().beginParse();
    const poolv3_code         : Cell = subcodes.loadRef()
    const accountv3_code      : Cell = subcodes.loadRef()
    const position_nftv3_code : Cell = subcodes.loadRef()  
    
    const timelocks = s.loadRef().beginParse();
    const timelockDelay : bigint = timelocks.loadUintBig(64)

    let nonce : bigint | undefined = undefined
    if (s.remainingBits !=0 ) {
        nonce = s.loadUintBig(64)
    }

    return {adminAddress, poolAdminAddress, poolFactoryAddress, flags, poolv3_code, accountv3_code, position_nftv3_code, timelockDelay, nonce}
}

export class RouterV3Contract implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}
  
    static createFromConfig(
        config: RouterV3ContractConfig,
        code: Cell,
        workchain = 0
    ) {
        const data = routerv3ContractConfigToCell(config);
        const init = { code, data };
        const address = contractAddress(workchain, init);  
        return new RouterV3Contract(address, init);
    }
  
    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }


    static deployPoolMessage(
        jetton0WalletAddr: Address,
        jetton1WalletAddr: Address,
        tickSpacing : number,
        sqrtPriceX96: bigint,
        activatePool : boolean,        
        opts: {
            jetton0Minter?: Address,
            jetton1Minter?: Address,
            controllerAddress?: Address,
            adminAddress?: Address,

            nftContentPacked? : Cell,
            nftItemContentPacked? : Cell,

            protocolFee? : number,
            lpFee?       : number,
            currentFee?  : number,
        }
    ) : Cell
    {
        const msg_body : Cell = beginCell()
            .storeUint(ContractOpcodes.ROUTERV3_CREATE_POOL, 32) // OP code
            .storeUint(0, 64) // query_id        
            .storeAddress(jetton0WalletAddr)
            .storeAddress(jetton1WalletAddr)
            .storeUint(tickSpacing , 24)
            .storeUint(sqrtPriceX96, 160)
            .storeUint(activatePool ? 1 : 0, 1)
            .storeUint(opts.protocolFee ? opts.protocolFee  : IMPOSSIBLE_FEE , 16)
            .storeUint(opts.lpFee       ? opts.lpFee        : IMPOSSIBLE_FEE , 16)
            .storeUint(opts.currentFee  ? opts.currentFee   : IMPOSSIBLE_FEE , 16)
            
            .storeRef (beginCell()
                .storeRef (opts.nftContentPacked     ?? nftContentPackedDefault)
                .storeRef (opts.nftItemContentPacked ?? nftItemContentPackedDefault)
            .endCell())

            .storeRef (beginCell()
                .storeAddress(opts.jetton0Minter)
                .storeAddress(opts.jetton1Minter)
            .endCell())

            .storeRef (beginCell()            
                .storeAddress(opts.adminAddress)
                .storeAddress(opts.controllerAddress)
            .endCell())


      .endCell();
      return msg_body;
    }

    /* We need to rework printParsedInput not to double the code */
    static unpackDeployPoolMessage( body : Cell) : {
        jetton0WalletAddr: Address,
        jetton1WalletAddr: Address,
        tickSpacing : number,
        sqrtPriceX96: bigint,
        activatePool : boolean,
        jetton0Minter?: Address,
        jetton1Minter?: Address,
        controllerAddress?: Address,
        adminAddress?: Address,

        nftContentPacked? : Cell,
        nftItemContentPacked? : Cell,

        protocolFee? : number,
        lpFee?       : number,
        currentFee?  : number,
    }
    {
        let s = body.beginParse()
        const op       = s.loadUint(32)
        if (op != ContractOpcodes.ROUTERV3_CREATE_POOL)
            throw Error("Wrong opcode")

        const query_id = s.loadUint(64)
        const jetton0WalletAddr = s.loadAddress()
        const jetton1WalletAddr = s.loadAddress()
        let tickSpacing = s.loadInt(24)
        let sqrtPriceX96 = s.loadUintBig(160)
        let activatePool = (s.loadUint(1) != 0)

        const protocolFeeV = s.loadUint(16)        
        const protocolFee = (protocolFeeV < IMPOSSIBLE_FEE) ? protocolFeeV : undefined        
        const lpFeeV       = s.loadUint(16)
        const lpFee = (lpFeeV < IMPOSSIBLE_FEE) ? lpFeeV : undefined        
        const currentFeeV  = s.loadUint(16)
        const currentFee = (currentFeeV < IMPOSSIBLE_FEE) ? currentFeeV : undefined        

        let contentSlice : Slice = s.loadRef().beginParse()
        let nftContentPacked     = contentSlice.loadRef()
        let nftItemContentPacked = contentSlice.loadRef()

        let mintersSlice = s.loadRef().beginParse()
        let jetton0Minter = mintersSlice.loadAddress()
        let jetton1Minter = mintersSlice.loadAddress()

        let ownersSlice = s.loadRef().beginParse()
        let adminAddress      = ownersSlice.loadAddress()
        let controllerAddress = ownersSlice.loadAddress()

        return {
            jetton0WalletAddr, jetton1WalletAddr,
            tickSpacing,
            sqrtPriceX96,
            activatePool,
            jetton0Minter,
            jetton1Minter,
            controllerAddress,
            adminAddress, 
            nftContentPacked,
            nftItemContentPacked,
            protocolFee,
            lpFee,
            currentFee
        }     
    }

    /* Deploy pool */  
    async sendDeployPool(
      provider: ContractProvider, 
      sender: Sender, 
      value: bigint, 
      jetton0WalletAddr: Address,
      jetton1WalletAddr: Address,
      tickSpacing : number,
      sqrtPriceX96: bigint,
      activatePool : boolean,
      opts: {
          jetton0Minter?: Address,
          jetton1Minter?: Address,
          adminAddress?: Address,
          controllerAddress?: Address,

          nftContentPacked? : Cell,
          nftItemContentPacked? : Cell,
          
          protocolFee? : number,
          lpFee?       : number,
          currentFee?  : number,
      }

    ) {
      const msg_body = RouterV3Contract.deployPoolMessage(jetton0WalletAddr, jetton1WalletAddr, tickSpacing, sqrtPriceX96, activatePool, opts)
      await provider.internal(sender, { value, sendMode: SendMode.PAY_GAS_SEPARATELY, body: msg_body });
    }


    async sendResetGas(provider: ContractProvider, sender: Sender, value: bigint) {
        const msg_body = beginCell()
            .storeUint(ContractOpcodes.ROUTERV3_RESET_GAS, 32) // OP code
            .storeUint(0, 64) // QueryID what for?
        .endCell();

        return await provider.internal(sender, { value, sendMode: SendMode.PAY_GAS_SEPARATELY, body: msg_body });
    }

    /* =============  CHANGE ADMIN =============  */

    static changeAdminStartMessage(opts: {
        newCode? : Cell
        newAdmin? : Address,
        newFlags? : bigint
    }) : Cell {
        let msg = beginCell()
            .storeUint(ContractOpcodes.ROUTERV3_CHANGE_ADMIN_START, 32) // OP code
            .storeUint(0, 64) // QueryID what for?

        if (opts.newAdmin == undefined) {
            msg.storeUint(0,1)
            msg.storeAddress(null)
        } else {
            msg.storeUint(1,1)
            msg.storeAddress(opts.newAdmin)    
        }
    
        if (opts.newFlags == undefined) {
            msg.storeUint(0,1)
            msg.storeUint(0,64)
        } else {
            msg.storeUint(1,1)
            msg.storeUint(opts.newFlags, 64)    
        }

        if (opts.newCode == undefined) {        
            msg.storeUint(0,1)
        } else {  
            msg.storeMaybeRef(opts.newCode)
        }
        return msg.endCell();
    }

    static unpackChangeAdminStartMessage( body :Cell) : {  
        newCode? : Cell
        newAdmin? : Address,
        newFlags? : bigint 
    }
    {
        let s = body.beginParse()
        const op       = s.loadUint(32)
        if (op != ContractOpcodes.ROUTERV3_CHANGE_ADMIN_START)
            throw Error("Wrong opcode")

        const query_id = s.loadUint(64)

        const setAdmin = s.loadBoolean()
        const newAdmin = (setAdmin) ? s.loadAddress() : undefined
        if (!setAdmin) { s.loadUint(2) }

        const setFlags = s.loadBoolean()
        const newFlags = (setFlags) ? s.loadUintBig(64) : undefined
        if (!setFlags) { s.loadUintBig(64) }

        const newCodeV = s.loadMaybeRef()
        const newCode = (newCodeV != null) ? newCodeV : undefined

        return {newAdmin, newFlags, newCode}
    }

    async sendChangeAdminStart(provider: ContractProvider, sender: Sender, value: bigint, 
        opts: {
            newCode? : Cell
            newAdmin? : Address,
            newFlags? : bigint
        }) {
        const msg_body = RouterV3Contract.changeAdminStartMessage(opts)
        return await provider.internal(sender, { value, sendMode: SendMode.PAY_GAS_SEPARATELY, body: msg_body });
    }

    static changeAdminCommitMessage() : Cell {
        let msg = beginCell()
            .storeUint(ContractOpcodes.ROUTERV3_CHANGE_ADMIN_COMMIT, 32) // OP code
            .storeUint(0, 64) // QueryID what for?
        .endCell()          
        return msg;
    }

    static unpackChangeAdminCommitMessage( body :Cell) : {  }
    {
        let s = body.beginParse()
        const op       = s.loadUint(32)
        if (op != ContractOpcodes.ROUTERV3_CHANGE_ADMIN_COMMIT)
            throw Error("Wrong opcode")
        const query_id = s.loadUint(64)
        return {}
    }

    async sendChangeAdminCommit(provider: ContractProvider, sender: Sender, value: bigint) {
        const msg_body = RouterV3Contract.changeAdminCommitMessage()
        return await provider.internal(sender, { value, sendMode: SendMode.PAY_GAS_SEPARATELY, body: msg_body });
    }

    /* =============  CHANGE PARAMS =============  */

    static changeRouterParamMessage(opts : {
        newPoolAdmin? : Address,
        newPoolFactory? : Address,
     //   newFlags? : bigint
    } ) : Cell {
        return beginCell()
            .storeUint(ContractOpcodes.ROUTERV3_CHANGE_PARAMS, 32) // OP code
            .storeUint(0, 64) // QueryID what for?           
            .storeUint(opts.newPoolFactory ? 1 : 0, 1)
            .storeAddress(opts.newPoolFactory ?? BLACK_HOLE_ADDRESS)
            .storeUint(opts.newPoolAdmin ? 1 : 0, 1)
            .storeAddress(opts.newPoolAdmin ?? BLACK_HOLE_ADDRESS)            
        .endCell();
    }

    static unpackChangeRouterParamMessage( body :Cell) : {
        newPoolAdmin? : Address        
        newPoolFactory? : Address
    }
    {
        let s = body.beginParse()
        const op       = s.loadUint(32)
        if (op != ContractOpcodes.ROUTERV3_CHANGE_PARAMS)
            throw Error("Wrong opcode")

        const query_id = s.loadUint(64)
        const hasPoolFactory = s.loadBit()      
        const newPoolFactoryV = s.loadAddress()
        const newPoolFactory = hasPoolFactory ? newPoolFactoryV : undefined

        const hasPoolAdmin = s.loadBit()
        const newPoolAdminV = s.loadAddress()
        const newPoolAdmin = hasPoolAdmin ? newPoolAdminV : undefined
        
        return {newPoolAdmin, newPoolFactory}
    }

    async sendChangeRouterParams(provider: ContractProvider, sender: Sender, value: bigint, 
        opts : {
            newPoolAdmin? : Address        
            newPoolFactory? : Address           
        }
    ) {
        const msg_body = RouterV3Contract.changeRouterParamMessage(opts)
        return await provider.internal(sender, { value, sendMode: SendMode.PAY_GAS_SEPARATELY, body: msg_body });
    }

    /* =============  EMERGENCY RECOVERY =============  */
    static emergencyRecoveryMessage(opts : {
        target0 : Address,
        target1 : Address,
        exit_code? : bigint
        seqno? : bigint,                
        jetton0Wallet? : Address, 
        jetton0Amount? : bigint,
        jetton1Wallet? : Address, 
        jetton1Amount? : bigint,        
    } ) : Cell {
        return beginCell()
            .storeUint(ContractOpcodes.ROUTERV3_PAY_TO, 32) // OP code
            .storeUint(0, 64) // QueryID what for?           
            .storeAddress(opts.target0)
            .storeAddress(opts.target1)                
            .storeUint (opts.exit_code ?? 0, 32)
            .storeUint (opts.seqno ?? 0, 64)
            .storeUint(1, 1) // Coins info
            .storeUint(0, 1) // Indexer info
            .storeRef(beginCell()    // 124 + 267 + 124 + 267 = 782
                .storeCoins  (opts.jetton0Amount ?? 0)
                .storeAddress(opts.jetton0Wallet ?? null)
                .storeCoins  (opts.jetton1Amount ?? 0)
                .storeAddress(opts.jetton1Wallet ?? null)
            .endCell())
        .endCell();
    } 

    static unpackEmergencyRecoveryMessage(body :Cell)  
    {
        let s = body.beginParse()
        const op       = s.loadUint(32)
        if (op != ContractOpcodes.ROUTERV3_PAY_TO)
            throw Error("Wrong opcode")
        const query_id = s.loadUint(64)
        let target0 = s.loadAddressAny();
        let target1 = s.loadAddressAny();

        let exit_code  = s.loadUint(32);
        let seqno = s.loadUint(64);
        let has_coins  = s.loadUint(1);
        
        let coinsSlice     = s.loadRef().beginParse();

        let jetton0Amount = coinsSlice.loadCoins();
        let jetton0Wallet = coinsSlice.loadAddressAny();
        let jetton1Amount = coinsSlice.loadCoins();
        let jetton1Wallet = coinsSlice.loadAddressAny();

        return {
            target0, target1, exit_code, seqno, jetton0Amount, jetton0Wallet, jetton1Amount, jetton1Wallet
        }
    }

    async sendEmergencyRecoveryMessage(provider: ContractProvider, sender: Sender, value: bigint, 
        opts : {
            target0 : Address,
            target1 : Address,
            exit_code? : bigint
            seqno? : bigint,                
            jetton0Wallet? : Address, 
            jetton0Amount? : bigint,
            jetton1Wallet? : Address, 
            jetton1Amount? : bigint,        
        }
    ) {
        const msg_body = RouterV3Contract.emergencyRecoveryMessage(opts)
        return await provider.internal(sender, { value, sendMode: SendMode.PAY_GAS_SEPARATELY, body: msg_body });
    }

    /** Getters **/
    async getState(provider: ContractProvider) {
        const { stack } = await provider.get("getRouterState", []);
        return {
            admin       : stack.readAddress(),
            pool_admin  : stack.readAddress(),            
            pool_factory: stack.readAddress(),
            flags       : stack.readBigNumber(),
            pool_seqno  : stack.readBigNumber()
        }
    }
    
    async getAdminAddress(provider: ContractProvider) : Promise<Address> {
        const state = await this.getState(provider)
        return state.admin;
    }

    async getPoolFactoryAddress(provider: ContractProvider) : Promise<Address> {
        const state = await this.getState(provider)
        return state.pool_factory;
    }
  

    async getPoolAddress(provider: ContractProvider, jetton0WalletAddr: Address, jetton1WalletAddr: Address) : Promise<Address> {
      const { stack } = await provider.get("getPoolAddress", 
        [
          { type: 'slice', cell: beginCell().storeAddress(jetton0WalletAddr).endCell() },
          { type: 'slice', cell: beginCell().storeAddress(jetton1WalletAddr).endCell() }
        ]);
      return stack.readAddress();
    }


    async getChildContracts(provider: ContractProvider)  {
      const { stack } = await provider.get("getChildContracts", []);
      return {
          poolCode        : stack.readCell(),
          accountCode     : stack.readCell(),
          positionNFTCode : stack.readCell()
      };
    }
  

    async getPoolInitialData(provider: ContractProvider, jetton0WalletAddr: Address, jetton1WalletAddr: Address) : Promise<Cell> {
      const { stack } = await provider.get("getPoolInitialData", [
        { type: 'slice', cell: beginCell().storeAddress(jetton0WalletAddr).endCell() },
        { type: 'slice', cell: beginCell().storeAddress(jetton1WalletAddr).endCell() }
      ]);
      return stack.readCell();
    }

    async getPoolStateInit(provider: ContractProvider, jetton0WalletAddr: Address, jetton1WalletAddr: Address) : Promise<Cell> {
      const { stack } = await provider.get("getPoolStateInit", [
        { type: 'slice', cell: beginCell().storeAddress(jetton0WalletAddr).endCell() },
        { type: 'slice', cell: beginCell().storeAddress(jetton1WalletAddr).endCell() }
      ]);
      return stack.readCell();
    }


    static metaDescription : MetaMessage[] =     
    [
    {
        opcode : ContractOpcodes.JETTON_TRANSFER_NOTIFICATION,
        description : "Process router funding, payload determines if it is mint or swap",

        acceptor : (visitor: StructureVisitor) => {
            visitor.visitField({ name:`op`,              type:`Uint`,    size:32,   meta:"op", comment: ""})    
            visitor.visitField({ name:`query_id`,        type:`Uint`,    size:64,   meta:"",   comment: "queryid as of the TON documentation"}) 
            visitor.visitField({ name:`jetton_amount`,   type:`Coins`,   size:124,  meta:"",   comment: "Amount of coins sent to the router"}) 
            visitor.visitField({ name:`from_user`,       type:`Address`, size:267,  meta:"",   comment: "User that originated the transfer"})
            visitor.visitField({ name:`forward_payload`, type:`Cell`,    size:0,    meta:"Either, Payload",comment: "Payload for processing"}) 
        }
    },   
    {
        opcode : ContractOpcodes.ROUTERV3_CREATE_POOL,
        description : "Operation that deploys and inits new [Pool](pool.md) contract for two given jettons identified by their wallets. New pool would reorder the jettons to match the " + 
              "invariant `slice_hash(jetton0_address) > slice_hash(jetton1_address).`",
        acceptor : (visitor: StructureVisitor) => {
            visitor.visitField({ name:`op`,               type:`Uint`,    size:32,  meta:"op", comment: ""})    
            visitor.visitField({ name:`query_id`,         type:`Uint`,    size:64,  meta:"",   comment: "queryid as of the TON documentation"}) 
            visitor.visitField({ name:`jetton_wallet0`,   type:`Address`, size:267, meta:"",   comment: "Address of the jetton0 wallet. Used to compute pool address"})
            visitor.visitField({ name:`jetton_wallet1`,   type:`Address`, size:267, meta:"",   comment: "Address of the jetton1 wallet. Used to compute pool address"})
            visitor.visitField({ name:`tick_spacing`,     type:`Int`,     size:24,  meta : "", comment : "Tick spacing to be used in the pool"})
            visitor.visitField({ name:`initial_priceX96`, type:`Uint`,    size:160, meta:"PriceX96", comment: "Initial price for the pool"}) 

            visitor.visitField({ name:`protocol_fee`,     type:`Uint`, size:16, meta:"Fee" , comment: `Liquidity provider fee. base in FEE_DENOMINATOR parts. If value is more than ${FEE_DENOMINATOR} value would be default`}) 
            visitor.visitField({ name:`lp_fee_base`,      type:`Uint`, size:16, meta:"Fee" , comment: `Protocol fee in FEE_DENOMINATOR. If value is more than ${FEE_DENOMINATOR} value would be default`}) 
            visitor.visitField({ name:`lp_fee_current`,   type:`Uint`, size:16, meta:"Fee" , comment: `Current value of the pool fee, in case of dynamic adjustment. If value is more than ${FEE_DENOMINATOR} value would be default`})

            visitor.enterCell( { name: "content_cell",   type:"", comment : "Cell With Subcontent"})
            visitor.visitField({ name:`nftv3_content`    , type:`Cell`, meta: `Metadata`, size:0, comment: "Metadata for the NFT Collection" })
            visitor.visitField({ name:`nftv3item_content`, type:`Cell`, meta: `Metadata`, size:0, comment: "Metadata for the NFT Item" })
            visitor.leaveCell({})

            visitor.enterCell( { name: "minter_cell",   type:"", comment : "Cell With Minters"})
            visitor.visitField({ name:`jetton0_minter`, type:`Address`, size:267, meta:"", comment: "Address of the jetton0 minter, used by indexer and frontend"})
            visitor.visitField({ name:`jetton1_minter`, type:`Address`, size:267, meta:"", comment: "Address of the jetton1 minter, used by indexer and frontend"})           
            visitor.leaveCell({})

            visitor.enterCell( { name: "owners_cell",   type:"", comment : "Cell With Owners"})            
            visitor.visitField({ name:`admin_addr`,     type:`Address`, size:267, meta:"", comment: "Address that is allowed to get protocol fee. could be 00b then router values will be used"})
            visitor.visitField({ name:`controller_addr`,type:`Address`, size:267, meta:"", comment: "Address that is allowed to change the fee. Can always be updated by admin. could be 00b"})
            visitor.leaveCell({})

        }
    },
    {
        opcode : ContractOpcodes.POOLV3_FUND_ACCOUNT,
        description : "This is not a message Op this is a payload format for JETTON_TRANSFER_NOTIFICATION",

        acceptor : (visitor: StructureVisitor) => {
            visitor.visitField({ name:`op`,               type:`Uint`,    size:32,  meta:"op", comment: ""})    
            visitor.visitField({ name:`jetton_target_w`,  type:`Address`, size:267, meta:"",   comment: "Address of the jetton wallet. Used to compute pool address"})
           
            visitor.visitField({ name:`enough0`   , type:`Coins`,   size:124, meta:"",   comment : ""}) 
            visitor.visitField({ name:`enough1`   , type:`Coins`,   size:124, meta:"",   comment : ""}) 
            visitor.visitField({ name:`liquidity` , type:`Uint`,    size:128, meta:"",   comment : "Amount of liquidity to mint"})
            visitor.visitField({ name:`tickLower` , type:`Int`,     size:24,  meta:"",   comment : "lower bound of the range in which to mint"}) 
            visitor.visitField({ name:`tickUpper` , type:`Int`,     size:24,  meta:"",   comment : "upper bound of the range in which to mint"})  
            visitor.enterCell( { name:"referral_cell",  type:`IfExists`, comment : "Cell with referral data"})
                visitor.visitField({ name:`referral_code`,  type:`Uint`,    size:32,  meta:"",  comment: ""}) 
                visitor.predicateStart( { action : "=", arg1: "referral_code", arg2: 0x5453544B})
                visitor.visitField({ name:`referral_address`,      type:`Address`, size:267, meta:"",        comment: "Address of the referrer"})
                visitor.predicateEnd()
            visitor.leaveCell({})
        }
    },
    {
        opcode : ContractOpcodes.POOLV3_SWAP,
        description : "This is not a message Op this is a payload format for JETTON_TRANSFER_NOTIFICATION" + 
        "",

        acceptor : (visitor: StructureVisitor) => {
            visitor.visitField({ name:`op`,                  type:`Uint`,    size:32,  meta:"op",  comment: ""})   
            visitor.visitField({ name:`target_jetton_wallet`,type:`Address`, size:267, meta:"",    comment:""})  
            visitor.visitField({ name:`sqrtPriceLimitX96`,   type:`Uint`,    size:160, meta:"PriceX96", comment: "Limit price. Swap won't go beyond it"}) 
            visitor.visitField({ name:`minOutAmount`,        type:`Coins`,   size:124, meta:"",    comment : ""}) 
            visitor.visitField({ name:`owner_address`,       type:`Address`, size:267, meta:"",    comment: "Address of the sender"})
           
            visitor.enterCell( { name:"multihop_cell",       type:`Maybe`, comment : "Cell with multihop data"})
            visitor.visitField({ name:`target_address`,      type:`Address`, size:267, meta:"",        comment: "Address of the reciever"})
            visitor.visitField({ name:`ok_forward_amount`,   type:`Coins`,   size:124, meta:"",        comment : ""}) 
            visitor.visitField({ name:`ok_forward_payload`,  type:`Cell`,    size:0,   meta:"Payload", comment: "Payload for processing by target with swapped coins"}) 
            visitor.visitField({ name:`ret_forward_amount`,  type:`Coins`,   size:124, meta:"",        comment : ""}) 
            visitor.visitField({ name:`ret_forward_payload`, type:`Cell`,    size:0,   meta:"Payload", comment: "Payload for processing by owner with change/return coins"}) 
            visitor.leaveCell({})
            visitor.enterCell( { name:"referral_cell",       type:`IfExists`, comment : "Cell with referral data"})
            visitor.visitField({ name:`code`,                type:`Uint`,    size:32,  meta:"",  comment: ""})               
            visitor.leaveCell({})
        }
    },   
    {
        opcode : ContractOpcodes.ROUTERV3_PAY_TO,
        description : "This is not a message Op this is a payload format for JETTON_TRANSFER_NOTIFICATION",  
        acceptor : (visitor: StructureVisitor) => {
            visitor.visitField({ name:`op`,        type:`Uint`,    size:32,  meta:"op", comment: ""})    
            visitor.visitField({ name:`query_id`,  type:`Uint`,    size:64,  meta:"",   comment: "queryid as of the TON documentation"}) 
            visitor.visitField({ name:`reciever0`, type:`Address`, size:267, meta:"",   comment: "Address of the first reciever of the funds"})
            visitor.visitField({ name:`reciever1`, type:`Address`, size:267, meta:"",   comment: "Address of the second reciever of the funds"})

            visitor.visitField({ name:`exit_code`, type:`Uint`,    size:32,  meta:"",   comment: "queryid as of the TON documentation"}) 
            visitor.visitField({ name:`seqno`   ,  type:`Uint`,    size:64,  meta:"Indexer",   comment: "queryid as of the TON documentation"}) 
            visitor.enterCell( { name:"coinsinfo_cell",  type:`Maybe`,  comment : "Cell with info about the coins"})
                visitor.visitField({ name:`amount0`,         type:`Coins`,    size:124,  meta:"", comment : "Amount of coins to be payed to reciever0"}) 
                visitor.visitField({ name:`jetton0_address`, type:`Address`,  size:267,  meta:"", comment : "Jetton to be sent to reciever0 identified by the wallet that belongs to router"}) 
                visitor.visitField({ name:`amount1`,         type:`Coins`,    size:124,  meta:"", comment : "Amount of coins to be payed to reciever1"}) 
                visitor.visitField({ name:`jetton1_address`, type:`Address`,  size:267,  meta:"", comment:  "Jetton to be sent to reciever1 identified by the wallet that belongs to router"}) 
                visitor.enterCell( { name:"indexer_swap_info_cell",  type:`IfExists`, comment : "Information about the payload"})
                    visitor.visitField({ name:`payload_amount0`,  type:`Coins`, size:124, meta:""     , comment: ""}) 
                    visitor.visitField({ name:`payload_0`,        type:`Cell`,  size:1,   meta:"Maybe, Payload", comment: ""}) 
                    visitor.visitField({ name:`payload_amount1`,  type:`Coins`, size:124, meta:""     , comment: ""})   
                    visitor.visitField({ name:`payload_1`,        type:`Cell`,  size:1,   meta:"Maybe, Payload", comment: ""})                   
                visitor.leaveCell({})
            visitor.leaveCell({})

            //visitor.visitField({ name:`indexerinfo_cell`, type:`Cell`, meta: `Maybe`, size:0, comment: "Information for indexer to process" })

            visitor.predicateStart( { action : "=", arg1: "exit_code", arg2: RouterV3Contract.RESULT_SWAP_OK})
            visitor.enterCell( { name:"indexer_swap_info_cell",  type:`Maybe`, comment : "Information for indexer to process after the swap"})
                visitor.visitField({ name:`liquidity` ,           type:`Uint`, size:128, meta:"Indexer",          comment: "Post-swap concentrated liquidity at current tick" })   
                visitor.visitField({ name:`price_sqrt`,           type:`Uint`, size:160, meta:"Indexer,PriceX96", comment: "Post-swap square root of the  price stored as fixed point 64.96" }) 
                visitor.visitField({ name:`tick`,                 type:`Int`,  size:24,  meta:"Indexer",          comment: "Post-swap current tick" })
                visitor.visitField({ name:`feeGrowthGlobal0X128`, type:`Int`,  size:256, meta:"Indexer",          comment: "Current range fee per unit of the liquidity for jetton0" })
                visitor.visitField({ name:`feeGrowthGlobal1X128`, type:`Int`,  size:256, meta:"Indexer",          comment: "Current range fee per unit of the liquidity for jetton1" })   
            visitor.leaveCell({})
            visitor.predicateEnd()

            visitor.predicateStart( { action : "=", arg1: "exit_code", arg2: RouterV3Contract.RESULT_BURN_OK})
            visitor.enterCell( { name:"indexer_burn_info_cell",  type:`Maybe`, comment : "Information for indexer to process after the burn"})
                visitor.visitField({ name:`nftIndex`,        type:`Uint`, size:64,  meta:"Indexer", comment:"Nft index that is burned"})      
                visitor.visitField({ name:`liquidityBurned`, type:`Uint`, size:128, meta:"Indexer", comment:"Amount of liquidity burned"}) 
                visitor.visitField({ name:`tickLower`,       type:`Int`,  size:24,  meta:"Indexer", comment:"Lower tick of the range in which liquidity was burned"})
                visitor.visitField({ name:`tickUpper`,       type:`Int`,  size:24,  meta:"Indexer", comment:"Upper tick of the range in which liquidity was burned"})
                visitor.visitField({ name:`tick`,            type:`Int`,  size:24,  meta:"Indexer", comment:"Post-burn current tick"})   
            visitor.leaveCell({})
            visitor.predicateEnd()            
        }
    },
    {
        opcode : ContractOpcodes.ROUTERV3_RESET_GAS,
        name : "ROUTERV3_RESET_GAS",
        description : "This operation allows router owners the gas if too much accumulated on the contract",      
        rights : "This operation is allowed for router::admin_address",
        acceptor : (visitor: StructureVisitor) => {
            visitor.visitField({ name:`op`,               type:`Uint`,    size:32,  meta:"op", comment: ""})    
            visitor.visitField({ name:`query_id`,         type:`Uint`,    size:64,  meta:"",   comment: "queryid as of the TON documentation"})     
        }
    },
    {
        opcode : ContractOpcodes.ROUTERV3_CHANGE_ADMIN_START,
        access: "private",
        description : "",
        acceptor : (visitor: StructureVisitor) => {
            visitor.visitField({ name:`op`,         type:`Uint`,    size:32,  meta:"op", comment: ""})    
            visitor.visitField({ name:`query_id`,   type:`Uint`,    size:64,  meta:"",   comment: "queryid as of the TON documentation"})     
            visitor.visitField({ name:`new_admin`,  type:`Address`, size:267 , meta : ""  , comment : "NFT owner "})
        }
    },
    {
        opcode : ContractOpcodes.ROUTERV3_CHANGE_ADMIN_COMMIT,
        access: "private",
        description : "",
        acceptor : (visitor: StructureVisitor) => {
            visitor.visitField({ name:`op`,               type:`Uint`,    size:32,  meta:"op", comment: ""})    
            visitor.visitField({ name:`query_id`,         type:`Uint`,    size:64,  meta:"",   comment: "queryid as of the TON documentation"})     
        }
    },
    {
        opcode : ContractOpcodes.JETTON_EXCESSES,
        description : "",
        acceptor : (visitor: StructureVisitor) => {
            visitor.visitField({ name:`op`,               type:`Uint`,    size:32,  meta:"op", comment: ""})    
            visitor.visitField({ name:`query_id`,         type:`Uint`,    size:64,  meta:"",   comment: "queryid as of the TON documentation"})     
        }
    },

    ]


    public static RESULT_SWAP_OK = ContractErrors.POOLV3_RESULT_SWAP_OK;
    public static RESULT_BURN_OK = ContractErrors.POOLV3_RESULT_BURN_OK;

    static printParsedInput(body: Cell) : ContractMessageMeta[] {

        let result : ContractMessageMeta[] = []
        let p = body.beginParse()
        let op : number  = p.preloadUint(32)

        for (let meta of this.metaDescription) {
            if (op == meta.opcode) {
                console.log(`Processing ${OpcodesLookup[op]}`)
                let visitor = new ParseDataVisitor
                visitor.visitCell(body, meta.acceptor)
                result = [...result, ...visitor.result]
            }
        }
        return result;
    }
}
