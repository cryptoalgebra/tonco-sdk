import { Address, Cell, Contract, Sender} from "@ton/core"
import { packJettonOnchainMetadata, unpackJettonOnchainMetadata } from "./common/jettonContent"
import { JettonMinter, JettonMinterConfig } from "./common/JettonMinter"
import { compile } from "@ton/blueprint";
import { BLACK_HOLE_ADDRESS } from "./tonUtils"
import { JettonWallet } from "./common/JettonWallet"
import { SandboxContract } from "@ton/sandbox"
import { PTonWalletV2 } from "./common/PTonWalletV2"

/*
   Due to several workflows that use this file the design is quite fragile and depends on the state of the object
   If you use it do deploy the jetton

            const jettonAPI = await JettonAPI.createToDeploy({admin : deployWallet.address, metadata: jettonContentsToPack[i] })
            const deployResult = await jettonAPI.deployMinter((x : Contract) => blockchain.openContract(x), deploySender, gas)

   If you use it to work with deployed jetton
*/
export class JettonAPI {
   
    public isTonProxy : boolean
    
    public minterAddress : Address

    public minterCodeCell: Cell | null = null
    public walletCodeCell: Cell | null = null


    public admin : Address | null = null
    public metadata : {[key: string] : string} = {}
    public minter : Contract | null = null
    public minterOpened : SandboxContract<JettonMinter> | null = null


    /* Opener */
    public providerFunction : any


    private static defaultMinterCode : Cell
    private static defaultWalletCode : Cell

    static async getDefaultMinterCode()
    {
        if (this.defaultMinterCode === undefined) {
            this.defaultMinterCode = await compile("JettonMinter")
        }
        return this.defaultMinterCode
    }

    static async getDefaultWalletCode()
    {
        if (this.defaultWalletCode === undefined) {
            this.defaultWalletCode = await compile("JettonWallet")
        }
        return this.defaultWalletCode
    }


    /* Constructs the JettonAPI from Minter address */
    constructor(address : Address = BLACK_HOLE_ADDRESS, isTonProxy : boolean = false) {
        this.isTonProxy = isTonProxy
        this.minterAddress = address
    }

    static fromMinter(address : Address = BLACK_HOLE_ADDRESS, pTonMinter? : Address ) {
        return new JettonAPI(address, address.toString() == pTonMinter?.toString())        
    }
    

    static async createToDeploy(
        jetton : {
            minterCodeCell?: Cell,
            walletCodeCell?: Cell,
            admin : Address,
            metadata : { [s: string]: string }
        }
    ) : Promise<JettonAPI>
    {
        let result = new JettonAPI()
        result.minterCodeCell = jetton.minterCodeCell ?? await JettonAPI.getDefaultMinterCode();
        result.walletCodeCell = jetton.walletCodeCell ?? await JettonAPI.getDefaultWalletCode();
        result.admin    = jetton.admin           
        result.metadata = jetton.metadata; 

        if (result.admin === null) {
            throw Error("Please provide admin before deploy")
        }


        const jettonContentPacked: Cell = packJettonOnchainMetadata(result.metadata)
        const jettonMinterConfig: JettonMinterConfig = { 
            admin: result.admin, 
            content: jettonContentPacked, 
            wallet_code: result.walletCodeCell 
        }
        result.minter = JettonMinter.createFromConfig(jettonMinterConfig, result.minterCodeCell)
        result.minterAddress = result.minter.address

        return result;
    }

    async deployMinter (
        providerFunction : any,
        sender: Sender,
        gasValue : bigint,
    ) 
    {    
        /* I have some questions about this design */
        this.providerFunction = providerFunction
        
        if (this.admin === null) {
            throw Error("Please provide admin before deploy")
        }
        this.minterOpened = this.providerFunction(this.minter)      
        return this.minterOpened!.sendDeploy(sender, gasValue)

    }


    async open (providerFunction : any) {
        this.providerFunction = providerFunction
        this.minter = JettonMinter.createFromAddress(this.minterAddress)
        this.minterOpened = providerFunction(this.minter)
    }


    async mint(via: Sender, to: Address, jetton_amount: bigint, forward_ton_amount: bigint, total_ton_amount: bigint) {
        if (this.minterOpened === null) {
            throw Error("Function called on an unopened contract")
        }
        console.log(`Mint Coins ${jetton_amount} for jetton to wallet: ${to}`)
        return this.minterOpened.sendMint(via, to, jetton_amount, forward_ton_amount, total_ton_amount ) 
    }

    async getWalletAddress(ownerAddress  : Address) {
        if (this.minterOpened === null) {
            throw Error("Function called on an unopened contract")
        }
        return await this.minterOpened.getWalletAddress(ownerAddress)
    }

    async getWallet(ownerAddress : Address) 
    {
        const walletAddress = await this.getWalletAddress(ownerAddress)
        let jettonWallet

        if (this.isTonProxy) {
            jettonWallet  = PTonWalletV2.createFromAddress(walletAddress)
        } else {
            jettonWallet  = JettonWallet.createFromAddress(walletAddress)
        }

        const jettonWalletOpened =  this.providerFunction(jettonWallet)
        return jettonWalletOpened
    }
    

    async getJettonBalance(ownerAddress : Address) {
        const jettonWalletOpened = await this.getWallet(ownerAddress)
        if(!this.isTonProxy)
            return jettonWalletOpened.getJettonBalance()    
        else 
            return 0n // We need to ask real value
    }

    
    async loadData() {
        const data = await this.minterOpened!.getJettonData()
        this.admin = data.adminAddress
        //this.totalSupply = data.totalSupply
        this.metadata = unpackJettonOnchainMetadata(data.content)
        if (this.metadata.uri) {
            //console.log(`We have offchain metadata at ${this.metadata.uri}`)

            try {
                const response = await fetch(this.metadata.uri);
                
                if (!response.ok) {
                  throw new Error(`Error fetching data: ${response.statusText}`);
                }
            
                const data = await response.json();  // Parse the JSON
                this.metadata = {...this.metadata, ...data } 
              } catch (error) {
                console.error("Failed to download and parse JSON", error);
                throw error;  // Rethrow the error for further handling
              }
        }

        this.walletCodeCell = data.walletCode
    }

/*
    getMetadata

    printBalance

    transfer
    */

}
