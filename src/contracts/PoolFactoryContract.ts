import { Address, beginCell, Builder, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, Slice } from "@ton/core";
import { ContractOpcodes } from "./opCodes";
import { ContractMessageMeta, MetaMessage, StructureVisitor } from "./meta/structureVisitor";
import { ParseDataVisitor } from "./meta/parseDataVisitor";


export type PoolFactoryContractConfig = {    
    adminAddress  : Address,  
    routerAddress : Address,  
    tonPrice? : bigint,

    privilegeAddress0? : Address,
    privilegeAddress1? : Address,
    
    poolAdminAddress? : Address,    
    poolControllerAddress? : Address,    

    orderCode : Cell,
    nftv3Content  : Cell,
    nftv3itemContent : Cell
}


export function poolFactoryContractConfigToCell(config: PoolFactoryContractConfig): Cell {

    const privilegeAddress0 = config.privilegeAddress0  ?? config.adminAddress

    return beginCell()
        .storeAddress(config.adminAddress)
        .storeAddress(config.routerAddress)
        .storeCoins(config.tonPrice ?? 0)

        .storeRef( beginCell()
            .storeRef(config.orderCode)
            .storeRef(config.nftv3Content)
            .storeRef(config.nftv3itemContent)
        .endCell())
        .storeRef( beginCell()
            .storeAddress(privilegeAddress0)
            .storeAddress(config.privilegeAddress1 ?? privilegeAddress0)            
        .endCell())
        .storeRef( beginCell()
            .storeAddress(config.poolAdminAddress      ?? privilegeAddress0)
            .storeAddress(config.poolControllerAddress ?? privilegeAddress0)            
        .endCell())
    .endCell()
}

export function poolFactoryContractCellToConfig(data: Cell): PoolFactoryContractConfig {

    let config : Partial<PoolFactoryContractConfig> = {}

    const ds : Slice = data.beginParse()
    config.adminAddress  = ds.loadAddress()
    config.routerAddress = ds.loadAddress()
    config.tonPrice      = ds.loadCoins()

    const subcontacts : Slice = ds.loadRef().beginParse()
        config.orderCode        = subcontacts.loadRef()
        config.nftv3Content     = subcontacts.loadRef()
        config.nftv3itemContent = subcontacts.loadRef()

    const privilege : Slice = ds.loadRef().beginParse()
        config.privilegeAddress0 = privilege.loadAddress()
        config.privilegeAddress1 = privilege.loadAddress()


    const poolsRoles : Slice = ds.loadRef().beginParse()
        config.poolAdminAddress      = poolsRoles.loadAddress()
        config.poolControllerAddress = poolsRoles.loadAddress()


    return config as PoolFactoryContractConfig
}

export class PoolFactoryContract implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}
  
    static createFromConfig(
        config: PoolFactoryContractConfig,
        code: Cell,
        workchain = 0
    ) {
        const data = poolFactoryContractConfigToCell(config);
        const init = { code, data };
        const address = contractAddress(workchain, init);  
        return new PoolFactoryContract(address, init);
    }
  
    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }



    static deployPoolMessage(
        jetton0Minter: Address,
        jetton1Minter: Address,
        sqrtPriceX96: bigint,
        settings : bigint,
        jetton0Wallet: Address,
        jetton1Wallet: Address,
        privilege? : {
            tick_spacing  : number,
            activate_pool : boolean,
            protocol_fee  : number,
            lp_fee_base   : number,
            lp_fee        : number
        }
    ) : Cell
    {
        console.log("deployPoolMessage(): Minter0 ", jetton0Minter)
        console.log("deployPoolMessage(): Minter1 ", jetton1Minter)

        let msg_body : Builder = beginCell()
            .storeUint(ContractOpcodes.POOL_FACTORY_CREATE_POOL, 32) // OP code
            .storeUint(0, 64) // query_id
            .storeAddress(jetton0Minter)
            .storeAddress(jetton1Minter)
            .storeUint(sqrtPriceX96, 160)
            .storeUint(settings, 16)
            .storeRef( beginCell()
                .storeAddress(jetton0Wallet)
                .storeAddress(jetton1Wallet)
            .endCell());

        if (privilege) {
            msg_body = msg_body
                .storeUint(privilege.tick_spacing , 24)
                .storeUint(privilege.activate_pool ? 1 : 0,  1)
                .storeUint(privilege.protocol_fee , 16)
                .storeUint(privilege.lp_fee_base  , 16)
                .storeUint(privilege.lp_fee       , 16)
    
        }

        return msg_body.endCell();
    }

    /* We need to rework printParsedInput not to double the code */
    static unpackDeployPoolMessage( body : Cell) : {
        jetton0Minter: Address,
        jetton1Minter: Address,
        sqrtPriceX96: bigint,
        settings : bigint,
        jetton0Wallet: Address,
        jetton1Wallet: Address,
    }
    {
        let s = body.beginParse()
        const op       = s.loadUint(32)
        if (op != ContractOpcodes.ROUTERV3_CREATE_POOL)
            throw Error("Wrong opcode")

        const query_id = s.loadUint(64)
        const jetton0Minter = s.loadAddress()
        const jetton1Minter = s.loadAddress()
        const sqrtPriceX96 = s.loadUintBig(160)
        const settings = s.loadUintBig(16)

        const wallets = s.loadRef().beginParse()
        const jetton0Wallet = wallets.loadAddress()
        const jetton1Wallet = wallets.loadAddress()
     
        return {
            jetton0Minter,
            jetton1Minter,
            sqrtPriceX96,
            settings,
            jetton0Wallet,
            jetton1Wallet,
        }     
    }

    /* Deploy pool */  
    async sendDeployPool(
        provider: ContractProvider, 
        sender: Sender, 
        value: bigint, 
        jetton0Minter: Address,
        jetton1Minter: Address,
        sqrtPriceX96: bigint,
        settings : bigint,
        jetton0Wallet: Address,
        jetton1Wallet: Address,  
        privilege? : {
            tick_spacing  : number,
            activate_pool : boolean,
            protocol_fee  : number,
            lp_fee_base   : number,
            lp_fee        : number
        }  
    ) {
      const msg_body = PoolFactoryContract.deployPoolMessage(jetton0Minter, jetton1Minter, sqrtPriceX96, settings, jetton0Wallet, jetton1Wallet, privilege)
      await provider.internal(sender, { value, sendMode: SendMode.PAY_GAS_SEPARATELY, body: msg_body });
    }

    async sendNewData(
        provider: ContractProvider, 
        via: Sender, 
        value: bigint,
        routerAddress : Address,
        nftv3Content? : Cell,
        nftv3itemContent? : Cell
    ) {
        await provider.internal(via, {
            value: value,
            body: beginCell()
                .storeUint(ContractOpcodes.POOL_FACTORY_CHANGE_PARAMS, 32) // op
                .storeUint(0, 64)                                          // query id
                .storeAddress(routerAddress)
                .storeRef(nftv3Content ?? Cell.EMPTY)
                .storeRef(nftv3itemContent ?? Cell.EMPTY)
            .endCell()
        })
    }

/*START_POOL_FACTORY_CHANGE_ADMIN*/ 
    static factoryChangeAdminMessage(
        admin : Address | null,
        privilege_address0 : Address | null,
        privilege_address1 : Address | null,
    ) : Cell {
        let body : Cell = beginCell()
            .storeUint(ContractOpcodes.POOL_FACTORY_CHANGE_ADMIN, 32) // OP code
            .storeUint(0, 64) // query_id
            .storeAddress(admin        )
            .storeAddress(privilege_address0 )
            .storeAddress(privilege_address1 )
        .endCell()
        return body
    }
    
    static unpackFactoryChangeAdminMessage( body : Cell ) : {
        admin : Address | null,
        privilege_address0 : Address | null,
        privilege_address1 : Address | null,
    }{
        let s = body.beginParse()
        const op       = s.loadUint(32)
        if (op != ContractOpcodes.POOL_FACTORY_CHANGE_ADMIN) {
            throw Error("Wrong opcode")
        }
        const query_id = s.loadUint(64)
        const admin        = s.loadAddress()
        const privilege_address0 = s.loadAddress()
        const privilege_address1 = s.loadAddress()
        return {admin, privilege_address0, privilege_address1}
    }
    
    async sendFactoryChangeAdmin(provider: ContractProvider, via: Sender, value: bigint, 
        admin : Address | null,
        privilege_address0 : Address | null,
        privilege_address1 : Address | null,
    ) {
        await provider.internal(via, { 
            value, 
            sendMode: SendMode.PAY_GAS_SEPARATELY, 
            body: PoolFactoryContract.factoryChangeAdminMessage(admin, privilege_address0, privilege_address1)
        })
    } 
/*END_POOL_FACTORY_CHANGE_ADMIN*/

/*START_POOL_FACTORY_CHANGE_PARAMS*/
    static factoryChangeParamsMessage(
       router_address : Address | null,
       pool_admin_address : Address | null,
       pool_controller_address : Address | null,
       nftv3_content : Cell,
       nftv3item_content : Cell,
    ) : Cell {
        let body : Cell = beginCell()
            .storeUint(ContractOpcodes.POOL_FACTORY_CHANGE_PARAMS, 32) // OP code
            .storeUint(0, 64) // query_id
            .storeAddress(router_address )
            .storeAddress(pool_admin_address )
            .storeAddress(pool_controller_address )
            .storeRef(nftv3_content )
            .storeRef(nftv3item_content )
        .endCell()
        return body
    }
    
    static unpackFactoryChangeParamsMessage( body : Cell ) : {
       router_address : Address | null,
       pool_admin_address : Address | null,
       pool_controller_address : Address | null,
       nftv3_content : Cell,
       nftv3item_content : Cell,
    }{
        let s = body.beginParse()
        const op       = s.loadUint(32)
        if (op != ContractOpcodes.POOL_FACTORY_CHANGE_PARAMS) {
            throw Error("Wrong opcode")
        }
        const query_id = s.loadUint(64)
        const router_address = s.loadAddress()
        const pool_admin_address = s.loadAddress()
        const pool_controller_address = s.loadAddress()
        const nftv3_content = s.loadRef()
        const nftv3item_content = s.loadRef()
        return {router_address, pool_admin_address, pool_controller_address, nftv3_content, nftv3item_content}
    }
    
    async sendFactoryChangeParams(provider: ContractProvider, via: Sender, value: bigint, 
       router_address : Address | null,
       pool_admin_address : Address | null,
       pool_controller_address : Address | null,
       nftv3_content : Cell,
       nftv3item_content : Cell,
    ) {
        await provider.internal(via, { 
            value, 
            sendMode: SendMode.PAY_GAS_SEPARATELY, 
            body: PoolFactoryContract.factoryChangeParamsMessage(router_address, pool_admin_address, pool_controller_address, nftv3_content, nftv3item_content)
         })
    }
/*END_POOL_FACTORY_CHANGE_PARAMS*/

    /* Getters */
    async getPoolFactoryData(provider: ContractProvider) {
        const { stack } = await provider.get("getPoolFactoryData", []);
        return {
            admin_address      : stack.readAddress(),
            router_address     : stack.readAddress(),
            privilege_address0 : stack.readAddress(),
            privilege_address1 : stack.readAddress(),

            pool_admin_address      : stack.readAddress(), 
            pool_controller_address : stack.readAddress(),

            ton_price         : stack.readBigNumber(),
            nftv3_content     : stack.readCell(), 
            nftv3item_content : stack.readCell(),    
        }
    }

    async getOrderAddress(provider: ContractProvider, jetton0WalletAddr: Address, jetton1WalletAddr : Address) {
        const { stack } = await provider.get("getOrderAddress", [
            { type: 'slice', cell: beginCell().storeAddress(jetton0WalletAddr).endCell() },
            { type: 'slice', cell: beginCell().storeAddress(jetton1WalletAddr).endCell() }
        ]);
        return {
            order_address     : stack.readAddress()
        }
    }


     /**
     * Visitor pattern for the operations
     **/

    static metaDescription : MetaMessage[] =     
    [
    {
        opcode : ContractOpcodes.POOL_FACTORY_CREATE_POOL,
        description : "Message that initiates pool creation",

        acceptor : (visitor: StructureVisitor) => {
            visitor.visitField({ name:`op`,               type:`Uint`,    size:32,  meta:"op",   comment: ""})    
            visitor.visitField({ name:`query_id`,         type:`Uint`,    size:64,  meta:""  ,   comment : "queryid as of the TON documentation"}) 

            visitor.visitField({ name:`jetton0Minter`,    type:`Address`, size:267, meta:"" ,    comment: "Minter address of the first jetton"})
            visitor.visitField({ name:`jetton1Minter`,    type:`Address`, size:267, meta:"" ,    comment: "Minter address of the second jetton"})
            
            visitor.visitField({ name:`initial_priceX96`, type:`Uint`,    size:160, meta:"PriceX96", comment: "Initial price for the pool"}) 
            visitor.visitField({ name:`settings` ,        type:`Uint`,    size:16,  meta:"", comment: "Value that describes pool configuration preset"}) 

            visitor.enterCell( { name: "wallet_cell",   type:`IfExists`, comment : "Cell With Wallets. Currently content is ignored"})
            visitor.visitField({ name:`jetton0Wallet`, type:`Address`, size:267, meta:"", comment: "Address of the jetton0 wallet of the Router"})
            visitor.visitField({ name:`jetton1Wallet`, type:`Address`, size:267, meta:"", comment: "Address of the jetton1 wallet of the Router"})
            visitor.leaveCell({})
        }
    },
    {
        opcode : ContractOpcodes.POOL_FACTORY_ORDER_INIT,
        description : "Message that initiates order for pool creation",

        acceptor : (visitor: StructureVisitor) => {
            visitor.visitField({ name:`op`,               type:`Uint`,    size:32,  meta:"op",   comment: ""})    
            visitor.visitField({ name:`query_id`,         type:`Uint`,    size:64,  meta:""  ,   comment : "queryid as of the TON documentation"}) 

            visitor.visitField({ name:`Router`,    type:`Address`, size:267, meta:"" ,    comment: "Router that would own the pool"})
            visitor.visitField({ name:`initial_priceX96`, type:`Uint`,    size:160, meta:"PriceX96", comment: "Initial price for the pool"}) 
            visitor.visitField({ name:`settings` ,        type:`Uint`,    size:16,  meta:"", comment: "Value that describes pool configuration preset"}) 

            visitor.enterCell( { name: "minter_cell",   type:``, comment : "Cell With Wallets. Currently content is ignored"})
            visitor.visitField({ name:`jetton0Minter`,    type:`Address`, size:267, meta:"" ,    comment: "Minter address of the first jetton"})
            visitor.visitField({ name:`jetton1Minter`,    type:`Address`, size:267, meta:"" ,    comment: "Minter address of the second jetton"})
            visitor.leaveCell({})
        }
    },
    {
        opcode : ContractOpcodes.POOL_FACTORY_CHANGE_ADMIN,
        name : "POOL_FACTORY_CHANGE_ADMIN",
        description : "Change params of the pool factory that affect the pool factory permissions",

        acceptor : (visitor: StructureVisitor) => {
            visitor.visitField({ name:`op`,               type:`Uint`,    size:32,  meta:"op",   comment: ""})    
            visitor.visitField({ name:`query_id`,         type:`Uint`,    size:64,  meta:""  ,   comment : "queryid as of the TON documentation"}) 

            visitor.visitField({ name:`admin`,              type:`Address`, size:267, meta:"Maybe" ,    comment: "Admin of the Pool Factory"})
            visitor.visitField({ name:`privilege_address0`, type:`Address`, size:267, meta:"Maybe" ,    comment: "Privilege address that may create pool in a locked state"})
            visitor.visitField({ name:`privilege_address1`, type:`Address`, size:267, meta:"Maybe" ,    comment: "Privilege address that may create pool in a locked state"})
        }
    },
    {
        opcode : ContractOpcodes.POOL_FACTORY_CHANGE_PARAMS,
        name : "POOL_FACTORY_CHANGE_PARAMS",
        description : "Change params of the pool factory that affect the pool creation",

        acceptor : (visitor: StructureVisitor) => {
            visitor.visitField({ name:`op`,               type:`Uint`,    size:32,  meta:"op",   comment: ""})    
            visitor.visitField({ name:`query_id`,         type:`Uint`,    size:64,  meta:""  ,   comment : "queryid as of the TON documentation"}) 

            visitor.visitField({ name:`router_address`,          type:`Address`, size:267, meta:"Maybe" ,    comment: "Admin of the Pool Factory"})
            visitor.visitField({ name:`pool_admin_address`,      type:`Address`, size:267, meta:"Maybe" ,    comment: "Privilege address that may create pool in a locked state"})
            visitor.visitField({ name:`pool_controller_address`, type:`Address`, size:267, meta:"Maybe" ,    comment: "Privilege address that may create pool in a locked state"})

            visitor.visitField({ name:`nftv3_content`,          type:`Cell`, size:0, meta:"" ,    comment: ""})
            visitor.visitField({ name:`nftv3item_content`,      type:`Cell`, size:0, meta:"" ,    comment: ""})

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
